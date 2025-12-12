import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getExchangeForSymbol, getExchangeByName } from '@/lib/exchange/router'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const exchangeParam = searchParams.get('exchange')
    
    let exchange
    let baseCurrency
    
    // If exchange is provided, use it directly
    if (exchangeParam) {
      exchange = getExchangeByName(exchangeParam)
      // Set base currency based on exchange
      baseCurrency = exchangeParam === 'OANDA' ? 'USD' : 'USDT'
    } else {
      // Otherwise, get from active config
      const config = await prisma.botConfig.findFirst({
        where: { isActive: true },
      })

      if (!config) {
        return NextResponse.json({
          balance: 0,
          currency: 'USD',
          availableBalance: 0,
          totalBalance: 0,
          exchange: null,
          message: 'No active configuration found',
        })
      }

      // Get exchange from config
      exchange = getExchangeForSymbol(config.symbol, config.exchange)
      // Set base currency based on exchange
      baseCurrency = (config.exchange === 'OANDA') ? 'USD' : 'USDT'
    }

    // Get all accounts to find the main trading account balance
    const accounts = await exchange.getAccounts()
    console.log('[Balance API] All accounts received:', accounts.length)
    console.log('[Balance API] Account details:', JSON.stringify(accounts, null, 2))
    
    // For KuCoin, show separate main and trade balances
    const isKuCoin = exchange.getName() === 'KuCoin'
    let totalBalance = 0
    let availableBalance = 0
    let finalCurrency = baseCurrency
    let mainBalance = 0
    let tradeBalance = 0
    let mainAvailable = 0
    let tradeAvailable = 0
    
    if (isKuCoin) {
      // For KuCoin, get separate balances
      try {
        const kucoinService = exchange as any
        if (typeof kucoinService.getSeparateBalances === 'function') {
          const separateBalances = await kucoinService.getSeparateBalances(baseCurrency)
          mainBalance = separateBalances.main
          tradeBalance = separateBalances.trade
          mainAvailable = separateBalances.mainAvailable
          tradeAvailable = separateBalances.tradeAvailable
          totalBalance = mainBalance + tradeBalance
          availableBalance = mainAvailable + tradeAvailable
          finalCurrency = baseCurrency
          
          console.log('[Balance API] KuCoin separate balances:', {
            main: mainBalance,
            trade: tradeBalance,
            mainAvailable,
            tradeAvailable
          })
        } else {
          // Fallback to old method
          const baseCurrencyAccounts = accounts.filter(acc => 
            (acc.currency || '').toUpperCase() === baseCurrency.toUpperCase()
          )
          const mainAccount = baseCurrencyAccounts.find(acc => acc.type === 'main')
          const tradeAccount = baseCurrencyAccounts.find(acc => acc.type === 'trade')
          
          mainBalance = mainAccount ? parseFloat(mainAccount.balance || '0') : 0
          tradeBalance = tradeAccount ? parseFloat(tradeAccount.balance || '0') : 0
          mainAvailable = mainAccount ? parseFloat(mainAccount.available || '0') : 0
          tradeAvailable = tradeAccount ? parseFloat(tradeAccount.available || '0') : 0
          totalBalance = mainBalance + tradeBalance
          availableBalance = mainAvailable + tradeAvailable
        }
      } catch (error) {
        console.error('[Balance API] Error getting separate balances:', error)
        // Fallback to summing all accounts
        const baseCurrencyAccounts = accounts.filter(acc => 
          (acc.currency || '').toUpperCase() === baseCurrency.toUpperCase()
        )
        totalBalance = baseCurrencyAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0)
        availableBalance = baseCurrencyAccounts.reduce((sum, acc) => sum + parseFloat(acc.available || '0'), 0)
      }
    } else {
      // For other exchanges (OANDA), use standard method
      const baseCurrencyAccounts = accounts.filter(acc => 
        (acc.currency || '').toUpperCase() === baseCurrency.toUpperCase()
      )
      
      if (baseCurrencyAccounts.length > 0) {
        totalBalance = baseCurrencyAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0)
        availableBalance = baseCurrencyAccounts.reduce((sum, acc) => sum + parseFloat(acc.available || '0'), 0)
      } else {
        // Fallback: try to get balance using getBalance method
        try {
          availableBalance = await exchange.getBalance(baseCurrency)
          totalBalance = availableBalance
        } catch (error) {
          console.error(`Error getting balance for ${baseCurrency}:`, error)
          totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0)
          availableBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.available || '0'), 0)
        }
      }
    }

    return NextResponse.json({
      balance: availableBalance,
      currency: finalCurrency,
      availableBalance,
      totalBalance,
      exchange: exchange.getName(),
      // KuCoin-specific: separate balances
      ...(isKuCoin && {
        mainBalance,
        tradeBalance,
        mainAvailable,
        tradeAvailable,
      }),
    })
  } catch (error: unknown) {
    console.error('Error fetching balance:', error)
    
    // Extract detailed error message
    let errorMessage = 'Failed to fetch balance'
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
        balance: 0,
        currency: 'USD',
        availableBalance: 0,
        totalBalance: 0,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      },
      { status: 500 }
    )
  }
}

