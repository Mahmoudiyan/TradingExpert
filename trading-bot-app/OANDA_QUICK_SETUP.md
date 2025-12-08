# OANDA Quick Setup Guide

## Step 1: Change Your Password (Recommended)

1. Go to https://www.oanda.com/
2. Log in with your current credentials:
   - Login: 62467866
   - Password: _h4SZ4v! (change this!)
3. Navigate to Account Settings → Security/Password
4. Change your password to something secure
5. **Save it securely** - you'll need it to access OANDA's website

## Step 2: Get Your Account ID

1. After logging in, look at your dashboard
2. Your **Account ID** is usually displayed at the top of the page
3. For demo account 62467866, the Account ID might be: **62467866** (same as login, or check dashboard)
4. Write it down: ___________________

## Step 3: Create API Token

1. In your OANDA account, go to: **Manage API Access**
   - Usually found in: Account Settings → API Access
   - Or search for "API" in the menu
2. Click **"Generate API Token"** or **"Create New Token"**
3. Give it a name (e.g., "TradingBot")
4. **Copy the token immediately** - you won't be able to see it again!
5. It will look something like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0`
6. Write it down: ___________________

## Step 4: Add to Environment Variables

Add these to your `.env` file in the `trading-bot-app` directory:

```bash
# OANDA Forex Broker (Demo Account)
OANDA_API_KEY=your_api_token_from_step_3
OANDA_ACCOUNT_ID=your_account_id_from_step_2
OANDA_ENVIRONMENT=practice
```

**Important**: 
- Replace `your_api_token_from_step_3` with the actual API token you copied
- Replace `your_account_id_from_step_2` with your Account ID (usually 62467866 for your demo account)
- Keep `OANDA_ENVIRONMENT=practice` for demo account (change to `live` only for real accounts)

## Step 5: Test the Connection

1. Restart your Next.js server if it's running
2. Go to your trading bot home page
3. Test with a forex symbol:
   - Go to Backtest page
   - Select "EUR-USD" or any forex pair
   - Run a backtest
   - The system will automatically use OANDA

Or test the API connection directly:
- Visit: `http://localhost:3000/api/test-connection?symbol=EUR-USD`

## Troubleshooting

**Can't find "Manage API Access"?**
- Try: Account → Settings → API Access
- Or search for "API" in the OANDA dashboard
- Some accounts might need to enable API access first

**API token not working?**
- Make sure you copied the entire token (they're long!)
- Check there are no extra spaces
- Verify `OANDA_ENVIRONMENT=practice` for demo account

**Account ID not found?**
- Check the top-right of your dashboard
- Look in Account Settings → Account Information
- For demo account, it might be the same as your login number

## Security Notes

⚠️ **Never commit your `.env` file to git!**
- Your API token is like a password - keep it secret
- The `.env` file should be in `.gitignore`
- Share credentials only with trusted services

