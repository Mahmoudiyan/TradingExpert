import { NextResponse } from 'next/server'
import { tradingBot } from '@/lib/trading-bot'

export async function POST() {
  try {
    await tradingBot.stop()
    return NextResponse.json({ success: true, message: 'Bot stopped' })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to stop bot'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

