'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getSymbolsByExchange } from '@/lib/symbols'

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
  // Note: Balance is not symbol-specific - it's the total account balance
}

interface RiskSettings {
  maxBalancePercent: number
  maxDailyLoss: number
  maxDailyProfit: number
  riskPercent: number
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

export default function Home() {
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [balance, setBalance] = useState<AccountBalance | null>(null)
  const [riskSettings, setRiskSettings] = useState<RiskSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [testingApi, setTestingApi] = useState(false)
  const [apiTestResult, setApiTestResult] = useState<ApiTestResult | null>(null)
  const [savingRisk, setSavingRisk] = useState(false)
  const [testExchange, setTestExchange] = useState<string>('KuCoin')
  const [testSymbol, setTestSymbol] = useState<string>('BTC-USDT')
  const [refreshingBalance, setRefreshingBalance] = useState(false)
  const [balanceExchange, setBalanceExchange] = useState<string>('KuCoin')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
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
        const activeConfig = configs.find((c: any) => c.isActive) || configs[0]
        if (activeConfig) {
          setRiskSettings({
            maxBalancePercent: activeConfig.maxBalancePercent || 50,
            maxDailyLoss: activeConfig.maxDailyLoss || 4.0,
            maxDailyProfit: activeConfig.maxDailyProfit || 8.0,
            riskPercent: activeConfig.riskPercent || 1.5,
          })
          // Use exchange from active config if available, otherwise use current balanceExchange
          if (activeConfig.exchange) {
            exchangeToUse = activeConfig.exchange
            if (!balanceExchange || isInitial) {
              setBalanceExchange(activeConfig.exchange)
            }
          }
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
      await fetch('/api/bot/stop', { method: 'POST' })
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
    } catch (error: any) {
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
    } catch (error: any) {
      setApiTestResult({
        success: false,
        message: 'Failed to test API connection',
        error: error.message,
      })
    } finally {
      setTestingApi(false)
    }
  }

  const handleSaveRiskSettings = async () => {
    if (!riskSettings) return
    
    setSavingRisk(true)
    try {
      // Get active config
      const configRes = await fetch('/api/config')
      const configs = await configRes.json()
      const activeConfig = configs.find((c: any) => c.isActive) || configs[0]
      
      if (activeConfig) {
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...activeConfig,
            maxBalancePercent: riskSettings.maxBalancePercent,
            maxDailyLoss: riskSettings.maxDailyLoss,
            maxDailyProfit: riskSettings.maxDailyProfit,
            riskPercent: riskSettings.riskPercent,
          }),
        })
        alert('Risk settings saved!')
      }
    } catch (error) {
      console.error('Error saving risk settings:', error)
      alert('Error saving risk settings')
    } finally {
      setSavingRisk(false)
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
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Click "Refresh" to load account balance for {balanceExchange}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Risk Management Card */}
        {riskSettings && balance && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Risk Management</CardTitle>
              <CardDescription>Configure risk settings and trading limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="maxBalancePercent">
                      Max Balance for Trading: {riskSettings.maxBalancePercent}%
                    </Label>
                    <span className="text-sm text-muted-foreground">
                      {(balance.totalBalance * (riskSettings.maxBalancePercent / 100)).toFixed(2)} {balance.currency}
                    </span>
                  </div>
                  <Slider
                    id="maxBalancePercent"
                    value={riskSettings.maxBalancePercent}
                    onValueChange={(value) => 
                      setRiskSettings({ ...riskSettings, maxBalancePercent: value })
                    }
                    min={10}
                    max={100}
                    step={5}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Conservative (10%)</span>
                    <span>Moderate (50%)</span>
                    <span>Aggressive (100%)</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="riskPercent">
                      Risk per Trade: {riskSettings.riskPercent}%
                    </Label>
                  </div>
                  <Slider
                    id="riskPercent"
                    value={riskSettings.riskPercent}
                    onValueChange={(value) => 
                      setRiskSettings({ ...riskSettings, riskPercent: value })
                    }
                    min={0.5}
                    max={5}
                    step={0.1}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Low (0.5%)</span>
                    <span>Medium (2%)</span>
                    <span>High (5%)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="maxDailyLoss">
                        Max Daily Loss: {riskSettings.maxDailyLoss}%
                      </Label>
                    </div>
                    <Slider
                      id="maxDailyLoss"
                      value={riskSettings.maxDailyLoss}
                      onValueChange={(value) => 
                        setRiskSettings({ ...riskSettings, maxDailyLoss: value })
                      }
                      min={1}
                      max={10}
                      step={0.5}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="maxDailyProfit">
                        Max Daily Profit: {riskSettings.maxDailyProfit}%
                      </Label>
                    </div>
                    <Slider
                      id="maxDailyProfit"
                      value={riskSettings.maxDailyProfit}
                      onValueChange={(value) => 
                        setRiskSettings({ ...riskSettings, maxDailyProfit: value })
                      }
                      min={5}
                      max={20}
                      step={0.5}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Daily Loss Limit</div>
                      <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                        {(balance.totalBalance * (riskSettings.maxDailyLoss / 100)).toFixed(2)} {balance.currency}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Daily Profit Target</div>
                      <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                        {(balance.totalBalance * (riskSettings.maxDailyProfit / 100)).toFixed(2)} {balance.currency}
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={handleSaveRiskSettings} 
                  disabled={savingRisk}
                  className="w-full"
                  size="lg"
                >
                  {savingRisk ? 'Saving...' : 'Save Risk Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
          </CardContent>
        </Card>

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
