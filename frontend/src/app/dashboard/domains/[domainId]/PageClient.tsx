'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Globe, Shield, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, TrendingDown, TrendingUp, Clock, Activity, Download,
} from 'lucide-react'
import { dashboardApi, executionsApi } from '@/services/apiClient'
import { DomainDashboard, DimensionScores } from '@/types'
import QualityTrendChart from '@/components/charts/QualityTrendChart'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { useTimezone } from '@/contexts/TimezoneContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 95) return '#22c55e'
  if (s >= 80) return '#f59e0b'
  if (s >= 60) return '#f97316'
  return '#ef4444'
}

function scoreBorderColor(s: number): string {
  if (s >= 95) return '#22c55e'
  if (s >= 80) return '#f59e0b'
  if (s >= 60) return '#f97316'
  return '#ef4444'
}

function relTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function severityStyle(sev: string): { bg: string; text: string } {
  switch (sev) {
    case 'critical': return { bg: 'rgba(239,68,68,0.1)',    text: '#ef4444' }
    case 'high':     return { bg: 'rgba(245,158,11,0.1)',   text: '#f59e0b' }
    default:         return { bg: 'rgba(100,116,139,0.1)',  text: '#64748b' }
  }
}

// ── Dimension config ──────────────────────────────────────────────────────────

const DIMENSIONS = [
  { key: 'completeness'  as const, label: 'Completeness',  icon: '📋', cssClass: 'dim-completeness' },
  { key: 'freshness'     as const, label: 'Freshness',     icon: '⏱',  cssClass: 'dim-freshness'    },
  { key: 'consistency'   as const, label: 'Consistency',   icon: '🔗', cssClass: 'dim-consistency'  },
  { key: 'accuracy'      as const, label: 'Accuracy',      icon: '🎯', cssClass: 'dim-accuracy'     },
  { key: 'business_rule' as const, label: 'Business Rule', icon: '📐', cssClass: 'dim-bizrule'      },
] as const

type TrendDays = 7 | 14 | 30 | 90
type TrendPoint = { date: string; score: number | null; total: number; passed: number }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DomainDetailPage() {
  const { domainId: _domainId } = useParams<{ domainId: string }>()
  const pathname = usePathname()
  const domainId = (_domainId && _domainId !== '__placeholder__')
    ? _domainId
    : pathname.split('/').filter(Boolean).pop() ?? ''

  const { formatTime } = useTimezone()

  const [data,           setData]           = useState<DomainDashboard | null>(null)
  const [recentFailures, setRecentFailures] = useState<any[]>([])
  const [dimensions,     setDimensions]     = useState<DimensionScores | null>(null)
  const [trendDays,      setTrendDays]      = useState<TrendDays>(7)
  const [trendData,      setTrendData]      = useState<TrendPoint[]>([])
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [lastRefreshed,  setLastRefreshed]  = useState<Date>(new Date())
  const [error,          setError]          = useState('')

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const [dRes, rRes, dimRes] = await Promise.allSettled([
        dashboardApi.domain(domainId),
        executionsApi.listRunsEnriched({ domain_id: domainId, status: 'failed', limit: 8 }),
        dashboardApi.dimensions({ domain_id: domainId }),
      ])
      if (dRes.status   === 'fulfilled') setData(dRes.value.data)
      else setError('Failed to load domain data')
      if (rRes.status   === 'fulfilled') setRecentFailures(Array.isArray(rRes.value.data) ? rRes.value.data : [])
      if (dimRes.status === 'fulfilled') setDimensions(dimRes.value.data)
      setLastRefreshed(new Date())
      setError('')
    } catch {
      setError('Failed to load domain data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [domainId])

  const loadTrend = useCallback(async () => {
    try {
      const res = await dashboardApi.domainHistory(domainId, trendDays)
      setTrendData(res.data.trend ?? [])
    } catch {
      // keep previous trend data on error
    }
  }, [domainId, trendDays])

  useEffect(() => {
    loadAll()
    const iv = setInterval(() => loadAll(true), 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [loadAll])

  useEffect(() => { loadTrend() }, [loadTrend])

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="h-screen flex flex-col gap-2 p-4" style={{ background: 'var(--bg)' }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-lg animate-pulse" style={{ height: '64px', background: 'var(--surface)' }} />
      ))}
    </div>
  )

  if (error || !data) return (
    <div className="h-screen flex items-center justify-center p-8" style={{ background: 'var(--bg)' }}>
      <div className="rounded-lg p-4 text-sm max-w-lg"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
        {error || 'Domain not found'}
      </div>
    </div>
  )

  // ── Derived values ─────────────────────────────────────────────────────────

  const score           = data.quality_score ?? 0
  const healthy         = (data.critical_failures ?? 0) === 0
  const subdomains      = data.subdomains ?? []
  const atRiskSubs      = subdomains.filter(s => s.quality_score < 80).length
  const atRiskTables    = data.at_risk_tables ?? []
  const slaBreaches     = data.sla_breaches ?? []
  const scoreDelta = (() => {
    if (!trendData || trendData.length < 2) return 0
    return (trendData[trendData.length - 1]?.score ?? 0) - (trendData[trendData.length - 2]?.score ?? 0)
  })()

  const topIssues = [
    ...slaBreaches.slice(0, 2).map(b => ({
      title: `${b.domain_name} domain below SLA for ${b.days_below_sla} consecutive day${b.days_below_sla !== 1 ? 's' : ''}`,
      detail: `${b.score.toFixed(0)}% quality · table: ${b.table_name}`,
      color: '#dc2626', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)',
      href: `/dashboard/domains/${domainId}`,
    })),
    ...recentFailures.filter(r => r.severity === 'critical').slice(0, 1).map(r => ({
      title: r.rule_name ?? 'Critical rule failure detected',
      detail: `${r.subdomain_name ?? '—'} · ${relTime(r.created_at)}`,
      color: '#c2410c', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)',
      href: `/runs?domain_id=${domainId}&status=failed`,
    })),
  ].slice(0, 3)

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* ── ROW 0: Status bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-1.5 px-4 shrink-0"
        style={{ ...card, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: healthy ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${healthy ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: healthy ? '#22c55e' : '#ef4444' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            {healthy ? 'All Systems Normal' : 'Issues Detected'}
          </div>
          <Breadcrumbs items={[
            { label: 'Global',  href: '/dashboard/global' },
            { label: 'Domains', href: '/dashboard/domains' },
            { label: data.domain_name },
          ]} />
          <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
            <Clock size={11} />
            <span>Updated {formatTime(lastRefreshed)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/runs?domain_id=${domainId}`}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors"
            style={{ background: 'var(--surface-sub)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            View Logs
          </Link>
          <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/export/runs?domain_id=${domainId}&days=30`}
            download
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors"
            style={{ background: 'var(--surface-sub)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <Download size={10} /> Export CSV
          </a>
          <button onClick={() => loadAll(true)} disabled={refreshing}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors disabled:opacity-40"
            style={{ background: 'var(--surface-sub)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── ROW 1: Hero score (1/3) + 6 KPI chips (2/3) ──────────────── */}
      <div className="grid px-3 pt-3 pb-1.5 gap-3 shrink-0" style={{ gridTemplateColumns: '1fr 2fr' }}>

        <div className="rounded-xl p-4 flex flex-col items-center justify-center gap-2 relative"
          style={{ background: 'linear-gradient(145deg,#f0fdf4,#dcfce7,#bbf7d0)', border: '2px solid #86efac', boxShadow: '0 6px 20px rgba(34,197,94,0.18)' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#15803d' }}>Domain Quality Score</span>
          <span className="font-black leading-none tabular-nums" style={{ fontSize: '3rem', color: '#15803d', letterSpacing: '-2px' }}>
            {score > 0 ? `${score.toFixed(1)}%` : '—'}
          </span>
          {Math.abs(scoreDelta) >= 0.05 && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: '#bbf7d0', color: '#15803d', border: '1px solid #86efac' }}>
              {scoreDelta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {scoreDelta > 0 ? '+' : ''}{scoreDelta.toFixed(1)}% vs yesterday
            </span>
          )}
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: '1fr 1fr' }}>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2" style={card}>
            <Globe size={12} style={{ color: 'var(--text-4)' }} />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Subdomains</span>
            <span className="text-2xl font-black tabular-nums" style={{ color: 'var(--text)' }}>{subdomains.length}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>monitored</span>
          </div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2" style={card}>
            <Shield size={12} style={{ color: 'var(--text-4)' }} />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Active Rules</span>
            <span className="text-2xl font-black tabular-nums" style={{ color: 'var(--text)' }}>{data.total_rules ?? 0}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>configured</span>
          </div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            style={{ ...card, background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.25)' }}>
            <CheckCircle size={12} className="text-green-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Passed</span>
            <span className="text-2xl font-black tabular-nums text-green-500">{data.passed_rules ?? 0}</span>
            <span className="text-[9px] font-semibold text-green-500">today</span>
          </div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            style={{ ...card, background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}>
            <XCircle size={12} className="text-red-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Failed</span>
            <span className="text-2xl font-black tabular-nums text-red-500">{data.failed_rules ?? 0}</span>
            <span className="text-[9px] font-semibold text-red-500">today</span>
          </div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            style={{ ...card, background: 'rgba(147,51,234,0.06)', borderColor: 'rgba(147,51,234,0.25)' }}>
            <Activity size={12} className="text-purple-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Critical</span>
            <span className="text-2xl font-black tabular-nums text-purple-500">{data.critical_failures ?? 0}</span>
            <span className="text-[9px] font-semibold text-purple-500">detected</span>
          </div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            style={{ ...card, background: 'rgba(234,88,12,0.06)', borderColor: 'rgba(234,88,12,0.25)' }}>
            <AlertTriangle size={12} className="text-orange-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>At-Risk Subs</span>
            <span className="text-2xl font-black tabular-nums text-orange-500">{atRiskSubs}</span>
            <span className="text-[9px] font-semibold text-orange-500">score &lt; 80%</span>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Quality Trend + Quality Dimensions ──────────────────── */}
      <div className="grid px-3 pb-1.5 gap-3 shrink-0" style={{ gridTemplateColumns: '1fr 1.2fr', minHeight: '160px' }}>

        <div className="rounded-lg p-3 flex flex-col" style={card}>
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Quality Trend</span>
            <div className="flex gap-0.5 rounded p-0.5" style={{ background: 'var(--surface-sub)' }}>
              {([7, 14, 30, 90] as TrendDays[]).map(d => (
                <button key={d} onClick={() => setTrendDays(d)}
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors"
                  style={trendDays === d ? { background: '#6366f1', color: '#fff' } : { color: 'var(--text-3)' }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <QualityTrendChart data={trendData.length ? trendData : (data.quality_trend ?? [])} height={100} area />
          </div>
        </div>

        <div className="rounded-lg p-3 flex flex-col" style={card}>
          <span className="text-[10px] font-semibold uppercase tracking-wider mb-2 shrink-0" style={{ color: 'var(--text-3)' }}>Quality Dimensions</span>
          <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
            {DIMENSIONS.map(({ key, label, icon, cssClass }) => {
              const val = dimensions?.[key] ?? null
              const color = val !== null ? scoreColor(val) : 'var(--text-4)'
              return (
                <div key={key}
                  title={`${label}: ${val !== null ? `${val.toFixed(1)}%` : 'No data'} — based on today's rule executions`}
                  className={`${cssClass} rounded-lg flex flex-col items-center justify-between p-2 cursor-help`}
                  style={{ borderWidth: '1px', borderStyle: 'solid', minHeight: 0 }}>
                  <span className="text-base leading-none">{icon}</span>
                  <span className="text-[9px] uppercase tracking-wide text-center font-medium whitespace-nowrap overflow-hidden text-ellipsis w-full"
                    style={{ color: 'var(--text-3)' }}>
                    {label}
                  </span>
                  <span className="text-lg font-black leading-none tabular-nums" style={{ color }}>
                    {val !== null ? `${val.toFixed(0)}%` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── ROW 3: Subdomain Health ────────────────────────────────────── */}
      <div className="mx-3 mb-1.5 rounded-lg p-3 shrink-0" style={card}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Subdomain Health</span>
          <Link href={`/dashboard/domains/${domainId}`} className="text-[10px] font-medium" style={{ color: '#6366f1' }}>
            → All subdomains
          </Link>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {subdomains.map(sub => {
            const ss = sub.quality_score ?? 0
            const isRisk = ss < 80
            return (
              <Link key={sub.subdomain_id} href={`/dashboard/subdomains/${sub.subdomain_id}`}
                title={`${sub.subdomain_name}: ${ss.toFixed(0)}% quality · ${sub.total_rules} rules — click to navigate`}
                className="flex items-center justify-between rounded px-2 py-1.5 relative transition-opacity hover:opacity-80"
                style={{
                  border: `1px solid ${isRisk ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                  borderLeftColor: scoreBorderColor(ss),
                  borderLeftWidth: '3px',
                  background: isRisk ? 'rgba(239,68,68,0.04)' : 'var(--surface-sub)',
                }}>
                <span className="absolute top-1 right-2 text-[8px]" style={{ color: '#6366f1' }}>↗</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold truncate" style={{ color: isRisk ? '#dc2626' : 'var(--text)' }}>
                    {sub.subdomain_name}{isRisk ? ' ⚠' : ''}
                  </div>
                  <div className="text-[9px]" style={{ color: 'var(--text-4)' }}>{sub.total_rules}r</div>
                </div>
                <span className="text-sm font-black tabular-nums shrink-0" style={{ color: scoreColor(ss) }}>
                  {ss.toFixed(0)}%
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
