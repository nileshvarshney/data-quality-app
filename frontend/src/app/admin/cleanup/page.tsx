'use client'
import { useEffect, useState, useCallback } from 'react'
import { adminApi } from '@/services/apiClient'
import {
  Trash2, AlertTriangle, CheckCircle, Loader2, RefreshCw,
  Database, Shield, PlayCircle, ChevronDown, ChevronRight, X, Search,
} from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DomainStats {
  domain_id: string
  domain_name: string
  is_active: boolean
  owner_email: string | null
  asset_count: number
  rule_count: number
  run_count: number
}

interface DeleteResult {
  domain_name: string
  deleted: Record<string, number>
  total_rows: number
  message: string
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  mode,
  domain,
  onConfirm,
  onCancel,
}: {
  mode: 'data' | 'domain'
  domain: DomainStats
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const expected = domain.domain_name
  const ready = typed === expected

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-100 bg-red-50">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={18} className="text-red-600" />
            <h2 className="text-base font-bold text-red-900">
              {mode === 'domain' ? 'Delete Domain Permanently' : 'Clean Domain Data'}
            </h2>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Warning */}
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 leading-relaxed">
            {mode === 'domain' ? (
              <>
                This will <strong>permanently delete</strong> the domain <strong>"{domain.domain_name}"</strong> and
                all its data — assets, rules, execution logs, alerts, quality scores, and all governance records.
                <br /><br />
                <strong>This cannot be undone.</strong>
              </>
            ) : (
              <>
                This will <strong>remove all data</strong> inside domain <strong>"{domain.domain_name}"</strong>
                — assets, rules, execution logs, alerts, and quality scores — but keep the domain and subdomains.
                <br /><br />
                <strong>This cannot be undone.</strong>
              </>
            )}
          </div>

          {/* Stats about to be deleted */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Database, label: 'Tables', count: domain.asset_count },
              { icon: Shield,   label: 'Rules',  count: domain.rule_count },
              { icon: PlayCircle, label: 'Runs', count: domain.run_count },
            ].map(({ icon: Icon, label, count }) => (
              <div key={label} className="text-center p-2 bg-gray-50 rounded-lg">
                <Icon size={14} className="text-gray-400 mx-auto mb-1" />
                <p className="text-sm font-bold text-gray-900">{count.toLocaleString()}</p>
                <p className="text-[10px] text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Type confirmation */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Type <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-red-700">{expected}</code> to confirm
            </label>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={expected}
              autoFocus
              className={clsx(
                'w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2',
                ready ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-gray-300'
              )}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onCancel}
              className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!ready}
              className={clsx(
                'flex-1 py-2 text-sm font-semibold rounded-lg transition-all',
                ready
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            >
              {mode === 'domain' ? 'Delete Domain' : 'Clean Data'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Result panel ──────────────────────────────────────────────────────────────

function ResultPanel({ result, onClose }: { result: DeleteResult; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-5 text-center border-b border-gray-100">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={24} className="text-green-600" />
          </div>
          <p className="text-base font-bold text-gray-900">{result.message}</p>
          <p className="text-sm text-gray-500 mt-1">
            <strong>{result.total_rows.toLocaleString()}</strong> rows removed
          </p>
        </div>
        <div className="px-6 py-4">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-3"
          >
            {expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
            {expanded ? 'Hide' : 'Show'} breakdown
          </button>
          {expanded && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {Object.entries(result.deleted).map(([table, count]) => (
                <div key={table} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg text-xs">
                  <span className="font-mono text-gray-600">{table}</span>
                  <span className="font-bold text-gray-900">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={onClose}
            className="w-full mt-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Domain row ────────────────────────────────────────────────────────────────

function DomainRow({
  d,
  onAction,
  busy,
}: {
  d: DomainStats
  onAction: (mode: 'data' | 'domain') => void
  busy: boolean
}) {
  const hasData = d.asset_count > 0 || d.rule_count > 0 || d.run_count > 0
  return (
    <div className={clsx(
      'flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors',
      busy && 'opacity-60 pointer-events-none'
    )}>
      {/* Domain info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{d.domain_name}</p>
          {!d.is_active && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">inactive</span>
          )}
        </div>
        {d.owner_email && <p className="text-xs text-gray-400 mt-0.5">{d.owner_email}</p>}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-5 shrink-0">
        {[
          { icon: Database,   val: d.asset_count, tip: 'tables' },
          { icon: Shield,     val: d.rule_count,  tip: 'rules' },
          { icon: PlayCircle, val: d.run_count,   tip: 'runs' },
        ].map(({ icon: Icon, val, tip }) => (
          <div key={tip} className="text-center w-12">
            <div className="flex items-center justify-center gap-1 text-gray-400 mb-0.5">
              <Icon size={11} />
            </div>
            <p className={clsx('text-sm font-bold', val > 0 ? 'text-gray-900' : 'text-gray-300')}>{val.toLocaleString()}</p>
            <p className="text-[9px] text-gray-400">{tip}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onAction('data')}
          disabled={!hasData || busy}
          title="Remove all data from this domain (keep domain structure)"
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all',
            hasData
              ? 'border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-300'
              : 'border-gray-100 text-gray-300 cursor-not-allowed'
          )}
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          Clean Data
        </button>
        <button
          onClick={() => onAction('domain')}
          disabled={busy}
          title="Permanently delete this domain and everything in it"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-all disabled:opacity-40"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          Delete Domain
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CleanupPage() {
  const [domains,  setDomains]  = useState<DomainStats[]>([])
  const [loading,  setLoading]  = useState(true)
  const [busyId,   setBusyId]   = useState<string | null>(null)
  const [confirm,  setConfirm]  = useState<{ domain: DomainStats; mode: 'data' | 'domain' } | null>(null)
  const [result,   setResult]   = useState<DeleteResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await adminApi.listDomainsWithStats()
      setDomains(Array.isArray(r.data) ? r.data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleConfirm = async () => {
    if (!confirm) return
    const { domain, mode } = confirm
    setConfirm(null)
    setBusyId(domain.domain_id)
    try {
      const r = mode === 'domain'
        ? await adminApi.deleteDomain(domain.domain_id)
        : await adminApi.cleanDomainData(domain.domain_id)
      setResult(r.data as DeleteResult)
      await load()
      toast.success(`${domain.domain_name} ${mode === 'domain' ? 'deleted' : 'cleaned'} successfully`)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Operation failed')
    } finally {
      setBusyId(null)
    }
  }

  const [q, setQ] = useState('')
  const totalAssets = domains.reduce((s, d) => s + d.asset_count, 0)
  const totalRules  = domains.reduce((s, d) => s + d.rule_count, 0)
  const totalRuns   = domains.reduce((s, d) => s + d.run_count, 0)
  const filteredDomains = domains.filter(d => !q || d.domain_name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="p-6 max-w-[1100px] space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Trash2 size={22} className="text-red-500" />
            Data Cleanup
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Remove test or stale data from any domain. All deletions are irreversible and logged to the audit trail.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-40">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Warning banner */}
      <div className="flex gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
        <div>
          <strong>Admin-only operation.</strong> Deletions are permanent, cascade across all related records,
          and cannot be undone. All actions are logged to the audit trail.
          Use <strong>Clean Data</strong> to remove content while keeping the domain structure,
          or <strong>Delete Domain</strong> to remove everything including the domain itself.
        </div>
      </div>

      {/* Summary strip */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Database,   label: 'Total Tables', value: totalAssets, color: 'text-purple-600', bg: 'bg-purple-50' },
            { icon: Shield,     label: 'Total Rules',  value: totalRules,  color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { icon: PlayCircle, label: 'Total Runs',   value: totalRuns,   color: 'text-blue-600',   bg: 'bg-blue-50' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              <div className={clsx('p-2 rounded-lg shrink-0', k.bg)}>
                <k.icon size={15} className={k.color} />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{k.label}</p>
                <p className="text-2xl font-bold text-gray-900">{k.value.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search domains…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Domain table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="flex-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Domain</p>
          <div className="flex items-center gap-5 shrink-0 pr-2">
            {['Tables', 'Rules', 'Runs'].map(h => (
              <p key={h} className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-12 text-center">{h}</p>
            ))}
          </div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider shrink-0 w-44 text-right">Actions</p>
        </div>

        {/* Rows */}
        {loading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 animate-pulse">
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-gray-200 rounded w-32" />
                <div className="h-2.5 bg-gray-100 rounded w-24" />
              </div>
              <div className="flex gap-5 shrink-0">
                {[0,1,2].map(i => <div key={i} className="w-12 h-8 bg-gray-100 rounded" />)}
              </div>
              <div className="flex gap-2 shrink-0">
                <div className="w-24 h-7 bg-gray-100 rounded-lg" />
                <div className="w-28 h-7 bg-gray-100 rounded-lg" />
              </div>
            </div>
          ))
        ) : domains.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Database size={32} className="text-gray-200 mb-3" />
            <p className="text-sm text-gray-500">No domains found</p>
          </div>
        ) : (
          filteredDomains.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <p className="text-sm text-gray-400">No domains match &quot;{q}&quot;</p>
            </div>
          ) : filteredDomains.map(d => (
            <DomainRow
              key={d.domain_id}
              d={d}
              busy={busyId === d.domain_id}
              onAction={mode => setConfirm({ domain: d, mode })}
            />
          ))
        )}
      </div>

      {/* Confirm modal */}
      {confirm && (
        <ConfirmModal
          mode={confirm.mode}
          domain={confirm.domain}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Result modal */}
      {result && (
        <ResultPanel result={result} onClose={() => setResult(null)} />
      )}
    </div>
  )
}
