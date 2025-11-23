import { NextResponse } from 'next/server'
import { walrusBlobUrl } from '@/lib/walrus'

type DescribeRequest = {
  cids: string[]
  files?: { name: string; type: string }[]
}

export async function POST(req: Request) {
  try {
    const body: DescribeRequest = await req.json();
    const { cids = [], files = [] } = body;

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
    }

    // Build a prompt that includes inline text for small/text files, and URLs for binaries
    const items: string[] = [];
    for (let i = 0; i < cids.length; i++) {
      const cid = cids[i];
      const url = walrusBlobUrl(cid);
      let summaryPiece = `Blob ${cid} - URL: ${url}`;

      try {
        const head = await fetch(url, { method: 'HEAD' });
        const ct = head.headers.get('content-type') || '';
        const len = parseInt(head.headers.get('content-length') || '0', 10);

        // If text-like or small (< 30 KB), fetch the text content to include
        if (ct.startsWith('text/') || ct.includes('json') || (!ct && len > 0 && len < 30_000)) {
          const fetched = await fetch(url);
          const text = await fetched.text();
          const excerpt = text.length > 3000 ? text.slice(0, 3000) + '\n...[truncated]' : text;
          summaryPiece += `\nContent:\n${excerpt}`;
        } else {
          // include filename if provided
          const f = files[i];
          if (f) summaryPiece += `\nFilename: ${f.name}  Type: ${f.type}`;
        }
      } catch (e) {
        // network error - still include URL
        const f = files[i];
        if (f) summaryPiece += `\nFilename: ${f.name}  Type: ${f.type}`;
      }

      items.push(summaryPiece);
    }

    const prompt = `Files:\n${items.join('\n\n')}`;

    const systemPrompt = `You are a concise captioning assistant. Output ONLY a single valid JSON object mapping blobId -> short description (1-3 sentences). Do not include any explanation, headings, or extra text. Ensure the output is valid JSON.`;

    const openRouterCall = async (model: string) => {
      return fetch('https://api.openrouter.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 400
        })
      });
    };

    const defaultModel = process.env.OPENROUTER_MODEL || 'llama-2-7b-chat';

    // Try primary model
    let orRes = await openRouterCall(defaultModel);
    if (!orRes.ok) {
      // try fallback model once
      const text = await orRes.text();
      // attempt fallback to mistral
      orRes = await openRouterCall(process.env.OPENROUTER_FALLBACK_MODEL || 'mistral-7b-instruct');
      if (!orRes.ok) {
        const text2 = await orRes.text();
        return NextResponse.json({ error: 'OpenRouter calls failed', details: [text, text2] }, { status: 500 });
      }
    }

    const orJson = await orRes.json();
    let assistantText = '';
    try {
      assistantText = orJson.choices?.[0]?.message?.content || orJson.choices?.[0]?.text || '';
    } catch (e) {
      assistantText = '';
    }

    // Try to extract a JSON object from assistantText robustly
    let parsed: Record<string, string> | null = null;
    const extractJson = (s: string): string | null => {
      const first = s.indexOf('{');
      const last = s.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) return s.slice(first, last + 1);
      return null;
    };

    const tryParse = (txt: string) => {
      try {
        const p = JSON.parse(txt);
        if (p && typeof p === 'object') return p as Record<string, string>;
      } catch (_) { }
      return null;
    };

    // Direct parse
    parsed = tryParse(assistantText);
    if (!parsed) {
      const inner = extractJson(assistantText);
      if (inner) parsed = tryParse(inner);
    }

    // If still not parsed, retry once with fallback model (if not already used)
    if (!parsed && defaultModel !== (process.env.OPENROUTER_FALLBACK_MODEL || 'mistral-7b-instruct')) {
      try {
        const retryRes = await openRouterCall(process.env.OPENROUTER_FALLBACK_MODEL || 'mistral-7b-instruct');
        if (retryRes.ok) {
          const rj = await retryRes.json();
          const text = rj.choices?.[0]?.message?.content || rj.choices?.[0]?.text || '';
          parsed = tryParse(text) || tryParse(extractJson(text) || '');
        }
      } catch (_) { }
    }

    // Final fallback: best-effort mapping from assistant text
    if (!parsed) {
      parsed = {};
      for (const cid of cids) parsed[cid] = 'No description available.';
      // attempt to find short snippets around blob ids
      for (const cid of cids) {
        const idx = assistantText.indexOf(cid);
        if (idx !== -1) {
          parsed[cid] = assistantText.slice(idx + cid.length, idx + cid.length + 200).trim() || parsed[cid];
        }
      }
    }

    return NextResponse.json({ summaries: parsed });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
