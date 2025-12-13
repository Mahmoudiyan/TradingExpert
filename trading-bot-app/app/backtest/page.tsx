'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import { getSymbolsByExchange } from '@/lib/symbols'

interface BacktestResult {
  startDate: string
  endDate: string
  initialBalance: number
  finalBalance: number
  totalProfit: number
  totalProfitPercent: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  maxDrawdown: number
  maxDrawdownPercent: number
  sharpeRatio: number
  trades: BacktestTrade[]
  strategyUsed?: string
  signalsFiltered?: number
}

interface BacktestTrade {
  entryDate: string
  exitDate: string
  symbol: string
  side: 'buy' | 'sell'
  entryPrice: number
  exitPrice: number
  size: number
  profit: number
  profitPercent: number
}

export default function BacktestPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [creatingConfig, setCreatingConfig] = useState(false)

  const [formData, setFormData] = useState({
    exchange: 'KuCoin',
    symbol: 'BTC-USDT',
    timeframe: '4hour',
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 90 days ago
    endDate: new Date().toISOString().split('T')[0],
    fastMA: 9,
    slowMA: 21,
    riskPercent: 1.5,
    stopLossPips: 30,
    takeProfitPips: 75,
    initialBalance: 10000,
    allowBuy: true,
    allowSell: true,
    strategyType: 'ema-rsi' as 'ema-only' | 'ema-rsi' | 'ema-rsi-trend' | 'mean-reversion' | 'momentum' | 'multi-timeframe-trend',
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
  })

  const handleRunBacktest = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          exchange: formData.exchange,
          startDate: new Date(formData.startDate).toISOString(),
          endDate: new Date(formData.endDate).toISOString(),
          strategyType: formData.strategyType,
          rsiPeriod: formData.rsiPeriod,
          rsiOverbought: formData.rsiOverbought,
          rsiOversold: formData.rsiOversold,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Backtest failed')
      }

      const data = await response.json()
      setResult(data)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Error: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateConfig = async () => {
    if (!result) return
    
    setCreatingConfig(true)
    try {
      // Create config from backtest parameters
      const configData = {
        exchange: formData.exchange,
        symbol: formData.symbol,
        timeframe: formData.timeframe,
        fastMA: formData.fastMA,
        slowMA: formData.slowMA,
        riskPercent: formData.riskPercent,
        stopLossPips: formData.stopLossPips,
        takeProfitPips: formData.takeProfitPips,
        maxDailyLoss: 4.0, // Default values
        maxDailyProfit: 8.0,
        maxSpreadPips: 3.0,
        maxBalancePercent: 50.0,
        allowBuy: formData.allowBuy,
        allowSell: formData.allowSell,
        isActive: false, // Don't activate automatically
        strategyType: formData.strategyType,
      }

      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create config')
      }

      const createdConfig = await response.json()
      alert('Configuration created successfully! You can activate it in the Config page.')
      router.push(`/config?id=${createdConfig.id}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Error creating config: ${errorMessage}`)
    } finally {
      setCreatingConfig(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-foreground">Backtesting</h1>
          <Button onClick={() => router.back()} variant="outline">
            Back
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Form */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Backtest Parameters</CardTitle>
                <CardDescription>Configure your backtest settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="exchange">Exchange</Label>
                  <Select
                    value={formData.exchange}
                    onValueChange={(value) => {
                      const symbols = getSymbolsByExchange(value)
                      setFormData({
                        ...formData,
                        exchange: value,
                        symbol: symbols[0]?.value || '',
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="KuCoin">KuCoin (Crypto)</SelectItem>
                      <SelectItem value="OANDA">OANDA (Forex)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select the exchange to use for backtesting
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol</Label>
                  <Combobox
                    options={getSymbolsByExchange(formData.exchange)}
                    value={formData.symbol}
                    onValueChange={(value) => setFormData({ ...formData, symbol: value })}
                    placeholder="Search or select symbol..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Symbols filtered by selected exchange
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeframe">Timeframe</Label>
                  <Select
                    value={formData.timeframe}
                    onValueChange={(value) => setFormData({ ...formData, timeframe: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1min">1 Minute</SelectItem>
                      <SelectItem value="5min">5 Minutes</SelectItem>
                      <SelectItem value="15min">15 Minutes</SelectItem>
                      <SelectItem value="30min">30 Minutes</SelectItem>
                      <SelectItem value="1hour">1 Hour</SelectItem>
                      <SelectItem value="4hour">4 Hours</SelectItem>
                      <SelectItem value="1day">1 Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="strategyType">Strategy</Label>
                  <Select
                    value={formData.strategyType}
                    onValueChange={(value) => setFormData({ ...formData, strategyType: value as 'ema-only' | 'ema-rsi' | 'ema-rsi-trend' | 'mean-reversion' | 'momentum' | 'multi-timeframe-trend' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ema-only">EMA Crossover Only</SelectItem>
                      <SelectItem value="ema-rsi">EMA + RSI Filter</SelectItem>
                      <SelectItem value="ema-rsi-trend">EMA + RSI + Trend</SelectItem>
                      <SelectItem value="mean-reversion">Mean Reversion (Bollinger Bands + RSI)</SelectItem>
                      <SelectItem value="momentum">Momentum (Price + Volume)</SelectItem>
                      <SelectItem value="multi-timeframe-trend">Multi-Timeframe Trend</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.strategyType === 'ema-only' && 'Simple EMA crossover - can produce many false signals'}
                    {formData.strategyType === 'ema-rsi' && 'EMA crossover filtered by RSI - reduces false signals'}
                    {formData.strategyType === 'ema-rsi-trend' && 'EMA + RSI with trend confirmation - most conservative'}
                    {formData.strategyType === 'mean-reversion' && 'Buy oversold, sell overbought - works best in ranging markets'}
                    {formData.strategyType === 'momentum' && 'Follows strong price momentum with volume confirmation'}
                    {formData.strategyType === 'multi-timeframe-trend' && 'Uses longer timeframe trend filter for better entries'}
                  </p>
                </div>

                {(formData.strategyType === 'ema-rsi' || formData.strategyType === 'ema-rsi-trend') && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rsiPeriod">RSI Period</Label>
                        <Input
                          id="rsiPeriod"
                          type="number"
                          value={formData.rsiPeriod}
                          onChange={(e) => setFormData({ ...formData, rsiPeriod: parseInt(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rsiOverbought">Overbought</Label>
                        <Input
                          id="rsiOverbought"
                          type="number"
                          value={formData.rsiOverbought}
                          onChange={(e) => setFormData({ ...formData, rsiOverbought: parseInt(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rsiOversold">Oversold</Label>
                        <Input
                          id="rsiOversold"
                          type="number"
                          value={formData.rsiOversold}
                          onChange={(e) => setFormData({ ...formData, rsiOversold: parseInt(e.target.value) })}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fastMA">Fast MA</Label>
                    <Input
                      id="fastMA"
                      type="number"
                      value={formData.fastMA}
                      onChange={(e) => setFormData({ ...formData, fastMA: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slowMA">Slow MA</Label>
                    <Input
                      id="slowMA"
                      type="number"
                      value={formData.slowMA}
                      onChange={(e) => setFormData({ ...formData, slowMA: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="riskPercent">Risk per Trade (%)</Label>
                  <Input
                    id="riskPercent"
                    type="number"
                    step="0.1"
                    value={formData.riskPercent}
                    onChange={(e) => setFormData({ ...formData, riskPercent: parseFloat(e.target.value) })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stopLossPips">Stop Loss (pips)</Label>
                    <Input
                      id="stopLossPips"
                      type="number"
                      step="0.1"
                      value={formData.stopLossPips}
                      onChange={(e) => setFormData({ ...formData, stopLossPips: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="takeProfitPips">Take Profit (pips)</Label>
                    <Input
                      id="takeProfitPips"
                      type="number"
                      step="0.1"
                      value={formData.takeProfitPips}
                      onChange={(e) => setFormData({ ...formData, takeProfitPips: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="initialBalance">Initial Balance ($)</Label>
                  <Input
                    id="initialBalance"
                    type="number"
                    value={formData.initialBalance}
                    onChange={(e) => setFormData({ ...formData, initialBalance: parseFloat(e.target.value) })}
                  />
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allowBuy"
                      checked={formData.allowBuy}
                      onCheckedChange={(checked) => setFormData({ ...formData, allowBuy: checked as boolean })}
                    />
                    <Label htmlFor="allowBuy" className="cursor-pointer">Allow Buy</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allowSell"
                      checked={formData.allowSell}
                      onCheckedChange={(checked) => setFormData({ ...formData, allowSell: checked as boolean })}
                    />
                    <Label htmlFor="allowSell" className="cursor-pointer">Allow Sell</Label>
                  </div>
                </div>

                <Button
                  onClick={handleRunBacktest}
                  disabled={loading}
                  className="w-full"
                  size="lg"
                >
                  {loading ? 'Running Backtest...' : 'Run Backtest'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Results */}
          <div className="lg:col-span-2 space-y-6">
            {result && (
              <>
                {/* Action Button */}
                <div className="flex justify-end mb-4">
                  <Button
                    onClick={handleCreateConfig}
                    disabled={creatingConfig}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {creatingConfig ? 'Creating...' : 'Create Config from Backtest'}
                  </Button>
                </div>

                {/* Strategy Info */}
                {result.strategyUsed && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Strategy Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Strategy:</span>
                          <span className="font-medium">
                            {result.strategyUsed === 'ema-only' && 'EMA Crossover Only'}
                            {result.strategyUsed === 'ema-rsi' && 'EMA + RSI Filter'}
                            {result.strategyUsed === 'ema-rsi-trend' && 'EMA + RSI + Trend'}
                            {result.strategyUsed === 'mean-reversion' && 'Mean Reversion (Bollinger Bands + RSI)'}
                            {result.strategyUsed === 'momentum' && 'Momentum (Price + Volume)'}
                            {result.strategyUsed === 'multi-timeframe-trend' && 'Multi-Timeframe Trend'}
                          </span>
                        </div>
                        {result.signalsFiltered !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Signals Filtered by RSI:</span>
                            <span className="font-medium">{result.signalsFiltered}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Total Profit</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${result.totalProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        ${result.totalProfit.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {result.totalProfitPercent.toFixed(2)}%
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Final Balance</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-foreground">
                        ${result.finalBalance.toFixed(2)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        from ${result.initialBalance.toFixed(2)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Win Rate</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-foreground">
                        {result.winRate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {result.winningTrades}W / {result.losingTrades}L
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Max Drawdown</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {result.maxDrawdownPercent.toFixed(2)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ${result.maxDrawdown.toFixed(2)}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Statistics */}
                <Card>
                  <CardHeader>
                    <CardTitle>Statistics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Total Trades</div>
                        <div className="text-xl font-semibold text-foreground">{result.totalTrades}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Winning Trades</div>
                        <div className="text-xl font-semibold text-green-600 dark:text-green-400">{result.winningTrades}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Losing Trades</div>
                        <div className="text-xl font-semibold text-red-600 dark:text-red-400">{result.losingTrades}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Sharpe Ratio</div>
                        <div className="text-xl font-semibold text-foreground">{result.sharpeRatio.toFixed(2)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Trades Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Trades ({result.trades.length})</CardTitle>
                    <CardDescription>All trades from the backtest</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Entry</TableHead>
                            <TableHead>Exit</TableHead>
                            <TableHead>Side</TableHead>
                            <TableHead>Entry Price</TableHead>
                            <TableHead>Exit Price</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Profit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.trades.map((trade, index) => (
                            <TableRow key={index}>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(trade.entryDate).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(trade.exitDate).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant={trade.side === 'buy' ? 'default' : 'secondary'}>
                                  {trade.side.toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell>${trade.entryPrice.toFixed(2)}</TableCell>
                              <TableCell>${trade.exitPrice.toFixed(2)}</TableCell>
                              <TableCell>{trade.size.toFixed(8)}</TableCell>
                              <TableCell>
                                <span
                                  className={
                                    trade.profit >= 0
                                      ? 'text-green-600 dark:text-green-400 font-semibold'
                                      : 'text-red-600 dark:text-red-400 font-semibold'
                                  }
                                >
                                  ${trade.profit.toFixed(2)} ({trade.profitPercent.toFixed(2)}%)
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {!result && !loading && (
              <Card>
                <CardContent className="flex items-center justify-center h-96">
                  <div className="text-center text-muted-foreground">
                    <p className="text-lg mb-2">No backtest results yet</p>
                    <p className="text-sm">Configure parameters and click &quot;Run Backtest&quot; to start</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

