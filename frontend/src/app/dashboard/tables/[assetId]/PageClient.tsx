'use client'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, CheckCircle, XCircle, Clock,
  ChevronRight, RefreshCw, Play, AlertTriangle, Loader2,
  FileText, Bot, Database,
  Columns, Tag, BookOpen, Zap, EyeOff, TrendingUp, GitFork, GitCompare,
  Sparkles, Wrench, X,
} from 'lucide-react'
import { dashboardApi, executionsApi, aiApi, assetsApi, glossaryApi } from '@/services/apiClient'
import { profilingApi } from '@/services/profilingApi'
import QualityTrendChart from '@/components/charts/QualityTrendChart'
import ProfileTrendsTab from '@/components/profiling/ProfileTrendsTab'
import SeverityBadge, { StatusBadge } from '@/components/common/SeverityBadge'
import CertificationBadge from '@/components/common/CertificationBadge'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import Tooltip from '@/components/common/Tooltip'
import MetricInfo, { METRICS } from '@/components/common/MetricInfo'
import { useTheme } from '@/components/layout/ThemeProvider'
import { useTimezone } from '@/contexts/TimezoneContext'
import { LineageTab } from '@/components/lineage/LineageTab'
import { SchemaDriftTab } from '@/components/schema-drift/SchemaDriftTab'

function scoreTextColor(s: number) {
  if (s >= 95) return 'text-green-600'; if (s >= 80) return 'text-yellow-600'
  if (s >= 60) return 'text-orange-500'; return 'text-red-600'
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
  if (d < 60) return `${d}s ago`
  if (d < 3600) return `${Math.floor(d / 60)} min ago`
  if (d < 86400) { const h = Math.floor(d / 3600); return `${h} hr${h > 1 ? 's' : ''} ago` }
  const days = Math.floor(d / 86400); return `${days} day${days > 1 ? 's' : ''} ago`
}
function isNumericType(dt: string | null | undefined): boolean {
  if (!dt) return false
  const up = dt.toUpperCase()
  return ['NUMBER','INT','FLOAT','DECIMAL','DOUBLE','REAL','NUMERIC',
          'BIGINT','SMALLINT','TINYINT','BYTEINT'].some(t => up.includes(t))
}
function isTextType(dt: string | null | undefined): boolean {
  if (!dt) return false
  const up = dt.toUpperCase()
  return ['VARCHAR','CHAR','STRING','TEXT','NCHAR','NVARCHAR'].some(t => up.includes(t))
}
const CLASSIFICATION_COLORS: Record<string, string> = {
  PII: 'bg-red-100 text-red-700', SENSITIVE: 'bg-orange-100 text-orange-700',
  CONFIDENTIAL: 'bg-yellow-100 text-yellow-700', RESTRICTED: 'bg-purple-100 text-purple-700',
  PUBLIC: 'bg-green-100 text-green-700',
}
const CLASSIFICATION_LABELS: Record<string, string> = {
  PII: 'PII', SENSITIVE: 'Sensitive', CONFIDENTIAL: 'Confidential',
  RESTRICTED: 'Restricted', PUBLIC: 'Public',
}
const CLASSIFICATION_TOOLTIPS: Record<string, { title: string; desc: string; examples: string }> = {
  PII:          { title: 'Personally Identifiable Information', desc: 'Data that can directly identify a specific individual. Subject to GDPR, CCPA, and other privacy regulations.', examples: 'Name, email, SSN, date of birth, phone number, IP address' },
  SENSITIVE:    { title: 'Sensitive Business Data', desc: 'Business-sensitive information that could cause harm if disclosed. Access is restricted by role.', examples: 'Revenue figures, salary, pricing strategies, contracts' },
  CONFIDENTIAL: { title: 'Confidential — Internal Use Only', desc: 'Data intended for internal stakeholders only. Must not be shared externally without approval.', examples: 'Internal reports, org charts, hiring pipelines' },
  RESTRICTED:   { title: 'Restricted — Highly Controlled', desc: 'The most sensitive category. Access requires explicit approval. Often subject to legal holds or M&A confidentiality.', examples: 'M&A deal data, legal hold records, board materials' },
  PUBLIC:       { title: 'Public — Freely Shareable', desc: 'No access restrictions. Safe to share externally and use in public-facing products.', examples: 'Published datasets, reference lookup tables, marketing copy' },
}
const SHOULD_MASK = new Set(['PII', 'SENSITIVE', 'CONFIDENTIAL', 'RESTRICTED'])

// Schema tab column header definitions — label + optional MetricInfo key
const SCHEMA_HEADERS: { label: string; metricKey?: string }[] = [
  { label: 'Column' },
  { label: 'Type',        metricKey: 'schemaDataType' },
  { label: 'Nullable',    metricKey: 'schemaNullable' },
  { label: 'Null %',      metricKey: 'nullPct' },
  { label: 'Distinct',    metricKey: 'distinctCount' },
  { label: 'Cardinality', metricKey: 'cardinality' },
  { label: 'Min',         metricKey: 'minValue' },
  { label: 'Max',         metricKey: 'maxValue' },
  { label: 'Mean',        metricKey: 'mean' },
  { label: 'Std Dev',     metricKey: 'stdDev' },
  { label: 'Top Values',  metricKey: 'topValues' },
  { label: 'Description', metricKey: 'colDescription' },
]

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
  const { assetId: _assetId } = useParams<{ assetId: string }>()
  const pathname = usePathname()
  const assetId = (_assetId && _assetId !== '__placeholder__')
    ? _assetId
    : pathname.split('/').filter(Boolean).pop() ?? ''
  const { theme }   = useTheme()
  const { formatTs, formatTime } = useTimezone()

  const [data,      setData]      = useState<any>(null)
  const [loading,   setLoading]   = useState(true)
  const [running,   setRunning]   = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  // Tabs
  const [activeTab, setActiveTab] = useState<'quality' | 'schema' | 'rules' | 'lineage' | 'drift' | 'trends'>('quality')
  const [driftCount, setDriftCount] = useState(0)
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

  // AI feature state
  const [descLoading,      setDescLoading]      = useState(false)
  const [descText,         setDescText]          = useState<string | null>(null)
  const [colDocsLoading,   setColDocsLoading]    = useState(false)
  const [colDocsResult,    setColDocsResult]     = useState<{documented:number,skipped:number}|null>(null)
  const [remediationLoading, setRemediationLoading] = useState(false)
  const [remediationPlan,    setRemediationPlan]    = useState<any | null>(null)
  const [aiError,            setAiError]            = useState<string | null>(null)

  const tableLastProfiledAt = useMemo(
    () => columns
      .map((c: any) => c.last_profiled_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
    [columns]
  )

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const res = await dashboardApi.table(assetId)
      setData(res.data)
      setLastRefreshed(new Date())
    } finally { setLoading(false); setRefreshing(false) }
  }, [assetId])

  useEffect(() => { loadAll() }, [loadAll])

  // Fetch drift summary in background to populate tab badge
  useEffect(() => {
    profilingApi.getSummary(assetId)
      .then(data => setDriftCount(data.filter(s => s.drift_detected).length))
      .catch(() => {})
  }, [assetId])

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

  const handleGenerateDescription = async () => {
    setDescLoading(true)
    setAiError(null)
    try {
      const res = await aiApi.generateDescription(assetId)
      setDescText(res.data.description)
      await loadAll(true)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'LLM unavailable — check that Ollama is running or an API key is configured in Settings.'
      setAiError(`Generate Description failed: ${detail}`)
    } finally { setDescLoading(false) }
  }

  const handleGenerateColumnDocs = async () => {
    setColDocsLoading(true)
    setAiError(null)
    try {
      const res = await aiApi.generateColumnDocs(assetId)
      setColDocsResult(res.data)
      setColFetched(false)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'LLM unavailable — check that Ollama is running or an API key is configured in Settings.'
      setAiError(`Generate Column Docs failed: ${detail}`)
    } finally { setColDocsLoading(false) }
  }

  const handleRemediationPlan = async () => {
    setRemediationLoading(true)
    setRemediationPlan(null)
    setAiError(null)
    try {
      const res = await aiApi.remediationPlan(assetId)
      setRemediationPlan(res.data)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || 'LLM unavailable — check that Ollama is running or an API key is configured in Settings.'
      setAiError(`Remediation Plan failed: ${detail}`)
    } finally { setRemediationLoading(false) }
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
  const failedRules = (data.rules || []).filter((r: any) => r.status === 'failed' || r.status === 'error')
  const refreshedAt = formatTime(lastRefreshed)

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
            {(() => {
              const ts = data.last_run_time
                ?? (data.rules || [])
                     .map((r: any) => r.last_run)
                     .filter(Boolean)
                     .sort()
                     .at(-1)
              return ts ? <>Last run: {formatTs(ts)}</> : <span className="text-gray-400">No runs yet</span>
            })()}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-400"><Clock size={12} />Updated {refreshedAt}</div>
          <button onClick={handleGenerateDescription} disabled={descLoading}
            title="Generate AI business description for this table"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 disabled:opacity-40 transition-all">
            {descLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {descLoading ? 'Generating…' : 'Generate Description'}
          </button>
          <button onClick={handleRemediationPlan} disabled={remediationLoading}
            title="Get AI remediation plan for recent failures"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-40 transition-all">
            {remediationLoading ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
            {remediationLoading ? 'Analysing…' : 'Remediation Plan'}
          </button>
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
          { id: 'quality', label: 'Quality',       icon: <Shield size={14} /> },
          { id: 'schema',  label: 'Schema',         icon: <Columns size={14} /> },
          { id: 'rules',   label: `Rules${(data.pending_rules ?? 0) > 0 ? ` (${data.pending_rules} pending)` : ''}`,  icon: <Database size={14} /> },
          { id: 'lineage', label: 'Lineage',         icon: <GitFork size={14} /> },
          { id: 'drift',   label: 'Schema Drift',   icon: <GitCompare size={14} /> },
          { id: 'trends',  label: 'Profile Trends', icon: <TrendingUp size={14} /> },
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
            {tab.id === 'trends' && driftCount > 0 && (
              <span className="ml-1 flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-red-500 text-white rounded-full">
                {driftCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Quality tab ─────────────────────────────────────────── */}
      {activeTab === 'quality' && <>

      {/* AI error banner */}
      {aiError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 flex-1">{aiError}</p>
          <button onClick={() => setAiError(null)} className="text-red-400 hover:text-red-600 shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {/* AI-generated description banner */}
      {descText && (
        <div className="flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
          <Sparkles size={15} className="text-violet-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-violet-700 mb-0.5">AI-Generated Description</p>
            <p className="text-sm text-violet-900">{descText}</p>
          </div>
          <button onClick={() => setDescText(null)} className="text-violet-400 hover:text-violet-600 shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Remediation plan panel */}
      {remediationPlan && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wrench size={14} className="text-orange-600" />
              <span className="text-sm font-semibold text-orange-800">AI Remediation Plan</span>
            </div>
            <button onClick={() => setRemediationPlan(null)} className="text-orange-400 hover:text-orange-600">
              <X size={13} />
            </button>
          </div>
          {remediationPlan.summary && (
            <p className="text-xs text-orange-700 mb-3 leading-relaxed">{remediationPlan.summary}</p>
          )}
          {remediationPlan.steps?.length > 0 ? (
            <div className="space-y-2">
              {remediationPlan.steps.map((step: any, i: number) => (
                <div key={i} className="bg-white rounded-lg border border-orange-100 px-3 py-2.5 flex items-start gap-3">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                    step.priority === 'critical' ? 'bg-red-100 text-red-700' :
                    step.priority === 'high'     ? 'bg-orange-100 text-orange-700' :
                    step.priority === 'medium'   ? 'bg-yellow-100 text-yellow-700' :
                                                   'bg-gray-100 text-gray-600'
                  }`}>{(step.priority || 'medium').toUpperCase()}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800">{step.action}</p>
                    {step.owner_role && <p className="text-[11px] text-gray-500 mt-0.5">Owner: {step.owner_role} · {step.estimated_effort}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-orange-600 italic">{remediationPlan.summary || 'No recent failures — asset appears healthy.'}</p>
          )}
        </div>
      )}

      {/* KPI Strip — 5 cards */}
      <div className="grid grid-cols-5 gap-3">
        {/* Quality Score */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-1">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">Quality Score</p>
            <MetricInfo metric={METRICS.qualityScore} position="right" />
          </div>
          <p className={`text-3xl font-black tabular-nums ${scoreTextColor(score)}`}>{score.toFixed(1)}%</p>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${scoreBadgeClass(score)}`}>{scoreLabel(score)}</span>
        </div>
        {/* Total Rules */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-1">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">Total Rules</p>
            {METRICS.activeRules && <MetricInfo metric={METRICS.activeRules} position="top" />}
          </div>
          <p className="text-3xl font-black text-gray-900 tabular-nums">{data.total_rules ?? 0}</p>
        </div>
        {/* Passed */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center justify-center gap-1">
          <div className="flex items-center gap-1">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">Passed</p>
            {METRICS.passedToday && <MetricInfo metric={METRICS.passedToday} position="top" />}
          </div>
          <p className="text-3xl font-black text-green-600 tabular-nums">{data.passed_rules ?? 0}</p>
        </div>
        {/* Failed */}
        <div className={`rounded-xl border p-4 flex flex-col items-center justify-center gap-1 ${(data.failed_rules ?? 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-1">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">Failed</p>
            {METRICS.failedToday && <MetricInfo metric={METRICS.failedToday} position="top" />}
          </div>
          <p className={`text-3xl font-black tabular-nums ${(data.failed_rules ?? 0) > 0 ? 'text-red-500' : 'text-gray-400'}`}>{data.failed_rules ?? 0}</p>
        </div>
        {/* Warnings */}
        <div className={`rounded-xl border p-4 flex flex-col items-center justify-center gap-1 ${(data.warning_rules ?? 0) > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200'}`}>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">Warnings</p>
          <p className={`text-3xl font-black tabular-nums ${(data.warning_rules ?? 0) > 0 ? 'text-yellow-500' : 'text-gray-400'}`}>{data.warning_rules ?? 0}</p>
        </div>
      </div>

      {/* 30-day Trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Quality Score Trend</h3>
        <p className="text-[11px] text-gray-400 mb-3">30-day rolling · green = SLA 95%, amber = warning 80%</p>
        <QualityTrendChart data={data.quality_trend || []} height={160} area />
      </div>

      {/* Failing Rules — expandable rows */}
      {failedRules.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-100 bg-red-50/30 flex items-center gap-2">
            <XCircle size={15} className="text-red-500" />
            <h3 className="text-sm font-semibold text-gray-900">Failing Rules — {failedRules.length} issue{failedRules.length > 1 ? 's' : ''}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Rule', 'Severity', 'Score', 'Failed Rows', 'Last Run'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {failedRules.map((rule: any) => {
                  const recentRun = rule.last_run_id
                    ? (data.recent_runs || []).find((r: any) => r.run_id === rule.last_run_id)
                    : (data.recent_runs || []).find((r: any) => r.rule_id === rule.rule_id && r.status !== 'passed')
                  const isExpanded = expandedRun === rule.rule_id
                  return (
                    <React.Fragment key={rule.rule_id}>
                      <tr
                        className="hover:bg-red-50/30 cursor-pointer transition-colors"
                        onClick={() => setExpandedRun(isExpanded ? null : rule.rule_id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronRight size={13} className="text-gray-400 rotate-90 shrink-0" /> : <ChevronRight size={13} className="text-gray-400 shrink-0" />}
                            <Link href={`/rules/${rule.rule_id}`} onClick={e => e.stopPropagation()}
                              className="text-xs font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                              {rule.rule_name}
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3"><SeverityBadge severity={rule.severity} /></td>
                        <td className="px-4 py-3">
                          {rule.quality_score != null
                            ? <span className={`text-xs font-bold ${scoreTextColor(rule.quality_score)}`}>{rule.quality_score.toFixed(0)}%</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {recentRun?.failed_row_count != null ? recentRun.failed_row_count.toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-gray-400">{rule.last_run ? relTime(rule.last_run) : '—'}</td>
                      </tr>
                      {isExpanded && recentRun && (
                        <tr key={`${rule.rule_id}-expanded`}>
                          <td colSpan={5} className="px-5 pb-5 bg-gray-50/50 border-t border-gray-100">
                            <div className="space-y-4 pt-3">
                              {/* Execution stats */}
                              <div className="grid grid-cols-4 gap-2">
                                {[
                                  { label: 'Last Run',      value: rule.last_run ? relTime(rule.last_run) : '—' },
                                  { label: 'Quality Score', value: rule.quality_score != null ? `${rule.quality_score}%` : '—' },
                                  { label: 'Status',        value: rule.status },
                                  { label: 'Run ID',        value: recentRun.run_id?.slice(0, 8) + '…' },
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
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </> /* end Quality tab */}

      {/* ── Rules tab ───────────────────────────────────────────── */}
      {activeTab === 'rules' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database size={15} className="text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">All Rules ({(data.rules || []).length})</h3>
            </div>
            {(data.pending_rules ?? 0) > 0 && (
              <Link href="/rules/approval-queue" className="flex items-center gap-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5 hover:bg-yellow-100 transition-colors">
                <Sparkles size={12} />
                {data.pending_rules} auto-generated rule{data.pending_rules > 1 ? 's' : ''} awaiting review
              </Link>
            )}
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
                    <td className="px-4 py-3">
                      {rule.rule_status === 'pending_review'
                        ? <StatusBadge status="pending_review" />
                        : <StatusBadge status={rule.status} />}
                    </td>
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
      )}

      {/* ── Schema tab ──────────────────────────────────────────── */}
      {activeTab === 'schema' && (
        <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Columns size={15} className="text-gray-500 dark:text-[var(--text-3)]" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-[var(--text)]">Column Metadata</h3>
              {columns.length > 0 && <span className="text-xs text-gray-400 dark:text-[var(--text-4)]">{columns.length} columns</span>}
              {tableLastProfiledAt && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-[var(--text-4)]">
                  <Clock size={10} />
                  Last profiled: {formatTs(tableLastProfiledAt)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Generate Column Docs button */}
              <button onClick={handleGenerateColumnDocs} disabled={colDocsLoading}
                title="Generate AI descriptions for all columns"
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 disabled:opacity-40 transition-all">
                {colDocsLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {colDocsLoading ? 'Documenting…' : 'Generate Column Docs'}
              </button>
              {colDocsResult && (
                <span className="text-[11px] text-green-600 font-medium">
                  ✓ {colDocsResult.documented} documented
                </span>
              )}
              {profilingStatus === 'done' && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle size={11} /> Profiled
                </span>
              )}
              {profilingStatus === 'error' && (
                <Tooltip
                  position="left"
                  maxWidth={320}
                  content={
                    <div className="space-y-1">
                      <p className="font-semibold text-red-300 text-[11px]">Profiling Failed</p>
                      <p className="text-gray-300 text-[10px] leading-relaxed">{profilingError || 'An unknown error occurred during column profiling.'}</p>
                      <p className="text-yellow-300 text-[10px]">💡 Check Snowflake connectivity and warehouse availability in Settings.</p>
                    </div>
                  }
                >
                  <span className="text-xs text-red-500 cursor-help border-b border-dashed border-red-400">
                    Profile failed{profilingError ? ` — ${profilingError.slice(0, 50)}${profilingError.length > 50 ? '…' : ''}` : ''}
                  </span>
                </Tooltip>
              )}
              <Tooltip
                position="left"
                maxWidth={300}
                content={
                  <div className="space-y-1.5">
                    <p className="font-semibold text-white text-[11px]">Profile Columns</p>
                    <p className="text-gray-300 text-[10px] leading-relaxed">
                      Runs a Snowflake query to compute per-column statistics: null rate, distinct count, cardinality, min, max, mean, std dev, and top values.
                    </p>
                    <p className="text-yellow-300 text-[10px]">💡 Uses the DQ_SMALL_WH warehouse. Results persist until the next profile run.</p>
                  </div>
                }
              >
                <button
                  onClick={triggerProfiling}
                  disabled={profilingStatus === 'running'}
                  className="flex items-center gap-1.5 px-3 py-1.5 btn-gradient rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {profilingStatus === 'running'
                    ? <><Loader2 size={11} className="animate-spin" /> Profiling…</>
                    : <><Zap size={11} /> Profile Columns</>}
                </button>
              </Tooltip>
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
                    {SCHEMA_HEADERS.map(({ label, metricKey }) => (
                      <th key={label} className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-400 dark:text-[var(--text-4)] uppercase tracking-widest whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {label}
                          {metricKey && METRICS[metricKey] && (
                            <MetricInfo metric={METRICS[metricKey]} position="bottom" size={10} />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[var(--border)]">
                  {columns.map((col: any) => (
                    <tr key={col.column_name} className="hover:bg-gray-50 dark:hover:bg-[var(--surface-sub)] transition-colors">
                      {/* Column name */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {col.is_primary_key && (
                            <Tooltip
                              position="top"
                              content={
                                <div className="space-y-1">
                                  <p className="font-semibold text-yellow-300 text-[11px]">Primary Key</p>
                                  <p className="text-gray-300 text-[10px]">This column uniquely identifies each row in the table.</p>
                                  <p className="text-yellow-300 text-[10px]">💡 Consider adding a uniqueness_check rule to detect duplicates.</p>
                                </div>
                              }
                            >
                              <span className="w-4 h-4 rounded bg-yellow-100 dark:bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 flex items-center justify-center text-[9px] font-bold cursor-help">PK</span>
                            </Tooltip>
                          )}
                          <span className="text-xs font-semibold text-gray-900 dark:text-[var(--text)] font-mono">{col.column_name}</span>
                          {col.classification && (() => {
                            const tip = CLASSIFICATION_TOOLTIPS[col.classification]
                            return (
                              <Tooltip
                                position="top"
                                maxWidth={300}
                                content={tip
                                  ? <div className="space-y-1.5">
                                      <p className="font-semibold text-white text-[11px]">{tip.title}</p>
                                      <p className="text-gray-300 text-[10px] leading-relaxed">{tip.desc}</p>
                                      <div className="border-t border-gray-700 pt-1">
                                        <p className="text-gray-400 text-[10px]">Examples: {tip.examples}</p>
                                      </div>
                                    </div>
                                  : CLASSIFICATION_LABELS[col.classification] ?? col.classification
                                }
                              >
                                <span className={`text-[9px] px-1 py-0.5 rounded font-semibold uppercase tracking-wide cursor-help ${CLASSIFICATION_COLORS[col.classification] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {CLASSIFICATION_LABELS[col.classification] ?? col.classification}
                                </span>
                              </Tooltip>
                            )
                          })()}
                        </div>
                      </td>
                      {/* Type */}
                      <td className="px-3 py-2.5 text-xs text-blue-600 dark:text-blue-400 font-mono whitespace-nowrap">{col.data_type || '—'}</td>
                      {/* Nullable */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)]">{col.is_nullable ? 'Yes' : 'No'}</td>
                      {/* Null % — orange if > 10% */}
                      <td className="px-3 py-2.5">
                        {col.null_pct != null
                          ? col.null_pct > 10
                            ? <Tooltip
                                position="top"
                                content={
                                  <div className="space-y-1">
                                    <p className="font-semibold text-orange-300 text-[11px]">High Null Rate</p>
                                    <p className="text-gray-300 text-[10px]">{col.null_pct.toFixed(1)}% of rows are NULL — above the 10% warning threshold.</p>
                                    <p className="text-yellow-300 text-[10px]">💡 Consider adding a null_check rule to alert on missing values.</p>
                                  </div>
                                }
                              >
                                <span className="text-xs font-semibold text-orange-500 cursor-help border-b border-dashed border-orange-400">{col.null_pct.toFixed(1)}%</span>
                              </Tooltip>
                            : <span className="text-xs font-semibold text-gray-500 dark:text-[var(--text-3)]">{col.null_pct.toFixed(1)}%</span>
                          : <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>}
                      </td>
                      {/* Distinct count */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)]">{col.distinct_count != null ? col.distinct_count.toLocaleString() : '—'}</td>
                      {/* Cardinality — amber if < 5% (low cardinality, good for accepted_values rule) */}
                      <td className="px-3 py-2.5">
                        {col.cardinality_pct != null
                          ? col.cardinality_pct < 5
                            ? <Tooltip
                                position="top"
                                content={
                                  <div className="space-y-1">
                                    <p className="font-semibold text-amber-300 text-[11px]">Low Cardinality</p>
                                    <p className="text-gray-300 text-[10px]">Only {col.cardinality_pct.toFixed(1)}% of values are unique — this column has a small fixed set of values.</p>
                                    <p className="text-yellow-300 text-[10px]">💡 Strong candidate for an accepted_values rule to lock in the allowed set.</p>
                                  </div>
                                }
                              >
                                <span className="text-xs font-medium text-amber-500 cursor-help border-b border-dashed border-amber-400">{col.cardinality_pct.toFixed(1)}%</span>
                              </Tooltip>
                            : <span className="text-xs font-medium text-gray-500 dark:text-[var(--text-3)]">{col.cardinality_pct.toFixed(1)}%</span>
                          : <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>}
                      </td>
                      {/* Min — hidden for text types (alphabetical min is not meaningful) */}
                      <td className="px-3 py-2.5 max-w-[80px] overflow-hidden">
                        {isTextType(col.data_type)
                          ? <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>
                          : col.min_value != null
                            ? <Tooltip
                                text={`Min: ${col.min_value}`}
                                position="top"
                                className="block w-full overflow-hidden"
                              >
                                <span className="text-xs text-gray-500 dark:text-[var(--text-3)] font-mono block truncate cursor-default">{col.min_value}</span>
                              </Tooltip>
                            : <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>}
                      </td>
                      {/* Max — hidden for text types */}
                      <td className="px-3 py-2.5 max-w-[80px] overflow-hidden">
                        {isTextType(col.data_type)
                          ? <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>
                          : col.max_value != null
                            ? <Tooltip
                                text={`Max: ${col.max_value}`}
                                position="top"
                                className="block w-full overflow-hidden"
                              >
                                <span className="text-xs text-gray-500 dark:text-[var(--text-3)] font-mono block truncate cursor-default">{col.max_value}</span>
                              </Tooltip>
                            : <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>}
                      </td>
                      {/* Mean — numeric only */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)]">
                        {isNumericType(col.data_type) && col.mean != null
                          ? col.mean.toFixed(2)
                          : <span className="text-gray-300 dark:text-[var(--text-4)]">—</span>}
                      </td>
                      {/* Std Dev — numeric only */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-[var(--text-3)]">
                        {isNumericType(col.data_type) && col.std_dev != null
                          ? col.std_dev.toFixed(2)
                          : <span className="text-gray-300 dark:text-[var(--text-4)]">—</span>}
                      </td>
                      {/* Top Values — masked for PII/SENSITIVE/CONFIDENTIAL/RESTRICTED */}
                      <td className="px-3 py-2.5 max-w-[140px] overflow-hidden">
                        {SHOULD_MASK.has(col.classification)
                          ? <span className="flex items-center gap-1 text-xs text-gray-400 italic">
                              <EyeOff size={10} />
                              Masked ({CLASSIFICATION_LABELS[col.classification] ?? col.classification})
                            </span>
                          : Array.isArray(col.top_values) && col.top_values.length > 0
                            ? <Tooltip
                                position="bottom"
                                maxWidth={280}
                                className="block w-full overflow-hidden"
                                content={
                                  <div className="space-y-0.5">
                                    {col.top_values.map((v: any, i: number) => (
                                      <div key={i} className="flex items-center justify-between gap-3">
                                        <span className="font-mono truncate max-w-[160px]">{String(v.value)}</span>
                                        <span className="text-gray-400 shrink-0">{Number(v.count).toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                }
                              >
                                <span className="text-xs text-gray-500 dark:text-[var(--text-3)] whitespace-nowrap block truncate cursor-default">
                                  {col.top_values.slice(0, 2).map((v: any) => v.value).join(', ')}
                                  {col.top_values.length > 2 && <span className="text-gray-400"> +{col.top_values.length - 2}</span>}
                                </span>
                              </Tooltip>
                            : <span className="text-gray-300 dark:text-[var(--text-4)] text-xs">—</span>}
                      </td>
                      {/* Description — tooltip shows full text when truncated */}
                      <td className="px-3 py-2.5 max-w-[180px]">
                        {col.description
                          ? <Tooltip
                              text={col.description}
                              position="left"
                              maxWidth={320}
                            >
                              <span className="text-xs text-gray-500 dark:text-[var(--text-3)] line-clamp-2 cursor-default leading-relaxed">{col.description}</span>
                            </Tooltip>
                          : <span className="text-gray-300 dark:text-[var(--text-4)] italic text-xs">No description</span>}
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
        <div className="py-4">
          <LineageTab assetId={assetId} />
        </div>
      )}

      {/* ── Schema Drift tab ────────────────────────────────────── */}
      {activeTab === 'drift' && (
        <SchemaDriftTab assetId={assetId} />
      )}

      {/* ── Profile Trends tab ──────────────────────────────────── */}
      {activeTab === 'trends' && (
        <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-[var(--border)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={15} className="text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[var(--text)]">Profile Trends</h3>
            <span className="text-xs text-gray-400 dark:text-[var(--text-4)]">Column statistics over time · drift detection</span>
          </div>
          <ProfileTrendsTab assetId={assetId} />
        </div>
      )}

    </div>
  )
}
