'use client'
import { useEffect, useState, useCallback } from 'react'
import { complianceApi, assetsApi } from '@/services/apiClient'
import { api } from '@/services/apiClient'
import {
  Shield, CheckCircle, XCircle, AlertTriangle, Loader2,
  FileText, Search, RefreshCw, ChevronRight, Zap,
  Download, AlertCircle, Package,
} from 'lucide-react'
import clsx from 'clsx'
import HowItWorks from '@/components/common/HowItWorks'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Framework {
  framework_id: string
  framework_name: string
  version: string | null
  description: string | null
  is_active: boolean
}

interface Requirement {
  req_id: string
  req_code: string | null
  req_name: string | null
  req_description: string | null
  dq_rule_types: string | null
}

interface AssessmentRow {
  req_id: string
  req_code: string | null
  req_name: string | null
  status: 'compliant' | 'gap'
  mapping_id: string
}

interface AssessmentSummary {
  total: number
  compliant: number
  gaps: number
  pct: number
  rows: AssessmentRow[]
  assetLabel: string
}

// ── Colour map ────────────────────────────────────────────────────────────────

const FW_STYLES: Record<string, { accent: string; light: string }> = {
  'GDPR':         { accent: 'bg-blue-600',    light: 'bg-blue-50'    },
  'CCPA':         { accent: 'bg-indigo-600',  light: 'bg-indigo-50'  },
  'HIPAA':        { accent: 'bg-green-600',   light: 'bg-green-50'   },
  'SOX':          { accent: 'bg-orange-600',  light: 'bg-orange-50'  },
  'BCBS 239':     { accent: 'bg-purple-600',  light: 'bg-purple-50'  },
  'ISO 27001':    { accent: 'bg-teal-600',    light: 'bg-teal-50'    },
  'SOC 2 Type II':{ accent: 'bg-cyan-600',    light: 'bg-cyan-50'    },
  'ISO 27701':    { accent: 'bg-violet-600',  light: 'bg-violet-50'  },
  'NIST CSF':     { accent: 'bg-sky-600',     light: 'bg-sky-50'     },
  'NIST 800-53':  { accent: 'bg-rose-600',    light: 'bg-rose-50'    },
  'CIS Controls': { accent: 'bg-amber-600',   light: 'bg-amber-50'   },
  'PCI DSS':      { accent: 'bg-red-600',     light: 'bg-red-50'     },
  'HITRUST':      { accent: 'bg-emerald-600', light: 'bg-emerald-50' },
}
const fwStyle = (name: string) =>
  FW_STYLES[name] ?? { accent: 'bg-gray-600', light: 'bg-gray-50' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  return (
    <span className={clsx(
      'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
      status === 'compliant' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
    )}>
      {status}
    </span>
  )
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Requirements + assessment panel ──────────────────────────────────────────

function RequirementsPanel({ fw, assets }: { fw: Framework; assets: any[] }) {
  const style = fwStyle(fw.framework_name)
  const [reqs,         setReqs]         = useState<Requirement[]>([])
  const [loading,      setLoading]      = useState(true)
  const [assessment,   setAssessment]   = useState<AssessmentSummary | null>(null)
  const [assessing,    setAssessing]    = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState('')
  const [tab,          setTab]          = useState<'all' | 'gaps' | 'compliant'>('all')

  // Load requirements when framework changes
  useEffect(() => {
    setLoading(true)
    setAssessment(null)
    setError(null)
    setSelectedAsset('')
    setTab('all')
    complianceApi.requirements(fw.framework_id)
      .then(r => setReqs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setReqs([]))
      .finally(() => setLoading(false))
  }, [fw.framework_id])

  const handleAssess = useCallback(async () => {
    if (!selectedAsset) return
    setAssessing(true)
    setError(null)
    try {
      const res = await complianceApi.assess(fw.framework_id, selectedAsset)
      // Key by req_id to avoid double-counting (old code keyed by both req_code AND req_name)
      const rows: AssessmentRow[] = Array.isArray(res.data?.requirements)
        ? res.data.requirements
        : []
      const compliant = rows.filter(r => r.status === 'compliant').length
      const gaps      = rows.filter(r => r.status === 'gap').length
      const total     = rows.length
      const asset     = assets.find(a => a.asset_id === selectedAsset)
      const assetLabel = asset
        ? [asset.sf_database_name, asset.sf_schema_name, asset.sf_table_name].filter(Boolean).join('.')
        : selectedAsset
      setAssessment({
        total, compliant, gaps,
        pct: total > 0 ? Math.round(compliant / total * 100) : 0,
        rows,
        assetLabel,
      })
      setTab('all')
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Assessment failed — check API connection or login status.')
    } finally {
      setAssessing(false)
    }
  }, [fw.framework_id, selectedAsset, assets])

  // Look up result by req_id only — eliminates the double-count bug
  const getResult = (req: Requirement): AssessmentRow | undefined =>
    assessment?.rows.find(r => r.req_id === req.req_id)

  const handleExport = () => {
    if (!assessment) return
    downloadJson(
      {
        framework: fw.framework_name,
        version: fw.version,
        description: fw.description,
        table: assessment.assetLabel,
        assessed_at: new Date().toISOString(),
        compliance_pct: assessment.pct,
        summary: { total: assessment.total, compliant: assessment.compliant, gaps: assessment.gaps },
        requirements: assessment.rows.map(r => ({
          req_code:   r.req_code,
          req_name:   r.req_name,
          status:     r.status,
          mapping_id: r.mapping_id,
        })),
      },
      `compliance_${fw.framework_name.replace(/\s+/g, '_')}_${Date.now()}.json`
    )
  }

  const visibleReqs = reqs.filter(req => {
    if (tab === 'all') return true
    const result = getResult(req)
    if (!result) return tab === 'gaps'
    return tab === 'gaps' ? result.status === 'gap' : result.status === 'compliant'
  })

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Panel header — framework info + compliance score */}
      <div className={clsx('px-6 py-4 border-b border-gray-100 shrink-0', style.light)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={clsx('text-xs font-bold text-white px-2 py-0.5 rounded', style.accent)}>
                {fw.framework_name}
              </span>
              {fw.version && <span className="text-xs text-gray-400">v{fw.version}</span>}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{fw.description}</p>
          </div>
          {assessment && (
            <div className="shrink-0 text-right">
              <p className={clsx(
                'text-3xl font-black leading-none',
                assessment.pct === 100 ? 'text-green-600' : assessment.pct >= 70 ? 'text-yellow-600' : 'text-red-600'
              )}>{assessment.pct}%</p>
              <p className="text-[10px] text-gray-400 mt-0.5">compliant</p>
            </div>
          )}
        </div>

        {/* Progress bar — only after assessment */}
        {assessment && (
          <div className="mt-3">
            <div className="flex gap-4 mb-1.5 text-xs">
              <span className="flex items-center gap-1 text-green-600 font-semibold">
                <CheckCircle size={12} />{assessment.compliant} compliant
              </span>
              <span className="flex items-center gap-1 text-red-500 font-semibold">
                <XCircle size={12} />{assessment.gaps} gap{assessment.gaps !== 1 ? 's' : ''}
              </span>
              <span className="text-gray-400 ml-auto">{assessment.total} requirements</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-700"
                style={{ width: `${assessment.pct}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Table: {assessment.assetLabel}</p>
          </div>
        )}
      </div>

      {/* Assessment controls */}
      <div className="px-6 py-3 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedAsset}
            onChange={e => { setSelectedAsset(e.target.value); setAssessment(null); setError(null) }}
            className="flex-1 min-w-[180px] text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">— select a table to assess —</option>
            {assets.map(a => (
              <option key={a.asset_id} value={a.asset_id}>
                {[a.sf_database_name, a.sf_schema_name, a.sf_table_name].filter(Boolean).join('.')}
              </option>
            ))}
          </select>
          <button
            onClick={handleAssess}
            disabled={!selectedAsset || assessing}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
          >
            {assessing ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
            {assessing ? 'Assessing…' : 'Run Assessment'}
          </button>
          {assessment && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition-colors shrink-0"
            >
              <Download size={12} /> Export Evidence
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle size={12} className="shrink-0" /> {error}
          </div>
        )}
      </div>

      {/* Filter tabs — shown after assessment */}
      {assessment && (
        <div className="flex border-b border-gray-100 px-6 bg-white gap-1 shrink-0">
          {(
            [
              { key: 'all',       label: `All (${assessment.total})`             },
              { key: 'gaps',      label: `Gaps (${assessment.gaps})`              },
              { key: 'compliant', label: `Compliant (${assessment.compliant})`    },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                'py-2.5 px-1 text-xs font-medium border-b-2 transition-colors',
                tab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Requirements list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
            <Loader2 size={16} className="animate-spin text-blue-500" />
            <span className="text-sm">Loading requirements…</span>
          </div>
        ) : reqs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <FileText size={36} className="text-gray-200 mb-3" />
            <p className="text-sm font-semibold text-gray-600">No requirements found</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              Requirements were not seeded. Click below to seed them now.
            </p>
            <button
              onClick={async () => {
                await api.post('/compliance/seed')
                const r = await complianceApi.requirements(fw.framework_id)
                setReqs(Array.isArray(r.data) ? r.data : [])
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Zap size={12} /> Seed Requirements
            </button>
          </div>
        ) : visibleReqs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <CheckCircle size={32} className="text-green-300 mb-2" />
            <p className="text-sm text-gray-500">
              {tab === 'compliant' ? 'No compliant requirements yet' : 'No gaps — all requirements satisfied!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* "Not yet assessed" notice — only in All tab before running */}
            {!assessment && (
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-100">
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle size={12} className="shrink-0" />
                  Select a table above and click <strong>Run Assessment</strong> to check compliance status for each requirement.
                </p>
              </div>
            )}
            {visibleReqs.map(req => {
              const result = getResult(req)
              return (
                <div
                  key={req.req_id}
                  className={clsx(
                    'px-6 py-3.5 flex items-start gap-3 transition-colors',
                    result?.status === 'gap'       ? 'bg-red-50/40 hover:bg-red-50/70'
                    : result?.status === 'compliant' ? 'hover:bg-green-50/40'
                    : 'hover:bg-gray-50'
                  )}
                >
                  {/* Status icon */}
                  <span className="mt-0.5 shrink-0">
                    {result?.status === 'compliant' ? (
                      <CheckCircle size={15} className="text-green-500" />
                    ) : result?.status === 'gap' ? (
                      <XCircle size={15} className="text-red-400" />
                    ) : (
                      <div className="w-[15px] h-[15px] rounded-full border-2 border-gray-200 mt-0.5" />
                    )}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {req.req_code && (
                        <code className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                          {req.req_code}
                        </code>
                      )}
                      <p className="text-xs font-semibold text-gray-800">{req.req_name || '—'}</p>
                      <StatusBadge status={result?.status} />
                    </div>

                    {req.req_description && (
                      <p className="text-[11px] text-gray-500 leading-relaxed">{req.req_description}</p>
                    )}

                    {req.dq_rule_types && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-gray-400 font-medium">Covered by:</span>
                        {req.dq_rule_types.split(',').map(t => (
                          <code key={t} className="text-[10px] font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                            {t.trim()}
                          </code>
                        ))}
                      </div>
                    )}

                    {/* Gap explanation */}
                    {result?.status === 'gap' && (
                      <div className="mt-2 flex items-start gap-1.5 text-[11px] text-red-600 bg-red-50 rounded-md px-2.5 py-1.5">
                        <AlertCircle size={11} className="shrink-0 mt-0.5" />
                        <span>
                          No active DQ rule covering <em>{req.dq_rule_types?.split(',')[0]?.trim() ?? 'this requirement'}</em> is mapped to this table.
                          Create a matching rule and re-run the assessment to resolve.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [assets,     setAssets]     = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState<Framework | null>(null)
  const [search,     setSearch]     = useState('')
  const [seeding,    setSeeding]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fwRes, assRes] = await Promise.all([
        complianceApi.frameworks(),
        assetsApi.listEnriched(),
      ])
      const fws: Framework[] = Array.isArray(fwRes.data) ? fwRes.data : []
      setFrameworks(fws)
      setAssets(Array.isArray(assRes.data) ? assRes.data : (assRes.data?.items ?? []))
      if (fws.length > 0 && !selected) setSelected(fws[0])
    } catch {
      setFrameworks([])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const handleSeed = async () => {
    setSeeding(true)
    try {
      await api.post('/compliance/seed')
      await load()
    } finally {
      setSeeding(false)
    }
  }

  const filtered = frameworks.filter(fw =>
    !search || fw.framework_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-screen p-6 gap-4 overflow-hidden">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Compliance</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Map DQ rules to regulatory frameworks — GDPR, CCPA, HIPAA, SOX, BCBS 239, ISO 27001
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors disabled:opacity-40"
          >
            {seeding ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {seeding ? 'Seeding…' : 'Seed / Refresh Data'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI row */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 shrink-0">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
              <Shield size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{frameworks.length}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Frameworks</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
              <Package size={16} className="text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{assets.length}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Registered Tables</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center shrink-0">
              <FileText size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{selected ? '→' : '—'}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                {selected ? `${selected.framework_name} selected` : 'Pick a framework'}
              </p>
            </div>
          </div>
        </div>
      )}

      <HowItWorks
        storageKey="compliance"
        title="How Compliance Works"
        steps={[
          { icon: <Shield size={13} />, title: 'Select Framework', description: 'Choose a regulatory framework from the left panel — GDPR, CCPA, HIPAA, SOX, BCBS 239, or ISO 27001.' },
          { icon: <Search size={13} />, title: 'Choose a Table', description: "Pick a registered data asset to assess against the selected framework's requirements." },
          { icon: <Zap size={13} />, title: 'Run Assessment', description: 'Click Run Assessment to check which DQ rules satisfy each regulatory requirement for that table.' },
          { icon: <AlertTriangle size={13} />, title: 'Review Gaps', description: 'Compliant = green, gaps = red. Use the Gaps tab to focus on what needs fixing.' },
          { icon: <FileText size={13} />, title: 'Export Evidence', description: 'Click Export Evidence after assessment to download a JSON package for auditors, containing requirement mappings and compliance %.' },
        ]}
      />

      {/* Split layout */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">

        {/* LEFT — framework list */}
        <div className="w-56 shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search frameworks…"
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="mx-2 my-1 h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-8 px-3 text-center">
                <Shield size={24} className="text-gray-200 mb-2" />
                <p className="text-xs text-gray-400">
                  {search ? 'No match' : 'No frameworks found'}
                </p>
                {!search && (
                  <button
                    onClick={handleSeed}
                    disabled={seeding}
                    className="mt-2 text-[10px] text-blue-600 hover:underline"
                  >
                    Seed frameworks
                  </button>
                )}
              </div>
            ) : (
              filtered.map(fw => {
                const style = fwStyle(fw.framework_name)
                const isActive = selected?.framework_id === fw.framework_id
                return (
                  <button
                    key={fw.framework_id}
                    onClick={() => setSelected(fw)}
                    className={clsx(
                      'w-full flex items-center gap-2.5 px-3 py-2.5 mx-1 rounded-lg text-left transition-colors',
                      isActive
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-gray-50 border border-transparent'
                    )}
                    style={{ width: 'calc(100% - 8px)' }}
                  >
                    <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', style.light)}>
                      <Shield size={13} className={style.accent.replace('bg-', 'text-')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={clsx('text-xs font-semibold truncate', isActive ? 'text-blue-700' : 'text-gray-800')}>
                        {fw.framework_name}
                      </p>
                      {fw.version && (
                        <p className="text-[10px] text-gray-400">v{fw.version}</p>
                      )}
                    </div>
                    {isActive && <ChevronRight size={12} className="text-blue-400 shrink-0" />}
                  </button>
                )
              })
            )}
          </div>

          {!loading && frameworks.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
              <p className="text-[10px] text-gray-400">
                {frameworks.length} frameworks · {assets.length} tables
              </p>
            </div>
          )}
        </div>

        {/* RIGHT — requirements + assessment */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden min-w-0">
          {selected ? (
            <RequirementsPanel fw={selected} assets={assets} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 py-20">
              <Shield size={40} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Select a framework on the left to begin</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
