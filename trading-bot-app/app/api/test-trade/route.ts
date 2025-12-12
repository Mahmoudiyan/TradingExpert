import { NextResponse } from 'next/server'
import { getExchangeForSymbol, getExchangeByName } from '@/lib/exchange/router'
import { prisma } from '@/lib/db'

/**
 * POST /api/test-trade
 * Place a small test trade order to verify trading APIs are working
 * 
 * Body: {
 *   exchange?: string (default: from active config)
 *   symbol: string (e.g., 'ETH-USDT')
 *   side: 'buy' | 'sell'
 *   size?: number (optional, for sell orders - amount in base currency)
 *   funds?: number (optional, for buy orders - amount in quote currency/USDT, defaults to 0.11, minimum 0.1 USDT for KuCoin)
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { exchange: exchangeParam, symbol, side, size, funds } = body

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required (e.g., ETH-USDT)' },
        { status: 400 }
      )
    }

    if (!side || (side !== 'buy' && side !== 'sell')) {
      return NextResponse.json(
        { error: 'Side must be "buy" or "sell"' },
        { status: 400 }
      )
    }

    // Get exchange
    let exchange
    if (exchangeParam) {
      exchange = getExchangeByName(exchangeParam)
    } else {
      // Get from active config
      const config = await prisma.botConfig.findFirst({
        where: { isActive: true },
      })
      if (!config) {
        return NextResponse.json(
          { error: 'No active config found. Please provide exchange parameter.' },
          { status: 400 }
        )
      }
      exchange = getExchangeForSymbol(config.symbol, config.exchange)
    }

    // Determine test size or funds
    let testSize: number | undefined
    let testFunds: number | undefined
    
    if (funds && funds > 0) {
      // If funds is provided, use it (for buy orders in USDT/quote currency)
      testFunds = funds
    } else if (size && size > 0) {
      testSize = size
    } else {
      // Default: For buy orders on KuCoin, use funds (USDT amount) instead of size
      // For sell orders or other exchanges, use size
      // KuCoin minimum order size is 0.1 USDT
      if (exchange.getName() === 'KuCoin' && side === 'buy') {
        testFunds = 0.11 // 0.11 USDT default (above KuCoin's 0.1 USDT minimum)
      } else if (exchange.getName() === 'KuCoin' && side === 'sell') {
        testSize = 0.001 // 0.001 base currency for sell
      } else {
        // OANDA uses units
        testSize = 100
      }
    }

    // Format size or funds for the exchange
    let formattedSize: string | undefined
    let formattedFunds: string | undefined
    
    if (testSize !== undefined) {
      if (exchange.getName() === 'KuCoin') {
        // KuCoin requires specific precision
        let decimals = 3
        if (testSize < 0.01) {
          decimals = 5
        }
        if (testSize < 0.001) {
          decimals = 8
        }
        const multiplier = Math.pow(10, decimals)
        const rounded = Math.floor(testSize * multiplier) / multiplier
        formattedSize = rounded.toFixed(decimals).replace(/\.?0+$/, '') || '0'
      } else {
        formattedSize = testSize.toFixed(8)
      }
    }
    
    if (testFunds !== undefined) {
      // For KuCoin funds (USDT), use 8 decimal places
      formattedFunds = testFunds.toFixed(8)
    }

    if (formattedSize) {
      console.log(`[Test Trade] Placing ${side} order: ${formattedSize} ${symbol} on ${exchange.getName()}`)
    } else if (formattedFunds) {
      console.log(`[Test Trade] Placing ${side} order: ${formattedFunds} USDT worth of ${symbol} on ${exchange.getName()}`)
    }

    // Place the order
    const order = await exchange.placeMarketOrder(
      symbol,
      side,
      formattedSize,
      formattedFunds
    )

    // Validate order response
    if (!order) {
      throw new Error('Order placement failed: exchange returned undefined order')
    }

    const orderId = order.id || (order as { orderId?: string }).orderId
    if (!orderId) {
      throw new Error(`Order placement failed: order missing id/orderId field. Order data: ${JSON.stringify(order)}`)
    }

    // For market orders, fetch order details to get filled price and size
    // Market orders placed with funds don't immediately have price/size in response
    let orderDetails = order
    try {
      // Wait a moment for order to be processed
      await new Promise(resolve => setTimeout(resolve, 500))
      orderDetails = await exchange.getOrder(orderId)
      console.log(`[Test Trade] Order details fetched:`, JSON.stringify(orderDetails, null, 2))
    } catch (fetchError) {
      console.warn(`[Test Trade] Could not fetch order details, using initial response:`, fetchError)
      // Continue with initial order response
    }

    // Calculate price and size from order details
    let tradePrice = 0
    let tradeSize = 0

    if (formattedFunds && side === 'buy') {
      // For buy orders with funds, calculate from filledValue and filledSize
      const filledValue = parseFloat(orderDetails.filledValue || '0')
      const filledSize = parseFloat(orderDetails.filledSize || '0')
      if (filledSize > 0) {
        tradePrice = filledValue / filledSize
        tradeSize = filledSize
      } else {
        // Fallback: use testFunds and estimated price from ticker
        if (testFunds && testFunds > 0) {
          try {
            const ticker = await exchange.getTicker(symbol)
            tradePrice = parseFloat(ticker.price)
            tradeSize = testFunds / tradePrice
          } catch (tickerError) {
            console.warn(`[Test Trade] Could not fetch ticker for price calculation:`, tickerError)
          }
        }
        
        // If still no values, try one more fallback
        if (tradePrice === 0 || tradeSize === 0) {
          try {
            const ticker = await exchange.getTicker(symbol)
            tradePrice = parseFloat(ticker.price)
            if (testFunds && testFunds > 0) {
              tradeSize = testFunds / tradePrice
            } else if (testSize && testSize > 0) {
              tradeSize = testSize
            }
        }
      }
    } else if (testSize) {
      // For sell orders or buy orders with size
      tradeSize = testSize
      const filledPrice = parseFloat(orderDetails.filledValue || '0') / parseFloat(orderDetails.filledSize || '1')
      tradePrice = filledPrice || parseFloat(orderDetails.price || '0')
      
      // If still no price, try to get from ticker
      if (tradePrice === 0) {
        try {
          const ticker = await exchange.getTicker(symbol)
          tradePrice = parseFloat(ticker.price)
        } catch (tickerError) {
          console.warn(`[Test Trade] Could not fetch ticker:`, tickerError)
        }
      }
    }

    // Save trade to database for tracking
    const trade = await prisma.trade.create({
      data: {
        orderId: orderId,
        symbol,
        side,
        type: 'market',
        price: tradePrice,
        size: tradeSize,
        status: orderDetails.status || order.status || 'unknown',
      },
    })

    // Log the test trade
    const tradeDescription = formattedFunds 
      ? `${formattedFunds} USDT worth of ${symbol}`
      : `${formattedSize} ${symbol}`
    await prisma.botLog.create({
      data: {
        level: 'info',
        message: `Test trade executed: ${side.toUpperCase()} ${tradeDescription}`,
        data: { orderId, tradeId: trade.id, testTrade: true, funds: formattedFunds, size: formattedSize },
      },
    })

    return NextResponse.json({
      success: true,
      message: `Test trade order placed successfully`,
      order: {
        id: orderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        price: order.price,
        size: formattedSize || undefined,
        funds: formattedFunds || undefined,
        status: order.status,
      },
      trade: {
        id: trade.id,
        orderId: trade.orderId,
        symbol: trade.symbol,
        side: trade.side,
        price: trade.price.toFixed(8),
        size: trade.size.toFixed(8),
        status: trade.status,
      },
    })
  } catch (error: unknown) {
    console.error('[Test Trade API] Error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorDetails = error instanceof Error ? error.toString() : String(error)

    // Log error
    try {
      await prisma.botLog.create({
        data: {
          level: 'error',
          message: `Test trade failed: ${errorMessage}`,
          data: { error: errorDetails, testTrade: true },
        },
      })
    } catch (logError) {
      console.error('Failed to log error to database:', logError)
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
      },
      { status: 500 }
    )
  }
}

