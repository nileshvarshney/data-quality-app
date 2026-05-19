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
      {/* Rows rendered in Tasks 5–8 */}
    </div>
  )
}
