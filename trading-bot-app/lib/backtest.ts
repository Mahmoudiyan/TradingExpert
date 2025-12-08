import { getExchangeForSymbol } from './exchange/router'
import type { Kline } from './exchange/interface'

export interface BacktestResult {
  startDate: string
  endDate: string
  initialBalance: number
  finalBalance: number
  totalProfit: number
  totalProfitPercent: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  maxDrawdown: number
  maxDrawdownPercent: number
  sharpeRatio: number
  trades: BacktestTrade[]
  strategyUsed?: string
  signalsFiltered?: number
}

export interface BacktestTrade {
  entryDate: string
  exitDate: string
  symbol: string
  side: 'buy' | 'sell'
  entryPrice: number
  exitPrice: number
  size: number
  profit: number
  profitPercent: number
  stopLoss?: number
  takeProfit?: number
}

export type StrategyType = 'ema-only' | 'ema-rsi' | 'ema-rsi-trend'

export class BacktestService {
  // Calculate RSI (Relative Strength Index)
  private calculateRSI(klines: Kline[], period: number = 14): number[] {
    if (klines.length < period + 1) {
      // Return array of 50s (neutral RSI) if not enough data
      return new Array(klines.length).fill(50)
    }
    
    const closes = klines.map(k => parseFloat(k.close))
    const rsi: number[] = new Array(klines.length).fill(50) // Initialize with neutral RSI
    
    // Calculate price changes
    const changes: number[] = []
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1])
    }
    
    if (changes.length < period) {
      return rsi
    }
    
    // Calculate initial average gain and loss
    let avgGain = 0
    let avgLoss = 0
    
    for (let i = 0; i < period; i++) {
      if (changes[i] > 0) {
        avgGain += changes[i]
      } else {
        avgLoss += Math.abs(changes[i])
      }
    }
    avgGain /= period
    avgLoss /= period
    
    // Calculate RSI starting from index period+1 (since we need period changes before calculating)
    for (let i = period; i < changes.length; i++) {
      const change = changes[i]
      const gain = change > 0 ? change : 0
      const loss = change < 0 ? Math.abs(change) : 0
      
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
      
      // RSI[i+1] corresponds to kline[i+1] because changes[i] = closes[i+1] - closes[i]
      const rsiIndex = i + 1
      if (avgLoss === 0) {
        rsi[rsiIndex] = 100
      } else {
        const rs = avgGain / avgLoss
        rsi[rsiIndex] = 100 - (100 / (1 + rs))
      }
    }
    
    return rsi
  }

  // Calculate EMA
  private calculateEMA(klines: Kline[], period: number): number[] {
    if (klines.length < period) return []
    
    const closes = klines.map(k => parseFloat(k.close))
    const multiplier = 2 / (period + 1)
    const ema: number[] = []
    
    // Initialize with SMA
    let sum = 0
    for (let i = 0; i < period; i++) {
      sum += closes[i]
      ema.push(0) // placeholder
    }
    ema[period - 1] = sum / period
    
    // Calculate EMA for remaining periods
    for (let i = period; i < closes.length; i++) {
      ema.push((closes[i] - ema[i - 1]) * multiplier + ema[i - 1])
    }
    
    return ema
  }

  // Calculate position size based on risk
  private calculatePositionSize(
    balance: number,
    riskPercent: number,
    entryPrice: number,
    stopLossPrice: number
  ): number {
    const riskAmount = balance * (riskPercent / 100)
    const priceDiff = Math.abs(entryPrice - stopLossPrice)
    
    if (priceDiff === 0) return 0
    
    const positionSize = riskAmount / priceDiff
    return Math.max(0, Math.min(positionSize, balance / entryPrice))
  }

  // Run backtest
  async runBacktest(
    symbol: string,
    timeframe: string,
    startDate: Date,
    endDate: Date,
    fastMA: number,
    slowMA: number,
    riskPercent: number,
    stopLossPips: number,
    takeProfitPips: number,
    initialBalance: number,
    allowBuy: boolean = true,
    allowSell: boolean = true,
    strategyType: StrategyType = 'ema-rsi',
    rsiPeriod: number = 14,
    rsiOverbought: number = 70,
    rsiOversold: number = 30
  ): Promise<BacktestResult> {
    // Get historical klines
    const startAt = Math.floor(startDate.getTime() / 1000)
    const endAt = Math.floor(endDate.getTime() / 1000)
    
    // Select appropriate exchange based on symbol
    const exchange = getExchangeForSymbol(symbol)
    
    let klines
    try {
      klines = await exchange.getKlines(symbol, timeframe, startAt, endAt)
    } catch (error: any) {
      const errorMsg = error?.response?.data?.msg || error?.message || 'Failed to fetch historical data'
      const exchangeName = exchange.getName()
      throw new Error(`Failed to fetch data for ${symbol} from ${exchangeName}: ${errorMsg}. Please check if the symbol is available on ${exchangeName}.`)
    }
    
    if (klines.length < slowMA + 2) {
      throw new Error(`Not enough historical data for ${symbol}. Only ${klines.length} candles found, but ${slowMA + 2} are required.`)
    }

    // Calculate EMAs
    const fastEMA = this.calculateEMA(klines, fastMA)
    const slowEMA = this.calculateEMA(klines, slowMA)
    
    // Calculate RSI if strategy requires it
    const rsi = strategyType !== 'ema-only' 
      ? this.calculateRSI(klines, rsiPeriod)
      : []
    
    // Log strategy being used (for debugging)
    console.log(`[Backtest] Strategy: ${strategyType}, RSI calculated: ${rsi.length > 0}, Klines: ${klines.length}`)

    let balance = initialBalance
    const trades: BacktestTrade[] = []
    let currentPosition: {
      side: 'buy' | 'sell'
      entryPrice: number
      entryIndex: number
      size: number
      stopLoss: number
      takeProfit: number
    } | null = null

    let peakBalance = initialBalance
    let maxDrawdown = 0
    let maxDrawdownPercent = 0
    let signalsFiltered = 0 // Track how many EMA crossover signals were filtered by RSI

    // Process each candle
    for (let i = slowMA; i < klines.length; i++) {
      const currentPrice = parseFloat(klines[i].close)
      const currentTime = klines[i].time * 1000

      // Check if we have an open position
      if (currentPosition) {
        const { side, entryPrice, size, stopLoss, takeProfit } = currentPosition
        
        // Check for stop loss or take profit
        let shouldClose = false
        let exitPrice = currentPrice
        let exitReason = ''

        if (side === 'buy') {
          if (currentPrice <= stopLoss) {
            shouldClose = true
            exitPrice = stopLoss
            exitReason = 'stop loss'
          } else if (currentPrice >= takeProfit) {
            shouldClose = true
            exitPrice = takeProfit
            exitReason = 'take profit'
          }
        } else {
          if (currentPrice >= stopLoss) {
            shouldClose = true
            exitPrice = stopLoss
            exitReason = 'stop loss'
          } else if (currentPrice <= takeProfit) {
            shouldClose = true
            exitPrice = takeProfit
            exitReason = 'take profit'
          }
        }

        // Check for signal reversal (opposite crossover)
        if (!shouldClose && i > 0) {
          const prevFast = fastEMA[i - 1]
          const prevSlow = slowEMA[i - 1]
          const currFast = fastEMA[i]
          const currSlow = slowEMA[i]

          if (side === 'buy' && prevFast >= prevSlow && currFast < currSlow) {
            shouldClose = true
            exitReason = 'signal reversal'
          } else if (side === 'sell' && prevFast <= prevSlow && currFast > currSlow) {
            shouldClose = true
            exitReason = 'signal reversal'
          }
        }

        if (shouldClose) {
          // Calculate profit
          let profit = 0
          if (side === 'buy') {
            profit = (exitPrice - entryPrice) * size
          } else {
            profit = (entryPrice - exitPrice) * size
          }

          balance += profit
          const profitPercent = (profit / (entryPrice * size)) * 100

          trades.push({
            entryDate: new Date(klines[currentPosition.entryIndex].time * 1000).toISOString(),
            exitDate: new Date(currentTime).toISOString(),
            symbol,
            side,
            entryPrice,
            exitPrice,
            size,
            profit,
            profitPercent,
            stopLoss,
            takeProfit,
          })

          currentPosition = null
        }
      } else {
        // Look for new entry signal
        if (i === 0) continue

        const prevFast = fastEMA[i - 1]
        const prevSlow = slowEMA[i - 1]
        const currFast = fastEMA[i]
        const currSlow = slowEMA[i]

        // Buy signal: fast MA crosses above slow MA
        const emaCrossUp = prevFast <= prevSlow && currFast > currSlow
        let buySignal = emaCrossUp
        
        // Apply RSI filter if strategy requires it
        if (emaCrossUp && (strategyType === 'ema-rsi' || strategyType === 'ema-rsi-trend')) {
          if (rsi.length === 0) {
            // RSI not available, skip this signal
            buySignal = false
            signalsFiltered++
          } else {
            const currentRSI = i < rsi.length ? rsi[i] : 50
            const prevRSI = i > 0 && (i - 1) < rsi.length ? rsi[i - 1] : 50
            
            // Add RSI confirmation: RSI should not be overbought for buy signals
            // For buy: RSI should be below overbought level (not buying at the top)
            const rsiCondition = currentRSI < rsiOverbought
            
            // Optional: RSI momentum confirmation for trend strategy
            const rsiMomentum = strategyType === 'ema-rsi-trend' 
              ? (currentRSI > prevRSI || currentRSI < 50) // Rising RSI or neutral
              : true // No momentum requirement for ema-rsi
            
            if (!rsiCondition || !rsiMomentum) {
              signalsFiltered++
            }
            buySignal = buySignal && rsiCondition && rsiMomentum
          }
        }
        
        if (allowBuy && buySignal) {
          const entryPrice = currentPrice
          // Calculate stop loss as percentage (assuming stopLossPips is in basis points, e.g., 100 = 1%)
          const stopLossPercent = stopLossPips / 10000
          const stopLossPrice = entryPrice * (1 - stopLossPercent)
          const takeProfitPercent = takeProfitPips / 10000
          const takeProfitPrice = entryPrice * (1 + takeProfitPercent)
          const size = this.calculatePositionSize(balance, riskPercent, entryPrice, stopLossPrice)

          if (size > 0 && balance >= entryPrice * size) {
            currentPosition = {
              side: 'buy',
              entryPrice,
              entryIndex: i,
              size,
              stopLoss: stopLossPrice,
              takeProfit: takeProfitPrice,
            }
            balance -= entryPrice * size // Reserve funds
          }
        }
        
        // Sell signal: fast MA crosses below slow MA
        const emaCrossDown = prevFast >= prevSlow && currFast < currSlow
        let sellSignal = emaCrossDown
        
        // Apply RSI filter if strategy requires it
        if (emaCrossDown && (strategyType === 'ema-rsi' || strategyType === 'ema-rsi-trend')) {
          if (rsi.length === 0) {
            // RSI not available, skip this signal
            sellSignal = false
            signalsFiltered++
          } else {
            const currentRSI = i < rsi.length ? rsi[i] : 50
            const prevRSI = i > 0 && (i - 1) < rsi.length ? rsi[i - 1] : 50
            
            // Add RSI confirmation: RSI should not be oversold for sell signals
            // For sell: RSI should be above oversold level (not selling at the bottom)
            const rsiCondition = currentRSI > rsiOversold
            
            // Optional: RSI momentum confirmation for trend strategy
            const rsiMomentum = strategyType === 'ema-rsi-trend'
              ? (currentRSI < prevRSI || currentRSI > 50) // Falling RSI or neutral
              : true // No momentum requirement for ema-rsi
            
            if (!rsiCondition || !rsiMomentum) {
              signalsFiltered++
            }
            sellSignal = sellSignal && rsiCondition && rsiMomentum
          }
        }
        
        if (allowSell && sellSignal) {
          const entryPrice = currentPrice
          // Calculate stop loss as percentage (for sell, stop loss is above entry)
          const stopLossPercent = stopLossPips / 10000
          const stopLossPrice = entryPrice * (1 + stopLossPercent)
          const takeProfitPercent = takeProfitPips / 10000
          const takeProfitPrice = entryPrice * (1 - takeProfitPercent)
          const size = this.calculatePositionSize(balance, riskPercent, entryPrice, stopLossPrice)

          if (size > 0 && balance >= entryPrice * size) {
            currentPosition = {
              side: 'sell',
              entryPrice,
              entryIndex: i,
              size,
              stopLoss: stopLossPrice,
              takeProfit: takeProfitPrice,
            }
            balance -= entryPrice * size // Reserve funds
          }
        }
      }

      // Track drawdown
      if (balance > peakBalance) {
        peakBalance = balance
      }
      const drawdown = peakBalance - balance
      const drawdownPercent = (drawdown / peakBalance) * 100
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
        maxDrawdownPercent = drawdownPercent
      }
    }

    // Close any remaining position at the end
    if (currentPosition && klines.length > 0) {
      const lastPrice = parseFloat(klines[klines.length - 1].close)
      const { side, entryPrice, size, entryIndex } = currentPosition
      
      let profit = 0
      if (side === 'buy') {
        profit = (lastPrice - entryPrice) * size
      } else {
        profit = (entryPrice - lastPrice) * size
      }

      balance += profit
      const profitPercent = (profit / (entryPrice * size)) * 100

      trades.push({
        entryDate: new Date(klines[entryIndex].time * 1000).toISOString(),
        exitDate: new Date(klines[klines.length - 1].time * 1000).toISOString(),
        symbol,
        side,
        entryPrice,
        exitPrice: lastPrice,
        size,
        profit,
        profitPercent,
        stopLoss: currentPosition.stopLoss,
        takeProfit: currentPosition.takeProfit,
      })
    }

    // Calculate statistics
    const totalProfit = balance - initialBalance
    const totalProfitPercent = (totalProfit / initialBalance) * 100
    const winningTrades = trades.filter(t => t.profit > 0).length
    const losingTrades = trades.filter(t => t.profit < 0).length
    const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0

    // Calculate Sharpe Ratio (simplified)
    const returns = trades.map(t => t.profitPercent)
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
    const variance = returns.length > 0
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      : 0
    const stdDev = Math.sqrt(variance)
    const sharpeRatio = stdDev !== 0 ? avgReturn / stdDev : 0

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      initialBalance,
      finalBalance: balance,
      totalProfit,
      totalProfitPercent,
      totalTrades: trades.length,
      winningTrades,
      losingTrades,
      winRate,
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      trades,
      strategyUsed: strategyType,
      signalsFiltered,
    }
  }
}

export const backtestService = new BacktestService()

