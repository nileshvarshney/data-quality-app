'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Globe, Shield, Database, CheckCircle, XCircle, AlertTriangle,
  Bell, RefreshCw, TrendingUp, TrendingDown, Download, ChevronRight,
  Clock, Activity, BarChart3, LayoutGrid, LayoutList, Rows3,
  ChevronDown, RotateCcw, Minus, Eye, EyeOff, PanelLeftClose,
  PanelRightClose, PanelLeftOpen, PanelRightOpen,
} from 'lucide-react'
import Tooltip from '@/components/common/Tooltip'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
} from 'recharts'
import { dashboardApi, executionsApi, alertsApi } from '@/services/apiClient'
import { GlobalDashboard, DomainSummary } from '@/types'
import QualityTrendChart from '@/components/charts/QualityTrendChart'
import ScoreRing from '@/components/common/ScoreRing'
import SeverityBadge from '@/components/common/SeverityBadge'
import MetricInfo, { METRICS } from '@/components/common/MetricInfo'
import { useTimezone } from '@/contexts/TimezoneContext'
import { useTheme } from '@/components/layout/ThemeProvider'
import clsx from 'clsx'

// ── Layout types ──────────────────────────────────────────────────────────────

type Layout = 'default' | 'compact' | 'wide'
type SectionId = 'hero' | 'health' | 'domains' | 'charts' | 'bottom'

const STORAGE_KEY = 'dq-global-layout'

interface Prefs {
  layout: Layout
  collapsed: SectionId[]
  showFailures: boolean
  showAlerts: boolean
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        layout: p.layout ?? 'default',
        collapsed: p.collapsed ?? [],
        showFailures: p.showFailures ?? true,
        showAlerts: p.showAlerts ?? true,
      }
    }
  } catch {}
  return { layout: 'default', collapsed: [], showFailures: true, showAlerts: true }
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch {}
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreTextColor(s: number) {
  if (s >= 95) return 'text-green-600'; if (s >= 80) return 'text-yellow-600'
  if (s >= 60) return 'text-orange-500'; return 'text-red-600'
}
function scoreFill(s: number) {
  if (s >= 95) return '#22c55e'; if (s >= 80) return '#f59e0b'
  if (s >= 60) return '#f97316'; return '#ef4444'
}
function scoreLabel(s: number) {
  if (s >= 95) return 'Excellent'; if (s >= 80) return 'Good'
  if (s >= 60) return 'Warning'; return 'Critical'
}
function scoreBadgeClass(s: number) {
  if (s >= 95) return 'bg-green-50 text-green-700 border-green-200'
  if (s >= 80) return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  if (s >= 60) return 'bg-orange-50 text-orange-700 border-orange-200'
  return 'bg-red-50 text-red-700 border-red-200'
}
function relTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DeltaPill({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.05) return <span className="text-xs text-gray-400">No change</span>
  const up = delta > 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-green-600' : 'text-red-500'}`}>
      <Icon size={11} />{Math.abs(delta).toFixed(1)}% vs yesterday
    </span>
  )
}

interface KpiProps {
  label: string; value: number | string; icon: React.ElementType
  iconBg: string; iconColor: string; sub?: string; href?: string
  highlight?: boolean; metricKey?: keyof typeof METRICS; compact?: boolean
}
function KpiCard({ label, value, icon: Icon, iconBg, iconColor, sub, href, highlight, metricKey, compact }: KpiProps) {
  const inner = (
    <div className={clsx(
      'bg-white rounded-xl border transition-all group',
      compact ? 'p-3.5 flex items-center gap-3' : 'p-5 flex items-start gap-4',
      highlight ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
    )}>
      <div className={clsx('rounded-xl shrink-0', compact ? 'p-2' : 'p-2.5', iconBg)}>
        <Icon size={compact ? 15 : 18} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className={clsx('text-gray-500 uppercase tracking-wide font-medium truncate', compact ? 'text-[10px]' : 'text-xs')}>
            {label}
          </p>
          {metricKey && METRICS[metricKey] && (
            <MetricInfo metric={METRICS[metricKey]} position="top" />
          )}
        </div>
        <p className={clsx('font-bold leading-tight mt-0.5', compact ? 'text-xl' : 'text-3xl', highlight ? 'text-red-700' : 'text-gray-900')}>
          {value}
        </p>
        {sub && !compact && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {href && <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0 mt-1" />}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function DomainCard({ d, trackColor, compact }: { d: DomainSummary; trackColor: string; compact?: boolean }) {
  const score    = d.quality_score ?? 0
  const passRate = d.total_rules > 0 ? (d.passed_rules / d.total_rules) * 100 : 0
  return (
    <Link href={`/dashboard/domains/${d.domain_id}`}
      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all group block">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate">{d.domain_name}</p>
          <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${scoreBadgeClass(score)}`}>
            {scoreLabel(score)}
          </span>
        </div>
        {!compact && (
          <div className="relative shrink-0">
            <ScoreRing score={score} size={58} strokeWidth={6} trackColor={trackColor} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-[12px] font-bold ${scoreTextColor(score)}`}>{score.toFixed(0)}%</span>
            </div>
          </div>
        )}
        {compact && (
          <span className={`text-base font-black ${scoreTextColor(score)}`}>{score.toFixed(0)}%</span>
        )}
      </div>
      {!compact && (
        <div className="grid grid-cols-3 gap-1 mb-3">
          <div className="bg-gray-50 rounded-lg py-1.5 text-center">
            <p className="text-[9px] text-gray-400 uppercase">Total</p>
            <p className="text-xs font-bold text-gray-900">{d.total_rules}</p>
          </div>
          <div className="bg-green-50 rounded-lg py-1.5 text-center">
            <p className="text-[9px] text-green-600 uppercase">Passed</p>
            <p className="text-xs font-bold text-green-700">{d.passed_rules}</p>
          </div>
          <div className={`rounded-lg py-1.5 text-center ${d.failed_rules > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
            <p className={`text-[9px] uppercase ${d.failed_rules > 0 ? 'text-red-500' : 'text-gray-400'}`}>Failed</p>
            <p className={`text-xs font-bold ${d.failed_rules > 0 ? 'text-red-600' : 'text-gray-500'}`}>{d.failed_rules}</p>
          </div>
        </div>
      )}
      <div>
        {!compact && (
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>Pass rate</span><span className="font-medium text-gray-600">{passRate.toFixed(0)}%</span>
          </div>
        )}
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${passRate}%`, backgroundColor: scoreFill(score) }} />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-gray-100">
        <span className="text-[10px] text-gray-400">{d.total_assets} tables</span>
        <ChevronRight size={11} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
      </div>
    </Link>
  )
}

// ── Collapsible section wrapper ───────────────────────────────────────────────

function Section({
  id, title, subtitle, href, linkLabel, collapsed, onToggle, children,
}: {
  id: SectionId
  title: string
  /** Plain string shown next to the title, OR JSX for richer controls. */
  subtitle?: React.ReactNode
  href?: string
  linkLabel?: string
  collapsed: boolean
  onToggle: (id: SectionId) => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle(id)}
            title={collapsed ? 'Expand section' : 'Collapse section'}
            className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors group"
          >
            <span className={clsx('transition-transform duration-200', collapsed && '-rotate-90')}>
              <ChevronDown size={14} />
            </span>
            {title}
          </button>
          {subtitle && !collapsed && (
            typeof subtitle === 'string'
              ? <span className="text-[11px] text-gray-400 hidden sm:inline">{subtitle}</span>
              : <>{subtitle}</>
          )}
        </div>
        {href && !collapsed && (
          <Link href={href} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            {linkLabel ?? 'View all'} <ChevronRight size={12} />
          </Link>
        )}
      </div>
      {!collapsed && children}
    </div>
  )
}

// ── HealthCard — today's health strip ─────────────────────────────────────────

function HealthCard({ icon: Icon, iconBg, label, value, sub, highlight, metricKey, compact }: {
  icon: React.ElementType; iconBg: string; label: string; value: React.ReactNode
  sub?: React.ReactNode; highlight?: boolean; metricKey?: keyof typeof METRICS; compact?: boolean
}) {
  return (
    <div className={clsx(
      'bg-white rounded-xl border',
      compact ? 'p-3.5' : 'p-5',
      highlight ? 'border-red-200 bg-red-50' : 'border-gray-200'
    )}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={clsx('rounded-lg', compact ? 'p-1' : 'p-1.5', iconBg)}><Icon size={compact ? 12 : 14} /></div>
        <div className="flex items-center gap-1">
          <p className={clsx('text-gray-500 font-medium uppercase tracking-wide', compact ? 'text-[9px]' : 'text-xs')}>
            {label}
          </p>
          {metricKey && METRICS[metricKey] && (
            <MetricInfo metric={METRICS[metricKey]} position="top" />
          )}
        </div>
      </div>
      <p className={clsx('font-black tabular-nums', compact ? 'text-xl' : 'text-3xl', highlight ? 'text-red-700' : 'text-gray-900')}>
        {value}
      </p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GlobalDashboardPage() {
  const { theme }   = useTheme()
  const { formatTime } = useTimezone()
  const trackColor  = theme === 'dark' ? '#334155' : '#e2e8f0'

  const [global,         setGlobal]         = useState<GlobalDashboard | null>(null)
  const [domains,        setDomains]        = useState<DomainSummary[]>([])
  const [recentFailures, setRecentFailures] = useState<any[]>([])
  const [openAlerts,     setOpenAlerts]     = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [lastRefreshed,  setLastRefreshed]  = useState<Date>(new Date())
  const [error,          setError]          = useState('')

  // Layout & collapse state — persisted to localStorage
  const [layout,       setLayout]       = useState<Layout>('default')
  const [collapsed,    setCollapsed]    = useState<Set<SectionId>>(new Set())
  const [showFailures, setShowFailures] = useState(true)
  const [showAlerts,   setShowAlerts]   = useState(true)

  // JS-driven breakpoint — avoids relying on Tailwind lg: classes for panel sizing
  const [isLg, setIsLg] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsLg(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Load prefs on mount — also sync refs
  useEffect(() => {
    const p = loadPrefs()
    layoutRef.current       = p.layout
    collapsedRef.current    = new Set(p.collapsed)
    showFailuresRef.current = p.showFailures
    showAlertsRef.current   = p.showAlerts
    setLayout(p.layout)
    setCollapsed(new Set(p.collapsed))
    setShowFailures(p.showFailures)
    setShowAlerts(p.showAlerts)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refs so callbacks always see current values without stale closure
  const layoutRef       = useRef<Layout>('default')
  const collapsedRef    = useRef<Set<SectionId>>(new Set())
  const showFailuresRef = useRef(true)
  const showAlertsRef   = useRef(true)

  const persist = useCallback(() => {
    savePrefs({
      layout: layoutRef.current,
      collapsed: [...collapsedRef.current],
      showFailures: showFailuresRef.current,
      showAlerts: showAlertsRef.current,
    })
  }, [])

  const toggleSection = useCallback((id: SectionId) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      collapsedRef.current = next
      persist()
      return next
    })
  }, [persist])

  const changeLayout = useCallback((l: Layout) => {
    layoutRef.current = l
    setLayout(l)
    persist()
  }, [persist])

  const resetLayout = useCallback(() => {
    layoutRef.current       = 'default'
    collapsedRef.current    = new Set()
    showFailuresRef.current = true
    showAlertsRef.current   = true
    setLayout('default')
    setCollapsed(new Set())
    setShowFailures(true)
    setShowAlerts(true)
    savePrefs({ layout: 'default', collapsed: [], showFailures: true, showAlerts: true })
  }, [])

  const toggleFailures = useCallback(() => {
    setShowFailures(prev => {
      const next = !prev
      showFailuresRef.current = next
      persist()
      return next
    })
  }, [persist])

  const toggleAlerts = useCallback(() => {
    setShowAlerts(prev => {
      const next = !prev
      showAlertsRef.current = next
      persist()
      return next
    })
  }, [persist])

  const isCollapsed = (id: SectionId) => collapsed.has(id)
  const compact = layout === 'compact'
  const wide    = layout === 'wide'

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const [gRes, dRes, rRes, aRes] = await Promise.allSettled([
        dashboardApi.global(),
        dashboardApi.domains(),
        executionsApi.listRunsEnriched({ status: 'failed', limit: 8 }),
        alertsApi.listEnriched({ status: 'open', limit: 6 }),
      ])
      if (gRes.status === 'fulfilled') setGlobal(gRes.value.data)
      if (dRes.status === 'fulfilled') setDomains(Array.isArray(dRes.value.data) ? dRes.value.data : [])
      if (rRes.status === 'fulfilled') setRecentFailures(Array.isArray(rRes.value.data) ? rRes.value.data : [])
      if (aRes.status === 'fulfilled') setOpenAlerts(Array.isArray(aRes.value.data) ? aRes.value.data : [])
      setLastRefreshed(new Date())
      setError('')
    } catch {
      setError('Failed to load dashboard data. Check your API connection.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
    const iv = setInterval(() => loadAll(true), 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [loadAll])

  const scoreDelta = (() => {
    const t = global?.quality_trend
    if (!t || t.length < 2) return 0
    return (t[t.length - 1]?.score ?? 0) - (t[t.length - 2]?.score ?? 0)
  })()

  const passTotal = (global?.rules_passed_today ?? 0) + (global?.rules_failed_today ?? 0)
  const passRate  = passTotal > 0 ? (global?.rules_passed_today ?? 0) / passTotal * 100 : 0
  const score     = global?.overall_quality_score ?? 0
  const healthy   = (global?.critical_failures ?? 0) === 0
  const donut     = [
    { name: 'Passed', value: global?.rules_passed_today ?? 0 },
    { name: 'Failed', value: global?.rules_failed_today ?? 0 },
  ]
  const refreshedAt = formatTime(lastRefreshed)

  // ── Loading skeleton ──────────────────────────────────────────────
  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 h-40 bg-gray-200 rounded-xl animate-pulse" />
        <div className="lg:col-span-3 grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-200 rounded-xl animate-pulse" />)}
      </div>
    </div>
  )

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
    </div>
  )

  return (
    <div className={clsx('p-6 space-y-6', wide ? 'max-w-4xl' : 'max-w-[1600px]')}>

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Global Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Enterprise Data Quality Command Center · Snowflake</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* System health pill */}
          <div className={clsx(
            'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border',
            healthy ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
          )}>
            <span className={clsx('w-2 h-2 rounded-full', healthy ? 'bg-green-500' : 'bg-red-500 animate-pulse')} />
            {healthy ? 'All Systems Normal' : 'Issues Detected'}
          </div>

          {/* Last refresh */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={12} /><span>Updated {refreshedAt}</span>
          </div>

          {/* ── Layout picker ── */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            {([
              { key: 'default', icon: LayoutGrid,  title: 'Default layout' },
              { key: 'compact', icon: Rows3,        title: 'Compact layout' },
              { key: 'wide',    icon: LayoutList,   title: 'Wide layout' },
            ] as { key: Layout; icon: React.ElementType; title: string }[]).map(({ key, icon: Icon, title }) => (
              <button
                key={key}
                title={title}
                onClick={() => changeLayout(key)}
                className={clsx(
                  'px-2.5 py-1.5 transition-colors',
                  layout === key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                )}
              >
                <Icon size={13} />
              </button>
            ))}
          </div>

          {/* ── Minimize all / Reset ── */}
          <button
            onClick={() => {
              const all: SectionId[] = ['hero', 'health', 'domains', 'charts', 'bottom']
              const allCollapsed = new Set(all)
              collapsedRef.current = allCollapsed
              setCollapsed(allCollapsed)
              persist()
            }}
            title="Minimize all sections"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-700 transition-all"
          >
            <Minus size={12} /> Minimize all
          </button>
          <button
            onClick={resetLayout}
            title="Reset to default layout"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-700 transition-all"
          >
            <RotateCcw size={12} /> Reset
          </button>

          {/* Export CSV */}
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/export/runs?days=30`}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-green-400 hover:text-green-600 transition-all"
          >
            <Download size={12} /> Export CSV
          </a>

          {/* Refresh */}
          <button
            onClick={() => loadAll(true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-40"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Hero: Score ring + KPI strip ── */}
      <Section id="hero" title="Overview" collapsed={isCollapsed('hero')} onToggle={toggleSection}>
        <div className={clsx('grid gap-4', wide ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-5')}>

          {/* Score ring hero */}
          <div className={clsx(
            'bg-white rounded-xl border border-gray-200 flex items-center gap-6',
            compact ? 'p-4' : 'p-6',
            wide ? '' : 'lg:col-span-2'
          )}>
            <div className="relative shrink-0">
              <ScoreRing score={score} size={compact ? 96 : 128} strokeWidth={compact ? 9 : 11} trackColor={trackColor} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`font-black ${compact ? 'text-xl' : 'text-2xl'} ${scoreTextColor(score)}`}>
                  {score > 0 ? `${score.toFixed(1)}%` : '—'}
                </span>
              </div>
            </div>
            <div className="space-y-2 min-w-0">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] text-gray-400 uppercase tracking-widest font-medium">Overall Quality</p>
                  <MetricInfo metric={METRICS.qualityScore} position="right" />
                </div>
                <p className={`font-bold mt-0.5 ${compact ? 'text-lg' : 'text-xl'} ${scoreTextColor(score)}`}>
                  {scoreLabel(score)}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-0.5">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Score trend</p>
                  <MetricInfo metric={METRICS.scoreDelta} position="right" />
                </div>
                <DeltaPill delta={scoreDelta} />
              </div>
              {!compact && (
                <div className="pt-1 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400 mb-1">14-day trend</p>
                  <QualityTrendChart data={global?.quality_trend || []} height={36} mini />
                </div>
              )}
            </div>
          </div>

          {/* 4 KPI cards */}
          <div className={clsx(
            'grid gap-3',
            wide ? 'grid-cols-2 sm:grid-cols-4' : 'lg:col-span-3 grid-cols-2'
          )}>
            <KpiCard label="Domains Monitored" value={global?.total_domains ?? 0} icon={Globe}
              iconBg="bg-blue-50" iconColor="text-blue-600" sub="business domains"
              metricKey="domainCount" compact={compact} />
            <KpiCard label="Tables Monitored" value={global?.total_assets ?? 0} icon={Database}
              iconBg="bg-purple-50" iconColor="text-purple-600" sub="Snowflake tables"
              href="/assets" metricKey="tablesMonitored" compact={compact} />
            <KpiCard label="Active Rules" value={global?.total_active_rules ?? 0} icon={Shield}
              iconBg="bg-indigo-50" iconColor="text-indigo-600" sub="data quality checks"
              href="/rules" metricKey="activeRules" compact={compact} />
            <KpiCard label="Open Alerts" value={global?.open_alerts ?? 0} icon={Bell}
              iconBg={(global?.open_alerts ?? 0) > 0 ? 'bg-orange-50' : 'bg-gray-50'}
              iconColor={(global?.open_alerts ?? 0) > 0 ? 'text-orange-500' : 'text-gray-400'}
              sub="require attention" href="/alerts"
              highlight={(global?.open_alerts ?? 0) > 4}
              metricKey="openAlerts" compact={compact} />
          </div>
        </div>
      </Section>

      {/* ── Today's health strip ── */}
      <Section id="health" title="Today's Health" collapsed={isCollapsed('health')} onToggle={toggleSection}>
        <div className={clsx(
          'grid gap-4',
          wide ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'
        )}>
          <HealthCard icon={CheckCircle} iconBg="bg-green-50" label="Passed Today"
            value={global?.rules_passed_today ?? 0}
            sub={<p className="text-[11px] text-gray-400">rules passed all checks</p>}
            metricKey="passedToday" compact={compact} />

          <HealthCard icon={XCircle} iconBg="bg-red-50" label="Failed Today"
            value={global?.rules_failed_today ?? 0}
            sub={<p className="text-[11px] text-gray-400">rules need attention</p>}
            metricKey="failedToday" compact={compact} />

          <HealthCard icon={AlertTriangle} iconBg="bg-red-100"
            label="Critical Failures" value={global?.critical_failures ?? 0}
            highlight={(global?.critical_failures ?? 0) > 0}
            sub={<p className="text-[11px] text-gray-400">require immediate action</p>}
            metricKey="criticalFailures" compact={compact} />

          <HealthCard icon={Activity} iconBg="bg-blue-50"
            label="Pass Rate Today" value={`${passRate.toFixed(0)}%`}
            metricKey="passRateToday" compact={compact}
            sub={
              <div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1.5">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${passRate}%`, backgroundColor: scoreFill(passRate) }} />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">{passTotal} rules executed</p>
              </div>
            } />
        </div>
      </Section>

      {/* ── Domain health grid ── */}
      {domains.length > 0 && (
        <Section id="domains" title="Domain Health" collapsed={isCollapsed('domains')} onToggle={toggleSection}>
          <div className={clsx(
            'grid gap-3',
            wide    ? 'grid-cols-2 sm:grid-cols-3' :
            compact ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7' :
                      'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4'
          )}>
            {domains.map(d => <DomainCard key={d.domain_id} d={d} trackColor={trackColor} compact={compact} />)}
          </div>
        </Section>
      )}

      {/* ── Charts row ── */}
      <Section id="charts" title="Quality Trend" collapsed={isCollapsed('charts')} onToggle={toggleSection}>
        <div className={clsx('grid gap-4', wide ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3')}>

          {/* 14-day area trend */}
          <div className={clsx('bg-white rounded-xl border border-gray-200', compact ? 'p-4' : 'p-6', wide ? '' : 'lg:col-span-2')}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Quality Score Trend</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">14-day rolling — green = SLA 95%, amber = warning 80%</p>
              </div>
              <BarChart3 size={16} className="text-gray-300" />
            </div>
            <QualityTrendChart data={global?.quality_trend || []} height={compact ? 160 : 230} area />
          </div>

          {/* Rules today donut */}
          <div className={clsx('bg-white rounded-xl border border-gray-200', compact ? 'p-4' : 'p-6')}>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Rules Executed Today</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Passed vs. Failed distribution</p>
            </div>
            {passTotal > 0 ? (
              <>
                <div className="flex items-center justify-center mb-1">
                  <ResponsiveContainer width="100%" height={compact ? 130 : 170}>
                    <PieChart>
                      <Pie data={donut} cx="50%" cy="50%"
                        innerRadius={compact ? 40 : 52} outerRadius={compact ? 58 : 74}
                        dataKey="value" paddingAngle={3} startAngle={90} endAngle={-270}>
                        <Cell fill="#22c55e" /><Cell fill="#ef4444" />
                      </Pie>
                      <RTooltip formatter={(v: number, name: string) => [`${v} rules`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                    <span className="text-xs text-gray-600">Passed <strong>{global?.rules_passed_today ?? 0}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    <span className="text-xs text-gray-600">Failed <strong>{global?.rules_failed_today ?? 0}</strong></span>
                  </div>
                </div>
                <p className="text-center text-[11px] text-gray-400 mt-3">
                  {passTotal} total · {passRate.toFixed(0)}% pass rate
                </p>
              </>
            ) : (
              <div className={clsx('flex flex-col items-center justify-center gap-2 text-gray-400', compact ? 'h-[130px]' : 'h-[170px]')}>
                <Activity size={28} className="text-gray-300" />
                <p className="text-sm">No executions today</p>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ── Bottom: Recent failures + Open alerts ── */}
      <Section
        id="bottom"
        title="Recent Activity"
        collapsed={isCollapsed('bottom')}
        onToggle={toggleSection}
        subtitle={
          // Panel visibility toggles sit in the section subtitle slot
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={toggleFailures}
              title={showFailures ? 'Hide Recent Failures' : 'Show Recent Failures'}
              className={clsx(
                'flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all',
                showFailures
                  ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
              )}
            >
              {showFailures ? <PanelLeftClose size={11} /> : <PanelLeftOpen size={11} />}
              Failures
            </button>
            <button
              onClick={toggleAlerts}
              title={showAlerts ? 'Hide Open Alerts' : 'Show Open Alerts'}
              className={clsx(
                'flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all',
                showAlerts
                  ? 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
              )}
            >
              {showAlerts ? <PanelRightClose size={11} /> : <PanelRightOpen size={11} />}
              Alerts
            </button>
          </div>
        }
      >
        {/* Both hidden → prompt */}
        {!showFailures && !showAlerts ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-8 text-center">
            <p className="text-sm text-gray-500 mb-3">Both panels are hidden.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={toggleFailures}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                <PanelLeftOpen size={12} /> Show Failures
              </button>
              <button onClick={toggleAlerts}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 border border-orange-200 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors">
                <PanelRightOpen size={12} /> Show Alerts
              </button>
            </div>
          </div>
        ) : (() => {
          // Compute layout values once — driven entirely by JS state, no Tailwind breakpoint classes
          const row     = isLg && !wide          // side-by-side only when large screen + not wide mode
          const bothOn  = showFailures && showAlerts
          const STRIP   = '2.5rem'               // width of the collapsed strip

          // Container: row or column depending on computed state
          const containerStyle: React.CSSProperties = {
            display:       'flex',
            flexDirection: row ? 'row' : 'column',
            gap:           '1rem',
            alignItems:    row ? 'stretch' : undefined,
          }

          // Left wrapper (Failures side): full panel width, strip width, or hidden
          const leftStyle: React.CSSProperties = row
            ? showFailures
              ? { flex: bothOn ? '3 1 0%' : '1 1 0%', minWidth: 0 }
              : { flex: `0 0 ${STRIP}`, overflow: 'hidden' }
            : { minWidth: 0 }

          // Right wrapper (Alerts side): full panel width, strip width, or hidden
          const rightStyle: React.CSSProperties = row
            ? showAlerts
              ? { flex: bothOn ? '2 1 0%' : '1 1 0%', minWidth: 0 }
              : { flex: `0 0 ${STRIP}`, overflow: 'hidden' }
            : { minWidth: 0 }

          return (
            <div style={containerStyle}>

              {/* ── LEFT WRAPPER — always in DOM, contains Failures panel or its strip ── */}
              <div style={leftStyle}>
                {showFailures ? (
                  /* Failures panel */
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-full">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Recent Failures</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Latest failing rule executions</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href="/runs?status=failed" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          View all <ChevronRight size={12} />
                        </Link>
                        <Tooltip text="Hide this panel" position="bottom">
                          <button onClick={toggleFailures}
                            className="p-1 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded transition-colors">
                            <EyeOff size={13} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>

                    {recentFailures.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <CheckCircle size={36} className="mx-auto mb-2 text-green-400" />
                        <p className="text-sm font-medium text-gray-600">All clear — no recent failures</p>
                        <p className="text-xs text-gray-400 mt-1">All monitored rules are passing</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                              <th className="px-5 py-2.5 text-left font-semibold">Rule</th>
                              <th className="px-4 py-2.5 text-left font-semibold">Table</th>
                              <th className="px-4 py-2.5 text-left font-semibold">Domain</th>
                              <th className="px-4 py-2.5 text-left font-semibold">Severity</th>
                              <th className="px-4 py-2.5 text-left font-semibold">
                                <div className="flex items-center gap-1">Score <MetricInfo metric={METRICS.runsScore} position="top" /></div>
                              </th>
                              <th className="px-4 py-2.5 text-left font-semibold">When</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {recentFailures.map((run: any, i: number) => (
                              <tr key={run.run_id ?? i} className="hover:bg-gray-50 transition-colors">
                                <td className="px-5 py-3">
                                  <span className="font-medium text-gray-900 truncate max-w-[200px] block text-xs">
                                    {run.rule_name ?? run.run_id?.slice(0, 12) ?? '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-[10px] text-gray-500 truncate block">
                                    {run.sf_table_name ?? run.asset_id?.slice(0, 10) ?? '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                  {run.domain_name ?? '—'}
                                </td>
                                <td className="px-4 py-3"><SeverityBadge severity={run.severity ?? 'low'} /></td>
                                <td className="px-4 py-3">
                                  {run.quality_score != null ? (
                                    <span className={`text-xs font-bold ${run.quality_score < 60 ? 'text-red-600' : run.quality_score < 80 ? 'text-orange-500' : 'text-yellow-600'}`}>
                                      {run.quality_score.toFixed(0)}%
                                    </span>
                                  ) : <span className="text-xs text-gray-400">—</span>}
                                </td>
                                <td className="px-4 py-3 text-[11px] text-gray-400 whitespace-nowrap">
                                  {run.created_at ? relTime(run.created_at) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : row ? (
                  /* Failures collapsed strip — only shown in row mode */
                  <Tooltip text="Show Recent Failures" position="right">
                    <div className="flex flex-col items-center justify-center w-full h-full bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all group"
                      onClick={toggleFailures}>
                      <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold text-gray-400 group-hover:text-blue-600 tracking-widest py-4 select-none">
                        RECENT FAILURES
                      </span>
                      <Eye size={13} className="text-gray-300 group-hover:text-blue-500 mb-3" />
                    </div>
                  </Tooltip>
                ) : null}
              </div>

              {/* ── RIGHT WRAPPER — always in DOM, contains Alerts panel or its strip ── */}
              <div style={rightStyle}>
                {showAlerts ? (
                  /* Alerts panel */
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-full">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Open Alerts</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">Unresolved notifications</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href="/alerts" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          View all <ChevronRight size={12} />
                        </Link>
                        <Tooltip text="Hide this panel" position="bottom">
                          <button onClick={toggleAlerts}
                            className="p-1 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded transition-colors">
                            <EyeOff size={13} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>

                    {openAlerts.length === 0 ? (
                      <div className="px-5 py-10 text-center">
                        <Bell size={36} className="mx-auto mb-2 text-gray-200" />
                        <p className="text-sm font-medium text-gray-600">No open alerts</p>
                        <p className="text-xs text-gray-400 mt-1">Everything looks good</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {openAlerts.map((alert: any, i: number) => {
                          const sev = alert.severity ?? 'medium'
                          const iconColor = sev === 'critical' ? 'text-red-600' : sev === 'high' ? 'text-orange-500' : 'text-yellow-500'
                          return (
                            <div key={alert.alert_id ?? i} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                              <div className="flex items-start gap-2.5">
                                <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${iconColor}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900 line-clamp-2 leading-snug">
                                    {alert.alert_message ?? 'Data quality alert triggered'}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <SeverityBadge severity={sev} />
                                    {(alert.domain_name ?? alert.domain_id) && (
                                      <span className="text-[10px] text-gray-400">
                                        {alert.domain_name ?? alert.domain_id?.slice(0, 8)}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-gray-400 ml-auto whitespace-nowrap">
                                      {alert.created_at ? relTime(alert.created_at) : '—'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : row ? (
                  /* Alerts collapsed strip — only shown in row mode */
                  <Tooltip text="Show Open Alerts" position="left">
                    <div className="flex flex-col items-center justify-center w-full h-full bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all group"
                      onClick={toggleAlerts}>
                      <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold text-gray-400 group-hover:text-blue-600 tracking-widest py-4 select-none">
                        OPEN ALERTS
                      </span>
                      <Eye size={13} className="text-gray-300 group-hover:text-blue-500 mb-3" />
                    </div>
                  </Tooltip>
                ) : null}
              </div>

            </div>
          )
        })()}
      </Section>
    </div>
  )
}
