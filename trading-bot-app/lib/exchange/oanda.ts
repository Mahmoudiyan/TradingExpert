// OANDA Forex Broker Service
// OANDA API documentation: https://developer.oanda.com/rest-live-v20/introduction/

import type { ExchangeService, Kline, Ticker, Account, Order } from './interface'

interface OandaConfig {
  apiKey: string
  accountId: string
  environment: 'practice' | 'live' // practice for demo, live for real
}

// OANDA uses different symbol format (EUR_USD vs EUR-USD)
// Also, forex pairs use base/quote (EUR/USD) not base-quote (EUR-USD)
function normalizeSymbol(symbol: string): string {
  // Convert common formats to OANDA format
  // EUR-USD or EURUSDT or EUR/USD -> EUR_USD
  const normalized = symbol
    .replace(/-/g, '_')
    .replace(/\//g, '_')
    .replace(/USDT/g, 'USD')
    .toUpperCase()
  
  // Handle common forex pairs
  if (normalized.includes('_') && !normalized.endsWith('_USD') && !normalized.startsWith('USD_')) {
    // If it's already in format like EUR_GBP, keep it
    return normalized
  }
  
  return normalized
}

// Convert OANDA timeframe to standard format
function convertTimeframe(timeframe: string): string {
  const mapping: Record<string, string> = {
    '1min': 'M1',
    '5min': 'M5',
    '15min': 'M15',
    '30min': 'M30',
    '1hour': 'H1',
    '4hour': 'H4',
    '1day': 'D',
  }
  return mapping[timeframe] || timeframe
}

export class OandaService implements ExchangeService {
  private config: OandaConfig
  private baseUrl: string

  constructor(config?: Partial<OandaConfig>) {
    this.config = {
      apiKey: config?.apiKey || process.env.OANDA_API_KEY || '',
      accountId: config?.accountId || process.env.OANDA_ACCOUNT_ID || '',
      environment: config?.environment || (process.env.OANDA_ENVIRONMENT === 'live' ? 'live' : 'practice'),
    }
    
    this.baseUrl = this.config.environment === 'live'
      ? 'https://api-fxtrade.oanda.com/v3'
      : 'https://api-fxpractice.oanda.com/v3'
  }

  getName(): string {
    return 'OANDA'
  }

  isSymbolSupported(symbol: string): boolean {
    // OANDA supports forex pairs (e.g., EUR_USD, GBP_USD, USD_JPY, etc.)
    // It doesn't support crypto pairs
    const normalized = normalizeSymbol(symbol)
    
    // Common forex pairs
    const forexPairs = [
      'EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'AUD_USD', 'NZD_USD', 'USD_CAD',
      'EUR_GBP', 'EUR_JPY', 'EUR_CHF', 'EUR_AUD', 'GBP_JPY', 'AUD_JPY', 'CAD_JPY',
      'CHF_JPY', 'EUR_CAD', 'GBP_CAD', 'AUD_CAD', 'AUD_NZD',
    ]
    
    return forexPairs.includes(normalized) || /^[A-Z]{3}_[A-Z]{3}$/.test(normalized)
  }

  async getAccounts(currency?: string): Promise<Account[]> {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/${this.config.accountId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`OANDA API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      
      // OANDA returns account summary, convert to our format
      const accounts: Account[] = []
      
      // OANDA accounts have balances in different currencies
      // For now, return a single account with the balance
      if (data.account) {
        accounts.push({
          id: data.account.id,
          currency: currency || data.account.currency || 'USD',
          type: 'trade',
          balance: data.account.balance || '0',
          available: data.account.available || '0',
          holds: '0',
        })
      }

      return accounts
    } catch (error: unknown) {
      console.error('OANDA getAccounts error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to fetch OANDA accounts: ${errorMessage}`)
    }
  }

  async getBalance(currency: string): Promise<number> {
    try {
      const accounts = await this.getAccounts(currency)
      const account = accounts.find(acc => acc.currency === currency)
      return account ? parseFloat(account.available) : 0
    } catch (error) {
      console.error('OANDA getBalance error:', error)
      return 0
    }
  }

  async getKlines(
    symbol: string,
    timeframe: string,
    startAt?: number,
    endAt?: number
  ): Promise<Kline[]> {
    try {
      const normalizedSymbol = normalizeSymbol(symbol)
      const oandaTimeframe = convertTimeframe(timeframe)
      
      let url = `${this.baseUrl}/instruments/${normalizedSymbol}/candles?granularity=${oandaTimeframe}`
      
      if (startAt) {
        // OANDA expects RFC3339 format
        url += `&from=${new Date(startAt * 1000).toISOString()}`
      }
      
      if (endAt) {
        url += `&to=${new Date(endAt * 1000).toISOString()}`
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`OANDA API error: ${response.status} - ${errorData.errorMessage || response.statusText}`)
      }

      const data = await response.json()
      
      // Convert OANDA candles to our format
      // OANDA returns: {time, bid: {o, h, l, c}, ask: {o, h, l, c}, volume, complete}
      const klines: Kline[] = []
      
      if (data.candles) {
        for (const candle of data.candles) {
          if (candle.complete) {
            // Use mid price (average of bid and ask)
            const bid = candle.bid || {}
            const ask = candle.ask || {}
            
            klines.push({
              time: Math.floor(new Date(candle.time).getTime() / 1000),
              open: ((parseFloat(bid.o || '0') + parseFloat(ask.o || '0')) / 2).toFixed(5),
              high: ((parseFloat(bid.h || '0') + parseFloat(ask.h || '0')) / 2).toFixed(5),
              low: ((parseFloat(bid.l || '0') + parseFloat(ask.l || '0')) / 2).toFixed(5),
              close: ((parseFloat(bid.c || '0') + parseFloat(ask.c || '0')) / 2).toFixed(5),
              volume: candle.volume || '0',
            })
          }
        }
      }
      
      // OANDA returns newest first, reverse to get oldest first
      return klines.reverse()
    } catch (error: unknown) {
      console.error('OANDA getKlines error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to fetch OANDA candles for ${symbol}: ${errorMessage}`)
    }
  }

  async getTicker(symbol: string): Promise<Ticker> {
    try {
      const normalizedSymbol = normalizeSymbol(symbol)
      const response = await fetch(`${this.baseUrl}/accounts/${this.config.accountId}/pricing?instruments=${normalizedSymbol}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`OANDA API error: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.prices && data.prices.length > 0) {
        const price = data.prices[0]
        return {
          price: ((parseFloat(price.bids[0].price) + parseFloat(price.asks[0].price)) / 2).toFixed(5),
          bestBid: price.bids[0].price,
          bestAsk: price.asks[0].price,
        }
      }

      throw new Error('No pricing data received from OANDA')
    } catch (error: unknown) {
      console.error('OANDA getTicker error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to fetch OANDA ticker for ${symbol}: ${errorMessage}`)
    }
  }

  async placeMarketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size?: string
    // OANDA doesn't use funds parameter, kept for interface compatibility but not used
  ): Promise<Order> {
    try {
      const normalizedSymbol = normalizeSymbol(symbol)
      
      // OANDA uses units (not size or funds)
      // For forex, 1 unit = 1 unit of base currency
      // size is in base currency units
      const units = side === 'buy' 
        ? (size ? Math.floor(parseFloat(size)) : 1000)
        : (size ? -Math.floor(parseFloat(size)) : -1000) // Negative for sell

      const response = await fetch(`${this.baseUrl}/accounts/${this.config.accountId}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order: {
            type: 'MARKET',
            instrument: normalizedSymbol,
            units: units.toString(),
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`OANDA API error: ${response.status} - ${errorData.errorMessage || response.statusText}`)
      }

      const data = await response.json()
      const order = data.orderFillTransaction || data.orderCreateTransaction
      
      return {
        id: order.id || order.orderID || '',
        symbol: normalizedSymbol,
        side,
        type: 'market',
        price: order.price || order.averagePrice || '0',
        size: Math.abs(units).toString(),
        status: order.type === 'ORDER_FILL' ? 'filled' : 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      }
    } catch (error: unknown) {
      console.error('OANDA placeMarketOrder error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to place OANDA order: ${errorMessage}`)
    }
  }

  async placeLimitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    price: string,
    size: string
  ): Promise<Order> {
    try {
      const normalizedSymbol = normalizeSymbol(symbol)
      const units = side === 'buy' 
        ? Math.floor(parseFloat(size))
        : -Math.floor(parseFloat(size))

      const response = await fetch(`${this.baseUrl}/accounts/${this.config.accountId}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order: {
            type: 'LIMIT',
            instrument: normalizedSymbol,
            units: units.toString(),
            price: price,
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`OANDA API error: ${response.status} - ${errorData.errorMessage || response.statusText}`)
      }

      const data = await response.json()
      const order = data.orderCreateTransaction
      
      return {
        id: order.id || '',
        symbol: normalizedSymbol,
        side,
        type: 'limit',
        price,
        size: Math.abs(units).toString(),
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      }
    } catch (error: unknown) {
      console.error('OANDA placeLimitOrder error:', error)
      throw error
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/${this.config.accountId}/orders/${orderId}/cancel`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`OANDA API error: ${response.status}`)
      }
    } catch (error) {
      console.error('OANDA cancelOrder error:', error)
      throw error
    }
  }

  async getOrder(orderId: string): Promise<Order> {
    try {
      const response = await fetch(`${this.baseUrl}/accounts/${this.config.accountId}/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`OANDA API error: ${response.status}`)
      }

      const data = await response.json()
      const order = data.order
      
      return {
        id: order.id,
        symbol: order.instrument,
        side: parseFloat(order.units) > 0 ? 'buy' : 'sell',
        type: order.type.toLowerCase(),
        price: order.price || '0',
        size: Math.abs(parseFloat(order.units)).toString(),
        status: order.state.toLowerCase(),
        createdAt: Math.floor(new Date(order.createTime).getTime() / 1000),
      }
    } catch (error) {
      console.error('OANDA getOrder error:', error)
      throw error
    }
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    try {
      let url = `${this.baseUrl}/accounts/${this.config.accountId}/pendingOrders`
      if (symbol) {
        const normalizedSymbol = normalizeSymbol(symbol)
        url += `?instrument=${normalizedSymbol}`
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`OANDA API error: ${response.status}`)
      }

      const data = await response.json()
      const orders: Order[] = []
      
      if (data.orders) {
        for (const order of data.orders) {
          orders.push({
            id: order.id,
            symbol: order.instrument,
            side: parseFloat(order.units) > 0 ? 'buy' : 'sell',
            type: order.type.toLowerCase(),
            price: order.price || '0',
            size: Math.abs(parseFloat(order.units)).toString(),
            status: order.state.toLowerCase(),
            createdAt: Math.floor(new Date(order.createTime).getTime() / 1000),
          })
        }
      }

      return orders
    } catch (error) {
      console.error('OANDA getOpenOrders error:', error)
      return []
    }
  }

  async placeStopLossOrder(
    symbol: string,
    side: 'buy' | 'sell',
    stopPrice: string,
    size: string
  ): Promise<Order> {
    try {
      const normalizedSymbol = normalizeSymbol(symbol)
      // OANDA uses stopLossOnFill in the order request
      // For an existing position, we'd need to modify the position
      // For now, we'll create a stop-loss order as a limit order
      const units = side === 'buy' ? -Math.floor(parseFloat(size)) : Math.floor(parseFloat(size))
      
      const response = await fetch(`${this.baseUrl}/accounts/${this.config.accountId}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order: {
            type: 'MARKET_IF_TOUCHED',
            instrument: normalizedSymbol,
            units: units.toString(),
            price: stopPrice,
            timeInForce: 'GTC',
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`OANDA API error: ${response.status} - ${errorData.errorMessage || response.statusText}`)
      }

      const data = await response.json()
      const order = data.orderCreateTransaction || data.orderFillTransaction
      
      return {
        id: order.id || order.orderID || '',
        symbol: normalizedSymbol,
        side: side === 'buy' ? 'sell' : 'buy',
        type: 'limit',
        price: stopPrice,
        size: Math.abs(units).toString(),
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      }
    } catch (error) {
      console.error('OANDA placeStopLossOrder error:', error)
      throw error
    }
  }

  async placeTakeProfitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    takeProfitPrice: string,
    size: string
  ): Promise<Order> {
    try {
      const normalizedSymbol = normalizeSymbol(symbol)
      const units = side === 'buy' ? -Math.floor(parseFloat(size)) : Math.floor(parseFloat(size))
      
      const response = await fetch(`${this.baseUrl}/accounts/${this.config.accountId}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order: {
            type: 'LIMIT',
            instrument: normalizedSymbol,
            units: units.toString(),
            price: takeProfitPrice,
            timeInForce: 'GTC',
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`OANDA API error: ${response.status} - ${errorData.errorMessage || response.statusText}`)
      }

      const data = await response.json()
      const order = data.orderCreateTransaction || data.orderFillTransaction
      
      return {
        id: order.id || order.orderID || '',
        symbol: normalizedSymbol,
        side: side === 'buy' ? 'sell' : 'buy',
        type: 'limit',
        price: takeProfitPrice,
        size: Math.abs(units).toString(),
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      }
    } catch (error) {
      console.error('OANDA placeTakeProfitOrder error:', error)
      throw error
    }
  }
}

export const oandaService = new OandaService()

