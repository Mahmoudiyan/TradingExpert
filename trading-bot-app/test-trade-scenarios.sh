#!/bin/bash

# Test script to verify all trade scenarios work correctly
# Tests: balance check, place order with SL/TP, close order

BASE_URL="${1:-http://localhost:3000}"
SYMBOL="${2:-ETH-USDT}"
EXCHANGE="${3:-KuCoin}"

echo "========================================="
echo "Testing Trade Scenarios"
echo "========================================="
echo "Base URL: $BASE_URL"
echo "Symbol: $SYMBOL"
echo "Exchange: $EXCHANGE"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print success
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
error() {
    echo -e "${RED}✗ $1${NC}"
}

# Function to print info
info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Test 1: Check Balance
echo "----------------------------------------"
echo "TEST 1: Check Balance"
echo "----------------------------------------"
info "Fetching balance for $SYMBOL..."
BALANCE_RESPONSE=$(curl -s "$BASE_URL/api/balance?symbol=$SYMBOL&exchange=$EXCHANGE")
BALANCE_SUCCESS=$(echo "$BALANCE_RESPONSE" | grep -o '"success":true' || echo "")
if [ -n "$BALANCE_SUCCESS" ]; then
    BALANCE=$(echo "$BALANCE_RESPONSE" | grep -o '"available":[0-9.]*' | cut -d':' -f2)
    success "Balance check successful: $BALANCE USDT available"
else
    error "Balance check failed"
    echo "Response: $BALANCE_RESPONSE"
    exit 1
fi
echo ""

# Test 2: Place Buy Order (Minimum Amount)
echo "----------------------------------------"
echo "TEST 2: Place Buy Order (Minimum Amount)"
echo "----------------------------------------"
info "Placing buy order with 0.11 USDT (minimum for KuCoin)..."
BUY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/test-trade" \
  -H "Content-Type: application/json" \
  -d "{
    \"symbol\": \"$SYMBOL\",
    \"side\": \"buy\",
    \"exchange\": \"$EXCHANGE\",
    \"funds\": 0.11
  }")

BUY_SUCCESS=$(echo "$BUY_RESPONSE" | grep -o '"success":true' || echo "")
if [ -n "$BUY_SUCCESS" ]; then
    TRADE_ID=$(echo "$BUY_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    ORDER_ID=$(echo "$BUY_RESPONSE" | grep -o '"orderId":"[^"]*"' | head -1 | cut -d'"' -f4)
    SL_ORDER=$(echo "$BUY_RESPONSE" | grep -o '"slOrderId":"[^"]*"' | cut -d'"' -f4)
    TP_ORDER=$(echo "$BUY_RESPONSE" | grep -o '"tpOrderId":"[^"]*"' | cut -d'"' -f4)
    
    success "Buy order placed successfully!"
    info "Trade ID: $TRADE_ID"
    info "Order ID: $ORDER_ID"
    
    if [ -n "$SL_ORDER" ] && [ "$SL_ORDER" != "null" ]; then
        success "Stop-Loss order placed: $SL_ORDER"
    else
        error "Stop-Loss order not placed or failed"
    fi
    
    if [ -n "$TP_ORDER" ] && [ "$TP_ORDER" != "null" ]; then
        success "Take-Profit order placed: $TP_ORDER"
    else
        error "Take-Profit order not placed or failed"
    fi
    
    # Wait a moment for order to settle
    sleep 2
else
    error "Buy order failed"
    echo "Response: $BUY_RESPONSE"
    exit 1
fi
echo ""

# Test 3: Verify Trade in Database
echo "----------------------------------------"
echo "TEST 3: Verify Trade in Database"
echo "----------------------------------------"
if [ -n "$TRADE_ID" ]; then
    info "Fetching trade details for ID: $TRADE_ID"
    TRADE_DETAILS=$(curl -s "$BASE_URL/api/trades?limit=100" | grep -o "\"id\":\"$TRADE_ID\"[^}]*" || echo "")
    if [ -n "$TRADE_DETAILS" ]; then
        success "Trade found in database"
        
        # Check if SL/TP prices are set
        HAS_SL=$(echo "$TRADE_DETAILS" | grep -o '"stopLoss":[0-9.]*' || echo "")
        HAS_TP=$(echo "$TRADE_DETAILS" | grep -o '"takeProfit":[0-9.]*' || echo "")
        
        if [ -n "$HAS_SL" ]; then
            SL_PRICE=$(echo "$HAS_SL" | cut -d':' -f2)
            success "Stop-Loss price set: $SL_PRICE"
        else
            error "Stop-Loss price not set"
        fi
        
        if [ -n "$HAS_TP" ]; then
            TP_PRICE=$(echo "$HAS_TP" | cut -d':' -f2)
            success "Take-Profit price set: $TP_PRICE"
        else
            error "Take-Profit price not set"
        fi
    else
        error "Trade not found in database"
    fi
else
    error "No trade ID to verify"
fi
echo ""

# Test 4: Close Trade
echo "----------------------------------------"
echo "TEST 4: Close Trade"
echo "----------------------------------------"
if [ -n "$TRADE_ID" ]; then
    info "Closing trade ID: $TRADE_ID"
    CLOSE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/trades/$TRADE_ID/close" \
      -H "Content-Type: application/json")
    
    CLOSE_SUCCESS=$(echo "$CLOSE_RESPONSE" | grep -o '"success":true' || echo "")
    if [ -n "$CLOSE_SUCCESS" ]; then
        PROFIT=$(echo "$CLOSE_RESPONSE" | grep -o '"profit":[0-9.-]*' | cut -d':' -f2)
        PROFIT_PCT=$(echo "$CLOSE_RESPONSE" | grep -o '"profitPercent":[0-9.-]*' | cut -d':' -f2)
        
        success "Trade closed successfully!"
        if [ -n "$PROFIT" ]; then
            info "Profit: $PROFIT USDT ($PROFIT_PCT%)"
        fi
    else
        CLOSE_ERROR=$(echo "$CLOSE_RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
        error "Failed to close trade: $CLOSE_ERROR"
        echo "Response: $CLOSE_RESPONSE"
    fi
else
    error "No trade ID to close"
fi
echo ""

# Test 5: Verify Trade is Closed
echo "----------------------------------------"
echo "TEST 5: Verify Trade is Closed"
echo "----------------------------------------"
if [ -n "$TRADE_ID" ]; then
    info "Verifying trade status..."
    sleep 1
    CLOSED_TRADE=$(curl -s "$BASE_URL/api/trades?limit=100" | grep -o "\"id\":\"$TRADE_ID\"[^}]*" || echo "")
    if [ -n "$CLOSED_TRADE" ]; then
        STATUS=$(echo "$CLOSED_TRADE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        if [ "$STATUS" = "closed" ] || [ "$STATUS" = "cancelled" ]; then
            success "Trade status confirmed: $STATUS"
        else
            info "Trade status: $STATUS (may still be processing)"
        fi
    fi
fi
echo ""

echo "========================================="
echo "All Tests Completed"
echo "========================================="
success "Trade scenarios test finished!"

