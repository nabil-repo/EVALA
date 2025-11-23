import { NextResponse } from 'next/server';
import crypto from 'crypto';

const BN254_FIELD_SIZE = BigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617'
);

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { jwt } = body || {};
        if (!jwt || typeof jwt !== 'string') {
            return NextResponse.json({ error: 'Missing jwt' }, { status: 400 });
        }

        const base = process.env.ZK_SALT_SERVICE_URL || 'https://salt.api.mystenlabs.com';
        const url = `${base.replace(/\/$/, '')}/get_salt`;

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jwt }),
            cache: 'no-store',
        });

        if (resp.ok) {
            const data = await resp.json();
            // Still reduce into BN254 field to be 100% safe
            const salt = BigInt(data.salt) % BN254_FIELD_SIZE;
            return NextResponse.json(
                { salt: salt.toString(10) },
                {
                    status: 200,
                    headers: { 'Cache-Control': 'no-store' },
                }
            );
        }

        // Dev fallback: deterministic hash → mod BN254
        const sha = crypto.createHash('sha256').update(jwt).digest('hex');
        const saltBig = BigInt('0x' + sha) % BN254_FIELD_SIZE;

        return NextResponse.json(
            { salt: saltBig.toString(10), fallback: true },
            {
                status: 200,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message || 'Salt proxy error' },
            { status: 500 }
        );
    }
}
