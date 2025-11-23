import { WALRUS_PUBLISHER_URL, WALRUS_AGGREGATOR_URL } from './config';

export type WalrusUploadResult = { blobId: string; endEpoch?: number; suiObjectId?: string };

function requirePublisher() { if (!WALRUS_PUBLISHER_URL) throw new Error('NEXT_PUBLIC_WALRUS_PUBLISHER_URL not configured'); }

// PUT to /v1/blobs?epochs={n}&send_object_to={optional}
export async function walrusPutBlob(file: Blob, epochs = 1, sendToAddress?: string): Promise<WalrusUploadResult> {
  requirePublisher();
  const base = WALRUS_PUBLISHER_URL.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('epochs', String(epochs));
  if (sendToAddress) params.set('send_object_to', sendToAddress);
  const url = `${base}/v1/blobs?${params.toString()}`;

  const res = await fetch(url, { method: 'PUT', body: file });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Walrus PUT failed: ${res.status} ${text}`);
  }
  const info = await res.json();
  if (info?.alreadyCertified) {
    return { blobId: info.alreadyCertified.blobId, endEpoch: info.alreadyCertified.endEpoch };
  }
  if (info?.newlyCreated?.blobObject) {
    return {
      blobId: info.newlyCreated.blobObject.blobId,
      endEpoch: info.newlyCreated.blobObject.storage?.endEpoch,
      suiObjectId: info.newlyCreated.blobObject.id,
    };
  }
  throw new Error('Unexpected Walrus response format');
}

export async function walrusUploadJSON(obj: any, epochs = 1, sendToAddress?: string): Promise<WalrusUploadResult> {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  return walrusPutBlob(blob, epochs, sendToAddress);
}

export function walrusBlobUrl(blobId: string): string {
  if (!WALRUS_AGGREGATOR_URL) return '';
  return `${WALRUS_AGGREGATOR_URL.replace(/\/$/, '')}/v1/blobs/${blobId}`;
}
