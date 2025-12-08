import { NextResponse } from 'next/server'
import { tradingBot } from '@/lib/trading-bot'

export async function POST() {
  try {
    await tradingBot.stop()
    return NextResponse.json({ success: true, message: 'Bot stopped' })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

