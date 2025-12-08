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
   int digits = (int)MarketInfo(symbol, MODE_DIGITS);
   double point = MarketInfo(symbol, MODE_POINT);
   
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
//| Get spread in points                                             |
//+------------------------------------------------------------------+
double GetSpread(string symbol)
{
   double ask = MarketInfo(symbol, MODE_ASK);
   double bid = MarketInfo(symbol, MODE_BID);
   double point = MarketInfo(symbol, MODE_POINT);
   
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
//| Check if position exists                                         |
//+------------------------------------------------------------------+
bool HasPosition(string symbol, int magicNumber)
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if(OrderSymbol() == symbol && OrderMagicNumber() == magicNumber)
            return true;
      }
   }
   return false;
}

//+------------------------------------------------------------------+

