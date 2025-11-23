import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { address } = await req.json().catch(() => ({}));
    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'Missing address' }, { status: 400 });
    }

    const rawUrl = process.env.SUI_FAUCET_URL || 'https://faucet.sui.io/';
    const base = rawUrl.endsWith('/') ? rawUrl : rawUrl + '/';
    // Most faucets expect POST to /gas
    const faucetUrl = base.endsWith('gas/') ? base : base + 'gas';

    const network = process.env.SUI_NETWORK || process.env.NEXT_PUBLIC_SUI_NETWORK || 'devnet';

    // Try Sui faucet fixed amount schema first
    const attempts = [
      { body: { FixedAmountRequest: { recipient: address }, network } },
      { body: { FixedAmountRequest: { recipient: address }, targetNetwork: network } },
      { body: { recipient: address, network } },
      { body: { Recipient: address, network } },
      { body: { address, network } },
      { body: { FixedAmountRequest: { recipient: address } } },
    ];

    let lastStatus = 500;
    let lastText = '';
    for (const attempt of attempts) {
      const resp = await fetch(faucetUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify(attempt.body),
        cache: 'no-store',
      });
      lastStatus = resp.status;
      lastText = await resp.text();
      if (resp.ok) {
        try {
          const data = JSON.parse(lastText);
          return NextResponse.json(data, { status: 200 });
        } catch {
          return NextResponse.json({ ok: true, raw: lastText }, { status: 200 });
        }
      }
    }

    return NextResponse.json({ error: 'Faucet request failed', status: lastStatus, raw: lastText }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Faucet proxy error' }, { status: 500 });
  }
}
