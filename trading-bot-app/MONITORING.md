# Bot Monitoring Guide

There are several ways to monitor your trading bot activity:

## 1. Web Interface (Recommended)

The easiest way to monitor the bot is through the web interface:

- **Dashboard**: http://localhost:3000
  - Shows bot status, balance, and quick stats
  - Auto-refreshes every 5 minutes

- **Logs Page**: http://localhost:3000/logs
  - Real-time bot activity logs
  - Filter by level (info, warning, error)
  - Auto-refreshes every 5 seconds
  - Shows all bot operations, signals, and errors

- **Trades Page**: http://localhost:3000/trades
  - All executed trades
  - Trade performance and profit/loss
  - Auto-refreshes every 10 seconds

## 2. Command Line Monitor

Use the built-in monitoring script for real-time terminal monitoring:

```bash
# Monitor with default 10-second updates
node monitor-bot.js

# Monitor with custom update interval (e.g., 5 seconds)
node monitor-bot.js 5

# Monitor with 30-second updates
node monitor-bot.js 30
```

The monitor shows:
- ✅ Bot running status
- ⏱️ Time since last check
- 📊 Total trades and profit
- ⚙️ Active configuration
- 💰 Recent trades
- 📝 Recent logs (last 10)

Press `Ctrl+C` to stop monitoring.

## 3. Quick Status Check

For a one-time status check:

```bash
node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); (async () => { const s = await p.botStatus.findUnique({where: {id: 'main'}}); const c = await p.botConfig.findFirst({where: {isActive: true}, orderBy: {updatedAt: 'desc'}}); const t = await p.trade.findMany({orderBy: {openedAt: 'desc'}, take: 3}); console.log('Bot:', s?.isRunning ? 'RUNNING' : 'STOPPED'); console.log('Config:', c?.symbol, c?.timeframe); console.log('Trades:', t.length); t.forEach(t => console.log(\`  \${t.side} \${t.symbol} @ \${t.price} - \${t.status}\`)); await p.\$disconnect(); })();"
```

## 4. Database Queries

You can query the database directly:

```bash
# Check bot status
PGPASSWORD='TradingExpert6636!' psql -h localhost -U tradingexpert_user -d tradingexpert -c "SELECT * FROM \"BotStatus\" WHERE id = 'main';"

# View recent logs
PGPASSWORD='TradingExpert6636!' psql -h localhost -U tradingexpert_user -d tradingexpert -c "SELECT level, message, \"createdAt\" FROM \"BotLog\" ORDER BY \"createdAt\" DESC LIMIT 10;"

# View recent trades
PGPASSWORD='TradingExpert6636!' psql -h localhost -U tradingexpert_user -d tradingexpert -c "SELECT symbol, side, price, size, status, \"openedAt\" FROM \"Trade\" ORDER BY \"openedAt\" DESC LIMIT 10;"
```

## What to Monitor

### Key Metrics:
- **Bot Status**: Should be "Running" when active
- **Last Check**: Should update every minute for 1min timeframe
- **Recent Logs**: Watch for errors or trading signals
- **Trades**: Monitor executed trades and their performance

### Common Issues:
- **"Insufficient balance"**: Need to add funds to your exchange account
- **"Spread too wide"**: Market conditions not suitable for trading
- **No signals**: Bot is waiting for EMA crossover signals
- **Bot not checking**: Interval may have been lost (will auto-recover)

## Tips

1. **Keep the web interface open** in a browser tab for easy monitoring
2. **Use the terminal monitor** when actively watching for trades
3. **Check logs regularly** to catch any errors early
4. **Monitor balance** to ensure sufficient funds for trading

