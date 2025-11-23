import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  // TODO: fetch on-chain votes via Sui RPC and compute majority/stats
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const content = 'Variant 2 leads with strong preference; colors likely drive engagement.'
  try {
    const completion = await openai.chat.completions.create({
      model: 'openai/gpt-oss-20b:free',
      messages: [
        { role: 'system', content: 'You are a helpful evaluator for creative A/B tests.' },
        { role: 'user', content: `Summarize these voting insights for the creator: ${content}` }
      ],
      temperature: 0.6,
      max_tokens: 120
    })
    const summary = completion.choices[0]?.message?.content ?? content
    return NextResponse.json({ summary })
  } catch (e:any) {
    return NextResponse.json({ summary: content, error: String(e?.message || e) }, { status: 200 })
  }
}
