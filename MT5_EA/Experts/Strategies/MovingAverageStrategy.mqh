//+------------------------------------------------------------------+
//|                                        MovingAverageStrategy.mqh |
//|              Moving Average Crossover Strategy Implementation  |
//+------------------------------------------------------------------+
#property copyright "TradingExpert"
#property link      ""
#property strict

#include "BaseStrategy.mqh"
#include "../../Include/Indicators.mqh"

//+------------------------------------------------------------------+
//| Moving Average Strategy Class                                    |
//+------------------------------------------------------------------+
class CMovingAverageStrategy : public CBaseStrategy
{
private:
   int m_fastPeriod;
   int m_slowPeriod;
   ENUM_MA_METHOD m_method;
   
   int m_fastMAHandle;
   int m_slowMAHandle;
   
   double m_fastMABuffer[];
   double m_slowMABuffer[];

public:
   CMovingAverageStrategy(int fastPeriod, int slowPeriod, ENUM_MA_METHOD method, ENUM_TIMEFRAMES timeframe);
   ~CMovingAverageStrategy();
   
   bool Initialize() override;
   int GetSignal() override;
   void Cleanup() override;
};

//+------------------------------------------------------------------+
//| Constructor                                                       |
//+------------------------------------------------------------------+
CMovingAverageStrategy::CMovingAverageStrategy(int fastPeriod, int slowPeriod, ENUM_MA_METHOD method, ENUM_TIMEFRAMES timeframe)
   : CBaseStrategy(timeframe)
{
   m_fastPeriod = fastPeriod;
   m_slowPeriod = slowPeriod;
   m_method = method;
   
   m_fastMAHandle = INVALID_HANDLE;
   m_slowMAHandle = INVALID_HANDLE;
   
   ArraySetAsSeries(m_fastMABuffer, true);
   ArraySetAsSeries(m_slowMABuffer, true);
}

//+------------------------------------------------------------------+
//| Destructor                                                        |
//+------------------------------------------------------------------+
CMovingAverageStrategy::~CMovingAverageStrategy()
{
   Cleanup();
}

//+------------------------------------------------------------------+
//| Initialize indicators                                             |
//+------------------------------------------------------------------+
bool CMovingAverageStrategy::Initialize()
{
   // Create fast MA indicator
   m_fastMAHandle = iMA(m_symbol, m_timeframe, m_fastPeriod, 0, m_method, PRICE_CLOSE);
   if(m_fastMAHandle == INVALID_HANDLE)
   {
      Print("Failed to create Fast MA indicator");
      return false;
   }
   
   // Create slow MA indicator
   m_slowMAHandle = iMA(m_symbol, m_timeframe, m_slowPeriod, 0, m_method, PRICE_CLOSE);
   if(m_slowMAHandle == INVALID_HANDLE)
   {
      Print("Failed to create Slow MA indicator");
      IndicatorRelease(m_fastMAHandle);
      return false;
   }
   
   Print("Moving Average Strategy initialized: Fast=", m_fastPeriod, " Slow=", m_slowPeriod);
   return true;
}

//+------------------------------------------------------------------+
//| Get trading signal                                                |
//+------------------------------------------------------------------+
int CMovingAverageStrategy::GetSignal()
{
   if(m_fastMAHandle == INVALID_HANDLE || m_slowMAHandle == INVALID_HANDLE)
      return SIGNAL_NONE;
   
   // Copy indicator values
   if(CopyBuffer(m_fastMAHandle, 0, 0, 3, m_fastMABuffer) <= 0)
      return SIGNAL_NONE;
   
   if(CopyBuffer(m_slowMAHandle, 0, 0, 3, m_slowMABuffer) <= 0)
      return SIGNAL_NONE;
   
   // Get current and previous values
   double fastCurrent = m_fastMABuffer[0];
   double fastPrevious = m_fastMABuffer[1];
   double slowCurrent = m_slowMABuffer[0];
   double slowPrevious = m_slowMABuffer[1];
   
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
//| Cleanup indicators                                                |
//+------------------------------------------------------------------+
void CMovingAverageStrategy::Cleanup()
{
   if(m_fastMAHandle != INVALID_HANDLE)
   {
      IndicatorRelease(m_fastMAHandle);
      m_fastMAHandle = INVALID_HANDLE;
   }
   
   if(m_slowMAHandle != INVALID_HANDLE)
   {
      IndicatorRelease(m_slowMAHandle);
      m_slowMAHandle = INVALID_HANDLE;
   }
}

//+------------------------------------------------------------------+

