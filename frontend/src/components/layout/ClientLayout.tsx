'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import AIChatBot from '@/components/ai/AIChatBot'
import CommandPalette from './CommandPalette'
import { TimezoneProvider } from '@/contexts/TimezoneContext'

const PUBLIC_PATHS = ['/login', '/auth/callback']

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  // Mirror the sidebar compact state so main-content margin transitions with it
  const [sidebarCompact, setSidebarCompact] = useState(false)
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const authRequired = process.env.NEXT_PUBLIC_AUTH_REQUIRED === 'true'
    if (!isPublic && authRequired && !token) {
      router.replace('/login')
      return
    }
    setReady(true)
    // Sync sidebar compact state from localStorage
    try { setSidebarCompact(localStorage.getItem('dqg-sidebar-compact') === 'true') } catch {}
  }, [pathname, isPublic, router])

  // Listen for sidebar compact toggle via storage events
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'dqg-sidebar-compact') {
        setSidebarCompact(e.newValue === 'true')
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  if (isPublic) return <>{children}</>
  if (!ready)   return null

  return (
    <TimezoneProvider>
      <Sidebar />
      <main
        className="main-content"
        style={{ marginLeft: sidebarCompact ? '64px' : 'var(--sidebar-width)', transition: 'margin-left 0.3s ease' }}
      >
        {children}
      </main>
      <AIChatBot />
      <CommandPalette />
    </TimezoneProvider>
  )
}
