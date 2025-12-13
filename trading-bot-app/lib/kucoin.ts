// Import fetch polyfill FIRST - must run before SDK loads
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./fetch-polyfill')

// Ensure fetch is available before requiring SDK
// The SDK may capture fetch reference at load time
if (typeof globalThis.fetch !== 'function' && typeof global?.fetch !== 'function') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const API = require('kucoin-node-sdk')

// Re-ensure fetch is available right before init (SDK might check at init time)
if (typeof globalThis.fetch !== 'function') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

export interface KucoinAccountSummary {
  level: number
  subQuantity: number
  spotSubQuantity: number
  marginSubQuantity: number
  futuresSubQuantity: number
  optionSubQuantity: number
  maxSubQuantity: number
  maxDefaultSubQuantity: number
  maxSpotSubQuantity: number
  maxMarginSubQuantity: number
  maxFuturesSubQuantity: number
  maxOptionSubQuantity: number
}

import type { ExchangeService, Account, Order, Kline, Ticker } from './exchange/interface'

/**
 * Format price to match KuCoin's price increment requirements
 * For most major pairs like ETH-USDT, price increment is 0.01 (2 decimals)
 */
function formatPriceForKucoin(price: number): string {
  // Default to 2 decimals for major pairs
  // This can be enhanced later to fetch actual tick size from symbol info
  const decimals = 2
  const multiplier = Math.pow(10, decimals)
  const rounded = Math.round(price * multiplier) / multiplier
  return rounded.toFixed(decimals)
}

/**
 * Format size to match KuCoin's baseIncrement requirements
 * For ETH-USDT, baseIncrement is typically 0.0001 (4 decimals)
 * For smaller values, use more precision (5 or 8 decimals)
 */
function formatSizeForKucoin(size: number): string {
  // For ETH-USDT, baseIncrement is 0.0001 (4 decimals)
  // For values >= 0.01, use 3 decimals (increment 0.001)
  // For values < 0.01, use 4 decimals (increment 0.0001)
  // For values < 0.001, use 5 decimals (increment 0.00001)
  // For values < 0.0001, use 8 decimals
  let decimals = 4 // Default for ETH-USDT (baseIncrement 0.0001)
  if (size >= 0.01) {
    decimals = 3
  } else if (size < 0.0001) {
    decimals = 8
  } else if (size < 0.001) {
    decimals = 5
  }
  
  const multiplier = Math.pow(10, decimals)
  // Round down to nearest increment (floor) to ensure we don't exceed available balance
  const rounded = Math.floor(size * multiplier) / multiplier
  return rounded.toFixed(decimals).replace(/\.?0+$/, '') || '0'
}

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
  /**
   * Get account list (Spot accounts)
   * Official API: GET /api/v1/accounts
   * Documentation: https://www.kucoin.com/docs-new/rest/account-info/account-funding/get-account-list-spot
   * 
   * Returns list of all accounts (main, trade, margin, etc.) for the specified currency
   */
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
    } catch (error: unknown) {
      console.error('Error fetching accounts:', error)
      // Re-throw with more context
      let errorMessage = 'Failed to fetch accounts'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null && 'response' in error) {
        const err = error as { response?: { data?: { msg?: string } } }
        errorMessage = err.response?.data?.msg || errorMessage
      }
      const enhancedError = new Error(errorMessage)
      if (error instanceof Error) {
        (enhancedError as Error & { originalError?: unknown }).originalError = error
      }
      throw enhancedError
    }
  }

  /**
   * Get account summary information
   * Official API: GET /api/v2/user-info
   * Documentation: https://www.kucoin.com/docs-new/rest/account-info/account-funding/get-account-summary-info
   * 
   * Returns account summary including level, sub-account quantities, etc.
   */
  async getAccountSummary(): Promise<KucoinAccountSummary> {
    try {
      const response = await API.rest.User.Account.getAccountInfo()
      return response.data as KucoinAccountSummary
    } catch (error: unknown) {
      console.error('Error fetching account summary:', error)
      let errorMessage = 'Failed to fetch account summary'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null && 'response' in error) {
        const err = error as { response?: { data?: { msg?: string } } }
        errorMessage = err.response?.data?.msg || errorMessage
      }
      const enhancedError = new Error(errorMessage)
      if (error instanceof Error) {
        (enhancedError as Error & { originalError?: unknown }).originalError = error
      }
      throw enhancedError
    }
  }

  // Get account balance for a specific currency
  // Returns trade account balance (used for trading)
  async getBalance(currency: string): Promise<number> {
    try {
      const accounts = await this.getAccounts(currency)
      // Filter accounts by currency and get trade account balance
      const currencyAccounts = accounts.filter(acc => 
        (acc.currency || '').toUpperCase() === currency.toUpperCase()
      )
      
      // Get trade account balance specifically (required for trading)
      const tradeAccount = currencyAccounts.find(acc => acc.type === 'trade')
      const tradeBalance = tradeAccount ? parseFloat(tradeAccount.available || '0') : 0
      
      console.log(`[KuCoin getBalance] Currency: ${currency}, Trade Account Balance: ${tradeBalance}`)
      
      return tradeBalance
    } catch (error) {
      console.error('Error fetching balance:', error)
      return 0
    }
  }

  /**
   * Get separate balances for main and trade accounts
   * Returns both main and trade account balances separately
   */
  async getSeparateBalances(currency: string): Promise<{ main: number; trade: number; mainAvailable: number; tradeAvailable: number }> {
    try {
      const accounts = await this.getAccounts(currency)
      const currencyAccounts = accounts.filter(acc => 
        (acc.currency || '').toUpperCase() === currency.toUpperCase()
      )
      
      const mainAccount = currencyAccounts.find(acc => acc.type === 'main')
      const tradeAccount = currencyAccounts.find(acc => acc.type === 'trade')
      
      return {
        main: mainAccount ? parseFloat(mainAccount.balance || '0') : 0,
        trade: tradeAccount ? parseFloat(tradeAccount.balance || '0') : 0,
        mainAvailable: mainAccount ? parseFloat(mainAccount.available || '0') : 0,
        tradeAvailable: tradeAccount ? parseFloat(tradeAccount.available || '0') : 0,
      }
    } catch (error) {
      console.error('Error fetching separate balances:', error)
      return { main: 0, trade: 0, mainAvailable: 0, tradeAvailable: 0 }
    }
  }

  /**
   * Transfer funds from main account to trade account
   * Official API: POST /api/v2/accounts/inner-transfer
   * Documentation: https://www.kucoin.com/docs-new/rest/account/funding/transfer-between-main-sub-or-sub-sub-accounts
   * 
   * Transfers funds from main account to trade account for trading
   */
  async transferMainToTrade(currency: string, amount: string): Promise<void> {
    try {
      console.log(`[KuCoin] Transferring ${amount} ${currency} from main to trade account`)
      
      // Get main account ID
      const accounts = await this.getAccounts(currency)
      const mainAccount = accounts.find(acc => acc.type === 'main' && (acc.currency || '').toUpperCase() === currency.toUpperCase())
      const tradeAccount = accounts.find(acc => acc.type === 'trade' && (acc.currency || '').toUpperCase() === currency.toUpperCase())
      
      if (!mainAccount || !tradeAccount) {
        throw new Error(`Could not find main or trade account for ${currency}`)
      }

      // Use the inner transfer API
      const response = await API.rest.User.Account.innerTransfer({
        clientOid: `${Date.now()}`,
        currency,
        amount,
        from: 'main',
        to: 'trade',
      })
      
      console.log(`[KuCoin] Transfer successful: ${amount} ${currency} from main to trade`)
      return response.data
    } catch (error: unknown) {
      console.error('Error transferring funds:', error)
      let errorMessage = 'Failed to transfer funds'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null && 'response' in error) {
        const err = error as { response?: { data?: { msg?: string } } }
        errorMessage = err.response?.data?.msg || errorMessage
      }
      const enhancedError = new Error(errorMessage)
      if (error instanceof Error) {
        (enhancedError as Error & { originalError?: unknown }).originalError = error
      }
      throw enhancedError
    }
  }

  /**
   * Get klines (candlestick data)
   * Official API: GET /api/v1/market/candles
   * Documentation: https://www.kucoin.com/docs-new/rest/market-data/get-klines
   * 
   * Returns historical candlestick data for backtesting and analysis
   */
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
      return reversed.map((k: (string | number)[]) => ({
        time: parseInt(String(k[0])),
        open: String(k[1]),
        high: String(k[3]),
        low: String(k[4]),
        close: String(k[2]),
        volume: String(k[5]),
      }))
    } catch (error: unknown) {
      console.error('Error fetching klines:', error)
      let errorMessage = 'Failed to fetch klines'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null && 'response' in error) {
        const err = error as { response?: { data?: { msg?: string } } }
        errorMessage = err.response?.data?.msg || errorMessage
      }
      const enhancedError = new Error(errorMessage)
      if (error instanceof Error) {
        (enhancedError as Error & { originalError?: unknown }).originalError = error
      }
      throw enhancedError
    }
  }

  /**
   * Get ticker (current price)
   * Official API: GET /api/v1/market/orderbook/level1
   * Documentation: https://www.kucoin.com/docs-new/rest/market-data/get-ticker
   * 
   * Returns current market price, best bid, and best ask for a symbol
   */
  async getTicker(symbol: string): Promise<Ticker> {
    try {
      const response = await API.rest.Market.Symbols.getTicker(symbol)
      return {
        price: response.data.price || '0',
        bestAsk: response.data.bestAsk || '0',
        bestBid: response.data.bestBid || '0',
      }
    } catch (error: unknown) {
      console.error('Error fetching ticker:', error)
      let errorMessage = 'Failed to fetch ticker'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null && 'response' in error) {
        const err = error as { response?: { data?: { msg?: string } } }
        errorMessage = err.response?.data?.msg || errorMessage
      }
      const enhancedError = new Error(errorMessage)
      if (error instanceof Error) {
        (enhancedError as Error & { originalError?: unknown }).originalError = error
      }
      throw enhancedError
    }
  }

  /**
   * Place market order
   * Official API: POST /api/v1/orders
   * Documentation: https://www.kucoin.com/docs-new/rest/spot-trading/orders/add-order
   * 
   * Executes a market order immediately at the current market price
   */
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
      
      if (!response || !response.data) {
        throw new Error(`KuCoin API returned invalid response: ${JSON.stringify(response)}`)
      }
      
      if (!response.data.orderId && !response.data.id) {
        throw new Error(`KuCoin order response missing orderId/id: ${JSON.stringify(response.data)}`)
      }
      
      // Normalize KuCoin response to match Order interface
      // KuCoin returns orderId, but our interface expects id
      const orderData = response.data
      return {
        ...orderData,
        id: orderData.orderId || orderData.id,
      }
    } catch (error) {
      console.error('Error placing order:', error)
      throw error
    }
  }

  /**
   * Place limit order
   * Official API: POST /api/v1/orders
   * Documentation: https://www.kucoin.com/docs-new/rest/spot-trading/orders/add-order
   * 
   * Places a limit order at a specified price
   */
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

  /**
   * Cancel order
   * Official API: DELETE /api/v1/orders/{orderId}
   * Documentation: https://www.kucoin.com/docs-new/rest/spot-trading/orders/cancel-order-by-orderid
   * 
   * Cancels an existing order by order ID
   */
  async cancelOrder(orderId: string): Promise<void> {
    try {
      await API.rest.Trade.Orders.cancelOrder({ orderId })
    } catch (error) {
      console.error('Error canceling order:', error)
      throw error
    }
  }

  /**
   * Get order details
   * Official API: GET /api/v1/orders/{orderId}
   * Documentation: https://www.kucoin.com/docs-new/rest/spot-trading/orders/get-order-by-orderid
   * 
   * Retrieves details of a specific order by order ID
   */
  async getOrder(orderId: string): Promise<Order> {
    try {
      // Try different method names that might exist in the SDK
      let response
      const params = { status: 'active' }
      
      // Try getOrdersList first (common SDK pattern)
      if (typeof API.rest.Trade.Orders.getOrdersList === 'function') {
        response = await API.rest.Trade.Orders.getOrdersList(params)
      }
      // Try getOrders (might work with different parameters)
      else if (typeof API.rest.Trade.Orders.getOrders === 'function') {
        response = await API.rest.Trade.Orders.getOrders(params)
      }
      // Try getAllOrders
      else if (typeof API.rest.Trade.Orders.getAllOrders === 'function') {
        response = await API.rest.Trade.Orders.getAllOrders(params)
      }
      // If none exist, try getOrderById
      else if (typeof API.rest.Trade.Orders.getOrderById === 'function') {
        response = await API.rest.Trade.Orders.getOrderById({ orderId })
        if (response && response.data) {
          return {
            ...response.data,
            id: response.data.orderId || response.data.id || orderId,
          }
        }
      }
      // Try getOrder
      else if (typeof API.rest.Trade.Orders.getOrder === 'function') {
        response = await API.rest.Trade.Orders.getOrder({ orderId })
        if (response && response.data) {
          return {
            ...response.data,
            id: response.data.orderId || response.data.id || orderId,
          }
        }
      }
      
      // If we got a list response, search for the order
      if (response && response.data) {
        const items = response.data.items || response.data.data || (Array.isArray(response.data) ? response.data : [])
        const order = items.find((o: { id?: string; orderId?: string }) => 
          (o.id === orderId || o.orderId === orderId)
        )
        if (order) {
          return {
            ...order,
            id: order.orderId || order.id || orderId,
          }
        }
      }
      
      // If not found, throw error
      throw new Error(`Order ${orderId} not found. KuCoin SDK has limitations with order lookup.`)
    } catch (error) {
      console.error('Error fetching order:', error)
      // If the error is already an Error object, re-throw it
      if (error instanceof Error) {
        throw error
      }
      // Otherwise wrap it
      throw new Error(`Failed to fetch order: ${String(error)}`)
    }
  }

  /**
   * Get open orders
   * Official API: GET /api/v1/orders
   * Documentation: https://www.kucoin.com/docs-new/rest/spot-trading/orders/get-open-orders
   * 
   * Retrieves all active/open orders, optionally filtered by symbol
   * 
   * Note: The KuCoin SDK method name may vary. This implementation tries multiple approaches.
   */
  async getOpenOrders(symbol?: string): Promise<Order[]> {
    try {
      // Try different method names that might exist in the SDK
      let response
      const params: { status?: string; symbol?: string } = {
        status: 'active',
        ...(symbol ? { symbol } : {}),
      }
      
      // Try getOrdersList first (common SDK pattern)
      if (typeof API.rest.Trade.Orders.getOrdersList === 'function') {
        response = await API.rest.Trade.Orders.getOrdersList(params)
      }
      // Try getOrders (might work with different parameters)
      else if (typeof API.rest.Trade.Orders.getOrders === 'function') {
        response = await API.rest.Trade.Orders.getOrders(params)
      }
      // Try getAllOrders
      else if (typeof API.rest.Trade.Orders.getAllOrders === 'function') {
        response = await API.rest.Trade.Orders.getAllOrders(params)
      }
      // If none of the methods exist, return empty array (known SDK limitation)
      else {
        console.warn('[KuCoin] getOpenOrders: SDK method not available. This is a known limitation.')
        return []
      }
      
      if (response && response.data) {
        // Handle different response structures
        const items = response.data.items || response.data.data || response.data || []
        return Array.isArray(items) ? items : []
      }
      
      return []
    } catch (error) {
      // Silently return empty array - this is a known SDK limitation
      // The close trade endpoint will handle this gracefully
      console.warn('[KuCoin] getOpenOrders: Error fetching orders (known SDK limitation):', error instanceof Error ? error.message : 'Unknown error')
      return []
    }
  }

  /**
   * Place stop-loss order
   * For spot trading, we use a limit order at the stop price
   * For a buy position, stop-loss is a sell limit order below entry
   * For a sell position, stop-loss is a buy limit order above entry
   */
  async placeStopLossOrder(
    symbol: string,
    side: 'buy' | 'sell',
    stopPrice: string,
    size: string
  ): Promise<Order> {
    try {
      // For spot trading, stop-loss is implemented as a limit order
      // If original position was 'buy', stop-loss is a 'sell' order
      // If original position was 'sell', stop-loss is a 'buy' order
      const stopSide = side === 'buy' ? 'sell' : 'buy'
      
      // Format price to match KuCoin's price increment requirements
      const formattedPrice = formatPriceForKucoin(parseFloat(stopPrice))
      // Format size to match KuCoin's baseIncrement requirements
      const formattedSize = formatSizeForKucoin(parseFloat(size))
      
      const response = await API.rest.Trade.Orders.postOrder({
        clientOid: `stop-loss-${Date.now()}`,
        side: stopSide,
        symbol,
        type: 'limit',
        price: formattedPrice,
        size: formattedSize,
      })
      
      if (!response) {
        throw new Error(`KuCoin API returned invalid response: ${JSON.stringify(response)}`)
      }
      
      // Check if response contains an error (error responses have code/msg)
      if (!response || !response.data) {
        throw new Error(`KuCoin API returned invalid response: ${JSON.stringify(response)}`)
      }
      
      // Check if this is an error response (has code/msg but no orderId/id)
      if (response.data.code || (response.data.msg && !response.data.orderId && !response.data.id)) {
        const errorMsg = response.data.msg || `Error code: ${response.data.code || 'unknown'}`
        throw new Error(`KuCoin API error: ${errorMsg}`)
      }
      
      // Validate we have order data
      if (!response.data.orderId && !response.data.id) {
        throw new Error(`KuCoin API returned response without order ID: ${JSON.stringify(response.data)}`)
      }
      
      // Normalize KuCoin response to match Order interface
      const orderData = response.data
      return {
        ...orderData,
        id: orderData.orderId || orderData.id,
      }
    } catch (error) {
      console.error('Error placing stop-loss order:', error)
      // If it's already an Error with a message, re-throw it
      if (error instanceof Error) {
        throw error
      }
      // If it's an object with error info, extract it
      if (typeof error === 'object' && error !== null) {
        const err = error as { response?: { data?: { msg?: string; code?: string } }; data?: { msg?: string; code?: string }; msg?: string }
        const errorMsg = err.response?.data?.msg || err.data?.msg || err.msg || JSON.stringify(error)
        throw new Error(`KuCoin API error: ${errorMsg}`)
      }
      throw new Error(`Unknown error: ${String(error)}`)
    }
  }

  /**
   * Place take-profit order
   * For spot trading, we use a limit order at the take-profit price
   * For a buy position, take-profit is a sell limit order above entry
   * For a sell position, take-profit is a buy limit order below entry
   */
  async placeTakeProfitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    takeProfitPrice: string,
    size: string
  ): Promise<Order> {
    try {
      // For spot trading, take-profit is implemented as a limit order
      // If original position was 'buy', take-profit is a 'sell' order
      // If original position was 'sell', take-profit is a 'buy' order
      const profitSide = side === 'buy' ? 'sell' : 'buy'
      
      // Format price to match KuCoin's price increment requirements
      const formattedPrice = formatPriceForKucoin(parseFloat(takeProfitPrice))
      // Format size to match KuCoin's baseIncrement requirements
      const formattedSize = formatSizeForKucoin(parseFloat(size))
      
      const response = await API.rest.Trade.Orders.postOrder({
        clientOid: `take-profit-${Date.now()}`,
        side: profitSide,
        symbol,
        type: 'limit',
        price: formattedPrice,
        size: formattedSize,
      })
      
      if (!response) {
        throw new Error(`KuCoin API returned invalid response: ${JSON.stringify(response)}`)
      }
      
      // Check if response contains an error (error responses have code/msg)
      if (!response || !response.data) {
        throw new Error(`KuCoin API returned invalid response: ${JSON.stringify(response)}`)
      }
      
      // Check if this is an error response (has code/msg but no orderId/id)
      if (response.data.code || (response.data.msg && !response.data.orderId && !response.data.id)) {
        const errorMsg = response.data.msg || `Error code: ${response.data.code || 'unknown'}`
        throw new Error(`KuCoin API error: ${errorMsg}`)
      }
      
      // Validate we have order data
      if (!response.data.orderId && !response.data.id) {
        throw new Error(`KuCoin API returned response without order ID: ${JSON.stringify(response.data)}`)
      }
      
      // Normalize KuCoin response to match Order interface
      const orderData = response.data
      return {
        ...orderData,
        id: orderData.orderId || orderData.id,
      }
    } catch (error) {
      console.error('Error placing take-profit order:', error)
      // If it's already an Error with a message, re-throw it
      if (error instanceof Error) {
        throw error
      }
      // If it's an object with error info, extract it
      if (typeof error === 'object' && error !== null) {
        const err = error as { response?: { data?: { msg?: string; code?: string } }; data?: { msg?: string; code?: string }; msg?: string }
        const errorMsg = err.response?.data?.msg || err.data?.msg || err.msg || JSON.stringify(error)
        throw new Error(`KuCoin API error: ${errorMsg}`)
      }
      throw new Error(`Unknown error: ${String(error)}`)
    }
  }
}

export const kucoinService = new KucoinService()
