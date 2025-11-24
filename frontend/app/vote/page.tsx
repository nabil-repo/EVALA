"use client";
import { useState, useEffect } from "react";
import { ConnectButton, useSuiClient, useSignAndExecuteTransaction, useCurrentAccount } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";
import { fileTypeFromBuffer } from "file-type";
import { MODULES, PACKAGE_ID, VOTEBOOK_ID } from "@/lib/config";
import { walrusBlobUrl } from "@/lib/walrus";
import { walrusUploadJSON } from "@/lib/walrus";
import { useIsZkLogin, zkLoginGuardMessage } from "@/lib/zk";
import { useZkSession, getZkIdToken } from "@/lib/zkSession";
import { executeWithZkLogin } from "@/lib/zkloginExec";

export default function VotePage() {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const isZk = useIsZkLogin();
  const { isSignedIn: hasZkSession } = useZkSession();
  const [content, setContent] = useState<{ id: string; title: string; description: string; ipfs: string; cids: string[]; variants: number; closed?: boolean; creator?: string; fileTypes?: string[] }[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState<Set<string>>(new Set());
  const [pollsByContent, setPollsByContent] = useState<Record<string, string>>({});
  const [privateMode, setPrivateMode] = useState<Record<string, boolean>>({});
  const [stakeAmount, setStakeAmount] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "live" | "closed">("all");
  const [fileTypes, setFileTypes] = useState<Record<string, 'image' | 'video' | 'pdf' | 'audio' | 'text' | 'unknown'>>({});

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

  const parseCids = (ipfsString: string): { primary: string; list: string[]; fileTypes: Record<string, string> } => {
    if (!ipfsString) return { primary: "", list: [], fileTypes: {} };
    try {
      const parsed = JSON.parse(ipfsString);

      // New format with file metadata
      if (parsed && Array.isArray(parsed.files)) {
        const list = parsed.files.map((f: any) => String(f.blobId)).filter(Boolean);
        const fileTypes: Record<string, string> = {};
        parsed.files.forEach((f: any) => {
          if (f.blobId && f.type) {
            fileTypes[f.blobId] = f.type;
          }
        });
        return { primary: list[0] ?? "", list, fileTypes };
      }

      // Legacy format - just CIDs array
      if (Array.isArray(parsed)) {
        const list = parsed.map((s) => String(s)).filter(Boolean);
        return { primary: list[0] ?? "", list, fileTypes: {} };
      }
      if (parsed && Array.isArray(parsed.cids)) {
        const list = parsed.cids.map((s: any) => String(s)).filter(Boolean);
        return { primary: list[0] ?? "", list, fileTypes: {} };
      }

      // Fallback: plain CID string
      return { primary: ipfsString, list: [ipfsString], fileTypes: {} };
    } catch {
      // Not JSON: treat as plain CID
      return { primary: ipfsString, list: [ipfsString], fileTypes: {} };
    }
  };

  // Detect file type from CID or URL using magic bytes (fallback for legacy content)
  const detectFileType = async (cid: string): Promise<'image' | 'video' | 'pdf' | 'audio' | 'text' | 'unknown'> => {
    try {
      console.log(`Detecting file type for ${cid} (no metadata available)`);
      const url = walrusBlobUrl(cid);
      if (!url) return "unknown";

      // Fetch first ~4KB for magic bytes detection
      const res = await fetch(url, { headers: { 'Range': 'bytes=0-4100' } });
      const arrayBuffer = await res.arrayBuffer();
      const header = new Uint8Array(arrayBuffer);

      // Check common magic bytes
      // PDF
      if (header[0] === 0x25 && header[1] === 0x50) return "pdf"; // %P
      // PNG
      if (header[0] === 0x89 && header[1] === 0x50) return "image";
      // JPG
      if (header[0] === 0xff && header[1] === 0xd8) return "image";
      // MP4 / MOV
      if (header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79) return "video"; // ftyp
      // MP3
      if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) return "audio"; // ID3
      // WAV
      if (header[0] === 0x52 && header[1] === 0x49) return "audio"; // RIFF

      // Use file-type library as fallback
      const ft = await fileTypeFromBuffer(header);
      if (ft) {
        console.log(`Detected MIME type: ${ft.mime}`);
        if (ft.mime.startsWith("image/")) return "image";
        if (ft.mime.startsWith("video/")) return "video";
        if (ft.mime === "application/pdf") return "pdf";
        if (ft.mime.startsWith("audio/")) return "audio";
        if (ft.mime.startsWith("text/")) return "text";
      }

      return "unknown";
    } catch (err) {
      console.warn("Detection failed:", err);
      return "unknown";
    }
  };


  // Fetch file types for all CIDs (prioritize event data, then metadata, fallback to detection)
  useEffect(() => {
    const fetchFileTypes = async () => {
      const metadataTypes: Record<string, 'image' | 'video' | 'pdf' | 'audio' | 'text' | 'unknown'> = {};
      let hasMetadata = false;

      content.forEach(c => {
        // Priority 1: File types from event data (fastest, stored on-chain)
        if (c.fileTypes && c.fileTypes.length > 0 && c.cids.length === c.fileTypes.length) {
          hasMetadata = true;
          c.cids.forEach((cid, idx) => {
            const type = c.fileTypes![idx] as 'image' | 'video' | 'pdf' | 'audio' | 'text' | 'unknown';
            metadataTypes[cid] = type;
            console.log(`Loaded file type from event: ${cid} -> ${type}`);
          });
          return;
        }

        // Priority 2: File types from JSON payload (legacy)
        const parsed = parseCids(c.ipfs);
        if (Object.keys(parsed.fileTypes).length > 0) {
          hasMetadata = true;
          Object.entries(parsed.fileTypes).forEach(([cid, type]) => {
            const validType = type as 'image' | 'video' | 'pdf' | 'audio' | 'text' | 'unknown';
            metadataTypes[cid] = validType;
            console.log(`Loaded file type from JSON metadata: ${cid} -> ${validType}`);
          });
        }
      });

      // Set metadata types immediately (instant display)
      if (Object.keys(metadataTypes).length > 0) {
        console.log(`Using metadata for ${Object.keys(metadataTypes).length} files`);
        setFileTypes(prev => ({ ...prev, ...metadataTypes }));
      }

      // Only detect types for legacy content without metadata
      if (!hasMetadata) {
        console.log('No metadata found, falling back to file type detection');
        const allCids = content.flatMap(c => c.cids || []);
        const uniqueCids = [...new Set(allCids)];

        for (const cid of uniqueCids) {
          if (!metadataTypes[cid] && !fileTypes[cid]) {
            const type = await detectFileType(cid);
            setFileTypes(prev => ({ ...prev, [cid]: type }));
          }
        }
      }
    };

    if (content.length > 0) {
      fetchFileTypes();
    }
  }, [content]);  // Render file preview based on type
  const renderFilePreview = (cid: string, index: number) => {
    const fileType = fileTypes[cid] || 'unknown';
    const url = walrusBlobUrl(cid) || '';

    switch (fileType) {
      case 'unknown':
        return (
          <div className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-gray-700 font-medium mt-2">Unknown File</p>
            </div>
          </div>
        );
      case 'video':
        return (
          <div className="w-full h-48 bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center relative">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
              <p className="text-sm text-blue-700 font-medium mt-2">Video File</p>
            </div>
          </div>
        );
      case 'pdf':
        return (
          <div className="w-full h-48 bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700 font-medium mt-2">PDF Document</p>
            </div>
          </div>
        );
      case 'audio':
        return (
          <div className="w-full h-48 bg-gradient-to-br from-purple-100 to-pink-200 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
              </svg>
              <p className="text-sm text-purple-700 font-medium mt-2">Audio File</p>
            </div>
          </div>
        );
      case 'text':
        return (
          <div className="w-full h-48 bg-gradient-to-br from-green-100 to-emerald-200 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                <path d="M8 8a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3A.5.5 0 018 8zM8 11a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3A.5.5 0 018 11zM8 14a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3A.5.5 0 018 14z" />
              </svg>
              <p className="text-sm text-green-700 font-medium mt-2">Text File</p>
            </div>
          </div>
        );
      case 'image':
      default:
        return (
          <img
            src={url}
            alt={`Variant ${index}`}
            className="w-full h-48 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
          />
        );
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
          const { primary, list, fileTypes: parsedFileTypes } = parseCids(ipfs);
          const creator = fields?.creator || '';

          // Get file types from event (new) or from ipfs payload (legacy)
          const eventFileTypes = decodeIpfs(fields?.file_types);
          const fileTypesArray = eventFileTypes ? eventFileTypes.split(',') : [];

          return {
            id: fields?.content_id || fields?.contentId,
            title: titleStr,
            description: descStr,
            ipfs: primary,
            cids: list,
            variants: Number.isFinite(variants) && variants > 0 ? variants : 1,
            creator,
            fileTypes: fileTypesArray.length > 0 ? fileTypesArray : Object.values(parsedFileTypes),
          } as { id: string; title: string; description: string; ipfs: string; cids: string[]; variants: number; creator: string; fileTypes?: string[] };
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
          const normalize = (v?: string) =>
            (v || '').trim().toLowerCase().replace(/^0x/, '');

          for (const ev of voteEvents) {
            const f = ev.parsedJson as any;
            const cid = (f?.content_id || f?.contentId || '').toLowerCase();
            if (!ids.includes(cid)) continue;

            // Check if this vote is from current user
            const voter = normalize(f?.voter);
            const user = normalize(account?.address);

            console.log( ' voter :' + voter + ' user: ' + user);
       
            if (voter === user) {
              votedByUser.add(cid);
              console.log(`User has voted on content ${cid}`);
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
  }, [client, account?.address]);


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

    const stored = getZkIdToken();
    const jwt = stored || '';
    // if (!jwt) {
    //   toast.error("zkLogin session not found. Please sign in.");
    //   return;
    // }
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
      <div className="absolute bottom-40 right-1/4 w-80 h-80 bg-blue-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-pink-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>

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
                        <div key={cid + i} className="relative">
                          <button
                            onClick={() => setSelected({ ...selected, [c.id]: i })}
                            className={`group variant-card transition-all duration-400 w-full ${isSelected ? 'selected' : ''}`}
                          >
                            <div className="relative">
                              {renderFilePreview(cid, i)}
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
                          {/* Preview/Open Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = walrusBlobUrl(cid);
                              if (!url) return;

                              const fileType = fileTypes[cid] || 'image';

                              // Create a custom preview page for all file types
                              const getPreviewContent = () => {
                                switch (fileType) {
                                  case 'image':
                                    return '<img src="' + url + '" style="max-width: 100%; height: auto; border-radius: 8px;" alt="Image preview" />';
                                  case 'video':
                                    return '<video controls style="max-width: 100%; height: auto; border-radius: 8px;"><source src="' + url + '" type="video/mp4">Your browser does not support video playback.</video>';
                                  case 'pdf':
                                    return '<iframe src="' + url + '" style="width: 100%; height: 80vh; border: none; border-radius: 8px;"></iframe>';
                                  case 'audio':
                                    return '<audio controls style="width: 100%;"><source src="' + url + '">Your browser does not support audio playback.</audio>';
                                  case 'text':
                                    return '<iframe src="' + url + '" style="width: 100%; height: 80vh; border: 1px solid #ddd; border-radius: 8px; background: white;"></iframe>';
                                  default:
                                    return '<p>Preview not available for this file type.</p><p><a href="' + url + '" target="_blank" style="color: #6366f1; text-decoration: underline;">Open in new tab</a></p>';
                                }
                              };

                              const htmlContent = '<!DOCTYPE html>' +
                                '<html>' +
                                '<head>' +
                                '<title>Preview - ' + fileType.toUpperCase() + '</title>' +
                                '<meta charset="utf-8">' +
                                '<style>' +
                                '* { margin: 0; padding: 0; box-sizing: border-box; }' +
                                'body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; display: flex; flex-direction: column; min-height: 100vh; padding: 20px; }' +
                                '.header { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }' +
                                '.header h2 { color: #333; font-size: 20px; margin-bottom: 8px; }' +
                                '.header p { color: #666; font-size: 13px; word-break: break-all; }' +
                                '.content { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }' +
                                'a { color: #6366f1; text-decoration: none; font-weight: 500; }' +
                                'a:hover { text-decoration: underline; }' +
                                '</style>' +
                                '</head>' +
                                '<body>' +
                                '<div class="header">' +
                                '<h2>Content Preview - ' + fileType.toUpperCase() + '</h2>' +
                                '<p>Blob ID: ' + cid + '</p>' +
                                '</div>' +
                                '<div class="content">' +
                                getPreviewContent() +
                                '</div>' +
                                '</body>' +
                                '</html>';

                              const blob = new Blob([htmlContent], { type: 'text/html' });
                              const blobUrl = URL.createObjectURL(blob);
                              const previewWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');

                              // Clean up the blob URL after window opens
                              if (previewWindow) {
                                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                              }
                            }}
                            className="absolute top-2 left-2 z-10 px-2 py-1 rounded-lg bg-white/90 hover:bg-white text-gray-700 text-xs font-medium shadow-md transition-all duration-200 flex items-center gap-1 hover:scale-105"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            FullScreen
                          </button>
                        </div>
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
                      Private vote (zkLogin)
                    </label>
                    {privateMode[c.id] && (
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
                    )}
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
                    disabled={alreadyVoted.has(c.id.toLowerCase()) || selected[c.id] === undefined || checkingReputation || (!account?.address && !privateMode[c.id])}
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