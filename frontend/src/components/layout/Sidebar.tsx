'use client'
import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Globe, Database, Shield, Calendar, Bell, ClipboardList,
  PlayCircle, Settings, FolderKanban, LogOut, User, Sun, Moon,
  BrainCircuit, HelpCircle, Search, BookOpen, Package, FileText, Sparkles,
  AlertOctagon, ShoppingBag, BarChart2, ChevronDown, ChevronRight,
  PanelLeftClose, PanelLeftOpen, Zap, Lock, Eye, Trash2,
  Layers, Gavel, Cpu,
} from 'lucide-react'
import clsx from 'clsx'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useTheme } from './ThemeProvider'

// ── Types ──────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  badgeKey?: string
  /** If set, clicking fires this action instead of navigating */
  action?: () => void
}

interface NavSection {
  id: string
  label: string
  icon: React.ElementType
  items: NavItem[]
  adminOnly?: boolean
}

// ── Navigation structure ───────────────────────────────────────────────────────

const NAV: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Globe,
    items: [
      { href: '/dashboard/global', label: 'Global Dashboard',       icon: Globe },
      { href: '/executive',        label: 'Cost Impact Dashboard',  icon: BarChart2 },
    ],
  },
  {
    id: 'quality',
    label: 'Data Quality',
    icon: Shield,
    items: [
      { href: '/rules',     label: 'Rules',          icon: Shield,     badgeKey: 'pending_rules' },
      { href: '/assets',    label: 'Data Assets',    icon: Database },
      { href: '/schedules', label: 'Schedules',      icon: Calendar },
      { href: '/runs',      label: 'Execution Logs', icon: PlayCircle },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: Bell,
    items: [
      { href: '/alerts', label: 'Alerts',     icon: Bell,          badgeKey: 'open_alerts' },
      { href: '/audit',  label: 'Audit Logs', icon: ClipboardList },
    ],
  },
  {
    id: 'catalog',
    label: 'Data Catalog',
    icon: Search,
    items: [
      { href: '/catalog',       label: 'Data Catalog',  icon: Search },
      { href: '/glossary',      label: 'Glossary',      icon: BookOpen },
      { href: '/data-products', label: 'Data Products', icon: Package },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    icon: Gavel,
    items: [
      { href: '/governance',  label: 'Governance Hub',   icon: Layers },
      { href: '/contracts',   label: 'Data Contracts',   icon: FileText },
      { href: '/incidents',   label: 'Incidents',        icon: AlertOctagon, badgeKey: 'open_incidents' },
      { href: '/marketplace', label: 'Rule Marketplace', icon: ShoppingBag },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy & Compliance',
    icon: Lock,
    items: [
      { href: '/compliance',  label: 'Compliance',       icon: Shield },
    ],
  },
  {
    id: 'ai',
    label: 'AI Intelligence',
    icon: Cpu,
    items: [
      {
        href: '#copilot',
        label: 'AI Copilot',
        icon: Sparkles,
        action: () => window.dispatchEvent(new CustomEvent('open-ai-copilot')),
      },
      { href: '/ai-assistant', label: 'AI Assistant', icon: BrainCircuit },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    icon: HelpCircle,
    items: [
      { href: '/help', label: 'Help & Reference', icon: HelpCircle },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: Settings,
    adminOnly: true,
    items: [
      { href: '/admin/domains',  label: 'Domain Management', icon: FolderKanban },
      { href: '/admin/users',    label: 'User Management',   icon: User },
      { href: '/admin/cleanup',  label: 'Data Cleanup',      icon: Trash2 },
      { href: '/settings',       label: 'Settings',          icon: Settings },
    ],
  },
]

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  admin:        { label: 'Admin',        color: 'bg-red-100 text-red-700' },
  domain_owner: { label: 'Domain Owner', color: 'bg-purple-100 text-purple-700' },
  data_owner:   { label: 'Data Owner',   color: 'bg-blue-100 text-blue-700' },
  viewer:       { label: 'Viewer',       color: 'bg-gray-100 text-gray-600' },
  auditor:      { label: 'Auditor',      color: 'bg-amber-100 text-amber-700' },
}

const AVATAR_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-pink-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-cyan-500 to-blue-600',
]

function getAvatarColor(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// ── Sidebar storage keys ───────────────────────────────────────────────────────

const KEY_COLLAPSED = 'dg-sidebar-collapsed'
const KEY_SECTIONS  = 'dg-sidebar-sections'
const KEY_COMPACT   = 'dg-sidebar-compact'

// ── Main component ─────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const user     = useCurrentUser()
  const { theme, toggle } = useTheme()

  // Sidebar-wide compact (icon-only) mode
  const [compact, setCompact]           = useState(false)
  // Per-section collapsed state
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  // Live badge counts
  const [badges, setBadges]             = useState<Record<string, number>>({})
  // Environment label
  const env = (process.env.NEXT_PUBLIC_APP_ENV || 'local').toUpperCase()

  // ── Persist & restore ──────────────────────────────────────────────────────

  useEffect(() => {
    try {
      setCompact(localStorage.getItem(KEY_COMPACT) === 'true')
      const raw = localStorage.getItem(KEY_SECTIONS)
      if (raw) setCollapsedSections(new Set(JSON.parse(raw)))
    } catch {}
  }, [])

  const toggleCompact = useCallback(() => {
    setCompact(prev => {
      const next = !prev
      try { localStorage.setItem(KEY_COMPACT, String(next)) } catch {}
      return next
    })
  }, [])

  const toggleSection = useCallback((id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem(KEY_SECTIONS, JSON.stringify([...next])) } catch {}
      return next
    })
  }, [])

  // ── Live badge counts — fetched with AbortController, 90-s poll ─────────────

  const loadBadges = useCallback(async (signal?: AbortSignal) => {
    try {
      const API    = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const token  = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      if (!token) return                                    // skip if not authenticated
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
      const opts = { headers, signal }

      // Single dashboard/summary call is cheaper than 3 individual list calls
      const res = await fetch(`${API}/dashboard/global`, opts)
      if (!res.ok) return
      const data = await res.json()

      setBadges({
        open_alerts:    data.open_alerts     ?? 0,
        pending_rules:  0,                               // no single field; keep 0
        open_incidents: 0,
      })
    } catch (e: any) {
      if (e?.name === 'AbortError') return               // ignore cancellation
    }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    loadBadges(ctrl.signal)
    const iv = setInterval(() => loadBadges(ctrl.signal), 90_000)  // 90s — halved API load
    return () => { ctrl.abort(); clearInterval(iv) }
  }, [loadBadges])

  // ── Auth ───────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    router.push('/login')
  }

  const visibleSections = useMemo(
    () => NAV.filter(s => s.adminOnly ? user?.role === 'admin' : true),
    [user?.role]
  )

  // ── Derived (memoized) ─────────────────────────────────────────────────────

  const totalBadges    = useMemo(() => Object.values(badges).reduce((a, b) => a + b, 0), [badges])
  const avatarGradient = useMemo(() => user ? getAvatarColor(user.full_name) : AVATAR_COLORS[0], [user?.full_name])
  const initials       = useMemo(() => user ? getInitials(user.full_name) : '??', [user?.full_name])
  const roleConfig     = useMemo(
    () => user ? (ROLE_CONFIG[user.role] ?? { label: user.role, color: 'bg-gray-100 text-gray-600' }) : null,
    [user?.role]
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <aside className={clsx(
      'sidebar flex flex-col',
      'transition-[width] duration-300 ease-in-out',
      compact ? 'sidebar--compact' : ''
    )}>

      {/* ── Brand header ── */}
      <div className="shrink-0 relative overflow-hidden" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>

        {/* 3-stop gradient accent stripe */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-indigo-400 via-violet-500 to-purple-600" />

        {compact ? (
          /* ── Compact: centred logo + collapse button ── */
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="w-9 h-9 rounded-xl overflow-hidden shadow-lg ring-1 ring-black/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-icon.svg" alt="DG" width={36} height={36} className="w-full h-full" />
            </div>
            <button
              onClick={toggleCompact}
              title="Expand sidebar"
              className="p-1.5 rounded-lg transition-colors [color:var(--sidebar-subtle)] hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]"
            >
              <PanelLeftOpen size={14} />
            </button>
          </div>
        ) : (
          /* ── Expanded: full brand block ── */
          <div className="px-4 pt-5 pb-4">

            {/* Row 1: logo + wordmark + collapse */}
            <div className="flex items-center gap-3">

              {/* Logo — larger, crisper */}
              <div className="shrink-0 w-10 h-10 rounded-xl overflow-hidden shadow-lg ring-1 ring-black/8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-icon.svg"
                  alt="Data Guardian"
                  width={40} height={40}
                  className="w-full h-full"
                  style={{ imageRendering: 'crisp-edges' }}
                />
              </div>

              {/* Wordmark */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-extrabold leading-tight tracking-[-0.4px] whitespace-nowrap">
                  <span style={{ color: 'var(--sidebar-text)' }}>Data </span>
                  <span style={{ color: '#F59E0B' }}>Guardian</span>
                </p>
                <p className="text-[10px] font-medium mt-0.5 truncate" style={{ color: 'var(--sidebar-subtle)' }}>
                  Enterprise Platform
                </p>
              </div>

              {/* Collapse button */}
              <button
                onClick={toggleCompact}
                title="Collapse sidebar"
                className="shrink-0 p-1.5 rounded-lg transition-colors [color:var(--sidebar-subtle)] hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>

            {/* Row 2: env badge + alert pill */}
            <div className="flex items-center gap-2 mt-2.5">
              <span className={clsx(
                'text-[9px] font-extrabold px-2 py-0.5 rounded tracking-[0.1em] uppercase',
                env === 'PROD' || env === 'PRODUCTION'
                  ? 'bg-emerald-100 text-emerald-700'
                  : env === 'STAGING'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-blue-100 text-blue-700'
              )}>
                {env}
              </span>
              {totalBadges > 0 && (
                <span className="flex items-center gap-1 text-[9px] font-bold text-red-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                  {totalBadges} active
                </span>
              )}
              <span className="ml-auto text-[9px]" style={{ color: 'var(--sidebar-subtle)' }}>v3.0</span>
            </div>

            {/* Row 3: quick search */}
            <button
              onClick={() => window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
              )}
              className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] transition-colors border [border-color:var(--sidebar-border)] [color:var(--sidebar-subtle)] hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]"
            >
              <Search size={11} />
              <span className="flex-1 text-left">Quick search…</span>
              <kbd className="text-[9px] font-mono opacity-40 bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">⌘K</kbd>
            </button>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {visibleSections.map(section => {
          const isCollapsed = collapsedSections.has(section.id)
          const SectionIcon = section.icon

          // Section-level active: any child is active
          const sectionActive = section.items.some(item =>
            pathname === item.href || pathname.startsWith(item.href + '/')
          )

          // Section-level badge: sum of all item badges
          const sectionBadge = section.items.reduce((sum, item) =>
            sum + (item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0), 0
          )

          return (
            <div key={section.id} className={clsx('mb-0.5', compact && 'px-1')}>

              {/* Section header */}
              {!compact ? (
                <button
                  onClick={() => toggleSection(section.id)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest transition-colors',
                    sectionActive
                      ? '[color:var(--sidebar-active-text)]'
                      : '[color:var(--sidebar-subtle)] hover:[color:var(--sidebar-text)]'
                  )}
                >
                  <SectionIcon size={11} className="shrink-0" />
                  <span className="flex-1 text-left">{section.label}</span>
                  {sectionBadge > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                      {sectionBadge}
                    </span>
                  )}
                  <span className={clsx('transition-transform duration-200', isCollapsed && '-rotate-90')}>
                    <ChevronDown size={11} />
                  </span>
                </button>
              ) : (
                /* Compact: tiny divider line between sections */
                <div className="my-1 mx-2 h-px" style={{ backgroundColor: 'var(--sidebar-border)' }} />
              )}

              {/* Section items */}
              {!isCollapsed && (
                <div className={clsx('space-y-0.5', !compact && 'mt-0.5')}>
                  {section.items.map(({ href, label, icon: Icon, badgeKey, action }) => {
                    const active = !action && (pathname === href || pathname.startsWith(href + '/'))
                    const badgeCount = badgeKey ? (badges[badgeKey] ?? 0) : 0

                    const itemCls = clsx(
                      'flex items-center gap-2.5 rounded-lg text-[13px] transition-all cursor-pointer',
                      compact ? 'justify-center p-2.5 mx-auto' : 'px-3 py-2 mx-1',
                      active
                        ? '[background-color:var(--sidebar-active-bg)] [color:var(--sidebar-active-text)] font-semibold shadow-sm'
                        : '[color:var(--sidebar-muted)] hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]'
                    )

                    const inner = (
                      <>
                        <span className="relative shrink-0">
                          <Icon size={15} />
                          {active && !compact && (
                            <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.7)]" />
                          )}
                        </span>
                        {!compact && (
                          <>
                            <span className="flex-1 truncate">{label}</span>
                            {badgeCount > 0 && (
                              <span className="text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 bg-red-500 text-white">
                                {badgeCount > 99 ? '99+' : badgeCount}
                              </span>
                            )}
                            {active && <ChevronRight size={12} className="opacity-50 shrink-0" />}
                          </>
                        )}
                        {compact && badgeCount > 0 && (
                          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500" />
                        )}
                      </>
                    )

                    return action ? (
                      <button
                        key={href}
                        onClick={action}
                        title={compact ? label : undefined}
                        className={itemCls}
                      >
                        {inner}
                      </button>
                    ) : (
                      <Link
                        key={href}
                        href={href}
                        title={compact ? label : undefined}
                        className={itemCls}
                      >
                        {inner}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="shrink-0 px-2 pb-3 pt-2 space-y-1" style={{ borderTop: '1px solid var(--sidebar-border)' }}>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          className={clsx(
            'w-full flex items-center gap-2 rounded-lg transition-colors text-[12px] font-medium',
            compact ? 'justify-center p-2.5' : 'px-3 py-2',
            '[color:var(--sidebar-muted)] hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]'
          )}
        >
          {theme === 'light'
            ? <Moon  size={14} className="text-indigo-400 shrink-0" />
            : <Sun   size={14} className="text-yellow-400 shrink-0" />}
          {!compact && (
            <>
              <span className="flex-1 text-left">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
              <span className="text-[10px] opacity-40">{theme === 'light' ? 'Off' : 'On'}</span>
            </>
          )}
        </button>

        {/* User profile card */}
        {user && (
          <div className={clsx(
            'rounded-xl p-2 transition-colors',
            '[background-color:var(--sidebar-hover)]',
            compact ? 'flex justify-center' : 'flex items-center gap-2.5'
          )}>
            {/* Avatar */}
            <div className={clsx(
              `bg-gradient-to-br ${avatarGradient}`,
              'rounded-lg flex items-center justify-center text-white font-bold shrink-0',
              compact ? 'w-8 h-8 text-[11px]' : 'w-8 h-8 text-[11px]'
            )}>
              {initials}
            </div>

            {!compact && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold truncate leading-tight"
                     style={{ color: 'var(--sidebar-text)' }}>
                    {user.full_name}
                  </p>
                  {roleConfig && (
                    <span className={clsx(
                      'inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded mt-0.5',
                      roleConfig.color
                    )}>
                      {roleConfig.label}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="shrink-0 p-1 rounded-lg transition-colors [color:var(--sidebar-subtle)] hover:text-red-500 hover:[background-color:var(--sidebar-active-bg)]"
                >
                  <LogOut size={13} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Version / build info */}
        {!compact && (
          <p className="text-[9px] px-1 pt-0.5 flex items-center gap-1.5"
             style={{ color: 'var(--sidebar-subtle)' }}>
            <Zap size={9} className="text-blue-400" />
            Data Guardian v3.0
            <span className="ml-auto opacity-50">© 2026</span>
          </p>
        )}
      </div>
    </aside>
  )
}
