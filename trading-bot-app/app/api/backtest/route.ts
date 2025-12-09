import { NextResponse } from 'next/server'
import { backtestService } from '@/lib/backtest'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    const {
      symbol,
      exchange,
      timeframe,
      startDate,
      endDate,
      fastMA,
      slowMA,
      riskPercent,
      stopLossPips,
      takeProfitPips,
      initialBalance,
      allowBuy,
      allowSell,
      strategyType,
      rsiPeriod,
      rsiOverbought,
      rsiOversold,
    } = body

    if (!symbol || !timeframe || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const finalStrategyType = (strategyType || 'ema-rsi') as 'ema-only' | 'ema-rsi' | 'ema-rsi-trend' | 'mean-reversion' | 'momentum' | 'multi-timeframe-trend'
    
    console.log(`[Backtest API] Strategy: ${finalStrategyType}, Symbol: ${symbol}, RSI Period: ${rsiPeriod || 14}`)
    
    const result = await backtestService.runBacktest(
      symbol,
      timeframe,
      new Date(startDate),
      new Date(endDate),
      fastMA || 9,
      slowMA || 21,
      riskPercent || 1.5,
      stopLossPips || 30,
      takeProfitPips || 75,
      initialBalance || 10000,
      allowBuy !== false,
      allowSell !== false,
      finalStrategyType,
      rsiPeriod || 14,
      rsiOverbought || 70,
      rsiOversold || 30,
      exchange
    )

    return NextResponse.json(result)
  } catch (error: unknown) {
    console.error('Backtest error:', error)
    
    // Extract detailed error message
    let errorMessage = 'Backtest failed'
    if (error instanceof Error) {
      errorMessage = error.message
      if (error.stack) {
        console.error('Error stack:', error.stack)
      }
    } else if (typeof error === 'object' && error !== null && 'response' in error) {
      const err = error as { response?: { data?: { msg?: string; message?: string } } }
      if (err.response?.data?.msg) {
        errorMessage = err.response.data.msg
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

