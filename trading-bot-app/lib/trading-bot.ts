import { getExchangeForSymbol } from './exchange/router'
import type { Kline } from './exchange/interface'
import { prisma } from './db'
import { format, subDays } from 'date-fns'

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

export class TradingBot {
  private isRunning = false
  private intervalId: NodeJS.Timeout | null = null

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
  async getSignal(symbol: string, fastMA: number, slowMA: number, timeframe: string): Promise<TradingSignal> {
    try {
      // Get appropriate exchange for symbol
      const exchange = getExchangeForSymbol(symbol)
      
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
  async checkSpread(symbol: string, maxSpreadPercent: number): Promise<boolean> {
    try {
      const exchange = getExchangeForSymbol(symbol)
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
    config: any
  ) {
    try {
      const exchange = getExchangeForSymbol(symbol)
      const order = await exchange.placeMarketOrder(
        symbol,
        side,
        size.toFixed(8)
      )

      // Save trade to database
      const trade = await prisma.trade.create({
        data: {
          orderId: order.id,
          symbol,
          side,
          type: 'market',
          price: parseFloat(order.price || '0'),
          size,
          status: order.status,
        },
      })

      // Log trade
      await prisma.botLog.create({
        data: {
          level: 'info',
          message: `Trade executed: ${side.toUpperCase()} ${size} ${symbol}`,
          data: { orderId: order.id, tradeId: trade.id },
        },
      })

      return { success: true, trade, order }
    } catch (error: any) {
      await prisma.botLog.create({
        data: {
          level: 'error',
          message: `Trade failed: ${error.message}`,
          data: { error: error.toString() },
        },
      })
      throw error
    }
  }

  // Main trading loop
  async runTradingLoop() {
    if (this.isRunning) return

    this.isRunning = true
    
    try {
      // Get active config
      const config = await prisma.botConfig.findFirst({
        where: { isActive: true },
      })

      if (!config) {
        await prisma.botLog.create({
          data: {
            level: 'warning',
            message: 'No active bot configuration found',
          },
        })
        this.isRunning = false
        return
      }

      // Check if we have open positions
      const openTrades = await prisma.trade.findMany({
        where: {
          symbol: config.symbol,
          status: { in: ['pending', 'filled'] },
        },
      })

      if (openTrades.length > 0) {
        // Manage existing positions (check if they should be closed)
        // For now, we'll just skip if there's an open position
        this.isRunning = false
        return
      }

      // Get signal
      const signal = await this.getSignal(
        config.symbol,
        config.fastMA,
        config.slowMA,
        config.timeframe
      )

      if (signal.signal === 'none') {
        this.isRunning = false
        return
      }

      // Check if trading is allowed for this direction
      if (signal.signal === 'buy' && !config.allowBuy) {
        this.isRunning = false
        return
      }
      if (signal.signal === 'sell' && !config.allowSell) {
        this.isRunning = false
        return
      }

      // Check spread
      const spreadOK = await this.checkSpread(config.symbol, config.maxSpreadPips)
      if (!spreadOK) {
        await prisma.botLog.create({
          data: {
            level: 'warning',
            message: `Spread too wide for ${config.symbol}`,
          },
        })
        this.isRunning = false
        return
      }

      // Get balance
      const exchange = getExchangeForSymbol(config.symbol)
      // For forex, use the quote currency; for crypto, use the quote currency (e.g., USDT)
      const baseCurrency = config.symbol.split('-')[1] || config.symbol.split('_')[1] || 'USD'
      const balance = await exchange.getBalance(baseCurrency)

      if (balance <= 0) {
        await prisma.botLog.create({
          data: {
            level: 'error',
            message: `Insufficient balance: ${balance} ${baseCurrency}`,
          },
        })
        this.isRunning = false
        return
      }

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

      if (positionSize <= 0) {
        this.isRunning = false
        return
      }

      // Execute trade
      await this.executeTrade(config.symbol, signal.signal, positionSize, config)

      // Update bot status
      await this.updateBotStatus()

    } catch (error: any) {
      await prisma.botLog.create({
        data: {
          level: 'error',
          message: `Trading loop error: ${error.message}`,
          data: { error: error.toString() },
        },
      })
    } finally {
      this.isRunning = false
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

  // Start bot
  async start(intervalMinutes: number = 15) {
    if (this.intervalId) {
      await this.stop()
    }

    this.intervalId = setInterval(() => {
      this.runTradingLoop()
    }, intervalMinutes * 60 * 1000)

    // Run immediately
    await this.runTradingLoop()

    await prisma.botStatus.update({
      where: { id: 'main' },
      data: { isRunning: true },
    })
  }

  // Stop bot
  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    await prisma.botStatus.update({
      where: { id: 'main' },
      data: { isRunning: false },
    })
  }
}

export const tradingBot = new TradingBot()

