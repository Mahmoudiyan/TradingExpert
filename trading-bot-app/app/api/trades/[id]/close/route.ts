import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getExchangeForSymbol } from '@/lib/exchange/router'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const tradeId = id

    // Get the trade
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
    })

    if (!trade) {
      return NextResponse.json(
        { success: false, error: 'Trade not found' },
        { status: 404 }
      )
    }

    // Check if trade is already closed
    if (trade.status === 'cancelled' || trade.status === 'closed' || trade.closedAt) {
      return NextResponse.json(
        { success: false, error: 'Trade is already closed' },
        { status: 400 }
      )
    }

    const exchange = getExchangeForSymbol(trade.symbol, undefined)

    // Handle pending orders - cancel them
    if (trade.status === 'pending' && trade.orderId) {
      try {
        await exchange.cancelOrder(trade.orderId)
        
        await prisma.trade.update({
          where: { id: tradeId },
          data: {
            status: 'cancelled',
            closedAt: new Date(),
            notes: trade.notes 
              ? `${trade.notes}; Cancelled manually`
              : 'Cancelled manually',
          },
        })

        await prisma.botLog.create({
          data: {
            level: 'info',
            message: `Trade ${tradeId} cancelled manually`,
            data: { tradeId, orderId: trade.orderId, symbol: trade.symbol },
          },
        })

        return NextResponse.json({
          success: true,
          message: 'Trade cancelled successfully',
          trade: await prisma.trade.findUnique({ where: { id: tradeId } }),
        })
      } catch (error) {
        console.error(`Error cancelling trade ${tradeId}:`, error)
        return NextResponse.json(
          { 
            success: false, 
            error: `Failed to cancel trade: ${error instanceof Error ? error.message : 'Unknown error'}` 
          },
          { status: 500 }
        )
      }
    }

    // Handle filled trades (or unknown trades with valid size, which are likely filled)
    // Place opposite market order to close position
    if (trade.status === 'filled' || (trade.status === 'unknown' && trade.size > 0)) {
      try {
        // IMPORTANT: Cancel any active SL/TP orders first (they lock the balance)
        // This is necessary for spot trading where SL/TP orders reserve the position
        const oppositeSide = trade.side === 'buy' ? 'sell' : 'buy'
        try {
          const openOrders = await exchange.getOpenOrders(trade.symbol)
          console.log(`[Close Trade] Found ${openOrders.length} open orders for ${trade.symbol}`)
          console.log(`[Close Trade] Trade side: ${trade.side}, opposite side for close: ${oppositeSide}`)
          
          // Log order details for debugging
          if (openOrders.length > 0) {
            console.log(`[Close Trade] Open orders:`, openOrders.map(o => ({ id: o.id, side: o.side, type: o.type, status: o.status })))
          } else {
            console.log(`[Close Trade] No open orders found - balance should be available`)
          }
          
          let cancelledCount = 0
          for (const order of openOrders) {
            // Cancel ALL open orders for this symbol (not just opposite side)
            // This ensures any SL/TP orders are cancelled, freeing up the balance
            // For spot trading, any limit order can lock the balance
            if (order.id) {
              try {
                console.log(`[Close Trade] Attempting to cancel order ${order.id} (side: ${order.side}, type: ${order.type})`)
                await exchange.cancelOrder(order.id)
                console.log(`[Close Trade] ✓ Successfully cancelled order ${order.id}`)
                cancelledCount++
                await prisma.botLog.create({
                  data: {
                    level: 'info',
                    message: `Cancelled open order ${order.id} before closing trade ${tradeId}`,
                    data: { tradeId, cancelledOrderId: order.id, symbol: trade.symbol, orderSide: order.side, orderType: order.type },
                  },
                })
              } catch (cancelError) {
                const errorMsg = cancelError instanceof Error ? cancelError.message : String(cancelError)
                console.warn(`[Close Trade] Failed to cancel order ${order.id}:`, errorMsg)
                // Continue even if one order fails to cancel (might already be filled/cancelled)
              }
            }
          }
          
          console.log(`[Close Trade] Cancelled ${cancelledCount} open order(s)`)
          
          // Wait longer to ensure balance is released after order cancellation
          // KuCoin may need a moment to update balances - wait longer for reliability
          if (cancelledCount > 0) {
            console.log(`[Close Trade] Waiting 2 seconds for balance to be released after cancellation...`)
            await new Promise(resolve => setTimeout(resolve, 2000))
          } else if (openOrders.length === 0) {
            // Even if no orders found, wait a bit in case balance is still updating
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        } catch (openOrdersError) {
          const errorMsg = openOrdersError instanceof Error ? openOrdersError.message : String(openOrdersError)
          console.warn(`[Close Trade] Error fetching/cancelling open orders:`, errorMsg)
          // Continue with closing even if we couldn't cancel orders (they might already be filled/cancelled)
        }
        
        // Place opposite order to close the position
        // (oppositeSide already defined above)
        
        // Get current price for reference
        const ticker = await exchange.getTicker(trade.symbol)
        const currentPrice = parseFloat(ticker.price || ticker.bestAsk || '0')
        
        // Format size according to exchange requirements
        let formattedSize: string | undefined
        if (exchange.getName() === 'KuCoin') {
          // KuCoin minimum order value is 0.1 USDT
          // Check if this trade size is large enough to close
          // Use trade price if current price is not available (more conservative)
          const priceForCheck = currentPrice > 0 ? currentPrice : trade.price
          const estimatedCloseValue = trade.size * priceForCheck
          
          console.log(`[Close Trade] Checking size: trade.size=${trade.size}, price=${priceForCheck}, estimatedValue=${estimatedCloseValue}`)
          
          // Be more conservative: require at least 0.11 USDT (0.1 + buffer) or size too small
          // Also check if the ETH size itself is too small (below typical minimums)
          if (estimatedCloseValue < 0.11 || trade.size < 0.0001) {
            // Trade size too small to close - update status manually
            const updatedTrade = await prisma.trade.update({
              where: { id: tradeId },
              data: {
                status: 'closed',
                closedAt: new Date(),
                profit: 0,
                profitPercent: 0,
                notes: trade.notes 
                  ? `${trade.notes}; Closed manually (size too small: ${trade.size}, value: ${estimatedCloseValue.toFixed(4)} USDT < 0.1 USDT minimum)`
                  : `Closed manually (size too small: ${trade.size}, value: ${estimatedCloseValue.toFixed(4)} USDT < 0.1 USDT minimum)`,
              },
            })
            
            await prisma.botLog.create({
              data: {
                level: 'warning',
                message: `Trade ${tradeId} closed manually but size too small (${trade.size}, value: ${estimatedCloseValue.toFixed(4)} USDT) to place closing order on KuCoin (minimum 0.1 USDT)`,
                data: { tradeId, tradeSize: trade.size, estimatedValue: estimatedCloseValue, minimumRequired: 0.1 },
              },
            })
            
            return NextResponse.json({
              success: true,
              message: 'Trade closed successfully (size too small to place closing order)',
              trade: updatedTrade,
              profit: 0,
              profitPercent: 0,
              warning: `Trade size (${trade.size}) is below KuCoin minimum order value (0.1 USDT). Status updated to closed manually.`,
            })
          }
          
          // Determine appropriate precision to match KuCoin's baseIncrement
          // For ETH-USDT, baseIncrement is 0.0001 (4 decimals)
          // For values >= 0.01, use 3 decimals (increment 0.001)
          // For values < 0.01, use 4 decimals (increment 0.0001)
          // For values < 0.001, use 5 decimals (increment 0.00001)
          // For values < 0.0001, use 8 decimals
          let decimals = 4 // Default for ETH-USDT (baseIncrement 0.0001)
          if (trade.size >= 0.01) {
            decimals = 3
          } else if (trade.size < 0.0001) {
            decimals = 8
          } else if (trade.size < 0.001) {
            decimals = 5
          }
          const multiplier = Math.pow(10, decimals)
          const rounded = Math.floor(trade.size * multiplier) / multiplier
          formattedSize = rounded.toFixed(decimals).replace(/\.?0+$/, '') || '0'
        } else {
          formattedSize = trade.size.toFixed(8)
        }

        // Place closing market order
        // If it fails with balance insufficient, the SL order is likely still active
        // but not visible via getOpenOrders. In this case, we'll update the trade status
        // to closed manually since we can't place the closing order.
        let closeOrder
        try {
          closeOrder = await exchange.placeMarketOrder(
            trade.symbol,
            oppositeSide as 'buy' | 'sell',
            formattedSize
          )
        } catch (closeError) {
          const errorMsg = closeError instanceof Error ? closeError.message : String(closeError)
          
          // If balance insufficient, it means SL order is locking the balance
          // Since we can't cancel it (not found via getOpenOrders), mark trade as closed manually
          if (errorMsg.includes('Balance insufficient') || errorMsg.includes('200004')) {
            console.log(`[Close Trade] Balance insufficient - SL order likely active but not found. Marking trade as closed manually.`)
            
            // Update trade status to closed manually
            const updatedTrade = await prisma.trade.update({
              where: { id: tradeId },
              data: {
                status: 'closed',
                closedAt: new Date(),
                profit: 0, // Can't calculate profit without closing order
                profitPercent: 0,
                notes: trade.notes 
                  ? `${trade.notes}; Closed manually (balance locked by SL order - order not found to cancel)`
                  : `Closed manually (balance locked by SL order - order not found to cancel)`,
              },
            })
            
            await prisma.botLog.create({
              data: {
                level: 'warning',
                message: `Trade ${tradeId} closed manually - balance locked by SL order that couldn't be cancelled`,
                data: { tradeId, symbol: trade.symbol, error: errorMsg },
              },
            })
            
            return NextResponse.json({
              success: true,
              message: 'Trade closed manually (SL order prevented automatic closure)',
              trade: updatedTrade,
              profit: 0,
              profitPercent: 0,
              warning: 'Balance was locked by a stop-loss order that could not be cancelled. Trade status updated to closed manually.',
            })
          } else {
            // Different error, throw it
            throw closeError
          }
        }

        // Get order details to get filled price
        let actualClosePrice = currentPrice
        const closeOrderId = closeOrder.id || (closeOrder as { orderId?: string }).orderId
        if (closeOrderId) {
          try {
            await new Promise(resolve => setTimeout(resolve, 500))
            const orderDetails = await exchange.getOrder(closeOrderId)
            const filledSize = parseFloat(orderDetails.filledSize || '0')
            const filledValue = parseFloat(orderDetails.filledValue || '0')
          
          if (filledSize > 0) {
            actualClosePrice = filledValue / filledSize
          } else if (orderDetails.price) {
            actualClosePrice = parseFloat(orderDetails.price)
          }
          } catch (fetchError) {
            console.warn('Could not fetch close order details:', fetchError)
          }
        }

        // Calculate profit
        const profit = oppositeSide === 'sell' 
          ? (actualClosePrice - trade.price) * trade.size
          : (trade.price - actualClosePrice) * trade.size
        const profitPercent = (profit / (trade.price * trade.size)) * 100

        // Update trade
        await prisma.trade.update({
          where: { id: tradeId },
          data: {
            status: 'closed',
            closedAt: new Date(),
            profit,
            profitPercent,
            notes: trade.notes 
              ? `${trade.notes}; Closed manually at ${actualClosePrice}`
              : `Closed manually at ${actualClosePrice}`,
          },
        })

        await prisma.botLog.create({
          data: {
            level: 'info',
            message: `Trade ${tradeId} closed manually: ${oppositeSide.toUpperCase()} ${trade.size} ${trade.symbol} @ ${actualClosePrice}, profit: ${profit.toFixed(2)} (${profitPercent.toFixed(2)}%)`,
            data: { 
              tradeId, 
              closeOrderId: closeOrder.id, 
              symbol: trade.symbol,
              profit,
              profitPercent,
            },
          },
        })

        return NextResponse.json({
          success: true,
          message: 'Trade closed successfully',
          trade: await prisma.trade.findUnique({ where: { id: tradeId } }),
          closeOrder,
          profit,
          profitPercent,
        })
      } catch (error) {
        console.error(`Error closing trade ${tradeId}:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // If balance insufficient, it's likely due to SL/TP orders locking the balance
        // Provide helpful guidance
        if (errorMessage.includes('Balance insufficient') || errorMessage.includes('200004')) {
          return NextResponse.json(
            { 
              success: false, 
              error: `Failed to close trade: Balance insufficient. This usually means a stop-loss or take-profit order is locking the balance. Please cancel any open orders for ${trade.symbol} on the exchange and try again.`
            },
            { status: 500 }
          )
        }
        
        return NextResponse.json(
          { 
            success: false, 
            error: `Failed to close trade: ${errorMessage}`
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { success: false, error: `Cannot close trade with status: ${trade.status}` },
      { status: 400 }
    )
  } catch (error: unknown) {
    console.error('Error in close trade endpoint:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to close trade'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
