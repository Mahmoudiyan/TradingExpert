#!/usr/bin/env node

/**
 * Comprehensive test script for all trade scenarios
 * Tests: balance check, place order with SL/TP, close order
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SYMBOL = process.argv[2] || 'ETH-USDT';
const EXCHANGE = process.argv[3] || 'KuCoin';

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testBalance() {
  log('\n========================================', 'blue');
  log('TEST 1: Check Balance', 'blue');
  log('========================================', 'blue');
  
  try {
    const response = await fetch(`${BASE_URL}/api/balance?symbol=${SYMBOL}&exchange=${EXCHANGE}`);
    const data = await response.json();
    
    if (data.success && data.available !== undefined) {
      log(`✓ Balance check successful: ${data.available} USDT available`, 'green');
      return data.available;
    } else {
      log(`✗ Balance check failed: ${data.error || 'Unknown error'}`, 'red');
      console.log('Response:', JSON.stringify(data, null, 2));
      return null;
    }
  } catch (error) {
    log(`✗ Balance check error: ${error.message}`, 'red');
    return null;
  }
}

async function testPlaceBuyOrder() {
  log('\n========================================', 'blue');
  log('TEST 2: Place Buy Order (Minimum Amount)', 'blue');
  log('========================================', 'blue');
  
  try {
    log('ℹ Placing buy order with 0.11 USDT (minimum for KuCoin)...', 'yellow');
    
    const response = await fetch(`${BASE_URL}/api/test-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: SYMBOL,
        side: 'buy',
        exchange: EXCHANGE,
        funds: 0.11,
      }),
    });
    
    const data = await response.json();
    
    if (data.success && data.trade) {
      log('✓ Buy order placed successfully!', 'green');
      log(`  Trade ID: ${data.trade.id}`, 'yellow');
      log(`  Order ID: ${data.trade.orderId}`, 'yellow');
      log(`  Price: ${data.trade.price}`, 'yellow');
      log(`  Size: ${data.trade.size}`, 'yellow');
      log(`  Status: ${data.trade.status}`, 'yellow');
      
      if (data.trade.stopLoss) {
        log(`  ✓ Stop-Loss price: ${data.trade.stopLoss}`, 'green');
      } else {
        log('  ✗ Stop-Loss price not set', 'red');
      }
      
      if (data.trade.takeProfit) {
        log(`  ✓ Take-Profit price: ${data.trade.takeProfit}`, 'green');
      } else {
        log('  ✗ Take-Profit price not set', 'red');
      }
      
      if (data.slOrderId) {
        log(`  ✓ Stop-Loss order ID: ${data.slOrderId}`, 'green');
      } else {
        log('  ⚠ Stop-Loss order not placed (may have failed)', 'yellow');
      }
      
      if (data.tpOrderId) {
        log(`  ✓ Take-Profit order ID: ${data.tpOrderId}`, 'green');
      } else {
        log('  ⚠ Take-Profit order not placed (may have failed)', 'yellow');
      }
      
      log('\nℹ Waiting 2 seconds for order to settle...', 'yellow');
      await sleep(2000);
      
      return data.trade.id;
    } else {
      log(`✗ Buy order failed: ${data.error || 'Unknown error'}`, 'red');
      console.log('Response:', JSON.stringify(data, null, 2));
      return null;
    }
  } catch (error) {
    log(`✗ Buy order error: ${error.message}`, 'red');
    return null;
  }
}

async function testVerifyTrade(tradeId) {
  log('\n========================================', 'blue');
  log('TEST 3: Verify Trade in Database', 'blue');
  log('========================================', 'blue');
  
  if (!tradeId) {
    log('✗ No trade ID to verify', 'red');
    return null;
  }
  
  try {
    log(`ℹ Fetching trade details for ID: ${tradeId}`, 'yellow');
    
    const response = await fetch(`${BASE_URL}/api/trades?limit=100`);
    const trades = await response.json();
    
    const trade = trades.find(t => t.id === tradeId);
    
    if (trade) {
      log('✓ Trade found in database', 'green');
      log(`  Status: ${trade.status}`, 'yellow');
      log(`  Side: ${trade.side}`, 'yellow');
      log(`  Price: ${trade.price}`, 'yellow');
      log(`  Size: ${trade.size}`, 'yellow');
      
      if (trade.stopLoss) {
        log(`  ✓ Stop-Loss: ${trade.stopLoss}`, 'green');
      } else {
        log('  ✗ Stop-Loss not set', 'red');
      }
      
      if (trade.takeProfit) {
        log(`  ✓ Take-Profit: ${trade.takeProfit}`, 'green');
      } else {
        log('  ✗ Take-Profit not set', 'red');
      }
      
      return trade.status;
    } else {
      log('✗ Trade not found in database', 'red');
      return null;
    }
  } catch (error) {
    log(`✗ Verify trade error: ${error.message}`, 'red');
    return null;
  }
}

async function testCloseTrade(tradeId) {
  log('\n========================================', 'blue');
  log('TEST 4: Close Trade', 'blue');
  log('========================================', 'blue');
  
  if (!tradeId) {
    log('✗ No trade ID to close', 'red');
    return false;
  }
  
  try {
    log(`ℹ Closing trade ID: ${tradeId}`, 'yellow');
    
    const response = await fetch(`${BASE_URL}/api/trades/${tradeId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    const data = await response.json();
    
    if (data.success) {
      log('✓ Trade closed successfully!', 'green');
      
      if (data.profit !== undefined) {
        log(`  Profit: ${data.profit.toFixed(4)} USDT`, 'yellow');
      }
      
      if (data.profitPercent !== undefined) {
        log(`  Profit %: ${data.profitPercent.toFixed(2)}%`, 'yellow');
      }
      
      if (data.trade) {
        log(`  Final Status: ${data.trade.status}`, 'yellow');
      }
      
      return true;
    } else {
      log(`✗ Failed to close trade: ${data.error || 'Unknown error'}`, 'red');
      console.log('Response:', JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    log(`✗ Close trade error: ${error.message}`, 'red');
    return false;
  }
}

async function testVerifyClosed(tradeId) {
  log('\n========================================', 'blue');
  log('TEST 5: Verify Trade is Closed', 'blue');
  log('========================================', 'blue');
  
  if (!tradeId) {
    log('✗ No trade ID to verify', 'red');
    return;
  }
  
  try {
    log('ℹ Verifying trade status...', 'yellow');
    await sleep(1000);
    
    const response = await fetch(`${BASE_URL}/api/trades?limit=100`);
    const trades = await response.json();
    
    const trade = trades.find(t => t.id === tradeId);
    
    if (trade) {
      const status = trade.status;
      if (status === 'closed' || status === 'cancelled') {
        log(`✓ Trade status confirmed: ${status}`, 'green');
      } else {
        log(`⚠ Trade status: ${status} (may still be processing)`, 'yellow');
      }
      
      if (trade.closedAt) {
        log(`  Closed at: ${new Date(trade.closedAt).toLocaleString()}`, 'yellow');
      }
      
      if (trade.profit !== null) {
        log(`  Final Profit: ${trade.profit.toFixed(4)} USDT`, 'yellow');
      }
    } else {
      log('⚠ Trade not found (may have been filtered)', 'yellow');
    }
  } catch (error) {
    log(`✗ Verify closed error: ${error.message}`, 'red');
  }
}

async function runAllTests() {
  log('\n========================================', 'blue');
  log('Comprehensive Trade Scenario Testing', 'blue');
  log('========================================', 'blue');
  log(`Base URL: ${BASE_URL}`, 'yellow');
  log(`Symbol: ${SYMBOL}`, 'yellow');
  log(`Exchange: ${EXCHANGE}`, 'yellow');
  
  // Test 1: Check Balance (optional - may require auth)
  log('\nℹ Note: Balance check may require authentication, continuing anyway...', 'yellow');
  const balance = await testBalance();
  if (balance === null) {
    log('⚠ Balance check failed or requires auth, but continuing with trade tests...', 'yellow');
  }
  
  // Test 2: Place Buy Order
  const tradeId = await testPlaceBuyOrder();
  if (!tradeId) {
    log('\n✗ Buy order failed, aborting tests', 'red');
    process.exit(1);
  }
  
  // Test 3: Verify Trade
  await testVerifyTrade(tradeId);
  
  // Test 4: Close Trade
  const closed = await testCloseTrade(tradeId);
  if (!closed) {
    log('\n⚠ Trade close failed, but continuing...', 'yellow');
  }
  
  // Test 5: Verify Closed
  await testVerifyClosed(tradeId);
  
  log('\n========================================', 'blue');
  log('All Tests Completed', 'blue');
  log('========================================', 'blue');
  log('✓ Trade scenarios test finished!', 'green');
}

// Run tests
runAllTests().catch(error => {
  log(`\n✗ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

