import { getExchangeForSymbol } from './exchange/router'
import type { Kline } from './exchange/interface'
import type { KucoinService } from './kucoin'
import { prisma } from './db'
// Removed unused imports: format, subDays

export interface MovingAverage {
  fast: number
  slow: number
}

export interface TradingSignal {
  signal: 'buy' | 'sell' | 'none'
  fastMA: number
  slowMA: number
  price: number
}

// Global storage for bot instance and interval (survives hot reloads in dev mode)
const globalForTradingBot = globalThis as unknown as {
  tradingBot: TradingBot | undefined
  tradingBotInterval: NodeJS.Timeout | null | undefined
}

export class TradingBot {
  private isRunning = false
  private get intervalId(): NodeJS.Timeout | null {
    return globalForTradingBot.tradingBotInterval ?? null
  }
  private set intervalId(value: NodeJS.Timeout | null) {
    globalForTradingBot.tradingBotInterval = value ?? undefined
  }

  // Calculate moving average
  private calculateMA(klines: Kline[], period: number): number {
    if (klines.length < period) return 0
    
    const closes = klines.slice(-period).map(k => parseFloat(k.close))
    const sum = closes.reduce((a, b) => a + b, 0)
    return sum / period
  }

  // Calculate EMA
  private calculateEMA(klines: Kline[], period: number): number {
    if (klines.length < period) return 0
    
    const closes = klines.map(k => parseFloat(k.close))
    const multiplier = 2 / (period + 1)
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
    
    for (let i = period; i < closes.length; i++) {
      ema = (closes[i] - ema) * multiplier + ema
    }
    
    return ema
  }

  // Get trading signal
  async getSignal(symbol: string, fastMA: number, slowMA: number, timeframe: string, preferredExchange?: string): Promise<TradingSignal> {
    try {
      // Get appropriate exchange for symbol (use preferred exchange if provided)
      const exchange = getExchangeForSymbol(symbol, preferredExchange)
      
      // Get klines (need enough for slow MA + 2 for comparison)
      const klines = await exchange.getKlines(symbol, timeframe)
      
      if (klines.length < slowMA + 2) {
        return { signal: 'none', fastMA: 0, slowMA: 0, price: 0 }
      }

      // Calculate current and previous MAs
      const currentFast = this.calculateEMA(klines, fastMA)
      const currentSlow = this.calculateEMA(klines, slowMA)
      
      // Get previous period klines (remove last one)
      const prevKlines = klines.slice(0, -1)
      const prevFast = this.calculateEMA(prevKlines, fastMA)
      const prevSlow = this.calculateEMA(prevKlines, slowMA)

      const currentPrice = parseFloat(klines[klines.length - 1].close)

      // Check for crossover
      if (prevFast <= prevSlow && currentFast > currentSlow) {
        return { signal: 'buy', fastMA: currentFast, slowMA: currentSlow, price: currentPrice }
      }
      
      if (prevFast >= prevSlow && currentFast < currentSlow) {
        return { signal: 'sell', fastMA: currentFast, slowMA: currentSlow, price: currentPrice }
      }

      return { signal: 'none', fastMA: currentFast, slowMA: currentSlow, price: currentPrice }
    } catch (error) {
      console.error('Error getting signal:', error)
      return { signal: 'none', fastMA: 0, slowMA: 0, price: 0 }
    }
  }

  // Calculate position size based on risk
  calculatePositionSize(
    balance: number,
    riskPercent: number,
    entryPrice: number,
    stopLossPrice: number
  ): number {
    const riskAmount = balance * (riskPercent / 100)
    const priceDiff = Math.abs(entryPrice - stopLossPrice)
    
    if (priceDiff === 0) return 0
    
    const positionSize = riskAmount / priceDiff
    return Math.max(0, Math.min(positionSize, balance / entryPrice)) // Don't exceed balance
  }

  // Check if spread is acceptable
  async checkSpread(symbol: string, maxSpreadPercent: number, preferredExchange?: string): Promise<boolean> {
    try {
      const exchange = getExchangeForSymbol(symbol, preferredExchange)
      const ticker = await exchange.getTicker(symbol)
      const ask = parseFloat(ticker.bestAsk)
      const bid = parseFloat(ticker.bestBid)
      const mid = (ask + bid) / 2
      const spreadPercent = ((ask - bid) / mid) * 100
      
      return spreadPercent <= maxSpreadPercent
    } catch (error) {
      return false
    }
  }

  // Execute trade
  async executeTrade(
    symbol: string,
    side: 'buy' | 'sell',
    size: number,
    config: { stopLossPips?: number; takeProfitPips?: number; [key: string]: unknown },
    balance?: number,
    currency?: string
  ) {
    try {
      // Final balance check as safeguard (if balance provided)
      if (balance !== undefined && balance <= 0) {
        throw new Error(`Cannot execute trade: insufficient balance (${balance} ${currency || 'USD'})`)
      }

      const exchange = getExchangeForSymbol(symbol, typeof config.exchange === 'string' ? config.exchange : undefined)
      
      // Format size according to exchange requirements
      // KuCoin requires specific precision to match baseIncrement
      // For ETH-USDT, typical increment is 0.001 (3 decimals), for smaller values use more precision
      let formattedSize: string
      if (exchange.getName() === 'KuCoin') {
        // Determine appropriate precision based on size
        // For sizes >= 0.01, use 3 decimals (increment 0.001)
        // For sizes < 0.01, use 5 decimals (increment 0.00001)
        // For sizes < 0.001, use 8 decimals
        let decimals = 3
        if (size < 0.01) {
          decimals = 5
        }
        if (size < 0.001) {
          decimals = 8
        }
        // Round to nearest increment
        const multiplier = Math.pow(10, decimals)
        const rounded = Math.floor(size * multiplier) / multiplier
        formattedSize = rounded.toFixed(decimals).replace(/\.?0+$/, '') || '0'
      } else {
        formattedSize = size.toFixed(8)
      }
      
      const order = await exchange.placeMarketOrder(
        symbol,
        side,
        formattedSize
      )

      // Validate order response
      if (!order) {
        throw new Error(`Order placement failed: exchange returned undefined order`)
      }
      // Accept both id and orderId (KuCoin uses orderId, interface expects id)
      const orderId = order.id || (order as { orderId?: string }).orderId
      if (!orderId) {
        throw new Error(`Order placement failed: order missing id/orderId field. Order data: ${JSON.stringify(order)}`)
      }

      // For market orders, fetch order details to get filled price and size
      // Market orders might not immediately have price/filledSize in response
      let orderDetails = order
      let actualPrice = parseFloat(order.price || '0')
      let actualSize = size
      
      try {
        // Wait a moment for order to be processed and filled
        await new Promise(resolve => setTimeout(resolve, 500))
        orderDetails = await exchange.getOrder(orderId)
        console.log(`[TradingBot] Order details fetched for ${orderId}:`, JSON.stringify(orderDetails, null, 2))
        
        // Get actual filled price and size
        const filledSize = parseFloat(orderDetails.filledSize || '0')
        const filledValue = parseFloat(orderDetails.filledValue || '0')
        
        if (filledSize > 0) {
          actualPrice = filledValue / filledSize
          actualSize = filledSize
          console.log(`[TradingBot] Order filled: ${actualSize} @ ${actualPrice}`)
        } else if (orderDetails.price) {
          actualPrice = parseFloat(orderDetails.price)
        }
      } catch (fetchError) {
        console.warn(`[TradingBot] Could not fetch order details for ${orderId}, using initial response:`, fetchError)
        // Continue with initial order response or requested size
        if (order.price) {
          actualPrice = parseFloat(order.price)
        }
      }

      // Save trade to database with actual filled price and size
      const trade = await prisma.trade.create({
        data: {
          orderId: orderId,
          symbol,
          side,
          type: 'market',
          price: actualPrice,
          size: actualSize,
          status: orderDetails.status || order.status || 'unknown',
        },
      })

      // Log trade
      await prisma.botLog.create({
        data: {
          level: 'info',
          message: `Trade executed: ${side.toUpperCase()} ${actualSize} ${symbol} @ ${actualPrice}`,
          data: { orderId: orderId, tradeId: trade.id, requestedSize: size, filledSize: actualSize, filledPrice: actualPrice },
        },
      })

      return { success: true, trade, order }
    } catch (error: unknown) {
      await prisma.botLog.create({
        data: {
          level: 'error',
          message: `Trade failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          data: { error: error instanceof Error ? error.toString() : String(error) },
        },
      })
      throw error
    }
  }

  // Main trading loop
  async runTradingLoop() {
    if (this.isRunning) {
      console.log('[TradingBot] Loop already running, skipping...')
      return
    }

    this.isRunning = true
    const checkTime = new Date()
    console.log(`[TradingBot] Starting trading loop at ${checkTime.toISOString()}`)
    
    try {
      // Update lastCheck timestamp
      await prisma.botStatus.update({
        where: { id: 'main' },
        data: { lastCheck: checkTime },
      })

      // Get active config (most recently updated one if multiple are active)
      const config = await prisma.botConfig.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      })

      if (!config) {
        console.log('[TradingBot] No active configuration found')
        await prisma.botLog.create({
          data: {
            level: 'warning',
            message: 'No active bot configuration found',
          },
        })
        this.isRunning = false
        return
      }

      console.log(`[TradingBot] Active config: ${config.symbol} on ${config.exchange}, timeframe: ${config.timeframe}`)

      // Check if we have open positions
      const openTrades = await prisma.trade.findMany({
        where: {
          symbol: config.symbol,
          status: { in: ['pending', 'filled'] },
        },
      })

      // If we have open positions, skip new entries but continue checking
      // This allows the bot to check for signals even with open positions
      // (Future: could add position management logic here)
      if (openTrades.length > 0) {
        console.log(`[TradingBot] Skipping - ${openTrades.length} open position(s) for ${config.symbol}`)
        // Log that we're skipping due to open position (but don't stop the bot)
        await prisma.botLog.create({
          data: {
            level: 'info',
            message: `Skipping new entry - ${openTrades.length} open position(s) for ${config.symbol}`,
          },
        })
        this.isRunning = false
        return
      }

      // Get signal
      console.log(`[TradingBot] Checking for signal: ${config.symbol}, MA(${config.fastMA}/${config.slowMA}), ${config.timeframe}`)
      const signal = await this.getSignal(
        config.symbol,
        config.fastMA,
        config.slowMA,
        config.timeframe,
        config.exchange
      )

      console.log(`[TradingBot] Signal result: ${signal.signal}, price: ${signal.price}, fastMA: ${signal.fastMA.toFixed(4)}, slowMA: ${signal.slowMA.toFixed(4)}`)
      
      // Log signal check result
      await prisma.botLog.create({
        data: {
          level: 'info',
          message: `Signal check: ${signal.signal.toUpperCase()} signal for ${config.symbol} at ${signal.price.toFixed(2)} (FastMA: ${signal.fastMA.toFixed(4)}, SlowMA: ${signal.slowMA.toFixed(4)})`,
          data: { signal: signal.signal, price: signal.price, fastMA: signal.fastMA, slowMA: signal.slowMA },
        },
      })
      
      if (signal.signal === 'none') {
        console.log('[TradingBot] No signal found, exiting loop')
        this.isRunning = false
        return
      }

      // Check if trading is allowed for this direction
      if (signal.signal === 'buy' && !config.allowBuy) {
        console.log('[TradingBot] Buy signal but allowBuy is false')
        this.isRunning = false
        return
      }
      if (signal.signal === 'sell' && !config.allowSell) {
        console.log('[TradingBot] Sell signal but allowSell is false')
        this.isRunning = false
        return
      }

      // Get balance EARLY - before checking spread to avoid unnecessary API calls
      const exchange = getExchangeForSymbol(config.symbol, config.exchange)
      // For forex, use the quote currency; for crypto, use the quote currency (e.g., USDT)
      const baseCurrency = config.symbol.split('-')[1] || config.symbol.split('_')[1] || 'USD'
      console.log(`[TradingBot] Checking balance for ${baseCurrency}`)
      
      // For KuCoin, check trade account balance and auto-transfer from main if needed
      let balance = await exchange.getBalance(baseCurrency)
      console.log(`[TradingBot] Trade account balance: ${balance} ${baseCurrency}`)
      
      // If KuCoin and trade balance is insufficient, try to transfer from main account
      if (exchange.getName() === 'KuCoin' && balance <= 0) {
        try {
          const kucoinService = exchange as KucoinService
          if (typeof kucoinService.getSeparateBalances === 'function') {
            const separateBalances = await kucoinService.getSeparateBalances(baseCurrency)
            console.log(`[TradingBot] Main account balance: ${separateBalances.mainAvailable} ${baseCurrency}`)
            
            // If main account has funds, transfer them to trade account
            if (separateBalances.mainAvailable > 0) {
              console.log(`[TradingBot] Transferring ${separateBalances.mainAvailable} ${baseCurrency} from main to trade account`)
              await kucoinService.transferMainToTrade(baseCurrency, separateBalances.mainAvailable.toFixed(8))
              
              // Wait a moment for transfer to complete
              await new Promise(resolve => setTimeout(resolve, 1000))
              
              // Get updated balance
              balance = await exchange.getBalance(baseCurrency)
              console.log(`[TradingBot] Balance after transfer: ${balance} ${baseCurrency}`)
              
              await prisma.botLog.create({
                data: {
                  level: 'info',
                  message: `Transferred ${separateBalances.mainAvailable} ${baseCurrency} from main to trade account`,
                },
              })
            }
          }
        } catch (transferError) {
          console.error('[TradingBot] Error transferring funds:', transferError)
          await prisma.botLog.create({
            data: {
              level: 'warning',
              message: `Failed to transfer funds from main to trade: ${transferError instanceof Error ? transferError.message : 'Unknown error'}`,
            },
          })
        }
      }

      if (balance <= 0) {
        console.log(`[TradingBot] Insufficient balance: ${balance} ${baseCurrency}`)
        await prisma.botLog.create({
          data: {
            level: 'error',
            message: `Insufficient balance: ${balance} ${baseCurrency}`,
          },
        })
        this.isRunning = false
        return
      }

      // Check spread
      console.log(`[TradingBot] Checking spread (max: ${config.maxSpreadPips} pips)`)
      const spreadOK = await this.checkSpread(config.symbol, config.maxSpreadPips, config.exchange)
      if (!spreadOK) {
        console.log(`[TradingBot] Spread too wide for ${config.symbol}`)
        await prisma.botLog.create({
          data: {
            level: 'warning',
            message: `Spread too wide for ${config.symbol}`,
          },
        })
        this.isRunning = false
        return
      }
      console.log('[TradingBot] Spread OK')

      // Calculate position size
      const stopLossPrice = signal.signal === 'buy' 
        ? signal.price * (1 - config.stopLossPips / 10000)
        : signal.price * (1 + config.stopLossPips / 10000)

      const positionSize = this.calculatePositionSize(
        balance,
        config.riskPercent,
        signal.price,
        stopLossPrice
      )

      console.log(`[TradingBot] Position size calculated: ${positionSize}, stopLoss: ${stopLossPrice}`)
      if (positionSize <= 0) {
        console.log(`[TradingBot] Invalid position size: ${positionSize}`)
        await prisma.botLog.create({
          data: {
            level: 'warning',
            message: `Invalid position size calculated: ${positionSize}`,
          },
        })
        this.isRunning = false
        return
      }

      // CRITICAL: Verify balance is sufficient for the actual trade cost before executing
      const tradeCost = signal.price * positionSize
      console.log(`[TradingBot] Trade cost: ${tradeCost} ${baseCurrency}, balance: ${balance} ${baseCurrency}`)
      if (balance < tradeCost) {
        console.log(`[TradingBot] Insufficient balance for trade: need ${tradeCost}, have ${balance}`)
        await prisma.botLog.create({
          data: {
            level: 'error',
            message: `Insufficient balance for trade: need ${tradeCost} ${baseCurrency}, have ${balance} ${baseCurrency}`,
          },
        })
        this.isRunning = false
        return
      }

      // Execute trade
      console.log(`[TradingBot] Executing ${signal.signal} trade: ${positionSize} ${config.symbol} at ${signal.price}`)
      await this.executeTrade(config.symbol, signal.signal, positionSize, config, balance, baseCurrency)
      console.log('[TradingBot] Trade executed successfully')

      // Update bot status
      await this.updateBotStatus()

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined
      console.error('[TradingBot] Trading loop error:', errorMessage, errorStack)
      await prisma.botLog.create({
        data: {
          level: 'error',
          message: `Trading loop error: ${errorMessage}`,
          data: { error: error instanceof Error ? error.toString() : String(error), stack: errorStack },
        },
      })
    } finally {
      this.isRunning = false
      console.log('[TradingBot] Trading loop completed')
    }
  }

  // Update bot status
  async updateBotStatus() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayTrades = await prisma.trade.findMany({
      where: {
        openedAt: { gte: today },
      },
    })

    const dailyProfit = todayTrades.reduce((sum, trade) => sum + (trade.profit || 0), 0)
    const totalTrades = await prisma.trade.count()
    const winningTrades = await prisma.trade.count({
      where: { profit: { gt: 0 } },
    })
    const losingTrades = await prisma.trade.count({
      where: { profit: { lt: 0 } },
    })
    const totalProfit = (await prisma.trade.aggregate({
      _sum: { profit: true },
    }))._sum.profit || 0

    await prisma.botStatus.upsert({
      where: { id: 'main' },
      update: {
        lastCheck: new Date(),
        lastTrade: new Date(),
        dailyProfit,
        totalProfit,
        totalTrades,
        winningTrades,
        losingTrades,
      },
      create: {
        id: 'main',
        isRunning: false,
        lastCheck: new Date(),
        lastTrade: new Date(),
        dailyProfit,
        totalProfit,
        totalTrades,
        winningTrades,
        losingTrades,
      },
    })
  }

  // Convert timeframe to check interval in minutes
  private getCheckIntervalFromTimeframe(timeframe: string): number {
    const intervalMap: Record<string, number> = {
      '1min': 1,      // Check every 1 minute for 1min timeframe
      '5min': 2,      // Check every 2 minutes for 5min timeframe (2-3 times per candle)
      '15min': 5,     // Check every 5 minutes for 15min timeframe
      '30min': 10,    // Check every 10 minutes for 30min timeframe
      '1hour': 15,    // Check every 15 minutes for 1hour timeframe
      '4hour': 30,    // Check every 30 minutes for 4hour timeframe
      '1day': 60,     // Check every 60 minutes for 1day timeframe
    }
    
    const interval = intervalMap[timeframe]
    if (!interval) {
      console.warn(`[TradingBot] Unknown timeframe "${timeframe}", defaulting to 15 minutes`)
      return 15
    }
    
    return interval
  }

  // Check and restore interval if bot should be running (useful after hot reloads)
  async ensureRunning() {
    const status = await prisma.botStatus.findUnique({
      where: { id: 'main' },
    })

    if (status?.isRunning && !this.intervalId) {
      console.log('[TradingBot] Bot status says running but interval missing, restoring...')
      await this.start()
    }
  }

  // Start bot
  async start(intervalMinutes?: number) {
    if (this.intervalId) {
      console.log('[TradingBot] Clearing existing interval before starting...')
      await this.stop()
    }

    // Get active config to determine timeframe-based interval (most recently updated one if multiple are active)
    const config = await prisma.botConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    })

    if (!config) {
      throw new Error('No active bot configuration found. Please create and activate a configuration first.')
    }

    // Use timeframe-based interval if not explicitly provided
    const checkInterval = intervalMinutes ?? this.getCheckIntervalFromTimeframe(config.timeframe)
    const intervalMs = checkInterval * 60 * 1000

    console.log(`[TradingBot] Starting bot with ${config.timeframe} timeframe, checking every ${checkInterval} minute(s) (${intervalMs}ms)`)

    // Store interval reference
    this.intervalId = setInterval(() => {
      this.runTradingLoop().catch((error) => {
        console.error('[TradingBot] Error in trading loop interval:', error)
      })
    }, intervalMs)

    // Log the interval setup
    await prisma.botLog.create({
      data: {
        level: 'info',
        message: `Bot started with ${config.timeframe} timeframe, checking every ${checkInterval} minute(s)`,
        data: { timeframe: config.timeframe, intervalMinutes: checkInterval, symbol: config.symbol },
      },
    })

    // Run immediately
    await this.runTradingLoop()

    await prisma.botStatus.update({
      where: { id: 'main' },
      data: { isRunning: true },
    })
  }

  // Stop bot
  async stop(closeOpenTrades: boolean = false) {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('[TradingBot] Bot interval cleared')
    }

    this.isRunning = false

    // Check for open trades
    const openTrades = await prisma.trade.findMany({
      where: {
        status: { in: ['pending', 'filled'] },
      },
    })

    if (openTrades.length > 0) {
      // Get active config to use stop-loss/take-profit settings
      const config = await prisma.botConfig.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      })

      if (closeOpenTrades) {
        console.log(`[TradingBot] Closing ${openTrades.length} open trade(s)...`)
        await prisma.botLog.create({
          data: {
            level: 'info',
            message: `Bot stopping - closing ${openTrades.length} open trade(s)`,
          },
        })

        // Attempt to close each open trade
        for (const trade of openTrades) {
          try {
            if (trade.orderId) {
              const exchange = getExchangeForSymbol(trade.symbol, undefined)
              // Cancel the order if it's still pending
              if (trade.status === 'pending') {
                await exchange.cancelOrder(trade.orderId)
                await prisma.trade.update({
                  where: { id: trade.id },
                  data: {
                    status: 'cancelled',
                    closedAt: new Date(),
                    notes: 'Cancelled when bot stopped',
                  },
                })
                await prisma.botLog.create({
                  data: {
                    level: 'info',
                    message: `Cancelled pending order ${trade.orderId} for ${trade.symbol}`,
                  },
                })
              } else {
                // For filled trades, we can't automatically close them without a closing order
                // Log a warning that the position remains open
                await prisma.botLog.create({
                  data: {
                    level: 'warning',
                    message: `Filled trade ${trade.orderId} for ${trade.symbol} remains open - manual closure may be required`,
                    data: { tradeId: trade.id, orderId: trade.orderId },
                  },
                })
              }
            }
          } catch (error) {
            console.error(`[TradingBot] Error closing trade ${trade.id}:`, error)
            await prisma.botLog.create({
              data: {
                level: 'error',
                message: `Failed to close trade ${trade.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                data: { tradeId: trade.id, error: error instanceof Error ? error.toString() : String(error) },
              },
            })
          }
        }
      } else {
        // Set stop-loss and take-profit orders for filled trades
        const filledTrades = openTrades.filter(t => t.status === 'filled')
        const pendingTrades = openTrades.filter(t => t.status === 'pending')

        // Cancel pending orders
        for (const trade of pendingTrades) {
          try {
            if (trade.orderId) {
              const exchange = getExchangeForSymbol(trade.symbol, undefined)
              await exchange.cancelOrder(trade.orderId)
              await prisma.trade.update({
                where: { id: trade.id },
                data: {
                  status: 'cancelled',
                  closedAt: new Date(),
                  notes: 'Cancelled when bot stopped',
                },
              })
              await prisma.botLog.create({
                data: {
                  level: 'info',
                  message: `Cancelled pending order ${trade.orderId} for ${trade.symbol}`,
                },
              })
            }
          } catch (error) {
            console.error(`[TradingBot] Error cancelling pending order ${trade.id}:`, error)
          }
        }

        // Set stop-loss and take-profit for filled trades
        if (filledTrades.length > 0 && config) {
          console.log(`[TradingBot] Setting stop-loss/take-profit for ${filledTrades.length} filled trade(s)...`)
          await prisma.botLog.create({
            data: {
              level: 'info',
              message: `Bot stopping - setting stop-loss/take-profit orders for ${filledTrades.length} filled trade(s)`,
            },
          })

          for (const trade of filledTrades) {
            try {
              const exchange = getExchangeForSymbol(trade.symbol, config.exchange)
              const entryPrice = trade.price
              const stopLossPips = trade.stopLoss ? 0 : (config.stopLossPips || 30)
              const takeProfitPips = trade.takeProfit ? 0 : (config.takeProfitPips || 75)

              // Calculate stop-loss and take-profit prices
              let stopLossPrice: number | null = null
              let takeProfitPrice: number | null = null

              if (trade.side === 'buy') {
                // For buy positions: stop-loss below entry, take-profit above entry
                stopLossPrice = entryPrice * (1 - stopLossPips / 10000)
                takeProfitPrice = entryPrice * (1 + takeProfitPips / 10000)
              } else {
                // For sell positions: stop-loss above entry, take-profit below entry
                stopLossPrice = entryPrice * (1 + stopLossPips / 10000)
                takeProfitPrice = entryPrice * (1 - takeProfitPips / 10000)
              }

              // Place stop-loss order
              if (stopLossPrice && !trade.stopLoss) {
                try {
                  const stopLossOrder = await exchange.placeStopLossOrder(
                    trade.symbol,
                    trade.side as 'buy' | 'sell',
                    stopLossPrice.toFixed(8),
                    trade.size.toFixed(8)
                  )
                  await prisma.trade.update({
                    where: { id: trade.id },
                    data: {
                      stopLoss: stopLossPrice,
                      notes: `Stop-loss order ${stopLossOrder.id} set at ${stopLossPrice.toFixed(4)} when bot stopped`,
                    },
                  })
                  await prisma.botLog.create({
                    data: {
                      level: 'info',
                      message: `Set stop-loss order ${stopLossOrder.id} for ${trade.symbol} at ${stopLossPrice.toFixed(4)}`,
                      data: { tradeId: trade.id, stopLossOrderId: stopLossOrder.id, stopLossPrice },
                    },
                  })
                } catch (error) {
                  console.error(`[TradingBot] Error setting stop-loss for trade ${trade.id}:`, error)
                  await prisma.botLog.create({
                    data: {
                      level: 'error',
                      message: `Failed to set stop-loss for trade ${trade.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                      data: { tradeId: trade.id, error: error instanceof Error ? error.toString() : String(error) },
                    },
                  })
                }
              }

              // Place take-profit order
              if (takeProfitPrice && !trade.takeProfit) {
                try {
                  const takeProfitOrder = await exchange.placeTakeProfitOrder(
                    trade.symbol,
                    trade.side as 'buy' | 'sell',
                    takeProfitPrice.toFixed(8),
                    trade.size.toFixed(8)
                  )
                  await prisma.trade.update({
                    where: { id: trade.id },
                    data: {
                      takeProfit: takeProfitPrice,
                      notes: trade.notes 
                        ? `${trade.notes}; Take-profit order ${takeProfitOrder.id} set at ${takeProfitPrice.toFixed(4)} when bot stopped`
                        : `Take-profit order ${takeProfitOrder.id} set at ${takeProfitPrice.toFixed(4)} when bot stopped`,
                    },
                  })
                  await prisma.botLog.create({
                    data: {
                      level: 'info',
                      message: `Set take-profit order ${takeProfitOrder.id} for ${trade.symbol} at ${takeProfitPrice.toFixed(4)}`,
                      data: { tradeId: trade.id, takeProfitOrderId: takeProfitOrder.id, takeProfitPrice },
                    },
                  })
                } catch (error) {
                  console.error(`[TradingBot] Error setting take-profit for trade ${trade.id}:`, error)
                  await prisma.botLog.create({
                    data: {
                      level: 'error',
                      message: `Failed to set take-profit for trade ${trade.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                      data: { tradeId: trade.id, error: error instanceof Error ? error.toString() : String(error) },
                    },
                  })
                }
              }
            } catch (error) {
              console.error(`[TradingBot] Error protecting trade ${trade.id}:`, error)
              await prisma.botLog.create({
                data: {
                  level: 'error',
                  message: `Failed to protect trade ${trade.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  data: { tradeId: trade.id, error: error instanceof Error ? error.toString() : String(error) },
                },
              })
            }
          }
        } else if (filledTrades.length > 0) {
          // No active config found
          await prisma.botLog.create({
            data: {
              level: 'warning',
              message: `Bot stopped with ${filledTrades.length} filled trade(s) but no active config - cannot set stop-loss/take-profit`,
            },
          })
        }
      }
    }

    await prisma.botLog.create({
      data: {
        level: 'info',
        message: 'Bot stopped',
      },
    })

    await prisma.botStatus.update({
      where: { id: 'main' },
      data: { isRunning: false },
    })
  }

  // Restart bot with current config (useful when config changes)
  async restart() {
    const status = await prisma.botStatus.findUnique({
      where: { id: 'main' },
    })

    const wasRunning = status?.isRunning ?? false

    if (wasRunning) {
      console.log('[TradingBot] Restarting bot to apply new configuration...')
      await this.stop()
      // Small delay to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 500))
      await this.start()
    }
  }
}

// Singleton pattern that survives hot reloads
export const tradingBot = globalForTradingBot.tradingBot ?? new TradingBot()
if (process.env.NODE_ENV !== 'production') {
  globalForTradingBot.tradingBot = tradingBot
}

