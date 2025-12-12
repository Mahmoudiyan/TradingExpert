'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface LockContextType {
  isLocked: boolean
  lock: () => void
  unlock: (password: string) => boolean
  autoLockEnabled: boolean
  setAutoLockEnabled: (enabled: boolean) => void
  autoLockTimeout: number
  setAutoLockTimeout: (timeout: number) => void
}

const LockContext = createContext<LockContextType | undefined>(undefined)

const UNLOCK_PASSWORD = 'Vahid6636!'
const STORAGE_KEY = 'trading-bot-lock-state'
const AUTO_LOCK_STORAGE_KEY = 'trading-bot-auto-lock'
const AUTO_LOCK_TIMEOUT_KEY = 'trading-bot-auto-lock-timeout'
const DEFAULT_AUTO_LOCK_TIMEOUT = 15 * 60 * 1000 // 15 minutes

export function LockProvider({ children }: { children: React.ReactNode }) {
  // Initialize state from localStorage using lazy initialization
  const [isLocked, setIsLocked] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedLockState = localStorage.getItem(STORAGE_KEY)
      // Only lock if explicitly set to 'locked', otherwise default to unlocked
      return savedLockState === 'locked'
    }
    return false // Start unlocked by default (user must manually lock)
  })
  
  const [autoLockEnabled, setAutoLockEnabledState] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedAutoLock = localStorage.getItem(AUTO_LOCK_STORAGE_KEY)
      return savedAutoLock !== null ? savedAutoLock === 'true' : true
    }
    return true
  })
  
  const [autoLockTimeout, setAutoLockTimeoutState] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTimeout = localStorage.getItem(AUTO_LOCK_TIMEOUT_KEY)
      return savedTimeout ? parseInt(savedTimeout, 10) : DEFAULT_AUTO_LOCK_TIMEOUT
    }
    return DEFAULT_AUTO_LOCK_TIMEOUT
  })
  
  const [lastActivity, setLastActivity] = useState<number>(() => {
    // Use function initializer to avoid calling Date.now() during render
    if (typeof window !== 'undefined') {
      return Date.now()
    }
    return 0
  })
  const autoLockTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  const lock = useCallback(() => {
    setIsLocked(true)
    localStorage.setItem(STORAGE_KEY, 'locked')
  }, [])

  // Track user activity
  useEffect(() => {
    if (!isLocked && autoLockEnabled) {
      const handleActivity = () => {
        setLastActivity(Date.now())
      }

      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
      events.forEach(event => {
        window.addEventListener(event, handleActivity, { passive: true })
      })

      return () => {
        events.forEach(event => {
          window.removeEventListener(event, handleActivity)
        })
      }
    }
  }, [isLocked, autoLockEnabled])

  // Auto-lock timer
  useEffect(() => {
    if (!isLocked && autoLockEnabled) {
      const checkAutoLock = () => {
        const timeSinceActivity = Date.now() - lastActivity
        if (timeSinceActivity >= autoLockTimeout) {
          lock()
        }
      }

      autoLockTimerRef.current = setInterval(checkAutoLock, 1000) // Check every second

      return () => {
        if (autoLockTimerRef.current) {
          clearInterval(autoLockTimerRef.current)
        }
      }
    } else {
      if (autoLockTimerRef.current) {
        clearInterval(autoLockTimerRef.current)
        autoLockTimerRef.current = null
      }
    }
  }, [isLocked, autoLockEnabled, autoLockTimeout, lastActivity, lock])

  const unlock = useCallback((password: string): boolean => {
    if (password === UNLOCK_PASSWORD) {
      setIsLocked(false)
      setLastActivity(Date.now())
      localStorage.setItem(STORAGE_KEY, 'unlocked')
      return true
    }
    return false
  }, [])

  const setAutoLockEnabled = useCallback((enabled: boolean) => {
    setAutoLockEnabledState(enabled)
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, enabled.toString())
  }, [])

  const setAutoLockTimeout = useCallback((timeout: number) => {
    setAutoLockTimeoutState(timeout)
    localStorage.setItem(AUTO_LOCK_TIMEOUT_KEY, timeout.toString())
  }, [])

  return (
    <LockContext.Provider
      value={{
        isLocked,
        lock,
        unlock,
        autoLockEnabled,
        setAutoLockEnabled,
        autoLockTimeout,
        setAutoLockTimeout,
      }}
    >
      {children}
    </LockContext.Provider>
  )
}

export function useLock() {
  const context = useContext(LockContext)
  if (context === undefined) {
    throw new Error('useLock must be used within a LockProvider')
  }
  return context
}

