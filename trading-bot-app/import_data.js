/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://tradingexpert_user:TradingExpert6636!@postgres:5432/tradingexpert?schema=public'
    }
  }
});

(async () => {
  try {
    const data = JSON.parse(fs.readFileSync('/tmp/trading_bot_export.json', 'utf8'));
    
    console.log('Importing data...');
    
    if (data.botConfigs && data.botConfigs.length > 0) {
      await prisma.botConfig.createMany({ data: data.botConfigs, skipDuplicates: true });
      console.log('✓ Imported', data.botConfigs.length, 'BotConfig records');
    }
    
    if (data.trades && data.trades.length > 0) {
      await prisma.trade.createMany({ data: data.trades, skipDuplicates: true });
      console.log('✓ Imported', data.trades.length, 'Trade records');
    }
    
    if (data.botStatus && data.botStatus.length > 0) {
      for (const status of data.botStatus) {
        await prisma.botStatus.upsert({
          where: { id: status.id },
          update: status,
          create: status
        });
      }
      console.log('✓ Imported', data.botStatus.length, 'BotStatus records');
    }
    
    if (data.botLogs && data.botLogs.length > 0) {
      await prisma.botLog.createMany({ data: data.botLogs, skipDuplicates: true });
      console.log('✓ Imported', data.botLogs.length, 'BotLog records');
    }
    
    if (data.backtests && data.backtests.length > 0) {
      await prisma.backtest.createMany({ data: data.backtests, skipDuplicates: true });
      console.log('✓ Imported', data.backtests.length, 'Backtest records');
    }
    
    console.log('✓ All data imported successfully!');
    await prisma.$disconnect();
  } catch(e) {
    console.error('Error:', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
})();
