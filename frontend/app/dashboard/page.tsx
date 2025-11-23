"use client";
import { useEffect, useState } from "react";
import { useSuiClient, useSignAndExecuteTransaction, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";
import { PACKAGE_ID, MODULES } from "@/lib/config";
import { useIsZkLogin, zkLoginGuardMessage } from "@/lib/zk";
import { useZkSession } from "@/lib/zkSession";
import ZkLoginBanner from "@/components/ZkLoginBanner";

export default function DashboardPage() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const isZk = useIsZkLogin();
  const { isSignedIn: hasZkSession } = useZkSession();
  const [reputation, setReputation] = useState(0);
  const [tasks, setTasks] = useState(0);
  const [rewards, setRewards] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [recentVotes, setRecentVotes] = useState<any[]>([]);
  const [contentTitles, setContentTitles] = useState<Record<string, string>>({});
  const [unclaimedCount, setUnclaimedCount] = useState(0);
  const [reputationId, setReputationId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");

  useEffect(() => {
    async function fetchDashboardData() {
      if (!account?.address || !PACKAGE_ID) {
        setLoading(false);
        return;
      }

      try {
        // Fetch user's objects to find Reputation NFT
        console.log(`Querying for Reputation NFT: owner=${account.address}, type=${PACKAGE_ID}::${MODULES.reputation}::Reputation`);

        const objects = await client.getOwnedObjects({
          owner: account.address,
          filter: {
            StructType: `${PACKAGE_ID}::${MODULES.reputation}::Reputation`
          },
          options: {
            showContent: true,
            showType: true,
          }
        });

        console.log(`Found ${objects.data.length} Reputation NFT(s)`);
        let repIdLocal: string | null = null;
        if (objects.data.length > 0) {
          const repObject = objects.data[0];
          console.log('Reputation NFT object:', repObject);
          const content = (repObject.data as any)?.content;
          if (content?.fields) {
            setReputation(parseInt(content.fields.score || "0"));
            setTasks(parseInt(content.fields.task_count || "0"));
          }
          repIdLocal = repObject.data?.objectId || null;
          console.log(`Setting reputationId state: ${repIdLocal}`);
          setReputationId(repIdLocal);
        } else {
          console.log('No Reputation NFT found for this address');
        }

        // Fetch vote events from this user
        const voteEvents = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::${MODULES.vote}::VoteSubmitted`
          },
          limit: 100,
          order: 'descending',
        });

        const userVotes = voteEvents.data.filter((ev: any) => {
          const voter = ev.parsedJson?.voter || ev.parsedJson?.voter_address;
          return voter?.toLowerCase() === account.address.toLowerCase();
        });

        setRecentVotes(userVotes.slice(0, 5));

        // Fetch content titles for recent votes
        const contentEvents = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::${MODULES.content}::ContentRegisteredV2`
          },
          limit: 100,
          order: 'descending',
        });

        const titleMap: Record<string, string> = {};
        contentEvents.data.forEach((ev: any) => {
          const contentId = ev.parsedJson?.content_id;
          const titleData = ev.parsedJson?.title;
          let title = "Untitled";

          // Decode title if it's a byte array
          if (Array.isArray(titleData)) {
            try {
              title = String.fromCharCode(...titleData);
            } catch (e) {
              console.error("Error decoding title:", e);
            }
          } else if (typeof titleData === 'string') {
            title = titleData;
          }

          if (contentId) {
            titleMap[contentId] = title;
          }
        });
        setContentTitles(titleMap);

        // Calculate potential rewards from RewardDistributed events
        const rewardEvents = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::${MODULES.reward}::RewardDistributed`
          },
          limit: 50,
          order: 'descending',
        });

        console.log(`Found ${rewardEvents.data.length} total RewardDistributed events`);

        let totalRewards = 0;
        const rewardedContentIds = new Set<string>();
        rewardEvents.data.forEach((ev: any) => {
          const winners = ev.parsedJson?.winners || [];
          if (winners.some((w: string) => w.toLowerCase() === account.address.toLowerCase())) {
            const total = parseInt(ev.parsedJson?.total || "0");
            totalRewards += total / winners.length;
            const contentId = ev.parsedJson?.content_id;
            if (contentId) {
              rewardedContentIds.add(contentId);
              console.log(`User is winner for content ${contentId}, reward: ${(total / winners.length / 1_000_000_000).toFixed(2)} SUI`);
            }
          }
        });

        console.log(`User has won rewards for ${rewardedContentIds.size} content items`);
        setRewards((totalRewards / 1_000_000_000).toFixed(2)); // Convert MIST to SUI

        // Check on-chain which tasks are already claimed using is_claimed function
        let unclaimedTasksCount = 0;
        console.log(`Checking claim status with local repId=${repIdLocal}, rewardedContentIds.size=${rewardedContentIds.size}`);

        if (repIdLocal && rewardedContentIds.size > 0) {
          for (const contentId of Array.from(rewardedContentIds)) {
            try {
              const tx = new Transaction();
              tx.moveCall({
                target: `${PACKAGE_ID}::${MODULES.reputation}::is_claimed`,
                arguments: [
                  tx.object(repIdLocal),
                  tx.pure.id(contentId),
                ]
              });

              const result = await client.devInspectTransactionBlock({
                sender: account.address,
                transactionBlock: tx,
              });

              const returnValue = result.results?.[0]?.returnValues?.[0] as number[] | undefined;
              const isClaimed = returnValue && returnValue.length > 0 && returnValue[0] === 1;
              console.log(`Content ${contentId}: isClaimed=${isClaimed}, rawReturn=${JSON.stringify(returnValue)}`);
              if (!isClaimed) {
                unclaimedTasksCount++;
                console.log(`Unclaimed reputation for content ${contentId}`);
              }
            } catch (e) {
              console.error(`Error checking claim status for ${contentId}:`, e);
            }
          }
        } else {
          if (!repIdLocal) console.log('No reputation NFT (local) found - mint required.');
          if (rewardedContentIds.size === 0) console.log('No rewarded content IDs found.');
        }

        console.log(`Final unclaimedTasksCount=${unclaimedTasksCount}`);
        setUnclaimedCount(unclaimedTasksCount);
      } catch (e) {
        console.error("Error fetching dashboard data:", e);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [account?.address, client]);

  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const handleClaimReputation = async () => {
    if (!account?.address || !reputationId) {
      setClaimMessage("Error: Reputation NFT not found");
      return;
    }

    if (unclaimedCount === 0) {
      setClaimMessage("Error: No unclaimed tasks");
      return;
    }

    setClaiming(true);
    setClaimMessage("");

    try {
      if (!PACKAGE_ID) throw new Error('NEXT_PUBLIC_PACKAGE_ID not set');

      // Get all rewarded content IDs to claim
      const rewardEvents = await client.queryEvents({
        query: {
          MoveEventType: `${PACKAGE_ID}::${MODULES.reward}::RewardDistributed`
        },
        limit: 100,
        order: 'descending',
      });

      const rewardedContentIds: string[] = [];
      rewardEvents.data.forEach((ev: any) => {
        const winners = ev.parsedJson?.winners || [];
        if (winners.some((w: string) => w.toLowerCase() === account.address.toLowerCase())) {
          const contentId = ev.parsedJson?.content_id;
          if (contentId) {
            rewardedContentIds.push(contentId);
          }
        }
      });

      // Check which ones are not claimed yet using is_claimed
      const unclaimedContentIds: string[] = [];
      for (const contentId of rewardedContentIds) {
        try {
          const checkTx = new Transaction();
          checkTx.moveCall({
            target: `${PACKAGE_ID}::${MODULES.reputation}::is_claimed`,
            arguments: [
              checkTx.object(reputationId),
              checkTx.pure.id(contentId),
            ]
          });

          const result = await client.devInspectTransactionBlock({
            sender: account.address,
            transactionBlock: checkTx,
          });
          
          // returnValues[0] is a Uint8Array where first byte is the boolean (1=true, 0=false)
          const returnValue = result.results?.[0]?.returnValues?.[0] as number[] | undefined;
          const isClaimed = returnValue && returnValue.length > 0 && returnValue[0] === 1;
          if (!isClaimed) {
            unclaimedContentIds.push(contentId);
          }
        } catch (e) {
          console.error(`Error checking claim status for ${contentId}:`, e);
        }
      }

      if (unclaimedContentIds.length === 0) {
        setClaimMessage("Success: All tasks already claimed!");
        setClaiming(false);
        return;
      }

      const tx = new Transaction();

      for (const contentId of unclaimedContentIds) {
        tx.moveCall({
          target: `${PACKAGE_ID}::${MODULES.reputation}::claim_reward_reputation`,
          arguments: [
            tx.object(reputationId),
            tx.pure.id(contentId),
          ]
        });
      }

      const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
      setClaimMessage(`Success: +${10 * unclaimedCount} reputation points claimed!`);

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e: any) {
      console.error("Claim error:", e);
      setClaimMessage(`Error: ${e?.message || String(e)}`);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <main className="min-h-screen p-8 relative overflow-hidden bg-gradient-to-br from-gray-50 via-purple-50 to-blue-50">
      {/* Ambient Glows */}
      <div className="absolute top-20 right-1/3 w-96 h-96 bg-pink-400 rounded-full opacity-10 blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 left-1/3 w-96 h-96 bg-blue-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-400 rounded-full opacity-5 blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="max-w-6xl mx-auto relative z-10 space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-block">
            <h1 className="text-display-sm gradient-text mb-2">Your Dashboard</h1>
            <div className="h-1 w-32 mx-auto bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 rounded-full"></div>
          </div>

        </div>

        {/* {(!isZk && !hasZkSession) && (
          <div className="glass-panel border-2 border-red-300">
            <p className="text-sm text-red-700 font-medium text-center">{zkLoginGuardMessage()}</p>
          </div>
        )} */}
        {/* <ZkLoginBanner /> */}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Reputation Card */}
          <div className="neuro-card text-center space-y-4 group hover:scale-105 transition-all duration-300 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 to-purple-400/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative z-10">
              <div className="w-20 h-20 mx-auto rounded-[24px] bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center glow-blue shadow-xl group-hover:shadow-2xl transition-shadow">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Reputation Score</p>
                <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 leading-tight">
                  {loading ? (
                    <span className="inline-block w-16 h-12 bg-gray-200 rounded animate-pulse"></span>
                  ) : (
                    reputation
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-2">+10 per validated task</p>
              </div>

              {!loading && unclaimedCount > 0 && reputationId && !claimMessage.startsWith('Success') && (
                <div className="mt-4 space-y-2">
                  <button
                    onClick={handleClaimReputation}
                    disabled={claiming}
                    className="neuro-btn-primary w-full text-sm py-2 flex items-center justify-center gap-2"
                  >
                    {claiming ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Claiming...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Claim {unclaimedCount} Task{unclaimedCount > 1 ? 's' : ''} (+{10 * unclaimedCount} pts)
                      </>
                    )}
                  </button>
                </div>
              )}

              {claimMessage && (
                <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${claimMessage.startsWith('Success')
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                  }`}>
                  {claimMessage}
                </div>
              )}
            </div>
          </div>

          {/* Tasks Card */}
          <div className="neuro-card text-center space-y-4 group hover:scale-105 transition-all duration-300 cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 to-pink-400/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative z-10">
              <div className="w-20 h-20 mx-auto rounded-[24px] bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center glow-purple shadow-xl group-hover:shadow-2xl transition-shadow">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Validated Tasks</p>
                <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 leading-tight">
                  {loading ? (
                    <span className="inline-block w-16 h-12 bg-gray-200 rounded animate-pulse"></span>
                  ) : (
                    tasks
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-2">Tasks completed successfully</p>
              </div>
            </div>
          </div>

          {/* Rewards Card */}
          <div className="neuro-card text-center space-y-4 group hover:scale-105 transition-all duration-300 cursor-pointer relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-400/5 to-blue-400/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative z-10">
              <div className="w-20 h-20 mx-auto rounded-[24px] bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center glow-pink shadow-xl group-hover:shadow-2xl transition-shadow">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Earned Rewards</p>
                <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-blue-600 leading-tight">
                  {loading ? (
                    <span className="inline-block w-24 h-12 bg-gray-200 rounded animate-pulse"></span>
                  ) : (
                    <>
                      {rewards}{' '}
                      <span className="text-2xl align-middle">SUI</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-2">Total earnings from validation</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-800">Recent Votes</h2>
            </div>
            {recentVotes.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-gradient-to-r from-purple-100 to-blue-100 text-purple-700 text-sm font-medium">
                {recentVotes.length} vote{recentVotes.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="neuro-card">
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
              </div>
            ) : recentVotes.length > 0 ? (
              <div className="space-y-3">
                {recentVotes.map((vote, i) => {
                  const contentId = vote.parsedJson?.content_id || "Unknown";
                  const variantIndex = vote.parsedJson?.variant_index || 0;
                  const timestamp = new Date(parseInt(vote.timestampMs || "0")).toLocaleString();
                  const contentTitle = contentTitles[contentId] || "Loading...";

                  return (
                    <div key={i} className="glass-panel flex justify-between items-center group hover:shadow-lg transition-all duration-300">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <span className="text-xl font-bold text-white">V {parseInt(variantIndex) + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-gray-800 mb-2 group-hover:text-purple-600 transition-colors">
                            {contentTitle}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                            <span className="font-mono">{contentId.slice(0, 8)}...{contentId.slice(-6)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="whitespace-nowrap">{timestamp}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-gray-700 mb-2">No votes yet</p>
                <p className="text-sm text-gray-500 mb-6">Start validating content to build your reputation!</p>
                <a href="/vote" className="inline-block neuro-btn-primary px-6 py-2">
                  Go to Vote Page
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Reputation Management */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800">Reputation NFT</h2>
          <ReputationManager />
        </section>
      </div>
    </main>
  );
}

function ReputationManager() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const isZk = useIsZkLogin();
  const { isSignedIn: hasZkSession } = useZkSession();
  const [minting, setMinting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [hasReputation, setHasReputation] = useState(false);
  const [reputationId, setReputationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [rewardedTasks, setRewardedTasks] = useState<Set<string>>(new Set());
  const [claimedTasks, setClaimedTasks] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function checkReputation() {
      if (!account?.address || !PACKAGE_ID) return;

      try {
        const objects = await client.getOwnedObjects({
          owner: account.address,
          filter: {
            StructType: `${PACKAGE_ID}::${MODULES.reputation}::Reputation`
          },
          options: {
            showContent: true,
          }
        });

        if (objects.data.length > 0) {
          setHasReputation(true);
          setReputationId(objects.data[0].data?.objectId || null);

          // Get current task count to track what's been claimed
          const content = (objects.data[0].data as any)?.content;
          if (content?.fields) {
            const currentTaskCount = parseInt(content.fields.task_count || "0");
            setClaimedTasks(new Set(Array.from({ length: currentTaskCount }, (_, i) => `claimed_${i}`)));
          }
        }

        // Find tasks where user received rewards
        const rewardEvents = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::${MODULES.reward}::RewardDistributed`
          },
          limit: 100,
          order: 'descending',
        });

        const rewardedContentIds = new Set<string>();
        rewardEvents.data.forEach((ev: any) => {
          const winners = ev.parsedJson?.winners || [];
          if (winners.some((w: string) => w.toLowerCase() === account.address.toLowerCase())) {
            const contentId = ev.parsedJson?.content_id;
            if (contentId) {
              rewardedContentIds.add(contentId);
            }
          }
        });

        setRewardedTasks(rewardedContentIds);
      } catch (e) {
        console.error("Error checking reputation:", e);
      }
    }

    checkReputation();
  }, [account?.address, client]);

  const mintReputation = async () => {
    // if (!isZk && !hasZkSession) {
    //   setMessage(zkLoginGuardMessage());
    //   return;
    // }
    if (!account?.address) {
      setMessage("Error: Please connect your wallet");
      return;
    }

    setMinting(true);
    setMessage("");

    try {
      if (!PACKAGE_ID) throw new Error('NEXT_PUBLIC_PACKAGE_ID not set');

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULES.reputation}::mint`,
        arguments: [
          tx.pure.address(account.address)
        ]
      });

      const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
      setMessage(`Success: Reputation NFT minted! Digest: ${(res as any)?.digest?.slice(0, 12)}...`);

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e: any) {
      console.error("Mint error:", e);
      setMessage(`Error: ${e?.message || String(e)}`);
    } finally {
      setMinting(false);
    }
  };

  const claimReputation = async () => {
    // if (!isZk && !hasZkSession) {
    //   setMessage(zkLoginGuardMessage());
    //   return;
    // }
    if (!account?.address || !reputationId) {
      setMessage("Error: Reputation NFT not found");
      return;
    }

    // Get list of unclaimed content IDs
    const unclaimedContentIds = Array.from(rewardedTasks).filter(contentId => {
      // This is a simplified check - in production you'd verify on-chain
      return !claimedTasks.has(contentId);
    });

    if (unclaimedContentIds.length === 0) {
      setMessage("Error: No unclaimed validation tasks. Complete more tasks to earn reputation!");
      return;
    }

    setUpdating(true);
    setMessage("");

    try {
      if (!PACKAGE_ID) throw new Error('NEXT_PUBLIC_PACKAGE_ID not set');

      // Claim reputation for each unclaimed content_id
      const tx = new Transaction();

      for (const contentId of unclaimedContentIds) {
        tx.moveCall({
          target: `${PACKAGE_ID}::${MODULES.reputation}::claim_reward_reputation`,
          arguments: [
            tx.object(reputationId),
            tx.pure.id(contentId),
          ]
        });
      }

      const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
      setMessage(`Success: Reputation updated! +${10 * unclaimedContentIds.length} points for ${unclaimedContentIds.length} task(s). Digest: ${(res as any)?.digest?.slice(0, 12)}...`);

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e: any) {
      console.error("Update error:", e);
      setMessage(`Error: ${e?.message || String(e)}`);
    } finally {
      setUpdating(false);
    }
  };

  const unclaimedCount = rewardedTasks.size - claimedTasks.size;

  return (
    <div className="neuro-card space-y-4">
      {hasReputation ? (
        <div className="space-y-4">
          <div className="glass-panel text-center py-8">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center glow-blue">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-800">You own a Reputation NFT!</p>
            <p className="text-sm text-gray-600 mt-2">This soulbound token tracks your validation history on-chain.</p>
          </div>
        </div>
      ) : (
        <>
          <div>
            <h3 className="font-semibold text-gray-800 mb-1">Mint Reputation NFT</h3>
            <p className="text-sm text-gray-600 font-light">
              Get your soulbound reputation token to start earning rewards
            </p>
          </div>
          <button
            className="neuro-btn-primary w-full flex items-center justify-center gap-2"
            onClick={mintReputation}
            disabled={minting || !account}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            {minting ? 'Minting...' : 'Mint Reputation NFT'}
          </button>
        </>
      )}
      {message && (
        <div className={`glass-panel ${message.startsWith('Success') ? 'border-2 border-green-300' : 'border-2 border-red-300'}`}>
          <p className="text-sm text-center">{message}</p>
        </div>
      )}
    </div>
  );
}
