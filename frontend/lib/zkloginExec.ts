// Using `any` for SuiClient to stay compatible with dapp-kit hook instance
type AnySuiClient = any;
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toB64, fromB64 } from '@mysten/sui/utils';
import {
    generateNonce,
    getExtendedEphemeralPublicKey,
    getZkLoginSignature,
    jwtToAddress,
} from '@mysten/sui/zklogin';

type ProverUrls = {
    gatewayUrl: string;
    relayUrl: string;
};

async function fetchSalt(jwt: string): Promise<string> {
    // Prefer same-origin API proxy to avoid CORS in browser
    const api = process.env.NEXT_PUBLIC_ZK_SALT_API || '/api/zk/salt';
    try {
        const res = await fetch(api, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jwt }),
        });
        if (!res.ok) throw new Error(`Salt service error: ${res.status}`);
        const data = await res.json();
        if (!data?.salt) throw new Error('Salt not returned');
        return data.salt;
    } catch (e) {
        // Dev fallback: derive a deterministic salt from the JWT locally
        console.warn('Salt service unavailable, using dev salt fallback:', e);
        const enc = new TextEncoder().encode(jwt);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        const hex = Array.from(new Uint8Array(buf))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        // Convert hex to decimal string and ensure it's within BN254 field
        const BN254_FIELD_SIZE = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
        const saltBigInt = BigInt('0x' + hex) % BN254_FIELD_SIZE;
        return saltBigInt.toString(10);
    }
}

async function getCurrentEpoch(client: AnySuiClient): Promise<number> {
    const state = await client.getLatestSuiSystemState();
    return Number(state.epoch);
}

export async function executeWithZkLogin(opts: {
    client: AnySuiClient;
    tx: Transaction;
    jwt: string; // id_token from zk session
    maxEpochOffset?: number; // default +2 epochs
    proverGatewayUrl?: string; // optional override
    proverRelayUrl?: string; // optional override
    fundIfNeeded?: boolean; // devnet convenience: auto-fund via faucet if no coins
    useSponsor?: boolean; // prefer sponsor flow over faucet
    sponsorAddress?: string; // explicit sponsor gas owner address (otherwise use env)
}) {
    const { client, tx, jwt, fundIfNeeded = false, useSponsor = false } = opts;

    const jwtPayload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
    const aud = (jwtPayload?.aud && (Array.isArray(jwtPayload.aud) ? jwtPayload.aud[0] : jwtPayload.aud)) || 'sui';

    const userSalt = await fetchSalt(jwt);

    // Retrieve stored ephemeral keypair, randomness, and maxEpoch from OAuth flow
    const { getEphemeralKeypair, getRandomness, getMaxEpoch } = await import('@/lib/zkSession');
    const storedKeypair = getEphemeralKeypair();
    const storedRandomness = getRandomness();
    const storedMaxEpoch = getMaxEpoch();

    if (!storedKeypair || !storedRandomness || !storedMaxEpoch) {
        throw new Error('zkLogin session expired. Please sign in again.');
    }

    // Restore ephemeral keypair: handle bech32 (suiprivkey...) or base64-encoded raw key
    const eph = storedKeypair.startsWith('suiprivkey')
        ? Ed25519Keypair.fromSecretKey(storedKeypair as any)
        : Ed25519Keypair.fromSecretKey(fromB64(storedKeypair));
    const ephPub = eph.getPublicKey();
    // Randomness: prefer base64(8 bytes) -> BigInt; fallback from decimal string (legacy)
    let randBytes: Uint8Array | null = null;
    try {
        const b = fromB64(storedRandomness);
        if (b.length === 8) randBytes = b;
    } catch { }
    if (!randBytes) {
        // Legacy decimal BigInt fallback -> convert to 8-byte big-endian
        const dec = BigInt(storedRandomness);
        const buf = new Uint8Array(8);
        let t = dec;
        for (let i = 7; i >= 0; i--) { buf[i] = Number(t & 0xffn); t >>= 8n; }
        randBytes = buf;
    }
    let randomness = 0n;
    for (const b of randBytes) randomness = (randomness << 8n) | BigInt(b);
    const maxEpoch = storedMaxEpoch;
    const nonce = generateNonce(ephPub, maxEpoch, randomness);

    // Derive zkLogin address from JWT and salt
    const zkAddress = await zkLoginAddress(jwt, userSalt);
    console.log('zkLogin Address:', zkAddress);
    // Set sender for transaction
    tx.setSender(zkAddress);

    // If sponsor flow is enabled and sponsor address is provided/configured, set gas owner to sponsor
    const sponsorAddress = opts.sponsorAddress || process.env.NEXT_PUBLIC_ZK_SPONSOR_ADDRESS;
    const sponsorApi = process.env.NEXT_PUBLIC_ZK_SPONSOR_API || '/api/zk/sponsor';
    const shouldSponsor = useSponsor || !!sponsorAddress;
    if (shouldSponsor && sponsorAddress) {
        tx.setGasOwner(sponsorAddress);
    }

    // Optional dev convenience: auto-fund if no SUI coins (only when not using sponsor)
    if (fundIfNeeded && !shouldSponsor) {
        try {
            const coins = await client.getCoins({ owner: zkAddress, coinType: '0x2::sui::SUI', limit: 1 });
            if (!coins?.data?.length) {
                const faucetApi = process.env.NEXT_PUBLIC_ZK_FAUCET_API || '/api/zk/faucet';
                await fetch(faucetApi, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ address: zkAddress }),
                });
                // Poll balance up to ~5s
                for (let i = 0; i < 5; i++) {
                    await new Promise((r) => setTimeout(r, 1000));
                    const chk = await client.getCoins({ owner: zkAddress, coinType: '0x2::sui::SUI', limit: 1 });
                    if (chk?.data?.length) break;
                }
            }
        } catch (e) {
            console.warn('Faucet auto-fund failed:', e);
        }
    }

    // Build bytes
    const txBytes = await tx.build({ client });

    // Optionally request ZKP inputs from backend to avoid CORS
    let inputs: any | undefined;
    const proofApi = process.env.NEXT_PUBLIC_ZK_PROOF_API || '/api/zk/proof';
    try {
        // Convert salt (decimal string) to 16-byte Base64 for prover
        const saltBigInt = BigInt(userSalt);
        const saltBytes = new Uint8Array(16);
        let temp = saltBigInt;
        for (let i = 15; i >= 0; i--) {
            saltBytes[i] = Number(temp & BigInt(0xff));
            temp >>= BigInt(8);
        }
        const saltBase64 = toB64(saltBytes);

        const resp = await fetch(proofApi, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                jwt,
                salt: saltBase64,
                maxEpoch: maxEpoch.toString(),
                // Prover expects base64(8 bytes) randomness
                jwtRandomness: toB64(randBytes),
                extendedEphemeralPublicKey: getExtendedEphemeralPublicKey(ephPub),
                keyClaimName: 'sub',
            }),
        });
        if (!resp.ok) {
            throw new Error(`ZKP proxy error: ${resp.status}`);
        }
        inputs = await resp.json();
        if (!inputs || typeof inputs !== 'object') {
            throw new Error('ZKP proxy returned empty inputs');
        }
    } catch (e) {
        throw new Error('zkLogin prover not available. Configure ZK_PROVER_URL and try again.');
    }

    // Create zkLogin signature wrapper (uses backend-provided inputs when available)
    const userSignature = toB64(await eph.sign(txBytes));
    const zkLoginSignature = getZkLoginSignature({ inputs, maxEpoch, userSignature });

    // Sponsor signature (optional)
    if (shouldSponsor) {
        // Expect backend to return { sponsorSignature: base64String } or similar
        const resp = await fetch(sponsorApi, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ txBytes: toB64(txBytes), sender: zkAddress }),
        });
        if (!resp.ok) {
            throw new Error(`Sponsor error: ${resp.status}`);
        }
        const data = await resp.json();
        const sponsorSignature = data?.sponsorSignature || data?.signature || data?.sig;
        if (!sponsorSignature) throw new Error('Sponsor signature missing in response');
        return client.executeTransactionBlock({
            transactionBlock: txBytes,
            signature: [zkLoginSignature as any, sponsorSignature],
            options: { showEffects: true, showEvents: true },
        });
    }

    // Execute with only user signature (no sponsor)
    return client.executeTransactionBlock({ transactionBlock: txBytes, signature: zkLoginSignature as any, options: { showEffects: true, showEvents: true } });
}

export async function zkLoginAddress(jwt: string, salt?: string): Promise<string> {
    const s = salt ?? (await fetchSalt(jwt));
    return jwtToAddress(jwt, s);
}
