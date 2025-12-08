import { NextResponse } from 'next/server'
import { tradingBot } from '@/lib/trading-bot'

export async function POST() {
  try {
    await tradingBot.start(15) // Check every 15 minutes
    return NextResponse.json({ success: true, message: 'Bot started' })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

