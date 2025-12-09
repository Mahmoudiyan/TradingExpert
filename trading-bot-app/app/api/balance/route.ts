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
    
    // For KuCoin, balance can be in "main" or "trade" accounts
    // We should sum all accounts of the base currency across all account types
    // Filter accounts by the base currency (case-insensitive)
    const baseCurrencyAccounts = accounts.filter(acc => 
      (acc.currency || '').toUpperCase() === baseCurrency.toUpperCase()
    )
    
    console.log('[Balance API] Base currency accounts found:', baseCurrencyAccounts.length)
    
    // Sum all balances for the base currency across all account types
    let totalBalance = 0
    let availableBalance = 0
    let finalCurrency = baseCurrency
    
    if (baseCurrencyAccounts.length > 0) {
      // Sum all balances and available amounts
      totalBalance = baseCurrencyAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0)
      availableBalance = baseCurrencyAccounts.reduce((sum, acc) => sum + parseFloat(acc.available || '0'), 0)
      
      console.log('[Balance API] Summed balances for', baseCurrency, '- total:', totalBalance, 'available:', availableBalance)
      console.log('[Balance API] Account breakdown:', baseCurrencyAccounts.map(acc => ({
        type: acc.type,
        balance: acc.balance,
        available: acc.available
      })))
      
      // If we still have 0, try to find the account with the highest balance
      if (totalBalance === 0 && availableBalance === 0) {
        console.log('[Balance API] No balance found in base currency, checking all accounts')
        // Try to find any account with balance > 0
        const accountWithBalance = accounts.find(acc => parseFloat(acc.balance || '0') > 0)
        if (accountWithBalance) {
          totalBalance = parseFloat(accountWithBalance.balance || '0')
          availableBalance = parseFloat(accountWithBalance.available || '0')
          finalCurrency = accountWithBalance.currency || baseCurrency
          console.log('[Balance API] Found account with balance:', {
            currency: finalCurrency,
            type: accountWithBalance.type,
            balance: totalBalance,
            available: availableBalance
          })
        }
      }
    } else {
      console.log('[Balance API] No accounts found for base currency, trying fallback')
      // Fallback: try to get balance for base currency using getBalance method
      try {
        availableBalance = await exchange.getBalance(baseCurrency)
        totalBalance = availableBalance
        finalCurrency = baseCurrency
        console.log('[Balance API] Fallback getBalance result:', availableBalance)
      } catch (error) {
        console.error(`Error getting balance for ${baseCurrency}:`, error)
        // Last resort: sum all accounts
        totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0)
        availableBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.available || '0'), 0)
        console.log('[Balance API] Summed all accounts - total:', totalBalance, 'available:', availableBalance)
      }
    }

    return NextResponse.json({
      balance: availableBalance,
      currency: finalCurrency,
      availableBalance,
      totalBalance,
      exchange: exchange.getName(),
      // Note: symbol is not included as balance is not symbol-specific
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

