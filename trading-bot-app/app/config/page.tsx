'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Slider } from '@/components/ui/slider'
import { getSymbolsByExchange } from '@/lib/symbols'

interface BotConfig {
  id?: string
  exchange?: string
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
  maxBalancePercent?: number
  allowBuy: boolean
  allowSell: boolean
  isActive: boolean
  strategyType?: 'ema-only' | 'ema-rsi' | 'ema-rsi-trend' | 'mean-reversion' | 'momentum' | 'multi-timeframe-trend'
}

interface AccountBalance {
  balance: number
  currency: string
  availableBalance: number
  totalBalance: number
  exchange: string
}

export default function ConfigPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [configs, setConfigs] = useState<BotConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)

  useEffect(() => {
    fetchConfigs()
  }, [])

  // Check for config ID in URL query params (from backtest page)
  useEffect(() => {
    const configId = searchParams.get('id')
    if (configId && !loading) {
      setSelectedConfigId(configId)
      // Remove the query parameter from URL after reading it (only if configs are loaded)
      if (configs.length > 0) {
        router.replace('/config', { scroll: false })
      }
    }
  }, [searchParams, router, loading, configs])

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/config')
      const data = await res.json()
      setConfigs(data)
    } catch (error) {
      console.error('Error fetching configs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (config: BotConfig) => {
    setSaving(true)
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      await fetchConfigs()
      alert('Configuration saved!')
    } catch (error) {
      console.error('Error saving config:', error)
      alert('Error saving configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (configId: string | undefined) => {
    if (!configId) {
      alert('Cannot delete: Configuration ID is missing')
      return
    }

    // Confirm deletion
    if (!confirm('Are you sure you want to delete this configuration? This action cannot be undone.')) {
      return
    }

    try {
      const res = await fetch(`/api/config?id=${configId}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (res.ok && data.success) {
        await fetchConfigs()
        alert('Configuration deleted successfully!')
      } else {
        alert(data.error || 'Error deleting configuration')
      }
    } catch (error) {
      console.error('Error deleting config:', error)
      alert('Error deleting configuration')
    }
  }

  const defaultConfig: BotConfig = {
    exchange: 'KuCoin',
    symbol: 'BTC-USDT',
    fastMA: 9,
    slowMA: 21,
    timeframe: '4hour',
    riskPercent: 1.5,
    stopLossPips: 30,
    takeProfitPips: 75,
    maxDailyLoss: 4.0,
    maxDailyProfit: 8.0,
    maxSpreadPips: 3.0,
    maxBalancePercent: 50.0,
    allowBuy: true,
    allowSell: true,
    isActive: false,
    strategyType: 'ema-rsi',
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  // Find active config or use default
  // If a config ID is provided (from backtest), show that config instead
  const configToShow = selectedConfigId
    ? configs.find(c => c.id === selectedConfigId) || null
    : configs.find(c => c.isActive) || defaultConfig
  
  const activeConfig = configToShow || defaultConfig
  const hasActiveConfig = configs.some(c => c.isActive)
  const isShowingSelectedConfig = selectedConfigId !== null && configs.some(c => c.id === selectedConfigId)

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-foreground">Bot Configuration</h1>
          <Button onClick={() => router.back()} variant="outline">
            Back
          </Button>
        </div>

        {/* Show selected config, active config, or default form for creating new config */}
        {isShowingSelectedConfig && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              📋 Showing newly created configuration from backtest. Review and activate when ready.
            </p>
          </div>
        )}
        <ConfigForm 
          config={activeConfig} 
          onSave={handleSave} 
          saving={saving}
          isNewConfig={!hasActiveConfig && !isShowingSelectedConfig}
        />

        {/* Show other configs in a collapsed list (optional - can be removed if not needed) */}
        {configs.length > 1 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Other Configurations</h2>
            <div className="space-y-2">
              {configs
                .filter(c => !c.isActive)
                .map((config) => (
                  <Card key={config.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{config.symbol} on {config.exchange}</div>
                        <div className="text-sm text-muted-foreground">
                          {config.timeframe} • MA({config.fastMA}/{config.slowMA}) • Risk: {config.riskPercent}%
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // Activate this config
                            handleSave({ ...config, isActive: true })
                          }}
                        >
                          Activate
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(config.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConfigForm({ config, onSave, saving, isNewConfig = false }: { config: BotConfig; onSave: (config: BotConfig) => void; saving: boolean; isNewConfig?: boolean }) {
  const [formData, setFormData] = useState<BotConfig>(config)
  const [balance, setBalance] = useState<AccountBalance | null>(null)
  const [balanceExchange, setBalanceExchange] = useState<string>(config.exchange || 'KuCoin')
  const [refreshingBalance, setRefreshingBalance] = useState(false)
  
  // Update formData when config prop changes (e.g., when a different config is activated)
  useEffect(() => {
    setFormData(config)
    setBalanceExchange(config.exchange || 'KuCoin')
  }, [config])
  
  // Get symbols filtered by selected exchange
  const availableSymbols = getSymbolsByExchange(formData.exchange || 'KuCoin')
  
  // Reset symbol if it's not available in the selected exchange
  const handleExchangeChange = (exchange: string) => {
    const newSymbols = getSymbolsByExchange(exchange)
    const currentSymbol = formData.symbol
    const isSymbolAvailable = newSymbols.some(s => s.value === currentSymbol)
    
    setFormData({
      ...formData,
      exchange,
      symbol: isSymbolAvailable ? currentSymbol : (newSymbols[0]?.value || ''),
    })
    setBalanceExchange(exchange)
    setBalance(null)
  }

  const fetchBalance = async () => {
    setRefreshingBalance(true)
    try {
      const params = new URLSearchParams()
      params.append('exchange', balanceExchange)
      const res = await fetch(`/api/balance?${params.toString()}`)
      const data = await res.json()
      if (!data.error) {
        setBalance(data)
        if (data.exchange) {
          setBalanceExchange(data.exchange)
        }
      }
    } catch (error) {
      console.error('Error fetching balance:', error)
    } finally {
      setRefreshingBalance(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNewConfig ? 'New Configuration' : 'Active Configuration'}</CardTitle>
        <CardDescription>
          {isNewConfig 
            ? 'Set up your trading bot parameters. Make sure to mark as Active when ready.'
            : 'Current active trading bot configuration. Changes will be saved immediately.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSave(formData)
          }}
          className="space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="exchange">Exchange</Label>
              <Select
                value={formData.exchange || 'KuCoin'}
                onValueChange={handleExchangeChange}
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
                Select the exchange to use for trading
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              <Combobox
                options={availableSymbols}
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
              <Label htmlFor="strategyType">Strategy (for backtesting)</Label>
              <Select
                value={formData.strategyType || 'ema-rsi'}
                onValueChange={(value) => setFormData({ ...formData, strategyType: value as BotConfig['strategyType'] })}
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
                Note: Strategy selection is primarily for backtesting. Live trading currently uses EMA crossover.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fastMA">Fast MA Period</Label>
              <Input
                id="fastMA"
                type="number"
                value={formData.fastMA}
                onChange={(e) => setFormData({ ...formData, fastMA: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slowMA">Slow MA Period</Label>
              <Input
                id="slowMA"
                type="number"
                value={formData.slowMA}
                onChange={(e) => setFormData({ ...formData, slowMA: parseInt(e.target.value) })}
              />
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

            <div className="space-y-2">
              <Label htmlFor="maxDailyLoss">Max Daily Loss (%)</Label>
              <Input
                id="maxDailyLoss"
                type="number"
                step="0.1"
                value={formData.maxDailyLoss}
                onChange={(e) => setFormData({ ...formData, maxDailyLoss: parseFloat(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxDailyProfit">Max Daily Profit (%)</Label>
              <Input
                id="maxDailyProfit"
                type="number"
                step="0.1"
                value={formData.maxDailyProfit}
                onChange={(e) => setFormData({ ...formData, maxDailyProfit: parseFloat(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxSpreadPips">Max Spread (pips)</Label>
              <Input
                id="maxSpreadPips"
                type="number"
                step="0.1"
                value={formData.maxSpreadPips}
                onChange={(e) => setFormData({ ...formData, maxSpreadPips: parseFloat(e.target.value) })}
              />
            </div>

          </div>

          {/* Risk Management Section */}
          <div className="pt-6 border-t space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Risk Management</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Configure risk settings and trading limits. Connect your exchange to see calculated values.
              </p>
              
              {/* Balance Connection */}
              <div className="mb-6 p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="balanceExchange">Exchange for Balance Calculation</Label>
                    <Select
                      value={balanceExchange}
                      onValueChange={(value) => {
                        setBalanceExchange(value)
                        setBalance(null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="KuCoin">KuCoin (Crypto - USDT)</SelectItem>
                        <SelectItem value="OANDA">OANDA (Forex - USD)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      onClick={fetchBalance}
                      disabled={refreshingBalance}
                      variant="outline"
                    >
                      {refreshingBalance ? 'Loading...' : 'Load Balance'}
                    </Button>
                  </div>
                </div>
                {balance && (
                  <div className="text-sm text-muted-foreground">
                    Total Balance: <span className="font-semibold text-foreground">{balance.totalBalance.toFixed(2)} {balance.currency}</span>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="maxBalancePercent">
                      Max Balance for Trading: {formData.maxBalancePercent || 50}%
                    </Label>
                    {balance && (
                      <span className="text-sm text-muted-foreground">
                        {(balance.totalBalance * ((formData.maxBalancePercent || 50) / 100)).toFixed(2)} {balance.currency}
                      </span>
                    )}
                  </div>
                  <Slider
                    id="maxBalancePercent"
                    value={formData.maxBalancePercent || 50}
                    onValueChange={(value) => setFormData({ ...formData, maxBalancePercent: value })}
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
                      Risk per Trade: {formData.riskPercent}%
                    </Label>
                  </div>
                  <Slider
                    id="riskPercent"
                    value={formData.riskPercent}
                    onValueChange={(value) => setFormData({ ...formData, riskPercent: value })}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="maxDailyLoss">
                        Max Daily Loss: {formData.maxDailyLoss}%
                      </Label>
                    </div>
                    <Slider
                      id="maxDailyLoss"
                      value={formData.maxDailyLoss}
                      onValueChange={(value) => setFormData({ ...formData, maxDailyLoss: value })}
                      min={1}
                      max={10}
                      step={0.5}
                    />
                    {balance && (
                      <div className="text-xs text-muted-foreground">
                        Limit: {(balance.totalBalance * (formData.maxDailyLoss / 100)).toFixed(2)} {balance.currency}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="maxDailyProfit">
                        Max Daily Profit: {formData.maxDailyProfit}%
                      </Label>
                    </div>
                    <Slider
                      id="maxDailyProfit"
                      value={formData.maxDailyProfit}
                      onValueChange={(value) => setFormData({ ...formData, maxDailyProfit: value })}
                      min={5}
                      max={20}
                      step={0.5}
                    />
                    {balance && (
                      <div className="text-xs text-muted-foreground">
                        Target: {(balance.totalBalance * (formData.maxDailyProfit / 100)).toFixed(2)} {balance.currency}
                      </div>
                    )}
                  </div>
                </div>

                {balance && (
                  <div className="pt-4 border-t">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Daily Loss Limit</div>
                        <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                          {(balance.totalBalance * (formData.maxDailyLoss / 100)).toFixed(2)} {balance.currency}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Daily Profit Target</div>
                        <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                          {(balance.totalBalance * (formData.maxDailyProfit / 100)).toFixed(2)} {balance.currency}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-4 border-t">
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
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked as boolean })}
              />
              <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
