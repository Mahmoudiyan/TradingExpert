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

export type StrategyType = 
  | 'ema-only' 
  | 'ema-rsi' 
  | 'ema-rsi-trend'
  | 'mean-reversion'      // Bollinger Bands + RSI mean reversion
  | 'momentum'            // Price momentum + volume
  | 'multi-timeframe-trend' // Multi-timeframe trend confirmation

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

  // Calculate Bollinger Bands
  private calculateBollingerBands(
    klines: Kline[],
    period: number = 20,
    stdDev: number = 2
  ): { upper: number[]; middle: number[]; lower: number[] } {
    const closes = klines.map(k => parseFloat(k.close))
    const upper: number[] = []
    const middle: number[] = []
    const lower: number[] = []
    
    if (klines.length < period) {
      return { upper, middle, lower }
    }
    
    for (let i = period - 1; i < closes.length; i++) {
      const slice = closes.slice(i - period + 1, i + 1)
      const sma = slice.reduce((a, b) => a + b, 0) / period
      
      // Calculate standard deviation
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period
      const sd = Math.sqrt(variance)
      
      middle.push(sma)
      upper.push(sma + (sd * stdDev))
      lower.push(sma - (sd * stdDev))
    }
    
    // Pad beginning with zeros
    const padding = new Array(period - 1).fill(0)
    return {
      upper: [...padding, ...upper],
      middle: [...padding, ...middle],
      lower: [...padding, ...lower],
    }
  }

  // Calculate momentum (price change over period)
  private calculateMomentum(klines: Kline[], period: number = 10): number[] {
    const closes = klines.map(k => parseFloat(k.close))
    const momentum: number[] = []
    
    for (let i = 0; i < closes.length; i++) {
      if (i < period) {
        momentum.push(0)
      } else {
        const change = ((closes[i] - closes[i - period]) / closes[i - period]) * 100
        momentum.push(change)
      }
    }
    
    return momentum
  }

  // Calculate volume moving average
  private calculateVolumeMA(klines: Kline[], period: number = 20): number[] {
    const volumes = klines.map(k => parseFloat(k.volume))
    const volumeMA: number[] = []
    
    if (klines.length < period) {
      return new Array(klines.length).fill(0)
    }
    
    for (let i = 0; i < volumes.length; i++) {
      if (i < period - 1) {
        volumeMA.push(0)
      } else {
        const slice = volumes.slice(i - period + 1, i + 1)
        const avg = slice.reduce((a, b) => a + b, 0) / period
        volumeMA.push(avg)
      }
    }
    
    return volumeMA
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
    rsiOversold: number = 30,
    preferredExchange?: string
  ): Promise<BacktestResult> {
    // Get historical klines
    const startAt = Math.floor(startDate.getTime() / 1000)
    const endAt = Math.floor(endDate.getTime() / 1000)
    
    // Select appropriate exchange based on symbol (use preferred exchange if provided)
    const exchange = getExchangeForSymbol(symbol, preferredExchange)
    
    let klines
    try {
      klines = await exchange.getKlines(symbol, timeframe, startAt, endAt)
    } catch (error: unknown) {
      let errorMsg = 'Failed to fetch historical data'
      if (error instanceof Error) {
        errorMsg = error.message
      } else if (typeof error === 'object' && error !== null && 'response' in error) {
        const err = error as { response?: { data?: { msg?: string } } }
        errorMsg = err.response?.data?.msg || errorMsg
      }
      const exchangeName = exchange.getName()
      throw new Error(`Failed to fetch data for ${symbol} from ${exchangeName}: ${errorMsg}. Please check if the symbol is available on ${exchangeName}.`)
    }
    
    // Determine minimum required data based on strategy
    let minRequired = slowMA + 2
    if (strategyType === 'mean-reversion') {
      minRequired = Math.max(minRequired, 20 + 2) // Bollinger Bands needs 20 periods
    } else if (strategyType === 'momentum') {
      minRequired = Math.max(minRequired, 20 + 2) // Volume MA needs 20 periods
    } else if (strategyType === 'multi-timeframe-trend') {
      minRequired = Math.max(minRequired, Math.max(slowMA * 2, 50) + 2)
    }
    
    if (klines.length < minRequired) {
      throw new Error(`Not enough historical data for ${symbol}. Only ${klines.length} candles found, but ${minRequired} are required for ${strategyType} strategy.`)
    }

    // Calculate indicators based on strategy type
    const fastEMA = strategyType.includes('ema') || strategyType === 'multi-timeframe-trend'
      ? this.calculateEMA(klines, fastMA)
      : []
    const slowEMA = strategyType.includes('ema') || strategyType === 'multi-timeframe-trend'
      ? this.calculateEMA(klines, slowMA)
      : []
    
    // Calculate RSI if strategy requires it
    const rsi = (strategyType !== 'ema-only' && strategyType !== 'momentum')
      ? this.calculateRSI(klines, rsiPeriod)
      : []
    
    // Calculate Bollinger Bands for mean reversion
    const bb = strategyType === 'mean-reversion'
      ? this.calculateBollingerBands(klines, 20, 2)
      : { upper: [], middle: [], lower: [] }
    
    // Calculate momentum for momentum strategy
    const momentum = strategyType === 'momentum'
      ? this.calculateMomentum(klines, 10)
      : []
    
    // Calculate volume MA for momentum strategy
    const volumeMA = strategyType === 'momentum'
      ? this.calculateVolumeMA(klines, 20)
      : []
    
    // For multi-timeframe trend, use a longer EMA as trend filter
    const trendEMA = strategyType === 'multi-timeframe-trend'
      ? this.calculateEMA(klines, Math.max(slowMA * 2, 50))
      : []
    
    // Log strategy being used (for debugging)
    console.log(`[Backtest] Strategy: ${strategyType}, Klines: ${klines.length}`)

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

    // Determine starting index based on strategy
    let startIndex = slowMA
    if (strategyType === 'mean-reversion') {
      startIndex = Math.max(startIndex, 20) // Bollinger Bands
    } else if (strategyType === 'momentum') {
      startIndex = Math.max(startIndex, 20) // Volume MA
    } else if (strategyType === 'multi-timeframe-trend') {
      startIndex = Math.max(startIndex, Math.max(slowMA * 2, 50))
    }
    
    // Process each candle
    for (let i = startIndex; i < klines.length; i++) {
      const currentPrice = parseFloat(klines[i].close)
      const currentTime = klines[i].time * 1000

      // Check if we have an open position
      if (currentPosition) {
        const { side, entryPrice, size, stopLoss, takeProfit } = currentPosition
        
        // Check for stop loss or take profit
        let shouldClose = false
        let exitPrice = currentPrice

        if (side === 'buy') {
          if (currentPrice <= stopLoss) {
            shouldClose = true
            exitPrice = stopLoss
          } else if (currentPrice >= takeProfit) {
            shouldClose = true
            exitPrice = takeProfit
          }
        } else {
          if (currentPrice >= stopLoss) {
            shouldClose = true
            exitPrice = stopLoss
          } else if (currentPrice <= takeProfit) {
            shouldClose = true
            exitPrice = takeProfit
          }
        }

        // Check for signal reversal based on strategy
        if (!shouldClose && i > 0) {
          if (strategyType === 'ema-only' || strategyType === 'ema-rsi' || strategyType === 'ema-rsi-trend' || strategyType === 'multi-timeframe-trend') {
            const prevFast = fastEMA[i - 1] || 0
            const prevSlow = slowEMA[i - 1] || 0
            const currFast = fastEMA[i] || 0
            const currSlow = slowEMA[i] || 0

            if (side === 'buy' && prevFast >= prevSlow && currFast < currSlow) {
              shouldClose = true
            } else if (side === 'sell' && prevFast <= prevSlow && currFast > currSlow) {
              shouldClose = true
            }
          } else if (strategyType === 'mean-reversion') {
            // Close mean reversion trades when price returns to middle band
            const bbMiddle = bb.middle[i] || currentPrice
            if (side === 'buy' && currentPrice >= bbMiddle) {
              shouldClose = true
            } else if (side === 'sell' && currentPrice <= bbMiddle) {
              shouldClose = true
            }
          } else if (strategyType === 'momentum') {
            // Close momentum trades when momentum reverses
            const currentMomentum = i < momentum.length ? momentum[i] : 0
            if (side === 'buy' && currentMomentum < 0) {
              shouldClose = true
            } else if (side === 'sell' && currentMomentum > 0) {
              shouldClose = true
            }
          }
        }

        if (shouldClose) {
          // Calculate profit
          let profit = 0
          if (side === 'buy') {
            profit = (exitPrice - entryPrice) * size
            // For buy positions: we reserved entryPrice * size, now we get back exitPrice * size
            // This equals: entryPrice * size (capital returned) + profit
            balance += exitPrice * size
          } else {
            // For sell (short) positions: we received entryPrice * size when opening
            // Now we pay exitPrice * size to close, profit is the difference
            profit = (entryPrice - exitPrice) * size
            balance -= exitPrice * size
          }

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

        let buySignal = false
        let sellSignal = false

        // Strategy-specific signal generation
        if (strategyType === 'ema-only' || strategyType === 'ema-rsi' || strategyType === 'ema-rsi-trend') {
          const prevFast = fastEMA[i - 1] || 0
          const prevSlow = slowEMA[i - 1] || 0
          const currFast = fastEMA[i] || 0
          const currSlow = slowEMA[i] || 0

          // Buy signal: fast MA crosses above slow MA
          const emaCrossUp = prevFast <= prevSlow && currFast > currSlow
          buySignal = emaCrossUp
          
          // Apply RSI filter if strategy requires it
          if (emaCrossUp && (strategyType === 'ema-rsi' || strategyType === 'ema-rsi-trend')) {
            if (rsi.length === 0) {
              buySignal = false
              signalsFiltered++
            } else {
              const currentRSI = i < rsi.length ? rsi[i] : 50
              const prevRSI = i > 0 && (i - 1) < rsi.length ? rsi[i - 1] : 50
              
              const rsiCondition = currentRSI < rsiOverbought
              const rsiMomentum = strategyType === 'ema-rsi-trend' 
                ? (currentRSI > prevRSI || currentRSI < 50)
                : true
              
              if (!rsiCondition || !rsiMomentum) {
                signalsFiltered++
              }
              buySignal = buySignal && rsiCondition && rsiMomentum
            }
          }
          
          // Sell signal: fast MA crosses below slow MA
          const emaCrossDown = prevFast >= prevSlow && currFast < currSlow
          sellSignal = emaCrossDown
          
          if (emaCrossDown && (strategyType === 'ema-rsi' || strategyType === 'ema-rsi-trend')) {
            if (rsi.length === 0) {
              sellSignal = false
              signalsFiltered++
            } else {
              const currentRSI = i < rsi.length ? rsi[i] : 50
              const prevRSI = i > 0 && (i - 1) < rsi.length ? rsi[i - 1] : 50
              
              const rsiCondition = currentRSI > rsiOversold
              const rsiMomentum = strategyType === 'ema-rsi-trend'
                ? (currentRSI < prevRSI || currentRSI > 50)
                : true
              
              if (!rsiCondition || !rsiMomentum) {
                signalsFiltered++
              }
              sellSignal = sellSignal && rsiCondition && rsiMomentum
            }
          }
        } else if (strategyType === 'mean-reversion') {
          // Mean reversion: Buy when price touches lower BB and RSI is oversold
          // Sell when price touches upper BB and RSI is overbought
          const bbUpper = bb.upper[i] || currentPrice
          const bbLower = bb.lower[i] || currentPrice
          const currentRSI = i < rsi.length ? rsi[i] : 50
          
          // Buy signal: price near lower band and RSI oversold
          const priceNearLower = currentPrice <= bbLower * 1.01 // Within 1% of lower band
          buySignal = priceNearLower && currentRSI < rsiOversold
          
          // Sell signal: price near upper band and RSI overbought
          const priceNearUpper = currentPrice >= bbUpper * 0.99 // Within 1% of upper band
          sellSignal = priceNearUpper && currentRSI > rsiOverbought
        } else if (strategyType === 'momentum') {
          // Momentum: Buy when momentum is positive and volume is above average
          // Sell when momentum is negative and volume is above average
          const currentMomentum = i < momentum.length ? momentum[i] : 0
          const currentVolume = parseFloat(klines[i].volume)
          const avgVolume = i < volumeMA.length ? volumeMA[i] : currentVolume
          
          // Buy signal: positive momentum with volume confirmation
          buySignal = currentMomentum > 2 && currentVolume > avgVolume * 1.2
          
          // Sell signal: negative momentum with volume confirmation
          sellSignal = currentMomentum < -2 && currentVolume > avgVolume * 1.2
        } else if (strategyType === 'multi-timeframe-trend') {
          // Multi-timeframe: Use longer EMA as trend filter, shorter EMAs for entry
          const prevFast = fastEMA[i - 1] || 0
          const prevSlow = slowEMA[i - 1] || 0
          const currFast = fastEMA[i] || 0
          const currSlow = slowEMA[i] || 0
          const trendValue = i < trendEMA.length ? trendEMA[i] : currentPrice
          
          // Buy signal: fast crosses above slow AND price is above trend EMA (uptrend)
          const emaCrossUp = prevFast <= prevSlow && currFast > currSlow
          buySignal = emaCrossUp && currentPrice > trendValue
          
          // Sell signal: fast crosses below slow AND price is below trend EMA (downtrend)
          const emaCrossDown = prevFast >= prevSlow && currFast < currSlow
          sellSignal = emaCrossDown && currentPrice < trendValue
        }
        
        // Execute buy signal
        if (allowBuy && buySignal) {
          const entryPrice = currentPrice
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
            balance -= entryPrice * size
          }
        }
        
        // Execute sell signal
        if (allowSell && sellSignal) {
          const entryPrice = currentPrice
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
            balance += entryPrice * size
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
        // For buy positions: return capital + profit
        balance += lastPrice * size
      } else {
        profit = (entryPrice - lastPrice) * size
        // For sell (short) positions: pay to close the position
        balance -= lastPrice * size
      }

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

