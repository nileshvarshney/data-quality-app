'use client'
import { useRef, useCallback, useMemo, useEffect } from 'react'
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

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

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
