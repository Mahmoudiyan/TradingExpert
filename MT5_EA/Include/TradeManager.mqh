//+------------------------------------------------------------------+
//|                                                TradeManager.mqh |
//|                    Trade Execution Manager for Trading Expert   |
//+------------------------------------------------------------------+
#property copyright "TradingExpert"
#property link      ""
#property strict

#include <Trade\Trade.mqh>

//+------------------------------------------------------------------+
//| Trade Manager Class                                              |
//+------------------------------------------------------------------+
class CTradeManager
{
private:
   CTrade m_trade;
   int m_magicNumber;
   string m_tradeComment;
   int m_slippage;
   uint m_lastError;

public:
   CTradeManager(int magicNumber, string tradeComment, int slippage);
   ~CTradeManager();
   
   bool Buy(double lot, string symbol, double sl, double tp);
   bool Sell(double lot, string symbol, double sl, double tp);
   bool ClosePosition(string symbol);
   bool ModifyPosition(string symbol, double sl, double tp);
   bool PositionExists(string symbol);
   uint GetLastError() { return m_lastError; }
   double GetPositionProfit(string symbol);
   long GetPositionType(string symbol);
};

//+------------------------------------------------------------------+
//| Constructor                                                       |
//+------------------------------------------------------------------+
CTradeManager::CTradeManager(int magicNumber, string tradeComment, int slippage)
{
   m_magicNumber = magicNumber;
   m_tradeComment = tradeComment;
   m_slippage = slippage;
   m_lastError = 0;
   
   m_trade.SetExpertMagicNumber(magicNumber);
   m_trade.SetDeviationInPoints(slippage);
   m_trade.SetTypeFilling(ORDER_FILLING_FOK);
   m_trade.SetAsyncMode(false);
}

//+------------------------------------------------------------------+
//| Destructor                                                        |
//+------------------------------------------------------------------+
CTradeManager::~CTradeManager()
{
}

//+------------------------------------------------------------------+
//| Execute buy order                                                 |
//+------------------------------------------------------------------+
bool CTradeManager::Buy(double lot, string symbol, double sl, double tp)
{
   double price = SymbolInfoDouble(symbol, SYMBOL_ASK);
   
   if(sl > 0)
      sl = NormalizeDouble(sl, _Digits);
   if(tp > 0)
      tp = NormalizeDouble(tp, _Digits);
   
   bool result = m_trade.Buy(lot, symbol, price, sl, tp, m_tradeComment);
   m_lastError = m_trade.ResultRetcode();
   
   if(!result)
   {
      Print("Buy failed: ", m_trade.ResultRetcodeDescription());
   }
   
   return result;
}

//+------------------------------------------------------------------+
//| Execute sell order                                                |
//+------------------------------------------------------------------+
bool CTradeManager::Sell(double lot, string symbol, double sl, double tp)
{
   double price = SymbolInfoDouble(symbol, SYMBOL_BID);
   
   if(sl > 0)
      sl = NormalizeDouble(sl, _Digits);
   if(tp > 0)
      tp = NormalizeDouble(tp, _Digits);
   
   bool result = m_trade.Sell(lot, symbol, price, sl, tp, m_tradeComment);
   m_lastError = m_trade.ResultRetcode();
   
   if(!result)
   {
      Print("Sell failed: ", m_trade.ResultRetcodeDescription());
   }
   
   return result;
}

//+------------------------------------------------------------------+
//| Close position                                                    |
//+------------------------------------------------------------------+
bool CTradeManager::ClosePosition(string symbol)
{
   if(!PositionSelect(symbol))
      return false;
   
   ulong ticket = PositionGetInteger(POSITION_TICKET);
   bool result = m_trade.PositionClose(ticket);
   m_lastError = m_trade.ResultRetcode();
   
   return result;
}

//+------------------------------------------------------------------+
//| Modify position (SL/TP)                                          |
//+------------------------------------------------------------------+
bool CTradeManager::ModifyPosition(string symbol, double sl, double tp)
{
   if(!PositionSelect(symbol))
      return false;
   
   ulong ticket = PositionGetInteger(POSITION_TICKET);
   
   if(sl > 0)
      sl = NormalizeDouble(sl, _Digits);
   if(tp > 0)
      tp = NormalizeDouble(tp, _Digits);
   
   bool result = m_trade.PositionModify(ticket, sl, tp);
   m_lastError = m_trade.ResultRetcode();
   
   return result;
}

//+------------------------------------------------------------------+
//| Check if position exists                                          |
//+------------------------------------------------------------------+
bool CTradeManager::PositionExists(string symbol)
{
   return PositionSelect(symbol);
}

//+------------------------------------------------------------------+
//| Get position profit                                               |
//+------------------------------------------------------------------+
double CTradeManager::GetPositionProfit(string symbol)
{
   if(!PositionSelect(symbol))
      return 0;
   
   return PositionGetDouble(POSITION_PROFIT);
}

//+------------------------------------------------------------------+
//| Get position type                                                 |
//+------------------------------------------------------------------+
long CTradeManager::GetPositionType(string symbol)
{
   if(!PositionSelect(symbol))
      return -1;
   
   return PositionGetInteger(POSITION_TYPE);
}

//+------------------------------------------------------------------+

