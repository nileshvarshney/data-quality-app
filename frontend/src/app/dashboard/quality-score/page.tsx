'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet, Printer } from 'lucide-react'
import { dashboardApi } from '@/services/apiClient'
import { GlobalDashboard, DomainSummary, DimensionScores } from '@/types'
import QualityTrendChart from '@/components/charts/QualityTrendChart'

type TrendDays = 7 | 14 | 30 | 90
type TrendPoint = { date: string; score: number | null; total: number; passed: number }

function scoreColor(s: number) {
  if (s >= 95) return '#22c55e'
  if (s >= 80) return '#f59e0b'
  if (s >= 60) return '#f97316'
  return '#ef4444'
}

const DIMENSIONS = [
  { key: 'completeness'  as const, label: 'Completeness',  icon: '📋' },
  { key: 'freshness'     as const, label: 'Freshness',     icon: '⏱'  },
  { key: 'consistency'   as const, label: 'Consistency',   icon: '🔗' },
  { key: 'accuracy'      as const, label: 'Accuracy',      icon: '🎯' },
  { key: 'business_rule' as const, label: 'Business Rule', icon: '📐' },
]

export default function QualityScorePage() {
  const [global,     setGlobal]     = useState<GlobalDashboard | null>(null)
  const [domains,    setDomains]    = useState<DomainSummary[]>([])
  const [dimensions, setDimensions] = useState<DimensionScores | null>(null)
  const [trendDays,  setTrendDays]  = useState<TrendDays>(30)
  const [trendData,  setTrendData]  = useState<TrendPoint[]>([])
  const [loading,    setLoading]    = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [gRes, dRes, dimRes] = await Promise.allSettled([
        dashboardApi.global(),
        dashboardApi.domains(),
        dashboardApi.dimensions(),
      ])
      if (gRes.status === 'fulfilled')   setGlobal(gRes.value.data)
      if (dRes.status === 'fulfilled')   setDomains(Array.isArray(dRes.value.data) ? dRes.value.data : [])
      if (dimRes.status === 'fulfilled') setDimensions(dimRes.value.data)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTrend = useCallback(async () => {
    try {
      const res = await dashboardApi.trend(trendDays)
      setTrendData(res.data.trend ?? [])
    } catch { /* keep previous */ }
  }, [trendDays])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTrend() }, [loadTrend])

  const score = global?.overall_quality_score ?? 0

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
  }

  if (loading) return (
    <div className="min-h-screen p-6 flex flex-col gap-4" style={{ background: 'var(--bg)' }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
      ))}
    </div>
  )

  return (
    <div className="min-h-screen p-6 flex flex-col gap-4" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/global" className="flex items-center gap-1 text-sm font-medium" style={{ color: '#6366f1' }}>
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
          <span style={{ color: 'var(--text-4)' }}>/</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Quality Score Detail</span>
        </div>
        <div className="flex gap-2">
          <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/export/runs?days=${trendDays}`} download
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <FileSpreadsheet size={14} /> Export CSV
          </a>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg"
            style={{ background: '#6366f1', color: '#fff', border: 'none' }}>
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>

      {/* Hero score */}
      <div className="rounded-xl p-8 flex items-center gap-8"
        style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px solid #86efac', boxShadow: '0 8px 32px rgba(34,197,94,0.12)' }}>
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#15803d' }}>Overall Quality Score</div>
          <div className="font-black tabular-nums leading-none" style={{ fontSize: '5rem', color: '#15803d', letterSpacing: '-3px' }}>
            {score > 0 ? `${score.toFixed(1)}%` : '—'}
          </div>
          <div className="text-sm mt-2 font-medium" style={{ color: '#16a34a' }}>
            {global?.rules_passed_today ?? 0} passed · {global?.rules_failed_today ?? 0} failed today
          </div>
        </div>
        <div className="grid gap-4 flex-1" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {[
            { label: 'Domains',      value: global?.total_domains ?? 0      },
            { label: 'Tables',       value: global?.total_assets ?? 0       },
            { label: 'Active Rules', value: global?.total_active_rules ?? 0 },
            { label: 'Open Alerts',  value: global?.open_alerts ?? 0        },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-black" style={{ color: '#15803d' }}>{value}</div>
              <div className="text-xs mt-0.5" style={{ color: '#16a34a' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Trend + Dimensions */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <div className="rounded-xl p-4" style={card}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Quality Trend</span>
            <div className="flex gap-1 rounded p-0.5" style={{ background: 'var(--surface-sub)' }}>
              {([7, 14, 30, 90] as TrendDays[]).map(d => (
                <button key={d} onClick={() => setTrendDays(d)}
                  className="text-xs font-semibold px-2 py-0.5 rounded transition-colors"
                  style={trendDays === d ? { background: '#6366f1', color: '#fff' } : { color: 'var(--text-3)' }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <QualityTrendChart data={trendData.length ? trendData : (global?.quality_trend ?? [])} height={200} area />
        </div>

        <div className="rounded-xl p-4" style={card}>
          <span className="text-sm font-semibold block mb-3" style={{ color: 'var(--text)' }}>Quality Dimensions</span>
          <div className="flex flex-col gap-3">
            {DIMENSIONS.map(({ key, label, icon }) => {
              const val = dimensions?.[key] ?? null
              const color = val !== null ? scoreColor(val) : 'var(--text-4)'
              return (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>{label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 rounded overflow-hidden" style={{ background: 'var(--surface-sub)' }}>
                      {val !== null && <div className="h-full rounded" style={{ width: `${val}%`, background: color }} />}
                    </div>
                    <span className="text-sm font-bold w-12 text-right tabular-nums" style={{ color }}>
                      {val !== null ? `${val.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Domain breakdown */}
      <div className="rounded-xl p-4" style={card}>
        <span className="text-sm font-semibold block mb-3" style={{ color: 'var(--text)' }}>Domain Breakdown</span>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {domains.map(d => {
            const ds = d.quality_score ?? 0
            return (
              <Link key={d.domain_id} href={`/dashboard/domains/${d.domain_id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 hover:opacity-80 transition-opacity"
                style={{ background: 'var(--surface-sub)', border: '1px solid var(--border)', borderLeftColor: scoreColor(ds), borderLeftWidth: 3 }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{d.domain_name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-4)' }}>{d.total_rules} rules</div>
                </div>
                <span className="text-sm font-black" style={{ color: scoreColor(ds) }}>{ds.toFixed(0)}%</span>
              </Link>
            )
          })}
        </div>
      </div>

    </div>
  )
}
