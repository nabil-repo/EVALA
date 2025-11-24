"use client";
import { useState } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { toast } from "sonner";
import { bcs } from "@mysten/sui/bcs";
import { fileTypeFromBuffer } from "file-type";
import { PACKAGE_ID, VOTEBOOK_ID } from "@/lib/config";
import { useIsZkLogin, zkLoginGuardMessage } from "@/lib/zk";
import ZkLoginBanner from "@/components/ZkLoginBanner";
import { useZkSession } from "@/lib/zkSession";
import { walrusPutBlob, walrusBlobUrl } from "@/lib/walrus";

export default function UploadPage() {
  const account = useCurrentAccount();
  const isZk = useIsZkLogin();
  const { isSignedIn: hasZkSession } = useZkSession();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [cid, setCid] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [uploadedCids, setUploadedCids] = useState<string[] | null>(null);
  const [summariesLoading, setSummariesLoading] = useState(false);

  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  // Detect file type from file buffer
  async function detectFileType(file: File): Promise<'image' | 'video' | 'pdf' | 'audio' | 'text' | 'unknown'> {
    try {
      // Check file extension first (fast path)
      const ext = file.name.toLowerCase().split('.').pop() || '';
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
      if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
      if (ext === 'pdf') return 'pdf';
      if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio';
      if (['txt', 'md', 'json', 'xml', 'csv', 'log', 'yml', 'yaml'].includes(ext)) return 'text';

      // Use magic bytes detection
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const fileType = await fileTypeFromBuffer(uint8Array);

      if (fileType) {
        if (fileType.mime.startsWith('image/')) return 'image';
        if (fileType.mime.startsWith('video/')) return 'video';
        if (fileType.mime === 'application/pdf') return 'pdf';
        if (fileType.mime.startsWith('audio/')) return 'audio';
        if (fileType.mime.startsWith('text/')) return 'text';
      }

      return 'unknown';
    } catch (e) {
      console.warn('Failed to detect file type:', e);
      return 'unknown';
    }
  }

  async function uploadAllToWalrus(files: FileList): Promise<Array<{ blobId: string; type: string; name: string }>> {
    const results: Array<{ blobId: string; type: string; name: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      const fileType = await detectFileType(f);
      const res = await walrusPutBlob(f, 1);

      results.push({ blobId: res.blobId, type: fileType, name: f.name });
    }
    return results;
  }

  async function onUpload() {
    if (!files || files.length < 1) {
      toast.error("Please select at least one file");
      return;
    }

    // Validate file count
    if (files.length > 5) {
      toast.error("Maximum 5 files allowed");
      return;
    }

    // Validate file sizes (max 10MB per file)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File "${file.name}" exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        return;
      }
    }

    try {
      const uploadToast = toast.loading("Uploading to Walrus storage...");

      // Upload all files with type detection
      const results = await uploadAllToWalrus(files);
      const primaryCid = results[0].blobId;

      // Store only CIDs array in payload (file types go to event)
      // This keeps payload under 200 bytes for on-chain storage
      const ipfsPayload = JSON.stringify(results.map(r => r.blobId));

      // Create comma-separated file types string for on-chain event
      const fileTypesString = results.map(r => r.type).join(',');

      console.log('Payload length:', ipfsPayload.length, 'bytes');
      console.log('File types:', fileTypesString);

      setCid(primaryCid);
      toast.loading(`Stored on Walrus (x${results.length}). Submitting on-chain...`, { id: uploadToast });

      if (!PACKAGE_ID) throw new Error('Missing NEXT_PUBLIC_PACKAGE_ID');
      if (!VOTEBOOK_ID) throw new Error('NEXT_PUBLIC_VOTEBOOK_ID is not set. Run init script.');

      const tx = new Transaction();

      tx.moveCall({
        target: `${PACKAGE_ID}::EvalaContent::register_content_v2_indexed`,
        arguments: [
          tx.pure.string(title || 'Untitled'),
          tx.pure.string(desc || ''),
          tx.pure.string(ipfsPayload),
          tx.pure.u64(results.length),
          tx.pure.string(fileTypesString),
          tx.object(VOTEBOOK_ID),
        ],
      });

      const res = await signAndExecute({ transaction: tx, chain: 'sui:devnet' });
      toast.success(`Registered on-chain! Digest: ${(res as any)?.digest ?? 'ok'}`, { id: uploadToast });
    } catch (e: any) {
      console.error('Upload error:', e);
      toast.error(e?.message || String(e));
    }
  }

  async function generateDescriptions() {


    setSummariesLoading(true);
    try {


      const resp = await fetch('/api/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'Untitled' }),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        toast.error(`Describe failed: ${resp.status}`);
        console.warn('describe failed', txt);
        console.log('r', resp, txt);
        return;
      }
      const data = await resp.json();
      setSummaries(data.summaries || {});
      toast.success('Descriptions generated');
    } catch (e: any) {
      console.error('generateDescriptions error', e);
      toast.error(e?.message || 'Failed to generate descriptions');
    } finally {
      setSummariesLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8 relative overflow-hidden">
      {/* Animated Ambient Glows */}
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-purple-400 rounded-full opacity-10 blur-3xl animate-pulse"></div>
      <div className="absolute bottom-40 right-1/4 w-80 h-80 bg-blue-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-pink-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="max-w-3xl mx-auto relative z-10 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-display-sm gradient-text">Upload Content</h1>
          {/* <p className="text-gray-600 font-light">
            Connected: <span className="font-medium text-gray-800">{account?.address ? `${account.address.slice(0, 8)}...${account.address.slice(-6)}` : "Not connected"}</span>
          </p> */}
        </div>

        {/* <ZkLoginBanner /> */}

        {/* Upload Form Card */}
        <div className="neuro-card space-y-6">
          <div>
            <label className="block mb-3 font-medium text-gray-700 text-sm">Content Title</label>
            <input
              className="neuro-input text-gray-800"
              placeholder="My awesome content"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-3 font-medium text-gray-700 text-sm">Description</label>
            <textarea
              className="neuro-input text-gray-800 resize-none"
              placeholder="Describe your content variants..."
              rows={3}
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
            <div className="flex gap-3 mt-2">
              <button
                onClick={generateDescriptions}
                disabled={!title || title.length === 0 || summariesLoading}
                className="text-blue-800 neuro-btn bg-gradient-to-r from-fuchsia-400 to-sky-300  text-sm px-3 py-2"
              >
                {summariesLoading ? 'Generating...' : 'Generate AI Description'}
              </button>
              <button
                onClick={() => {
                  const keys = Object.keys(summaries || {});
                  if (keys.length > 0) setDesc(summaries[keys[0]] || '');
                  else toast('No generated summaries yet');
                }}
                disabled={Object.keys(summaries).length === 0}
                className="neuro-btn text-sm px-3 py-2"
              >
                Use Top Summary
              </button>
            </div>
          </div>

          <div>
            <label className="block mb-3 font-medium text-gray-700 text-sm">Upload Files (images, pdf, txt, json, mp4, etc.)</label>
            <p className="text-xs text-gray-500 mb-2">Maximum 5 files, 10MB per file</p>
            <div className="relative">
              <input
                type="file"
                multiple
                id="file-upload"
                className="hidden"
                onChange={(e) => {
                  const selectedFiles = e.target.files;
                  if (selectedFiles && selectedFiles.length > 5) {
                    toast.error("Maximum 5 files allowed");
                    e.target.value = '';
                    return;
                  }
                  setFiles(selectedFiles);
                }}
              />
              <label
                htmlFor="file-upload"
                className="neuro-btn w-full cursor-pointer text-center flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Choose Files (2-5 variants)
              </label>
            </div>
            {files && files.length > 0 && (
              <div className="mt-4 glass-panel space-y-3">
                <p className="text-sm text-gray-700 font-medium mb-2">{files.length} file(s) selected</p>
                <div className="flex flex-wrap gap-3">
                  {Array.from(files).map((file, i) => {
                    const isImage = file.type.startsWith('image/');
                    const fileSizeMB = file.size / 1024 / 1024;
                    const isOverLimit = fileSizeMB > 10;
                    return (
                      <div key={i} className={`w-32 ${isOverLimit ? 'ring-2 ring-red-400' : ''}`}>
                        <div className="h-20 w-full rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
                          {isImage ? (
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="object-cover w-full h-full"
                              onError={(e) => { (e.target as HTMLImageElement).style.objectFit = 'contain'; }}
                            />
                          ) : (
                            <div className="text-xs text-center px-2">
                              <div className="font-medium">{file.name.length > 20 ? file.name.slice(0, 18) + '…' : file.name}</div>
                              <div className="text-xs text-gray-500">{file.type || 'binary'}</div>
                            </div>
                          )}
                        </div>
                        <div className={`text-xs text-center mt-1 ${isOverLimit ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                          {fileSizeMB >= 1 ? `${fileSizeMB.toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`}
                          {isOverLimit && ' ⚠️'}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {Array.from(files).some(f => f.size > 10 * 1024 * 1024) && (
                  <p className="text-xs text-red-600 font-medium mt-2">⚠️ One or more files exceed 10MB limit</p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={onUpload}
            disabled={!account || !files || files.length <= 1 || title.length === 0 || desc.length === 0}
            className="neuro-btn-primary w-full text-base font-semibold"
          >
            Upload to Walrus & Register On-Chain
          </button>
        </div>

        {/* Walrus Result */}
        {cid && (
          <div className="neuro-card space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-800">Successfully Uploaded!</p>
                <p className="text-xs text-gray-600">Blob ID: <code className="bg-gray-100 px-2 py-0.5 rounded">{cid}</code></p>
              </div>
            </div>
            <a
              href={`https://walruscan.com/testnet/blob/${cid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="neuro-btn text-sm w-full text-center inline-block"
            >
              View on Walrus Aggregator →
            </a>
          </div>
        )}

        {/* Auto-generated summaries */}
        {summariesLoading && (
          <div className="glass-panel py-4 text-center">
            <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-purple-600 rounded-full animate-spin"></div>
            <div className="mt-2 text-sm text-gray-600">Generating descriptions...</div>
          </div>
        )}

        {Object.keys(summaries).length > 0 && (
          <div className="neuro-card space-y-3">
            <h3 className="text-lg font-semibold">Auto-generated descriptions</h3>
            <div className="space-y-2">
              {Object.entries(summaries).map(([blobId, text]) => (
                <div key={blobId} className="glass-panel p-3 rounded-md flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 mb-1">{blobId}</div>
                    <div className="text-sm text-gray-800">{text}</div>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      className="neuro-btn text-sm px-2 py-1"
                      onClick={() => setDesc(text)}
                    >
                      Use
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Setup Warning */}
        {!process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL && (
          <div className="glass-panel border-2 border-yellow-300">
            <div className="flex gap-3">
              <div className="text-yellow-600 text-sm font-semibold">WARNING</div>
              <div className="text-sm text-gray-700">
                <strong className="font-semibold">Setup Required:</strong> Add your Pinata JWT to <code className="bg-yellow-100 px-1.5 py-0.5 rounded">.env.local</code>
                <br />
                <span>Set NEXT_PUBLIC_WALRUS_PUBLISHER_URL and NEXT_PUBLIC_WALRUS_AGGREGATOR_URL.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
