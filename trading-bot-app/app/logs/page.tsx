'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Log {
  id: string
  level: string
  message: string
  data: unknown
  createdAt: string
}

export default function LogsPage() {
  const router = useRouter()
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  const fetchLogs = useCallback(async () => {
    try {
      const url = filter && filter !== 'all' ? `/api/logs?limit=200&level=${filter}` : '/api/logs?limit=200'
      const res = await fetch(url)
      const data = await res.json()
      setLogs(data)
    } catch (error) {
      console.error('Error fetching logs:', error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 5000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  const getLevelVariant = (level: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (level) {
      case 'error':
        return 'destructive'
      case 'warning':
        return 'outline'
      default:
        return 'default'
    }
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
          <h1 className="text-4xl font-bold text-foreground">Bot Logs</h1>
          <div className="flex gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => router.back()} variant="outline">
              Back
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Activity Logs</CardTitle>
            <CardDescription>Monitor bot activity, warnings, and errors</CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No logs yet</div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={getLevelVariant(log.level)}>
                            {log.level.toUpperCase()}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm text-foreground">{log.message}</div>
                        {log.data != null && (
                          <pre className="mt-2 text-xs bg-muted p-3 rounded-md overflow-x-auto text-foreground">
                            {typeof log.data === 'object' 
                              ? JSON.stringify(log.data, null, 2) 
                              : String(log.data)}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
