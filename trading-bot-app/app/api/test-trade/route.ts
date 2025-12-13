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
          } catch (tickerError2) {
            console.warn(`[Test Trade] Could not fetch ticker in fallback:`, tickerError2)
            tradePrice = parseFloat(orderDetails.price || '0')
            tradeSize = testSize || 0
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

    // Get active config for SL/TP values
    const config = await prisma.botConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    })

    // Check if order is filled by status or by having filled size/value
    const hasFilledSize = parseFloat(orderDetails.filledSize || '0') > 0
    const hasFilledValue = parseFloat(orderDetails.filledValue || '0') > 0
    
    // Determine final status - update if we have filled data
    let finalStatus = orderDetails.status || order.status || 'unknown'
    if ((hasFilledSize || hasFilledValue) && finalStatus === 'unknown') {
      finalStatus = 'filled'
    }

    // Calculate SL/TP prices if config exists
    const stopLossPips = config?.stopLossPips || 30
    const takeProfitPips = config?.takeProfitPips || 75
    let stopLossPrice: number | null = null
    let takeProfitPrice: number | null = null

    if (tradePrice > 0) {
      if (side === 'buy') {
        stopLossPrice = tradePrice * (1 - stopLossPips / 10000)
        takeProfitPrice = tradePrice * (1 + takeProfitPips / 10000)
      } else {
        stopLossPrice = tradePrice * (1 + stopLossPips / 10000)
        takeProfitPrice = tradePrice * (1 - takeProfitPips / 10000)
      }
      // Format prices to 2 decimals to match KuCoin's price increment requirements
      // This prevents floating point precision issues
      if (stopLossPrice) {
        stopLossPrice = Math.round(stopLossPrice * 100) / 100
      }
      if (takeProfitPrice) {
        takeProfitPrice = Math.round(takeProfitPrice * 100) / 100
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
        status: finalStatus,
        stopLoss: stopLossPrice,
        takeProfit: takeProfitPrice,
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
    
    // Place SL/TP orders if trade is filled and prices are valid
    // For market orders placed via API, if we have valid price/size, consider it filled
    // Market orders execute immediately, so if we have price and size, it's filled
    const hasValidTradeData = tradePrice > 0 && tradeSize > 0
    const isFilled = finalStatus === 'filled' || finalStatus === 'done' || 
                     hasFilledSize || hasFilledValue ||
                     hasValidTradeData // If we have valid price/size, the order executed
    
    console.log(`[Test Trade] isFilled check: finalStatus=${finalStatus}, hasFilledSize=${hasFilledSize}, hasFilledValue=${hasFilledValue}, hasValidTradeData=${hasValidTradeData}, isFilled=${isFilled}`)
    
    // Update trade status to 'filled' if it's actually filled but status was 'unknown'
    if (isFilled && finalStatus === 'unknown') {
      console.log(`[Test Trade] Updating trade ${trade.id} status from 'unknown' to 'filled'`)
      await prisma.trade.update({
        where: { id: trade.id },
        data: { status: 'filled' },
      })
      finalStatus = 'filled'
    }
    
    let slOrderId: string | null = null
    let tpOrderId: string | null = null
    let slErrorMsg: string | null = null
    let tpErrorMsg: string | null = null

    // Check if trade size is large enough for SL/TP orders (KuCoin minimum order value is 0.1 USDT)
    const estimatedSlTpValue = tradeSize * tradePrice
    const canPlaceSlTp = estimatedSlTpValue >= 0.1

    if (isFilled && tradePrice > 0 && tradeSize > 0 && stopLossPrice && takeProfitPrice) {
      if (!canPlaceSlTp) {
        console.log(`[Test Trade] Skipping SL/TP orders: trade size too small (${tradeSize} = ${estimatedSlTpValue.toFixed(4)} USDT < 0.1 USDT minimum)`)
        slErrorMsg = `Trade size too small for SL/TP orders (${estimatedSlTpValue.toFixed(4)} USDT < 0.1 USDT minimum)`
        tpErrorMsg = slErrorMsg
      } else {
        console.log(`[Test Trade] Placing SL/TP orders: SL=${stopLossPrice.toFixed(4)}, TP=${takeProfitPrice.toFixed(4)}`)
        
        // Place stop-loss order
        try {
          // Format price to 2 decimals for KuCoin (already done above, but ensure it's formatted)
          const formattedSlPrice = exchange.getName() === 'KuCoin'
            ? stopLossPrice.toFixed(2)
            : stopLossPrice.toFixed(8)
          
          const stopLossOrder = await exchange.placeStopLossOrder(
            symbol,
            side as 'buy' | 'sell',
            formattedSlPrice,
            tradeSize.toString() // Size will be formatted inside placeStopLossOrder
          )
          if (stopLossOrder && (stopLossOrder.id || (stopLossOrder as { orderId?: string }).orderId)) {
            slOrderId = stopLossOrder.id || (stopLossOrder as { orderId?: string }).orderId || null
            console.log(`[Test Trade] Stop-loss order placed: ${slOrderId}`)
          } else {
            throw new Error(`Invalid response from placeStopLossOrder: ${JSON.stringify(stopLossOrder)}`)
          }
          
          await prisma.botLog.create({
            data: {
              level: 'info',
              message: `Test trade stop-loss order placed: ${slOrderId} at ${stopLossPrice.toFixed(4)}`,
              data: { tradeId: trade.id, stopLossOrderId: slOrderId, stopLossPrice },
            },
          })
          
          // Small delay to allow balance to update after SL order placement
          await new Promise(resolve => setTimeout(resolve, 300))
        } catch (slError) {
          console.error(`[Test Trade] Error placing stop-loss order:`, slError)
          slErrorMsg = slError instanceof Error ? slError.message : 'Unknown error'
          await prisma.botLog.create({
            data: {
              level: 'error',
              message: `Test trade failed to place stop-loss: ${slErrorMsg}`,
              data: { tradeId: trade.id, error: slError instanceof Error ? slError.toString() : String(slError) },
            },
          })
        }

        // Place take-profit order
        try {
          // Format price to 2 decimals for KuCoin (already done above, but ensure it's formatted)
          const formattedTpPrice = exchange.getName() === 'KuCoin'
            ? takeProfitPrice.toFixed(2)
            : takeProfitPrice.toFixed(8)
          
          const takeProfitOrder = await exchange.placeTakeProfitOrder(
            symbol,
            side as 'buy' | 'sell',
            formattedTpPrice,
            tradeSize.toString() // Size will be formatted inside placeTakeProfitOrder
          )
          if (takeProfitOrder && (takeProfitOrder.id || (takeProfitOrder as { orderId?: string }).orderId)) {
            tpOrderId = takeProfitOrder.id || (takeProfitOrder as { orderId?: string }).orderId || null
            console.log(`[Test Trade] Take-profit order placed: ${tpOrderId}`)
          } else {
            throw new Error(`Invalid response from placeTakeProfitOrder: ${JSON.stringify(takeProfitOrder)}`)
          }
          
          await prisma.botLog.create({
            data: {
              level: 'info',
              message: `Test trade take-profit order placed: ${tpOrderId} at ${takeProfitPrice.toFixed(4)}`,
              data: { tradeId: trade.id, takeProfitOrderId: tpOrderId, takeProfitPrice },
            },
          })
        } catch (tpError) {
          console.error(`[Test Trade] Error placing take-profit order:`, tpError)
          tpErrorMsg = tpError instanceof Error ? tpError.message : 'Unknown error'
          await prisma.botLog.create({
            data: {
              level: 'error',
              message: `Test trade failed to place take-profit: ${tpErrorMsg}`,
              data: { tradeId: trade.id, error: tpError instanceof Error ? tpError.toString() : String(tpError) },
            },
          })
        }
        
        // SAFETY: If SL failed to place, close the trade immediately (SL is critical)
        // For spot trading, TP failure is acceptable if SL is placed (balance already reserved)
        if (!slOrderId) {
          const errorDetails = [`SL: ${slErrorMsg || 'Unknown error'}`]
          if (!tpOrderId && tpErrorMsg) errorDetails.push(`TP: ${tpErrorMsg}`)
          
          console.error(`[Test Trade] SAFETY: Stop-loss placement failed, closing trade ${trade.id} immediately. Errors: ${errorDetails.join(', ')}`)
          
          try {
            // Try to close the trade immediately
            const oppositeSide = side === 'buy' ? 'sell' : 'buy'
            
            // Check if trade size is sufficient to place closing order
            const minOrderValue = exchange.getName() === 'KuCoin' ? 0.11 : 0.1
            if (estimatedSlTpValue >= minOrderValue) {
              // Format size according to exchange requirements
              let formattedCloseSize: string | undefined
              if (exchange.getName() === 'KuCoin') {
                // Use same logic as main formatting
                let decimals = 4
                if (tradeSize >= 0.01) {
                  decimals = 3
                } else if (tradeSize < 0.0001) {
                  decimals = 8
                } else if (tradeSize < 0.001) {
                  decimals = 5
                }
                const multiplier = Math.pow(10, decimals)
                const rounded = Math.floor(tradeSize * multiplier) / multiplier
                formattedCloseSize = rounded.toFixed(decimals).replace(/\.?0+$/, '') || '0'
              } else {
                formattedCloseSize = tradeSize.toFixed(8)
              }
              
              const closeOrder = await exchange.placeMarketOrder(
                symbol,
                oppositeSide,
                formattedCloseSize
              )
              
              // Update trade status
              await prisma.trade.update({
                where: { id: trade.id },
                data: {
                  status: 'closed',
                  closedAt: new Date(),
                  notes: `Auto-closed: Stop-loss placement failed (${errorDetails.join(', ')})`,
                },
              })
              
              console.log(`[Test Trade] Trade ${trade.id} closed successfully due to SL/TP failure`)
              
              await prisma.botLog.create({
                data: {
                  level: 'warning',
                  message: `Test trade ${trade.id} auto-closed due to SL/TP placement failure`,
                  data: { tradeId: trade.id, closeOrderId: closeOrder.id },
                },
              })
            } else {
              // Trade too small to close - just mark as closed manually
              await prisma.trade.update({
                where: { id: trade.id },
                data: {
                  status: 'closed',
                  closedAt: new Date(),
                  notes: `Auto-closed (no order): Trade size too small for closing order (${estimatedSlTpValue.toFixed(4)} < ${minOrderValue} minimum). Stop-loss failed: ${errorDetails.join(', ')}`,
                },
              })
              
              console.log(`[Test Trade] Trade ${trade.id} marked as closed (size too small to place closing order)`)
            }
          } catch (closeError) {
            console.error(`[Test Trade] Error closing trade ${trade.id}:`, closeError)
            // If closing also fails, still mark as closed with error note
            await prisma.trade.update({
              where: { id: trade.id },
              data: {
                status: 'closed',
                closedAt: new Date(),
                  notes: `Auto-closed (close failed): Stop-loss placement failed (${errorDetails.join(', ')}). Close error: ${closeError instanceof Error ? closeError.message : String(closeError)}`,
              },
            })
            
            await prisma.botLog.create({
              data: {
                level: 'error',
                message: `Test trade ${trade.id} - Failed to close trade after SL/TP failure: ${closeError instanceof Error ? closeError.message : String(closeError)}`,
                data: { tradeId: trade.id, error: closeError instanceof Error ? closeError.toString() : String(closeError) },
              },
            })
          }
        } else if (!tpOrderId && tpErrorMsg) {
          // TP failed but SL is placed - this is acceptable for spot trading
          // Log a warning but don't close the trade (we have SL protection)
          console.warn(`[Test Trade] Take-profit placement failed but stop-loss is active. This is acceptable for spot trading (balance reserved by SL). TP error: ${tpErrorMsg}`)
          await prisma.botLog.create({
            data: {
              level: 'warning',
              message: `Test trade: Take-profit order failed to place but stop-loss is active. Trade protected by SL only. TP error: ${tpErrorMsg}`,
              data: { tradeId: trade.id, slOrderId, tpOrderId, slError: slErrorMsg, tpError: tpErrorMsg },
            },
          })
        }
      }
    } else {
      // Log why SL/TP orders weren't placed with detailed debugging
      const debugInfo = {
        isFilled,
        finalStatus,
        hasFilledSize,
        hasFilledValue,
        tradePrice,
        tradeSize,
        stopLossPrice,
        takeProfitPrice,
        hasValidPrices: !!(stopLossPrice && takeProfitPrice),
        hasValidTrade: !!(tradePrice > 0 && tradeSize > 0),
      }
      console.log(`[Test Trade] SL/TP orders not placed. Debug info:`, JSON.stringify(debugInfo, null, 2))
      
      await prisma.botLog.create({
        data: {
          level: 'warning',
          message: `Test trade SL/TP not placed: isFilled=${isFilled}, hasValidTrade=${debugInfo.hasValidTrade}, hasValidPrices=${debugInfo.hasValidPrices}, status=${finalStatus}`,
          data: { tradeId: trade.id, ...debugInfo },
        },
      })
    }

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
        status: finalStatus, // Use finalStatus which may have been updated to 'filled'
        stopLoss: stopLossPrice,
        takeProfit: takeProfitPrice,
      },
      slOrderId,
      tpOrderId,
      slError: slErrorMsg,
      tpError: tpErrorMsg,
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

