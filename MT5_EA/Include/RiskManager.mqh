//+------------------------------------------------------------------+
//|                                                  RiskManager.mqh |
//|                        Risk Management for Trading Expert       |
//+------------------------------------------------------------------+
#property copyright "TradingExpert"
#property link      ""
#property strict

//+------------------------------------------------------------------+
//| Risk Manager Class                                               |
//+------------------------------------------------------------------+
class CRiskManager
{
private:
   double m_riskPercent;        // Risk per trade as % of account
   double m_maxDailyLoss;       // Maximum daily loss %
   double m_maxDailyProfit;     // Maximum daily profit %
   int    m_magicNumber;        // Magic number for filtering trades
   
   double m_dailyProfit;        // Today's profit
   double m_dailyLoss;          // Today's loss
   datetime m_lastDay;          // Last day checked
   
   double m_initialBalance;     // Balance at start of day

public:
   CRiskManager(double riskPercent, double maxDailyLoss, double maxDailyProfit, int magicNumber);
   ~CRiskManager();
   
   bool CanTrade();
   double CalculateLotSize(double stopLossPoints, string symbol = "");
   void UpdateDailyStats();
   void ResetDailyStats();
   double GetDailyProfit();
   double GetDailyLoss();
};

//+------------------------------------------------------------------+
//| Constructor                                                       |
//+------------------------------------------------------------------+
CRiskManager::CRiskManager(double riskPercent, double maxDailyLoss, double maxDailyProfit, int magicNumber)
{
   m_riskPercent = riskPercent;
   m_maxDailyLoss = maxDailyLoss;
   m_maxDailyProfit = maxDailyProfit;
   m_magicNumber = magicNumber;
   
   m_dailyProfit = 0;
   m_dailyLoss = 0;
   m_lastDay = 0;
   m_initialBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   
   ResetDailyStats();
}

//+------------------------------------------------------------------+
//| Destructor                                                        |
//+------------------------------------------------------------------+
CRiskManager::~CRiskManager()
{
}

//+------------------------------------------------------------------+
//| Check if trading is allowed                                       |
//+------------------------------------------------------------------+
bool CRiskManager::CanTrade()
{
   UpdateDailyStats();
   
   double accountBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   double dailyLossPercent = 0;
   double dailyProfitPercent = 0;
   
   if(m_initialBalance > 0)
   {
      double netChange = accountBalance - m_initialBalance;
      if(netChange < 0)
      {
         dailyLossPercent = MathAbs(netChange) / m_initialBalance * 100.0;
      }
      else
      {
         dailyProfitPercent = netChange / m_initialBalance * 100.0;
      }
   }
   
   // Check daily loss limit
   if(dailyLossPercent >= m_maxDailyLoss)
   {
      Print("Daily loss limit reached: ", dailyLossPercent, "%");
      return false;
   }
   
   // Check daily profit limit
   if(dailyProfitPercent >= m_maxDailyProfit)
   {
      Print("Daily profit limit reached: ", dailyProfitPercent, "%");
      return false;
   }
   
   return true;
}

//+------------------------------------------------------------------+
//| Calculate lot size based on risk                                 |
//+------------------------------------------------------------------+
double CRiskManager::CalculateLotSize(double stopLossPoints, string symbol = "")
{
   if(stopLossPoints <= 0)
      return 0;
   
   if(symbol == "")
      symbol = _Symbol;
   
   double accountBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskAmount = accountBalance * m_riskPercent / 100.0;
   
   double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   
   if(tickSize == 0 || point == 0)
      return 0;
   
   double lotSize = (riskAmount * tickSize) / (stopLossPoints * point * tickValue);
   
   // Normalize lot size
   double minLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   
   lotSize = MathFloor(lotSize / lotStep) * lotStep;
   lotSize = MathMax(minLot, MathMin(maxLot, lotSize));
   
   return NormalizeDouble(lotSize, 2);
}

//+------------------------------------------------------------------+
//| Update daily statistics                                           |
//+------------------------------------------------------------------+
void CRiskManager::UpdateDailyStats()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   datetime currentDay = StructToTime(dt);
   dt.hour = 0;
   dt.min = 0;
   dt.sec = 0;
   currentDay = StructToTime(dt);
   
   if(currentDay != m_lastDay)
   {
      ResetDailyStats();
      m_lastDay = currentDay;
   }
   
   // Calculate today's profit/loss from closed trades
   double totalProfit = 0;
   HistorySelect(m_lastDay, TimeCurrent());
   
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      
      if(HistoryDealGetInteger(ticket, DEAL_MAGIC) != m_magicNumber)
         continue;
      
      if(HistoryDealGetString(ticket, DEAL_SYMBOL) != _Symbol)
         continue;
      
      if(HistoryDealGetInteger(ticket, DEAL_ENTRY) == DEAL_ENTRY_OUT)
      {
         double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT) + 
                        HistoryDealGetDouble(ticket, DEAL_SWAP) + 
                        HistoryDealGetDouble(ticket, DEAL_COMMISSION);
         totalProfit += profit;
      }
   }
   
   if(totalProfit < 0)
      m_dailyLoss = MathAbs(totalProfit);
   else
      m_dailyProfit = totalProfit;
}

//+------------------------------------------------------------------+
//| Reset daily statistics                                            |
//+------------------------------------------------------------------+
void CRiskManager::ResetDailyStats()
{
   m_dailyProfit = 0;
   m_dailyLoss = 0;
   m_initialBalance = AccountInfoDouble(ACCOUNT_BALANCE);
}

//+------------------------------------------------------------------+
//| Get daily profit                                                  |
//+------------------------------------------------------------------+
double CRiskManager::GetDailyProfit()
{
   UpdateDailyStats();
   return m_dailyProfit;
}

//+------------------------------------------------------------------+
//| Get daily loss                                                    |
//+------------------------------------------------------------------+
double CRiskManager::GetDailyLoss()
{
   UpdateDailyStats();
   return m_dailyLoss;
}

//+------------------------------------------------------------------+

