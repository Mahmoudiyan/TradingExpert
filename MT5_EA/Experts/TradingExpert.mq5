//+------------------------------------------------------------------+
//|                                              TradingExpert.mq5 |
//|                                  Expert Advisor for AvaTrade    |
//+------------------------------------------------------------------+
#property copyright "TradingExpert"
#property link      ""
#property version   "1.00"
#property strict

#include "../Include/RiskManager.mqh"
#include "../Include/TradeManager.mqh"
#include "../Include/Utils.mqh"
#include "Strategies/BaseStrategy.mqh"
#include "Strategies/MovingAverageStrategy.mqh"

//--- Input parameters
input group "=== Trading Settings ==="
input string   InpSymbol = "EURUSD";           // Trading Symbol (Best: EURUSD, GBPUSD, USDJPY, AUDUSD)
input int      InpMagicNumber = 123456;        // Magic number
input string   InpTradeComment = "TradingExpert"; // Trade comment

input group "=== Risk Management (Best Practice Settings) ==="
input double   InpRiskPercent = 1.5;           // Risk per trade (% of account) - Conservative
input double   InpStopLossPips = 30.0;         // Stop Loss (pips) - Optimal for major pairs
input double   InpTakeProfitPips = 75.0;       // Take Profit (pips) - 2.5:1 Risk/Reward
input double   InpMaxDailyLoss = 4.0;          // Max daily loss (%) - Protects account
input double   InpMaxDailyProfit = 8.0;        // Max daily profit (%) - Secure profits

input group "=== Strategy Settings (Optimized) ==="
input int      InpFastMA = 9;                  // Fast MA Period - Responsive trend detection
input int      InpSlowMA = 21;                 // Slow MA Period - Smooth trend filter
input ENUM_MA_METHOD InpMAMethod = MODE_EMA;   // MA Method - EMA for trend following
input ENUM_TIMEFRAMES InpTimeframe = PERIOD_H4; // Timeframe - H4 reduces noise, better trends

input group "=== Trade Direction ==="
input bool     InpAllowBuy = true;             // Allow Buy (Long) trades
input bool     InpAllowSell = true;            // Allow Sell (Short) trades - Trade both directions

input group "=== Filter Settings ==="
input double   InpMaxSpreadPips = 3.0;         // Max Spread (pips) - Avoid high spread
input bool     InpFilterLowLiquidity = true;   // Filter low liquidity hours
input int      InpStartHour = 2;               // Trading start hour (GMT)
input int      InpEndHour = 20;                // Trading end hour (GMT)

input group "=== General Settings ==="
input bool     InpEnableTrading = true;        // Enable Trading
input int      InpSlippage = 3;                 // Slippage (points)

//--- Global objects
CRiskManager* g_riskManager;
CTradeManager* g_tradeManager;
CBaseStrategy* g_strategy;
string g_tradingSymbol;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   // Set trading symbol
   g_tradingSymbol = (InpSymbol == "" || InpSymbol == "CURRENT") ? _Symbol : InpSymbol;
   
   // Validate symbol exists
   if(!SymbolSelect(g_tradingSymbol, true))
   {
      Print("Symbol ", g_tradingSymbol, " not found. Using current symbol: ", _Symbol);
      g_tradingSymbol = _Symbol;
   }
   
   // Initialize risk manager
   g_riskManager = new CRiskManager(InpRiskPercent, InpMaxDailyLoss, InpMaxDailyProfit, InpMagicNumber);
   if(g_riskManager == NULL)
   {
      Print("Failed to initialize Risk Manager");
      return(INIT_FAILED);
   }
   
   // Initialize trade manager
   g_tradeManager = new CTradeManager(InpMagicNumber, InpTradeComment, InpSlippage);
   if(g_tradeManager == NULL)
   {
      Print("Failed to initialize Trade Manager");
      return(INIT_FAILED);
   }
   
   // Initialize strategy
   g_strategy = new CMovingAverageStrategy(InpFastMA, InpSlowMA, InpMAMethod, InpTimeframe);
   if(g_strategy == NULL)
   {
      Print("Failed to initialize Strategy");
      return(INIT_FAILED);
   }
   
   g_strategy.SetSymbol(g_tradingSymbol);
   
   if(!g_strategy.Initialize())
   {
      Print("Failed to initialize strategy indicators");
      return(INIT_FAILED);
   }
   
   Print("=== TradingExpert EA Initialized ===");
   Print("Trading Symbol: ", g_tradingSymbol);
   Print("Timeframe: ", EnumToString(InpTimeframe));
   Print("Risk per trade: ", InpRiskPercent, "%");
   Print("Stop Loss: ", InpStopLossPips, " pips");
   Print("Take Profit: ", InpTakeProfitPips, " pips");
   Print("Risk/Reward: 1:", DoubleToString(InpTakeProfitPips/InpStopLossPips, 2));
   Print("Account Balance: ", AccountInfoDouble(ACCOUNT_BALANCE));
   Print("Account Equity: ", AccountInfoDouble(ACCOUNT_EQUITY));
   Print("Allow Buy: ", InpAllowBuy ? "Yes" : "No");
   Print("Allow Sell: ", InpAllowSell ? "Yes" : "No");
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(g_strategy != NULL)
   {
      delete g_strategy;
      g_strategy = NULL;
   }
   
   if(g_tradeManager != NULL)
   {
      delete g_tradeManager;
      g_tradeManager = NULL;
   }
   
   if(g_riskManager != NULL)
   {
      delete g_riskManager;
      g_riskManager = NULL;
   }
   
   Print("TradingExpert EA deinitialized. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                              |
//+------------------------------------------------------------------+
void OnTick()
{
   if(!InpEnableTrading)
      return;
   
   // Check if new bar
   static datetime lastBarTime = 0;
   datetime currentBarTime = iTime(g_tradingSymbol, InpTimeframe, 0);
   bool isNewBar = (currentBarTime != lastBarTime);
   
   if(!isNewBar)
      return;
   
   lastBarTime = currentBarTime;
   
   // Check spread filter
   if(!IsSpreadAcceptable(g_tradingSymbol, InpMaxSpreadPips))
   {
      Print("Spread too wide: ", GetSpreadPips(g_tradingSymbol), " pips (max: ", InpMaxSpreadPips, ")");
      return;
   }
   
   // Check trading hours filter
   if(InpFilterLowLiquidity && !IsGoodTradingTime())
   {
      return;
   }
   
   // Update risk manager
   g_riskManager.UpdateDailyStats();
   
   // Check risk limits
   if(!g_riskManager.CanTrade())
   {
      Print("Trading blocked by risk manager");
      return;
   }
   
   // Get strategy signal
   int signal = g_strategy.GetSignal();
   
   // Check if we already have a position
   if(PositionSelect(g_tradingSymbol))
   {
      // Manage existing position
      ManagePosition();
      return;
   }
   
   // Execute new trade based on signal
   if(signal == SIGNAL_BUY && InpAllowBuy)
   {
      ExecuteBuy();
   }
   else if(signal == SIGNAL_SELL && InpAllowSell)
   {
      ExecuteSell();
   }
}

//+------------------------------------------------------------------+
//| Execute buy order                                                 |
//+------------------------------------------------------------------+
void ExecuteBuy()
{
   double ask = SymbolInfoDouble(g_tradingSymbol, SYMBOL_ASK);
   double stopLoss = 0;
   double takeProfit = 0;
   
   // Convert pips to points
   double stopLossPoints = PipsToPoints(g_tradingSymbol, InpStopLossPips);
   double takeProfitPoints = PipsToPoints(g_tradingSymbol, InpTakeProfitPips);
   
   // Calculate stop loss and take profit
   if(stopLossPoints > 0)
   {
      stopLoss = ask - stopLossPoints;
      stopLoss = NormalizeDouble(stopLoss, (int)SymbolInfoInteger(g_tradingSymbol, SYMBOL_DIGITS));
   }
   
   if(takeProfitPoints > 0)
   {
      takeProfit = ask + takeProfitPoints;
      takeProfit = NormalizeDouble(takeProfit, (int)SymbolInfoInteger(g_tradingSymbol, SYMBOL_DIGITS));
   }
   
   // Calculate lot size based on risk
   double lotSize = g_riskManager.CalculateLotSize(stopLossPoints, g_tradingSymbol);
   if(lotSize <= 0)
   {
      Print("Invalid lot size calculated");
      return;
   }
   
   // Execute trade
   if(g_tradeManager.Buy(lotSize, g_tradingSymbol, stopLoss, takeProfit))
   {
      Print("BUY executed: Symbol=", g_tradingSymbol, " Lot=", lotSize, 
            " SL=", DoubleToString(stopLoss, (int)SymbolInfoInteger(g_tradingSymbol, SYMBOL_DIGITS)),
            " TP=", DoubleToString(takeProfit, (int)SymbolInfoInteger(g_tradingSymbol, SYMBOL_DIGITS)));
   }
   else
   {
      Print("Buy order failed: ", g_tradeManager.GetLastError());
   }
}

//+------------------------------------------------------------------+
//| Execute sell order                                                |
//+------------------------------------------------------------------+
void ExecuteSell()
{
   double bid = SymbolInfoDouble(g_tradingSymbol, SYMBOL_BID);
   double stopLoss = 0;
   double takeProfit = 0;
   
   // Convert pips to points
   double stopLossPoints = PipsToPoints(g_tradingSymbol, InpStopLossPips);
   double takeProfitPoints = PipsToPoints(g_tradingSymbol, InpTakeProfitPips);
   
   // Calculate stop loss and take profit
   if(stopLossPoints > 0)
   {
      stopLoss = bid + stopLossPoints;
      stopLoss = NormalizeDouble(stopLoss, (int)SymbolInfoInteger(g_tradingSymbol, SYMBOL_DIGITS));
   }
   
   if(takeProfitPoints > 0)
   {
      takeProfit = bid - takeProfitPoints;
      takeProfit = NormalizeDouble(takeProfit, (int)SymbolInfoInteger(g_tradingSymbol, SYMBOL_DIGITS));
   }
   
   // Calculate lot size based on risk
   double lotSize = g_riskManager.CalculateLotSize(stopLossPoints, g_tradingSymbol);
   if(lotSize <= 0)
   {
      Print("Invalid lot size calculated");
      return;
   }
   
   // Execute trade
   if(g_tradeManager.Sell(lotSize, g_tradingSymbol, stopLoss, takeProfit))
   {
      Print("SELL executed: Symbol=", g_tradingSymbol, " Lot=", lotSize,
            " SL=", DoubleToString(stopLoss, (int)SymbolInfoInteger(g_tradingSymbol, SYMBOL_DIGITS)),
            " TP=", DoubleToString(takeProfit, (int)SymbolInfoInteger(g_tradingSymbol, SYMBOL_DIGITS)));
   }
   else
   {
      Print("Sell order failed: ", g_tradeManager.GetLastError());
   }
}

//+------------------------------------------------------------------+
//| Manage existing position                                          |
//+------------------------------------------------------------------+
void ManagePosition()
{
   if(!PositionSelect(g_tradingSymbol))
      return;
   
   long positionType = PositionGetInteger(POSITION_TYPE);
   double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
   double currentSL = PositionGetDouble(POSITION_SL);
   double currentTP = PositionGetDouble(POSITION_TP);
   double profit = PositionGetDouble(POSITION_PROFIT);
   
   // Monitor position - can add trailing stop logic here later
}

//+------------------------------------------------------------------+
//| Check if current time is good for trading                        |
//+------------------------------------------------------------------+
bool IsGoodTradingTime()
{
   MqlDateTime dt;
   TimeToStruct(TimeGMT(), dt);
   int currentHour = dt.hour;
   
   // Avoid low liquidity periods (late night/early morning GMT)
   if(currentHour >= InpStartHour && currentHour < InpEndHour)
      return true;
   
   return false;
}

//+------------------------------------------------------------------+

