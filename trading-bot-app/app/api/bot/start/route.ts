import { NextResponse } from 'next/server'
import { tradingBot } from '@/lib/trading-bot'

export async function POST() {
  try {
    // Bot will automatically determine check interval based on configured timeframe
    await tradingBot.start()
    return NextResponse.json({ success: true, message: 'Bot started' })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to start bot'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

