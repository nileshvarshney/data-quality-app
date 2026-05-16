'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, Database, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, ChevronRight, Clock, Activity, PlayCircle,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
} from 'recharts'
import { dashboardApi, executionsApi } from '@/services/apiClient'
import QualityTrendChart from '@/components/charts/QualityTrendChart'
import ScoreRing from '@/components/common/ScoreRing'
import SeverityBadge from '@/components/common/SeverityBadge'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import MetricInfo, { METRICS } from '@/components/common/MetricInfo'
import { useTheme } from '@/components/layout/ThemeProvider'

// ── Helpers ───────────────────────────────────────────────────────

function scoreTextColor(s: number) {
  if (s >= 95) return 'text-green-600'
  if (s >= 80) return 'text-yellow-600'
  if (s >= 60) return 'text-orange-500'
  return 'text-red-600'
}
function scoreFill(s: number) {
  if (s >= 95) return '#22c55e'
  if (s >= 80) return '#f59e0b'
  if (s >= 60) return '#f97316'
  return '#ef4444'
}
function scoreLabel(s: number) {
  if (s >= 95) return 'Excellent'
  if (s >= 80) return 'Good'
  if (s >= 60) return 'Warning'
  return 'Critical'
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

// ── Subdomain card ────────────────────────────────────────────────

function SubdomainCard({ sub, trackColor }: { sub: any; trackColor: string }) {
  const score = sub.quality_score ?? 0
  return (
    <Link
      href={`/dashboard/subdomains/${sub.subdomain_id}`}
      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all group block"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate">
            {sub.subdomain_name}
          </p>
          <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${scoreBadgeClass(score)}`}>
            {scoreLabel(score)}
          </span>
        </div>
        <div className="relative shrink-0">
          <ScoreRing score={score} size={56} strokeWidth={6} trackColor={trackColor} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-[11px] font-bold ${scoreTextColor(score)}`}>{score.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <span className="flex items-center gap-1 text-[11px] text-gray-400">
          <Shield size={10} />{sub.total_rules} rules
        </span>
        <ChevronRight size={11} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
      </div>
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function DomainDetailPage() {
  const { domainId } = useParams<{ domainId: string }>()
  const { theme }    = useTheme()
  const trackColor   = theme === 'dark' ? '#334155' : '#e2e8f0'

  const [data, setData]                 = useState<any>(null)
  const [recentFailures, setRecentFailures] = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [error, setError]               = useState('')

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const [dRes, rRes] = await Promise.allSettled([
        dashboardApi.domain(domainId),
        executionsApi.listRunsEnriched({ domain_id: domainId, status: 'failed', limit: 8 }),
      ])
      if (dRes.status === 'fulfilled') setData(dRes.value.data)
      else setError('Failed to load domain data')
      if (rRes.status === 'fulfilled') setRecentFailures(Array.isArray(rRes.value.data) ? rRes.value.data : [])
      setLastRefreshed(new Date())
    } catch {
      setError('Failed to load domain data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [domainId])

  useEffect(() => { loadAll() }, [loadAll])

  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="h-40 bg-gray-200 rounded-xl animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}
      </div>
    </div>
  )

  if (error || !data) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        {error || 'Domain not found'}
      </div>
    </div>
  )

  const score    = data.quality_score ?? 0
  const passTotal = (data.passed_rules ?? 0) + (data.failed_rules ?? 0)
  const passRate  = passTotal > 0 ? (data.passed_rules / passTotal) * 100 : 0
  const donut     = [
    { name: 'Passed', value: data.passed_rules ?? 0 },
    { name: 'Failed', value: data.failed_rules ?? 0 },
  ]
  const refreshedAt = lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">

      {/* Breadcrumb */}
      <Breadcrumbs items={[
        { label: 'Domains', href: '/dashboard/domains' },
        { label: data.domain_name },
      ]} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{data.domain_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Domain quality dashboard</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={12} />
            <span>Updated {refreshedAt}</span>
          </div>
          <Link
            href={`/runs?domain_id=${domainId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-all"
          >
            <PlayCircle size={12} /> Execution Logs
          </Link>
          <button
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-40"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Hero: score ring + KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Score ring */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-6">
          <div className="relative shrink-0">
            <ScoreRing score={score} size={120} strokeWidth={10} trackColor={trackColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-black ${scoreTextColor(score)}`}>
                {score > 0 ? `${score.toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>
          <div className="space-y-2 min-w-0">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] text-gray-400 uppercase tracking-widest font-medium">Quality Score</p>
                <MetricInfo metric={METRICS.qualityScore} position="right" />
              </div>
              <p className={`text-xl font-bold mt-0.5 ${scoreTextColor(score)}`}>{scoreLabel(score)}</p>
            </div>
            <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${scoreBadgeClass(score)}`}>
              {score >= 95 ? 'SLA Met' : score >= 80 ? 'Within Threshold' : 'Below SLA'}
            </span>
            <div className="pt-2 border-t border-gray-100">
              <p className="text-[11px] text-gray-400">14-day trend</p>
              <QualityTrendChart data={data.quality_trend || []} height={36} mini />
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div className="lg:col-span-3 grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-indigo-50"><Shield size={14} className="text-indigo-600" /></div>
              <div className="flex items-center gap-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Active Rules</p>
                <MetricInfo metric={METRICS.activeRules} position="top" />
              </div>
            </div>
            <p className="text-3xl font-black text-gray-900 tabular-nums">{data.total_rules ?? 0}</p>
            <p className="text-[11px] text-gray-400 mt-1">data quality checks</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-purple-50"><Database size={14} className="text-purple-600" /></div>
              <div className="flex items-center gap-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Tables</p>
                <MetricInfo metric={METRICS.tablesMonitored} position="top" />
              </div>
            </div>
            <p className="text-3xl font-black text-gray-900 tabular-nums">
              {data.subdomains?.reduce((s: number, sub: any) => s + (sub.total_assets ?? 0), 0) ?? '—'}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">Snowflake tables monitored</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-green-50"><CheckCircle size={14} className="text-green-600" /></div>
              <div className="flex items-center gap-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Passed Today</p>
                <MetricInfo metric={METRICS.passedToday} position="top" />
              </div>
            </div>
            <p className="text-3xl font-black text-gray-900 tabular-nums">{data.passed_rules ?? 0}</p>
            <p className="text-[11px] text-gray-400 mt-1">rules passed all checks</p>
          </div>

          <div className={`bg-white rounded-xl border p-4 ${(data.failed_rules ?? 0) > 0 ? 'border-red-200' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-lg bg-red-50"><XCircle size={14} className="text-red-500" /></div>
              <div className="flex items-center gap-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Failed Today</p>
                <MetricInfo metric={METRICS.failedToday} position="top" />
              </div>
            </div>
            <p className={`text-3xl font-black tabular-nums ${(data.failed_rules ?? 0) > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {data.failed_rules ?? 0}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">rules need attention</p>
          </div>
        </div>
      </div>

      {/* Today's pass rate strip */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-blue-600" />
            <p className="text-sm font-semibold text-gray-900">Today's Pass Rate</p>
          </div>
          <span className={`text-sm font-bold ${scoreTextColor(passRate)}`}>{passRate.toFixed(0)}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${passRate}%`, backgroundColor: scoreFill(passRate) }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-gray-400 mt-1.5">
          <span>{data.passed_rules ?? 0} passed</span>
          <span>{passTotal} total executed</span>
          <span>{data.failed_rules ?? 0} failed</span>
        </div>
      </div>

      {/* Subdomain grid */}
      {(data.subdomains || []).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Subdomain Health</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {data.subdomains.map((sub: any) => (
              <SubdomainCard key={sub.subdomain_id} sub={sub} trackColor={trackColor} />
            ))}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* 14-day area trend */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Quality Score Trend</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">14-day rolling · green = SLA 95%, amber = warning 80%</p>
            </div>
          </div>
          <QualityTrendChart data={data.quality_trend || []} height={220} area />
        </div>

        {/* Rules donut */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Rules Today</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Passed vs. Failed</p>
          </div>
          {passTotal > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={donut}
                    cx="50%" cy="50%"
                    innerRadius={48} outerRadius={68}
                    dataKey="value"
                    paddingAngle={3}
                    startAngle={90} endAngle={-270}
                  >
                    <Cell fill="#22c55e" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <RTooltip formatter={(v: number, name: string) => [`${v} rules`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-5 mt-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs text-gray-600">Passed <strong>{data.passed_rules ?? 0}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs text-gray-600">Failed <strong>{data.failed_rules ?? 0}</strong></span>
                </div>
              </div>
            </>
          ) : (
            <div className="h-[160px] flex flex-col items-center justify-center gap-2 text-gray-400">
              <Activity size={28} className="text-gray-300" />
              <p className="text-sm">No executions today</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent failures */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Recent Failures</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Latest failing rule executions in this domain</p>
          </div>
          <Link href={`/runs?domain_id=${domainId}&status=failed`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            View all <ChevronRight size={12} />
          </Link>
        </div>

        {recentFailures.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle size={36} className="mx-auto mb-2 text-green-400" />
            <p className="text-sm font-medium text-gray-600">No recent failures in this domain</p>
            <p className="text-xs text-gray-400 mt-1">All monitored rules are passing</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="px-5 py-2.5 text-left font-semibold">Rule</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Table</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Subdomain</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Severity</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Score</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Failed Rows</th>
                  <th className="px-4 py-2.5 text-left font-semibold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentFailures.map((run: any, i: number) => (
                  <tr key={run.run_id ?? i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium text-gray-900 truncate max-w-[180px] block">
                        {run.rule_name ?? run.rule_id?.slice(0, 12) ?? '—'}
                      </span>
                      {run.rule_type && (
                        <span className="text-[10px] text-gray-400">{run.rule_type.replace(/_/g, ' ')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-700 font-medium">
                        {run.sf_table_name ?? '—'}
                      </span>
                      {run.sf_schema_name && (
                        <span className="text-[10px] text-gray-400 block">{run.sf_schema_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {run.subdomain_name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={run.severity ?? 'low'} />
                    </td>
                    <td className="px-4 py-3">
                      {run.quality_score != null ? (
                        <span className={`text-xs font-bold ${run.quality_score < 60 ? 'text-red-600' : run.quality_score < 80 ? 'text-orange-500' : 'text-yellow-600'}`}>
                          {run.quality_score.toFixed(0)}%
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">
                      {run.failed_rows_count != null ? run.failed_rows_count.toLocaleString() : '—'}
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
    </div>
  )
}
