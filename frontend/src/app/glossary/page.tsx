'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { glossaryApi, domainsApi, assetsApi } from '@/services/apiClient'
import {
  BookOpen, Plus, Pencil, Trash2, Search, Loader2, X, Link2,
  ChevronRight, Tag, ExternalLink, Unlink, Globe,
} from 'lucide-react'
import clsx from 'clsx'
import HowItWorks from '@/components/common/HowItWorks'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LinkedAsset {
  link_id: string
  asset_id: string
  sf_table_name: string | null
  sf_schema_name: string | null
  column_name: string | null
}

interface GlossaryTerm {
  term_id: string
  term_name: string
  definition: string | null
  examples: string | null
  synonyms: string | null
  domain_id: string | null
  domain_name?: string | null
  owner_email: string | null
  status: 'active' | 'draft' | 'deprecated'
  linked_asset_count?: number
  created_at: string
  linked_assets?: LinkedAsset[]
}

interface Domain {
  domain_id: string
  domain_name: string
}

interface TermForm {
  term_name: string
  definition: string
  examples: string
  synonyms: string
  domain_id: string
  owner_email: string
  status: string
}

const EMPTY_FORM: TermForm = {
  term_name: '',
  definition: '',
  examples: '',
  synonyms: '',
  domain_id: '',
  owner_email: '',
  status: 'draft',
}

const STATUS_CONFIG: Record<string, { cls: string; label: string }> = {
  active:     { cls: 'bg-green-100 text-green-700',  label: 'Active' },
  draft:      { cls: 'bg-gray-100 text-gray-600',    label: 'Draft' },
  deprecated: { cls: 'bg-red-100 text-red-700',      label: 'Deprecated' },
}

const STATUS_TABS = [
  { value: '',           label: 'All' },
  { value: 'active',     label: 'Active' },
  { value: 'draft',      label: 'Draft' },
  { value: 'deprecated', label: 'Deprecated' },
]

// ── TermModal ─────────────────────────────────────────────────────────────────

function TermModal({
  term, domains, onClose, onSave,
}: {
  term: GlossaryTerm | null
  domains: Domain[]
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = useState<TermForm>(
    term
      ? {
          term_name:   term.term_name,
          definition:  term.definition ?? '',
          examples:    term.examples ?? '',
          synonyms:    term.synonyms ?? '',
          domain_id:   term.domain_id ?? '',
          owner_email: term.owner_email ?? '',
          status:      term.status,
        }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (field: keyof TermForm, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.term_name.trim()) { setError('Term name is required'); return }
    if (!form.definition.trim()) { setError('Definition is required'); return }
    setSaving(true); setError('')
    try {
      if (term) {
        await glossaryApi.update(term.term_id, form)
      } else {
        await glossaryApi.create(form)
      }
      onSave()
    } catch {
      setError('Failed to save term. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {term ? 'Edit Term' : 'New Glossary Term'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Term Name *</label>
            <input
              value={form.term_name}
              onChange={e => set('term_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Gross Revenue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Definition *</label>
            <textarea
              value={form.definition}
              onChange={e => set('definition', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Clear business definition..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Examples</label>
            <input
              value={form.examples}
              onChange={e => set('examples', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. $1,000 MRR from ACME Corp"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Synonyms <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              value={form.synonyms}
              onChange={e => set('synonyms', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Total Revenue, Billed Revenue"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Domain</label>
              <select
                value={form.domain_id}
                onChange={e => set('domain_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select domain —</option>
                {domains.map(d => (
                  <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Owner Email</label>
            <input
              type="email"
              value={form.owner_email}
              onChange={e => set('owner_email', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="owner@example.com"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {term ? 'Save Changes' : 'Create Term'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── LinkAssetModal ────────────────────────────────────────────────────────────

interface Asset {
  asset_id: string
  sf_table_name: string
  sf_schema_name: string
}

function LinkAssetModal({
  term, onClose, onSave,
}: {
  term: GlossaryTerm
  onClose: () => void
  onSave: () => void
}) {
  const [assets, setAssets]         = useState<Asset[]>([])
  const [assetId, setAssetId]       = useState('')
  const [columnName, setColumnName] = useState('')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)

  useEffect(() => {
    assetsApi.list({ limit: 500 })
      .then(r => {
        const items = r.data?.items ?? r.data
        setAssets(Array.isArray(items) ? items : [])
      })
      .catch(() => setAssets([]))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assetId) { setError('Please select a table'); return }
    setSaving(true); setError('')
    try {
      await glossaryApi.linkAsset(term.term_id, {
        asset_id: assetId,
        column_name: columnName.trim() || null,
      })
      setSuccess(true)
      setAssetId('')
      setColumnName('')
      onSave()
    } catch {
      setError('Failed to link term. It may already be linked to this table.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Link &ldquo;{term.term_name}&rdquo; to a Table
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          {success && <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">Linked successfully!</p>}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Table *</label>
            {loading ? (
              <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <select
                value={assetId}
                onChange={e => setAssetId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select a table —</option>
                {assets.map(a => (
                  <option key={a.asset_id} value={a.asset_id}>
                    {a.sf_schema_name}.{a.sf_table_name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Column <span className="text-gray-400 font-normal">(optional — leave blank to link to the whole table)</span>
            </label>
            <input
              value={columnName}
              onChange={e => setColumnName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. invoice_amount"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
              Close
            </button>
            <button type="submit" disabled={saving || loading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Link Table
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Expanded term detail row ───────────────────────────────────────────────────

function ExpandedTermRow({
  term, onUnlink, onClose,
}: {
  term: GlossaryTerm
  onUnlink: (linkId: string) => Promise<void>
  onClose: () => void
}) {
  const [detail, setDetail]       = useState<GlossaryTerm | null>(null)
  const [loading, setLoading]     = useState(true)
  const [unlinking, setUnlinking] = useState<string | null>(null)

  useEffect(() => {
    glossaryApi.get(term.term_id)
      .then(r => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [term.term_id])

  const synonymList = (detail?.synonyms ?? term.synonyms ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)

  const handleUnlink = async (linkId: string) => {
    setUnlinking(linkId)
    try { await onUnlink(linkId) }
    finally { setUnlinking(null) }
  }

  return (
    <tr>
      <td colSpan={7} className="bg-purple-50/40 border-y border-purple-100 px-6 py-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 size={14} className="animate-spin" /> Loading details…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: definition + examples + synonyms */}
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Full Definition</p>
                <p className="text-sm text-gray-700 leading-relaxed">{detail?.definition || term.definition || '—'}</p>
              </div>
              {(detail?.examples || term.examples) && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Examples</p>
                  <p className="text-sm text-gray-600 italic">{detail?.examples || term.examples}</p>
                </div>
              )}
              {synonymList.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Synonyms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {synonymList.map(s => (
                      <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                        <Tag size={9} />{s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: linked assets */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                Linked Tables & Columns ({(detail?.linked_assets ?? []).length})
              </p>
              {(detail?.linked_assets ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 italic">No tables linked yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {(detail?.linked_assets ?? []).map(link => (
                    <div key={link.link_id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/dashboard/tables/${link.asset_id}`}
                          className="text-xs font-semibold text-gray-900 hover:text-blue-600 flex items-center gap-1 truncate"
                        >
                          <ExternalLink size={10} className="shrink-0" />
                          {link.sf_schema_name}.{link.sf_table_name}
                        </Link>
                        {link.column_name && (
                          <p className="text-[10px] text-purple-600 font-mono mt-0.5">
                            Column: {link.column_name}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleUnlink(link.link_id)}
                        disabled={unlinking === link.link_id}
                        title="Unlink"
                        className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 shrink-0"
                      >
                        {unlinking === link.link_id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Unlink size={12} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GlossaryPage() {
  const [terms, setTerms]           = useState<GlossaryTerm[]>([])
  const [domains, setDomains]       = useState<Domain[]>([])
  const [loading, setLoading]       = useState(true)
  const [statusTab, setStatusTab]   = useState('')
  const [search, setSearch]         = useState('')
  const [modal, setModal]           = useState<'create' | GlossaryTerm | null>(null)
  const [linkTerm, setLinkTerm]     = useState<GlossaryTerm | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (statusTab) params.status = statusTab
      if (search)    params.search = search
      const [termsRes, domainsRes] = await Promise.all([
        glossaryApi.list(params),
        domainsApi.list(),
      ])
      setTerms(Array.isArray(termsRes.data) ? termsRes.data : [])
      setDomains(Array.isArray(domainsRes.data) ? domainsRes.data : [])
    } catch {
      setTerms([])
    } finally {
      setLoading(false)
    }
  }, [statusTab, search])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('Deprecate this glossary term?')) return
    setDeleting(id)
    try {
      await glossaryApi.delete(id)
      setTerms(prev => prev.map(t => t.term_id === id ? { ...t, status: 'deprecated' as const } : t))
      if (expandedId === id) setExpandedId(null)
    } finally {
      setDeleting(null)
    }
  }

  const handleUnlink = async (termId: string, linkId: string) => {
    await glossaryApi.unlinkAsset(termId, linkId)
    // Decrement the count in the list
    setTerms(prev => prev.map(t =>
      t.term_id === termId
        ? { ...t, linked_asset_count: Math.max(0, (t.linked_asset_count ?? 1) - 1) }
        : t
    ))
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Glossary</h1>
          <p className="text-gray-500 text-sm mt-1">Canonical definitions for business terms across domains</p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} />
          New Term
        </button>
      </div>

      <HowItWorks
        storageKey="glossary"
        title="How Business Glossary Works"
        steps={[
          {
            icon: <Plus size={13} />,
            title: 'Create a Term',
            description: 'Define a business term with name, definition, synonyms, examples, domain, and owner. Use Draft status for terms under review, Active for approved terms.',
          },
          {
            icon: <Link2 size={13} />,
            title: 'Link to Tables',
            description: 'Use the link icon on any term to connect it to a Snowflake table or a specific column. Click a term row to expand and see or remove existing links.',
          },
          {
            icon: <Search size={13} />,
            title: 'Search & Filter',
            description: 'Find terms by keyword (searches name and definition) or filter by status — Active, Draft, or Deprecated.',
          },
          {
            icon: <BookOpen size={13} />,
            title: 'Surface Context',
            description: 'Linked terms are visible in the Data Catalog. Click any linked table to open its Table Dashboard → Schema tab where business terms appear alongside column metadata.',
          },
        ]}
      />

      {/* Stats row */}
      {!loading && terms.length > 0 && (
        <div className="flex gap-4 mb-5">
          {[
            { label: 'Total', value: terms.length, cls: 'text-gray-700' },
            { label: 'Active', value: terms.filter(t => t.status === 'active').length, cls: 'text-green-600' },
            { label: 'Draft', value: terms.filter(t => t.status === 'draft').length, cls: 'text-gray-500' },
            { label: 'Deprecated', value: terms.filter(t => t.status === 'deprecated').length, cls: 'text-red-500' },
            { label: 'Linked to Tables', value: terms.filter(t => (t.linked_asset_count ?? 0) > 0).length, cls: 'text-purple-600' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 flex items-center gap-2">
              <span className={`text-xl font-bold ${cls}`}>{value}</span>
              <span className="text-xs text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search + tabs */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search terms or definitions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
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
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['', 'Term', 'Definition', 'Domain', 'Status', 'Linked', 'Actions'].map(h => (
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
      ) : terms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mb-4">
            <BookOpen size={28} className="text-purple-400" />
          </div>
          <p className="text-base font-semibold text-gray-800">No glossary terms found</p>
          <p className="text-sm text-gray-400 mt-1">
            {search ? `No terms match "${search}".` : 'Create your first business term to get started.'}
          </p>
          {!search && (
            <button
              onClick={() => setModal('create')}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Plus size={14} /> New Term
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Term</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Definition</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Domain</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Linked</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {terms.map(term => {
                const st = STATUS_CONFIG[term.status] ?? STATUS_CONFIG.draft
                const isExpanded = expandedId === term.term_id
                const synonymChips = (term.synonyms ?? '')
                  .split(',').map(s => s.trim()).filter(Boolean).slice(0, 3)

                return (
                  <>
                    <tr
                      key={term.term_id}
                      className={clsx(
                        'hover:bg-gray-50/60 transition-colors cursor-pointer',
                        isExpanded && 'bg-purple-50/30'
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : term.term_id)}
                    >
                      {/* Expand chevron */}
                      <td className="px-3 py-3 text-center">
                        <ChevronRight
                          size={14}
                          className={clsx(
                            'text-gray-400 transition-transform',
                            isExpanded && 'rotate-90'
                          )}
                        />
                      </td>

                      {/* Term name + synonyms */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 whitespace-nowrap">{term.term_name}</p>
                        {synonymChips.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {synonymChips.map(s => (
                              <span key={s} className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full font-medium">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Definition truncated */}
                      <td className="px-4 py-3 text-gray-500 max-w-xs">
                        <p className="truncate text-sm">{term.definition ?? '—'}</p>
                      </td>

                      {/* Domain */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {term.domain_name ? (
                          <span className="flex items-center gap-1 text-xs text-gray-600">
                            <Globe size={11} className="text-gray-400" />
                            {term.domain_name}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', st.cls)}>
                          {st.label}
                        </span>
                      </td>

                      {/* Linked count */}
                      <td className="px-4 py-3">
                        {(term.linked_asset_count ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                            <Link2 size={10} />
                            {term.linked_asset_count}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center gap-2"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setLinkTerm(term)}
                            className="text-gray-400 hover:text-green-600 transition-colors"
                            title="Link to Table"
                          >
                            <Link2 size={14} />
                          </button>
                          <button
                            onClick={() => { setModal(term); setExpandedId(null) }}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(term.term_id)}
                            disabled={deleting === term.term_id}
                            className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
                            title="Deprecate"
                          >
                            {deleting === term.term_id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <ExpandedTermRow
                        key={`exp-${term.term_id}`}
                        term={term}
                        onUnlink={(linkId) => handleUnlink(term.term_id, linkId)}
                        onClose={() => setExpandedId(null)}
                      />
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal && (
        <TermModal
          term={modal === 'create' ? null : modal}
          domains={domains}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }}
        />
      )}

      {/* Link to Table modal */}
      {linkTerm && (
        <LinkAssetModal
          term={linkTerm}
          onClose={() => { setLinkTerm(null); load() }}
          onSave={() => load()}
        />
      )}
    </div>
  )
}
