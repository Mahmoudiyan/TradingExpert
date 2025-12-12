import { NextResponse } from 'next/server'
import { tradingBot } from '@/lib/trading-bot'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const closeOpenTrades = body.closeOpenTrades === true

    await tradingBot.stop(closeOpenTrades)
    
    const message = closeOpenTrades 
      ? 'Bot stopped and open trades closed'
      : 'Bot stopped (open trades remain active)'
    
    return NextResponse.json({ success: true, message })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to stop bot'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

