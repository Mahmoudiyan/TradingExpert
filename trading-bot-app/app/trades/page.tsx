'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface Trade {
  id: string
  orderId: string | null
  symbol: string
  side: string
  type: string
  price: number
  size: number
  status: string
  profit: number | null
  profitPercent: number | null
  openedAt: string
  closedAt: string | null
}

export default function TradesPage() {
  const router = useRouter()
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null)

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/trades?limit=100', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })
      
      if (!res.ok) {
        throw new Error(`Failed to fetch trades: ${res.status} ${res.statusText}`)
      }
      
      const data = await res.json()
      
      // Check if response contains an error field (API error)
      if (data.error) {
        throw new Error(data.error)
      }
      
      // Ensure data is an array
      if (Array.isArray(data)) {
        setTrades(data)
      } else {
        console.warn('Unexpected response format:', data)
        setTrades([])
      }
    } catch (error) {
      console.error('Error fetching trades:', error)
      // Don't clear trades on error - keep showing last known data
      // setTrades([]) // Uncomment if you want to clear on error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTrades()
    const interval = setInterval(fetchTrades, 10000)
    return () => clearInterval(interval)
  }, [fetchTrades])

  const handleCloseTrade = async (tradeId: string) => {
    if (!confirm('Are you sure you want to close this trade?')) {
      return
    }

    setClosingTradeId(tradeId)
    try {
      const res = await fetch(`/api/trades/${tradeId}/close`, {
        method: 'POST',
      })
      const data = await res.json()

      if (data.success) {
        // Refresh trades list
        await fetchTrades()
        alert('Trade closed successfully!')
      } else {
        alert(`Failed to close trade: ${data.error}`)
      }
    } catch (error) {
      console.error('Error closing trade:', error)
      alert('Error closing trade. Please try again.')
    } finally {
      setClosingTradeId(null)
    }
  }

  const isTradeOpen = (trade: Trade) => {
    return trade.status === 'pending' || trade.status === 'filled'
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
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-foreground">Trading History</h1>
          <Button onClick={() => router.back()} variant="outline">
            Back
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Trades</CardTitle>
            <CardDescription>All executed trades and their performance</CardDescription>
          </CardHeader>
          <CardContent>
            {trades.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No trades yet</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Profit</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="font-medium">{trade.symbol}</TableCell>
                        <TableCell>
                          <Badge variant={trade.side === 'buy' ? 'default' : 'secondary'}>
                            {trade.side.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>${trade.price.toFixed(2)}</TableCell>
                        <TableCell>{trade.size.toFixed(8)}</TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>
                          {trade.profit !== null && (
                            <span
                              className={
                                trade.profit >= 0
                                  ? 'text-green-600 dark:text-green-400 font-semibold'
                                  : 'text-red-600 dark:text-red-400 font-semibold'
                              }
                            >
                              ${trade.profit.toFixed(2)}
                              {trade.profitPercent !== null &&
                                ` (${trade.profitPercent.toFixed(2)}%)`}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(trade.openedAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {isTradeOpen(trade) && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCloseTrade(trade.id)}
                              disabled={closingTradeId === trade.id}
                            >
                              {closingTradeId === trade.id ? 'Closing...' : 'Close'}
                            </Button>
                          )}
                          {!isTradeOpen(trade) && (
                            <span className="text-muted-foreground text-sm">Closed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
