'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getSymbolsByExchange } from '@/lib/symbols'
import { useLock } from '@/contexts/LockContext'

interface BotStatus {
  id: string
  isRunning: boolean
  lastCheck: string | null
  lastTrade: string | null
  dailyProfit: number
  totalProfit: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
}

interface AccountBalance {
  balance: number
  currency: string
  availableBalance: number
  totalBalance: number
  exchange: string
  // KuCoin-specific: separate balances
  mainBalance?: number
  tradeBalance?: number
  mainAvailable?: number
  tradeAvailable?: number
  // Note: Balance is not symbol-specific - it's the total account balance
}

interface RiskSettings {
  maxBalancePercent: number
  maxDailyLoss: number
  maxDailyProfit: number
  riskPercent: number
}

interface BotConfig {
  id: string
  exchange: string
  symbol: string
  fastMA: number
  slowMA: number
  timeframe: string
  riskPercent: number
  stopLossPips: number
  takeProfitPips: number
  maxDailyLoss: number
  maxDailyProfit: number
  maxSpreadPips: number
  maxBalancePercent: number
  allowBuy: boolean
  allowSell: boolean
  isActive: boolean
  strategyType?: string
}

interface ApiTestResult {
  success: boolean
  message: string
  exchange?: string
  data?: {
    accounts: {
      total: number
      trading: number
      balance: number
      currency: string
    }
    market: {
      symbol: string
      price: string
      bid: string
      ask: string
    }
    historical: {
      klinesReceived: number
      latestPrice: number | null
    }
  }
  error?: string
}

interface MonitorLog {
  id: string
  level: string
  message: string
  createdAt: Date | string
  data?: unknown
}

interface MonitorTrade {
  id: string
  symbol: string
  side: string
  price: number
  size: number
  status: string
  openedAt: Date | string
  profit: number | null
}

interface MonitorData {
  status?: BotStatus | null
  config?: BotConfig | null
  logs?: MonitorLog[]
  trades?: MonitorTrade[]
}

export default function Home() {
  const { lock } = useLock()
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [balance, setBalance] = useState<AccountBalance | null>(null)
  const [riskSettings, setRiskSettings] = useState<RiskSettings | null>(null)
  const [activeConfig, setActiveConfig] = useState<BotConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [testingApi, setTestingApi] = useState(false)
  const [apiTestResult, setApiTestResult] = useState<ApiTestResult | null>(null)
  const [testExchange, setTestExchange] = useState<string>('KuCoin')
  const [testSymbol, setTestSymbol] = useState<string>('BTC-USDT')
  const [refreshingBalance, setRefreshingBalance] = useState(false)
  const [balanceExchange, setBalanceExchange] = useState<string>('KuCoin')
  const [monitorData, setMonitorData] = useState<MonitorData | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const monitorIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const fetchingRef = useRef(false)
  const hasSetupRef = useRef(false)

  const fetchStatus = useCallback(async (isInitial = false) => {
    // Prevent concurrent fetches
    if (fetchingRef.current && !isInitial) {
      return
    }
    
    fetchingRef.current = true
    try {
      const [statusRes, configRes] = await Promise.all([
        fetch('/api/bot/status', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        }),
        fetch('/api/config', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        }),
      ])
      
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setStatus(prevStatus => {
          if (prevStatus && JSON.stringify(prevStatus) === JSON.stringify(statusData)) {
            return prevStatus
          }
          return statusData
        })
      }
      
      let exchangeToUse = balanceExchange
      
      if (configRes.ok) {
        const configs = await configRes.json()
        const activeConfigData = configs.find((c: { isActive?: boolean }) => c.isActive) || configs[0]
        if (activeConfigData) {
          setActiveConfig(activeConfigData as BotConfig)
          setRiskSettings({
            maxBalancePercent: activeConfigData.maxBalancePercent || 50,
            maxDailyLoss: activeConfigData.maxDailyLoss || 4.0,
            maxDailyProfit: activeConfigData.maxDailyProfit || 8.0,
            riskPercent: activeConfigData.riskPercent || 1.5,
          })
          // Use exchange from active config if available, otherwise use current balanceExchange
          if (activeConfigData.exchange) {
            exchangeToUse = activeConfigData.exchange
            if (!balanceExchange || isInitial) {
              setBalanceExchange(activeConfigData.exchange)
            }
          }
        } else {
          setActiveConfig(null)
        }
      }
      
      // Fetch balance using the determined exchange
      // Only fetch if we have an exchange (prevents calling API without exchange parameter)
      if (exchangeToUse) {
        try {
          const params = new URLSearchParams()
          params.append('exchange', exchangeToUse)
          const balanceRes = await fetch(`/api/balance?${params.toString()}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
          })
          
          if (balanceRes.ok) {
            const balanceData = await balanceRes.json()
            // Only update if we got a valid response without error
            if (!balanceData.error) {
              setBalance(balanceData)
              if (balanceData.exchange) {
                setBalanceExchange(balanceData.exchange)
              }
            }
            // If there's an error in the response, don't update balance (keep last known value)
          }
        } catch (error) {
          console.error('Error fetching balance:', error)
          // Don't clear balance on errors - keep the last known balance
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      fetchingRef.current = false
      if (isInitial) {
        setLoading(false)
      }
    }
  }, [balanceExchange])

  // Fetch monitoring data (logs, trades, status)
  const fetchMonitorData = useCallback(async () => {
    if (!status?.isRunning) {
      setMonitorData(null)
      return
    }

    try {
      const res = await fetch('/api/monitor?logsLimit=20&tradesLimit=5', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (res.ok) {
        const data = await res.json()
        setMonitorData(data)
      }
    } catch (error) {
      console.error('Error fetching monitor data:', error)
    }
  }, [status?.isRunning])

  useEffect(() => {
    // Prevent multiple setups (React Strict Mode can cause double mount in dev)
    if (hasSetupRef.current) {
      return
    }
    hasSetupRef.current = true
    
    let isMounted = true
    
    // Initial load
    fetchStatus(true)
    
    // Clear any existing interval before setting a new one (safety check)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    
    // Set up polling interval - only if component is still mounted
    intervalRef.current = setInterval(() => {
      if (isMounted && !fetchingRef.current) {
        fetchStatus(false)
      }
    }, 300000) // 5 minutes (300000ms)
    
    // Cleanup on unmount
    return () => {
      isMounted = false
      hasSetupRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      fetchingRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps - we only want this to run once on mount

  // Separate effect for monitoring interval based on bot status and timeframe
  useEffect(() => {
    if (monitorIntervalRef.current) {
      clearInterval(monitorIntervalRef.current)
      monitorIntervalRef.current = null
    }

    if (status?.isRunning && activeConfig) {
      // Get update interval based on timeframe (similar to bot check interval)
      const getMonitorInterval = (timeframe: string): number => {
        const intervalMap: Record<string, number> = {
          '1min': 10000,    // 10 seconds for 1min
          '5min': 20000,    // 20 seconds for 5min
          '15min': 30000,   // 30 seconds for 15min
          '30min': 60000,   // 60 seconds for 30min
          '1hour': 120000,  // 2 minutes for 1hour
          '4hour': 300000,  // 5 minutes for 4hour
          '1day': 600000,   // 10 minutes for 1day
        }
        return intervalMap[timeframe] || 30000 // Default 30 seconds
      }

      const interval = getMonitorInterval(activeConfig.timeframe)
      fetchMonitorData() // Fetch immediately
      monitorIntervalRef.current = setInterval(() => {
        fetchMonitorData()
      }, interval)
    } else {
      setMonitorData(null)
    }

    return () => {
      if (monitorIntervalRef.current) {
        clearInterval(monitorIntervalRef.current)
        monitorIntervalRef.current = null
      }
    }
  }, [status?.isRunning, activeConfig?.timeframe, fetchMonitorData])

  const handleStart = async () => {
    try {
      await fetch('/api/bot/start', { method: 'POST' })
      setTimeout(() => fetchStatus(false), 1000)
    } catch (error) {
      console.error('Error starting bot:', error)
    }
  }

  const handleStop = async () => {
    try {
      // Check for open trades first
      const tradesRes = await fetch('/api/trades?limit=100')
      const trades = tradesRes.ok ? await tradesRes.json() : []
      const openTrades = trades.filter((t: { status: string }) => 
        t.status === 'pending' || t.status === 'filled'
      )

      let closeOpenTrades = false
      if (openTrades.length > 0) {
        const filledTrades = openTrades.filter((t: { status: string }) => t.status === 'filled')
        const pendingTrades = openTrades.filter((t: { status: string }) => t.status === 'pending')
        
        let message = `Bot has ${openTrades.length} open trade(s):\n`
        if (pendingTrades.length > 0) {
          message += `- ${pendingTrades.length} pending order(s) will be cancelled\n`
        }
        if (filledTrades.length > 0) {
          message += `- ${filledTrades.length} filled trade(s) will be protected with stop-loss/take-profit orders\n\n`
        }
        message += `Choose an option:\n`
        message += `OK = Close all (cancel pending, filled trades remain open)\n`
        message += `Cancel = Protect filled trades with stop-loss/take-profit orders`
        
        const shouldClose = window.confirm(message)
        closeOpenTrades = shouldClose
      }

      await fetch('/api/bot/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closeOpenTrades }),
      })
      setTimeout(() => fetchStatus(false), 1000)
    } catch (error) {
      console.error('Error stopping bot:', error)
    }
  }

  const handleRefreshBalance = async () => {
    setRefreshingBalance(true)
    try {
      const params = new URLSearchParams()
      params.append('exchange', balanceExchange)
      
      const res = await fetch(`/api/balance?${params.toString()}`)
      const data = await res.json()
      setBalance(data)
      if (data.exchange) {
        setBalanceExchange(data.exchange)
      }
    } catch (error: unknown) {
      console.error('Error refreshing balance:', error)
    } finally {
      setRefreshingBalance(false)
    }
  }

  const handleBalanceExchangeChange = (exchange: string) => {
    setBalanceExchange(exchange)
    // Clear balance when exchange changes - user needs to click refresh
    setBalance(null)
  }

  const handleTestApi = async () => {
    setTestingApi(true)
    setApiTestResult(null)
    try {
      const params = new URLSearchParams({
        exchange: testExchange,
        symbol: testSymbol,
      })
      const res = await fetch(`/api/test-connection?${params.toString()}`)
      const data = await res.json()
      setApiTestResult(data)
    } catch (error: unknown) {
      console.error('Error testing API connection:', error)
      setApiTestResult({
        success: false,
        message: 'Failed to test API connection',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setTestingApi(false)
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-foreground text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-foreground">Trading Bot</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Select
                value={testExchange}
                onValueChange={(value) => {
                  setTestExchange(value)
                  const symbols = getSymbolsByExchange(value)
                  setTestSymbol(symbols[0]?.value || '')
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KuCoin">KuCoin</SelectItem>
                  <SelectItem value="OANDA">OANDA</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={testSymbol}
                onValueChange={setTestSymbol}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getSymbolsByExchange(testExchange).map((sym) => (
                    <SelectItem key={sym.value} value={sym.value}>
                      {sym.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleTestApi}
              disabled={testingApi}
              variant="outline"
              size="lg"
            >
              {testingApi ? 'Testing...' : 'Test API Connection'}
            </Button>
            <Button
              onClick={lock}
              variant="outline"
              size="lg"
              title="Lock page"
            >
              🔒 Lock
            </Button>
          </div>
        </div>

        {/* API Test Result */}
        {apiTestResult && (
          <Card className={apiTestResult.success ? 'border-green-500' : 'border-red-500'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge variant={apiTestResult.success ? 'default' : 'destructive'}>
                  {apiTestResult.success ? 'Success' : 'Failed'}
                </Badge>
                API Connection Test
              </CardTitle>
              <CardDescription>{apiTestResult.message}</CardDescription>
            </CardHeader>
            {apiTestResult.success && apiTestResult.data && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">
                      {apiTestResult.data.accounts.currency || 'Balance'} Balance
                    </div>
                    <div className="text-2xl font-bold text-foreground">
                      {apiTestResult.data.accounts.balance != null 
                        ? `${apiTestResult.data.accounts.currency === 'USD' || apiTestResult.data.accounts.currency?.includes('USD') ? '$' : ''}${apiTestResult.data.accounts.balance.toFixed(2)}`
                        : 'N/A'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {apiTestResult.data.accounts.trading} trading accounts
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">{apiTestResult.data.market.symbol} Price</div>
                    <div className="text-2xl font-bold text-foreground">
                      {apiTestResult.data.market.price 
                        ? `$${parseFloat(apiTestResult.data.market.price).toFixed(2)}`
                        : 'N/A'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {apiTestResult.data.market.bid && apiTestResult.data.market.ask
                        ? `Bid: $${parseFloat(apiTestResult.data.market.bid).toFixed(2)} | Ask: $${parseFloat(apiTestResult.data.market.ask).toFixed(2)}`
                        : 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Historical Data</div>
                    <div className="text-2xl font-bold text-foreground">
                      {apiTestResult.data.historical.klinesReceived} candles
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Latest: {apiTestResult.data.historical.latestPrice != null 
                        ? `$${apiTestResult.data.historical.latestPrice.toFixed(2)}`
                        : 'N/A'}
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
            {!apiTestResult.success && apiTestResult.error && (
              <CardContent>
                <div className="p-4 bg-destructive/10 rounded-md">
                  <div className="text-sm font-medium text-destructive mb-2">Error Details:</div>
                  <div className="text-sm text-muted-foreground font-mono">
                    {apiTestResult.error}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Account Balance Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Account Balance</CardTitle>
                <CardDescription>
                  Select exchange and symbol to view balance
                </CardDescription>
              </div>
              <Button
                onClick={handleRefreshBalance}
                disabled={refreshingBalance}
                variant="outline"
                size="sm"
              >
                {refreshingBalance ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <Label htmlFor="balanceExchange">Exchange</Label>
                <Select
                  value={balanceExchange}
                  onValueChange={handleBalanceExchangeChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KuCoin">KuCoin (Crypto - USDT)</SelectItem>
                    <SelectItem value="OANDA">OANDA (Forex - USD)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select the exchange to view your account balance. Balance shows total funds available for trading.
                </p>
              </div>
            </div>
            {balance ? (
              <div className="space-y-4">
                {/* For KuCoin, show separate main and trade balances */}
                {balance.exchange === 'KuCoin' && (balance.mainBalance !== undefined || balance.tradeBalance !== undefined) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm text-muted-foreground mb-2">Main Account</div>
                      <div className="text-2xl font-bold text-foreground">
                        {(balance.mainBalance || 0).toFixed(8)} {balance.currency}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Available: {(balance.mainAvailable || 0).toFixed(8)} {balance.currency}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Used for deposits/withdrawals
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
                      <div className="text-sm text-muted-foreground mb-2">Trade Account</div>
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {(balance.tradeBalance || 0).toFixed(8)} {balance.currency}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Available: {(balance.tradeAvailable || 0).toFixed(8)} {balance.currency}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Used for trading (auto-transfers from main when needed)
                      </div>
                    </div>
                  </div>
                ) : null}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Total Balance</div>
                    <div className="text-3xl font-bold text-foreground">
                      {balance.totalBalance.toFixed(2)} {balance.currency}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Available Balance</div>
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {balance.availableBalance.toFixed(2)} {balance.currency}
                    </div>
                  </div>
                  {riskSettings && (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">Allocated for Trading</div>
                      <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {(balance.totalBalance * (riskSettings.maxBalancePercent / 100)).toFixed(2)} {balance.currency}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {riskSettings.maxBalancePercent}% of total balance
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Click &quot;Refresh&quot; to load account balance for {balanceExchange}
              </div>
            )}
          </CardContent>
        </Card>


        {/* Bot Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Bot Status</CardTitle>
                <CardDescription>Current trading bot status and statistics</CardDescription>
              </div>
              {status?.isRunning ? (
                <Button onClick={handleStop} variant="destructive" size="lg">
                  Stop Bot
                </Button>
              ) : (
                <Button onClick={handleStart} size="lg">
                  Start Bot
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Status</div>
                <div className="flex items-center gap-2">
                  <Badge variant={status?.isRunning ? 'default' : 'secondary'}>
                    {status?.isRunning ? 'Running' : 'Stopped'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Total Profit</div>
                <div className={`text-2xl font-bold ${(status?.totalProfit || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  ${(status?.totalProfit || 0).toFixed(2)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Daily Profit</div>
                <div className={`text-2xl font-bold ${(status?.dailyProfit || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  ${(status?.dailyProfit || 0).toFixed(2)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Total Trades</div>
                <div className="text-2xl font-bold text-foreground">{status?.totalTrades || 0}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Winning Trades</div>
                <div className="text-xl font-semibold text-green-600 dark:text-green-400">{status?.winningTrades || 0}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Losing Trades</div>
                <div className="text-xl font-semibold text-red-600 dark:text-red-400">{status?.losingTrades || 0}</div>
              </div>
            </div>

            {status?.lastCheck && (
              <div className="mt-4 text-sm text-muted-foreground">
                Last Check: {new Date(status.lastCheck).toLocaleString()}
              </div>
            )}

            {/* Bot Configuration Settings */}
            {activeConfig && status?.isRunning && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="text-lg font-semibold mb-4">Active Bot Configuration</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Exchange</div>
                    <div className="text-sm font-medium">{activeConfig.exchange}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Symbol</div>
                    <div className="text-sm font-medium">{activeConfig.symbol}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Timeframe</div>
                    <div className="text-sm font-medium">{activeConfig.timeframe}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Fast MA / Slow MA</div>
                    <div className="text-sm font-medium">{activeConfig.fastMA} / {activeConfig.slowMA}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Risk per Trade</div>
                    <div className="text-sm font-medium">{activeConfig.riskPercent}%</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Stop Loss</div>
                    <div className="text-sm font-medium">{activeConfig.stopLossPips} pips</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Take Profit</div>
                    <div className="text-sm font-medium">{activeConfig.takeProfitPips} pips</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Max Spread</div>
                    <div className="text-sm font-medium">{activeConfig.maxSpreadPips} pips</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Max Daily Loss</div>
                    <div className="text-sm font-medium">{activeConfig.maxDailyLoss}%</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Max Daily Profit</div>
                    <div className="text-sm font-medium">{activeConfig.maxDailyProfit}%</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Trade Direction</div>
                    <div className="text-sm font-medium">
                      {activeConfig.allowBuy && activeConfig.allowSell ? 'Both' : activeConfig.allowBuy ? 'Buy Only' : 'Sell Only'}
                    </div>
                  </div>
                  {activeConfig.strategyType && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Strategy</div>
                      <div className="text-sm font-medium capitalize">
                        {activeConfig.strategyType.replace(/-/g, ' ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bot Activity Monitor - Only show when bot is running */}
        {status?.isRunning && monitorData && (
          <Card>
            <CardHeader>
              <CardTitle>Bot Activity Monitor</CardTitle>
              <CardDescription>
                Real-time bot activity, logs, and recent trades
                {activeConfig && ` (updating every ${activeConfig.timeframe === '1min' ? '10s' : activeConfig.timeframe === '5min' ? '20s' : activeConfig.timeframe === '15min' ? '30s' : activeConfig.timeframe === '30min' ? '1min' : activeConfig.timeframe === '1hour' ? '2min' : activeConfig.timeframe === '4hour' ? '5min' : '10min'})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Status Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Last Check</div>
                    <div className="text-sm font-medium">
                      {monitorData.status?.lastCheck
                        ? new Date(monitorData.status.lastCheck).toLocaleTimeString()
                        : 'Never'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Total Trades</div>
                    <div className="text-sm font-medium">{monitorData.status?.totalTrades || 0}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Win Rate</div>
                    <div className="text-sm font-medium">
                      {monitorData.status && monitorData.status.totalTrades > 0
                        ? `${((monitorData.status.winningTrades / monitorData.status.totalTrades) * 100).toFixed(1)}%`
                        : '0%'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Last Trade</div>
                    <div className="text-sm font-medium">
                      {monitorData.status?.lastTrade
                        ? new Date(monitorData.status.lastTrade).toLocaleTimeString()
                        : 'None'}
                    </div>
                  </div>
                </div>

                {/* Recent Trades */}
                {monitorData.trades && monitorData.trades.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Recent Trades</h4>
                    <div className="space-y-2">
                      {monitorData.trades.slice(0, 3).map((trade: MonitorTrade) => (
                        <div
                          key={trade.id}
                          className="p-3 border rounded-lg bg-background"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant={trade.side === 'buy' ? 'default' : 'secondary'}>
                                {trade.side.toUpperCase()}
                              </Badge>
                              <span className="text-sm font-medium">{trade.symbol}</span>
                              <span className="text-xs text-muted-foreground">
                                @ ${trade.price.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground">
                                {new Date(trade.openedAt).toLocaleTimeString()}
                              </span>
                              {trade.profit !== null && (
                                <span
                                  className={`text-sm font-semibold ${
                                    trade.profit >= 0
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-red-600 dark:text-red-400'
                                  }`}
                                >
                                  {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                                </span>
                              )}
                              <Badge
                                variant={
                                  trade.status === 'filled'
                                    ? 'default'
                                    : trade.status === 'pending'
                                    ? 'outline'
                                    : 'secondary'
                                }
                              >
                                {trade.status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Logs */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Recent Activity Logs</h4>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-lg p-3 bg-background">
                    {monitorData.logs && monitorData.logs.length > 0 ? (
                      monitorData.logs.map((log: MonitorLog) => {
                        const getLevelColor = (level: string) => {
                          switch (level) {
                            case 'error':
                              return 'text-red-600 dark:text-red-400'
                            case 'warning':
                              return 'text-yellow-600 dark:text-yellow-400'
                            default:
                              return 'text-blue-600 dark:text-blue-400'
                          }
                        }
                        const getLevelIcon = (level: string) => {
                          switch (level) {
                            case 'error':
                              return '❌'
                            case 'warning':
                              return '⚠️'
                            default:
                              return 'ℹ️'
                          }
                        }
                        return (
                          <div
                            key={log.id}
                            className="p-2 border-b last:border-b-0 hover:bg-muted/50 rounded transition-colors"
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-xs">{getLevelIcon(log.level)}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge
                                    variant={
                                      log.level === 'error'
                                        ? 'destructive'
                                        : log.level === 'warning'
                                        ? 'outline'
                                        : 'default'
                                    }
                                    className="text-xs"
                                  >
                                    {log.level.toUpperCase()}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(log.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <div className={`text-sm ${getLevelColor(log.level)}`}>
                                  {log.message}
                                </div>
                                {log.data && typeof log.data === 'object' ? (
                                  <details className="mt-1">
                                    <summary className="text-xs text-muted-foreground cursor-pointer">
                                      View details
                                    </summary>
                                    <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                                      {JSON.stringify(log.data as Record<string, unknown>, null, 2)}
                                    </pre>
                                  </details>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No logs yet
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link href="/config">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>Manage bot settings and trading parameters</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/trades">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <CardTitle>Trades</CardTitle>
                <CardDescription>View all trading history and performance</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/logs">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <CardTitle>Logs</CardTitle>
                <CardDescription>Monitor bot activity and errors</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/backtest">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader>
                <CardTitle>Backtesting</CardTitle>
                <CardDescription>Test strategies on historical data</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}
