import { NextResponse } from 'next/server'
import { getExchangeForSymbol, getExchangeName } from '@/lib/exchange/router'
import { kucoinService } from '@/lib/kucoin'
import { oandaService } from '@/lib/exchange/oanda'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const exchangeParam = searchParams.get('exchange') // 'KuCoin' or 'OANDA'
    const symbol = searchParams.get('symbol') || (exchangeParam === 'OANDA' ? 'EUR-USD' : 'BTC-USDT')
    
    // Use specified exchange or auto-detect
    let exchange
    let exchangeName
    
    if (exchangeParam === 'OANDA') {
      exchange = oandaService
      exchangeName = 'OANDA'
    } else if (exchangeParam === 'KuCoin') {
      exchange = kucoinService
      exchangeName = 'KuCoin'
    } else {
      // Fallback to auto-detection
      exchange = getExchangeForSymbol(symbol)
      exchangeName = getExchangeName(symbol)
    }
    
    // Check credentials based on exchange
    if (exchangeName === 'OANDA') {
      const apiKey = process.env.OANDA_API_KEY
      const accountId = process.env.OANDA_ACCOUNT_ID

      if (!apiKey || !accountId) {
        return NextResponse.json(
          {
            success: false,
            message: 'OANDA API credentials not configured',
            error: `Missing: ${!apiKey ? 'OANDA_API_KEY ' : ''}${!accountId ? 'OANDA_ACCOUNT_ID' : ''}`,
          },
          { status: 400 }
        )
      }
    } else {
      // KuCoin
      const apiKey = process.env.KC_API_KEY
      const apiSecret = process.env.KC_API_SECRET
      const apiPassphrase = process.env.KC_API_PASSPHRASE

      if (!apiKey || !apiSecret || !apiPassphrase) {
        return NextResponse.json(
          {
            success: false,
            message: 'KuCoin API credentials not configured',
            error: `Missing: ${!apiKey ? 'KC_API_KEY ' : ''}${!apiSecret ? 'KC_API_SECRET ' : ''}${!apiPassphrase ? 'KC_API_PASSPHRASE' : ''}`,
          },
          { status: 400 }
        )
      }
    }

    // Test 1: Get accounts (balance check)
    const accounts = await exchange.getAccounts()
    
    // Test 2: Get ticker (market data check)
    const ticker = await exchange.getTicker(symbol)
    
    // Test 3: Get klines (historical data check)
    const klines = await exchange.getKlines(symbol, '1hour', undefined, undefined)
    
    // Get trading account balance
    const tradingAccounts = accounts.filter(acc => acc.type === 'trade')
    const mainCurrency = symbol.includes('-') ? symbol.split('-')[1] : 'USD'
    const mainAccount = tradingAccounts.find(acc => acc.currency === mainCurrency) || tradingAccounts[0]
    
    const responseData = {
      success: true,
      message: `${exchangeName} API connection successful`,
      exchange: exchangeName,
      data: {
        accounts: {
          total: accounts.length,
          trading: tradingAccounts.length,
          balance: mainAccount ? parseFloat(mainAccount.available) : 0,
          currency: mainAccount?.currency || mainCurrency,
        },
        market: {
          symbol,
          price: ticker.price,
          bid: ticker.bestBid,
          ask: ticker.bestAsk,
        },
        historical: {
          klinesReceived: klines.length,
          latestPrice: klines.length > 0 ? parseFloat(klines[klines.length - 1].close) : null,
        },
      },
    }
    
    return NextResponse.json(responseData)
  } catch (error: any) {
    console.error('API test error:', error)
    console.error('Error stack:', error.stack)
    console.error('Error response:', error.response)
    
    // Extract more detailed error information
    let errorMessage = 'API connection failed'
    let errorDetails = 'Unknown error'
    
    // Try different error formats
    if (error.response?.data) {
      errorMessage = error.response.data.msg || error.response.data.message || error.response.data.code || errorMessage
      errorDetails = JSON.stringify(error.response.data, null, 2)
    } else if (error.data) {
      errorMessage = error.data.msg || error.data.message || error.data.code || errorMessage
      errorDetails = JSON.stringify(error.data, null, 2)
    } else if (error.message) {
      errorMessage = error.message
      errorDetails = error.toString()
    } else if (typeof error === 'string') {
      errorMessage = error
      errorDetails = error
    } else {
      errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    }
    
    return NextResponse.json(
      {
        success: false,
        message: errorMessage,
        error: errorDetails,
      },
      { status: 500 }
    )
  }
}

