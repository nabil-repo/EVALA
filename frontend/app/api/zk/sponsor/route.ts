import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const sponsorUrl = process.env.ZK_SPONSOR_URL;
    if (!sponsorUrl) {
      return NextResponse.json({ error: 'ZK_SPONSOR_URL not configured' }, { status: 501 });
    }

    const resp = await fetch(sponsorUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const text = await resp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return NextResponse.json(data, {
      status: resp.ok ? 200 : resp.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Sponsor proxy error' }, { status: 500 });
  }
}
