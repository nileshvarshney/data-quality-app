'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { marketplaceApi, assetsApi } from '@/services/apiClient'
import {
  ShoppingBag, Download, Star, Filter, Loader2, X,
  Search, Plus, Zap, RefreshCw, CheckCircle, BookOpen,
  ArrowDownToLine, GitBranch,
} from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'sonner'
import HowItWorks from '@/components/common/HowItWorks'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Template {
  template_id: string
  template_name: string
  description: string | null
  rule_type: string
  target_industries: string | null
  target_domains: string | null
  default_config: Record<string, any> | null
  downloads: number
  rating: number
  author_email: string | null
  tags: string | null
  is_public: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INDUSTRIES = ['All', 'Finance', 'Revenue', 'HR', 'Healthcare', 'E-commerce', 'Operations', 'Marketing', 'GTM']
const RULE_TYPES = [
  { value: 'All',                        label: 'All Types' },
  { value: 'null_check',                 label: 'Null Check' },
  { value: 'uniqueness_check',           label: 'Uniqueness' },
  { value: 'range_check',               label: 'Range Check' },
  { value: 'regex_check',               label: 'Regex Check' },
  { value: 'freshness_check',            label: 'Freshness' },
  { value: 'volume_check',              label: 'Volume Check' },
  { value: 'accepted_values_check',      label: 'Accepted Values' },
  { value: 'semantic_consistency_check', label: 'Semantic' },
  { value: 'custom_sql_check',          label: 'Custom SQL' },
]

const RULE_TYPE_COLOR: Record<string, string> = {
  null_check:                 'bg-blue-100 text-blue-700',
  uniqueness_check:           'bg-indigo-100 text-indigo-700',
  range_check:                'bg-green-100 text-green-700',
  regex_check:                'bg-purple-100 text-purple-700',
  freshness_check:            'bg-orange-100 text-orange-700',
  volume_check:               'bg-teal-100 text-teal-700',
  accepted_values_check:      'bg-pink-100 text-pink-700',
  semantic_consistency_check: 'bg-rose-100 text-rose-700',
  referential_integrity_check:'bg-amber-100 text-amber-700',
  custom_sql_check:           'bg-gray-100 text-gray-700',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toArr(v: string | null | undefined): string[] {
  if (!v) return []
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

/** Convert snake_case rule type to Title Case label */
function ruleTypeLabel(rt: string): string {
  return rt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Fix #4: show "No ratings yet" for rating=0 instead of 5 empty stars
function StarRow({ rating, size = 11, onRate }: { rating: number; size?: number; onRate?: (n: number) => void }) {
  const [hover, setHover] = useState(0)

  if (rating === 0 && !onRate) {
    return <span className="text-[10px] text-gray-400 italic">No ratings yet</span>
  }

  const display = hover || rating
  const full  = Math.min(5, Math.floor(display))
  const empty = 5 - full

  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star
          key={`f${i}`} size={size}
          className={clsx('fill-yellow-400 text-yellow-400', onRate && 'cursor-pointer')}
          onMouseEnter={() => onRate && setHover(i + 1)}
          onMouseLeave={() => onRate && setHover(0)}
          onClick={() => onRate?.(i + 1)}
        />
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <Star
          key={`e${i}`} size={size}
          className={clsx('text-gray-300', onRate && 'cursor-pointer hover:text-yellow-400')}
          onMouseEnter={() => onRate && setHover(full + i + 1)}
          onMouseLeave={() => onRate && setHover(0)}
          onClick={() => onRate?.(full + i + 1)}
        />
      ))}
      {rating > 0 && (
        <span className="text-[10px] text-gray-400 ml-1">{Number(rating).toFixed(1)}</span>
      )}
    </span>
  )
}

// ── Import dialog ─────────────────────────────────────────────────────────────

function ImportDialog({
  template, assets, onClose, onDone,
}: {
  template: Template
  assets: any[]
  onClose: () => void
  onDone: () => void
}) {
  const [assetId,  setAssetId]  = useState('')
  const [severity, setSeverity] = useState('medium')
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)

  // Fix #3: explicit text color on selects
  const selStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: '8px', fontSize: '13px', color: '#111827',
    background: '#ffffff', outline: 'none',
  }

  const handleImport = async () => {
    if (!assetId) return
    setLoading(true)
    try {
      await marketplaceApi.import(template.template_id, { asset_id: assetId, severity })
      setDone(true)
      onDone()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Import Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {done ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={24} className="text-green-600" />
              </div>
              <p className="font-semibold text-gray-900 mb-1">Template Imported!</p>
              <p className="text-sm text-gray-500">
                <b>{template.template_name}</b> added as a draft rule. Approve it in Rules → Pending Review.
              </p>
              <button onClick={onClose}
                className="mt-5 px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Template summary */}
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="flex items-start gap-2">
                  <span className={clsx(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5',
                    RULE_TYPE_COLOR[template.rule_type] ?? 'bg-gray-100 text-gray-600'
                  )}>
                    {ruleTypeLabel(template.rule_type)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{template.template_name}</p>
                    {template.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
                    )}
                  </div>
                </div>
                {/* Show rating + downloads inline */}
                <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-200">
                  <StarRow rating={template.rating} size={11} />
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    <Download size={11} />
                    {template.downloads > 0 ? `${template.downloads} imports` : 'New template'}
                  </span>
                </div>
              </div>

              {/* Asset selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Import to Table *
                </label>
                {assets.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    No tables registered yet. Register a table in Data Assets first.
                  </p>
                ) : (
                  <select value={assetId} onChange={e => setAssetId(e.target.value)} style={selStyle}>
                    <option value="">— select a table —</option>
                    {assets.map((a: any) => (
                      <option key={a.asset_id} value={a.asset_id}>
                        {[a.sf_database_name, a.sf_schema_name, a.sf_table_name].filter(Boolean).join('.')}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Severity */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Severity</label>
                <select value={severity} onChange={e => setSeverity(e.target.value)} style={selStyle}>
                  {['critical', 'high', 'medium', 'low'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Config preview */}
              {template.default_config && Object.keys(template.default_config).length > 0 && (
                <div className="p-3 bg-indigo-50 rounded-xl">
                  <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mb-1.5">Default Config</p>
                  <pre className="text-xs font-mono text-indigo-800 whitespace-pre-wrap break-all">
                    {JSON.stringify(template.default_config, null, 2)}
                  </pre>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={onClose}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!assetId || loading}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Import as Draft Rule
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Publish dialog ─────────────────────────────────────────────────────────────

function PublishDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const TYPES = RULE_TYPES.filter(t => t.value !== 'All')
  const [form, setForm] = useState({
    template_name: '', description: '', rule_type: 'null_check',
    target_industries: '', tags: '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // Fix #2: all form fields use explicit text/bg styles — no class inheritance
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: '8px', fontSize: '13px', color: '#111827',
    background: '#ffffff', outline: 'none', boxSizing: 'border-box',
  }

  const handlePublish = async () => {
    if (!form.template_name || !form.rule_type) return
    setLoading(true)
    try {
      await marketplaceApi.create({ ...form, is_public: true })
      toast.success('Template published to marketplace')
      onDone()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Publish failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Publish Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Template Name *</label>
            <input
              value={form.template_name}
              onChange={e => set('template_name', e.target.value)}
              placeholder="e.g. Invoice Amount Positive"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              placeholder="What does this rule check?"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Rule Type *</label>
              <select value={form.rule_type} onChange={e => set('rule_type', e.target.value)} style={inputStyle}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Industries</label>
              <input
                value={form.target_industries}
                onChange={e => set('target_industries', e.target.value)}
                placeholder="Finance,HR"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tags (comma-separated)</label>
            <input
              value={form.tags}
              onChange={e => set('tags', e.target.value)}
              placeholder="invoices,billing,required"
              style={inputStyle}
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handlePublish} disabled={!form.template_name || loading}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Publish
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ t, onImport, onRate }: {
  t: Template
  onImport: (t: Template) => void
  onRate: (id: string, n: number) => void
}) {
  const industries = toArr(t.target_industries)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-indigo-200 transition-all flex flex-col gap-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        {/* Fix #9: tooltip for long names via title attribute */}
        <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2" title={t.template_name}>
          {t.template_name}
        </p>
        {/* Fix #5: title-case rule type badge */}
        <span className={clsx(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap',
          RULE_TYPE_COLOR[t.rule_type] ?? 'bg-gray-100 text-gray-600'
        )}>
          {ruleTypeLabel(t.rule_type)}
        </span>
      </div>

      {/* Description */}
      {t.description && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{t.description}</p>
      )}

      {/* Industry tags */}
      {industries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {industries.slice(0, 3).map(ind => (
            <span key={ind} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
              {ind}
            </span>
          ))}
          {industries.length > 3 && (
            <span className="text-[10px] text-gray-400">+{industries.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
        <div className="flex items-center gap-3">
          {/* Fix #6: show "New" instead of bare 0 */}
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <Download size={11} />
            {t.downloads > 0 ? t.downloads : <span className="text-emerald-600 font-semibold">New</span>}
          </span>
          {/* Fix #8: interactive star rating */}
          <StarRow rating={t.rating} size={11} onRate={n => onRate(t.template_id, n)} />
        </div>
        <button
          onClick={() => onImport(t)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Download size={11} /> Import
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [all,     setAll]     = useState<Template[]>([])
  const [popular, setPopular] = useState<Template[]>([])
  const [assets,  setAssets]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  const [industry,  setIndustry]  = useState('All')
  const [ruleType,  setRuleType]  = useState('All')
  const [search,    setSearch]    = useState('')

  const [importTarget,  setImportTarget]  = useState<Template | null>(null)
  const [showPublish,   setShowPublish]   = useState(false)
  const [importCount,   setImportCount]   = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | boolean> = { is_public: true }  // Fix #7: only public templates
      if (industry !== 'All') params.industry  = industry
      if (ruleType !== 'All') params.rule_type = ruleType

      const [allRes, popRes, assRes] = await Promise.allSettled([
        marketplaceApi.list(params),
        marketplaceApi.popular(),
        assetsApi.listEnriched(),
      ])

      const allData: Template[] = allRes.status === 'fulfilled'
        ? (Array.isArray(allRes.value.data) ? allRes.value.data : []) : []
      const popData: Template[] = popRes.status === 'fulfilled'
        ? (Array.isArray(popRes.value.data) ? popRes.value.data.slice(0, 4) : []) : []

      setAll(allData)
      setPopular(popData)
      setAssets(assRes.status === 'fulfilled'
        ? (Array.isArray(assRes.value.data) ? assRes.value.data : (assRes.value.data?.items ?? []))
        : [])
    } finally {
      setLoading(false)
    }
  }, [industry, ruleType])

  useEffect(() => { load() }, [load])

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const r = await marketplaceApi.seed()
      toast.success(`${(r.data as any).message}`)
      await load()
    } catch {
      toast.error('Seed failed — check backend logs')
    } finally {
      setSeeding(false)
    }
  }

  // Fix #8: rate handler updates the local state optimistically
  const handleRate = useCallback(async (templateId: string, rating: number) => {
    try {
      await marketplaceApi.rate(templateId, rating)
      toast.success(`Rated ${rating} ★`)
      setAll(prev => prev.map(t =>
        t.template_id === templateId
          ? { ...t, rating: t.rating > 0 ? Math.round((t.rating + rating) / 2 * 10) / 10 : rating }
          : t
      ))
      setPopular(prev => prev.map(t =>
        t.template_id === templateId
          ? { ...t, rating: t.rating > 0 ? Math.round((t.rating + rating) / 2 * 10) / 10 : rating }
          : t
      ))
    } catch {
      toast.error('Rating failed')
    }
  }, [])

  // Client-side text search on top of server-side filters
  const filtered = useMemo(() => {
    if (!search.trim()) return all
    const q = search.toLowerCase()
    return all.filter(t =>
      t.template_name.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q) ||
      (t.target_industries ?? '').toLowerCase().includes(q) ||
      (t.tags ?? '').toLowerCase().includes(q) ||
      t.rule_type.includes(q)
    )
  }, [all, search])

  const popularIds  = useMemo(() => new Set(popular.map(t => t.template_id)), [popular])
  const nonPopular  = useMemo(() => filtered.filter(t => !popularIds.has(t.template_id)), [filtered, popularIds])

  const isFiltering = search.trim() !== '' || industry !== 'All' || ruleType !== 'All'
  const isEmpty     = !loading && all.length === 0

  // Fix #9: when popular is shown, "All Templates" label reflects only the non-popular slice
  const allSectionLabel = isFiltering
    ? `Search Results (${filtered.length})`
    : popular.length > 0
      ? `All Templates (${nonPopular.length} more)`
      : `All Templates (${all.length})`

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ShoppingBag size={22} className="text-indigo-500" />
            Rule Marketplace
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Browse industry-standard templates and import them as ready-to-approve rules
            {importCount > 0 && (
              <span className="ml-2 text-indigo-600 font-semibold">
                · {importCount} import{importCount !== 1 ? 's' : ''} this session
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleSeed} disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-all disabled:opacity-40">
            {seeding ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {seeding ? 'Seeding…' : 'Seed Templates'}
          </button>
          <button onClick={() => load()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-all disabled:opacity-40">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setShowPublish(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all">
            <Plus size={12} /> Publish Template
          </button>
        </div>
      </div>

      <HowItWorks
        storageKey="marketplace"
        title="How the Rule Marketplace Works"
        steps={[
          { icon: <BookOpen size={13} />, title: 'Browse Templates', description: 'Explore industry-standard rule templates across Finance, HR, Healthcare, E-commerce, Operations, and Marketing — curated and ready to use.' },
          { icon: <Zap size={13} />, title: 'Seed Industry Packs', description: 'Click "Seed Templates" to populate 29 pre-built templates. Use industry and rule-type filters to narrow down the list instantly.' },
          { icon: <ArrowDownToLine size={13} />, title: 'Import as Draft Rule', description: 'Click Import on any template, select the target table and severity. The template becomes a draft rule pending your review and approval.' },
          { icon: <GitBranch size={13} />, title: 'Approve & Activate', description: 'Go to Rules → Pending Review to approve imported rules. Once approved, the rule becomes active and runs on its configured schedule.' },
          { icon: <Star size={13} />, title: 'Publish Your Own', description: 'Click "Publish Template" to share a rule pattern with your team. Published templates appear in the marketplace for others to import.' },
        ]}
      />

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
        <Filter size={13} className="text-gray-400 shrink-0" />

        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates, rule types, industries…"
            style={{
              width: '100%', paddingLeft: '28px', paddingRight: '28px',
              paddingTop: '6px', paddingBottom: '6px',
              border: '1.5px solid #e2e8f0', borderRadius: '8px',
              fontSize: '13px', color: '#111827', background: '#ffffff', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 whitespace-nowrap">Industry</span>
          <select
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#111827', background: '#ffffff', outline: 'none' }}
          >
            {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 whitespace-nowrap">Rule Type</span>
          <select
            value={ruleType}
            onChange={e => setRuleType(e.target.value)}
            style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#111827', background: '#ffffff', outline: 'none' }}
          >
            {RULE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {!loading && (
          <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
            {filtered.length} of {all.length} templates
          </span>
        )}
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
            <ShoppingBag size={28} className="text-indigo-400" />
          </div>
          <p className="text-base font-semibold text-gray-800 mb-1">Marketplace is empty</p>
          <p className="text-sm text-gray-400 text-center max-w-sm mb-6">
            No rule templates exist yet. Click "Seed Templates" to populate 29 industry-standard templates across Finance, HR, Healthcare, E-commerce, and more.
          </p>
          <button onClick={handleSeed} disabled={seeding}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {seeding ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {seeding ? 'Seeding…' : 'Seed Industry Templates'}
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-xl border border-gray-200 p-4 space-y-3 h-44">
              <div className="flex justify-between gap-2">
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="h-5 w-20 bg-gray-100 rounded-full" />
              </div>
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-4/5" />
              <div className="flex gap-1.5 mt-2">
                <div className="h-4 w-14 bg-gray-100 rounded" />
                <div className="h-4 w-14 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !isEmpty && (
        <>
          {/* Popular section — hidden when filters/search are active */}
          {popular.length > 0 && !isFiltering && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                Most Downloaded
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {popular.map(t => (
                  <TemplateCard key={t.template_id} t={t} onImport={setImportTarget} onRate={handleRate} />
                ))}
              </div>
            </section>
          )}

          {/* All / filtered templates */}
          <section>
            {/* Fix #9: clearer section label */}
            <h2 className="text-sm font-semibold text-gray-700 mb-3">{allSectionLabel}</h2>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 bg-white rounded-xl border border-gray-200">
                <Search size={32} className="text-gray-200 mb-3" />
                <p className="text-sm font-medium text-gray-600">No templates match your filters</p>
                <button onClick={() => { setSearch(''); setIndustry('All'); setRuleType('All') }}
                  className="mt-3 text-xs text-indigo-600 hover:underline">
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {(isFiltering ? filtered : nonPopular).map(t => (
                  <TemplateCard key={t.template_id} t={t} onImport={setImportTarget} onRate={handleRate} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {importTarget && (
        <ImportDialog
          template={importTarget}
          assets={assets}
          onClose={() => setImportTarget(null)}
          onDone={() => setImportCount(c => c + 1)}
        />
      )}

      {showPublish && (
        <PublishDialog
          onClose={() => setShowPublish(false)}
          onDone={load}
        />
      )}
    </div>
  )
}
