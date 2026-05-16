'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Globe, Database, Shield, Calendar, Bell, ClipboardList,
  PlayCircle, Settings, FolderKanban, User, BrainCircuit,
  Search, ArrowRight, Plus, HelpCircle, BookOpen, Package,
  FileText, AlertOctagon, ShoppingBag, BarChart2, Layers, Lock,
} from 'lucide-react'
import clsx from 'clsx'

interface Command {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
  group: string
  keywords?: string
}

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [active, setActive] = useState(0)
  const inputRef            = useRef<HTMLInputElement>(null)

  const nav = useCallback((href: string) => {
    router.push(href)
    setOpen(false)
  }, [router])

  const commands: Command[] = [
    // Navigation
    { id: 'global-dash',   group: 'Navigation',   label: 'Global Dashboard',    icon: <Globe         size={14}/>, action: () => nav('/dashboard/global'),  keywords: 'home overview' },
    { id: 'rules',         group: 'Navigation',   label: 'Rules',                icon: <Shield        size={14}/>, action: () => nav('/rules'),             keywords: 'dq data quality checks' },
    { id: 'create-rule',   group: 'Quick Action', label: 'Create New Rule',      icon: <Plus          size={14}/>, action: () => nav('/rules/create'),      keywords: 'new add rule' },
    { id: 'assets',        group: 'Navigation',   label: 'Data Assets',          icon: <Database      size={14}/>, action: () => nav('/assets'),            keywords: 'tables snowflake' },
    { id: 'schedules',     group: 'Navigation',   label: 'Schedules',            icon: <Calendar      size={14}/>, action: () => nav('/schedules'),         keywords: 'cron timing frequency' },
    { id: 'runs',          group: 'Navigation',   label: 'Execution Logs',       icon: <PlayCircle    size={14}/>, action: () => nav('/runs'),              keywords: 'history logs executions' },
    { id: 'alerts',        group: 'Operations',   label: 'Alerts',               icon: <Bell          size={14}/>, action: () => nav('/alerts'),            keywords: 'notifications failures open critical' },
    { id: 'audit',         group: 'Operations',   label: 'Audit Logs',           icon: <ClipboardList size={14}/>, action: () => nav('/audit'),             keywords: 'history trail changes' },
    { id: 'catalog',       group: 'Catalog',      label: 'Data Catalog',         icon: <Search        size={14}/>, action: () => nav('/catalog'),           keywords: 'search discover assets tables' },
    { id: 'glossary',      group: 'Catalog',      label: 'Business Glossary',    icon: <BookOpen      size={14}/>, action: () => nav('/glossary'),          keywords: 'terms definitions business' },
    { id: 'data-products', group: 'Catalog',      label: 'Data Products',        icon: <Package       size={14}/>, action: () => nav('/data-products'),     keywords: 'bundles datasets products' },
    { id: 'governance',    group: 'Governance',   label: 'Governance Hub',       icon: <Layers        size={14}/>, action: () => nav('/governance'),        keywords: 'policies scorecards violations' },
    { id: 'contracts',     group: 'Governance',   label: 'Data Contracts',       icon: <FileText      size={14}/>, action: () => nav('/contracts'),         keywords: 'sla quality guarantees' },
    { id: 'incidents',     group: 'Governance',   label: 'Incidents',            icon: <AlertOctagon  size={14}/>, action: () => nav('/incidents'),         keywords: 'mttd mttr oncall data quality incident' },
    { id: 'marketplace',   group: 'Governance',   label: 'Rule Marketplace',     icon: <ShoppingBag   size={14}/>, action: () => nav('/marketplace'),       keywords: 'templates industry packs import' },
    { id: 'executive',     group: 'Governance',   label: 'Executive View',       icon: <BarChart2     size={14}/>, action: () => nav('/executive'),         keywords: 'cost roi bad data dollar impact' },
    { id: 'compliance',    group: 'Governance',   label: 'Compliance',           icon: <Lock          size={14}/>, action: () => nav('/compliance'),        keywords: 'gdpr hipaa sox ccpa frameworks' },
    { id: 'ai',            group: 'AI',           label: 'AI Assistant',         icon: <BrainCircuit  size={14}/>, action: () => nav('/ai-assistant'),      keywords: 'chat llm explain suggest nlp' },
    { id: 'settings',      group: 'Admin',        label: 'Settings',             icon: <Settings      size={14}/>, action: () => nav('/settings'),          keywords: 'config llm snowflake sla thresholds' },
    { id: 'domains-admin', group: 'Admin',        label: 'Domain Management',    icon: <FolderKanban  size={14}/>, action: () => nav('/admin/domains'),     keywords: 'domains subdomains manage' },
    { id: 'users-admin',   group: 'Admin',        label: 'User Management',      icon: <User          size={14}/>, action: () => nav('/admin/users'),       keywords: 'users roles permissions rbac' },
    { id: 'help',          group: 'Support',      label: 'Help & Reference',     icon: <HelpCircle    size={14}/>, action: () => nav('/help'),              keywords: 'docs metrics rules scores faq' },
  ]

  const filtered = query.trim()
    ? commands.filter(c => {
        const q = query.toLowerCase()
        return (
          c.label.toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q) ||
          (c.keywords || '').toLowerCase().includes(q) ||
          c.group.toLowerCase().includes(q)
        )
      })
    : commands

  // Group filtered results
  const groups = Array.from(new Set(filtered.map(c => c.group)))

  useEffect(() => { setActive(0) }, [query])

  // Global keyboard listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
        setQuery('')
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(v => Math.min(v + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(v => Math.max(v - 1, 0)) }
    if (e.key === 'Enter' && filtered[active]) { filtered[active].action() }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
          <Search size={15} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages and actions…"
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-400">No results for "{query}"</p>
          ) : (
            groups.map(group => (
              <div key={group}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  {group}
                </p>
                {filtered.filter(c => c.group === group).map(cmd => {
                  const idx = filtered.indexOf(cmd)
                  return (
                    <button
                      key={cmd.id}
                      onClick={cmd.action}
                      onMouseEnter={() => setActive(idx)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                        active === idx
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      )}
                    >
                      <span className={clsx('shrink-0', active === idx ? 'text-blue-500' : 'text-gray-400')}>
                        {cmd.icon}
                      </span>
                      <span className="flex-1 font-medium">{cmd.label}</span>
                      {active === idx && <ArrowRight size={13} className="text-blue-400 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400">
          <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-gray-500">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-gray-500">↵</kbd> open</span>
          <span><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-gray-500">esc</kbd> close</span>
          <span className="ml-auto"><kbd className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-gray-500">⌘K</kbd></span>
        </div>
      </div>
    </div>
  )
}
