"use client";

import { useRouter } from "next/navigation";
import { clearZkIdToken, useZkSession, setEphemeralKeypair, setRandomness, setMaxEpoch } from "@/lib/zkSession";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateNonce } from "@mysten/sui/zklogin";
import { SuiClient } from "@mysten/sui/client";
import { toB64 } from "@mysten/sui/utils";
import { zkLoginAddress } from "@/lib/zkloginExec";

function getRedirectUri() {
    return process.env.NEXT_PUBLIC_ZK_REDIRECT_URI || (typeof window !== 'undefined' ? `${window.location.origin}/zk/callback` : "");
}

async function buildGoogleAuthUrl() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
    const redirectUri = getRedirectUri();
    const scope = encodeURIComponent("openid email profile");
    const state = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);

    // Generate ephemeral keypair and randomness
    const ephemeralKeypair = Ed25519Keypair.generate();
    const ephPub = ephemeralKeypair.getPublicKey();

    // Get current epoch and compute maxEpoch
    const client = new SuiClient({ url: process.env.NEXT_PUBLIC_SUI_RPC_URL || 'https://fullnode.devnet.sui.io:443' });
    const systemState = await client.getLatestSuiSystemState();
    const currentEpoch = Number(systemState.epoch);
    const maxEpoch = currentEpoch + 2;

        // Generate randomness as 8 raw bytes, store as base64; compute BigInt (big-endian) for nonce
        const randomnessBytes = new Uint8Array(8);
        crypto.getRandomValues(randomnessBytes);
        let randomness = 0n;
        for (const b of randomnessBytes) randomness = (randomness << 8n) | BigInt(b);

    // Compute nonce from ephemeral key, maxEpoch, and randomness
    const nonce = generateNonce(ephPub, maxEpoch, randomness);

    // Store ephemeral keypair (secret key) as base64; handle SDKs returning string or Uint8Array
    const skAny: any = ephemeralKeypair.getSecretKey() as any;
    const skB64: string = typeof skAny === 'string' ? skAny : toB64(skAny as Uint8Array);
    setEphemeralKeypair(skB64);
        setRandomness(toB64(randomnessBytes));
    setMaxEpoch(maxEpoch);

    // Implicit flow for id_token
    return `https://accounts.google.com/o/oauth2/v2/auth?response_type=id_token&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&nonce=${nonce}&state=${state}`;
}

type Props = { compact?: boolean };

export default function ZkLoginBanner({ compact = false }: Props) {
    const { isSignedIn } = useZkSession();
    const router = useRouter();
    const hasClientId = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    const containerClass = compact
        ? "flex items-center"
        : "glass-panel flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3";

    const btnClass = compact
        ? "neuro-btn h-10 px-4 py-2 text-sm disabled:opacity-60"
        : "neuro-btn text-sm disabled:opacity-60";

    return (
        <div className={containerClass}>
            {!compact && (
                <div className="text-sm text-gray-700 flex-1" />
            )}
            <div className="flex items-center gap-2 text-center">
                {!isSignedIn ? (
                    <button
                        className={btnClass}
                        onClick={async () => {
                            const url = await buildGoogleAuthUrl();
                            if (!url) return;
                            window.location.href = url;
                        }}
                        disabled={!hasClientId}
                        title={!hasClientId ? "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local" : undefined}
                    >
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            zkLogin
                        </div>
                    </button>
                ) : (
                    <button
                        className={btnClass}
                        onClick={() => {
                            clearZkIdToken();
                            router.refresh();
                        }}
                    >
                        Sign out 
                    </button>
                )}
            </div>
        </div>
    );
}
