'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import AIChatBot from '@/components/ai/AIChatBot'
import CommandPalette from './CommandPalette'
import { TimezoneProvider } from '@/contexts/TimezoneContext'
import { getActiveSectionId } from './nav-config'

const PUBLIC_PATHS = ['/login', '/auth/callback']
const KEY_OPEN_SECTION = 'dg-sidebar-compact'   // repurposed: stores last open section ID

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [ready, setReady]               = useState(false)
  const [openSection, setOpenSection]   = useState<string | null>(null)
  const [badges, setBadges]             = useState<Record<string, number>>({})
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  // ── Restore last open section (mount only) ───────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY_OPEN_SECTION)
      if (stored) setOpenSection(stored)
    } catch {}
  }, [])

  // ── Auth + set ready ───────────────────────────────────────────────────────

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const authRequired = process.env.NEXT_PUBLIC_AUTH_REQUIRED === 'true'
    if (!isPublic && authRequired && !token) {
      router.replace('/login')
      return
    }
    setReady(true)
  }, [pathname, isPublic, router])

  // ── Badge polling — 90s interval ─────────────────────────────────────────

  const loadBadges = useCallback(async (signal?: AbortSignal) => {
    try {
      const API   = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      if (!token) return
      const res = await fetch(`${API}/dashboard/global`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
      if (!res.ok) return
      const data = await res.json()
      setBadges({
        open_alerts:    data.open_alerts    ?? 0,
        pending_rules:  0,
        open_incidents: 0,
      })
    } catch (e: any) {
      if (e?.name === 'AbortError') return
    }
  }, [])

  useEffect(() => {
    if (isPublic) return
    const ctrl = new AbortController()
    loadBadges(ctrl.signal)
    const iv = setInterval(() => loadBadges(ctrl.signal), 90_000)
    return () => { ctrl.abort(); clearInterval(iv) }
  }, [loadBadges, isPublic])

  // ── Section change handler ────────────────────────────────────────────────

  const handleSectionChange = useCallback((id: string | null) => {
    setOpenSection(id)
    try { localStorage.setItem(KEY_OPEN_SECTION, id ?? '') } catch {}
  }, [])

  // ── Hamburger: toggle flyout for active section (or 'overview') ───────────

  const handleHamburgerClick = useCallback(() => {
    setOpenSection(prev => {
      if (prev !== null) {
        try { localStorage.setItem(KEY_OPEN_SECTION, '') } catch {}
        return null
      }
      const next = getActiveSectionId(pathname) ?? 'overview'
      try { localStorage.setItem(KEY_OPEN_SECTION, next) } catch {}
      return next
    })
  }, [pathname])

  if (isPublic) return <>{children}</>
  if (!ready)   return null

  return (
    <TimezoneProvider>
      <TopBar
        alertCount={badges.open_alerts ?? 0}
        onHamburgerClick={handleHamburgerClick}
      />
      <Sidebar
        badges={badges}
        openSection={openSection}
        onSectionChange={handleSectionChange}
      />
      <main className="main-content">
        {children}
      </main>
      <AIChatBot />
      <CommandPalette />
    </TimezoneProvider>
  )
}
