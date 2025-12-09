import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const configs = await prisma.botConfig.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(configs)
  } catch (error: any) {
    console.error('Config GET error:', error)
    console.error('Error stack:', error.stack)
    
    // Extract detailed error message
    let errorMessage = 'Failed to fetch configuration'
    let errorDetails = 'Unknown error'
    
    if (error.message) {
      errorMessage = error.message
      errorDetails = error.toString()
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
    console.error('Config POST error:', error)
    console.error('Error stack:', error.stack)
    
    // Extract detailed error message
    let errorMessage = 'Failed to save configuration'
    let errorDetails = 'Unknown error'
    
    if (error.message) {
      errorMessage = error.message
      errorDetails = error.toString()
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

