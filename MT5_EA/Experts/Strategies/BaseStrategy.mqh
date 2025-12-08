//+------------------------------------------------------------------+
//|                                                BaseStrategy.mqh |
//|                    Base Strategy Class for Trading Expert      |
//+------------------------------------------------------------------+
#property copyright "TradingExpert"
#property link      ""
#property strict

#include "../../Include/Utils.mqh"

//+------------------------------------------------------------------+
//| Base Strategy Class                                              |
//+------------------------------------------------------------------+
class CBaseStrategy
{
protected:
   ENUM_TIMEFRAMES m_timeframe;
   string m_symbol;

public:
   CBaseStrategy(ENUM_TIMEFRAMES timeframe);
   virtual ~CBaseStrategy();
   
   virtual bool Initialize() { return true; }
   virtual int GetSignal() { return SIGNAL_NONE; }
   virtual void OnTick() {}
   virtual void Cleanup() {}
   
   void SetSymbol(string symbol) { m_symbol = symbol; }
   string GetSymbol() { return m_symbol; }
   ENUM_TIMEFRAMES GetTimeframe() { return m_timeframe; }
};

//+------------------------------------------------------------------+
//| Constructor                                                       |
//+------------------------------------------------------------------+
CBaseStrategy::CBaseStrategy(ENUM_TIMEFRAMES timeframe)
{
   m_timeframe = timeframe;
   m_symbol = _Symbol;
}

//+------------------------------------------------------------------+
//| Destructor                                                        |
//+------------------------------------------------------------------+
CBaseStrategy::~CBaseStrategy()
{
   Cleanup();
}

//+------------------------------------------------------------------+

