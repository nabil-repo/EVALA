import { NextResponse } from 'next/server'

type DescribeRequest = {
  title?: string
}

export async function POST(req: Request) {
  try {
    const body: DescribeRequest = await req.json();
    console.log('Describe request body:', body);

    if (!process.env.OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY not configured');
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
    }

    // Use only the provided title for description generation (per request)
    const title = (body as any).title || '';
    const items = [] as string[];
    if (title) {
      items.push(`Title: ${title}`);
    }
    const prompt = `You will be given a content title. Write a concise 1-3 sentence description suitable for a creator to use as the content description for the voters . Return a JSON object with a single key \"title\" mapping to the generated description. Do not include any extra text.\n\n${items.join('\n\n')}`;

    const systemPrompt = `You are a concise captioning assistant. Output ONLY a single valid JSON object mapping blobId -> short description (1-3 sentences). Do not include any explanation, headings, or extra text. Ensure the output is valid JSON.`;

    const openRouterCall = async (model: string) => {
      return fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    //console.log("orRes",orRes)
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
    // console.log('OpenRouter response:', orRes.status, orRes.headers.get('content-type'));

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
      const lines = assistantText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join(':').trim();
          if (key && value) parsed[key] = value;
        }
      }

    }

    return NextResponse.json({ summaries: parsed });
  } catch (e: any) {
    console.error('Describe API error:', e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
