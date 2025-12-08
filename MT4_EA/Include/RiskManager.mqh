//+------------------------------------------------------------------+
//|                                                  RiskManager.mqh |
//|                        Risk Management for Trading Expert       |
//+------------------------------------------------------------------+
#property copyright "TradingExpert"
#property link      ""
#property strict

//+------------------------------------------------------------------+
//| Check if trading is allowed                                       |
//+------------------------------------------------------------------+
bool CanTrade(double maxDailyLoss, double maxDailyProfit)
{
   UpdateDailyStats();
   
   double accountBalance = AccountBalance();
   double dailyLossPercent = 0;
   double dailyProfitPercent = 0;
   
   if(g_initialBalance > 0)
   {
      double netChange = accountBalance - g_initialBalance;
      if(netChange < 0)
      {
         dailyLossPercent = MathAbs(netChange) / g_initialBalance * 100.0;
      }
      else
      {
         dailyProfitPercent = netChange / g_initialBalance * 100.0;
      }
   }
   
   // Check daily loss limit
   if(dailyLossPercent >= maxDailyLoss)
   {
      Print("Daily loss limit reached: ", DoubleToString(dailyLossPercent, 2), "%");
      return false;
   }
   
   // Check daily profit limit
   if(dailyProfitPercent >= maxDailyProfit)
   {
      Print("Daily profit limit reached: ", DoubleToString(dailyProfitPercent, 2), "%");
      return false;
   }
   
   return true;
}

//+------------------------------------------------------------------+
//| Calculate lot size based on risk                                 |
//+------------------------------------------------------------------+
double CalculateLotSize(double stopLossPoints, string symbol, double riskPercent)
{
   if(stopLossPoints <= 0)
      return 0;
   
   double accountBalance = AccountBalance();
   double riskAmount = accountBalance * riskPercent / 100.0;
   
   double tickValue = MarketInfo(symbol, MODE_TICKVALUE);
   double tickSize = MarketInfo(symbol, MODE_TICKSIZE);
   double point = MarketInfo(symbol, MODE_POINT);
   double minLot = MarketInfo(symbol, MODE_MINLOT);
   double maxLot = MarketInfo(symbol, MODE_MAXLOT);
   double lotStep = MarketInfo(symbol, MODE_LOTSTEP);
   
   if(tickSize == 0 || point == 0)
      return 0;
   
   double lotSize = (riskAmount * tickSize) / (stopLossPoints * point * tickValue);
   
   // Normalize lot size
   lotSize = MathFloor(lotSize / lotStep) * lotStep;
   lotSize = MathMax(minLot, MathMin(maxLot, lotSize));
   
   return NormalizeDouble(lotSize, 2);
}

//+------------------------------------------------------------------+
//| Update daily statistics                                           |
//+------------------------------------------------------------------+
void UpdateDailyStats()
{
   MqlDateTime dt;
   datetime currentTime = TimeCurrent();
   TimeToStruct(currentTime, dt);
   dt.hour = 0;
   dt.min = 0;
   dt.sec = 0;
   datetime currentDay = StructToTime(dt);
   
   if(currentDay != g_lastDay)
   {
      ResetDailyStats();
      g_lastDay = currentDay;
   }
}

//+------------------------------------------------------------------+
//| Reset daily statistics                                            |
//+------------------------------------------------------------------+
void ResetDailyStats()
{
   g_initialBalance = AccountBalance();
}

//+------------------------------------------------------------------+

