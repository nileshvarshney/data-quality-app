# YouTube-Style Navigation Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 260px full sidebar with a YouTube-style fixed top bar + 64px icon sidebar + overlay flyout panel, supporting dark and light themes.

**Architecture:** A new `TopBar` component sits fixed at the top. `Sidebar` is rewritten as a 64px icon strip that renders an absolutely-positioned flyout panel when an icon is clicked. `ClientLayout` hoists badge-polling and flyout-open state, passing both down as props. Main content `margin-left` is always `64px` — the flyout overlays without squeezing content.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, lucide-react, clsx

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/app/globals.css` | Modify | Add `--topbar-*` / `--flyout-*` CSS variables; add `.topbar`, `.icon-sidebar`, `.sidebar-nav-zone`, `.flyout-panel` classes; fix `.main-content` |
| `frontend/src/components/layout/nav-config.ts` | **Create** | Shared `NAV` array + `NavSection` / `NavItem` types (extracted from Sidebar) |
| `frontend/src/components/layout/TopBar.tsx` | **Create** | Fixed top bar: hamburger, logo, search (⌘K), bell badge, settings, user avatar dropdown |
| `frontend/src/components/layout/Sidebar.tsx` | Rewrite | 64px icon strip + absolute overlay flyout panel; mouseleave auto-hide |
| `frontend/src/components/layout/ClientLayout.tsx` | Modify | Hoist badge polling + `openSection` state; render `TopBar`; update `main-content` margin |

---

## Task 1: CSS foundation — variables and layout classes

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add topbar + flyout CSS variables to `:root` and `html.dark`**

Open `frontend/src/app/globals.css`. In the `:root` block (after existing sidebar variables, around line 36), add:

```css
  /* TopBar */
  --topbar-height: 52px;
  --topbar-bg:     #ffffff;
  --topbar-border: #e2e8f0;

  /* Flyout panel */
  --flyout-bg:     #ffffff;
  --flyout-border: #e2e8f0;

  /* Sidebar icon strip */
  --sidebar-icon-color: #cbd5e1;
```

In the `html.dark` block (after existing dark sidebar variables, around line 68), add:

```css
  --topbar-bg:     #141824;
  --topbar-border: #1e2235;

  --flyout-bg:     #141824;
  --flyout-border: #1e2235;

  --sidebar-icon-color: #334155;
```

- [ ] **Step 2: Replace `.sidebar` and `.main-content` classes with new layout classes**

Remove the existing `.sidebar`, `.sidebar--compact`, `.sidebar--compact .main-content-offset`, and `.main-content` blocks. Replace them with:

```css
/* ── Top bar ──────────────────────────────────────────────────────────────── */

.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  z-index: 30;
  background-color: var(--topbar-bg);
  border-bottom: 1px solid var(--topbar-border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

/* ── Sidebar nav zone (icon strip + flyout container) ─────────────────────── */

.sidebar-nav-zone {
  position: fixed;
  left: 0;
  top: var(--topbar-height);
  height: calc(100vh - var(--topbar-height));
  display: flex;
  z-index: 20;
}

.icon-sidebar {
  width: 64px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--sidebar-bg);
  border-right: 1px solid var(--sidebar-border);
}

/* ── Flyout panel ─────────────────────────────────────────────────────────── */

.flyout-panel {
  position: absolute;
  top: 0;
  left: 64px;
  width: 180px;
  height: 100%;
  background-color: var(--flyout-bg);
  border-right: 1px solid var(--flyout-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 15;
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.12);
}

.flyout-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px 7px;
  border-bottom: 1px solid var(--flyout-border);
  flex-shrink: 0;
}

.flyout-items {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

/* ── Main content ─────────────────────────────────────────────────────────── */

.main-content {
  margin-left: 64px;
  min-height: 100vh;
  padding-top: var(--topbar-height);
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors (CSS-only change).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat: add topbar/flyout CSS variables and layout classes for YouTube nav"
```

---

## Task 2: Extract shared nav config

**Files:**
- Create: `frontend/src/components/layout/nav-config.ts`

- [ ] **Step 1: Create nav-config.ts with shared types and NAV array**

Create `frontend/src/components/layout/nav-config.ts`:

```typescript
import {
  Globe, Database, Shield, Calendar, Bell, ClipboardList, ClipboardCheck,
  PlayCircle, Settings, FolderKanban, User, BrainCircuit, HelpCircle,
  Search, BookOpen, Package, FileText, Sparkles, AlertOctagon, ShoppingBag,
  BarChart2, Lock, Trash2, Layers, Gavel, Cpu,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  badgeKey?: string
  action?: () => void
}

export interface NavSection {
  id: string
  label: string
  icon: React.ElementType
  items: NavItem[]
  adminOnly?: boolean
}

export const NAV: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Globe,
    items: [
      { href: '/dashboard/global', label: 'Global Dashboard',      icon: Globe },
      { href: '/executive',        label: 'Cost Impact Dashboard', icon: BarChart2 },
    ],
  },
  {
    id: 'quality',
    label: 'Data Quality',
    icon: Shield,
    items: [
      { href: '/rules',               label: 'Rules',          icon: Shield,         badgeKey: 'pending_rules' },
      { href: '/rules/approval-queue',label: 'Approval Queue', icon: ClipboardCheck },
      { href: '/assets',              label: 'Data Assets',    icon: Database },
      { href: '/schedules',           label: 'Schedules',      icon: Calendar },
      { href: '/runs',                label: 'Execution Logs', icon: PlayCircle },
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
      { href: '/compliance', label: 'Compliance', icon: Shield },
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
      { href: '/admin/domains', label: 'Domain Management', icon: FolderKanban },
      { href: '/admin/users',   label: 'User Management',   icon: User },
      { href: '/admin/cleanup', label: 'Data Cleanup',      icon: Trash2 },
      { href: '/settings',      label: 'Settings',          icon: Settings },
    ],
  },
]

/** Returns the section ID whose items match the given pathname, or null. */
export function getActiveSectionId(pathname: string): string | null {
  for (const section of NAV) {
    if (section.items.some(
      item => !item.action && (pathname === item.href || pathname.startsWith(item.href + '/'))
    )) {
      return section.id
    }
  }
  return null
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/nav-config.ts
git commit -m "feat: extract shared nav config and getActiveSectionId utility"
```

---

## Task 3: Create TopBar component

**Files:**
- Create: `frontend/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Create TopBar.tsx**

Create `frontend/src/components/layout/TopBar.tsx`:

```tsx
'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Menu, Search, Bell, Settings, Sun, Moon, LogOut } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useTheme } from './ThemeProvider'

interface TopBarProps {
  alertCount: number
  onHamburgerClick: () => void
}

const AVATAR_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-pink-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-red-600',
  'from-cyan-500 to-blue-600',
]

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function TopBar({ alertCount, onHamburgerClick }: TopBarProps) {
  const router = useRouter()
  const user = useCurrentUser()
  const { theme, toggle } = useTheme()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const avatarGradient = useMemo(
    () => user ? getAvatarColor(user.full_name) : AVATAR_COLORS[0],
    [user?.full_name]
  )
  const initials = useMemo(
    () => user ? getInitials(user.full_name) : '??',
    [user?.full_name]
  )

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    router.push('/login')
  }

  const openCommandPalette = () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))

  return (
    <header className="topbar">

      {/* ── Left: hamburger + logo ── */}
      <div className="flex items-center gap-2.5 min-w-[180px]">
        <button
          onClick={onHamburgerClick}
          title="Toggle navigation"
          className="p-2 rounded-lg transition-colors hover:[background-color:var(--sidebar-hover)]"
          style={{ color: 'var(--text-3)' }}
        >
          <Menu size={18} />
        </button>
        <Link href="/dashboard/global" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg overflow-hidden bg-[#0f172a] flex items-center justify-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.svg" alt="DataGuardian" width={28} height={28} className="w-full h-full" />
          </div>
          <span
            className="text-[14px] font-extrabold tracking-[-0.3px] whitespace-nowrap"
            style={{ color: 'var(--text)' }}
          >
            Data<span className="text-amber-500">Guardian</span>
          </span>
        </Link>
      </div>

      {/* ── Center: search bar ── */}
      <div className="flex-1 max-w-[480px] mx-auto">
        <button
          onClick={openCommandPalette}
          className="w-full flex items-center gap-2 px-3.5 h-9 rounded-full border text-left transition-colors hover:opacity-80"
          style={{
            background: 'var(--surface-sub)',
            borderColor: 'var(--border)',
            color: 'var(--text-4)',
          }}
        >
          <Search size={13} className="shrink-0" />
          <span className="flex-1 text-[12px]">Search data assets, rules, alerts…</span>
          <kbd
            className="text-[10px] font-mono border px-1.5 py-0.5 rounded opacity-60 shrink-0"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ── Right: bell + settings + avatar ── */}
      <div className="flex items-center gap-2 min-w-[120px] justify-end">

        {/* Notification bell */}
        <button
          title={alertCount > 0 ? `${alertCount} open alerts` : 'Notifications'}
          className="relative w-9 h-9 rounded-full flex items-center justify-center transition-colors border hover:[background-color:var(--sidebar-hover)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
        >
          <Bell size={15} />
          {alertCount > 0 && (
            <span
              className="absolute top-[7px] right-[7px] w-2 h-2 rounded-full bg-red-500 border-2"
              style={{ borderColor: 'var(--topbar-bg)' }}
            />
          )}
        </button>

        {/* Settings */}
        <Link
          href="/settings"
          title="Settings"
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors border hover:[background-color:var(--sidebar-hover)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
        >
          <Settings size={15} />
        </Link>

        {/* User avatar + dropdown */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(p => !p)}
            title={user?.full_name ?? 'User menu'}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white bg-gradient-to-br ${avatarGradient} border-2`}
            style={{ borderColor: 'var(--sidebar-active-bg)' }}
          >
            {initials}
          </button>

          {userMenuOpen && (
            <>
              {/* backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              {/* menu */}
              <div
                className="absolute right-0 top-10 z-50 w-44 rounded-xl shadow-xl border py-1"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                {user && (
                  <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>
                      {user.full_name}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-3)' }}>
                      {user.role}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => { toggle(); setUserMenuOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors hover:[background-color:var(--sidebar-hover)]"
                  style={{ color: 'var(--text-2)' }}
                >
                  {theme === 'light'
                    ? <Moon size={13} className="text-indigo-400" />
                    : <Sun  size={13} className="text-yellow-400" />}
                  {theme === 'light' ? 'Dark mode' : 'Light mode'}
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors hover:text-red-500 hover:[background-color:var(--sidebar-hover)]"
                  style={{ color: 'var(--text-2)' }}
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/TopBar.tsx
git commit -m "feat: add TopBar with hamburger, search, bell badge, settings, user dropdown"
```

---

## Task 4: Rewrite Sidebar as icon strip + overlay flyout

**Files:**
- Rewrite: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar.tsx**

Replace the entire contents of `frontend/src/components/layout/Sidebar.tsx` with:

```tsx
'use client'
import { useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HelpCircle } from 'lucide-react'
import clsx from 'clsx'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { NAV, type NavSection } from './nav-config'

interface SidebarProps {
  badges: Record<string, number>
  openSection: string | null
  onSectionChange: (id: string | null) => void
}

export default function Sidebar({ badges, openSection, onSectionChange }: SidebarProps) {
  const pathname = usePathname()
  const user = useCurrentUser()
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visibleSections = useMemo(
    () => NAV.filter(s => !s.adminOnly || user?.role === 'admin'),
    [user?.role]
  )

  const activeSectionId = useMemo(() => {
    for (const s of visibleSections) {
      if (s.items.some(item => !item.action && (pathname === item.href || pathname.startsWith(item.href + '/')))) {
        return s.id
      }
    }
    return null
  }, [pathname, visibleSections])

  const flyoutSection: NavSection | null =
    visibleSections.find(s => s.id === openSection) ?? null

  const mainSections = visibleSections.filter(s => s.id !== 'support')
  const supportSection = visibleSections.find(s => s.id === 'support') ?? null
  const FlyoutSectionIcon = flyoutSection?.icon ?? null

  // ── Mouseleave auto-hide (150ms delay prevents flicker) ──────────────────

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => onSectionChange(null), 150)
  }, [onSectionChange])

  const handleIconClick = useCallback((sectionId: string) => {
    cancelClose()
    onSectionChange(openSection === sectionId ? null : sectionId)
  }, [openSection, onSectionChange, cancelClose])

  // ── Icon button renderer ──────────────────────────────────────────────────

  const renderIconBtn = (section: NavSection) => {
    const Icon = section.icon
    const isActive = activeSectionId === section.id
    const isOpen   = openSection === section.id
    const sectionBadge = section.items.reduce(
      (sum, item) => sum + (item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0), 0
    )
    return (
      <button
        key={section.id}
        onClick={() => handleIconClick(section.id)}
        title={section.label}
        className={clsx(
          'relative w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
          (isActive || isOpen)
            ? '[background-color:var(--sidebar-active-bg)] [color:var(--sidebar-active-text)]'
            : 'hover:[background-color:var(--sidebar-hover)]'
        )}
        style={!(isActive || isOpen) ? { color: 'var(--sidebar-icon-color)' } : undefined}
      >
        <Icon size={20} />
        {sectionBadge > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
        )}
      </button>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="sidebar-nav-zone"
      onMouseLeave={scheduleClose}
      onMouseEnter={cancelClose}
    >
      {/* 64px icon strip */}
      <aside className="icon-sidebar">
        <div className="flex flex-col items-center gap-1 py-2 flex-1">
          {mainSections.map(renderIconBtn)}
        </div>
        {/* Support pinned at bottom */}
        {supportSection && (
          <div className="pb-3 flex flex-col items-center">
            <button
              onClick={() => handleIconClick(supportSection.id)}
              title={supportSection.label}
              className={clsx(
                'relative w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                openSection === supportSection.id
                  ? '[background-color:var(--sidebar-active-bg)] [color:var(--sidebar-active-text)]'
                  : 'hover:[background-color:var(--sidebar-hover)]'
              )}
              style={openSection !== supportSection.id ? { color: 'var(--sidebar-icon-color)' } : undefined}
            >
              <HelpCircle size={20} />
            </button>
          </div>
        )}
      </aside>

      {/* Overlay flyout panel */}
      {flyoutSection && FlyoutSectionIcon && (
        <div className="flyout-panel">
          <div className="flyout-header">
            <FlyoutSectionIcon
              size={13}
              style={{ color: 'var(--sidebar-active-text)', flexShrink: 0 }}
            />
            <span
              className="text-[12px] font-bold truncate"
              style={{ color: 'var(--sidebar-text)' }}
            >
              {flyoutSection.label}
            </span>
          </div>
          <div className="flyout-items">
            {flyoutSection.items.map(({ href, label, icon: Icon, badgeKey, action }) => {
              const isActive = !action && (pathname === href || pathname.startsWith(href + '/'))
              const badgeCount = badgeKey ? (badges[badgeKey] ?? 0) : 0

              const cls = clsx(
                'flex items-center gap-2 px-2.5 py-2 rounded-[10px] text-[12px] transition-colors w-full text-left',
                isActive
                  ? '[background-color:var(--sidebar-active-bg)] [color:var(--sidebar-active-text)] font-semibold'
                  : 'hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]'
              )
              const itemStyle = !isActive ? { color: 'var(--sidebar-muted)' } : undefined

              const inner = (
                <>
                  <Icon size={13} className="shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  {badgeCount > 0 && (
                    <span className="text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-1 bg-red-500 text-white shrink-0">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </>
              )

              return action ? (
                <button
                  key={href}
                  onClick={() => { action(); onSectionChange(null) }}
                  className={cls}
                  style={itemStyle}
                >
                  {inner}
                </button>
              ) : (
                <Link
                  key={href}
                  href={href}
                  onClick={() => onSectionChange(null)}
                  className={cls}
                  style={itemStyle}
                >
                  {inner}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: rewrite Sidebar as 64px YouTube-style icon strip with overlay flyout panel"
```

---

## Task 5: Update ClientLayout — wire TopBar, badges, flyout state

**Files:**
- Modify: `frontend/src/components/layout/ClientLayout.tsx`

- [ ] **Step 1: Replace ClientLayout.tsx**

Replace the entire contents of `frontend/src/components/layout/ClientLayout.tsx` with:

```tsx
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

  // ── Auth + restore last open section ──────────────────────────────────────

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const authRequired = process.env.NEXT_PUBLIC_AUTH_REQUIRED === 'true'
    if (!isPublic && authRequired && !token) {
      router.replace('/login')
      return
    }
    setReady(true)
    try {
      const stored = localStorage.getItem(KEY_OPEN_SECTION)
      if (stored) setOpenSection(stored)
    } catch {}
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
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/ClientLayout.tsx
git commit -m "feat: wire TopBar and Sidebar into ClientLayout with hoisted badges and flyout state"
```

---

## Task 6: Visual verification

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000`

- [ ] **Step 2: Light theme checks**

1. Top bar visible: hamburger + DataGuardian logo (left), search pill (center), bell/settings/avatar (right) — all on white background
2. Click each sidebar icon — flyout appears overlaying the content, content does NOT shift right
3. Flyout shows correct items for each section with indigo `#e0e7ff` active highlight
4. Move cursor off sidebar + flyout zone — flyout disappears after ~150ms
5. Click a flyout item — navigates to page, flyout closes immediately
6. Bell shows red dot when `open_alerts > 0`
7. Click avatar → dropdown shows user name, role, theme toggle, sign out

- [ ] **Step 3: Dark theme checks**

Click the theme toggle in the avatar dropdown. Verify:

1. Top bar background → `#141824`, border → `#1e2235`
2. Icon sidebar background → `#0f1117`, border → `#1e2235`
3. Flyout panel background → `#141824`, border → `#1e2235`
4. Active icon → `rgba(99,102,241,0.20)` background, `#a5b4fc` icon colour
5. Active flyout item → `rgba(99,102,241,0.20)` background, `#a5b4fc` text
6. Inactive icons → `#334155`
7. Search bar → `var(--surface-sub)` background (dark variant)
8. Avatar dropdown → dark surface, correct text colours
9. Notification red dot border matches topbar background (no white ring artefact)

- [ ] **Step 4: Hamburger toggle check**

1. While on `/dashboard/global`, click hamburger → Overview flyout opens
2. Click hamburger again → flyout closes
3. Navigate to `/rules`, click hamburger → Data Quality flyout opens (active section detection)

- [ ] **Step 5: Admin visibility check**

Log in as non-admin → Administration icon must not appear in sidebar.
Log in as admin → Administration icon appears, flyout shows Domain Mgmt / User Mgmt / Data Cleanup / Settings.

- [ ] **Step 6: Final type-check + lint**

```bash
cd frontend && npm run type-check && npm run lint
```

Expected: no errors, no warnings related to new files.

- [ ] **Step 7: Final commit**

```bash
git add -p   # stage only intentional changes
git commit -m "feat: complete YouTube-style nav — TopBar, icon sidebar, overlay flyout, dark/light themes"
```
