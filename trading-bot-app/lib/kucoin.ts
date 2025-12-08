// Import fetch polyfill FIRST - must run before SDK loads
require('./fetch-polyfill')

// Ensure fetch is available before requiring SDK
// The SDK may capture fetch reference at load time
if (typeof globalThis.fetch !== 'function' && typeof global?.fetch !== 'function') {
  try {
    const nodeFetch = require('node-fetch')
    const fetchImpl = typeof nodeFetch === 'function' ? nodeFetch : (nodeFetch.default || nodeFetch)
    globalThis.fetch = fetchImpl
    if (typeof global !== 'undefined') {
      global.fetch = fetchImpl
    }
  } catch (e) {
    console.error('Failed to ensure fetch before SDK load:', e)
  }
}

// Use CommonJS require for kucoin-node-sdk as it doesn't support ES6 imports
// Load SDK AFTER fetch is guaranteed to be available
const API = require('kucoin-node-sdk')

// Re-ensure fetch is available right before init (SDK might check at init time)
if (typeof globalThis.fetch !== 'function') {
  try {
    const nodeFetch = require('node-fetch')
    const fetchImpl = typeof nodeFetch === 'function' ? nodeFetch : (nodeFetch.default || nodeFetch)
    globalThis.fetch = fetchImpl
    if (typeof global !== 'undefined') {
      global.fetch = fetchImpl
    }
  } catch (e) {
    console.error('Failed to ensure fetch before SDK init:', e)
  }
}

// Initialize the SDK
API.init({
  baseUrl: process.env.KC_SANDBOX === 'true' 
    ? 'https://openapi-sandbox.kucoin.com' 
    : 'https://openapi-v2.kucoin.com',
  apiAuth: {
    key: process.env.KC_API_KEY || '',
    secret: process.env.KC_API_SECRET || '',
    passphrase: process.env.KC_API_PASSPHRASE || '',
  },
  authVersion: 2,
})

// CRITICAL: Patch the SDK's internal fetch after initialization
// The SDK loads fetch at module level, but it might not be a function
// We need to ensure the SDK uses our working fetch
try {
  // Get the working fetch from globalThis (set by polyfill)
  const workingFetch = globalThis.fetch || global?.fetch
  if (typeof workingFetch === 'function') {
    // Try to patch the SDK's internal modules
    // The SDK uses fetch in createHttp.js, and it's stored in a closure
    // We need to patch it in the HTTP client instances
    // Unfortunately, the SDK doesn't expose the fetch directly, so we need another approach
    
    // Alternative: Patch the require cache to ensure node-fetch returns our fetch
    const Module = require('module')
    const nodeFetchPath = require.resolve('node-fetch')
    // Force the cached version to be our fetch function
    if (Module._cache[nodeFetchPath]) {
      Module._cache[nodeFetchPath].exports = workingFetch
      // Also set default export
      if (Module._cache[nodeFetchPath].exports && typeof Module._cache[nodeFetchPath].exports === 'object') {
        Module._cache[nodeFetchPath].exports.default = workingFetch
      }
    }
    
  }
} catch (e) {
  console.error('Failed to patch SDK fetch:', e)
}

export interface KucoinAccount {
  id: string
  currency: string
  type: string
  balance: string
  available: string
  holds: string
}

export interface KucoinOrder {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit'
  price?: string
  size: string
  funds?: string
  status: string
  createdAt: number
  filledSize?: string
  filledValue?: string
}

export interface KucoinKline {
  time: number
  open: string
  high: string
  low: string
  close: string
  volume: string
}

import type { ExchangeService, Account, Order, Kline, Ticker } from './exchange/interface'

export class KucoinService implements ExchangeService {
  getName(): string {
    return 'KuCoin'
  }

  isSymbolSupported(symbol: string): boolean {
    // KuCoin supports crypto pairs (e.g., BTC-USDT, ETH-USDT, etc.)
    // Check if it matches crypto pattern
    const cryptoPatterns = [
      /-(USDT|BTC|ETH|BNB|BUSD|USDC|DAI|TUSD)$/i,
      /^(BTC|ETH|LTC|XRP|ADA|DOT|SOL|MATIC|AVAX|LINK|UNI|ATOM)/i,
    ]
    return cryptoPatterns.some(pattern => pattern.test(symbol))
  }
  // Get account balance
  async getAccounts(currency?: string): Promise<Account[]> {
    try {
      const response = await API.rest.User.Account.getAccountsList({
        currency,
      })
      const accounts: Account[] = (response.data || []).map((acc: KucoinAccount) => ({
        id: acc.id,
        currency: acc.currency,
        type: acc.type,
        balance: acc.balance,
        available: acc.available,
        holds: acc.holds,
      }))
      return accounts
    } catch (error: any) {
      console.error('Error fetching accounts:', error)
      // Re-throw with more context
      const errorMessage = error?.response?.data?.msg || error?.message || 'Failed to fetch accounts'
      const enhancedError = new Error(errorMessage)
      ;(enhancedError as any).originalError = error
      throw enhancedError
    }
  }

  // Get account balance for a specific currency
  async getBalance(currency: string): Promise<number> {
    try {
      const accounts = await this.getAccounts(currency)
      const tradingAccount = accounts.find(acc => acc.type === 'trade')
      return tradingAccount ? parseFloat(tradingAccount.available) : 0
    } catch (error) {
      console.error('Error fetching balance:', error)
      return 0
    }
  }

  // Get klines (candlestick data)
  async getKlines(
    symbol: string,
    timeframe: string = '4hour',
    startAt?: number,
    endAt?: number
  ): Promise<Kline[]> {
    try {
      const response = await API.rest.Market.Histories.getMarketCandles(
        symbol,
        timeframe,
        { startAt, endAt }
      )
      // Klines are returned in reverse chronological order, and format is [time, open, close, high, low, volume]
      const klines = response.data || []
      // Reverse to get chronological order (oldest first) for proper backtesting
      const reversed = [...klines].reverse()
      return reversed.map((k: any[]) => ({
        time: parseInt(k[0]),
        open: k[1],
        high: k[3],
        low: k[4],
        close: k[2],
        volume: k[5],
      }))
    } catch (error: any) {
      console.error('Error fetching klines:', error)
      const errorMessage = error?.response?.data?.msg || error?.message || 'Failed to fetch klines'
      const enhancedError = new Error(errorMessage)
      ;(enhancedError as any).originalError = error
      throw enhancedError
    }
  }

  // Get ticker (current price)
  async getTicker(symbol: string): Promise<Ticker> {
    try {
      const response = await API.rest.Market.Symbols.getTicker(symbol)
      return {
        price: response.data.price || '0',
        bestAsk: response.data.bestAsk || '0',
        bestBid: response.data.bestBid || '0',
      }
    } catch (error: any) {
      console.error('Error fetching ticker:', error)
      const errorMessage = error?.response?.data?.msg || error?.message || 'Failed to fetch ticker'
      const enhancedError = new Error(errorMessage)
      ;(enhancedError as any).originalError = error
      throw enhancedError
    }
  }

  // Place market order
  async placeMarketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size?: string,
    funds?: string
  ): Promise<Order> {
    try {
      const response = await API.rest.Trade.Orders.postOrder({
        clientOid: `${Date.now()}`,
        side,
        symbol,
        type: 'market',
        ...(size ? { size } : {}),
        ...(funds ? { funds } : {}),
      })
      return response.data
    } catch (error) {
      console.error('Error placing order:', error)
      throw error
    }
  }

  // Place limit order
  async placeLimitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    price: string,
    size: string
  ): Promise<Order> {
    try {
      const response = await API.rest.Trade.Orders.postOrder({
        clientOid: `${Date.now()}`,
        side,
        symbol,
        type: 'limit',
        price,
        size,
      })
      return response.data
    } catch (error) {
      console.error('Error placing limit order:', error)
      throw error
    }
  }

  // Cancel order
  async cancelOrder(orderId: string): Promise<void> {
    try {
      await API.rest.Trade.Orders.cancelOrder({ orderId })
    } catch (error) {
      console.error('Error canceling order:', error)
      throw error
    }
  }

  // Get order details
  async getOrder(orderId: string): Promise<Order> {
    try {
      const response = await API.rest.Trade.Orders.getOrder({ orderId })
      return response.data
    } catch (error) {
      console.error('Error fetching order:', error)
      throw error
    }
  }

  // Get open orders
  async getOpenOrders(symbol?: string): Promise<Order[]> {
    try {
      const response = await API.rest.Trade.Orders.getOrders({
        status: 'active',
        ...(symbol ? { symbol } : {}),
      })
      return response.data.items || []
    } catch (error) {
      console.error('Error fetching open orders:', error)
      return []
    }
  }
}

export const kucoinService = new KucoinService()
