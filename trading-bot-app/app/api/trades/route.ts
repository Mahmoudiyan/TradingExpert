import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const symbol = searchParams.get('symbol')

    const trades = await prisma.trade.findMany({
      where: symbol ? { symbol } : {},
      orderBy: { openedAt: 'desc' },
      take: limit,
    })

    return NextResponse.json(trades)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

