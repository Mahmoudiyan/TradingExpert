import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { tradingBot } from '@/lib/trading-bot'

export async function GET() {
  try {
    const configs = await prisma.botConfig.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(configs)
  } catch (error: unknown) {
    console.error('Config GET error:', error)
    
    // Extract detailed error message
    let errorMessage = 'Failed to fetch configuration'
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

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Filter out fields that don't exist in the Prisma schema
    // Only include fields that are defined in BotConfig model
    const allowedFields = [
      'exchange',
      'symbol',
      'fastMA',
      'slowMA',
      'timeframe',
      'riskPercent',
      'stopLossPips',
      'takeProfitPips',
      'maxDailyLoss',
      'maxDailyProfit',
      'maxSpreadPips',
      'maxBalancePercent',
      'allowBuy',
      'allowSell',
      'isActive',
      'strategyType', // Strategy type for backtesting
    ]
    
    const filteredBody = Object.keys(body)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = body[key]
        return obj
      }, {} as Record<string, unknown>)
    
    const config = await prisma.botConfig.upsert({
      where: {
        symbol_timeframe: {
          symbol: filteredBody.symbol as string,
          timeframe: filteredBody.timeframe as string,
        },
      },
      update: filteredBody,
      create: filteredBody,
    })

    // If this config is being set as active, deactivate all other configs
    // This ensures only one config is active at a time
    if (config.isActive) {
      await prisma.botConfig.updateMany({
        where: {
          id: { not: config.id },
          isActive: true,
        },
        data: {
          isActive: false,
        },
      })
    }

    // If bot is running and config was updated (especially timeframe), restart bot to apply new interval
    const status = await prisma.botStatus.findUnique({
      where: { id: 'main' },
    })

    if (status?.isRunning && config.isActive) {
      // Check if timeframe changed (this would require storing previous timeframe, so we'll just restart if active)
      // Restart bot to apply new interval based on timeframe
      try {
        await tradingBot.restart()
      } catch (restartError) {
        console.error('Error restarting bot after config update:', restartError)
        // Don't fail the config update if restart fails
      }
    }

    return NextResponse.json(config)
  } catch (error: unknown) {
    console.error('Config POST error:', error)
    
    // Extract detailed error message
    let errorMessage = 'Failed to save configuration'
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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const configId = searchParams.get('id')
    
    if (!configId) {
      return NextResponse.json(
        { error: 'Config ID is required' },
        { status: 400 }
      )
    }

    // Check if this config is active
    const config = await prisma.botConfig.findUnique({
      where: { id: configId },
    })

    if (!config) {
      return NextResponse.json(
        { error: 'Config not found' },
        { status: 404 }
      )
    }

    // Prevent deleting the active config if bot is running
    const status = await prisma.botStatus.findUnique({
      where: { id: 'main' },
    })

    if (config.isActive && status?.isRunning) {
      return NextResponse.json(
        { error: 'Cannot delete active configuration while bot is running. Please stop the bot first.' },
        { status: 400 }
      )
    }

    // Delete the config
    await prisma.botConfig.delete({
      where: { id: configId },
    })

    return NextResponse.json({ success: true, message: 'Configuration deleted successfully' })
  } catch (error: unknown) {
    console.error('Config DELETE error:', error)
    
    let errorMessage = 'Failed to delete configuration'
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
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      },
      { status: 500 }
    )
  }
}
