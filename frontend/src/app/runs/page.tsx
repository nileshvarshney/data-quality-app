'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ChevronDown, ChevronRight, RefreshCw, Loader2, Filter,
  CheckCircle, XCircle, AlertTriangle, AlertCircle, Clock,
  Code2, FileText, BarChart3, ChevronUp, Search, X,
  Activity, TrendingUp, Download, Calendar, Bot,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, ReferenceLine, AreaChart, Area,
} from 'recharts'
import clsx from 'clsx'
import { Fragment } from 'react'
import { executionsApi, domainsApi, assetsApi, rulesApi, subdomainsApi, aiApi } from '@/services/apiClient'
import { useTimezone } from '@/contexts/TimezoneContext'
import MetricInfo, { METRICS } from '@/components/common/MetricInfo'
import Tooltip from '@/components/common/Tooltip'

// ── Types ─────────────────────────────────────────────────────────

interface EnrichedRun {
  run_id: string; rule_id: string; asset_id: string; domain_id: string; subdomain_id: string
  status: 'passed' | 'failed' | 'warning' | 'error' | 'skipped'
  total_rows_scanned: number | null; failed_rows_count: number | null
  passed_rows_count: number | null; failure_percentage: number | null
  quality_score: number | null; error_message: string | null
  executed_sql: string | null; ai_explanation: string | null
  execution_start_time: string | null; execution_end_time: string | null
  duration_ms: number | null; created_at: string
  rule_name: string; rule_description: string | null; rule_type: string; severity: string
  sf_database_name: string | null; sf_schema_name: string; sf_table_name: string
  domain_name: string; subdomain_name: string
}

// ── Constants ─────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  passed: '#22c55e', failed: '#ef4444', error: '#f97316', warning: '#eab308', skipped: '#9ca3af',
}
const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string; rowCls: string }> = {
  passed:  { label: 'Passed',  icon: <CheckCircle   size={12} />, cls: 'bg-green-100 text-green-800',   rowCls: '' },
  failed:  { label: 'Failed',  icon: <XCircle       size={12} />, cls: 'bg-red-100 text-red-800',       rowCls: 'bg-red-50/30' },
  warning: { label: 'Warning', icon: <AlertTriangle size={12} />, cls: 'bg-yellow-100 text-yellow-800', rowCls: 'bg-yellow-50/30' },
  error:   { label: 'Error',   icon: <AlertCircle   size={12} />, cls: 'bg-orange-100 text-orange-800', rowCls: 'bg-orange-50/30' },
  skipped: { label: 'Skipped', icon: <Clock         size={12} />, cls: 'bg-gray-100 text-gray-500',     rowCls: '' },
}
const SEV_CLS: Record<string, string> = {
  critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium', low: 'badge-low',
}
const PAGE_SIZES = [10, 25, 50, 100]

// ── Date helpers ──────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultDateFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return toISODate(d)
}

function defaultDateTo(): string {
  return toISODate(new Date())
}

// ── Helpers ───────────────────────────────────────────────────────

const fmtDur  = (ms: number | null) => ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
const fmtRows = (n: number | null)  => n == null ? '—' : n.toLocaleString()
const fmtDate = (iso: string)       => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }
const toLabel = (name: string)      => name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bId\b/g, 'ID')
const scoreColor = (s: number)      => s >= 95 ? 'text-green-600' : s >= 80 ? 'text-yellow-600' : 'text-red-600'

function DeltaBadgeInline({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null) return null
  const delta = current - previous
  if (Math.abs(delta) < 0.1) return <span className="text-[10px] text-gray-400 ml-1">—</span>
  const up = delta > 0
  const tip = up
    ? `+${Math.abs(delta).toFixed(1)}% vs previous run — quality improved`
    : `−${Math.abs(delta).toFixed(1)}% vs previous run — quality degraded`
  return (
    <Tooltip text={tip} position="top" className="inline-flex">
      <span className={clsx('text-[10px] font-semibold ml-1 cursor-help', up ? 'text-green-600' : 'text-red-500')}>
        {up ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}%
      </span>
    </Tooltip>
  )
}

// ── Status badge ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.error
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full', cfg.cls)}>
      {cfg.icon}{cfg.label}
    </span>
  )
}

// ── KPI summary strip ─────────────────────────────────────────────

function SummaryStrip({ runs }: { runs: EnrichedRun[] }) {
  const counts = runs.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {} as Record<string, number>)
  const scores = runs.flatMap(r => r.quality_score != null ? [r.quality_score] : [])
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  const items = [
    { label: 'Total Runs',   value: runs.length,            icon: Activity,       iconCls: 'text-blue-600',   iconBg: 'bg-blue-50' },
    { label: 'Passed',       value: counts.passed  || 0,    icon: CheckCircle,    iconCls: 'text-green-600',  iconBg: 'bg-green-50' },
    { label: 'Failed',       value: counts.failed  || 0,    icon: XCircle,        iconCls: 'text-red-500',    iconBg: 'bg-red-50' },
    { label: 'Errors',       value: counts.error   || 0,    icon: AlertCircle,    iconCls: 'text-orange-500', iconBg: 'bg-orange-50' },
    { label: 'Warnings',     value: counts.warning || 0,    icon: AlertTriangle,  iconCls: 'text-yellow-500', iconBg: 'bg-yellow-50' },
    { label: 'Avg Score',    value: avgScore != null ? `${avgScore.toFixed(1)}%` : '—', icon: TrendingUp, iconCls: 'text-indigo-600', iconBg: 'bg-indigo-50' },
  ]

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map(({ label, value, icon: Icon, iconCls, iconBg }) => (
        <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
          <div className={clsx('p-2 rounded-lg shrink-0', iconBg)}>
            <Icon size={15} className={iconCls} />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900 leading-tight tabular-nums">{value}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color || p.fill }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.value % 1 !== 0 ? p.value.toFixed(1) : p.value}</strong>
          {['avg', 'min', 'max'].includes(p.name) ? '%' : ''}
        </p>
      ))}
    </div>
  )
}

// ── Analytics panel ───────────────────────────────────────────────

function AnalyticsPanel({ runs }: { runs: EnrichedRun[] }) {
  const [open, setOpen] = useState(true)

  const { statusPie, dailyBar, scoreTrend, topFailing } = useMemo(() => {
    const statusCounts: Record<string, number> = {}
    runs.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1 })
    const statusPie = Object.entries(statusCounts).map(([name, value]) => ({ name, value }))

    const dailyMap: Record<string, Record<string, number>> = {}
    runs.forEach(r => {
      const d = r.created_at.slice(0, 10)
      if (!dailyMap[d]) dailyMap[d] = { passed: 0, failed: 0, error: 0, warning: 0 }
      if (['passed', 'failed', 'error', 'warning'].includes(r.status)) dailyMap[d][r.status]++
    })
    const dailyBar = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b)).slice(-14)
      .map(([date, c]) => ({ date: fmtDate(date), ...c }))

    const scoreMap: Record<string, number[]> = {}
    runs.forEach(r => {
      if (r.quality_score == null) return
      const d = r.created_at.slice(0, 10)
      if (!scoreMap[d]) scoreMap[d] = []
      scoreMap[d].push(r.quality_score)
    })
    const scoreTrend = Object.entries(scoreMap)
      .sort(([a], [b]) => a.localeCompare(b)).slice(-14)
      .map(([date, sc]) => ({
        date: fmtDate(date),
        avg: Math.round(sc.reduce((a, b) => a + b, 0) / sc.length * 10) / 10,
        min: Math.min(...sc),
      }))

    const failMap: Record<string, { name: string; failed: number; error: number }> = {}
    runs.forEach(r => {
      if (!['failed', 'error'].includes(r.status)) return
      if (!failMap[r.rule_id]) failMap[r.rule_id] = { name: (r.rule_description || toLabel(r.rule_name)).slice(0, 30), failed: 0, error: 0 }
      if (r.status === 'failed') failMap[r.rule_id].failed++
      else failMap[r.rule_id].error++
    })
    const topFailing = Object.values(failMap)
      .sort((a, b) => (b.failed + b.error) - (a.failed + a.error)).slice(0, 8)

    return { statusPie, dailyBar, scoreTrend, topFailing }
  }, [runs])

  if (runs.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-blue-600" />
          <span className="text-sm font-semibold text-gray-900">Analytics</span>
          <span className="text-[11px] text-gray-400">execution trends and failure analysis</span>
        </div>
        {open
          ? <ChevronUp   size={15} className="text-gray-400" />
          : <ChevronDown size={15} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          {/* Row 1 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Status Breakdown</p>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%" innerRadius={44} outerRadius={66}
                    dataKey="value" paddingAngle={2}>
                    {statusPie.map(e => <Cell key={e.name} fill={STATUS_COLORS[e.name] || '#9ca3af'} />)}
                  </Pie>
                  <RTooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={7}
                    formatter={v => <span className="text-[11px] text-gray-600 capitalize">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Daily Runs by Status (14 days)</p>
              {dailyBar.length < 2
                ? <p className="text-xs text-gray-400 italic pt-8 text-center">Need runs on 2+ days to show trend</p>
                : (
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={dailyBar} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RTooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={7}
                        formatter={v => <span className="text-[11px] text-gray-600 capitalize">{v}</span>} />
                      <Bar dataKey="passed"  stackId="s" fill={STATUS_COLORS.passed}  />
                      <Bar dataKey="warning" stackId="s" fill={STATUS_COLORS.warning} />
                      <Bar dataKey="error"   stackId="s" fill={STATUS_COLORS.error}   />
                      <Bar dataKey="failed"  stackId="s" fill={STATUS_COLORS.failed}  radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Quality Score Trend</p>
              {scoreTrend.length < 2
                ? <p className="text-xs text-gray-400 italic pt-8 text-center">Need runs on 2+ days to show trend</p>
                : (
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={scoreTrend} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <RTooltip content={<CustomTooltip />} />
                      <ReferenceLine y={95} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} />
                      <ReferenceLine y={80} stroke="#eab308" strokeDasharray="4 4" strokeWidth={1} />
                      <Area type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2}
                        fill="url(#scoreGrad)" dot={{ r: 3 }} name="Avg Score" connectNulls={false} />
                      <Line type="monotone" dataKey="min" stroke="#f87171" strokeWidth={1.5}
                        strokeDasharray="4 2" dot={false} name="Min" connectNulls={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Top Failing Rules</p>
              {topFailing.length === 0
                ? <div className="flex items-center justify-center h-[150px]"><p className="text-xs text-gray-400 italic">No failures in current filter</p></div>
                : (
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={topFailing} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                      <RTooltip content={<CustomTooltip />} />
                      <Bar dataKey="failed" stackId="b" fill={STATUS_COLORS.failed} name="Failed" />
                      <Bar dataKey="error"  stackId="b" fill={STATUS_COLORS.error}  name="Error"  radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sample records panel ──────────────────────────────────────────

function SampleRecordsPanel({ runId }: { runId: string }) {
  const [samples, setSamples] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await executionsApi.getRunSamples(runId)
      setSamples(Array.isArray(res.data) ? res.data : [])
    } finally { setLoading(false); setFetched(true) }
  }

  if (!fetched) return (
    <button onClick={load} className="text-xs text-blue-600 hover:underline flex items-center gap-1.5 font-medium">
      <FileText size={12} /> Load sample records
    </button>
  )
  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <Loader2 size={11} className="animate-spin" /> Loading samples…
    </div>
  )
  if (samples.length === 0) return (
    <p className="text-xs text-gray-400 italic">No sample records captured for this run</p>
  )

  const keys = Object.keys(samples[0]?.failed_record ?? {})
  return (
    <div className="overflow-x-auto rounded-lg border border-red-100 mt-1">
      <table className="text-xs w-full border-collapse">
        <thead className="bg-red-50">
          <tr>
            {keys.map(k => (
              <th key={k} className="px-3 py-2 text-left font-semibold text-red-700 uppercase tracking-wide text-[10px] whitespace-nowrap">{k}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-red-50">
          {samples.slice(0, 5).map((s: any, i: number) => (
            <tr key={i} className="hover:bg-red-50/40">
              {keys.map(k => (
                <td key={k} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                  {s.failed_record?.[k] !== null && s.failed_record?.[k] !== undefined
                    ? String(s.failed_record[k])
                    : <span className="text-gray-400 italic">null</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {samples.length > 5 && (
        <p className="text-[10px] text-gray-400 px-3 py-1.5 border-t border-red-50">
          Showing 5 of {samples.length} sample records
        </p>
      )}
    </div>
  )
}

// ── AI explanation panel ──────────────────────────────────────────

function AIExplainPanel({ runId, ruleId, storedExplanation }: { runId: string; ruleId: string; storedExplanation?: string | null }) {
  const [explanation, setExplanation] = useState(storedExplanation || '')
  const [loading, setLoading]         = useState(false)
  const [fetched, setFetched]         = useState(!!storedExplanation)
  const [error, setError]             = useState('')

  const explain = async () => {
    setLoading(true); setError('')
    try {
      const res = await aiApi.explainFailure({ run_id: runId, rule_id: ruleId })
      setExplanation(res.data.explanation || 'No explanation returned.')
      setFetched(true)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'AI explanation failed. Check LLM configuration in Settings.')
    } finally { setLoading(false) }
  }

  if (!fetched && !loading) return (
    <button onClick={explain} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
      <Bot size={12} /> Ask AI to explain this failure
    </button>
  )
  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <Loader2 size={11} className="animate-spin" /> Generating AI explanation…
    </div>
  )
  if (error) return <p className="text-xs text-red-500">{error}</p>

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-900 leading-relaxed whitespace-pre-wrap">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-blue-700">
          <Bot size={12} /> AI Analysis
        </div>
        <button onClick={explain} className="text-[10px] text-blue-500 hover:text-blue-700 hover:underline">
          Regenerate
        </button>
      </div>
      {explanation}
    </div>
  )
}

// ── Expanded run detail ───────────────────────────────────────────

function RunDetail({ run }: { run: EnrichedRun }) {
  const { formatTs } = useTimezone()
  const isFailure = run.status === 'failed' || run.status === 'error'
  const [tab, setTab] = useState<'overview' | 'sql' | 'error' | 'samples' | 'ai'>('overview')

  const tabs = [
    { id: 'overview', label: 'Overview',         icon: <BarChart3 size={12} /> },
    { id: 'sql',      label: 'SQL',              icon: <Code2     size={12} /> },
    { id: 'samples',  label: 'Sample Records',   icon: <FileText  size={12} />, show: isFailure },
    { id: 'ai',       label: 'AI Analysis',      icon: <Bot       size={12} />, show: isFailure },
    { id: 'error',    label: 'Error',            icon: <AlertCircle size={12} />, show: !!run.error_message },
  ].filter(t => t.show !== false)

  return (
    <tr>
      <td colSpan={8} className="px-5 py-0 bg-slate-50 border-b border-gray-200">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden my-3 shadow-sm">
          <div className="flex border-b border-gray-100 bg-gray-50">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={clsx('flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px',
                  tab === t.id
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100')}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {tab === 'overview' && (
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total Rows Scanned', value: fmtRows(run.total_rows_scanned) },
                  { label: 'Failed Rows',         value: fmtRows(run.failed_rows_count) },
                  { label: 'Passed Rows',         value: fmtRows(run.passed_rows_count) },
                  { label: 'Failure Rate',        value: run.failure_percentage != null ? `${run.failure_percentage.toFixed(2)}%` : '—' },
                  { label: 'Quality Score',       value: run.quality_score != null ? `${run.quality_score}%` : '—' },
                  { label: 'Duration',            value: fmtDur(run.duration_ms) },
                  { label: 'Started',             value: run.execution_start_time ? formatTs(run.execution_start_time, { withSeconds: true }) : '—' },
                  { label: 'Finished',            value: run.execution_end_time   ? formatTs(run.execution_end_time,   { withSeconds: true }) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            )}
            {tab === 'sql' && (
              run.executed_sql
                ? <pre className="text-xs font-mono bg-gray-900 text-green-300 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed">{run.executed_sql}</pre>
                : <p className="text-sm text-gray-400 italic">No SQL recorded for this run</p>
            )}
            {tab === 'samples' && (
              <div>
                <p className="text-[10px] font-semibold text-red-600 mb-2 uppercase tracking-widest">Sample Failed Records</p>
                <SampleRecordsPanel runId={run.run_id} />
              </div>
            )}
            {tab === 'ai' && (
              <div>
                <p className="text-[10px] font-semibold text-blue-600 mb-2 uppercase tracking-widest">AI Analysis</p>
                <AIExplainPanel runId={run.run_id} ruleId={run.rule_id} storedExplanation={run.ai_explanation} />
              </div>
            )}
            {tab === 'error' && (
              <div>
                <p className="text-[10px] font-semibold text-red-600 mb-1.5 uppercase tracking-widest">Error Message</p>
                <pre className="text-xs font-mono bg-red-50 text-red-800 border border-red-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{run.error_message}</pre>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ── Active filter chip ────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[11px] font-medium">
      {label}
      <button onClick={onRemove} className="hover:bg-blue-200 rounded-full p-0.5 transition-colors">
        <X size={10} />
      </button>
    </span>
  )
}

// ── Pagination ────────────────────────────────────────────────────

function Pagination({ page, pageSize, total, onChange, onSizeChange }: {
  page: number; pageSize: number; total: number
  onChange: (p: number) => void; onSizeChange: (s: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = Math.min((page - 1) * pageSize + 1, total)
  const end   = Math.min(page * pageSize, total)

  const pages: (number | '…')[] = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4)             return [1, 2, 3, 4, 5, '…', totalPages]
    if (page >= totalPages - 3) return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '…', page - 1, page, page + 1, '…', totalPages]
  })()

  const btnBase = 'min-w-[30px] h-7 px-2 text-xs rounded border transition-colors'

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
      <div className="flex items-center gap-3">
        <p className="text-xs text-gray-500">
          Showing <span className="font-semibold text-gray-700">{start}–{end}</span> of{' '}
          <span className="font-semibold text-gray-700">{total}</span> runs
        </p>
        <select
          value={pageSize}
          onChange={e => { onSizeChange(Number(e.target.value)); onChange(1) }}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s} per page</option>)}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button disabled={page === 1} onClick={() => onChange(page - 1)}
          className={clsx(btnBase, 'border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed')}>
          ← Prev
        </button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} className="text-xs text-gray-400 px-1">…</span>
            : (
              <button key={p} onClick={() => onChange(p as number)}
                className={clsx(btnBase, page === p
                  ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                  : 'border-gray-200 text-gray-600 hover:bg-white')}>
                {p}
              </button>
            )
        )}
        <button disabled={page === totalPages} onClick={() => onChange(page + 1)}
          className={clsx(btnBase, 'border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed')}>
          Next →
        </button>
      </div>
    </div>
  )
}

// ── Date preset button ────────────────────────────────────────────

function DatePreset({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors',
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
      )}
    >
      {label}
    </button>
  )
}

// ── Styles shared ─────────────────────────────────────────────────

const SEL = 'text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors'
const DATE_INPUT = 'text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors'

// ── Main page ─────────────────────────────────────────────────────

export default function RunsPage() {
  const searchParams = useSearchParams()
  const { formatTs, abbr, formatTime } = useTimezone()

  const [runs,       setRuns]       = useState<EnrichedRun[]>([])
  const [domains,    setDomains]    = useState<any[]>([])
  const [subdomains, setSubdomains] = useState<any[]>([])
  const [assets,     setAssets]     = useState<any[]>([])
  const [rules,      setRules]      = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

  // Date range — default last 3 days
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo,   setDateTo]   = useState(defaultDateTo)

  // Track which preset is active
  const [activePreset, setActivePreset] = useState<string>('3d')

  // Filters
  const [domainFilter,    setDomainFilter]    = useState(searchParams.get('domain_id')    || '')
  const [subdomainFilter, setSubdomainFilter] = useState(searchParams.get('subdomain_id') || '')
  const [assetFilter,     setAssetFilter]     = useState(searchParams.get('asset_id')     || '')
  const [ruleFilter,      setRuleFilter]      = useState(searchParams.get('rule_id')      || '')
  const [statusFilter,    setStatusFilter]    = useState(searchParams.get('status')       || '')
  const [search,          setSearch]          = useState('')

  // Pagination
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // ── Preset helpers ───────────────────────────────────────────
  const applyPreset = useCallback((days: number, label: string) => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
    setDateFrom(toISODate(from))
    setDateTo(toISODate(to))
    setActivePreset(label)
  }, [])

  // Clear preset when user manually edits date inputs
  const handleDateFromChange = (val: string) => { setDateFrom(val); setActivePreset('') }
  const handleDateToChange   = (val: string) => { setDateTo(val);   setActivePreset('') }

  // ── Load reference data once ─────────────────────────────────
  useEffect(() => {
    Promise.all([domainsApi.list(), assetsApi.listEnriched(), rulesApi.list(), subdomainsApi.list()])
      .then(([d, a, r, sd]) => {
        setDomains(d.data?.items ?? d.data)
        setAssets(a.data?.items ?? a.data)
        setRules(r.data?.items ?? r.data)
        setSubdomains(sd.data?.items ?? sd.data ?? [])
      })
  }, [])

  useEffect(() => {
    if (domainFilter) {
      subdomainsApi.list(domainFilter).then(r => setSubdomains(r.data?.items ?? r.data ?? []))
    } else {
      subdomainsApi.list().then(r => setSubdomains(r.data?.items ?? r.data ?? []))
    }
  }, [domainFilter])

  // ── Fetch runs ───────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (domainFilter)    params.domain_id    = domainFilter
      if (subdomainFilter) params.subdomain_id = subdomainFilter
      if (assetFilter)     params.asset_id     = assetFilter
      if (ruleFilter)      params.rule_id      = ruleFilter
      if (statusFilter)    params.status       = statusFilter
      if (dateFrom)        params.date_from    = dateFrom
      if (dateTo)          params.date_to      = dateTo
      const res = await executionsApi.listRunsEnriched({ ...params, limit: 1000 })
      setRuns(res.data)
      setLastRefreshed(new Date())
    } finally {
      setLoading(false)
    }
  }, [domainFilter, subdomainFilter, assetFilter, ruleFilter, statusFilter, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [domainFilter, subdomainFilter, assetFilter, ruleFilter, statusFilter, dateFrom, dateTo, search])

  // ── Client-side text search ──────────────────────────────────
  const filteredRuns = useMemo(() => {
    if (!search.trim()) return runs
    const s = search.toLowerCase()
    return runs.filter(r =>
      r.rule_name.toLowerCase().includes(s) ||
      (r.rule_description || '').toLowerCase().includes(s) ||
      r.sf_table_name.toLowerCase().includes(s) ||
      r.domain_name.toLowerCase().includes(s) ||
      r.subdomain_name.toLowerCase().includes(s)
    )
  }, [runs, search])

  const paginatedRuns = useMemo(() =>
    filteredRuns.slice((page - 1) * pageSize, page * pageSize),
    [filteredRuns, page, pageSize]
  )

  // ── Active filter chips ──────────────────────────────────────
  const activeChips = [
    domainFilter    && { key: 'domain',    label: `Domain: ${domains.find(d => d.domain_id === domainFilter)?.domain_name || domainFilter}`,                    onRemove: () => setDomainFilter('') },
    subdomainFilter && { key: 'subdomain', label: `Subdomain: ${subdomains.find(s => s.subdomain_id === subdomainFilter)?.subdomain_name || subdomainFilter}`,  onRemove: () => setSubdomainFilter('') },
    assetFilter     && { key: 'asset',     label: `Table: ${assets.find(a => a.asset_id === assetFilter)?.sf_table_name || assetFilter}`,                       onRemove: () => setAssetFilter('') },
    ruleFilter      && { key: 'rule',      label: `Rule: ${rules.find(r => r.rule_id === ruleFilter)?.rule_name || ruleFilter}`,                                onRemove: () => setRuleFilter('') },
    statusFilter    && { key: 'status',    label: `Status: ${statusFilter}`,                                                                                    onRemove: () => setStatusFilter('') },
    search.trim()   && { key: 'search',    label: `Search: "${search}"`,                                                                                        onRemove: () => setSearch('') },
  ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[]

  const clearAll = () => {
    setDomainFilter(''); setSubdomainFilter(''); setAssetFilter('')
    setRuleFilter(''); setStatusFilter(''); setSearch('')
    applyPreset(3, '3d')
  }

  const refreshAt = formatTime(lastRefreshed)

  return (
    <div className="p-6 space-y-5 max-w-[1600px]">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Execution Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Rule execution history · DataGuardian</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={12} />
            Updated {refreshAt}
          </div>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/export/runs?days=30${domainFilter ? `&domain_id=${domainFilter}` : ''}${assetFilter ? `&asset_id=${assetFilter}` : ''}`}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-green-400 hover:text-green-600 transition-all"
          >
            <Download size={12} />
            Export CSV
          </a>
          <button
            onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-40"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Refresh
          </button>
        </div>
      </div>

      {/* ── Filter panel (top) ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Filter size={14} className="text-blue-600" />
          <span className="text-sm font-semibold text-gray-900">Filters</span>
          {activeChips.length > 0 && (
            <button
              onClick={clearAll}
              className="ml-auto text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-2.5 py-1 rounded-lg transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Row 1: Date range */}
        <div className="flex flex-wrap items-center gap-2">
          <Calendar size={13} className="text-gray-400 shrink-0" />
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Date Range</span>

          {/* Quick presets */}
          <div className="flex items-center gap-1">
            <DatePreset label="Today"   active={activePreset === 'today'} onClick={() => applyPreset(0,  'today')} />
            <DatePreset label="3 Days"  active={activePreset === '3d'}    onClick={() => applyPreset(3,  '3d')} />
            <DatePreset label="7 Days"  active={activePreset === '7d'}    onClick={() => applyPreset(7,  '7d')} />
            <DatePreset label="14 Days" active={activePreset === '14d'}   onClick={() => applyPreset(14, '14d')} />
            <DatePreset label="30 Days" active={activePreset === '30d'}   onClick={() => applyPreset(30, '30d')} />
          </div>

          <span className="text-[11px] text-gray-300 mx-1">|</span>
          <span className="text-[11px] text-gray-500">From</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={e => handleDateFromChange(e.target.value)}
            className={DATE_INPUT}
          />
          <span className="text-[11px] text-gray-500">To</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={toISODate(new Date())}
            onChange={e => handleDateToChange(e.target.value)}
            className={DATE_INPUT}
          />
        </div>

        {/* Row 2: Search + dropdowns */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Text search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search rules, tables…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-7 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 w-44 placeholder-gray-400"
            />
          </div>

          <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)} className={SEL}>
            <option value="">All Domains</option>
            {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
          </select>

          <select value={subdomainFilter} onChange={e => setSubdomainFilter(e.target.value)} className={SEL}>
            <option value="">All Subdomains</option>
            {subdomains
              .filter((sd: any) => !domainFilter || sd.domain_id === domainFilter)
              .map((s: any) => <option key={s.subdomain_id} value={s.subdomain_id}>{s.subdomain_name}</option>)}
          </select>

          <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} className={SEL}>
            <option value="">All Tables</option>
            {assets.map((a: any) => (
              <option key={a.asset_id} value={a.asset_id}>
                {[a.sf_database_name, a.sf_schema_name, a.sf_table_name].filter(Boolean).join('.')}
              </option>
            ))}
          </select>

          <select value={ruleFilter} onChange={e => setRuleFilter(e.target.value)} className={SEL}>
            <option value="">All Rules</option>
            {rules.map((r: any) => (
              <option key={r.rule_id} value={r.rule_id}>{r.rule_description || toLabel(r.rule_name)}</option>
            ))}
          </select>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={SEL}>
            <option value="">All Statuses</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
            {activeChips.map(chip => (
              <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
            ))}
          </div>
        )}
      </div>

      {/* ── KPI summary ── */}
      {!loading && <SummaryStrip runs={runs} />}

      {/* ── Analytics ── */}
      {!loading && runs.length > 0 && <AnalyticsPanel runs={runs} />}

      {/* ── Log table section ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Section header */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <FileText size={15} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Execution Log</h2>
          {!loading && (
            <span className="text-[11px] text-gray-400 font-normal">
              {filteredRuns.length !== runs.length
                ? `${filteredRuns.length} of ${runs.length} runs`
                : `${runs.length} runs`}
            </span>
          )}
          <span className="ml-auto text-[11px] text-gray-400">
            {dateFrom} → {dateTo}
          </span>
        </div>

        {/* Table body */}
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <Loader2 size={20} className="animate-spin text-blue-500" />
            <span className="text-sm">Loading execution logs…</span>
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Activity size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-medium text-gray-600">
              {runs.length === 0 ? 'No execution runs found for this date range' : 'No runs match the current filters'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {runs.length === 0
                ? 'Try expanding the date range or run a rule from the Rules page'
                : 'Try adjusting or clearing the active filters'}
            </p>
            {(activeChips.length > 0 || activePreset !== '3d') && (
              <button onClick={clearAll} className="mt-3 text-xs text-blue-600 hover:underline">
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="w-9 px-3 py-3" />
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[24%]">Rule</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[18%]">Table</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[12%]">Domain</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[10%]">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[9%]">
                    <span className="flex items-center gap-1">Score <MetricInfo metric={METRICS.runsScore} position="bottom" /></span>
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[12%]">
                    <span className="flex items-center gap-1">Rows <MetricInfo metric={METRICS.totalRows} position="bottom" /></span>
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[15%]">Timestamp ({abbr})</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRuns.map((run, idx) => {
                  const isOpen = expanded === run.run_id
                  const prevRun = paginatedRuns.slice(idx + 1).find(r => r.rule_id === run.rule_id)
                  return (
                    <Fragment key={run.run_id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : run.run_id)}
                        className={clsx(
                          'cursor-pointer border-b border-gray-100 transition-colors group',
                          isOpen ? 'bg-blue-50/30' : STATUS_CONFIG[run.status]?.rowCls || '',
                          'hover:bg-blue-50/20'
                        )}
                      >
                        <td className="px-3 py-3.5 text-gray-400">
                          {isOpen
                            ? <ChevronDown size={14} className="text-blue-500" />
                            : <ChevronRight size={14} className="group-hover:text-blue-400 transition-colors" />}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-semibold text-gray-900 leading-snug line-clamp-1">
                            {run.rule_description || toLabel(run.rule_name)}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-gray-400">{run.rule_type.replace(/_/g, ' ')}</span>
                            <span className={clsx('text-[10px]', SEV_CLS[run.severity] || 'badge-low')}>{run.severity}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-semibold text-gray-800">{run.sf_table_name}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                            {[run.sf_database_name, run.sf_schema_name].filter(Boolean).join('.')}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-medium text-gray-700">{run.domain_name}</p>
                          <p className="text-[10px] text-gray-400">{run.subdomain_name}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="px-4 py-3.5">
                          {run.quality_score != null ? (
                            <span className="flex items-center">
                              <span className={clsx('text-sm font-bold', scoreColor(run.quality_score))}>
                                {run.quality_score}%
                              </span>
                              <DeltaBadgeInline current={run.quality_score} previous={prevRun?.quality_score ?? null} />
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-600">
                          {run.total_rows_scanned != null ? (
                            <>
                              {fmtRows(run.total_rows_scanned)}
                              {(run.failed_rows_count ?? 0) > 0 && (
                                <span className="text-red-500 ml-1">({fmtRows(run.failed_rows_count)} failed)</span>
                              )}
                            </>
                          ) : run.error_message ? (
                            <span className="text-orange-500 line-clamp-1 text-[11px]">{run.error_message.slice(0, 36)}…</span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs text-gray-700">{formatTs(run.created_at, { withSeconds: true })}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{fmtDur(run.duration_ms)}</p>
                        </td>
                      </tr>
                      {isOpen && <RunDetail run={run} />}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && filteredRuns.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filteredRuns.length}
            onChange={p => { setPage(p); setExpanded(null) }}
            onSizeChange={setPageSize}
          />
        )}
      </div>
    </div>
  )
}
