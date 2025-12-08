//+------------------------------------------------------------------+
//|                                                      Utils.mqh |
//|                        Utility Functions for Trading Expert    |
//+------------------------------------------------------------------+
#property copyright "TradingExpert"
#property link      ""
#property strict

//+------------------------------------------------------------------+
//| Signal constants                                                 |
//+------------------------------------------------------------------+
#define SIGNAL_NONE   0
#define SIGNAL_BUY    1
#define SIGNAL_SELL   -1

//+------------------------------------------------------------------+
//| Get pip value for a symbol                                       |
//+------------------------------------------------------------------+
double GetPipValue(string symbol)
{
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   
   if(digits == 3 || digits == 5)
      return point * 10;
   else
      return point;
}

//+------------------------------------------------------------------+
//| Convert points to pips                                           |
//+------------------------------------------------------------------+
double PointsToPips(string symbol, double points)
{
   double pipValue = GetPipValue(symbol);
   if(pipValue == 0)
      return 0;
   
   return points / pipValue;
}

//+------------------------------------------------------------------+
//| Convert pips to points                                           |
//+------------------------------------------------------------------+
double PipsToPoints(string symbol, double pips)
{
   double pipValue = GetPipValue(symbol);
   return pips * pipValue;
}

//+------------------------------------------------------------------+
//| Check if market is open                                          |
//+------------------------------------------------------------------+
bool IsMarketOpen(string symbol)
{
   MqlDateTime dt;
   datetime currentTime = TimeCurrent();
   TimeToStruct(currentTime, dt);
   
   // Check if it's weekend
   if(dt.day_of_week == 0 || dt.day_of_week == 6)
      return false;
   
   // Get trading session times (simplified - adjust for your broker)
   // Most forex markets are open Sunday 22:00 GMT to Friday 22:00 GMT
   return true;
}

//+------------------------------------------------------------------+
//| Get spread in points                                             |
//+------------------------------------------------------------------+
double GetSpread(string symbol)
{
   double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   
   if(point == 0)
      return 0;
   
   return (ask - bid) / point;
}

//+------------------------------------------------------------------+
//| Get spread in pips                                               |
//+------------------------------------------------------------------+
double GetSpreadPips(string symbol)
{
   return PointsToPips(symbol, GetSpread(symbol));
}

//+------------------------------------------------------------------+
//| Check if spread is acceptable                                    |
//+------------------------------------------------------------------+
bool IsSpreadAcceptable(string symbol, double maxSpreadPips)
{
   double currentSpread = GetSpreadPips(symbol);
   return (currentSpread <= maxSpreadPips);
}

//+------------------------------------------------------------------+
//| Print account information                                         |
//+------------------------------------------------------------------+
void PrintAccountInfo()
{
   Print("=== Account Information ===");
   Print("Balance: ", AccountInfoDouble(ACCOUNT_BALANCE));
   Print("Equity: ", AccountInfoDouble(ACCOUNT_EQUITY));
   Print("Free Margin: ", AccountInfoDouble(ACCOUNT_MARGIN_FREE));
   Print("Used Margin: ", AccountInfoDouble(ACCOUNT_MARGIN));
   Print("Margin Level: ", AccountInfoDouble(ACCOUNT_MARGIN_LEVEL));
   Print("Leverage: 1:", AccountInfoInteger(ACCOUNT_LEVERAGE));
}

//+------------------------------------------------------------------+

