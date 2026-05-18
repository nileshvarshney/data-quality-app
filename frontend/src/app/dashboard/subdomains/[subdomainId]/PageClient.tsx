'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, Database, CheckCircle, XCircle, Activity,
  ChevronRight, RefreshCw, Clock, PlayCircle,
} from 'lucide-react'
import { dashboardApi, executionsApi } from '@/services/apiClient'
import QualityTrendChart from '@/components/charts/QualityTrendChart'
import ScoreRing from '@/components/common/ScoreRing'
import SeverityBadge from '@/components/common/SeverityBadge'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { useTheme } from '@/components/layout/ThemeProvider'

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
function relTime(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60) return `${d}s ago`; if (d < 3600) return `${Math.floor(d/60)}m ago`
  if (d < 86400) return `${Math.floor(d/3600)}h ago`; return `${Math.floor(d/86400)}d ago`
}

function TableCard({ a, trackColor }: { a: any; trackColor: string }) {
  const score = a.quality_score ?? 0
  return (
    <Link href={`/dashboard/tables/${a.asset_id}`}
      className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all group block">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate">
            {a.sf_schema_name}.{a.sf_table_name}
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
        <span className="flex items-center gap-1 text-[11px] text-gray-400"><Shield size={10} />{a.total_rules} rules</span>
        <ChevronRight size={11} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
      </div>
    </Link>
  )
}

export default function SubdomainDetailPage() {
  const { subdomainId: _subdomainId } = useParams<{ subdomainId: string }>()
  const pathname = usePathname()
  const subdomainId = (_subdomainId && _subdomainId !== '__placeholder__')
    ? _subdomainId
    : pathname.split('/').filter(Boolean).pop() ?? ''
  const { theme } = useTheme()
  const trackColor = theme === 'dark' ? '#334155' : '#e2e8f0'

  const [data, setData]             = useState<any>(null)
  const [recentFailures, setRecent] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const [dRes, rRes] = await Promise.allSettled([
        dashboardApi.subdomain(subdomainId),
        executionsApi.listRunsEnriched({ subdomain_id: subdomainId, status: 'failed', limit: 8 }),
      ])
      if (dRes.status === 'fulfilled') setData(dRes.value.data)
      if (rRes.status === 'fulfilled') setRecent(Array.isArray(rRes.value.data) ? rRes.value.data : [])
      setLastRefreshed(new Date())
    } finally { setLoading(false); setRefreshing(false) }
  }, [subdomainId])

  useEffect(() => { loadAll() }, [loadAll])

  if (loading) return (
    <div className="p-6 space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-gray-200 rounded-xl animate-pulse" />)}
    </div>
  )
  if (!data) return <div className="p-8 text-gray-500">Subdomain not found</div>

  const score    = data.quality_score ?? 0
  const passTotal = (data.passed_rules ?? 0) + (data.failed_rules ?? 0)
  const passRate  = passTotal > 0 ? (data.passed_rules / passTotal) * 100 : 0
  const refreshedAt = lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <Breadcrumbs items={[
        { label: 'Global', href: '/dashboard/global' },
        { label: data.domain_name || 'Domain', href: `/dashboard/domains/${data.domain_id}` },
        { label: data.subdomain_name },
      ]} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{data.subdomain_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Subdomain quality dashboard</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-400"><Clock size={12} />Updated {refreshedAt}</div>
          <Link href={`/runs?subdomain_id=${subdomainId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-all">
            <PlayCircle size={12} /> Execution Logs
          </Link>
          <button onClick={() => loadAll(true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-40">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Hero: score ring + KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-6">
          <div className="relative shrink-0">
            <ScoreRing score={score} size={120} strokeWidth={10} trackColor={trackColor} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-2xl font-black ${scoreTextColor(score)}`}>{score.toFixed(1)}%</span>
            </div>
          </div>
          <div className="space-y-2 min-w-0">
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-widest font-medium">Quality Score</p>
              <p className={`text-xl font-bold mt-0.5 ${scoreTextColor(score)}`}>{scoreLabel(score)}</p>
            </div>
            <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${scoreBadgeClass(score)}`}>
              {score >= 95 ? 'SLA Met' : score >= 80 ? 'Within Threshold' : 'Below SLA'}
            </span>
            <div className="pt-1 border-t border-gray-100">
              <p className="text-[11px] text-gray-400 mb-1">14-day trend</p>
              <QualityTrendChart data={data.quality_trend || []} height={36} mini />
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 grid grid-cols-2 gap-3">
          {[
            { label: 'Active Rules', value: data.total_rules ?? 0, icon: Shield, bg: 'bg-indigo-50', cls: 'text-indigo-600', sub: 'data quality checks' },
            { label: 'Tables Monitored', value: (data.assets || []).length, icon: Database, bg: 'bg-purple-50', cls: 'text-purple-600', sub: 'Snowflake tables' },
            { label: 'Passed Today', value: data.passed_rules ?? 0, icon: CheckCircle, bg: 'bg-green-50', cls: 'text-green-600', sub: 'rules passed' },
            { label: 'Failed Today', value: data.failed_rules ?? 0, icon: XCircle, bg: (data.failed_rules ?? 0) > 0 ? 'bg-red-50' : 'bg-gray-50', cls: (data.failed_rules ?? 0) > 0 ? 'text-red-500' : 'text-gray-400', sub: 'need attention' },
          ].map(({ label, value, icon: Icon, bg, cls, sub }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`p-1.5 rounded-lg ${bg}`}><Icon size={14} className={cls} /></div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
              </div>
              <p className="text-3xl font-black text-gray-900 tabular-nums">{value}</p>
              <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pass rate */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-blue-600" />
            <p className="text-sm font-semibold text-gray-900">Today&apos;s Pass Rate</p>
          </div>
          <span className={`text-sm font-bold ${scoreTextColor(passRate)}`}>{passRate.toFixed(0)}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${passRate}%`, backgroundColor: scoreFill(passRate) }} />
        </div>
        <div className="flex justify-between text-[11px] text-gray-400 mt-1.5">
          <span>{data.passed_rules ?? 0} passed</span>
          <span>{passTotal} total</span>
          <span>{data.failed_rules ?? 0} failed</span>
        </div>
      </div>

      {/* Tables grid */}
      {(data.assets || []).length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Table Health</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {data.assets.map((a: any) => <TableCard key={a.asset_id} a={a} trackColor={trackColor} />)}
          </div>
        </div>
      )}

      {/* Trend chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Quality Score Trend</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">14-day rolling · green = SLA 95%</p>
          </div>
        </div>
        <QualityTrendChart data={data.quality_trend || []} height={220} area />
      </div>

      {/* Recent failures */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Recent Failures</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Latest failing rules in this subdomain</p>
          </div>
          <Link href={`/runs?subdomain_id=${subdomainId}&status=failed`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            View all <ChevronRight size={12} />
          </Link>
        </div>
        {recentFailures.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle size={36} className="mx-auto mb-2 text-green-400" />
            <p className="text-sm font-medium text-gray-600">No recent failures</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Rule', 'Table', 'Severity', 'Score', 'Failed Rows', 'When'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentFailures.map((r: any, i: number) => (
                  <tr key={r.run_id ?? i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs font-semibold text-gray-900">{r.rule_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-800">{r.sf_table_name ?? '—'}</p>
                      {r.sf_schema_name && <p className="text-[10px] text-gray-400">{r.sf_schema_name}</p>}
                    </td>
                    <td className="px-4 py-3"><SeverityBadge severity={r.severity ?? 'low'} /></td>
                    <td className="px-4 py-3">
                      {r.quality_score != null
                        ? <span className={`text-xs font-bold ${scoreTextColor(r.quality_score)}`}>{r.quality_score.toFixed(0)}%</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">
                      {r.failed_rows_count != null ? r.failed_rows_count.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-400">{r.created_at ? relTime(r.created_at) : '—'}</td>
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
