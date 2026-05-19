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
          aria-label="Toggle navigation"
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
          aria-label={alertCount > 0 ? `${alertCount} open alerts` : 'Notifications'}
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
