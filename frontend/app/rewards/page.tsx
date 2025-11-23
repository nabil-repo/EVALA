"use client";

import { useState, useEffect } from "react";
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransaction, ConnectButton } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { PACKAGE_ID, MODULES, VOTEBOOK_ID } from "@/lib/config";
import { useIsZkLogin, zkLoginGuardMessage } from "@/lib/zk";
import { useZkSession } from "@/lib/zkSession";
import ZkLoginBanner from "@/components/ZkLoginBanner";

interface ContentItem {
  id: string;
  title: string;
  timestamp: string;
  voteCount: number;
  winningVariant: number | null;
}

interface PoolStatus {
  funded: boolean;
  distributed: boolean;
  amount: string;
  potBalance: string;
}

interface Analytics {
  totalFunded: number;
  totalDistributed: number;
  activeContent: number;
  completedContent: number;
  totalValidators: number;
  avgRewardPerContent: number;
}

export default function RewardsPage() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const isZk = useIsZkLogin();
  const { isSignedIn: hasZkSession } = useZkSession();

  const [myContent, setMyContent] = useState<ContentItem[]>([]);
  const [poolStatus, setPoolStatus] = useState<Record<string, PoolStatus>>({});
  const [closedStatus, setClosedStatus] = useState<Record<string, boolean>>({});
  const [analytics, setAnalytics] = useState<Analytics>({
    totalFunded: 0,
    totalDistributed: 0,
    activeContent: 0,
    completedContent: 0,
    totalValidators: 0,
    avgRewardPerContent: 0,
  });
  const [loading, setLoading] = useState(true);
  const [fundingAmount, setFundingAmount] = useState<Record<string, string>>({});
  const [distributingContent, setDistributingContent] = useState<string | null>(null);
  const [closingContent, setClosingContent] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selectedTab, setSelectedTab] = useState<"all" | "active" | "completed">("all");

  useEffect(() => {
    async function fetchMyContent() {
      if (!account?.address || !PACKAGE_ID) {
        setLoading(false);
        return;
      }

      try {
        // Fetch content created by this user
        const events = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::${MODULES.content}::ContentRegisteredV2`
          },
          limit: 100,
          order: 'descending',
        });

        const myContentItems: ContentItem[] = events.data.filter((ev: any) => {
          const creator = ev.parsedJson?.creator;
          return creator?.toLowerCase() === account.address.toLowerCase();
        }).map((ev: any) => {
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

          return {
            id: ev.parsedJson?.content_id,
            title,
            timestamp: new Date(parseInt(ev.timestampMs || "0")).toLocaleString(),
            voteCount: 0,
            winningVariant: null,
          };
        });
        console.log("My content items:", myContentItems);

        // Fetch vote counts for each content
        for (const item of myContentItems) {
          try {
            const voteEvents = await client.queryEvents({
              query: {
                MoveEventType: `${PACKAGE_ID}::${MODULES.vote}::VoteSubmitted`
              },
              limit: 100,
              order: 'descending',
            });

            const votesForContent = voteEvents.data.filter((ev: any) =>
              ev.parsedJson?.content_id === item.id
            );

            item.voteCount = votesForContent.length;

            // Calculate winning variant
            if (votesForContent.length > 0) {
              const variantCounts: Record<number, number> = {};
              votesForContent.forEach((ev: any) => {
                const variant = ev.parsedJson?.variant_index;
                variantCounts[variant] = (variantCounts[variant] || 0) + 1;
              });

              let maxVotes = 0;
              let winner: number | null = null;
              for (const [variant, count] of Object.entries(variantCounts)) {
                if (count > maxVotes) {
                  maxVotes = count;
                  winner = parseInt(variant);
                }
              }
              item.winningVariant = winner;
            }
          } catch (e) {
            console.error(`Error fetching votes for ${item.id}:`, e);
          }
        }

        setMyContent(myContentItems);

        // Fetch reward pool status for each content
        const pools = await client.getOwnedObjects({
          owner: account.address,
          filter: {
            StructType: `${PACKAGE_ID}::${MODULES.reward}::RewardPool`
          },
          options: {
            showContent: true,
          }
        });

        const statusMap: Record<string, { funded: boolean; distributed: boolean; amount: string; potBalance: string }> = {};

        pools.data.forEach((pool: any) => {
          const fields = pool.data?.content?.fields;
          if (fields) {
            const contentId = fields.content_id;
            const distributed = fields.distributed || false;
            const potBalance = fields.pot || "0";
            const potBalanceFormatted = (parseInt(potBalance) / 1_000_000_000).toFixed(2);
            const amount = potBalanceFormatted;

            statusMap[contentId] = {
              funded: true,
              distributed,
              amount,
              potBalance: potBalanceFormatted
            };
          }
        });

        // Get distributed amounts from RewardDistributed events
        try {
          const rewardEvents = await client.queryEvents({
            query: {
              MoveEventType: `${PACKAGE_ID}::${MODULES.reward}::RewardDistributed`
            },
            limit: 100,
            order: 'descending',
          });

          rewardEvents.data.forEach((ev: any) => {
            const contentId = ev.parsedJson?.content_id;
            const total = ev.parsedJson?.total;

            if (contentId && total && statusMap[contentId]) {
              // If already distributed, show the total that was distributed
              if (statusMap[contentId].distributed) {
                statusMap[contentId].amount = (parseInt(total) / 1_000_000_000).toFixed(2);
              }
            }
          });
        } catch (e) {
          console.error("Error fetching reward events:", e);
        }

        setPoolStatus(statusMap);

        // Check closed status from VoteBook for each content
        if (VOTEBOOK_ID) {
          const closedMap: Record<string, boolean> = {};

          for (const item of myContentItems) {
            try {
              const tx = new Transaction();
              tx.moveCall({
                target: `${PACKAGE_ID}::${MODULES.vote}::is_closed`,
                arguments: [
                  tx.object(VOTEBOOK_ID),
                  tx.pure.id(item.id),
                ],
              });

              const result = await client.devInspectTransactionBlock({
                transactionBlock: tx,
                sender: account.address,
              });

              if (result.results?.[0]?.returnValues?.[0]) {
                const [bytes] = result.results[0].returnValues[0];
                closedMap[item.id] = bytes[0] === 1; // bool is 1 byte
              }
            } catch (e) {
              console.error(`Error checking closed status for ${item.id}:`, e);
            }
          }

          setClosedStatus(closedMap);
        }

        // Calculate analytics
        let totalFunded = 0;
        let totalDistributed = 0;
        let activeContent = 0;
        let completedContent = 0;
        const validatorsSet = new Set<string>();

        Object.values(statusMap).forEach(status => {
          const amount = parseFloat(status.amount);
          if (status.funded) {
            totalFunded += amount;
            if (status.distributed) {
              totalDistributed += amount;
              completedContent++;
            } else {
              activeContent++;
            }
          }
        });

        // Get all validators who voted
        try {
          const allVoteEvents = await client.queryEvents({
            query: {
              MoveEventType: `${PACKAGE_ID}::${MODULES.vote}::VoteSubmitted`
            },
            limit: 500,
            order: 'descending',
          });

          allVoteEvents.data.forEach((ev: any) => {
            const voter = ev.parsedJson?.voter;
            if (voter) validatorsSet.add(voter);
          });
        } catch (e) {
          console.error("Error fetching validator count:", e);
        }

        setAnalytics({
          totalFunded,
          totalDistributed,
          activeContent,
          completedContent,
          totalValidators: validatorsSet.size,
          avgRewardPerContent: completedContent > 0 ? totalDistributed / completedContent : 0,
        });

      } catch (e) {
        console.error("Error fetching content:", e);
      } finally {
        setLoading(false);
      }
    }

    fetchMyContent();
  }, [account?.address, client]);

  const fundRewardPool = async (contentId: string) => {
    // if (!isZk && !hasZkSession) {
    //   setMessage(zkLoginGuardMessage());
    //   return;
    // }
    const amount = fundingAmount[contentId];
    if (!amount || parseFloat(amount) <= 0) {
      setMessage("Error: Please enter a valid amount");
      return;
    }

    try {
      if (!PACKAGE_ID) throw new Error('NEXT_PUBLIC_PACKAGE_ID not set');

      const amountInMist = Math.floor(parseFloat(amount) * 1_000_000_000);

      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [amountInMist]);

      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULES.reward}::fund`,
        arguments: [
          tx.pure.id(contentId),
          coin,
        ],
      });

      const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
      setMessage(`Success: Reward pool funded with ${amount} SUI! Digest: ${(res as any)?.digest?.slice(0, 12)}...`);

      setTimeout(() => {
        setMessage("");
        window.location.reload();
      }, 2000);
    } catch (e: any) {
      console.error("Fund error:", e);
      setMessage(`Error: ${e?.message || String(e)}`);
    }
  };

  const distributeRewards = async (contentId: string) => {

    setDistributingContent(contentId);
    setMessage("");

    try {
      if (!PACKAGE_ID) throw new Error('NEXT_PUBLIC_PACKAGE_ID not set');

      // Check if already distributed
      const status = poolStatus[contentId];
      if (!status?.funded) {
        setMessage("Error: No reward pool found. Please fund the pool first!");
        setDistributingContent(null);
        return;
      }

      if (status.distributed) {
        setMessage("Error: Rewards already distributed for this content!");
        setDistributingContent(null);
        return;
      }

      // First, find the RewardPool object for this content
      const objects = await client.getOwnedObjects({
        owner: account!.address,
        filter: {
          StructType: `${PACKAGE_ID}::${MODULES.reward}::RewardPool`
        },
        options: {
          showContent: true,
        }
      });

      const rewardPool = objects.data.find((obj: any) => {
        const fields = obj.data?.content?.fields;
        return fields?.content_id === contentId && !fields?.distributed;
      });

      if (!rewardPool) {
        setMessage("Error: No active reward pool found for this content!");
        setDistributingContent(null);
        return;
      }

      const poolId = rewardPool.data?.objectId;

      if (!VOTEBOOK_ID) throw new Error('VOTEBOOK_ID not configured');

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULES.reward}::distribute_rewards`,
        arguments: [
          tx.object(poolId!),
          tx.object(VOTEBOOK_ID),
        ],
      });

      const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
      setMessage(`Success: Rewards distributed! Digest: ${(res as any)?.digest?.slice(0, 12)}...`);

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e: any) {
      console.error("Distribute error:", e);
      setMessage(`Error: ${e?.message || String(e)}`);
    } finally {
      setDistributingContent(null);
    }
  };

  const closeVoting = async (contentId: string) => {
   
    setClosingContent(contentId);
    setMessage("");

    try {
      if (!PACKAGE_ID || !VOTEBOOK_ID) throw new Error('Missing configuration');

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULES.vote}::close_voting`,
        arguments: [
          tx.object(VOTEBOOK_ID),
          tx.pure.id(contentId),
        ],
      });

      const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
      setMessage(`Success: Voting closed! Digest: ${(res as any)?.digest?.slice(0, 12)}...`);

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e: any) {
      console.error("Close voting error:", e);
      setMessage(`Error: ${e?.message || String(e)}`);
    } finally {
      setClosingContent(null);
    }
  };

  const filteredContent = myContent.filter(content => {
    const status = poolStatus[content.id];
    if (selectedTab === "active") {
      return status?.funded && !status?.distributed;
    } else if (selectedTab === "completed") {
      return status?.distributed;
    }
    return true;
  });

  return (
    <main className="min-h-screen p-8 relative overflow-hidden">
      {/* Animated Ambient Glows */}
      <div className="absolute top-20 right-1/4 w-96 h-96 bg-green-400 rounded-full opacity-10 blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-purple-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-blue-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-display-sm gradient-text">Reward Analytics & Management</h1>
          <p className="text-gray-600 font-light">
            Track performance, fund pools, and distribute rewards
          </p>
        </div>

        {/* {(!isZk && !hasZkSession) && (
          <div className="glass-panel border-2 border-red-300">
            <p className="text-sm text-red-700 font-medium text-center">{zkLoginGuardMessage()}</p>
          </div>
        )} */}
        {/* <ZkLoginBanner /> */}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600">Loading analytics...</p>
          </div>
        ) : !account?.address ? (
          <div className="neuro-card text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-yellow-200 to-yellow-300 flex items-center justify-center">
              <svg className="w-10 h-10 text-yellow-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-xl font-medium text-gray-700">Connect Your Wallet</p>
            <p className="text-sm text-gray-500 mt-2">
              Connect your Sui wallet to view reward analytics
            </p>
            <div className="mt-4 flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : myContent.length === 0 ? (
          <div className="neuro-card text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xl font-medium text-gray-700">No content found</p>
            <p className="text-sm text-gray-500 mt-2">
              Upload content first on the <a href="/upload" className="text-purple-600 underline">Upload page</a>
            </p>
          </div>
        ) : (
          <>
            {/* Analytics Dashboard - will be added here */}

            {/* Content List */}
            <div className="space-y-6">
              {myContent.map((content) => {
                const status = poolStatus[content.id];
                const isFunded = status?.funded || false;
                const isDistributed = status?.distributed || false;
                const isClosed = closedStatus[content.id] || false;
                const poolAmount = status?.amount || "0.00";
                const potValue = status?.potBalance || "0.00"; return (
                  <div key={content.id} className="neuro-card space-y-4 hover:shadow-2xl transition-shadow duration-300">{/* Header Section */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-800 mb-2">{content.title}</h3>
                        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {content.timestamp}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            {content.id?.slice(0, 8)}...{content.id?.slice(-6)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        {isClosed && (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-red-100 to-red-200 text-red-800 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                            Closed
                          </span>
                        )}
                        {isFunded && (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-green-100 to-green-200 text-green-800 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                            </svg>
                            {poolAmount} SUI
                          </span>
                        )}
                        {isDistributed && (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-purple-100 to-purple-200 text-purple-800 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Distributed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="glass-panel text-center py-2">
                        <p className="text-2xl font-bold text-purple-600">{content.voteCount}</p>
                        <p className="text-xs text-gray-500 mt-1">Votes</p>
                      </div>
                      <div className="glass-panel text-center py-2">
                        <p className="text-2xl font-bold text-blue-600">
                          {content.winningVariant !== null ? `#${content.winningVariant + 1}` : '—'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Winner</p>
                      </div>
                      <div className="glass-panel text-center py-2">
                        <p className="text-2xl font-bold text-green-600">{poolAmount}</p>
                        <p className="text-xs text-gray-500 mt-1">{isDistributed ? 'Distributed' : 'Total Pool'}</p>
                      </div>
                      <div className="glass-panel text-center py-2">
                        <p className="text-2xl font-bold text-teal-600">{potValue}</p>
                        <p className="text-xs text-gray-500 mt-1">Current Pot</p>
                      </div>
                      <div className="glass-panel text-center py-2">
                        <p className="text-2xl font-bold text-orange-600">
                          {isClosed ? 'Closed' : 'Open'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Status</p>
                      </div>
                    </div>

                    {/* Actions Section */}
                    <div className="space-y-3">
                      {/* Close Voting Button */}
                      {!isClosed && (
                        <button
                          onClick={() => closeVoting(content.id)}
                          disabled={closingContent === content.id }
                          className="neuro-btn w-full flex items-center justify-center gap-2 text-red-700 hover:scale-105 transition-transform disabled:opacity-60"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          {closingContent === content.id ? 'Closing...' : 'Close Voting'}
                        </button>
                      )}

                      {/* Fund Reward Pool */}
                      {!isDistributed && (
                        <div className="glass-panel space-y-3 border-2 border-blue-200">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <h4 className="font-semibold text-gray-800 text-sm">
                              {isFunded ? 'Add More to Reward Pool' : 'Fund Reward Pool'}
                            </h4>
                          </div>
                          <div className="flex gap-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0.1"
                              placeholder="Min 0.1 SUI"
                              className="neuro-input flex-1 text-sm"
                              value={fundingAmount[content.id] || ""}
                              onChange={(e) => setFundingAmount({
                                ...fundingAmount,
                                [content.id]: e.target.value
                              })}
                            />
                            <button
                              onClick={() => fundRewardPool(content.id)}
                              className="neuro-btn-primary px-6 hover:scale-105 transition-transform disabled:opacity-60"
                              disabled={!fundingAmount[content.id] || parseFloat(fundingAmount[content.id]) < 0.1}
                            >
                              {isFunded ? '+ Add' : 'Fund Pool'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Distribute Rewards */}
                      {isFunded && !isDistributed && isClosed && (
                        <button
                          onClick={() => distributeRewards(content.id)}
                          disabled={distributingContent === content.id }
                          className="neuro-btn-primary w-full flex items-center justify-center gap-2 text-lg py-4 hover:scale-105 transition-transform disabled:opacity-60"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {distributingContent === content.id ? '⏳ Distributing...' : '🎉 Distribute Rewards Now'}
                        </button>
                      )}

                      {isFunded && !isClosed && (
                        <div className="glass-panel border-2 border-yellow-300 text-center py-3 bg-yellow-50">
                          <div className="flex items-center justify-center gap-2">
                            <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-sm text-yellow-700 font-medium">
                              Close voting before distributing rewards
                            </p>
                          </div>
                        </div>
                      )}

                      {isDistributed && (
                        <div className="glass-panel border-2 border-green-300 text-center py-4 bg-green-50">
                          <div className="flex flex-col items-center gap-2">
                            <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm text-green-700 font-medium">
                              Rewards Successfully Distributed!
                            </p>
                            <p className="text-xs text-gray-600">
                              {poolAmount} SUI distributed to {content.voteCount} validator{content.voteCount !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {message && (
          <div className={`glass-panel text-center py-4 animate-pulse ${message.startsWith('Success') ? 'border-2 border-green-300 bg-green-50' :
              'border-2 border-red-300 bg-red-50'
            }`}>
            <p className="font-medium text-gray-800 text-lg">{message}</p>
          </div>
        )}

        {/* Info & Tips Section */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass-panel border-2 border-purple-200">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-800">How Rewards Work</h3>
            </div>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-600 font-bold flex items-center justify-center text-xs">1</span>
                <span>Fund a reward pool for your content with SUI tokens (minimum 0.1 SUI)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-600 font-bold flex items-center justify-center text-xs">2</span>
                <span>Validators vote on your content variants to reach consensus</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-600 font-bold flex items-center justify-center text-xs">3</span>
                <span>Close voting when you have sufficient validation data</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-600 font-bold flex items-center justify-center text-xs">4</span>
                <span>Distribute rewards proportionally based on consensus alignment</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-600 font-bold flex items-center justify-center text-xs">5</span>
                <span>Validators earn SUI and +10 reputation points per validated task</span>
              </li>
            </ul>
          </div>

          <div className="glass-panel border-2 border-blue-200">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-teal-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-800">Best Practices</h3>
            </div>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Fund pools with adequate rewards to attract quality validators</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Wait for at least 5-10 votes before closing to ensure good consensus</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Close voting before distributing - this prevents manipulation</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Check analytics to optimize your reward distribution strategy</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Validators with higher reputation provide more reliable validation</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
