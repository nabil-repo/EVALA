"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setZkIdToken } from "@/lib/zkSession";
import { zkLoginAddress } from "@/lib/zkloginExec";

function parseIdTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  // Look in hash (#id_token=...) and query (?id_token=...)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const q = new URLSearchParams(window.location.search);
  return hash.get('id_token') || q.get('id_token');
}

export default function ZkCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Processing zkLogin response...");

  useEffect(() => {
    const token = parseIdTokenFromUrl();
    if (!token) {
      setStatus("No id_token found in callback URL");
      return;
    }
    (async () => {
      try {
        setZkIdToken(token);
        // Compute and log the zkLogin address
        const address = await zkLoginAddress(token);
        // console.log('zkLogin Address:', address);
        setStatus(`Authentication successful. Address: ${address.slice(0, 8)}...${address.slice(-6)}`);
        setTimeout(() => router.push('/'), 2000);
      } catch (e) {
        console.error(e);
        setStatus("Failed to store zkLogin token");
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="glass-panel">
        <p className="text-gray-800 font-medium">{status}</p>
      </div>
    </main>
  );
}
