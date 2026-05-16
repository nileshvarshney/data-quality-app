'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, CheckCircle, XCircle, Activity, Clock,
  ChevronRight, RefreshCw, Play, AlertTriangle, Loader2,
  FileText, Bot, Database, GitBranch,
  Columns, Star, Tag, BookOpen, Zap, Pencil,
} from 'lucide-react'
import { dashboardApi, executionsApi, aiApi, assetsApi, glossaryApi } from '@/services/apiClient'
import QualityTrendChart from '@/components/charts/QualityTrendChart'
import ScoreRing from '@/components/common/ScoreRing'
import SeverityBadge, { StatusBadge } from '@/components/common/SeverityBadge'
import CertificationBadge from '@/components/common/CertificationBadge'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import MetricInfo, { METRICS } from '@/components/common/MetricInfo'
import { useTheme } from '@/components/layout/ThemeProvider'
import { useTimezone } from '@/contexts/TimezoneContext'
import dynamic from 'next/dynamic'
const LineageGraph = dynamic(
  () => import('@/components/lineage/LineageGraph'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-[var(--border)] animate-pulse" />
    ),
  }
)

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

// ── Sample records panel ──────────────────────────────────────────

function SampleRecordsPanel({ runId, ruleId }: { runId: string; ruleId: string }) {
  const [samples, setSamples]   = useState<any[]>([])
  const [loading, setLoading]   = useState(false)
  const [fetched, setFetched]   = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await executionsApi.getRunSamples(runId)
      setSamples(Array.isArray(res.data) ? res.data : [])
    } finally { setLoading(false); setFetched(true) }
  }

  if (!fetched) return (
    <button onClick={load} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
      <FileText size={11} /> Load sample records
    </button>
  )
  if (loading) return <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={11} className="animate-spin" />Loading samples…</div>
  if (samples.length === 0) return <p className="text-xs text-gray-400 italic">No sample records captured for this run</p>

  const keys = Object.keys(samples[0]?.failed_record ?? {})
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 mt-2">
      <table className="text-xs w-full border-collapse">
        <thead className="bg-gray-50">
          <tr>
            {keys.map(k => <th key={k} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-[10px] whitespace-nowrap">{k}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {samples.slice(0, 5).map((s: any, i: number) => (
            <tr key={i} className="hover:bg-red-50/30">
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
      {samples.length > 5 && <p className="text-[10px] text-gray-400 px-3 py-1.5 border-t border-gray-100">Showing 5 of {samples.length} sample records</p>}
    </div>
  )
}

// ── AI explanation panel ──────────────────────────────────────────

function AIExplainPanel({ runId, ruleId }: { runId: string; ruleId: string }) {
  const [explanation, setExplanation] = useState('')
  const [loading, setLoading]         = useState(false)
  const [fetched, setFetched]         = useState(false)
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
  if (loading) return <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={11} className="animate-spin" />Generating AI explanation…</div>
  if (error)   return <p className="text-xs text-red-500">{error}</p>

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-900 leading-relaxed whitespace-pre-wrap">
      <div className="flex items-center gap-1.5 font-semibold text-blue-700 mb-1.5">
        <Bot size={12} /> AI Explanation
      </div>
      {explanation}
    </div>
  )
}


// ── Page ──────────────────────────────────────────────────────────

export default function TableDashboardPage() {
  const { assetId } = useParams<{ assetId: string }>()
  const { theme }   = useTheme()
  const { formatTs } = useTimezone()
  const trackColor  = theme === 'dark' ? '#334155' : '#e2e8f0'

  const [data,      setData]      = useState<any>(null)
  const [loading,   setLoading]   = useState(true)
  const [running,   setRunning]   = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  // Tabs
  const [activeTab, setActiveTab] = useState<'quality' | 'schema' | 'lineage'>('quality')
  const [columns, setColumns]   = useState<any[]>([])
  const [colLoading, setColLoading] = useState(false)
  const [colFetched, setColFetched] = useState(false)
  const [profilingJobId, setProfilingJobId] = useState<string | null>(null)
  const [profilingStatus, setProfilingStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [profilingError, setProfilingError] = useState<string>('')
  // Certification
  const [certifyOpen, setCertifyOpen] = useState(false)
  const [certifying, setCertifying] = useState(false)

  const [glossaryTerms, setGlossaryTerms] = useState<any[]>([])

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const res = await dashboardApi.table(assetId)
      setData(res.data)
      setLastRefreshed(new Date())
    } finally { setLoading(false); setRefreshing(false) }
  }, [assetId])

  useEffect(() => { loadAll() }, [loadAll])

  // Lazy-load schema when tab first opened
  useEffect(() => {
    if (activeTab === 'schema' && !colFetched) {
      setColLoading(true)
      Promise.all([
        assetsApi.columns(assetId).then(r => {
          const d = r.data
          return Array.isArray(d) ? d : (d?.columns ?? [])
        }).catch(() => []),
        glossaryApi.listByAsset(assetId).then(r => r.data).catch(() => []),
      ]).then(([cols, terms]) => {
        setColumns(Array.isArray(cols) ? cols : [])
        setGlossaryTerms(Array.isArray(terms) ? terms : [])
      }).finally(() => { setColLoading(false); setColFetched(true) })
    }
  }, [activeTab, assetId, colFetched])

  const handleCertify = async (status: string) => {
    setCertifyOpen(false); setCertifying(true)
    try {
      const res = await assetsApi.certify(assetId, status)
      setData((d: any) => ({ ...d,
        certification_status: res.data.certification_status,
        certified_by: res.data.certified_by,
        certified_at: res.data.certified_at,
      }))
    } finally { setCertifying(false) }
  }

  const triggerProfiling = async () => {
    setProfilingStatus('running')
    setProfilingError('')
    try {
      const res = await assetsApi.profileColumns(assetId)
      setProfilingJobId(res.data.job_id)
    } catch (e: any) {
      setProfilingStatus('error')
      setProfilingError(e.response?.data?.detail || e.message || 'Failed to start profiling')
    }
  }

  // Poll job status with exponential back-off (2 s → max 8 s) until done/failed
  useEffect(() => {
    if (!profilingJobId || profilingStatus !== 'running') return
    let delay = 2000
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        const s = await assetsApi.getProfileStatus(assetId, profilingJobId)
        if (s.data.status === 'completed') {
          setProfilingStatus('done')
          setColLoading(true)
          Promise.all([
            assetsApi.columns(assetId).then(r => {
              const d = r.data
              return Array.isArray(d) ? d : (d?.columns ?? [])
            }).catch(() => []),
            glossaryApi.listByAsset(assetId).then(r => r.data).catch(() => []),
          ]).then(([cols, terms]) => {
            setColumns(Array.isArray(cols) ? cols : [])
            setGlossaryTerms(Array.isArray(terms) ? terms : [])
          }).finally(() => setColLoading(false))
          return
        } else if (s.data.status === 'failed') {
          setProfilingStatus('error')
          setProfilingError(s.data.error || 'Profiling failed')
          return
        }
      } catch { /* keep polling */ }
      delay = Math.min(delay * 1.5, 8000)
      if (!cancelled) setTimeout(poll, delay)
    }
    setTimeout(poll, delay)
    return () => { cancelled = true }
  }, [profilingJobId, profilingStatus, assetId])


  const handleRun = async () => {
    setRunning(true)
    try { await executionsApi.runTableSync(assetId); loadAll(true) }
    finally { setRunning(false) }
  }

  if (loading) return (
    <div className="p-6 space-y-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}
    </div>
  )
  if (!data) return <div className="p-8 text-gray-500">Table not found</div>

  const score     = data.quality_score ?? 0
  const passTotal = (data.passed_rules ?? 0) + (data.failed_rules ?? 0) + (data.warning_rules ?? 0)
  const passRate  = passTotal > 0 ? (data.passed_rules / passTotal) * 100 : 0
  const failedRules = (data.rules || []).filter((r: any) => r.status === 'failed' || r.status === 'error')
  const refreshedAt = lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <Breadcrumbs items={[
        { label: 'Global', href: '/dashboard/global' },
        { label: 'Domain', href: `/dashboard/domains/${data.domain_id}` },
        { label: 'Subdomain', href: `/dashboard/subdomains/${data.subdomain_id}` },
        { label: `${data.sf_schema_name}.${data.sf_table_name}` },
      ]} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{data.sf_schema_name}.{data.sf_table_name}</h1>
            {data.certification_status && <CertificationBadge status={data.certification_status} />}
          </div>
          <p className="text-sm text-gray-500">
            {data.owner_name && <span>{data.owner_name} · </span>}
            Last run: {data.last_run_time ? formatTs(data.last_run_time) : 'Never'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-400"><Clock size={12} />Updated {refreshedAt}</div>
          <Link href={`/runs?asset_id=${assetId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-all">
            View Logs
          </Link>
          <button onClick={() => loadAll(true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-40">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={handleRun} disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {running ? 'Running…' : 'Run All Rules'}
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'quality',  label: 'Quality',  icon: <Shield size={14} /> },
          { id: 'schema',   label: 'Schema',   icon: <Columns size={14} /> },
          { id: 'lineage',  label: 'Lineage',  icon: <GitBranch size={14} /> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── Quality tab ─────────────────────────────────────────── */}
      {activeTab === 'quality' && <>

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
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] text-gray-400 uppercase tracking-widest font-medium">Quality Score</p>
                <MetricInfo metric={METRICS.qualityScore} position="right" />
              </div>
              <p className={`text-xl font-bold mt-0.5 ${scoreTextColor(score)}`}>{scoreLabel(score)}</p>
            </div>
            <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${scoreBadgeClass(score)}`}>
              {score >= 95 ? 'SLA Met' : score >= 80 ? 'Within Threshold' : 'Below SLA'}
            </span>
            <div className="pt-1 border-t border-gray-100">
              <p className="text-[11px] text-gray-400 mb-1">30-day trend</p>
              <QualityTrendChart data={data.quality_trend || []} height={36} mini />
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 grid grid-cols-2 gap-3">
          {[
            { label: 'Total Rules',  value: data.total_rules ?? 0,   icon: Shield,        bg: 'bg-indigo-50', cls: 'text-indigo-600', metricKey: 'activeRules'  },
            { label: 'Passed',       value: data.passed_rules ?? 0,  icon: CheckCircle,   bg: 'bg-green-50',  cls: 'text-green-600',  metricKey: 'passedToday'  },
            { label: 'Failed',       value: data.failed_rules ?? 0,  icon: XCircle,       bg: (data.failed_rules ?? 0) > 0 ? 'bg-red-50' : 'bg-gray-50', cls: (data.failed_rules ?? 0) > 0 ? 'text-red-500' : 'text-gray-400', metricKey: 'failedToday' },
            { label: 'Warnings',     value: data.warning_rules ?? 0, icon: AlertTriangle, bg: (data.warning_rules ?? 0) > 0 ? 'bg-yellow-50' : 'bg-gray-50', cls: (data.warning_rules ?? 0) > 0 ? 'text-yellow-500' : 'text-gray-400', metricKey: undefined },
          ].map(({ label, value, icon: Icon, bg, cls, metricKey }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`p-1.5 rounded-lg ${bg}`}><Icon size={14} className={cls} /></div>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
                  {metricKey && METRICS[metricKey as keyof typeof METRICS] && (
                    <MetricInfo metric={METRICS[metricKey as keyof typeof METRICS]} position="top" />
                  )}
                </div>
              </div>
              <p className="text-3xl font-black text-gray-900 tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pass rate */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><Activity size={15} className="text-blue-600" /><p className="text-sm font-semibold text-gray-900">Pass Rate</p></div>
          <span className={`text-sm font-bold ${scoreTextColor(passRate)}`}>{passRate.toFixed(0)}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${passRate}%`, backgroundColor: scoreFill(passRate) }} />
        </div>
        <div className="flex justify-between text-[11px] text-gray-400 mt-1.5">
          <span>{data.passed_rules ?? 0} passed</span><span>{passTotal} total</span><span>{data.failed_rules ?? 0} failed</span>
        </div>
      </div>

      {/* Trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Quality Score Trend</h3>
        <p className="text-[11px] text-gray-400 mb-4">30-day rolling · green = SLA 95%, amber = warning 80%</p>
        <QualityTrendChart data={data.quality_trend || []} height={220} area />
      </div>

      {/* Failed rules with sample records + AI explanation */}
      {failedRules.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100 bg-red-50/30 flex items-center gap-2">
            <XCircle size={15} className="text-red-500" />
            <h3 className="text-sm font-semibold text-gray-900">Failing Rules — {failedRules.length} issue{failedRules.length > 1 ? 's' : ''}</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {failedRules.map((rule: any) => {
              const recentRun = rule.last_run_id
                ? (data.recent_runs || []).find((r: any) => r.run_id === rule.last_run_id)
                : (data.recent_runs || []).find((r: any) => r.rule_id === rule.rule_id && r.status !== 'passed')
              const isExpanded = expandedRun === rule.rule_id
              return (
                <div key={rule.rule_id}>
                  <div
                    className="px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpandedRun(isExpanded ? null : rule.rule_id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link href={`/rules/${rule.rule_id}`} onClick={e => e.stopPropagation()}
                            className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                            {rule.rule_name}
                          </Link>
                          <SeverityBadge severity={rule.severity} />
                        </div>
                        <p className="text-xs text-gray-500">{rule.rule_type.replace(/_/g, ' ')}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {rule.quality_score != null && (
                          <span className={`text-sm font-bold ${scoreTextColor(rule.quality_score)}`}>
                            {rule.quality_score.toFixed(0)}%
                          </span>
                        )}
                        <StatusBadge status={rule.status} />
                        {isExpanded ? <ChevronRight size={14} className="text-gray-400 rotate-90" /> : <ChevronRight size={14} className="text-gray-400" />}
                      </div>
                    </div>
                  </div>
                  {isExpanded && recentRun && (
                    <div className="px-5 pb-5 bg-gray-50/50 border-t border-gray-100 space-y-4">
                      {/* Execution stats */}
                      <div className="grid grid-cols-4 gap-2 pt-3">
                        {[
                          { label: 'Last Run',    value: rule.last_run ? relTime(rule.last_run) : '—' },
                          { label: 'Quality Score', value: rule.quality_score != null ? `${rule.quality_score}%` : '—' },
                          { label: 'Status',      value: rule.status },
                          { label: 'Run ID',      value: recentRun.run_id?.slice(0, 8) + '…' },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                            <p className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</p>
                            <p className="text-xs font-semibold text-gray-800 mt-0.5">{value}</p>
                          </div>
                        ))}
                      </div>
                      {/* Sample records */}
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">Sample Failed Records</p>
                        <SampleRecordsPanel runId={recentRun.run_id} ruleId={rule.rule_id} />
                      </div>
                      {/* AI explanation */}
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">AI Analysis</p>
                        <AIExplainPanel runId={recentRun.run_id} ruleId={rule.rule_id} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* All rules table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Database size={15} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">All Rules ({(data.rules || []).length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Rule', 'Type', 'Severity', 'Status', 'Score', 'Last Run', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data.rules || []).map((rule: any) => (
                <tr key={rule.rule_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/rules/${rule.rule_id}`} className="text-xs font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                      {rule.rule_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{rule.rule_type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3"><SeverityBadge severity={rule.severity} /></td>
                  <td className="px-4 py-3"><StatusBadge status={rule.status} /></td>
                  <td className="px-4 py-3">
                    {rule.quality_score != null
                      ? <span className={`text-xs font-bold ${scoreTextColor(rule.quality_score)}`}>{rule.quality_score.toFixed(0)}%</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-gray-400">{rule.last_run ? relTime(rule.last_run) : '—'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/runs?rule_id=${rule.rule_id}`} className="text-xs text-blue-600 hover:underline">History</Link>
                  </td>
                </tr>
              ))}
              {(data.rules || []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No rules configured for this table</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      </> /* end Quality tab */}

      {/* ── Schema tab ──────────────────────────────────────────── */}
      {activeTab === 'schema' && (
        <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Columns size={15} className="text-gray-500 dark:text-[var(--text-3)]" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-[var(--text)]">Column Metadata</h3>
              {columns.length > 0 && <span className="text-xs text-gray-400 dark:text-[var(--text-4)]">{columns.length} columns</span>}
            </div>
            <div className="flex items-center gap-2">
              {profilingStatus === 'done' && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle size={11} /> Profiled
                </span>
              )}
              {profilingStatus === 'error' && (
                <span className="text-xs text-red-500" title={profilingError}>
                  Profile failed{profilingError ? ` — ${profilingError.slice(0, 60)}${profilingError.length > 60 ? '…' : ''}` : ''}
                </span>
              )}
              <button
                onClick={triggerProfiling}
                disabled={profilingStatus === 'running'}
                className="flex items-center gap-1.5 px-3 py-1.5 btn-gradient rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {profilingStatus === 'running'
                  ? <><Loader2 size={11} className="animate-spin" /> Profiling…</>
                  : <><Zap size={11} /> Profile Columns</>}
              </button>
            </div>
          </div>
          {colLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading columns…
            </div>
          ) : columns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <Columns size={24} className="text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-700">No column metadata yet</p>
              <p className="text-xs text-gray-400 mt-1">Run a profiling job or sync from Snowflake to populate schema info.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[var(--surface-sub)] border-b border-gray-100 dark:border-[var(--border)]">
                  <tr>
                    {['Column','Type','Nullable','Null %','Distinct','Cardinality','Min','Max','Mean','Std Dev','Top Values','Samples','Last Profiled','Description'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 dark:text-[var(--text-4)] uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[var(--border)]">
                  {columns.map((col: any) => (
                    <tr key={col.column_name} className="hover:bg-gray-50 dark:hover:bg-[var(--surface-sub)] transition-colors">
                      {/* Column name */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {col.is_primary_key && <span title="Primary key" className="w-4 h-4 rounded bg-yellow-100 dark:bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 flex items-center justify-center text-[9px] font-bold">PK</span>}
                          <span className="text-xs font-semibold text-gray-900 dark:text-[var(--text)] font-mono">{col.column_name}</span>
                        </div>
                      </td>
                      {/* Type */}
                      <td className="px-3 py-2.5 text-xs text-blue-600 dark:text-blue-400 font-mono whitespace-nowrap">{col.data_type || '—'}</td>
                      {/* Nullable */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)]">{col.is_nullable ? 'Yes' : 'No'}</td>
                      {/* Null % — orange if > 10% */}
                      <td className="px-3 py-2.5">
                        {col.null_pct != null
                          ? <span className={`text-xs font-semibold ${col.null_pct > 10 ? 'text-orange-500' : 'text-gray-500 dark:text-[var(--text-3)]'}`}>{col.null_pct.toFixed(1)}%</span>
                          : <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>}
                      </td>
                      {/* Distinct count */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)]">{col.distinct_count != null ? col.distinct_count.toLocaleString() : '—'}</td>
                      {/* Cardinality — amber if < 5% (low cardinality, good for accepted_values rule) */}
                      <td className="px-3 py-2.5">
                        {col.cardinality_pct != null
                          ? <span className={`text-xs font-medium ${col.cardinality_pct < 5 ? 'text-amber-500' : 'text-gray-500 dark:text-[var(--text-3)]'}`} title={col.cardinality_pct < 5 ? 'Low cardinality — consider an accepted_values rule' : undefined}>
                              {col.cardinality_pct.toFixed(1)}%
                            </span>
                          : <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>}
                      </td>
                      {/* Min */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)] font-mono max-w-[80px] truncate" title={col.min_value ?? ''}>{col.min_value ?? '—'}</td>
                      {/* Max */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)] font-mono max-w-[80px] truncate" title={col.max_value ?? ''}>{col.max_value ?? '—'}</td>
                      {/* Mean */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)]">{col.mean != null ? col.mean.toFixed(2) : '—'}</td>
                      {/* Std Dev */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)]">{col.std_dev != null ? col.std_dev.toFixed(2) : '—'}</td>
                      {/* Top Values — show top 3 inline, rest in title tooltip */}
                      <td className="px-3 py-2.5 max-w-[120px]">
                        {Array.isArray(col.top_values) && col.top_values.length > 0 ? (
                          <span className="text-[10px] text-gray-500 dark:text-[var(--text-3)]" title={col.top_values.map((v: any) => `${v.value} (${v.count})`).join(', ')}>
                            {col.top_values.slice(0, 3).map((v: any) => v.value).join(', ')}
                            {col.top_values.length > 3 && <span className="text-gray-400"> +{col.top_values.length - 3}</span>}
                          </span>
                        ) : <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>}
                      </td>
                      {/* Sample Values */}
                      <td className="px-3 py-2.5 max-w-[120px]">
                        {Array.isArray(col.sample_values) && col.sample_values.length > 0 ? (
                          <span className="text-[10px] text-gray-400 dark:text-[var(--text-4)] font-mono" title={col.sample_values.join(', ')}>
                            {col.sample_values.slice(0, 2).join(', ')}
                            {col.sample_values.length > 2 && <span> +{col.sample_values.length - 2}</span>}
                          </span>
                        ) : <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>}
                      </td>
                      {/* Last Profiled */}
                      <td className="px-3 py-2.5 text-[10px] text-gray-400 dark:text-[var(--text-4)] whitespace-nowrap">
                        {col.last_profiled_at
                          ? (() => {
                              const d = new Date(col.last_profiled_at)
                              const diff = Math.floor((Date.now() - d.getTime()) / 1000)
                              if (diff < 60) return `${diff}s ago`
                              if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
                              if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
                              return `${Math.floor(diff / 86400)}d ago`
                            })()
                          : '—'}
                      </td>
                      {/* Description */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)] max-w-[180px]">
                        {col.description || <span className="text-gray-300 dark:text-[var(--text-4)] italic">No description</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Business Terms */}
        {!colLoading && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <BookOpen size={15} className="text-purple-500" />
              <h3 className="text-sm font-semibold text-gray-900">Business Terms</h3>
              {glossaryTerms.length > 0 && (
                <span className="ml-auto text-xs text-gray-400">{glossaryTerms.length} term{glossaryTerms.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            {glossaryTerms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10">
                <BookOpen size={20} className="text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No business terms linked to this table</p>
                <Link href="/glossary" className="text-xs text-purple-600 hover:underline mt-1">
                  Open Business Glossary to add terms
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {glossaryTerms.map((t: any) => (
                  <div key={t.link_id || t.term_id} className="px-5 py-3.5 flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-purple-50 shrink-0">
                      <Tag size={12} className="text-purple-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{t.term_name}</p>
                      {t.column_name && (
                        <p className="text-[10px] text-purple-600 font-mono">column: {t.column_name}</p>
                      )}
                      {t.definition && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.definition}</p>
                      )}
                    </div>
                    {t.synonyms && (
                      <div className="flex flex-wrap gap-1 shrink-0 max-w-[160px]">
                        {t.synonyms.split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 2).map((s: string) => (
                          <span key={s} className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      )}

      {/* ── Lineage tab ─────────────────────────────────────────── */}
      {activeTab === 'lineage' && (
        <div className="space-y-4">

          {/* ── Certification card ── */}
          <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-[var(--border)] p-5 flex items-center gap-4 card-accent-top">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10">
              <Star size={18} className="text-indigo-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-[var(--text)]">Certification Status</p>
              <p className="text-xs text-gray-500 dark:text-[var(--text-3)] mt-0.5">
                {data.certification_status === 'certified'
                  ? `Certified${data.certified_by ? ` by ${data.certified_by}` : ''}${data.certified_at ? ` · ${new Date(data.certified_at).toLocaleDateString()}` : ''}`
                  : data.certification_status === 'warning'
                  ? 'Warning — data quality review needed'
                  : 'Not yet certified'}
              </p>
            </div>
            <CertificationBadge status={data.certification_status || 'uncertified'} />
            <div className="relative">
              <button
                onClick={() => setCertifyOpen(o => !o)}
                disabled={certifying}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-[var(--border)] rounded-lg hover:bg-gray-50 dark:hover:bg-[var(--surface-sub)] text-gray-600 dark:text-[var(--text-2)] disabled:opacity-50"
              >
                {certifying ? <Loader2 size={11} className="animate-spin" /> : <Pencil size={11} />} Change
              </button>
              {certifyOpen && (
                <div className="absolute right-0 top-9 z-20 bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-[var(--border)] rounded-xl shadow-xl py-1 w-36">
                  {['certified', 'warning', 'uncertified'].map(s => (
                    <button key={s} onClick={() => handleCertify(s)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-[var(--surface-sub)] capitalize text-gray-700 dark:text-[var(--text-2)]">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <LineageGraph assetId={assetId} />
        </div>
      )}
    </div>
  )
}
