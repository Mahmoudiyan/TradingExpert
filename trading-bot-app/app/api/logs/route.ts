import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')
    const level = searchParams.get('level')

    const logs = await prisma.botLog.findMany({
      where: level ? { level } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json(logs)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch logs'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

