# OANDA Forex Broker Setup

This trading bot now supports forex trading via OANDA in addition to cryptocurrency trading via KuCoin.

## Getting OANDA API Credentials

1. **Sign up for OANDA**
   - Go to https://www.oanda.com/
   - Create an account (start with a practice/demo account for testing)

2. **Create an API Token**
   - Log in to your OANDA account
   - Navigate to: **Manage API Access** (in your account settings)
   - Create a new API token
   - Copy the API token (you'll need this)

3. **Get Your Account ID**
   - Your Account ID can be found in your OANDA account dashboard
   - It's usually a 7-digit number (e.g., 1234567)

## Environment Variables

Add these to your `.env` file:

```bash
# OANDA Forex Broker (Optional - only needed for forex trading)
OANDA_API_KEY=your_oanda_api_token_here
OANDA_ACCOUNT_ID=your_account_id_here
OANDA_ENVIRONMENT=practice  # Use 'practice' for demo account, 'live' for real trading
```

## How It Works

The bot automatically detects which exchange to use based on the trading symbol:

- **Forex pairs** (EUR-USD, GBP-USD, etc.) → Uses **OANDA**
- **Crypto pairs** (BTC-USDT, ETH-USDT, etc.) → Uses **KuCoin**

### Supported Forex Symbols

- Major pairs: EUR-USD, GBP-USD, USD-JPY, AUD-USD, USD-CAD, USD-CHF, NZD-USD
- Cross pairs: EUR-GBP, EUR-JPY, GBP-JPY, AUD-JPY, EUR-AUD, etc.

### Supported Crypto Symbols

- All KuCoin trading pairs: BTC-USDT, ETH-USDT, etc.

## Testing the Connection

1. **Test OANDA Connection**
   - Go to the home page
   - Click "Test API Connection" (it will automatically detect OANDA for forex symbols)
   - Or test directly: `/api/test-connection?symbol=EUR-USD`

2. **Test Backtest with Forex**
   - Go to Backtest page
   - Select a forex symbol like "EUR-USD"
   - Run a backtest - it will automatically use OANDA for historical data

## Important Notes

- **Practice Account**: Use `OANDA_ENVIRONMENT=practice` for demo/testing
- **Live Trading**: Change to `OANDA_ENVIRONMENT=live` only when ready for real trading
- **Symbol Format**: Use `-` separator (e.g., `EUR-USD`) - the system will convert to OANDA's format
- **Leverage**: OANDA typically offers leverage on forex pairs (check your account settings)

## Backtesting Forex

The backtest system now supports forex pairs:
- Historical data comes from OANDA
- Strategies work the same way for both forex and crypto
- Forex backtests use proper pip calculations

## Risk Management

- Forex trading involves leverage and can result in significant losses
- Always start with a practice account
- Use proper risk management (stop loss, position sizing)
- Be aware of forex market hours and liquidity

