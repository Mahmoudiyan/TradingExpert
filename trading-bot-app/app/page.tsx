'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

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

interface ApiTestResult {
  success: boolean
  message: string
  data?: {
    accounts: {
      total: number
      trading: number
      usdtBalance: number
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
  const [loading, setLoading] = useState(true)
  const [testingApi, setTestingApi] = useState(false)
  const [apiTestResult, setApiTestResult] = useState<ApiTestResult | null>(null)
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
      const res = await fetch('/api/bot/status', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      
      const data = await res.json()
      
      // Only update state if data actually changed to prevent unnecessary re-renders
      setStatus(prevStatus => {
        if (prevStatus && JSON.stringify(prevStatus) === JSON.stringify(data)) {
          return prevStatus
        }
        return data
      })
    } catch (error) {
      console.error('Error fetching status:', error)
      // Don't update status on error to prevent state changes that cause re-renders
    } finally {
      fetchingRef.current = false
      // Only set loading to false on initial load
      if (isInitial) {
        setLoading(false)
      }
    }
  }, [])

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
    }, 5000)
    
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

  const handleTestApi = async () => {
    setTestingApi(true)
    setApiTestResult(null)
    try {
      const res = await fetch('/api/test-connection')
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
          <Button
            onClick={handleTestApi}
            disabled={testingApi}
            variant="outline"
            size="lg"
          >
            {testingApi ? 'Testing...' : 'Test API Connection'}
          </Button>
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
                    <div className="text-sm text-muted-foreground">USDT Balance</div>
                    <div className="text-2xl font-bold text-foreground">
                      ${apiTestResult.data.accounts.usdtBalance.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {apiTestResult.data.accounts.trading} trading accounts
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">BTC-USDT Price</div>
                    <div className="text-2xl font-bold text-foreground">
                      ${parseFloat(apiTestResult.data.market.price).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Bid: ${parseFloat(apiTestResult.data.market.bid).toFixed(2)} | Ask: ${parseFloat(apiTestResult.data.market.ask).toFixed(2)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Historical Data</div>
                    <div className="text-2xl font-bold text-foreground">
                      {apiTestResult.data.historical.klinesReceived} candles
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Latest: ${apiTestResult.data.historical.latestPrice?.toFixed(2) || 'N/A'}
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
