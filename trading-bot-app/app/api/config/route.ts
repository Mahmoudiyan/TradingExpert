import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const configs = await prisma.botConfig.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(configs)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    const config = await prisma.botConfig.upsert({
      where: {
        symbol_timeframe: {
          symbol: body.symbol,
          timeframe: body.timeframe,
        },
      },
      update: body,
      create: body,
    })

    return NextResponse.json(config)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

