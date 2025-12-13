/**
 * Browser Console Test Script for All Trade Scenarios
 * 
 * Copy and paste this entire script into the browser console (F12) on the trading bot app
 * 
 * Tests:
 * 1. Check Balance
 * 2. Place Buy Order (minimum amount)
 * 3. Verify SL/TP orders placed
 * 4. Close the trade
 * 5. Verify trade is closed
 */

(async function testAllScenarios() {
  const SYMBOL = 'ETH-USDT';
  const EXCHANGE = 'KuCoin';
  
  const log = (message, type = 'info') => {
    const colors = {
      success: 'color: green; font-weight: bold',
      error: 'color: red; font-weight: bold',
      warning: 'color: orange; font-weight: bold',
      info: 'color: blue',
    };
    console.log(`%c${message}`, colors[type] || colors.info);
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  console.log('%c========================================', 'font-weight: bold; color: blue');
  console.log('%cTrade Scenario Testing', 'font-weight: bold; font-size: 16px; color: blue');
  console.log('%c========================================', 'font-weight: bold; color: blue');
  console.log(`Symbol: ${SYMBOL}`);
  console.log(`Exchange: ${EXCHANGE}\n`);

  let tradeId = null;

  // TEST 1: Check Balance
  console.log('\n%cTEST 1: Check Balance', 'font-weight: bold; color: blue');
  try {
    const balanceRes = await fetch(`/api/balance?symbol=${SYMBOL}&exchange=${EXCHANGE}`);
    const balanceData = await balanceRes.json();
    if (balanceData.success) {
      log(`✓ Balance: ${balanceData.available} USDT`, 'success');
    } else {
      log(`✗ Balance check failed: ${balanceData.error}`, 'error');
    }
  } catch (error) {
    log(`✗ Balance check error: ${error.message}`, 'error');
  }

  // TEST 2: Place Buy Order
  console.log('\n%cTEST 2: Place Buy Order (Testing New Safety Approach)', 'font-weight: bold; color: blue');
  try {
    // Use 1 USDT to ensure SL/TP orders can be placed successfully
    // (Bot now requires minimum 0.11 USDT, but 1 USDT gives better margin)
    const testFunds = 1.0;
    log(`Placing buy order with ${testFunds} USDT (testing new safety: order will fail if SL/TP can't be placed)...`, 'info');
    
    const buyRes = await fetch('/api/test-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: SYMBOL,
        side: 'buy',
        exchange: EXCHANGE,
        funds: testFunds,
      }),
    });
    
    const buyData = await buyRes.json();
    
    if (buyData.success) {
      log('✓ Buy order placed successfully!', 'success');
      console.log('Trade:', buyData.trade);
      
      tradeId = buyData.trade.id;
      
      if (buyData.trade.stopLoss) {
        log(`✓ Stop-Loss price: ${buyData.trade.stopLoss}`, 'success');
      } else {
        log('✗ Stop-Loss price not set', 'error');
      }
      
      if (buyData.trade.takeProfit) {
        log(`✓ Take-Profit price: ${buyData.trade.takeProfit}`, 'success');
      } else {
        log('✗ Take-Profit price not set', 'error');
      }
      
      // NEW SAFETY FEATURE: With larger trade size, SL/TP should be placed successfully
      // NEW SAFETY LOGIC:
      // - SL (Stop-Loss) is REQUIRED: If SL fails, trade is auto-closed
      // - TP (Take-Profit) is OPTIONAL: If TP fails but SL is placed, trade remains open (acceptable for spot trading)
      
      if (buyData.slOrderId) {
        log(`✓ Stop-Loss order ID: ${buyData.slOrderId}`, 'success');
        log('✓ NEW SAFETY: Stop-Loss protection active!', 'success');
      } else {
        if (buyData.slError) {
          log(`✗ Stop-Loss order FAILED: ${buyData.slError}`, 'error');
          log('⚠ WARNING: Trade should have been auto-closed by safety feature!', 'error');
          // Check if trade was auto-closed
          await sleep(1000);
          try {
            const checkRes = await fetch(`/api/trades?limit=100`);
            const checkTrades = await checkRes.json();
            const checkTrade = checkTrades.find(t => t.id === tradeId);
            if (checkTrade && (checkTrade.status === 'closed' || checkTrade.status === 'cancelled')) {
              log(`✓ SAFETY WORKED: Trade auto-closed (status: ${checkTrade.status})`, 'success');
              log('⚠ Test stopping here - trade was closed by safety feature', 'warning');
              return; // Stop test here as trade was auto-closed
            } else {
              log(`✗ SAFETY FAILED: Trade not auto-closed when SL failed!`, 'error');
            }
          } catch (err) {
            log(`Error checking trade status: ${err.message}`, 'error');
          }
        } else {
          log('⚠ Stop-Loss order not placed', 'warning');
        }
      }
      
      if (buyData.tpOrderId) {
        log(`✓ Take-Profit order ID: ${buyData.tpOrderId}`, 'success');
        log('✓ NEW SAFETY: Take-Profit protection active!', 'success');
      } else {
        if (buyData.tpError) {
          // TP failure is acceptable if SL is placed (expected for spot trading due to balance reservation)
          if (buyData.slOrderId) {
            log(`⚠ Take-Profit order FAILED: ${buyData.tpError}`, 'warning');
            log('ℹ️ This is ACCEPTABLE: TP failed but SL is active (balance reserved by SL in spot trading)', 'info');
          } else {
            log(`✗ Take-Profit order FAILED: ${buyData.tpError}`, 'error');
            log('⚠ WARNING: TP failed and SL also not placed - trade should be auto-closed!', 'error');
          }
        } else {
          log('⚠ Take-Profit order not placed', 'warning');
        }
      }
      
      await sleep(2000);
    } else {
      log(`✗ Buy order failed: ${buyData.error}`, 'error');
      if (buyData.error && buyData.error.includes('too small')) {
        log('✓ SAFETY WORKED: Order rejected because size too small for SL/TP', 'success');
      }
      console.error('Response:', buyData);
    }
  } catch (error) {
    log(`✗ Buy order error: ${error.message}`, 'error');
  }

  if (!tradeId) {
    log('\n✗ No trade ID available, stopping tests', 'error');
    return;
  }

  // TEST 3: Verify Trade
  console.log('\n%cTEST 3: Verify Trade in Database', 'font-weight: bold; color: blue');
  try {
    const tradesRes = await fetch('/api/trades?limit=100');
    const trades = await tradesRes.json();
    const trade = trades.find(t => t.id === tradeId);
    
    if (trade) {
      log('✓ Trade found in database', 'success');
      console.log('Trade details:', {
        id: trade.id,
        status: trade.status,
        side: trade.side,
        price: trade.price,
        size: trade.size,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
      });
    } else {
      log('✗ Trade not found', 'error');
    }
  } catch (error) {
    log(`✗ Verify error: ${error.message}`, 'error');
  }

  // TEST 4: Close Trade
  console.log('\n%cTEST 4: Close Trade', 'font-weight: bold; color: blue');
  if (!confirm('Close the test trade now?')) {
    log('Test cancelled by user', 'warning');
    return;
  }
  
  try {
    log(`Closing trade ${tradeId}...`, 'info');
    
    const closeRes = await fetch(`/api/trades/${tradeId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    const closeData = await closeRes.json();
    
    if (closeData.success) {
      log('✓ Trade closed successfully!', 'success');
      if (closeData.profit !== undefined) {
        log(`Profit: ${closeData.profit.toFixed(4)} USDT (${closeData.profitPercent?.toFixed(2)}%)`, 'success');
      }
      console.log('Close result:', closeData);
    } else {
      log(`✗ Close failed: ${closeData.error}`, 'error');
      console.error('Response:', closeData);
    }
  } catch (error) {
    log(`✗ Close error: ${error.message}`, 'error');
  }

  // TEST 5: Verify Closed
  console.log('\n%cTEST 5: Verify Trade is Closed', 'font-weight: bold; color: blue');
  await sleep(1000);
  try {
    const tradesRes = await fetch('/api/trades?limit=100');
    const trades = await tradesRes.json();
    const trade = trades.find(t => t.id === tradeId);
    
    if (trade) {
      if (trade.status === 'closed' || trade.status === 'cancelled') {
        log(`✓ Trade status: ${trade.status}`, 'success');
      } else {
        log(`⚠ Trade status: ${trade.status}`, 'warning');
      }
      if (trade.profit !== null) {
        log(`Final Profit: ${trade.profit.toFixed(4)} USDT`, 'info');
      }
    }
  } catch (error) {
    log(`✗ Verify closed error: ${error.message}`, 'error');
  }

  console.log('\n%c========================================', 'font-weight: bold; color: blue');
  console.log('%cAll Tests Completed!', 'font-weight: bold; color: green');
  console.log('%c========================================', 'font-weight: bold; color: blue');
})();

