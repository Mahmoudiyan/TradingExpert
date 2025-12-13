'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useLock } from '@/contexts/LockContext'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function LockWrapper({ children }: { children: React.ReactNode }) {
  const { isLocked, unlock } = useLock()
  const router = useRouter()
  const pathname = usePathname()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)
  const prevIsLockedRef = useRef(isLocked)

  // Reset form state when lock state changes from unlocked to locked
  useEffect(() => {
    if (isLocked && !prevIsLockedRef.current) {
      // Lock state changed from false to true - reset form
      queueMicrotask(() => {
        setPassword('')
        setError('')
        setIsUnlocking(false)
      })
    }
    prevIsLockedRef.current = isLocked
  }, [isLocked])

  // Prevent access to internal pages when locked
  useEffect(() => {
    if (isLocked && pathname !== '/') {
      router.replace('/')
    }
  }, [isLocked, pathname, router])

  const handleUnlock = async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    const trimmedPassword = password.trim()
    if (!trimmedPassword) {
      setError('Please enter a password')
      return
    }

    setError('')
    setIsUnlocking(true)

    // Small delay for better UX
    await new Promise(resolve => setTimeout(resolve, 100))

    if (unlock(trimmedPassword)) {
      setPassword('')
      setError('')
    } else {
      setError('Incorrect password')
      setPassword('')
    }

    setIsUnlocking(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUnlock()
    }
  }

  return (
    <>
      <div
        className={cn(
          'transition-all duration-300',
          isLocked && 'blur-sm opacity-30 pointer-events-none select-none'
        )}
        style={{
          filter: isLocked ? 'blur(8px)' : 'none',
        }}
      >
        {children}
      </div>

      {isLocked && (
        <Dialog open={true} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Page Locked</DialogTitle>
              <DialogDescription>
                Enter password to unlock the application
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  onKeyPress={handleKeyPress}
                  autoFocus
                  disabled={isUnlocking}
                  className={error ? 'border-destructive' : ''}
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isUnlocking}
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

