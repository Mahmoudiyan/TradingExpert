#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ANSI color codes for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function formatTime(date) {
  return new Date(date).toLocaleString();
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

async function displayStatus() {
  try {
    const status = await prisma.botStatus.findUnique({
      where: { id: 'main' },
    });

    const config = await prisma.botConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    const recentLogs = await prisma.botLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const recentTrades = await prisma.trade.findMany({
      orderBy: { openedAt: 'desc' },
      take: 5,
    });

    // Clear screen and move cursor to top
    process.stdout.write('\x1b[2J\x1b[H');

    console.log(`${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}║           TRADING BOT MONITOR - Real-time Activity          ║${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log('');

    // Bot Status
    console.log(`${colors.bright}📊 BOT STATUS:${colors.reset}`);
    const runningIcon = status?.isRunning ? `${colors.green}✅ YES${colors.reset}` : `${colors.red}❌ NO${colors.reset}`;
    console.log(`   Running: ${runningIcon}`);

    if (status?.lastCheck) {
      const lastCheck = new Date(status.lastCheck);
      const now = new Date();
      const diffSeconds = Math.floor((now - lastCheck) / 1000);
      const diffFormatted = formatDuration(diffSeconds);
      const statusColor = diffSeconds <= 120 ? colors.green : diffSeconds <= 300 ? colors.yellow : colors.red;
      console.log(`   Last Check: ${formatTime(lastCheck)} ${colors.gray}(${statusColor}${diffFormatted} ago${colors.reset}${colors.gray})${colors.reset}`);
    } else {
      console.log(`   Last Check: ${colors.red}Never${colors.reset}`);
    }

    console.log(`   Total Trades: ${colors.bright}${status?.totalTrades || 0}${colors.reset}`);
    console.log(`   Total Profit: ${status?.totalProfit ? (status.totalProfit >= 0 ? `${colors.green}+${status.totalProfit.toFixed(2)}${colors.reset}` : `${colors.red}${status.totalProfit.toFixed(2)}${colors.reset}`) : '0.00'}`);
    console.log(`   Win Rate: ${status?.totalTrades > 0 ? ((status.winningTrades / status.totalTrades) * 100).toFixed(1) : 0}%`);
    if (status?.lastTrade) {
      console.log(`   Last Trade: ${formatTime(status.lastTrade)}`);
    } else {
      console.log(`   Last Trade: ${colors.gray}None${colors.reset}`);
    }
    console.log('');

    // Active Config
    if (config) {
      console.log(`${colors.bright}⚙️  ACTIVE CONFIG:${colors.reset}`);
      console.log(`   Symbol: ${colors.cyan}${config.symbol}${colors.reset}`);
      console.log(`   Timeframe: ${colors.cyan}${config.timeframe}${colors.reset}`);
      console.log(`   Strategy: EMA(${config.fastMA}/${config.slowMA})`);
      console.log(`   Risk: ${config.riskPercent}% | StopLoss: ${config.stopLossPips}pips | TakeProfit: ${config.takeProfitPips}pips`);
      console.log('');
    }

    // Recent Trades
    console.log(`${colors.bright}💰 RECENT TRADES:${colors.reset}`);
    if (recentTrades.length === 0) {
      console.log(`   ${colors.gray}No trades yet${colors.reset}`);
    } else {
      recentTrades.forEach(t => {
        const time = formatTime(t.openedAt);
        const profit = t.profit !== null ? (t.profit >= 0 ? `${colors.green}+${t.profit.toFixed(2)}${colors.reset}` : `${colors.red}${t.profit.toFixed(2)}${colors.reset}`) : '0.00';
        const sideColor = t.side === 'buy' ? colors.green : colors.red;
        console.log(`   ${time} - ${sideColor}${t.side.toUpperCase()}${colors.reset} ${t.size.toFixed(8)} ${t.symbol} @ ${t.price.toFixed(2)} [${t.status}] Profit: ${profit}`);
      });
    }
    console.log('');

    // Recent Logs
    console.log(`${colors.bright}📝 RECENT LOGS (last 10):${colors.reset}`);
    if (recentLogs.length === 0) {
      console.log(`   ${colors.gray}No logs${colors.reset}`);
    } else {
      recentLogs.forEach(log => {
        const time = formatTime(log.createdAt);
        let icon, color;
        if (log.level === 'error') {
          icon = '❌';
          color = colors.red;
        } else if (log.level === 'warning') {
          icon = '⚠️';
          color = colors.yellow;
        } else {
          icon = 'ℹ️';
          color = colors.blue;
        }
        const message = log.message.length > 70 ? log.message.substring(0, 70) + '...' : log.message;
        console.log(`   ${icon} ${colors.gray}[${time}]${colors.reset} ${color}${log.level.toUpperCase()}${colors.reset}: ${message}`);
      });
    }
    console.log('');

    console.log(`${colors.gray}────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`${colors.gray}Last updated: ${formatTime(new Date())} | Press Ctrl+C to stop${colors.reset}`);

  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error.message);
  }
}

// Get update interval from command line or default to 10 seconds
const intervalSeconds = parseInt(process.argv[2]) || 10;
const intervalMs = intervalSeconds * 1000;

console.log(`${colors.cyan}Starting bot monitor (updating every ${intervalSeconds} seconds)...${colors.reset}`);
console.log(`${colors.gray}Press Ctrl+C to stop${colors.reset}\n`);

// Display immediately
displayStatus();

// Update at interval
const intervalId = setInterval(displayStatus, intervalMs);

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log(`\n${colors.yellow}Stopping monitor...${colors.reset}`);
  clearInterval(intervalId);
  await prisma.$disconnect();
  process.exit(0);
});
