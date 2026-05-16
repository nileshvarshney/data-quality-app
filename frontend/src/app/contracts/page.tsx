'use client'
import { useEffect, useState, useCallback } from 'react'
import { contractsApi, assetsApi } from '@/services/apiClient'
import { FileText, CheckCircle, XCircle, Plus, Loader2, X, Pencil, Trash2, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import HowItWorks from '@/components/common/HowItWorks'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contract {
  contract_id: string
  contract_name: string
  asset_id: string
  asset_name?: string | null
  status: 'draft' | 'active' | 'violated' | 'deprecated'
  producer_team: string | null
  consumer_team: string | null
  min_quality_score: number | null
  max_staleness_hours: number | null
  sla_description: string | null
  version: string | null
}

interface Asset {
  asset_id: string
  sf_table_name: string
  sf_schema_name: string
}

interface ContractForm {
  contract_name: string
  asset_id: string
  producer_team: string
  consumer_team: string
  min_quality_score: string
  max_staleness_hours: string
  sla_description: string
  version: string
}

const EMPTY_FORM: ContractForm = {
  contract_name: '',
  asset_id: '',
  producer_team: '',
  consumer_team: '',
  min_quality_score: '95',
  max_staleness_hours: '24',
  sla_description: '',
  version: '1.0',
}

const STATUS_CONFIG: Record<string, { cls: string; label: string }> = {
  draft:      { cls: 'bg-gray-100 text-gray-600',    label: 'Draft' },
  active:     { cls: 'bg-green-100 text-green-700',  label: 'Active' },
  violated:   { cls: 'bg-red-100 text-red-700',      label: 'Violated' },
  deprecated: { cls: 'bg-orange-100 text-orange-700', label: 'Deprecated' },
}

const STATUS_TABS = [
  { value: '',           label: 'All' },
  { value: 'active',     label: 'Active' },
  { value: 'draft',      label: 'Draft' },
  { value: 'violated',   label: 'Violated' },
  { value: 'deprecated', label: 'Deprecated' },
]

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastProps { message: string; type: 'success' | 'error' }

function Toast({ message, type }: ToastProps) {
  return (
    <div className={clsx(
      'fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium',
      type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
    )}>
      {type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
      <span>{message}</span>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function ContractModal({
  contract,
  assets,
  onClose,
  onSave,
}: {
  contract: Contract | null
  assets: Asset[]
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = useState<ContractForm>(
    contract
      ? {
          contract_name:      contract.contract_name,
          asset_id:           contract.asset_id,
          producer_team:      contract.producer_team ?? '',
          consumer_team:      contract.consumer_team ?? '',
          min_quality_score:  String(contract.min_quality_score ?? 95),
          max_staleness_hours: String(contract.max_staleness_hours ?? 24),
          sla_description:    contract.sla_description ?? '',
          version:            contract.version ?? '1.0',
        }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (field: keyof ContractForm, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.contract_name.trim()) { setError('Contract name is required'); return }
    if (!form.asset_id) { setError('Please select a data asset'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        min_quality_score: form.min_quality_score ? Number(form.min_quality_score) : null,
        max_staleness_hours: form.max_staleness_hours ? Number(form.max_staleness_hours) : null,
      }
      if (contract) {
        await contractsApi.update(contract.contract_id, payload)
      } else {
        await contractsApi.create(payload)
      }
      onSave()
    } catch {
      setError('Failed to save contract. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900">
            {contract ? 'Edit Contract' : 'New Data Contract'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contract Name *</label>
            <input
              value={form.contract_name}
              onChange={e => set('contract_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Revenue Invoices SLA Agreement"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data Asset *</label>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Producer Team</label>
              <input
                value={form.producer_team}
                onChange={e => set('producer_team', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Revenue Engineering"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Consumer Team</label>
              <input
                value={form.consumer_team}
                onChange={e => set('consumer_team', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Finance Analytics"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Min Quality Score (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.min_quality_score}
                onChange={e => set('min_quality_score', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Staleness (hours)</label>
              <input
                type="number"
                min={1}
                value={form.max_staleness_hours}
                onChange={e => set('max_staleness_hours', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">SLA Description</label>
            <textarea
              value={form.sla_description}
              onChange={e => set('sla_description', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Describe the data quality guarantees..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Version</label>
            <input
              value={form.version}
              onChange={e => set('version', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1.0"
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
              {contract ? 'Save Changes' : 'Create Contract'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [assets, setAssets]       = useState<Asset[]>([])
  const [loading, setLoading]     = useState(true)
  const [statusTab, setStatusTab] = useState('')
  const [modal, setModal]         = useState<'create' | Contract | null>(null)
  const [validating, setValidating] = useState<string | null>(null)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [toast, setToast]         = useState<ToastProps | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (statusTab) params.status = statusTab
      const [contractsRes, assetsRes] = await Promise.all([
        contractsApi.list(params),
        assetsApi.list(),
      ])
      setContracts(Array.isArray(contractsRes.data) ? contractsRes.data : [])
      setAssets(Array.isArray(assetsRes.data) ? assetsRes.data : [])
    } catch {
      setContracts([])
    } finally {
      setLoading(false)
    }
  }, [statusTab])

  useEffect(() => { load() }, [load])

  const handleValidate = async (id: string) => {
    setValidating(id)
    try {
      const res = await contractsApi.validate(id)
      const data = res.data
      if (data.compliant) {
        showToast('Contract validation passed', 'success')
      } else {
        const issues = Array.isArray(data.issues) && data.issues.length > 0
          ? data.issues.join(' | ')
          : 'Compliance check failed'
        showToast(`Violated: ${issues}`, 'error')
      }
      // Reload to reflect any status change (e.g. active → violated)
      load()
    } catch {
      showToast('Validation failed — check backend logs', 'error')
    } finally {
      setValidating(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this contract?')) return
    setDeleting(id)
    try {
      await contractsApi.delete(id)
      setContracts(prev => prev.filter(c => c.contract_id !== id))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Contracts</h1>
          <p className="text-gray-500 text-sm mt-1">SLA agreements between data producers and consumers</p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} />
          New Contract
        </button>
      </div>

      <HowItWorks
        storageKey="contracts"
        title="How Data Contracts Work"
        steps={[
          { icon: <FileText size={13} />, title: 'Create a Contract', description: 'Define a formal SLA between a producer team and a consumer team for a specific Snowflake table.' },
          { icon: <ShieldCheck size={13} />, title: 'Set Guarantees', description: 'Specify minimum quality score, maximum data staleness (hours), and acceptable null percentage.' },
          { icon: <XCircle size={13} />, title: 'Auto-Detect Breach', description: 'The platform automatically sets status to Violated when a quality, freshness, or schema guarantee is broken.' },
          { icon: <CheckCircle size={13} />, title: 'Validate On Demand', description: 'Click Validate on any contract to check current compliance without waiting for the scheduled run.' },
        ]}
      />

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
                {['Contract Name', 'Asset', 'Status', 'Producer', 'Consumer', 'Min Quality', 'Version', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
            <FileText size={28} className="text-blue-400" />
          </div>
          <p className="text-base font-semibold text-gray-800">No data contracts found</p>
          <p className="text-sm text-gray-400 mt-1">Create your first contract to enforce data SLAs.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Contract Name', 'Asset', 'Status', 'Producer', 'Consumer', 'Min Quality', 'Version', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contracts.map(c => {
                const st = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft
                return (
                  <tr key={c.contract_id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{c.contract_name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{c.asset_name ?? c.asset_id.slice(0, 8) + '…'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', st.cls)}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.producer_team ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.consumer_team ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 font-medium">
                      {c.min_quality_score !== null ? `${c.min_quality_score}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.version ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleValidate(c.contract_id)}
                          disabled={validating === c.contract_id}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-green-700 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          {validating === c.contract_id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <CheckCircle size={11} />}
                          Validate
                        </button>
                        <button
                          onClick={() => setModal(c)}
                          className="p-1 text-gray-400 hover:text-blue-600"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(c.contract_id)}
                          disabled={deleting === c.contract_id}
                          className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-40"
                          title="Delete"
                        >
                          {deleting === c.contract_id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <ContractModal
          contract={modal === 'create' ? null : modal}
          assets={assets}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }}
        />
      )}

      {/* Toast */}
      {toast && <Toast {...toast} />}
    </div>
  )
}
