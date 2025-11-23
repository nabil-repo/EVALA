"use client";
import { useState, useEffect } from "react";
import { ConnectButton, useSuiClient, useSignAndExecuteTransaction, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { MODULES, PACKAGE_ID, VOTEBOOK_ID } from "@/lib/config";
import { walrusBlobUrl } from "@/lib/walrus";
import { useIsZkLogin, zkLoginGuardMessage } from "@/lib/zk";
import ZkLoginBanner from "@/components/ZkLoginBanner";
import { useZkSession } from "@/lib/zkSession";
import { toast } from "sonner";
import { stat } from "fs";

export default function ManagePage() {
    const client = useSuiClient();
    const account = useCurrentAccount();
    const isZk = useIsZkLogin();
    const { isSignedIn: hasZkSession } = useZkSession();
    const [content, setContent] = useState<{
        id: string;
        title: string;
        description: string;
        ipfs: string;
        cids: string[];
        variants: number;
        closed?: boolean;
        creator?: string;
        hasPoll?: boolean;
        pollAddress?: string;
    }[]>([]);
    const [loading, setLoading] = useState(false);
    const [pollsByContent, setPollsByContent] = useState<Record<string, string>>({});
    const [closingContent, setClosingContent] = useState<string | null>(null);
    const [deletingContent, setDeletingContent] = useState<string | null>(null);

    const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

    // Decode Move vector<u8> (which may be emitted as base64 or 0x-hex) to a UTF-8 string
    const decodeIpfs = (val: unknown): string => {
        if (!val) return "";
        try {
            const decoder = new TextDecoder();
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
                try {
                    const bin = atob(val);
                    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
                    return decoder.decode(bytes);
                } catch {
                    return val;
                }
            }
            if (Array.isArray(val)) {
                return decoder.decode(new Uint8Array(val));
            }
            return "";
        } catch (e) {
            console.error("decodeIpfs error:", e, val);
            return "";
        }
    };

    useEffect(() => {
        async function load() {
            if (!PACKAGE_ID) {
                console.warn("PACKAGE_ID not set");
                return;
            }
            setLoading(true);
            try {
                console.log('Using PACKAGE_ID:', PACKAGE_ID);

                // Try fetching ContentRegisteredV2 events first (newer version)
                let events = await client.queryEvents({
                    query: {
                        MoveEventType: `${PACKAGE_ID}::${MODULES.content}::ContentRegisteredV2`
                    },
                    limit: 50,
                    order: 'descending',
                });

                // Fallback to ContentRegistered if V2 has no results
                if (events.data.length === 0) {
                    events = await client.queryEvents({
                        query: {
                            MoveEventType: `${PACKAGE_ID}::${MODULES.content}::ContentRegistered`
                        },
                        limit: 50,
                        order: 'descending',
                    });
                }

                console.log('ContentRegistered events found:', events.data.length);

                // Fetch PollCreated events to identify which content has polls
                const pollEvents = await client.queryEvents({
                    query: {
                        MoveEventType: `${PACKAGE_ID}::${MODULES.poll}::PollCreated`
                    },
                    limit: 100,
                });

                const pollMap: Record<string, string> = {};
                pollEvents.data.forEach((ev: any) => {
                    const contentId = ev.parsedJson?.content_id;
                    const pollAddr = ev.parsedJson?.poll_address;
                    if (contentId && pollAddr) {
                        pollMap[contentId.toLowerCase()] = pollAddr;
                    }
                });
                setPollsByContent(pollMap);

                const list = events.data.map((ev: any) => {
                    const j = ev.parsedJson;
                    const id = j?.content_id || "";
                    const rawIpfs = decodeIpfs(j?.ipfs_hash);
                    let parsedCids: string[] = [];
                    try {
                        const parsed = JSON.parse(rawIpfs);
                        if (parsed?.cids && Array.isArray(parsed.cids)) {
                            parsedCids = parsed.cids;
                        }
                    } catch { }

                    const hasPoll = !!pollMap[id.toLowerCase()];
                    const pollAddress = pollMap[id.toLowerCase()];

                    return {
                        id,
                        title: decodeIpfs(j?.title) || "Untitled",
                        description: decodeIpfs(j?.description) || "",
                        ipfs: rawIpfs,
                        cids: parsedCids,
                        variants: parseInt(j?.variants || "0"),
                        creator: j?.creator,
                        hasPoll,
                        pollAddress,
                    };
                });

                // Filter to only show content created by current user
                const myContent = account?.address
                    ? list.filter(c => {
                        const match = c.creator?.toLowerCase() === account.address.toLowerCase();
                        console.log('Content creator match:', { contentId: c.id.slice(0, 8), creator: c.creator, account: account.address, match });
                        return match;
                    })
                    : [];

                // Check closed status for each content
                let contentWithStatus = myContent;
                if (VOTEBOOK_ID && myContent.length > 0) {
                    contentWithStatus = await Promise.all(myContent.map(async (item) => {
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
                }

                setContent(contentWithStatus);
                console.log('Loaded content:', { total: list.length, filtered: contentWithStatus.length });
            } catch (e) {
                console.error("Load content error:", e);
                toast.error("Failed to load content");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [client, account?.address]);

    async function createPoll(contentId: string, variants: number, requireZk: boolean) {
        try {
            if (!PACKAGE_ID) throw new Error('Missing NEXT_PUBLIC_PACKAGE_ID');
            const tx = new Transaction();
            const endMs = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
            tx.moveCall({
                target: `${PACKAGE_ID}::${MODULES.poll}::create_poll`,
                arguments: [
                    tx.pure.id(contentId),
                    tx.pure.u64(variants),
                    tx.pure.u64(endMs),
                    tx.pure.bool(requireZk),
                ],
            });
            const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
            toast.success(`Poll created! Digest: ${(res as any)?.digest ?? 'ok'}`);
            setTimeout(() => window.location.reload(), 1500);
        } catch (e: any) {
            console.error('Create poll error:', e);
            toast.error(e?.message || String(e));
        }
    }

    async function closePoll(pollAddress: string, contentId: string) {
        setClosingContent(contentId);
        try {
            if (!PACKAGE_ID) throw new Error('Missing NEXT_PUBLIC_PACKAGE_ID');
            const tx = new Transaction();
            tx.moveCall({
                target: `${PACKAGE_ID}::${MODULES.poll}::close_poll`,
                arguments: [tx.object(pollAddress)],
            });
            const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
            toast.success(`Poll closed! Digest: ${(res as any)?.digest?.slice(0, 12)}...`);
            setTimeout(() => window.location.reload(), 1500);
        } catch (e: any) {
            console.error('Close poll error:', e);
            toast.error(e?.message || String(e));
        } finally {
            setClosingContent(null);
        }
    }

    async function closeVoting(contentId: string) {
        setClosingContent(contentId);
        try {
            if (!PACKAGE_ID) throw new Error('Missing NEXT_PUBLIC_PACKAGE_ID');
            if (!VOTEBOOK_ID) throw new Error('Missing NEXT_PUBLIC_VOTEBOOK_ID');
            const tx = new Transaction();
            tx.moveCall({
                target: `${PACKAGE_ID}::${MODULES.vote}::close_voting`,
                arguments: [
                    tx.object(VOTEBOOK_ID),
                    tx.pure.id(contentId),
                ],
            });
            const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
            toast.success(`Voting closed! Digest: ${(res as any)?.digest?.slice(0, 12)}...`);
            setTimeout(() => window.location.reload(), 1500);
        } catch (e: any) {
            console.error('Close voting error:', e);
            toast.error(e?.message || String(e));
        } finally {
            setClosingContent(null);
        }
    }

    async function deleteContent(contentId: string) {
        const confirmed = window.confirm("Are you sure you want to delete this content? This action cannot be undone.");
        if (!confirmed) return;

        setDeletingContent(contentId);
        try {
            if (!PACKAGE_ID) throw new Error('Missing NEXT_PUBLIC_PACKAGE_ID');
            if (!VOTEBOOK_ID) throw new Error('Missing NEXT_PUBLIC_VOTEBOOK_ID');
            const tx = new Transaction();
            tx.moveCall({
                target: `${PACKAGE_ID}::${MODULES.content}::delete_content`,
                arguments: [
                    tx.object(VOTEBOOK_ID),
                    tx.pure.id(contentId),
                ],
            });
            const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
            toast.success(`Content deleted! Digest: ${(res as any)?.digest?.slice(0, 12)}...`);
            setTimeout(() => window.location.reload(), 1500);
        } catch (e: any) {
            console.error('Delete content error:', e);
            toast.error(e?.message || String(e));
        } finally {
            setDeletingContent(null);
        }
    }

    return (
    <main className="min-h-screen p-8 relative overflow-hidden">
      {/* Animated Ambient Glows */}
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-purple-400 rounded-full opacity-10 blur-3xl animate-pulse"></div>
      <div className="absolute bottom-40 right-1/4 w-80 h-80 bg-blue-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-pink-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>            <div className="max-w-7xl mx-auto relative z-10 space-y-8">
                <div className="text-center space-y-3">
                    <h1 className="text-display-sm gradient-text">Manage Content</h1>
                    <p className="text-gray-600 font-light">
                        Manage your content, create polls, and control voting
                    </p>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-500"></div>
                        <p className="mt-4 text-gray-600">Loading your content...</p>
                    </div>
                ) : content.length === 0 ? (
                    <div className="glass-panel text-center py-12 space-y-4">
                        <p className="text-gray-600">
                            {!account?.address
                                ? "Please connect your wallet to manage your content."
                                : "You haven't created any content yet."}
                        </p>
                        {account?.address && (
                            <div className="space-y-2">
                                <p className="text-sm text-gray-500">
                                    Visit the Upload page to create your first content.
                                </p>
                                <a href="/upload" className="inline-block neuro-btn">
                                    Go to Upload
                                </a>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {content.map((c) => {
                            const imageUrl = c.cids && c.cids.length > 0 ? walrusBlobUrl(c.cids[0]) : null;
                            const isClosing = closingContent === c.id;
                            const isDeleting = deletingContent === c.id;

                            return (
                                <div key={c.id} className="neuro-card p-6 space-y-4">
                                    <div className="flex gap-6">
                                        {imageUrl && (
                                            <div className="flex-shrink-0">
                                                <img
                                                    src={imageUrl}
                                                    alt={c.title}
                                                    className="w-32 h-32 object-cover rounded-lg"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            </div>
                                        )}
                                        <div className="flex-1 space-y-2">
                                            <h3 className="text-xl font-semibold text-gray-800">{c.title}</h3>
                                            {c.description && (
                                                <p className="text-sm text-gray-600">{c.description}</p>
                                            )}
                                            <div className="flex gap-4 text-xs text-gray-500">
                                                <span>ID: {c.id.slice(0, 8)}...{c.id.slice(-6)}</span>
                                                <span>Variants: {c.variants}</span>
                                                <span >Status: {c.closed ? "Closed" : "Active"}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
                                        {!c.hasPoll ? (
                                            account?.address && c.creator?.toLowerCase() === account.address.toLowerCase() && (
                                                <>
                                                    <button
                                                        onClick={() => createPoll(c.id, c.variants, false)}
                                                        className="neuro-btn text-sm"
                                                    >
                                                        Create Public Poll (7 days)
                                                    </button>
                                                    <button
                                                        onClick={() => createPoll(c.id, c.variants, true)}
                                                        className="neuro-btn text-sm"
                                                    >
                                                        Create Private Poll (zkLogin only)
                                                    </button>
                                                </>
                                            )
                                        ) : (
                                            <>

                                                {account?.address && c.creator?.toLowerCase() === account.address.toLowerCase() && c.pollAddress && !c.closed && (
                                                    <button
                                                        onClick={() => closePoll(c.pollAddress!, c.id)}
                                                        className="neuro-btn text-sm bg-orange-50 hover:bg-orange-100"
                                                        disabled={isClosing}
                                                    >
                                                        {isClosing ? "Closing..." : "Close Poll"}
                                                    </button>
                                                )}
                                            </>
                                        )}

                                        {account?.address && c.creator?.toLowerCase() === account.address.toLowerCase() && !c.closed && (
                                            <button
                                                onClick={() => closeVoting(c.id)}
                                                className="neuro-btn text-sm bg-yellow-50 hover:bg-yellow-100"
                                                disabled={isClosing}
                                            >
                                                {isClosing ? "Closing..." : "Close Voting"}
                                            </button>
                                        )}

                                        {/* {account?.address && c.creator?.toLowerCase() === account.address.toLowerCase() && (
                      <button
                        onClick={() => deleteContent(c.id)}
                        className="neuro-btn text-sm bg-red-50 hover:bg-red-100 text-red-600"
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Deleting..." : "Delete Content"}
                      </button>
                    )} */}

                                        <a
                                            href={`/vote`}
                                            className="neuro-btn text-sm bg-blue-50 hover:bg-blue-100"
                                        >
                                            View in Vote Page
                                        </a>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* <div className="glass-panel p-6 space-y-3">
                    <h3 className="font-semibold text-gray-800">Management Actions</h3>
                    <ul className="text-sm text-gray-600 space-y-2">
                        <li><strong>Create Poll:</strong> Set up a time-limited private voting poll for your content (public or zkLogin-only)</li>
                        <li><strong>Close Poll:</strong> End the poll early and finalize results</li>
                        <li><strong>Close Voting:</strong> Stop accepting new votes for content in the VoteBook</li>
                        <li><strong>Delete Content:</strong> Remove content from the platform (requires creator permission)</li>
                    </ul>
                </div> */}
            </div>
        </main>
    );
}
