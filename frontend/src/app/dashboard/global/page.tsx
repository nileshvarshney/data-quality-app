'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Globe, Shield, Database, CheckCircle, XCircle, AlertTriangle,
  Bell, RefreshCw, TrendingDown, TrendingUp, Download, ChevronRight,
  Clock, Activity, Play,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
} from 'recharts'
import { dashboardApi, executionsApi } from '@/services/apiClient'
import { GlobalDashboard, DomainSummary } from '@/types'
import QualityTrendChart from '@/components/charts/QualityTrendChart'
import SeverityBadge from '@/components/common/SeverityBadge'
import { useTimezone } from '@/contexts/TimezoneContext'

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreTextColor(s: number) {
  if (s >= 95) return 'text-green-400'
  if (s >= 80) return 'text-yellow-400'
  if (s >= 60) return 'text-orange-400'
  return 'text-red-400'
}
function scoreFill(s: number) {
  if (s >= 95) return '#22c55e'
  if (s >= 80) return '#f59e0b'
  if (s >= 60) return '#f97316'
  return '#ef4444'
}
function scoreBorderClass(s: number) {
  if (s >= 95) return 'border-l-green-500'
  if (s >= 80) return 'border-l-yellow-500'
  if (s >= 60) return 'border-l-orange-500'
  return 'border-l-red-500'
}
function relTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GlobalDashboardPage() {
  const { formatTime } = useTimezone()

  const [global,         setGlobal]         = useState<GlobalDashboard | null>(null)
  const [domains,        setDomains]        = useState<DomainSummary[]>([])
  const [recentFailures, setRecentFailures] = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [lastRefreshed,  setLastRefreshed]  = useState<Date>(new Date())
  const [error,          setError]          = useState('')

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const [gRes, dRes, rRes] = await Promise.allSettled([
        dashboardApi.global(),
        dashboardApi.domains(),
        executionsApi.listRunsEnriched({ status: 'failed', limit: 8 }),
      ])
      if (gRes.status === 'fulfilled') setGlobal(gRes.value.data)
      if (dRes.status === 'fulfilled') setDomains(Array.isArray(dRes.value.data) ? dRes.value.data : [])
      if (rRes.status === 'fulfilled') setRecentFailures(Array.isArray(rRes.value.data) ? rRes.value.data : [])
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

  const score      = global?.overall_quality_score ?? 0
  const healthy    = (global?.critical_failures ?? 0) === 0
  const passTotal  = (global?.rules_passed_today ?? 0) + (global?.rules_failed_today ?? 0)
  const passRate   = passTotal > 0 ? (global?.rules_passed_today ?? 0) / passTotal * 100 : 0
  const scoreDelta = (() => {
    const t = global?.quality_trend
    if (!t || t.length < 2) return 0
    return (t[t.length - 1]?.score ?? 0) - (t[t.length - 2]?.score ?? 0)
  })()
  const donut = [
    { name: 'Passed', value: global?.rules_passed_today ?? 0 },
    { name: 'Failed', value: global?.rules_failed_today ?? 0 },
  ]

  // ── Loading skeleton ──────────────────────────────────────────────
  if (loading) return (
    <div className="h-screen bg-gray-950 flex flex-col gap-2 p-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 bg-gray-800 rounded animate-pulse" />
      ))}
    </div>
  )

  if (error) return (
    <div className="h-screen bg-gray-950 flex items-center justify-center p-8">
      <div className="bg-red-950 border border-red-800 rounded-lg p-4 text-red-300 text-sm max-w-lg">{error}</div>
    </div>
  )

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col overflow-hidden">

      {/* ── Row 0: Header bar ── */}
      <div className="flex items-center justify-between py-2 px-4 border-b border-gray-800 shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white tracking-tight">⬡ Data Quality Platform</span>
          {/* System status pill */}
          <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            healthy
              ? 'bg-green-950 text-green-400 border-green-800'
              : 'bg-red-950 text-red-400 border-red-800'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            {healthy ? 'All Systems Normal' : 'Issues Detected'}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Clock size={11} />
            <span>Updated {formatTime(lastRefreshed)}</span>
          </div>
        </div>

        {/* Right: quick actions */}
        <div className="flex items-center gap-1.5">
          <Link href="/runs"
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded hover:border-blue-600 hover:text-blue-400 transition-all">
            <Play size={10} /> View Runs
          </Link>
          <Link href="/alerts"
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded hover:border-orange-600 hover:text-orange-400 transition-all">
            <CheckCircle size={10} /> View Alerts
          </Link>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/export/runs?days=30`}
            download
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded hover:border-green-600 hover:text-green-400 transition-all"
          >
            <Download size={10} /> Export CSV
          </a>
          <button
            onClick={() => loadAll(true)} disabled={refreshing}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded hover:border-blue-600 hover:text-blue-400 transition-all disabled:opacity-40"
          >
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Row 1: KPI Strip (8 cards) ── */}
      <div className="grid grid-cols-8 gap-2 px-4 py-2 shrink-0">

        {/* 1. Quality Score */}
        <div className={`bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col justify-between`}>
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Quality Score</span>
          <div className="flex items-end justify-between mt-1">
            <span className={`text-2xl font-black tabular-nums leading-none ${scoreTextColor(score)}`}>
              {score > 0 ? `${score.toFixed(1)}%` : '—'}
            </span>
            {Math.abs(scoreDelta) >= 0.05 && (
              <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${scoreDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {scoreDelta > 0 && <TrendingUp size={9} />}
                {scoreDelta < 0 && <TrendingDown size={9} />}
                {Math.abs(scoreDelta).toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* 2. Domains Monitored */}
        <Link href="/dashboard/domains"
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col justify-between hover:border-blue-700 transition-all group">
          <div className="flex items-center gap-1">
            <Globe size={11} className="text-blue-500" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Domains</span>
          </div>
          <span className="text-2xl font-black tabular-nums text-white leading-none mt-1">
            {global?.total_domains ?? 0}
          </span>
        </Link>

        {/* 3. Tables Monitored */}
        <Link href="/assets"
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col justify-between hover:border-purple-700 transition-all group">
          <div className="flex items-center gap-1">
            <Database size={11} className="text-purple-500" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Tables</span>
          </div>
          <span className="text-2xl font-black tabular-nums text-white leading-none mt-1">
            {global?.total_assets ?? 0}
          </span>
        </Link>

        {/* 4. Active Rules */}
        <Link href="/rules"
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col justify-between hover:border-indigo-700 transition-all group">
          <div className="flex items-center gap-1">
            <Shield size={11} className="text-indigo-500" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Active Rules</span>
          </div>
          <span className="text-2xl font-black tabular-nums text-white leading-none mt-1">
            {global?.total_active_rules ?? 0}
          </span>
        </Link>

        {/* 5. Passed Today */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col justify-between">
          <div className="flex items-center gap-1">
            <CheckCircle size={11} className="text-green-500" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Passed</span>
          </div>
          <span className="text-2xl font-black tabular-nums text-green-400 leading-none mt-1">
            {global?.rules_passed_today ?? 0}
          </span>
        </div>

        {/* 6. Failed Today */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col justify-between">
          <div className="flex items-center gap-1">
            <XCircle size={11} className="text-red-500" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Failed</span>
          </div>
          <span className="text-2xl font-black tabular-nums text-red-400 leading-none mt-1">
            {global?.rules_failed_today ?? 0}
          </span>
        </div>

        {/* 7. Critical Failures */}
        <div className={`rounded-lg px-3 py-2 flex flex-col justify-between border ${
          (global?.critical_failures ?? 0) > 0
            ? 'bg-red-950 border-red-800'
            : 'bg-gray-900 border-gray-800'
        }`}>
          <div className="flex items-center gap-1">
            <AlertTriangle size={11} className={(global?.critical_failures ?? 0) > 0 ? 'text-red-400' : 'text-gray-600'} />
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Critical</span>
          </div>
          <span className={`text-2xl font-black tabular-nums leading-none mt-1 ${
            (global?.critical_failures ?? 0) > 0 ? 'text-red-400' : 'text-gray-600'
          }`}>
            {global?.critical_failures ?? 0}
          </span>
        </div>

        {/* 8. Open Alerts */}
        <Link href="/alerts"
          className={`rounded-lg px-3 py-2 flex flex-col justify-between border hover:border-orange-600 transition-all ${
            (global?.open_alerts ?? 0) > 0
              ? 'bg-orange-950 border-orange-800'
              : 'bg-gray-900 border-gray-800'
          }`}>
          <div className="flex items-center gap-1">
            <Bell size={11} className={(global?.open_alerts ?? 0) > 0 ? 'text-orange-400' : 'text-gray-600'} />
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Alerts</span>
          </div>
          <span className={`text-2xl font-black tabular-nums leading-none mt-1 ${
            (global?.open_alerts ?? 0) > 0 ? 'text-orange-400' : 'text-gray-600'
          }`}>
            {global?.open_alerts ?? 0}
          </span>
        </Link>

      </div>

      {/* ── Row 2: Charts + SLA ── */}
      <div className="px-4 shrink-0" style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1.5fr', gap: '0.5rem' }}>

        {/* Left: QualityTrendChart */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Quality Trend</p>
          <QualityTrendChart data={global?.quality_trend || []} height={140} area />
        </div>

        {/* Center: Today's donut */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Today's Rules</p>
          {passTotal > 0 ? (
            <>
              <div className="flex-1 flex items-center justify-center">
                <ResponsiveContainer width="100%" height={100}>
                  <PieChart>
                    <Pie data={donut} cx="50%" cy="50%"
                      innerRadius={30} outerRadius={44}
                      dataKey="value" paddingAngle={3} startAngle={90} endAngle={-270}>
                      <Cell fill="#22c55e" /><Cell fill="#ef4444" />
                    </Pie>
                    <RTooltip
                      contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '6px', color: '#f3f4f6', fontSize: '11px' }}
                      formatter={(v: number, name: string) => [`${v} rules`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> {global?.rules_passed_today ?? 0}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-red-500" /> {global?.rules_failed_today ?? 0}
                </span>
              </div>
              <p className="text-center text-[10px] text-gray-600 mt-0.5">{passRate.toFixed(0)}% pass rate</p>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-1 text-gray-600">
              <Activity size={22} />
              <p className="text-[10px]">No executions today</p>
            </div>
          )}
        </div>

        {/* Right: SLA Breaches */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">SLA Breaches</p>
          {(global?.sla_breaches?.length ?? 0) === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[11px] text-green-400 font-medium">✓ No SLA breaches</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 overflow-hidden">
              {(global?.sla_breaches ?? []).slice(0, 5).map((b) => (
                <div key={b.table_name + b.domain_name} className="flex items-center justify-between gap-2 py-0.5">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-300 font-medium truncate">{b.table_name}</p>
                    <p className="text-[10px] text-gray-600 truncate">{b.domain_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[11px] font-bold ${scoreTextColor(b.score)}`}>{b.score.toFixed(0)}%</span>
                    <p className="text-[10px] text-red-500">{b.days_below_sla}d below</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Row 3: Domain strip ── */}
      <div className="px-4 py-1 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Domain Health</span>
          <Link href="/dashboard/domains" className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-400">
            → all domains
          </Link>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
            {domains.length === 0 ? (
              <span className="text-[11px] text-gray-600 py-2">No domains loaded</span>
            ) : domains.map(d => {
              const ds = d.quality_score ?? 0
              return (
                <Link
                  key={d.domain_id}
                  href={`/dashboard/domains/${d.domain_id}`}
                  className={`flex-shrink-0 bg-gray-900 border border-gray-800 border-l-4 ${scoreBorderClass(ds)} rounded-lg px-3 py-2 hover:bg-gray-800 hover:border-l-4 transition-all`}
                  style={{ width: '120px', height: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                >
                  <p className="text-[11px] text-gray-300 font-medium truncate leading-tight">{d.domain_name}</p>
                  <div className="flex items-end justify-between">
                    <span className={`text-lg font-black tabular-nums leading-none ${scoreTextColor(ds)}`}>
                      {ds.toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-gray-600">{d.total_rules}r</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Row 4: Bottom tray ── */}
      <div className="px-4 pb-3 flex-1 min-h-0" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: '0.5rem' }}>

        {/* Left: Most At-Risk */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col min-h-0">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 shrink-0">Most At-Risk</p>
          {(global?.at_risk_tables?.length ?? 0) === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[11px] text-green-400 font-medium">✓ All tables healthy</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto flex-1">
              {(global?.at_risk_tables ?? []).slice(0, 5).map((t) => (
                <div key={t.table_name + t.domain_name} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-300 font-medium truncate flex-1 mr-2">{t.table_name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[11px] font-bold ${scoreTextColor(t.score)}`}>{t.score.toFixed(0)}%</span>
                      {t.score_delta < -0.05 && (
                        <span className="text-[10px] text-red-400 font-medium">▼{Math.abs(t.score_delta).toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-gray-700 h-1.5 rounded overflow-hidden">
                    <div className="h-full rounded transition-all" style={{ width: `${t.score}%`, backgroundColor: scoreFill(t.score) }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Center: Recent Failures */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1.5 shrink-0">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Recent Failures</p>
            <Link href="/runs?status=failed" className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-400">
              View all <ChevronRight size={10} />
            </Link>
          </div>
          {recentFailures.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[11px] text-green-400 font-medium">✓ No recent failures</span>
            </div>
          ) : (
            <div className="overflow-auto flex-1 min-h-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-gray-600 uppercase tracking-wide">
                    <th className="text-left pb-1 font-semibold">Rule</th>
                    <th className="text-left pb-1 font-semibold pl-2">Domain</th>
                    <th className="text-left pb-1 font-semibold pl-2">Sev</th>
                    <th className="text-right pb-1 font-semibold pl-2">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {recentFailures.slice(0, 6).map((run: any, i: number) => (
                    <tr key={run.run_id ?? i} className="hover:bg-gray-800 transition-colors">
                      <td className="py-1 pr-2">
                        <span className="text-gray-300 truncate block max-w-[120px]">
                          {run.rule_name ?? run.run_id?.slice(0, 12) ?? '—'}
                        </span>
                      </td>
                      <td className="py-1 pl-2 pr-2">
                        <span className="text-gray-500 truncate block max-w-[80px]">
                          {run.domain_name ?? '—'}
                        </span>
                      </td>
                      <td className="py-1 pl-2 pr-2">
                        <SeverityBadge severity={run.severity ?? 'low'} />
                      </td>
                      <td className="py-1 pl-2 text-right text-gray-600 whitespace-nowrap">
                        {run.created_at ? relTime(run.created_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Recently Fixed */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex flex-col min-h-0">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 shrink-0">Recently Fixed</p>
          {(global?.recently_fixed?.length ?? 0) === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[11px] text-green-400 font-medium">✓ No recent fixes</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto flex-1">
              {(global?.recently_fixed ?? []).slice(0, 3).map((f) => (
                <div key={f.rule_name + f.table_name} className="flex flex-col gap-0.5 border-b border-gray-800 pb-1.5 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[11px] text-gray-300 font-medium truncate flex-1">{f.rule_name}</span>
                    <span className="text-[11px] font-bold text-green-400 shrink-0">{f.new_score.toFixed(0)}%</span>
                  </div>
                  <span className="text-[10px] text-gray-600 truncate">{f.table_name}</span>
                  <span className="text-[10px] text-gray-600">fixed {relTime(f.fixed_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  )
}
