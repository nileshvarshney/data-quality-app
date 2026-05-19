'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { governanceApi, aiApi } from '@/services/apiClient'
import {
  Shield, AlertTriangle, CheckCircle, Settings, Loader2, X, Plus,
  RefreshCw, ChevronRight, ChevronDown, ExternalLink, Database,
  Table2, ArrowRight, Sparkles, Bot, ChevronUp,
} from 'lucide-react'
import clsx from 'clsx'
import HowItWorks from '@/components/common/HowItWorks'
import { useTimezone } from '@/contexts/TimezoneContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Scorecard {
  domain_id: string
  domain_name: string
  quality_score: number | null
  documentation_score: number | null
  classification_score: number | null
  ownership_score: number | null
  certification_score: number | null
  sla_score: number | null
  overall_score: number | null
}

interface SubdomainScorecard {
  subdomain_id: string
  subdomain_name: string
  total_assets: number
  quality_score: number | null
  documentation_score: number | null
  classification_score: number | null
  ownership_score: number | null
  certification_score: number | null
  sla_score: number | null
  overall_score: number | null
}

interface Violation {
  violation_id: string
  policy_id: string
  policy_name: string
  entity_type: string
  entity_id: string
  violation_detail: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  detected_at: string
  status: string
  // Enriched asset context
  sf_table_name?: string | null
  sf_schema_name?: string | null
  sf_database_name?: string | null
  domain_name?: string | null
  subdomain_name?: string | null
}

interface Policy {
  policy_id: string
  policy_name: string
  policy_type: string
  severity: string
  is_active: boolean
  description?: string | null
}

interface PolicyForm {
  policy_name: string
  policy_type: string
  severity: string
  description: string
}

const EMPTY_POLICY: PolicyForm = {
  policy_name: '',
  policy_type: 'completeness',
  severity: 'medium',
  description: '',
}

const SCORE_CELL_CLS = (score: number | null) => {
  if (score === null) return 'text-gray-400'
  if (score >= 80) return 'text-green-700 bg-green-50'
  if (score >= 60) return 'text-yellow-700 bg-yellow-50'
  return 'text-red-700 bg-red-50'
}

const SEV_CLS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-gray-100 text-gray-600',
}

// ── Scorecard tab ─────────────────────────────────────────────────────────────

function ScorecardsTab() {
  const [cards, setCards]         = useState<Scorecard[]>([])
  const [loading, setLoading]     = useState(true)
  const [evaluating, setEvaluating] = useState(false)
  const [expanded, setExpanded]   = useState<Set<string>>(new Set())
  const [subdomains, setSubdomains] = useState<Record<string, SubdomainScorecard[]>>({})
  const [loadingSD, setLoadingSD] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await governanceApi.scorecards()
      const raw: any[] = Array.isArray(res.data) ? res.data : []
      const normalized: Scorecard[] = raw.map(row => ({
        domain_id:           row.domain_id   ?? '',
        domain_name:         row.domain_name ?? row.domain_id ?? '',
        overall_score:       row.overall_score != null ? Number(row.overall_score) : null,
        quality_score:       row.quality_score        != null ? Number(row.quality_score)        : (row.dimensions?.quality        != null ? Number(row.dimensions.quality)        : null),
        documentation_score: row.documentation_score  != null ? Number(row.documentation_score)  : (row.dimensions?.documentation  != null ? Number(row.dimensions.documentation)  : (row.dimensions?.docs != null ? Number(row.dimensions.docs) : null)),
        classification_score:row.classification_score != null ? Number(row.classification_score) : (row.dimensions?.classification  != null ? Number(row.dimensions.classification) : null),
        ownership_score:     row.ownership_score      != null ? Number(row.ownership_score)      : (row.dimensions?.ownership       != null ? Number(row.dimensions.ownership)       : null),
        certification_score: row.certification_score  != null ? Number(row.certification_score)  : (row.dimensions?.certification   != null ? Number(row.dimensions.certification)   : null),
        sla_score:           row.sla_score             != null ? Number(row.sla_score)             : (row.dimensions?.sla              != null ? Number(row.dimensions.sla)              : null),
      }))
      setCards(normalized)
    } catch {
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleEvaluate = async () => {
    setEvaluating(true)
    try {
      await governanceApi.evaluate()
      await load()
    } finally {
      setEvaluating(false)
    }
  }

  const toggleDomain = async (domainId: string) => {
    const next = new Set(expanded)
    if (next.has(domainId)) {
      next.delete(domainId)
      setExpanded(next)
      return
    }
    next.add(domainId)
    setExpanded(next)

    if (subdomains[domainId]) return // already loaded

    setLoadingSD(prev => new Set([...prev, domainId]))
    try {
      const res = await governanceApi.subdomainScorecards(domainId)
      const raw: any[] = Array.isArray(res.data) ? res.data : []
      setSubdomains(prev => ({ ...prev, [domainId]: raw.map(sd => ({
        subdomain_id:        sd.subdomain_id,
        subdomain_name:      sd.subdomain_name,
        total_assets:        sd.total_assets ?? 0,
        overall_score:       sd.overall_score != null ? Number(sd.overall_score) : null,
        quality_score:       sd.quality_score != null ? Number(sd.quality_score) : null,
        documentation_score: sd.documentation_score != null ? Number(sd.documentation_score) : null,
        classification_score:sd.classification_score != null ? Number(sd.classification_score) : null,
        ownership_score:     sd.ownership_score != null ? Number(sd.ownership_score) : null,
        certification_score: sd.certification_score != null ? Number(sd.certification_score) : null,
        sla_score:           sd.sla_score != null ? Number(sd.sla_score) : null,
      }))
      }))
    } catch {
      setSubdomains(prev => ({ ...prev, [domainId]: [] }))
    } finally {
      setLoadingSD(prev => { const s = new Set(prev); s.delete(domainId); return s })
    }
  }

  const dims: { key: keyof Scorecard; label: string }[] = [
    { key: 'quality_score',        label: 'Quality' },
    { key: 'documentation_score',  label: 'Docs' },
    { key: 'classification_score', label: 'Class.' },
    { key: 'ownership_score',      label: 'Ownership' },
    { key: 'certification_score',  label: 'Certified' },
    { key: 'sla_score',            label: 'SLA' },
  ]

  const ScoreCell = ({ val }: { val: number | null }) => (
    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded', SCORE_CELL_CLS(val))}>
      {val != null ? `${Number(val).toFixed(0)}%` : '—'}
    </span>
  )

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={handleEvaluate}
          disabled={evaluating}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {evaluating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Run Evaluation
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse h-12 bg-gray-100 rounded-lg" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Shield size={32} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">No scorecard data available</p>
          <p className="text-xs text-gray-400 mt-1">Run an evaluation to generate governance scores.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm bg-white rounded-xl border border-gray-200 overflow-hidden">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-48">Domain / Subdomain</th>
                {dims.map(d => (
                  <th key={d.key} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {d.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cards.map(card => {
                const isExpanded = expanded.has(card.domain_id)
                const isLoadingSD = loadingSD.has(card.domain_id)
                const sdCards = subdomains[card.domain_id] ?? []
                return (
                  <>
                    {/* Domain row */}
                    <tr
                      key={card.domain_id}
                      onClick={() => toggleDomain(card.domain_id)}
                      className="hover:bg-indigo-50/40 cursor-pointer group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 group-hover:text-indigo-500 transition-colors">
                            {isExpanded
                              ? <ChevronDown size={14} />
                              : <ChevronRight size={14} />}
                          </span>
                          <span className="font-semibold text-gray-900">{card.domain_name}</span>
                        </div>
                      </td>
                      {dims.map(d => (
                        <td key={d.key} className="px-3 py-3 text-center">
                          <ScoreCell val={card[d.key] as number | null} />
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center">
                        <span className={clsx('text-sm font-bold px-2 py-0.5 rounded', SCORE_CELL_CLS(card.overall_score))}>
                          {card.overall_score != null ? `${Number(card.overall_score).toFixed(0)}%` : '—'}
                        </span>
                      </td>
                    </tr>

                    {/* Subdomain rows */}
                    {isExpanded && (
                      isLoadingSD ? (
                        <tr key={`${card.domain_id}-loading`}>
                          <td colSpan={8} className="px-4 py-3 bg-indigo-50/30">
                            <div className="flex items-center gap-2 text-xs text-gray-400 pl-6">
                              <Loader2 size={12} className="animate-spin" />
                              Loading subdomains…
                            </div>
                          </td>
                        </tr>
                      ) : sdCards.length === 0 ? (
                        <tr key={`${card.domain_id}-empty`}>
                          <td colSpan={8} className="px-4 py-2 bg-indigo-50/30">
                            <span className="text-xs text-gray-400 pl-8">No subdomains found</span>
                          </td>
                        </tr>
                      ) : (
                        sdCards.map(sd => (
                          <tr key={sd.subdomain_id} className="bg-indigo-50/20 hover:bg-indigo-50/50">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2 pl-6">
                                <div className="w-px h-4 bg-indigo-200" />
                                <span className="text-xs text-gray-600 font-medium">{sd.subdomain_name}</span>
                                <span className="text-xs text-gray-400">({sd.total_assets} tables)</span>
                              </div>
                            </td>
                            {dims.map(d => (
                              <td key={d.key} className="px-3 py-2.5 text-center">
                                <ScoreCell val={sd[d.key as keyof SubdomainScorecard] as number | null} />
                              </td>
                            ))}
                            <td className="px-3 py-2.5 text-center">
                              <span className={clsx('text-xs font-bold px-2 py-0.5 rounded', SCORE_CELL_CLS(sd.overall_score))}>
                                {sd.overall_score != null ? `${Number(sd.overall_score).toFixed(0)}%` : '—'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2 text-right">Click a domain row to expand subdomain breakdown</p>
        </div>
      )}
    </div>
  )
}

// ── Violations tab ────────────────────────────────────────────────────────────

function ViolationsTab() {
  const router = useRouter()
  const { formatTs } = useTimezone()
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading]       = useState(true)
  const [resolving, setResolving]   = useState<string | null>(null)

  // AI Review Queue state
  const [queueOpen,       setQueueOpen]       = useState(false)
  const [queueLoading,    setQueueLoading]    = useState(false)
  const [queue,           setQueue]           = useState<any | null>(null)
  const [resolutionMap,   setResolutionMap]   = useState<Record<string, string>>({})
  const [resolvingAI,     setResolvingAI]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await governanceApi.violations({ status: 'open' })
      setViolations(Array.isArray(res.data) ? res.data : [])
    } catch {
      setViolations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleResolve = async (id: string) => {
    setResolving(id)
    try {
      await governanceApi.resolveViolation(id)
      setViolations(prev => prev.filter(v => v.violation_id !== id))
    } finally {
      setResolving(null)
    }
  }

  const loadQueue = async () => {
    setQueueLoading(true)
    try {
      const res = await aiApi.governanceReviewQueue()
      setQueue(res.data)
      setQueueOpen(true)
    } catch { /* silently ignore */ }
    finally { setQueueLoading(false) }
  }

  const draftResolution = async (violationId: string) => {
    setResolvingAI(violationId)
    try {
      const res = await aiApi.suggestViolationResolution(violationId)
      setResolutionMap(prev => ({ ...prev, [violationId]: res.data.suggested_resolution }))
    } catch { /* silently ignore */ }
    finally { setResolvingAI(null) }
  }

  // Navigate to the page where the user can fix the violation
  const navigateToFix = (v: Violation) => {
    if (v.entity_type === 'asset') {
      router.push(`/dashboard/tables/${v.entity_id}`)
    } else if (v.entity_type === 'rule') {
      router.push(`/rules/${v.entity_id}`)
    } else if (v.entity_type === 'domain') {
      router.push(`/dashboard/domains/${v.entity_id}`)
    } else if (v.entity_type === 'subdomain') {
      router.push(`/dashboard/subdomains/${v.entity_id}`)
    } else {
      router.push('/assets')
    }
  }

  const DatasetCell = ({ v }: { v: Violation }) => {
    if (v.sf_table_name) {
      return (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Table2 size={12} className="text-indigo-400 shrink-0" />
            <span className="text-sm font-semibold text-gray-900 truncate">{v.sf_table_name}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <Database size={10} className="text-gray-300 shrink-0" />
            <span className="text-xs text-gray-400 truncate">
              {[v.sf_database_name, v.sf_schema_name].filter(Boolean).join(' / ')}
            </span>
          </div>
          {(v.domain_name || v.subdomain_name) && (
            <div className="text-xs text-gray-400 mt-0.5 truncate">
              {[v.domain_name, v.subdomain_name].filter(Boolean).join(' › ')}
            </div>
          )}
        </div>
      )
    }
    // Fallback for non-asset violations
    return (
      <div className="min-w-0">
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize">
          {v.entity_type}
        </span>
        <p className="text-xs font-mono text-gray-400 truncate mt-0.5 max-w-[140px]">{v.entity_id}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── AI Review Queue Panel ── */}
      <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <Bot size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-900">AI Review Queue</p>
              <p className="text-xs text-violet-600">AI-prioritised violations with suggested actions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {queue && (
              <button onClick={() => setQueueOpen(o => !o)} className="text-violet-600 hover:text-violet-800">
                {queueOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
            <button
              onClick={loadQueue}
              disabled={queueLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {queueLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {queueLoading ? 'Loading…' : queue ? 'Refresh Queue' : 'Load AI Queue'}
            </button>
          </div>
        </div>

        {queue && queueOpen && (
          <div className="border-t border-violet-200 px-4 py-4 space-y-3">
            {/* Priority summary */}
            {queue.summary && (
              <div className="flex items-start gap-2 bg-white rounded-lg px-3 py-2.5 border border-violet-100">
                <Bot size={13} className="text-violet-500 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-700 leading-relaxed">{queue.summary}</p>
              </div>
            )}

            {/* AI-prioritised violations */}
            {queue.violations?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wider mb-2">
                  Open Violations ({queue.violations.length})
                </p>
                <div className="space-y-2">
                  {queue.violations.map((v: any) => {
                    const action = queue.ai_actions?.violation_actions?.[v.violation_id]
                    const resolution = resolutionMap[v.violation_id]
                    return (
                      <div key={v.violation_id} className="bg-white rounded-lg border border-violet-100 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded uppercase',
                                v.severity === 'critical' ? 'bg-red-100 text-red-700' :
                                v.severity === 'high'     ? 'bg-orange-100 text-orange-700' :
                                v.severity === 'medium'   ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-gray-100 text-gray-600'
                              )}>{v.severity}</span>
                              <span className="text-xs font-medium text-gray-900 truncate">{v.policy_name}</span>
                            </div>
                            <p className="text-xs text-gray-500 line-clamp-1">{v.detail}</p>
                            {action && (
                              <p className="text-xs text-violet-700 mt-1.5 font-medium">
                                💡 {action}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => draftResolution(v.violation_id)}
                            disabled={resolvingAI === v.violation_id}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-violet-700 border border-violet-300 rounded-lg hover:bg-violet-50 disabled:opacity-50 transition-colors"
                          >
                            {resolvingAI === v.violation_id
                              ? <Loader2 size={10} className="animate-spin" />
                              : <Sparkles size={10} />}
                            Draft Resolution
                          </button>
                        </div>
                        {resolution && (
                          <div className="mt-2 bg-violet-50 rounded-lg px-3 py-2 border border-violet-100">
                            <p className="text-[11px] font-semibold text-violet-700 mb-1">AI-Drafted Resolution Note</p>
                            <p className="text-xs text-gray-700 leading-relaxed">{resolution}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pending rule approvals */}
            {queue.pending_approvals?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wider mb-2">
                  Pending Approvals ({queue.pending_approvals.length})
                </p>
                <div className="space-y-2">
                  {queue.pending_approvals.map((r: any) => {
                    const action = queue.ai_actions?.approval_actions?.[r.rule_id]
                    return (
                      <div key={r.rule_id} className="bg-white rounded-lg border border-violet-100 p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded uppercase',
                              r.severity === 'critical' ? 'bg-red-100 text-red-700' :
                              r.severity === 'high'     ? 'bg-orange-100 text-orange-700' :
                                                          'bg-yellow-100 text-yellow-700'
                            )}>{r.severity}</span>
                            <span className="text-xs font-medium text-gray-900 truncate">{r.rule_name}</span>
                          </div>
                          <p className="text-xs text-gray-400">{r.table} · {r.domain} · by {r.created_by || 'unknown'}</p>
                          {action && <p className="text-xs text-violet-700 mt-1 font-medium">💡 {action}</p>}
                        </div>
                        <button
                          onClick={() => router.push(`/rules/${r.rule_id}`)}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                        >
                          <ChevronRight size={10} /> Review
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {queue.violations?.length === 0 && queue.pending_approvals?.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2.5">
                <CheckCircle size={14} className="text-green-500" /> No items require attention.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Violations table ── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-lg" />
          ))}
        </div>
      ) : violations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <CheckCircle size={32} className="text-green-400 mb-3" />
          <p className="text-sm font-medium text-gray-600">No open violations</p>
          <p className="text-xs text-gray-400 mt-1">All governance policies are being followed.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-52">Dataset</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Policy Violated</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">What's Wrong</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Detected</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {violations.map(v => (
                <tr key={v.violation_id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <DatasetCell v={v} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {v.policy_name || v.entity_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 max-w-xs">
                    <p className="line-clamp-2">{v.violation_detail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full capitalize', SEV_CLS[v.severity] ?? SEV_CLS.low)}>
                      {v.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {formatTs(v.detected_at, { dateOnly: true })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {/* Primary: navigate to where it can be fixed */}
                      <button
                        onClick={() => navigateToFix(v)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                        title="Go to the dataset to fix this issue"
                      >
                        <ArrowRight size={11} />
                        Fix
                      </button>
                      {/* Secondary: mark resolved */}
                      <button
                        onClick={() => handleResolve(v.violation_id)}
                        disabled={resolving === v.violation_id}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-green-700 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-50"
                        title="Mark as resolved"
                      >
                        {resolving === v.violation_id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <CheckCircle size={11} />}
                        Resolve
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Policies tab ──────────────────────────────────────────────────────────────

function PoliciesTab() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState<PolicyForm>(EMPTY_POLICY)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await governanceApi.policies()
      setPolicies(Array.isArray(res.data) ? res.data : [])
    } catch {
      setPolicies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setF = (field: keyof PolicyForm, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.policy_name.trim()) return
    setSaving(true)
    try {
      await governanceApi.createPolicy(form)
      setShowForm(false)
      setForm(EMPTY_POLICY)
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cancel' : 'New Policy'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Policy Name *</label>
            <input
              value={form.policy_name}
              onChange={e => setF('policy_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. No orphan assets"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Policy Type</label>
            <select
              value={form.policy_type}
              onChange={e => setF('policy_type', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['completeness', 'ownership', 'documentation', 'classification', 'certification', 'sla'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Severity</label>
            <select
              value={form.severity}
              onChange={e => setF('severity', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['critical', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input
              value={form.description}
              onChange={e => setF('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Create Policy
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse h-12 bg-gray-100 rounded-lg" />
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Settings size={32} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">No policies defined</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Policy Name', 'Type', 'Severity', 'Active'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {policies.map(p => (
                <tr key={p.policy_id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.policy_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{p.policy_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', SEV_CLS[p.severity] ?? SEV_CLS.low)}>
                      {p.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                      p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { value: 'scorecards',  label: 'Scorecards',  icon: Shield },
  { value: 'violations',  label: 'Violations',  icon: AlertTriangle },
  { value: 'policies',    label: 'Policies',    icon: Settings },
]

export default function GovernancePage() {
  const [tab, setTab] = useState('scorecards')

  return (
    <div className="p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Governance Hub</h1>
        <p className="text-gray-500 text-sm mt-1">Policy enforcement, domain scorecards, and violation tracking</p>
      </div>

      <HowItWorks
        storageKey="governance"
        title="How Governance Hub Works"
        steps={[
          { icon: <Shield size={13} />, title: 'View Scorecards', description: 'Each domain gets a scorecard rating quality, documentation coverage, classification, ownership, certification, and SLA compliance. Click a domain row to drill into subdomains.' },
          { icon: <Settings size={13} />, title: 'Manage Policies', description: 'Define governance policies (e.g. no uncertified tables, PII must be classified) that run nightly to detect violations.' },
          { icon: <AlertTriangle size={13} />, title: 'Review Violations', description: 'Each violation shows the exact table and schema where the issue exists. Click Fix to navigate directly to the dataset and resolve the problem.' },
          { icon: <CheckCircle size={13} />, title: 'Improve Score', description: 'As teams fix violations and add metadata, domain governance scores rise automatically on the next evaluation.' },
        ]}
      />

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'scorecards' && <ScorecardsTab />}
      {tab === 'violations' && <ViolationsTab />}
      {tab === 'policies'   && <PoliciesTab />}
    </div>
  )
}
