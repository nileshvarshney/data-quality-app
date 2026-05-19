'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, Database, CheckCircle, XCircle,
  RefreshCw, ChevronRight, ChevronLeft, Activity,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
} from 'recharts'
import { dashboardApi, executionsApi } from '@/services/apiClient'
import QualityTrendChart from '@/components/charts/QualityTrendChart'
import ScoreRing from '@/components/common/ScoreRing'
import SeverityBadge from '@/components/common/SeverityBadge'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { useTheme } from '@/components/layout/ThemeProvider'

// ── Helpers ───────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 95) return 'text-green-400'
  if (s >= 80) return 'text-yellow-400'
  if (s >= 60) return 'text-orange-400'
  return 'text-red-400'
}
function relTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const TABLE_PAGE_SIZE = 6

// ── Page ──────────────────────────────────────────────────────────

export default function SubdomainDetailPage() {
  const { subdomainId: _subdomainId } = useParams<{ subdomainId: string }>()
  const pathname = usePathname()
  const subdomainId = (_subdomainId && _subdomainId !== '__placeholder__')
    ? _subdomainId
    : pathname.split('/').filter(Boolean).pop() ?? ''
  const { theme } = useTheme()
  const trackColor = theme === 'dark' ? '#334155' : '#e2e8f0'

  const [data, setData]                     = useState<any>(null)
  const [recentFailures, setRecentFailures] = useState<any[]>([])
  const [loading, setLoading]               = useState(true)
  const [refreshing, setRefreshing]         = useState(false)
  const [error, setError]                   = useState('')
  const [tablePage, setTablePage]           = useState(0)

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const [dRes, rRes] = await Promise.allSettled([
        dashboardApi.subdomain(subdomainId),
        executionsApi.listRunsEnriched({ subdomain_id: subdomainId, status: 'failed', limit: 8 }),
      ])
      if (dRes.status === 'fulfilled') setData(dRes.value.data)
      else setError('Failed to load subdomain data')
      if (rRes.status === 'fulfilled') setRecentFailures(Array.isArray(rRes.value.data) ? rRes.value.data : [])
    } catch {
      setError('Failed to load subdomain data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [subdomainId])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Loading ────────────────────────────────────────────────────

  if (loading) return (
    <div className="p-4 space-y-3">
      <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
      <div className="h-8 w-56 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}
      </div>
      <div className="h-64 bg-gray-200 rounded-lg animate-pulse" />
    </div>
  )

  // ── Error ──────────────────────────────────────────────────────

  if (error || !data) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        {error || 'Subdomain not found'}
      </div>
    </div>
  )

  // ── Derived values ─────────────────────────────────────────────

  const score       = data.quality_score ?? 0
  const passedRules = data.passed_rules ?? 0
  const failedRules = data.failed_rules ?? 0
  const totalRules  = data.total_rules ?? 0
  const assets      = data.assets ?? []
  const failures    = recentFailures.slice(0, 5)

  // Pagination
  const totalPages  = Math.ceil(assets.length / TABLE_PAGE_SIZE)
  const pagedAssets = assets.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE)

  const donut = [
    { name: 'Passed', value: passedRules },
    { name: 'Failed', value: failedRules },
  ]
  const passTotal = passedRules + failedRules

  return (
    <div className="flex flex-col gap-2 p-4 h-full max-w-[1600px] overflow-hidden">

      {/* Breadcrumb */}
      <Breadcrumbs items={[
        { label: 'Global', href: '/dashboard/global' },
        { label: data.domain_name || 'Domain', href: `/dashboard/domains/${data.domain_id}` },
        { label: data.subdomain_name },
      ]} />

      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-lg font-semibold text-gray-900">{data.subdomain_name}</h1>

        {/* Quality score badge */}
        <span className={`inline-flex items-center gap-1 bg-gray-800 rounded px-2 py-0.5 text-sm font-semibold ${scoreColor(score)}`}>
          {score > 0 ? `${score.toFixed(1)}%` : '—'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/runs?subdomain_id=${subdomainId}`}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-all"
          >
            View Logs
          </Link>
          <button
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-40"
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-2">

        {/* Active Rules */}
        <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-indigo-50 shrink-0">
            <Shield size={13} className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium leading-none">Active Rules</p>
            <p className="text-xl font-black text-gray-900 tabular-nums leading-tight">{totalRules}</p>
          </div>
        </div>

        {/* Tables Monitored */}
        <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-purple-50 shrink-0">
            <Database size={13} className="text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium leading-none">Tables Monitored</p>
            <p className="text-xl font-black text-gray-900 tabular-nums leading-tight">{assets.length}</p>
          </div>
        </div>

        {/* Passed Today */}
        <div className="bg-white rounded-lg border border-gray-200 px-3 py-2 flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-green-50 shrink-0">
            <CheckCircle size={13} className="text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium leading-none">Passed Today</p>
            <p className="text-xl font-black text-green-600 tabular-nums leading-tight">{passedRules}</p>
          </div>
        </div>

        {/* Failed Today */}
        <div className={`bg-white rounded-lg border px-3 py-2 flex items-center gap-2 ${failedRules > 0 ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
          <div className={`p-1.5 rounded-md shrink-0 ${failedRules > 0 ? 'bg-red-100' : 'bg-red-50'}`}>
            <XCircle size={13} className="text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium leading-none">Failed Today</p>
            <p className={`text-xl font-black tabular-nums leading-tight ${failedRules > 0 ? 'text-red-600' : 'text-gray-900'}`}>{failedRules}</p>
          </div>
        </div>
      </div>

      {/* Body: 3fr / 2fr */}
      <div className="grid gap-2 min-h-0" style={{ gridTemplateColumns: '3fr 2fr' }}>

        {/* Left: Table health list */}
        <div className="bg-white rounded-lg border border-gray-200 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-gray-100 shrink-0 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Table Health</p>
            <span className="text-[10px] text-gray-400">{assets.length} table{assets.length !== 1 ? 's' : ''}</span>
          </div>
          {assets.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-400 p-4">
              No tables configured
            </div>
          ) : (
            <>
              <div className="overflow-y-auto flex-1">
                {pagedAssets.map((a: any) => {
                  const assetScore = a.quality_score ?? 0
                  return (
                    <div
                      key={a.asset_id}
                      className="flex items-center gap-2 px-3 border-b border-gray-50 last:border-0 group"
                      style={{ minHeight: 40 }}
                    >
                      {/* Score ring */}
                      <div className="relative shrink-0">
                        <ScoreRing score={assetScore} size={32} strokeWidth={3} trackColor={trackColor} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-[8px] font-bold ${scoreColor(assetScore)}`}>{assetScore.toFixed(0)}</span>
                        </div>
                      </div>

                      {/* Table name */}
                      <Link
                        href={`/dashboard/tables/${a.asset_id}`}
                        className="flex-1 text-xs font-medium text-gray-800 hover:text-blue-700 transition-colors truncate"
                      >
                        {a.sf_schema_name}.{a.sf_table_name}
                      </Link>

                      {/* Score % */}
                      <span className={`text-[10px] font-bold tabular-nums shrink-0 ${scoreColor(assetScore)}`}>
                        {assetScore.toFixed(1)}%
                      </span>

                      {/* Pass/fail counts */}
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                        <span className="text-green-600 font-semibold">{a.passed_rules ?? 0}P</span>
                        <span className="text-red-500 font-semibold">{a.failed_rules ?? 0}F</span>
                      </div>

                      <ChevronRight size={11} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
                    </div>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 shrink-0">
                  <span className="text-[10px] text-gray-400">
                    {tablePage * TABLE_PAGE_SIZE + 1}–{Math.min((tablePage + 1) * TABLE_PAGE_SIZE, assets.length)} of {assets.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setTablePage(p => Math.max(0, p - 1))}
                      disabled={tablePage === 0}
                      className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-200 rounded hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={10} /> Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setTablePage(i)}
                        className={`w-5 h-5 text-[10px] font-medium rounded transition-colors ${
                          i === tablePage ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={tablePage === totalPages - 1}
                      className="flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-200 rounded hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next <ChevronRight size={10} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Trend chart + Donut */}
        <div className="flex flex-col gap-2 min-h-0">

          {/* Quality Trend Chart */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 flex-1 min-h-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Quality Trend (14-day)</p>
            <QualityTrendChart data={data.quality_trend || []} height={140} area />
          </div>

          {/* Pass/Fail Donut */}
          <div className="bg-white rounded-lg border border-gray-200 p-3 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Rules Today</p>
            {passTotal > 0 ? (
              <div className="flex items-center gap-3">
                <ResponsiveContainer width={72} height={72}>
                  <PieChart>
                    <Pie
                      data={donut}
                      cx="50%" cy="50%"
                      innerRadius={24} outerRadius={34}
                      dataKey="value"
                      paddingAngle={2}
                      startAngle={90} endAngle={-270}
                    >
                      <Cell fill="#22c55e" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <RTooltip formatter={(v: number, name: string) => [`${v} rules`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                    <span className="text-xs text-gray-600">Passed <strong>{passedRules}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <span className="text-xs text-gray-600">Failed <strong>{failedRules}</strong></span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-16 flex items-center justify-center gap-2 text-gray-400">
                <Activity size={18} className="text-gray-300" />
                <p className="text-xs">No executions today</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Failures strip */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shrink-0">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Recent Failures</p>
            {failures.length > 0 && (
              <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{failures.length}</span>
            )}
          </div>
          <Link
            href={`/runs?subdomain_id=${subdomainId}&status=failed`}
            className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
          >
            View all <ChevronRight size={11} />
          </Link>
        </div>

        {failures.length === 0 ? (
          <div className="px-3 py-3 text-xs text-green-600 flex items-center gap-1.5">
            <CheckCircle size={13} className="text-green-500" />
            No recent failures
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="px-3 py-1.5 text-left font-semibold">Rule</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Table</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Sev</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Score</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Failed Rows</th>
                  <th className="px-3 py-1.5 text-left font-semibold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {failures.map((run: any, i: number) => (
                  <tr key={run.run_id ?? i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-1.5">
                      <span className="font-medium text-gray-900 truncate max-w-[160px] block">
                        {run.rule_name ?? run.rule_id?.slice(0, 12) ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-gray-700 font-medium truncate max-w-[120px] block">
                        {run.sf_table_name ?? '—'}
                      </span>
                      {run.sf_schema_name && (
                        <span className="text-[10px] text-gray-400 block">{run.sf_schema_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <SeverityBadge severity={run.severity ?? 'low'} />
                    </td>
                    <td className="px-3 py-1.5">
                      {run.quality_score != null
                        ? <span className={`font-bold ${scoreColor(run.quality_score)}`}>{run.quality_score.toFixed(0)}%</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 tabular-nums">
                      {run.failed_rows_count != null ? run.failed_rows_count.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">
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
