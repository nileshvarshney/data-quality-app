'use client'
import { useEffect, useState, useCallback } from 'react'
import { useTimezone } from '@/contexts/TimezoneContext'
import { dataProductsApi, domainsApi, assetsApi } from '@/services/apiClient'
import {
  Package, Plus, Star, Globe, Loader2, X, Pencil, Trash2,
  Database, ChevronRight, BarChart3, Tag, AlertCircle,
} from 'lucide-react'
import clsx from 'clsx'
import HowItWorks from '@/components/common/HowItWorks'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssetLink {
  link_id: string
  asset_id: string
  role: string | null
  sf_table_name: string | null
  sf_schema_name: string | null
}

interface DataProduct {
  product_id: string
  product_name: string
  description: string | null
  domain_id: string | null
  owner_email: string | null
  status: 'draft' | 'published' | 'deprecated'
  version: string | null
  tags: string | null
  readme: string | null
  created_by: string | null
  assets?: AssetLink[]
}

interface Domain {
  domain_id: string
  domain_name: string
}

interface RawAsset {
  asset_id: string
  sf_table_name: string
  sf_schema_name: string
}

interface ProductForm {
  product_name: string
  description: string
  domain_id: string
  owner_email: string
  version: string
  tags: string
  status: string
}

const EMPTY_FORM: ProductForm = {
  product_name: '',
  description: '',
  domain_id: '',
  owner_email: '',
  version: '1.0',
  tags: '',
  status: 'draft',
}

const STATUS_CONFIG: Record<string, { cls: string; label: string }> = {
  draft:      { cls: 'bg-gray-100 text-gray-600',   label: 'Draft' },
  published:  { cls: 'bg-green-100 text-green-700', label: 'Published' },
  deprecated: { cls: 'bg-red-100 text-red-700',     label: 'Deprecated' },
}

const ASSET_ROLES = ['primary', 'supporting', 'output']

const STATUS_TABS = [
  { value: '',           label: 'All' },
  { value: 'draft',      label: 'Draft' },
  { value: 'published',  label: 'Published' },
  { value: 'deprecated', label: 'Deprecated' },
]

// ── Product form modal ────────────────────────────────────────────────────────

function ProductFormModal({
  product,
  domains,
  onClose,
  onSave,
}: {
  product: DataProduct | null
  domains: Domain[]
  onClose: () => void
  onSave: () => void
}) {
  const [form, setForm] = useState<ProductForm>(
    product
      ? {
          product_name: product.product_name,
          description:  product.description ?? '',
          domain_id:    product.domain_id ?? '',
          owner_email:  product.owner_email ?? '',
          version:      product.version ?? '1.0',
          tags:         product.tags ?? '',
          status:       product.status,
        }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (field: keyof ProductForm, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.product_name.trim()) { setError('Product name is required'); return }
    setSaving(true); setError('')
    try {
      if (product) {
        await dataProductsApi.update(product.product_id, form)
      } else {
        await dataProductsApi.create(form)
      }
      onSave()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {product ? 'Edit Data Product' : 'New Data Product'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Product Name *</label>
            <input
              value={form.product_name}
              onChange={e => set('product_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Revenue Analytics Product"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="What does this data product contain?"
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Version</label>
              <input
                value={form.version}
                onChange={e => set('version', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1.0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tags</label>
            <input
              value={form.tags}
              onChange={e => set('tags', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Comma-separated tags (e.g. revenue, billing)"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
            >Cancel</button>
            <button
              type="submit" disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {product ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Product detail slide-over ─────────────────────────────────────────────────

function ProductDetail({
  productId,
  domains,
  allAssets,
  onClose,
  onEdit,
  onDeleted,
}: {
  productId: string
  domains: Domain[]
  allAssets: RawAsset[]
  onClose: () => void
  onEdit: (p: DataProduct) => void
  onDeleted: () => void
}) {
  const { formatTs } = useTimezone()
  const [product, setProduct]         = useState<DataProduct | null>(null)
  const [loading, setLoading]         = useState(true)
  const [quality, setQuality]         = useState<Record<string, unknown> | null>(null)
  const [qualityLoading, setQualityLoading] = useState(false)
  const [addingAsset, setAddingAsset] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState('')
  const [selectedRole, setSelectedRole]   = useState('primary')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const domainMap = Object.fromEntries(domains.map(d => [d.domain_id, d.domain_name]))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await dataProductsApi.get(productId)
      setProduct(res.data)
    } catch {
      setProduct(null)
    } finally {
      setLoading(false)
    }
  }, [productId])

  const loadQuality = useCallback(async () => {
    setQualityLoading(true)
    try {
      const res = await dataProductsApi.quality(productId)
      setQuality(res.data)
    } catch {
      setQuality({})
    } finally {
      setQualityLoading(false)
    }
  }, [productId])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadQuality() }, [loadQuality])

  const handleAddAsset = async () => {
    if (!selectedAsset) return
    setSaving(true); setErr('')
    try {
      await dataProductsApi.addAsset(productId, selectedAsset, selectedRole)
      setAddingAsset(false); setSelectedAsset(''); setSelectedRole('primary')
      await load()
    } catch {
      setErr('Failed to add asset')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveAsset = async (linkId: string) => {
    if (!confirm('Remove this table from the product?')) return
    try {
      await dataProductsApi.removeAsset(productId, linkId)
      await load()
    } catch {
      alert('Failed to remove asset')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this data product?')) return
    try {
      await dataProductsApi.delete(productId)
      onDeleted()
    } catch {
      alert('Failed to delete')
    }
  }

  const linkedAssetIds = new Set((product?.assets ?? []).map(a => a.asset_id))
  const availableAssets = allAssets.filter(a => !linkedAssetIds.has(a.asset_id))
  const avgScore = (quality as { overall_avg_quality_score?: number } | null)?.overall_avg_quality_score ?? null
  const assetScores = (quality as { asset_scores?: { asset_id: string; avg_score: number; last_run: string | null; run_count: number }[] } | null)?.asset_scores ?? []
  const assetScoreMap = Object.fromEntries(assetScores.map(s => [s.asset_id, s]))

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
              <Package size={15} className="text-green-600" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">Product Details</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : !product ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Product not found</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Meta */}
            <div>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{product.product_name}</h2>
                  {product.version && <p className="text-xs text-gray-400">v{product.version}</p>}
                </div>
                <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full shrink-0', STATUS_CONFIG[product.status]?.cls)}>
                  {STATUS_CONFIG[product.status]?.label}
                </span>
              </div>
              {product.description && (
                <p className="text-sm text-gray-600 mb-3">{product.description}</p>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                {product.domain_id && domainMap[product.domain_id] && (
                  <span className="flex items-center gap-1"><Globe size={11} />{domainMap[product.domain_id]}</span>
                )}
                {product.owner_email && (
                  <span>Owner: {product.owner_email}</span>
                )}
                {product.created_by && (
                  <span>Created by: {product.created_by}</span>
                )}
              </div>
              {product.tags && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {product.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                      <Tag size={9} />{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Quality */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <BarChart3 size={14} className="text-yellow-500" />
                  Quality Score
                </span>
                <button
                  onClick={loadQuality}
                  disabled={qualityLoading}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {qualityLoading
                    ? <><Loader2 size={11} className="animate-spin" />Loading…</>
                    : 'Refresh'}
                </button>
              </div>

              {qualityLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <Loader2 size={13} className="animate-spin" /> Computing quality scores…
                </div>
              ) : avgScore !== null ? (
                <div className="space-y-3">
                  {/* Overall bar */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                        <div
                          className={clsx('h-2.5 rounded-full transition-all', avgScore >= 90 ? 'bg-green-500' : avgScore >= 70 ? 'bg-yellow-400' : 'bg-red-500')}
                          style={{ width: `${avgScore}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold text-gray-800 w-14 text-right">{avgScore.toFixed(1)}%</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      Avg across {assetScores.length} of {(quality as { asset_count?: number })?.asset_count ?? 0} linked table{assetScores.length !== 1 ? 's' : ''} with runs
                    </p>
                  </div>

                  {/* Per-table breakdown */}
                  {assetScores.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-gray-200">
                      {assetScores.map(s => {
                        const linkedAsset = product?.assets?.find(a => a.asset_id === s.asset_id)
                        const tableName = linkedAsset?.sf_table_name ?? s.asset_id.slice(0, 8)
                        const lastRun = s.last_run
                          ? formatTs(s.last_run)
                          : null
                        return (
                          <div key={s.asset_id} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 truncate flex-1 font-mono" title={tableName}>{tableName}</span>
                            <div className="w-20 bg-gray-200 rounded-full h-1.5 shrink-0">
                              <div
                                className={clsx('h-1.5 rounded-full', s.avg_score >= 90 ? 'bg-green-500' : s.avg_score >= 70 ? 'bg-yellow-400' : 'bg-red-500')}
                                style={{ width: `${s.avg_score}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-gray-700 w-12 text-right shrink-0">{s.avg_score.toFixed(1)}%</span>
                            {lastRun && <span className="text-xs text-gray-400 hidden sm:block shrink-0">{lastRun}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : quality !== null ? (
                <p className="text-xs text-gray-400">
                  No rule runs found for the linked tables yet. Execute rules against the linked tables to see quality scores here.
                </p>
              ) : null}
            </div>

            {/* Tables */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">
                  Tables ({product.assets?.length ?? 0})
                </h3>
                <button
                  onClick={() => setAddingAsset(!addingAsset)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus size={11} />
                  Add Table
                </button>
              </div>

              {addingAsset && (
                <div className="mb-3 p-3 border border-blue-200 bg-blue-50 rounded-xl space-y-2">
                  {err && <p className="text-xs text-red-600">{err}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={selectedAsset}
                      onChange={e => setSelectedAsset(e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Select table —</option>
                      {availableAssets.map(a => (
                        <option key={a.asset_id} value={a.asset_id}>
                          {a.sf_schema_name}.{a.sf_table_name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedRole}
                      onChange={e => setSelectedRole(e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ASSET_ROLES.map(r => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddAsset} disabled={!selectedAsset || saving}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving && <Loader2 size={10} className="animate-spin" />}
                      Add
                    </button>
                    <button
                      onClick={() => { setAddingAsset(false); setErr('') }}
                      className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                    >Cancel</button>
                  </div>
                </div>
              )}

              {product.assets && product.assets.length > 0 ? (
                <div className="space-y-2">
                  {product.assets.map(a => (
                    <div key={a.link_id} className="flex items-center justify-between gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:border-gray-300">
                      <div className="flex items-center gap-2 min-w-0">
                        <Database size={13} className="text-gray-400 shrink-0" />
                        <span className="text-xs text-gray-800 truncate font-mono">
                          {a.sf_schema_name}.{a.sf_table_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {a.role && (
                          <span className={clsx(
                            'text-xs px-1.5 py-0.5 rounded',
                            a.role === 'primary'    ? 'bg-blue-50 text-blue-700'   :
                            a.role === 'output'     ? 'bg-green-50 text-green-700' :
                                                      'bg-gray-100 text-gray-600'
                          )}>
                            {a.role}
                          </span>
                        )}
                        <button
                          onClick={() => handleRemoveAsset(a.link_id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
                  <Database size={20} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No tables linked yet. Click &ldquo;Add Table&rdquo; above.</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => onEdit(product)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                <Pencil size={12} />
                Edit Details
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-4 py-2 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50 ml-auto"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  domainName,
  onOpen,
  onEdit,
}: {
  product: DataProduct
  domainName: string | null
  onOpen: (id: string) => void
  onEdit: (p: DataProduct) => void
}) {
  const st = STATUS_CONFIG[product.status] ?? STATUS_CONFIG.draft

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer flex flex-col gap-3"
      onClick={() => onOpen(product.product_id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
            <Package size={18} className="text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{product.product_name}</p>
            {product.version && <p className="text-xs text-gray-400">v{product.version}</p>}
          </div>
        </div>
        <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full shrink-0', st.cls)}>
          {st.label}
        </span>
      </div>

      {product.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{product.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
        {domainName && (
          <span className="flex items-center gap-1"><Globe size={11} />{domainName}</span>
        )}
        {product.owner_email && <span className="truncate max-w-[140px]">{product.owner_email}</span>}
      </div>

      {product.tags && (
        <div className="flex flex-wrap gap-1">
          {product.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3).map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{tag}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-auto">
        <button
          onClick={e => { e.stopPropagation(); onEdit(product) }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <Pencil size={11} />
          Edit
        </button>
        <span className="flex items-center gap-1 ml-auto text-xs text-gray-400 hover:text-blue-600">
          View details <ChevronRight size={11} />
        </span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DataProductsPage() {
  const [products, setProducts]     = useState<DataProduct[]>([])
  const [domains, setDomains]       = useState<Domain[]>([])
  const [allAssets, setAllAssets]   = useState<RawAsset[]>([])
  const [loading, setLoading]       = useState(true)
  const [statusTab, setStatusTab]   = useState('')
  const [formModal, setFormModal]   = useState<'create' | DataProduct | null>(null)
  const [detailId, setDetailId]     = useState<string | null>(null)
  const [error, setError]           = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params: Record<string, string> = {}
      if (statusTab) params.status = statusTab
      const [prodRes, domRes, assetRes] = await Promise.all([
        dataProductsApi.list(params),
        domainsApi.list(),
        assetsApi.list({ limit: 500 }),
      ])
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : [])
      setDomains(Array.isArray(domRes.data) ? domRes.data : [])
      const rawItems = assetRes.data?.items ?? assetRes.data ?? []
      setAllAssets(Array.isArray(rawItems) ? rawItems : [])
    } catch {
      setError('Failed to load data products')
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [statusTab])

  useEffect(() => { load() }, [load])

  const domainMap = Object.fromEntries(domains.map(d => [d.domain_id, d.domain_name]))

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Products</h1>
          <p className="text-gray-500 text-sm mt-1">Manage and publish curated data products</p>
        </div>
        <button
          onClick={() => setFormModal('create')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} />
          New Product
        </button>
      </div>

      <HowItWorks
        storageKey="data-products"
        title="How Data Products Work"
        steps={[
          { icon: <Package size={13} />, title: 'Create a Product', description: 'Bundle related Snowflake tables into a named product with owner, description, and version.' },
          { icon: <Plus size={13} />, title: 'Add Tables', description: 'Open a product card, click "Add Table" inside the panel to link assets as primary, supporting, or output.' },
          { icon: <Star size={13} />, title: 'Monitor Quality', description: 'Click "Refresh" in the Quality section to see the aggregated quality score across all linked tables.' },
          { icon: <Globe size={13} />, title: 'Publish', description: 'Edit the product and change status from Draft to Published to make it discoverable in the Data Catalog.' },
        ]}
      />

      {/* Status tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
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

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
              </div>
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-4/5" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
            <Package size={28} className="text-green-400" />
          </div>
          <p className="text-base font-semibold text-gray-800">No data products found</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Create your first data product to get started.</p>
          <button
            onClick={() => setFormModal('create')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={14} />
            Create Data Product
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <ProductCard
              key={p.product_id}
              product={p}
              domainName={p.domain_id ? domainMap[p.domain_id] ?? null : null}
              onOpen={id => setDetailId(id)}
              onEdit={prod => setFormModal(prod)}
            />
          ))}
        </div>
      )}

      {/* Form modal (create / edit) */}
      {formModal && (
        <ProductFormModal
          product={formModal === 'create' ? null : formModal}
          domains={domains}
          onClose={() => setFormModal(null)}
          onSave={() => { setFormModal(null); load() }}
        />
      )}

      {/* Detail slide-over */}
      {detailId && (
        <ProductDetail
          productId={detailId}
          domains={domains}
          allAssets={allAssets}
          onClose={() => setDetailId(null)}
          onEdit={prod => { setDetailId(null); setFormModal(prod) }}
          onDeleted={() => { setDetailId(null); load() }}
        />
      )}
    </div>
  )
}
