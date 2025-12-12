import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const logsLimit = parseInt(searchParams.get('logsLimit') || '20')
    const tradesLimit = parseInt(searchParams.get('tradesLimit') || '5')

    const [status, config, logs, trades] = await Promise.all([
      prisma.botStatus.findUnique({
        where: { id: 'main' },
      }),
      prisma.botConfig.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.botLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: logsLimit,
      }),
      prisma.trade.findMany({
        orderBy: { openedAt: 'desc' },
        take: tradesLimit,
      }),
    ])

    return NextResponse.json({
      status,
      config,
      logs,
      trades,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch monitoring data'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

