'use client'
import { useEffect, useState, useCallback } from 'react'
import { incidentsApi, assetsApi } from '@/services/apiClient'
import { AlertOctagon, Clock, CheckCircle, Plus, Loader2, X, RefreshCw, FileSearch, ShieldAlert, BellRing } from 'lucide-react'
import clsx from 'clsx'
import { useTimezone } from '@/contexts/TimezoneContext'
import HowItWorks from '@/components/common/HowItWorks'

// ── Types ─────────────────────────────────────────────────────────────────────

interface IncidentStats {
  open_count: number
  avg_mttd_minutes: number | null
  avg_mttr_minutes: number | null
  resolved_this_week: number
}

interface Incident {
  incident_id: string
  title: string
  asset_id: string
  asset_name?: string | null
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'investigating' | 'resolved'
  trigger_run_id: string | null
  ttr_minutes: number | null
  created_at: string
  resolved_at: string | null
}

interface Asset {
  asset_id: string
  sf_table_name: string
  sf_schema_name: string
}

interface IncidentForm {
  asset_id: string
  title: string
  severity: string
  trigger_run_id: string
}

const EMPTY_FORM: IncidentForm = {
  asset_id: '',
  title: '',
  severity: 'high',
  trigger_run_id: '',
}

const SEV_CLS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-gray-100 text-gray-600',
}

const STATUS_CLS: Record<string, string> = {
  open:          'bg-red-100 text-red-700',
  investigating: 'bg-blue-100 text-blue-700',
  resolved:      'bg-green-100 text-green-700',
}

const STATUS_TABS = [
  { value: '',              label: 'All' },
  { value: 'open',          label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved',      label: 'Resolved' },
]


// ── Stats row ─────────────────────────────────────────────────────────────────

function StatsRow({ stats }: { stats: IncidentStats | null }) {
  const kpis = [
    { label: 'Open Incidents',     value: stats ? String(stats.open_count) : '—',       icon: <AlertOctagon size={18} className="text-red-500" />,   cls: 'bg-red-50' },
    { label: 'Avg MTTD (min)',     value: stats?.avg_mttd_minutes !== null ? String(Math.round(stats?.avg_mttd_minutes ?? 0)) : '—', icon: <Clock size={18} className="text-orange-500" />, cls: 'bg-orange-50' },
    { label: 'Avg MTTR (min)',     value: stats?.avg_mttr_minutes !== null ? String(Math.round(stats?.avg_mttr_minutes ?? 0)) : '—', icon: <Clock size={18} className="text-blue-500" />,   cls: 'bg-blue-50' },
    { label: 'Resolved This Week', value: stats ? String(stats.resolved_this_week) : '—', icon: <CheckCircle size={18} className="text-green-500" />, cls: 'bg-green-50' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {kpis.map(k => (
        <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
          <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', k.cls)}>
            {k.icon}
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs text-gray-500">{k.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── New Incident Modal ────────────────────────────────────────────────────────

function IncidentModal({
  assets,
  onClose,
  onSave,
}: {
  assets: Asset[]
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = useState<IncidentForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (field: keyof IncidentForm, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim())  { setError('Title is required'); return }
    if (!form.asset_id)      { setError('Please select an asset'); return }
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        asset_id: form.asset_id,
        title: form.title,
        severity: form.severity,
      }
      if (form.trigger_run_id.trim()) payload.trigger_run_id = form.trigger_run_id.trim()
      await incidentsApi.create(payload)
      onSave()
    } catch {
      setError('Failed to create incident.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Incident</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Revenue invoices NULL spike"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Asset *</label>
            <select
              value={form.asset_id}
              onChange={e => set('asset_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select asset —</option>
              {assets.map(a => (
                <option key={a.asset_id} value={a.asset_id}>
                  {a.sf_schema_name}.{a.sf_table_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Severity</label>
            <select
              value={form.severity}
              onChange={e => set('severity', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['critical', 'high', 'medium', 'low'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Trigger Run ID (optional)</label>
            <input
              value={form.trigger_run_id}
              onChange={e => set('trigger_run_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="run_id if triggered by a rule run"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Create Incident
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const { formatTs } = useTimezone()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [stats, setStats]         = useState<IncidentStats | null>(null)
  const [assets, setAssets]       = useState<Asset[]>([])
  const [loading, setLoading]     = useState(true)
  const [statusTab, setStatusTab] = useState('open')
  const [showModal, setShowModal] = useState(false)
  const [resolving, setResolving]       = useState<string | null>(null)
  const [investigating, setInvestigating] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (statusTab) params.status = statusTab
      const [incRes, statsRes, assetsRes] = await Promise.all([
        incidentsApi.list(params),
        incidentsApi.stats(),
        assetsApi.list(),
      ])
      setIncidents(Array.isArray(incRes.data) ? incRes.data : [])
      setStats(statsRes.data ?? null)
      // assets API returns { total, limit, offset, items: [] }
      const rawAssets = assetsRes.data
      setAssets(
        Array.isArray(rawAssets)
          ? rawAssets
          : Array.isArray(rawAssets?.items)
          ? rawAssets.items
          : []
      )
    } catch {
      setIncidents([])
    } finally {
      setLoading(false)
    }
  }, [statusTab])

  useEffect(() => { load() }, [load])

  const handleInvestigate = async (id: string) => {
    setInvestigating(id)
    try {
      await incidentsApi.investigate(id)
      setIncidents(prev =>
        prev.map(i => i.incident_id === id ? { ...i, status: 'investigating' } : i)
      )
    } finally {
      setInvestigating(null)
    }
  }

  const handleResolve = async (id: string) => {
    setResolving(id)
    try {
      const res = await incidentsApi.resolve(id)
      const updated = res.data
      setIncidents(prev =>
        statusTab === ''
          ? prev.map(i => i.incident_id === id ? { ...i, ...updated } : i)
          : prev.filter(i => i.incident_id !== id)
      )
    } finally {
      setResolving(null)
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incident Management</h1>
          <p className="text-gray-500 text-sm mt-1">Track and resolve data quality incidents</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={15} />
            New Incident
          </button>
        </div>
      </div>

      <HowItWorks
        storageKey="incidents"
        title="How Incident Management Works"
        steps={[
          { icon: <AlertOctagon size={13} />, title: 'Incidents Auto-Created', description: 'When a critical or high-severity rule fails, the platform automatically opens an incident tied to that table and rule run.' },
          { icon: <FileSearch size={13} />, title: 'Investigate & Triage', description: 'Review the incident title, affected asset, and severity. Use the linked run ID to inspect the exact failed rows and rule output.' },
          { icon: <ShieldAlert size={13} />, title: 'Track MTTD & MTTR', description: 'The platform measures Mean Time to Detect (MTTD) from rule failure to incident creation, and MTTR from creation to resolution.' },
          { icon: <CheckCircle size={13} />, title: 'Resolve When Fixed', description: 'Click Resolve once the root cause is addressed. The incident is closed, MTTR is recorded, and the table quality score is re-evaluated.' },
          { icon: <BellRing size={13} />, title: 'Manual Incidents', description: 'You can also manually open incidents for issues discovered outside automated rule runs — just pick the asset and severity.' },
        ]}
      />

      {/* Stats */}
      <StatsRow stats={stats} />

      {/* Status tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusTab(tab.value)}
            className={clsx(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              statusTab === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Title', 'Asset', 'Severity', 'Status', 'Created', 'TTR (min)', 'Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
            <CheckCircle size={28} className="text-green-400" />
          </div>
          <p className="text-base font-semibold text-gray-800">No incidents found</p>
          <p className="text-sm text-gray-400 mt-1">
            {statusTab === 'open' ? 'No open incidents. Data looks healthy!' : `No ${statusTab} incidents.`}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Title', 'Asset', 'Severity', 'Status', 'Created', 'TTR (min)', 'Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {incidents.map(inc => (
                <tr key={inc.incident_id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                    <p className="truncate">{inc.title}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{inc.asset_name ?? inc.asset_id.slice(0, 8) + '…'}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', SEV_CLS[inc.severity] ?? SEV_CLS.low)}>
                      {inc.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_CLS[inc.status] ?? 'bg-gray-100 text-gray-600')}>
                      {inc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatTs(inc.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-700 font-medium">
                    {inc.ttr_minutes !== null ? String(Math.round(inc.ttr_minutes)) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {inc.status === 'open' && (
                        <button
                          onClick={() => handleInvestigate(inc.incident_id)}
                          disabled={investigating === inc.incident_id}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          {investigating === inc.incident_id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <FileSearch size={11} />}
                          Investigate
                        </button>
                      )}
                      {inc.status !== 'resolved' && (
                        <button
                          onClick={() => handleResolve(inc.incident_id)}
                          disabled={resolving === inc.incident_id}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs text-green-700 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          {resolving === inc.incident_id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <CheckCircle size={11} />}
                          Resolve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <IncidentModal
          assets={assets}
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
