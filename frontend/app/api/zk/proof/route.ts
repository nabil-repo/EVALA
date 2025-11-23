import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function POST(req: Request) {
    try {
        const payload = await req.json().catch(() => ({}));
        const proverUrl = process.env.ZK_PROVER_URL;
        if (proverUrl) {
            console.log('Prover request to', proverUrl, JSON.stringify(payload, null, 2));
            const tryUrls = [proverUrl.replace(/\/$/, '')];
            // If localhost is used, also try 127.0.0.1 for IPv4-only environments
            if (/^https?:\/\/localhost(?::\d+)?\//.test(proverUrl)) {
                tryUrls.push(proverUrl.replace('localhost', '127.0.0.1').replace(/\/$/, ''));
            }
            let lastErr: any = null;
            for (const url of tryUrls) {
                try {
                    const resp = await fetch(url, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify(payload),
                        cache: 'no-store',
                    });
                    const text = await resp.text();
                    console.log('Prover response:', url, resp.status, text.slice(0, 200));
                    let data: any = null;
                    try { data = JSON.parse(text); } catch { data = { raw: text }; }
                    if (!resp.ok) {
                        return NextResponse.json({ error: 'Prover failed', details: data, status: resp.status }, { status: 500 });
                    }
                    return NextResponse.json(data, { status: 200, headers: { 'Cache-Control': 'no-store' } });
                } catch (e: any) {
                    lastErr = e;
                    console.error('Fetch to prover failed for', url, e?.message || e);
                    continue;
                }
            }
            return NextResponse.json({ error: 'Fetch to prover failed', message: lastErr?.message || String(lastErr) }, { status: 500 });
        }

        // Local Groth16 prover fallback (requires circuit artifacts)
        const wasmPath = process.env.ZK_GROTH16_WASM_PATH;
        const zkeyPath = process.env.ZK_GROTH16_ZKEY_PATH;
        if (wasmPath && zkeyPath) {
            const witnessInput = payload?.witnessInput;
            if (!witnessInput || typeof witnessInput !== 'object') {
                return NextResponse.json({
                    error: 'Missing witnessInput for local prover',
                    hint: 'POST { witnessInput: {...} } with circuit-specific inputs',
                }, { status: 400 });
            }
            // Dynamically import snarkjs in Node runtime
            // Use require to avoid TS typing issues in Next server runtime
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const snarkjs = require('snarkjs');
            const { proof, publicSignals } = await snarkjs.groth16.fullProve(witnessInput, wasmPath, zkeyPath);
            // Return in a generic structure under `inputs` so the client can pass to getZkLoginSignature
            return NextResponse.json({ inputs: { proof, publicSignals } }, { status: 200 });
        }

        return NextResponse.json({ error: 'No prover configured', setup: 'Set ZK_PROVER_URL or ZK_GROTH16_WASM_PATH + ZK_GROTH16_ZKEY_PATH' }, { status: 501 });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'ZKP proxy error' }, { status: 500 });
    }
}
