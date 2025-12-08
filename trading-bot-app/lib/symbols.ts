// Trading symbols organized by exchange
export const FOREX_SYMBOLS = [
  { value: 'EUR-USD', label: 'Euro / US Dollar (EUR/USD)' },
  { value: 'GBP-USD', label: 'British Pound / US Dollar (GBP/USD)' },
  { value: 'USD-JPY', label: 'US Dollar / Japanese Yen (USD/JPY)' },
  { value: 'AUD-USD', label: 'Australian Dollar / US Dollar (AUD/USD)' },
  { value: 'USD-CAD', label: 'US Dollar / Canadian Dollar (USD/CAD)' },
  { value: 'USD-CHF', label: 'US Dollar / Swiss Franc (USD/CHF)' },
  { value: 'NZD-USD', label: 'New Zealand Dollar / US Dollar (NZD/USD)' },
  { value: 'EUR-GBP', label: 'Euro / British Pound (EUR/GBP)' },
  { value: 'EUR-JPY', label: 'Euro / Japanese Yen (EUR/JPY)' },
  { value: 'GBP-JPY', label: 'British Pound / Japanese Yen (GBP/JPY)' },
  { value: 'AUD-JPY', label: 'Australian Dollar / Japanese Yen (AUD/JPY)' },
  { value: 'EUR-AUD', label: 'Euro / Australian Dollar (EUR/AUD)' },
  { value: 'GBP-AUD', label: 'British Pound / Australian Dollar (GBP/AUD)' },
  { value: 'EUR-CAD', label: 'Euro / Canadian Dollar (EUR/CAD)' },
  { value: 'GBP-CAD', label: 'British Pound / Canadian Dollar (GBP/CAD)' },
  { value: 'EUR-CHF', label: 'Euro / Swiss Franc (EUR/CHF)' },
  { value: 'AUD-CAD', label: 'Australian Dollar / Canadian Dollar (AUD/CAD)' },
  { value: 'AUD-NZD', label: 'Australian Dollar / New Zealand Dollar (AUD/NZD)' },
  { value: 'CAD-JPY', label: 'Canadian Dollar / Japanese Yen (CAD/JPY)' },
  { value: 'CHF-JPY', label: 'Swiss Franc / Japanese Yen (CHF/JPY)' },
]

export const CRYPTO_SYMBOLS = [
  { value: 'BTC-USDT', label: 'Bitcoin (BTC/USDT)' },
  { value: 'ETH-USDT', label: 'Ethereum (ETH/USDT)' },
  { value: 'BNB-USDT', label: 'Binance Coin (BNB/USDT)' },
  { value: 'SOL-USDT', label: 'Solana (SOL/USDT)' },
  { value: 'XRP-USDT', label: 'Ripple (XRP/USDT)' },
  { value: 'ADA-USDT', label: 'Cardano (ADA/USDT)' },
  { value: 'DOGE-USDT', label: 'Dogecoin (DOGE/USDT)' },
  { value: 'DOT-USDT', label: 'Polkadot (DOT/USDT)' },
  { value: 'MATIC-USDT', label: 'Polygon (MATIC/USDT)' },
  { value: 'AVAX-USDT', label: 'Avalanche (AVAX/USDT)' },
  { value: 'LINK-USDT', label: 'Chainlink (LINK/USDT)' },
  { value: 'UNI-USDT', label: 'Uniswap (UNI/USDT)' },
  { value: 'ATOM-USDT', label: 'Cosmos (ATOM/USDT)' },
  { value: 'ETC-USDT', label: 'Ethereum Classic (ETC/USDT)' },
  { value: 'LTC-USDT', label: 'Litecoin (LTC/USDT)' },
  { value: 'NEAR-USDT', label: 'NEAR Protocol (NEAR/USDT)' },
  { value: 'ALGO-USDT', label: 'Algorand (ALGO/USDT)' },
  { value: 'FIL-USDT', label: 'Filecoin (FIL/USDT)' },
  { value: 'TRX-USDT', label: 'TRON (TRX/USDT)' },
  { value: 'EOS-USDT', label: 'EOS (EOS/USDT)' },
]

// All symbols for backward compatibility
export const POPULAR_SYMBOLS = [...FOREX_SYMBOLS, ...CRYPTO_SYMBOLS]

// Get symbols by exchange
export function getSymbolsByExchange(exchange: string) {
  if (exchange === 'OANDA') {
    return FOREX_SYMBOLS
  } else if (exchange === 'KuCoin') {
    return CRYPTO_SYMBOLS
  }
  return POPULAR_SYMBOLS
}

