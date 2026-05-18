'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { formatTs as _formatTs, formatTime as _formatTime, tzAbbr } from '@/utils/dateFormat'

const STORAGE_KEY = 'dq-display-timezone'
const DEFAULT_TZ = 'America/Los_Angeles'

interface TimezoneContextValue {
  timezone: string
  abbr: string
  formatTs: (iso: string | null | undefined, opts?: { dateOnly?: boolean; withSeconds?: boolean; yearAlways?: boolean }) => string
  formatTime: (date: Date) => string
  setTimezone: (tz: string) => void
}

const TimezoneContext = createContext<TimezoneContextValue>({
  timezone: DEFAULT_TZ,
  abbr: 'PST',
  formatTs: (iso) => _formatTs(iso, DEFAULT_TZ),
  formatTime: (date) => _formatTime(date, DEFAULT_TZ),
  setTimezone: () => {},
})

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTzState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_TZ
    }
    return DEFAULT_TZ
  })

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    fetch(`${apiBase}/config/public/display-timezone`)
      .then(r => r.json())
      .then(data => {
        if (data?.timezone) {
          setTzState(data.timezone)
          localStorage.setItem(STORAGE_KEY, data.timezone)
        }
      })
      .catch(() => {})
  }, [])

  const setTimezone = (tz: string) => {
    setTzState(tz)
    localStorage.setItem(STORAGE_KEY, tz)
  }

  const value: TimezoneContextValue = {
    timezone,
    abbr: tzAbbr(timezone),
    formatTs: (iso, opts) => _formatTs(iso, timezone, opts),
    formatTime: (date) => _formatTime(date, timezone),
    setTimezone,
  }

  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  )
}

export function useTimezone() {
  return useContext(TimezoneContext)
}
