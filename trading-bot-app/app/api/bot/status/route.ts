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
  } catch (error: unknown) {
    console.error('Bot status error:', error)
    
    // Extract detailed error message
    let errorMessage = 'Failed to fetch bot status'
    let errorDetails = 'Unknown error'
    
    if (error instanceof Error) {
      errorMessage = error.message
      errorDetails = error.toString()
      if (error.stack) {
        console.error('Error stack:', error.stack)
      }
    } else if (typeof error === 'string') {
      errorMessage = error
      errorDetails = error
    } else {
      errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    }
    
    // Check for common database connection errors
    if (errorMessage.includes('P1001') || errorMessage.includes('Can\'t reach database')) {
      errorMessage = 'Database connection failed. Please check your DATABASE_URL and ensure the database is running.'
    } else if (errorMessage.includes('P1012') || errorMessage.includes('Environment variable')) {
      errorMessage = 'Database configuration error. Please check your DATABASE_URL environment variable.'
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      },
      { status: 500 }
    )
  }
}

