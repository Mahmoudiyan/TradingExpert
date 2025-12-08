// Exchange router - automatically selects the right exchange based on symbol
import type { ExchangeService } from './interface'
import { kucoinService } from '../kucoin'
import { oandaService } from './oanda'

// Detect if a symbol is a forex pair
function isForexSymbol(symbol: string): boolean {
  const forexPatterns = [
    /^(EUR|GBP|USD|JPY|CHF|AUD|NZD|CAD|SEK|NOK|DKK|ZAR|TRY|MXN|SGD|HKD|CNH)_(EUR|GBP|USD|JPY|CHF|AUD|NZD|CAD|SEK|NOK|DKK|ZAR|TRY|MXN|SGD|HKD|CNH)$/i,
    /^(EUR|GBP|USD|JPY|CHF|AUD|NZD|CAD|SEK|NOK|DKK|ZAR|TRY|MXN|SGD|HKD|CNH)-(EUR|GBP|USD|JPY|CHF|AUD|NZD|CAD|SEK|NOK|DKK|ZAR|TRY|MXN|SGD|HKD|CNH)$/i,
    /^(EUR|GBP|USD|JPY|CHF|AUD|NZD|CAD|SEK|NOK|DKK|ZAR|TRY|MXN|SGD|HKD|CNH)\/(EUR|GBP|USD|JPY|CHF|AUD|NZD|CAD|SEK|NOK|DKK|ZAR|TRY|MXN|SGD|HKD|CNH)$/i,
  ]
  
  return forexPatterns.some(pattern => pattern.test(symbol))
}

// Detect if a symbol is a crypto pair
function isCryptoSymbol(symbol: string): boolean {
  // Crypto pairs typically end with -USDT, -BTC, -ETH, etc.
  // Or contain common crypto symbols
  const cryptoPatterns = [
    /-(USDT|BTC|ETH|BNB|BUSD|USDC|DAI|TUSD)$/i,
    /^(BTC|ETH|LTC|XRP|ADA|DOT|SOL|MATIC|AVAX|LINK|UNI|ATOM)/i,
  ]
  
  return cryptoPatterns.some(pattern => pattern.test(symbol))
}

/**
 * Get the appropriate exchange service for a given symbol
 * @param symbol - Trading symbol (e.g., 'EUR-USD', 'BTC-USDT')
 * @returns ExchangeService instance
 */
export function getExchangeForSymbol(symbol: string): ExchangeService {
  // Check if it's a forex pair
  if (isForexSymbol(symbol)) {
    if (oandaService.isSymbolSupported(symbol)) {
      console.log(`[Exchange Router] Using OANDA for forex symbol: ${symbol}`)
      return oandaService
    }
  }
  
  // Default to KuCoin for crypto or if forex not available
  console.log(`[Exchange Router] Using KuCoin for symbol: ${symbol}`)
  return kucoinService as unknown as ExchangeService
}

/**
 * Get exchange name for a symbol
 */
export function getExchangeName(symbol: string): string {
  const exchange = getExchangeForSymbol(symbol)
  return exchange.getName()
}

