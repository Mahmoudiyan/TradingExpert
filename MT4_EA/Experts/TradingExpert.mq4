//+------------------------------------------------------------------+
//|                                              TradingExpert.mq4 |
//|                                  Expert Advisor for AvaTrade    |
//+------------------------------------------------------------------+
#property copyright "TradingExpert"
#property link      ""
#property version   "1.00"
#property strict

#include "../Include/Utils.mqh"
#include "../Include/RiskManager.mqh"
#include "../Include/TradeManager.mqh"
#include "../Include/MovingAverageStrategy.mqh"

//--- Input parameters
input string   InpSymbol = "EURUSD";           // Trading Symbol (Best: EURUSD, GBPUSD, USDJPY, AUDUSD)
input int      InpMagicNumber = 123456;        // Magic number
input string   InpTradeComment = "TradingExpert"; // Trade comment

input double   InpRiskPercent = 1.5;           // Risk per trade (% of account) - Conservative
input double   InpStopLossPips = 30.0;         // Stop Loss (pips) - Optimal for major pairs
input double   InpTakeProfitPips = 75.0;       // Take Profit (pips) - 2.5:1 Risk/Reward
input double   InpMaxDailyLoss = 4.0;          // Max daily loss (%) - Protects account
input double   InpMaxDailyProfit = 8.0;        // Max daily profit (%) - Secure profits

input int      InpFastMA = 9;                  // Fast MA Period - Responsive trend detection
input int      InpSlowMA = 21;                 // Slow MA Period - Smooth trend filter
input int      InpMAMethod = 1;                // MA Method (0=SMA, 1=EMA, 2=WMA, 3=LWMA)
input int      InpTimeframe = 240;             // Timeframe (60=H1, 240=H4, 1440=D1)

input bool     InpAllowBuy = true;             // Allow Buy (Long) trades
input bool     InpAllowSell = true;            // Allow Sell (Short) trades

input double   InpMaxSpreadPips = 3.0;         // Max Spread (pips) - Avoid high spread
input bool     InpFilterLowLiquidity = true;   // Filter low liquidity hours
input int      InpStartHour = 2;               // Trading start hour (GMT)
input int      InpEndHour = 20;                // Trading end hour (GMT)

input bool     InpEnableTrading = true;        // Enable Trading
input int      InpSlippage = 3;                 // Slippage (points)

//--- Global variables
string g_tradingSymbol;
datetime g_lastBarTime = 0;
double g_initialBalance = 0;
datetime g_lastDay = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   // Set trading symbol
   g_tradingSymbol = (InpSymbol == "" || InpSymbol == "CURRENT") ? Symbol() : InpSymbol;
   
   // Test indicator access
   double testMA = iMA(g_tradingSymbol, InpTimeframe, InpFastMA, 0, InpMAMethod, PRICE_CLOSE, 0);
   if(testMA == 0)
   {
      Print("Failed to access MA indicator. Check symbol and timeframe.");
      return(INIT_FAILED);
   }
   
   // Initialize risk manager
   g_initialBalance = AccountBalance();
   g_lastDay = 0;
   ResetDailyStats();
   
   Print("=== TradingExpert EA Initialized ===");
   Print("Trading Symbol: ", g_tradingSymbol);
   Print("Timeframe: ", InpTimeframe, " minutes");
   Print("Risk per trade: ", InpRiskPercent, "%");
   Print("Stop Loss: ", InpStopLossPips, " pips");
   Print("Take Profit: ", InpTakeProfitPips, " pips");
   Print("Risk/Reward: 1:", DoubleToString(InpTakeProfitPips/InpStopLossPips, 2));
   Print("Account Balance: ", AccountBalance());
   Print("Account Equity: ", AccountEquity());
   Print("Allow Buy: ", InpAllowBuy ? "Yes" : "No");
   Print("Allow Sell: ", InpAllowSell ? "Yes" : "No");
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
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
   datetime currentBarTime = iTime(g_tradingSymbol, InpTimeframe, 0);
   bool isNewBar = (currentBarTime != g_lastBarTime);
   
   if(!isNewBar)
      return;
   
   g_lastBarTime = currentBarTime;
   
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
   UpdateDailyStats();
   
   // Check risk limits
   if(!CanTrade(InpMaxDailyLoss, InpMaxDailyProfit))
   {
      Print("Trading blocked by risk manager");
      return;
   }
   
   // Get strategy signal
   int signal = GetStrategySignal();
   
   // Check if we already have a position
   if(HasPosition(g_tradingSymbol, InpMagicNumber))
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
//| Get strategy signal                                               |
//+------------------------------------------------------------------+
int GetStrategySignal()
{
   // Get MA values directly using iMA function for MQL4
   double fastCurrent = iMA(g_tradingSymbol, InpTimeframe, InpFastMA, 0, InpMAMethod, PRICE_CLOSE, 0);
   double fastPrevious = iMA(g_tradingSymbol, InpTimeframe, InpFastMA, 0, InpMAMethod, PRICE_CLOSE, 1);
   double slowCurrent = iMA(g_tradingSymbol, InpTimeframe, InpSlowMA, 0, InpMAMethod, PRICE_CLOSE, 0);
   double slowPrevious = iMA(g_tradingSymbol, InpTimeframe, InpSlowMA, 0, InpMAMethod, PRICE_CLOSE, 1);
   
   if(fastCurrent == 0 || slowCurrent == 0)
      return SIGNAL_NONE;
   
   // Check for crossover
   // Bullish crossover: fast MA crosses above slow MA
   if(fastPrevious <= slowPrevious && fastCurrent > slowCurrent)
   {
      return SIGNAL_BUY;
   }
   
   // Bearish crossover: fast MA crosses below slow MA
   if(fastPrevious >= slowPrevious && fastCurrent < slowCurrent)
   {
      return SIGNAL_SELL;
   }
   
   return SIGNAL_NONE;
}

//+------------------------------------------------------------------+
//| Execute buy order                                                 |
//+------------------------------------------------------------------+
void ExecuteBuy()
{
   double ask = MarketInfo(g_tradingSymbol, MODE_ASK);
   double stopLoss = 0;
   double takeProfit = 0;
   
   // Convert pips to points
   double stopLossPoints = PipsToPoints(g_tradingSymbol, InpStopLossPips);
   double takeProfitPoints = PipsToPoints(g_tradingSymbol, InpTakeProfitPips);
   
   // Calculate stop loss and take profit
   if(stopLossPoints > 0)
   {
      stopLoss = ask - stopLossPoints;
      stopLoss = NormalizeDouble(stopLoss, Digits);
   }
   
   if(takeProfitPoints > 0)
   {
      takeProfit = ask + takeProfitPoints;
      takeProfit = NormalizeDouble(takeProfit, Digits);
   }
   
   // Calculate lot size based on risk
   double lotSize = CalculateLotSize(stopLossPoints, g_tradingSymbol, InpRiskPercent);
   if(lotSize <= 0)
   {
      Print("Invalid lot size calculated");
      return;
   }
   
   // Execute trade
   int ticket = OrderSend(g_tradingSymbol, OP_BUY, lotSize, ask, InpSlippage, stopLoss, takeProfit, 
                          InpTradeComment, InpMagicNumber, 0, clrGreen);
   
   if(ticket > 0)
   {
      Print("BUY executed: Symbol=", g_tradingSymbol, " Ticket=", ticket, " Lot=", lotSize, 
            " SL=", DoubleToString(stopLoss, Digits),
            " TP=", DoubleToString(takeProfit, Digits));
   }
   else
   {
      Print("Buy order failed: ", GetLastError());
   }
}

//+------------------------------------------------------------------+
//| Execute sell order                                                |
//+------------------------------------------------------------------+
void ExecuteSell()
{
   double bid = MarketInfo(g_tradingSymbol, MODE_BID);
   double stopLoss = 0;
   double takeProfit = 0;
   
   // Convert pips to points
   double stopLossPoints = PipsToPoints(g_tradingSymbol, InpStopLossPips);
   double takeProfitPoints = PipsToPoints(g_tradingSymbol, InpTakeProfitPips);
   
   // Calculate stop loss and take profit
   if(stopLossPoints > 0)
   {
      stopLoss = bid + stopLossPoints;
      stopLoss = NormalizeDouble(stopLoss, Digits);
   }
   
   if(takeProfitPoints > 0)
   {
      takeProfit = bid - takeProfitPoints;
      takeProfit = NormalizeDouble(takeProfit, Digits);
   }
   
   // Calculate lot size based on risk
   double lotSize = CalculateLotSize(stopLossPoints, g_tradingSymbol, InpRiskPercent);
   if(lotSize <= 0)
   {
      Print("Invalid lot size calculated");
      return;
   }
   
   // Execute trade
   int ticket = OrderSend(g_tradingSymbol, OP_SELL, lotSize, bid, InpSlippage, stopLoss, takeProfit, 
                          InpTradeComment, InpMagicNumber, 0, clrRed);
   
   if(ticket > 0)
   {
      Print("SELL executed: Symbol=", g_tradingSymbol, " Ticket=", ticket, " Lot=", lotSize,
            " SL=", DoubleToString(stopLoss, Digits),
            " TP=", DoubleToString(takeProfit, Digits));
   }
   else
   {
      Print("Sell order failed: ", GetLastError());
   }
}

//+------------------------------------------------------------------+
//| Manage existing position                                          |
//+------------------------------------------------------------------+
void ManagePosition()
{
   if(!HasPosition(g_tradingSymbol, InpMagicNumber))
      return;
   
   // Monitor position - can add trailing stop logic here later
}

//+------------------------------------------------------------------+
//| Check if current time is good for trading                        |
//+------------------------------------------------------------------+
bool IsGoodTradingTime()
{
   datetime currentTime = TimeGMT();
   MqlDateTime dt;
   TimeToStruct(currentTime, dt);
   int currentHour = dt.hour;
   
   // Avoid low liquidity periods (late night/early morning GMT)
   if(currentHour >= InpStartHour && currentHour < InpEndHour)
      return true;
   
   return false;
}

//+------------------------------------------------------------------+

