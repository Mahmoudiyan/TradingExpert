import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    let status = await prisma.botStatus.findUnique({
      where: { id: 'main' },
    })

    if (!status) {
      status = await prisma.botStatus.create({
        data: { id: 'main' },
      })
    }

    return NextResponse.json(status)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

