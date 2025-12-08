'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
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

export default function ConfigPage() {
  const router = useRouter()
  const [configs, setConfigs] = useState<BotConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchConfigs()
  }, [])

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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-foreground">Bot Configuration</h1>
          <Button onClick={() => router.back()} variant="outline">
            Back
          </Button>
        </div>

        <ConfigForm config={defaultConfig} onSave={handleSave} saving={saving} />

        {configs.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Existing Configurations</h2>
            {configs.map((config) => (
              <ConfigForm
                key={config.id}
                config={config}
                onSave={handleSave}
                saving={saving}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConfigForm({ config, onSave, saving }: { config: BotConfig; onSave: (config: BotConfig) => void; saving: boolean }) {
  const [formData, setFormData] = useState<BotConfig>(config)
  
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
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
        <CardDescription>Set up your trading bot parameters</CardDescription>
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

            <div className="space-y-2">
              <Label htmlFor="maxBalancePercent">Max Balance for Trading (%)</Label>
              <Input
                id="maxBalancePercent"
                type="number"
                step="1"
                min="10"
                max="100"
                value={formData.maxBalancePercent || 50}
                onChange={(e) => setFormData({ ...formData, maxBalancePercent: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Percentage of total account balance to allocate for trading (10-100%)
              </p>
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
