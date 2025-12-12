// Exchange abstraction interface
// This allows the system to support multiple exchanges (KuCoin for crypto, OANDA for forex, etc.)

export interface Kline {
  time: number
  open: string
  high: string
  low: string
  close: string
  volume: string
}

export interface Ticker {
  price: string
  bestAsk: string
  bestBid: string
}

export interface Account {
  id: string
  currency: string
  type: string
  balance: string
  available: string
  holds: string
}

export interface Order {
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

export interface ExchangeService {
  // Get account balances
  getAccounts(currency?: string): Promise<Account[]>
  
  // Get balance for a specific currency
  getBalance(currency: string): Promise<number>
  
  // Get candlestick data (klines)
  getKlines(
    symbol: string,
    timeframe: string,
    startAt?: number,
    endAt?: number
  ): Promise<Kline[]>
  
  // Get current ticker
  getTicker(symbol: string): Promise<Ticker>
  
  // Place market order
  placeMarketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size?: string,
    funds?: string
  ): Promise<Order>
  
  // Place limit order
  placeLimitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    price: string,
    size: string
  ): Promise<Order>
  
  // Cancel order
  cancelOrder(orderId: string): Promise<void>
  
  // Get order details
  getOrder(orderId: string): Promise<Order>
  
  // Get open orders
  getOpenOrders(symbol?: string): Promise<Order[]>
  
  // Place stop-loss order (for protecting open positions)
  placeStopLossOrder(
    symbol: string,
    side: 'buy' | 'sell',
    stopPrice: string,
    size: string
  ): Promise<Order>
  
  // Place take-profit order (for protecting open positions)
  placeTakeProfitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    takeProfitPrice: string,
    size: string
  ): Promise<Order>
  
  // Detect if symbol is supported by this exchange
  isSymbolSupported(symbol: string): boolean
  
  // Get exchange name
  getName(): string
}

