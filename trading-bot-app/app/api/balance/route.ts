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
    const tradingAccounts = accounts.filter(acc => acc.type === 'trade')
    
    // Find the account with the base currency (USDT for KuCoin, USD for OANDA)
    const mainAccount = tradingAccounts.find(acc => acc.currency === baseCurrency) || tradingAccounts[0]
    
    // If no account found, try to get balance for base currency
    let totalBalance = 0
    let availableBalance = 0
    
    if (mainAccount) {
      totalBalance = parseFloat(mainAccount.balance)
      availableBalance = parseFloat(mainAccount.available)
    } else {
      // Fallback: try to get balance for base currency
      try {
        availableBalance = await exchange.getBalance(baseCurrency)
        totalBalance = availableBalance
      } catch (error) {
        console.error(`Error getting balance for ${baseCurrency}:`, error)
        // If that fails, try to sum all trading accounts
        totalBalance = tradingAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0)
        availableBalance = tradingAccounts.reduce((sum, acc) => sum + parseFloat(acc.available), 0)
        // Use the currency of the first account if we can't find base currency
        if (tradingAccounts.length > 0) {
          baseCurrency = tradingAccounts[0].currency
        }
      }
    }

    return NextResponse.json({
      balance: availableBalance,
      currency: mainAccount?.currency || baseCurrency,
      availableBalance,
      totalBalance,
      exchange: exchange.getName(),
      // Note: symbol is not included as balance is not symbol-specific
    })
  } catch (error: any) {
    console.error('Error fetching balance:', error)
    return NextResponse.json(
      { 
        balance: 0,
        currency: 'USD',
        availableBalance: 0,
        totalBalance: 0,
        error: error.message || 'Failed to fetch balance'
      },
      { status: 500 }
    )
  }
}

