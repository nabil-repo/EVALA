"use client";
import { useState, useEffect } from "react";
import { ConnectButton, useSuiClient, useSignAndExecuteTransaction, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";
import { MODULES, PACKAGE_ID, VOTEBOOK_ID } from "@/lib/config";
import { walrusBlobUrl } from "@/lib/walrus";
import { walrusUploadJSON } from "@/lib/walrus";
import { useIsZkLogin, zkLoginGuardMessage } from "@/lib/zk";
import ZkLoginBanner from "@/components/ZkLoginBanner";
import { useZkSession, getZkIdToken } from "@/lib/zkSession";
import { executeWithZkLogin } from "@/lib/zkloginExec";

export default function VotePage() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const isZk = useIsZkLogin();
  const { isSignedIn: hasZkSession } = useZkSession();
  const [content, setContent] = useState<{ id: string; title: string; description: string; ipfs: string; cids: string[]; variants: number; closed?: boolean; creator?: string }[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState<Set<string>>(new Set());
  const [pollsByContent, setPollsByContent] = useState<Record<string, string>>({});
  const [privateMode, setPrivateMode] = useState<Record<string, boolean>>({});
  const [stakeAmount, setStakeAmount] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "live" | "closed">("all");

  // Decode Move vector<u8> (which may be emitted as base64 or 0x-hex) to a UTF-8 string
  const decodeIpfs = (val: unknown): string => {
    if (!val) return "";
    try {
      const decoder = new TextDecoder();
      // hex string like 0x1234...
      const fromHex = (hex: string) => {
        const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
        const bytes = new Uint8Array(cleaned.length / 2);
        for (let i = 0; i < cleaned.length; i += 2) {
          bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
        }
        return decoder.decode(bytes);
      };
      if (typeof val === "string") {
        if (val.startsWith("0x")) return fromHex(val);
        // try base64
        try {
          const bin = atob(val);
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
          return decoder.decode(bytes);
        } catch {
          // not base64; return as-is
          return val;
        }
      }
      if (Array.isArray(val)) {
        // assume number[]
        return decoder.decode(Uint8Array.from(val as number[]));
      }
      return "";
    } catch {
      return "";
    }
  };

  const parseCids = (ipfsString: string): { primary: string; list: string[] } => {
    if (!ipfsString) return { primary: "", list: [] };
    try {
      const parsed = JSON.parse(ipfsString);
      if (Array.isArray(parsed)) {
        const list = parsed.map((s) => String(s)).filter(Boolean);
        return { primary: list[0] ?? "", list };
      }
      if (parsed && Array.isArray(parsed.cids)) {
        const list = parsed.cids.map((s: any) => String(s)).filter(Boolean);
        return { primary: list[0] ?? "", list };
      }
      // Fallback: plain CID string
      return { primary: ipfsString, list: [ipfsString] };
    } catch {
      // Not JSON: treat as plain CID
      return { primary: ipfsString, list: [ipfsString] };
    }
  };

  useEffect(() => {
    async function load() {
      console.log("Using PACKAGE_ID:", PACKAGE_ID);
      setLoading(true);
      try {
        if (!PACKAGE_ID) return;
        const pkgIds = [PACKAGE_ID];
        const results: any[] = [];
        for (const pid of pkgIds) {
          const [evV2, evV1] = await Promise.all([
            client.queryEvents({
              query: { MoveEventType: `${pid}::${MODULES.content}::ContentRegisteredV2` },
              limit: 50,
              order: 'descending'
            }),
            client.queryEvents({
              query: { MoveEventType: `${pid}::${MODULES.content}::ContentRegistered` },
              limit: 50,
              order: 'descending'
            })
          ]);
          results.push(...(evV2.data || []), ...(evV1.data || []));
        }
        const merged = results;
        let items = merged.map((e: any) => {
          const fields = e.parsedJson as any;
          const ipfs = decodeIpfs(fields?.ipfs_hash);
          const titleStr = decodeIpfs(fields?.title) || 'Content';
          const descStr = decodeIpfs(fields?.description) || '';
          const variants = typeof fields?.variants === 'string' ? parseInt(fields.variants, 10) : (fields?.variants ?? 1);
          const { primary, list } = parseCids(ipfs);
          const creator = fields?.creator || '';
          return {
            id: fields?.content_id || fields?.contentId,
            title: titleStr,
            description: descStr,
            ipfs: primary,
            cids: list,
            variants: Number.isFinite(variants) && variants > 0 ? variants : 1,
            creator,
          } as { id: string; title: string; description: string; ipfs: string; cids: string[]; variants: number; creator: string };
        }).filter((x: any) => !!x.id);

        // If nothing found, retry a couple times to allow indexer to catch up
        if (!items.length) {
          for (let attempt = 0; attempt < 3 && !items.length; attempt++) {
            await new Promise((r) => setTimeout(r, 1500));
            const retryResults: any[] = [];
            for (const pid of pkgIds) {
              const [evV2r, evV1r] = await Promise.all([
                client.queryEvents({
                  query: { MoveEventType: `${pid}::${MODULES.content}::ContentRegisteredV2` },
                  limit: 50,
                  order: 'descending'
                }),
                client.queryEvents({
                  query: { MoveEventType: `${pid}::${MODULES.content}::ContentRegistered` },
                  limit: 50,
                  order: 'descending'
                })
              ]);
              retryResults.push(...(evV2r.data || []), ...(evV1r.data || []));
            }
            const mergedRetry = retryResults;
            items = mergedRetry.map((e: any) => {
              const fields = e.parsedJson as any;
              const ipfs = decodeIpfs(fields?.ipfs_hash);
              const titleStr = decodeIpfs(fields?.title) || 'Content';
              const descStr = decodeIpfs(fields?.description) || '';
              const variants = typeof fields?.variants === 'string' ? parseInt(fields.variants, 10) : (fields?.variants ?? 1);
              const { primary, list } = parseCids(ipfs);
              const creator = fields?.creator || '';
              return {
                id: fields?.content_id || fields?.contentId,
                title: titleStr,
                description: descStr,
                ipfs: primary,
                cids: list,
                variants: Number.isFinite(variants) && variants > 0 ? variants : 1,
                creator,
              } as { id: string; title: string; description: string; ipfs: string; cids: string[]; variants: number; creator: string };
            }).filter((x: any) => !!x.id);
          }
        }

        console.log('Loaded content items:', items);
        setContent(items);

        // Load Polls for these content IDs
        try {
          const pollEvents = await client.queryEvents({
            query: { MoveEventType: `${PACKAGE_ID}::${MODULES.poll}::PollCreated` },
            limit: 200,
            order: 'descending',
          });
          const map: Record<string, string> = {};
          for (const ev of pollEvents.data || []) {
            const pj = ev.parsedJson as any;
            const cid = (pj?.content_id || '').toLowerCase();
            const pollAddr = pj?.poll_address;
            if (cid && pollAddr && !map[cid]) map[cid] = pollAddr;
          }
          setPollsByContent(map);
        } catch (e) {
          console.warn('Poll load error', e);
        }


        // After content is loaded, fetch votes for these content IDs
        const ids = items.map((i) => (i.id as string).toLowerCase());
        if (ids.length) {
          const voteEvents: any[] = [];
          for (const pid of pkgIds) {
            const vEvs = await client.queryEvents({
              query: { MoveEventType: `${pid}::${MODULES.vote}::VoteSubmitted` },
              limit: 1000,
              order: 'descending',
            });
            voteEvents.push(...(vEvs.data || []));
          }
          const counts: Record<string, number[]> = {};
          const votedByUser = new Set<string>();

          for (const ev of voteEvents) {
            const f = ev.parsedJson as any;
            const cid = (f?.content_id || f?.contentId || '').toLowerCase();
            if (!ids.includes(cid)) continue;

            // Check if this vote is from current user
            const voter = (f?.voter || '').toLowerCase();
            if (account?.address && voter === account.address.toLowerCase()) {
              votedByUser.add(cid);
            }

            const viRaw = f?.variant_index ?? f?.variantIndex ?? 0;
            const vi = typeof viRaw === 'string' ? parseInt(viRaw, 10) : viRaw;
            if (!Number.isFinite(vi)) continue;
            const current = counts[cid] || [];
            const size = Math.max(current.length, vi + 1);
            const next = Array.from({ length: size }, (_, i) => current[i] ?? 0);
            next[vi] = (next[vi] ?? 0) + 1;
            counts[cid] = next;
          }
          console.log('Vote counts:', counts);
          console.log('User already voted on:', Array.from(votedByUser));
          setVoteCounts(counts);
          setAlreadyVoted(votedByUser);
        }

        // Check closed status for each content
        if (VOTEBOOK_ID) {
          const itemsWithStatus = await Promise.all(items.map(async (item) => {
            try {
              const tx = new Transaction();
              tx.moveCall({
                target: `${PACKAGE_ID}::${MODULES.vote}::is_closed`,
                arguments: [
                  tx.object(VOTEBOOK_ID!),
                  tx.pure.id(item.id),
                ],
              });

              const result = await client.devInspectTransactionBlock({
                transactionBlock: tx,
                sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
              });

              if (result.results?.[0]?.returnValues?.[0]) {
                const [bytes] = result.results[0].returnValues[0];
                return { ...item, closed: bytes[0] === 1 };
              }
            } catch (e) {
              console.error(`Error checking closed status for ${item.id}:`, e);
            }
            return { ...item, closed: false };
          }));
          setContent(itemsWithStatus);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [client]);

  // Test function to call get_vote_count directly
  async function testGetVoteCount(contentId: string, variantIndex: number) {
    try {
      if (!PACKAGE_ID || !VOTEBOOK_ID) {
        toast.error('Missing PACKAGE_ID or VOTEBOOK_ID');
        return;
      }

      const tx = new Transaction();
      const [result] = tx.moveCall({
        target: `${PACKAGE_ID}::${MODULES.vote}::get_vote_count`,
        arguments: [
          tx.object(VOTEBOOK_ID),
          tx.pure.id(contentId),
          tx.pure.u64(variantIndex),
        ],
      });

      // DevInspect to read the return value without executing
      const devInspectResult = await client.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

      console.log('get_vote_count devInspect result:', devInspectResult);

      if (devInspectResult.results && devInspectResult.results[0]) {
        const returnValues = devInspectResult.results[0].returnValues;
        if (returnValues && returnValues[0]) {
          const [bytes] = returnValues[0];
          // Decode u64 from BCS bytes
          const view = new DataView(new Uint8Array(bytes).buffer);
          const count = view.getBigUint64(0, true); // little-endian
          toast.info(`get_vote_count(${contentId.slice(0, 8)}..., ${variantIndex}) = ${count}`);
          console.log(`Direct call: Variant ${variantIndex} has ${count} votes`);
        }
      }
    } catch (e: any) {
      console.error('get_vote_count test error:', e);
      toast.error(`Test failed: ${e?.message || String(e)}`);
    }
  }

  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [hasReputation, setHasReputation] = useState<boolean | null>(null);
  const [checkingReputation, setCheckingReputation] = useState(false);
  const [mintingReputation, setMintingReputation] = useState(false);

  // Check if user has reputation NFT
  useEffect(() => {
    async function checkReputation() {
      if (!account?.address || !PACKAGE_ID) {
        setHasReputation(null);
        return;
      }

      setCheckingReputation(true);
      try {
        const objects = await client.getOwnedObjects({
          owner: account.address,
          filter: {
            StructType: `${PACKAGE_ID}::${MODULES.reputation}::Reputation`
          }
        });

        setHasReputation(objects.data.length > 0);
      } catch (e) {
        console.error("Error checking reputation:", e);
        setHasReputation(null);
      } finally {
        setCheckingReputation(false);
      }
    }

    checkReputation();
  }, [account?.address, client]);

  const mintReputation = async () => {
    if (!isZk && !hasZkSession) {
      toast.error(zkLoginGuardMessage());
      return;
    }
    if (!account?.address) {
      toast.error("Please connect your wallet");
      return;
    }

    setMintingReputation(true);

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
      toast.success(`Reputation NFT minted! You can now vote. Digest: ${(res as any)?.digest?.slice(0, 12)}...`);

      setTimeout(() => {
        setHasReputation(true);
      }, 2000);
    } catch (e: any) {
      console.error("Mint error:", e);
      toast.error(e?.message || String(e));
    } finally {
      setMintingReputation(false);
    }
  };

  async function castVote(id: string, variant: number) {
    if (!isZk && !hasZkSession) {
      toast.error(zkLoginGuardMessage());
      return;
    }
    const stored = getZkIdToken();
    const jwt = stored || '';
    if (!jwt) {
      toast.error("zkLogin session not found. Please sign in.");
      return;
    }
    // Check if user has reputation NFT before voting
    if (hasReputation === false) {
      toast.error("You need a Reputation NFT to vote. Please mint one first!");
      return;
    }

    try {
      if (!PACKAGE_ID) throw new Error('Missing NEXT_PUBLIC_PACKAGE_ID');
      const usePrivate = !!privateMode[id];
      const pollAddr = pollsByContent[id.toLowerCase()];
      const tx = new Transaction();

      if (usePrivate && pollAddr) {
        // Create Walrus proof snapshot
        const proof = { content_id: id, variant_index: variant, ts: Date.now() };
        const uploaded = await walrusUploadJSON(proof);
        const proofCidBytes = new TextEncoder().encode(uploaded.blobId);

        // Optional staking commitment (amount in SUI -> MIST)
        const stakeStr = stakeAmount[id];
        if (stakeStr) {
          const amountMist = BigInt(Math.floor(parseFloat(stakeStr) * 1_000_000_000));
          tx.moveCall({
            target: `${PACKAGE_ID}::${MODULES.poll}::stake_prediction_commit`,
            arguments: [
              tx.object(pollAddr),
              tx.pure.u64(variant),
              tx.pure.u64(Number(amountMist)),
              tx.object('0x6'), // Clock
            ],
          });
        }

        tx.moveCall({
          target: `${PACKAGE_ID}::${MODULES.poll}::submit_vote_private`,
          arguments: [
            tx.object(pollAddr),
            tx.pure.u64(variant),
            tx.pure.vector('u8', Array.from(proofCidBytes)),
            tx.object('0x6'), // Clock
          ],
        });
        // If no wallet, sign+execute with zkLogin signature
        if (!account?.address) {
          const res = await executeWithZkLogin({ client, tx, jwt, useSponsor: true });
          toast.success(`Vote submitted! Digest: ${(res as any)?.digest ?? 'ok'}`);
          setTimeout(() => window.location.reload(), 2000);
          return;
        }
      } else {
        if (!VOTEBOOK_ID) throw new Error('NEXT_PUBLIC_VOTEBOOK_ID is not set. Run init script.');
        tx.moveCall({
          target: `${PACKAGE_ID}::${MODULES.vote}::submit_vote`,
          arguments: [
            tx.object(VOTEBOOK_ID),
            tx.pure.id(id),
            tx.pure.u64(variant),
          ],
        });
      }
      // For non-private or when wallet is available, use wallet signing; otherwise zkLogin path above
      let res: any;
      if (account?.address) {
        res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
      } else {
        res = await executeWithZkLogin({ client, tx, jwt, useSponsor: true });
      }
      toast.success(`Vote submitted! Digest: ${(res as any)?.digest ?? 'ok'}`);

      // Reload content and vote counts after a short delay to allow events to propagate
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e: any) {
      console.error('Vote error:', e);
      toast.error(`Vote failed: ${e?.message || String(e)}`);
    }
  }

  return (
    <main className="min-h-screen p-8 relative overflow-hidden">
      {/* Animated Ambient Glows */}
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-purple-400 rounded-full opacity-10 blur-3xl animate-pulse"></div>
      <div className="absolute bottom-40 right-1/4 w-80 h-80 bg-blue-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-pink-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>

      <div className="max-w-5xl mx-auto relative z-10 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center glass-panel">
          <div>
            <h1 className="text-display-sm gradient-text">Vote & Earn</h1>
            <p className="text-sm text-gray-600 font-light mt-1">Validate content and get rewarded</p>
          </div>
        </div>


        {/* Search and Filter Tabs */}
        <div className="glass-panel space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search content by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="neuro-input w-full pl-10 pr-4 py-3 text-sm"
            />
          </div>


          {/* Filter Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-4 py-2 rounded-[12px] text-sm font-medium transition-all duration-200 ${activeTab === "all"
                ? "bg-purple-500 text-white shadow-lg"
                : "bg-white/50 text-gray-600 hover:bg-white/70"
                }`}
            >
              All Content
            </button>
            <button
              onClick={() => setActiveTab("live")}
              className={`px-4 py-2 rounded-[12px] text-sm font-medium transition-all duration-200 ${activeTab === "live"
                ? "bg-green-500 text-white shadow-lg"
                : "bg-white/50 text-gray-600 hover:bg-white/70"
                }`}
            >
              Live Voting
            </button>
            <button
              onClick={() => setActiveTab("closed")}
              className={`px-4 py-2 rounded-[12px] text-sm font-medium transition-all duration-200 ${activeTab === "closed"
                ? "bg-red-500 text-white shadow-lg"
                : "bg-white/50 text-gray-600 hover:bg-white/70"
                }`}
            >
              Closed
            </button>
          </div>
        </div>

        {/* {(!isZk && !hasZkSession) && (
          <div className="glass-panel border-2 border-red-300">
            <p className="text-sm text-red-700 font-medium text-center">{zkLoginGuardMessage()}</p>
          </div>
        )} */}

        {/* {!account?.address && (
          <div className="glass-panel border-2 border-blue-200 flex items-center justify-between gap-3">
            <p className="text-sm text-blue-700 font-medium">Connect your Sui wallet to sign transactions</p>
            <ConnectButton />
          </div>
        )} */}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600">Loading content...</p>
          </div>
        )}

        {!loading && content.length === 0 && (
          <div className="neuro-card text-center space-y-4 py-12">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-medium text-gray-700">No content available yet</p>
              <p className="text-sm text-gray-500 mt-2">
                Upload some content first on the <a href="/upload" className="text-purple-600 underline font-medium">Upload page</a>.
              </p>
            </div>
          </div>
        )}

        {/* Filter and search content */}
        {(() => {
          let filteredContent = content;

          // Apply tab filter
          if (activeTab === "live") {
            filteredContent = content.filter(c => !c.closed);
          } else if (activeTab === "closed") {
            filteredContent = content.filter(c => c.closed);
          }

          // Apply search filter
          if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filteredContent = filteredContent.filter(c =>
              c.title.toLowerCase().includes(query) ||
              c.description.toLowerCase().includes(query)
            );
          }

          return filteredContent.map((c) => {
            const contentVotes = voteCounts[c.id?.toLowerCase()] || [];
            const totalVotes = contentVotes.reduce((sum, v) => sum + v, 0);

            return (
              <div key={c.id} className="neuro-card space-y-6">
                {/* Content Header */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-2xl font-semibold text-gray-800">{c.title}</h2>
                    {c.closed && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-red-100 to-red-200 text-red-800 whitespace-nowrap">
                        Voting Closed
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-sm text-gray-600 font-light">{c.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-blue-100 to-purple-100">
                      {c.variants} variants
                    </span>
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-purple-100 to-pink-100">
                      {totalVotes} total votes
                    </span>
                  </div>
                </div>

                {/* Variant Grid */}
                {c.cids?.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {c.cids.map((cid, i) => {
                      const votes = contentVotes[i] || 0;
                      const isSelected = selected[c.id] === i;

                      return (
                        <button
                          key={cid + i}
                          onClick={() => setSelected({ ...selected, [c.id]: i })}
                          className={`group variant-card transition-all duration-400 ${isSelected ? 'selected' : ''}`}
                        >
                          <div className="relative">
                            <img
                              src={walrusBlobUrl(cid) || ''}
                              alt={`Variant ${i}`}
                              className="w-full h-48 object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                            />
                            {isSelected && (
                              <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center glow-purple">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="glass-panel">
                            <div className="text-center">
                              <p className="text-xs text-gray-600 font-medium">Variant {i}</p>
                              <p className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">
                                {votes} {votes === 1 ? 'vote' : 'votes'}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Private Vote & Staking Options */}
                <div className="glass-panel">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={!!privateMode[c.id]}
                        onChange={(e) => setPrivateMode({ ...privateMode, [c.id]: e.target.checked })}
                      />
                      Private vote (zkLogin recommended)
                    </label>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600">Prediction stake (SUI):</span>
                      <input
                        value={stakeAmount[c.id] || ''}
                        onChange={(e) => setStakeAmount({ ...stakeAmount, [c.id]: e.target.value })}
                        placeholder="0.0"
                        className="neuro-input w-28 text-sm"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                  {privateMode[c.id] && !pollsByContent[c.id.toLowerCase()] && (
                    <p className="text-xs text-yellow-700 mt-2">
                      No poll found for this content yet. {account?.address && c.creator && account.address.toLowerCase() === c.creator.toLowerCase()
                        ? "Visit the Manage page to create one."
                        : "Ask creator to create one."}
                    </p>
                  )}
                </div>

                {/* Submit Vote Button */}
                {c.closed ? (
                  <div className="glass-panel border-2 border-red-300 text-center py-4">
                    <p className="text-sm text-red-700 font-medium">
                      Voting has been closed by the creator
                    </p>
                  </div>
                ) : account?.address && c.creator && account.address.toLowerCase() === c.creator.toLowerCase() ? (
                  <div className="glass-panel border-2 border-blue-300 text-center py-4">
                    <p className="text-sm text-blue-700 font-medium">
                      👤 You are the creator of this content and cannot vote
                    </p>
                  </div>
                ) : alreadyVoted.has(c.id.toLowerCase()) ? (
                  <div className="glass-panel border-2 border-green-300 text-center py-4">
                    <p className="text-sm text-green-700 font-medium">
                      You have already voted on this content
                    </p>
                  </div>
                ) : hasReputation === false ? (
                  <div className="space-y-3">
                    <div className="glass-panel border-2 border-yellow-300 text-center py-3">
                      <p className="text-sm text-yellow-700 font-medium">
                        You need a Reputation NFT to vote
                      </p>
                    </div>
                    <button
                      onClick={mintReputation}
                      disabled={mintingReputation}
                      className="neuro-btn-primary w-full text-base font-semibold flex items-center justify-center gap-3"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      {mintingReputation ? 'Minting Reputation NFT...' : 'Mint Reputation NFT to Vote'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => castVote(c.id, selected[c.id] ?? 0)}
                    disabled={(!isZk && !hasZkSession) || selected[c.id] === undefined || checkingReputation || (!account?.address && !privateMode[c.id])}
                    className="neuro-btn-primary w-full text-base font-semibold flex items-center justify-center gap-3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {checkingReputation ? 'Checking...' : `Submit Vote for Variant ${selected[c.id] ?? 0}`}
                  </button>
                )}
              </div>
            );
          });
        })()}
      </div>
    </main>
  );
}