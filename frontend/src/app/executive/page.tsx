'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { costApi, assetsApi, incidentsApi } from '@/services/apiClient'
import {
  DollarSign, TrendingDown, AlertCircle, BarChart2, Loader2, Settings,
  TrendingUp, ShieldCheck, CheckCircle2, Plus, Trash2, Search, X, Pencil,
  ChevronRight, Home, ArrowUpRight, ChevronsUpDown, ChevronUp, ChevronDown,
  ChevronLeft,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import HowItWorks from '@/components/common/HowItWorks'

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = '7' | '30' | '90'

interface CostSummary {
  total_cost_30d: number
  cost_averted: number
  active_rules: number
  configured_assets: number
  total_failed_rows: number
}

interface DomainCost {
  domain_id: string
  domain_name: string
  total_cost: number
  failed_rows: number
  run_count: number
  asset_count: number
  configured_assets: number
}

interface SubdomainCost {
  subdomain_id: string
  subdomain_name: string
  domain_id: string
  domain_name: string
  total_cost: number
  failed_rows: number
  run_count: number
  asset_count: number
  configured_assets: number
}

interface AssetCost {
  asset_id: string
  asset_name: string
  sf_schema_name: string
  sf_table_name: string
  domain_id: string
  domain_name: string
  subdomain_id: string
  subdomain_name: string
  cost_per_failed_row: number | null
  has_cost_config: boolean
  failed_rows_30d: number
  total_rows_scanned: number
  run_count: number
  total_cost: number
}

interface CostConfig { asset_id: string; asset_name: string; domain_name: string; cost_per_failed_row: number }
interface AssetOption { asset_id: string; label: string; domain_name: string }
interface IncidentStats { open_count: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtSmall = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const BAR_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316']

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, accent }: { label: string; value: string; sub?: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

function Breadcrumb({
  domain, subdomain,
  onGlobal, onDomain,
}: {
  domain: DomainCost | null
  subdomain: SubdomainCost | null
  onGlobal: () => void
  onDomain: () => void
}) {
  return (
    <nav className="flex items-center gap-1.5 text-sm mb-5">
      <button onClick={onGlobal} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium">
        <Home size={13} /> All Domains
      </button>
      {domain && (
        <>
          <ChevronRight size={13} className="text-gray-400" />
          <button
            onClick={onDomain}
            className={`font-medium ${subdomain ? 'text-blue-600 hover:text-blue-800' : 'text-gray-700'}`}
          >
            {domain.domain_name}
          </button>
        </>
      )}
      {subdomain && (
        <>
          <ChevronRight size={13} className="text-gray-400" />
          <span className="text-gray-700 font-medium">{subdomain.subdomain_name}</span>
        </>
      )}
    </nav>
  )
}

// ── Filter bar (period only) ──────────────────────────────────────────────────

function FilterBar({ period, onPeriod }: { period: Period; onPeriod: (p: Period) => void }) {
  const periods: { label: string; value: Period }[] = [
    { label: '7 days', value: '7' },
    { label: '30 days', value: '30' },
    { label: '90 days', value: '90' },
  ]
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="text-xs text-gray-500 font-medium">Period:</span>
      <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
        {periods.map(p => (
          <button key={p.value} onClick={() => onPeriod(p.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              period === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Domain cards ──────────────────────────────────────────────────────────────

function DomainCards({ domains, onDrill }: { domains: DomainCost[]; onDrill: (d: DomainCost) => void }) {
  if (domains.length === 0)
    return <p className="text-sm text-gray-400 text-center py-10">No cost data — add asset costs below to see domain breakdown.</p>

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {domains.map((d, i) => (
        <button
          key={d.domain_id}
          onClick={() => onDrill(d)}
          className="group bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold`}
              style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}>
              {d.domain_name[0]}
            </div>
            <ArrowUpRight size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-1 truncate">{d.domain_name}</p>
          <p className="text-xl font-bold text-gray-900 mb-2">{fmt(d.total_cost)}</p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Failed rows</span><span className="font-medium text-gray-700">{d.failed_rows.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Assets tracked</span><span className="font-medium text-gray-700">{d.configured_assets} / {d.asset_count}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Subdomain table ───────────────────────────────────────────────────────────

function SubdomainTable({ subdomains, onDrill }: { subdomains: SubdomainCost[]; onDrill: (s: SubdomainCost) => void }) {
  if (subdomains.length === 0)
    return <p className="text-sm text-gray-400 text-center py-10">No subdomains found for this domain with cost data.</p>

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            {['Subdomain', 'Domain', 'Estimated Cost', 'Failed Rows', 'Rule Runs', 'Assets Tracked', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {subdomains.map(s => (
            <tr key={s.subdomain_id} className="hover:bg-blue-50/30 cursor-pointer" onClick={() => onDrill(s)}>
              <td className="px-4 py-3 font-semibold text-gray-900 text-sm">{s.subdomain_name}</td>
              <td className="px-4 py-3 text-xs text-gray-500">{s.domain_name}</td>
              <td className="px-4 py-3 text-sm font-bold text-red-700">{s.total_cost > 0 ? fmt(s.total_cost) : <span className="text-gray-400 font-normal text-xs">—</span>}</td>
              <td className="px-4 py-3 text-xs text-gray-700">{s.failed_rows.toLocaleString()}</td>
              <td className="px-4 py-3 text-xs text-gray-700">{s.run_count.toLocaleString()}</td>
              <td className="px-4 py-3 text-xs text-gray-700">{s.configured_assets} / {s.asset_count}</td>
              <td className="px-4 py-3 text-right">
                <span className="text-blue-500 text-xs font-medium hover:underline flex items-center gap-1 justify-end">
                  Drill down <ChevronRight size={12} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Asset table — full filter / sort / paginate ───────────────────────────────

type SortCol = 'total_cost' | 'failed_rows_30d' | 'total_rows_scanned'
type SortDir = 'asc' | 'desc'
type PageSize = 10 | 25 | 50

function AssetTable({ assets }: { assets: AssetCost[] }) {
  const [domainFilter,    setDomainFilter]    = useState('')
  const [subdomainFilter, setSubdomainFilter] = useState('')
  const [nameSearch,      setNameSearch]      = useState('')
  const [sortCol,         setSortCol]         = useState<SortCol>('total_cost')
  const [sortDir,         setSortDir]         = useState<SortDir>('desc')
  const [page,            setPage]            = useState(1)
  const [pageSize,        setPageSize]        = useState<PageSize>(25)

  // Reset subdomain when domain changes
  useEffect(() => { setSubdomainFilter(''); setPage(1) }, [domainFilter])
  useEffect(() => { setPage(1) }, [subdomainFilter, nameSearch, sortCol, sortDir, pageSize])

  // Derive unique domains and subdomains from current asset list
  const domains = useMemo(() => {
    const map = new Map<string, string>()
    assets.forEach(a => { if (a.domain_id) map.set(a.domain_id, a.domain_name) })
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [assets])

  const subdomains = useMemo(() => {
    const map = new Map<string, string>()
    assets
      .filter(a => !domainFilter || a.domain_id === domainFilter)
      .forEach(a => { if (a.subdomain_id) map.set(a.subdomain_id, a.subdomain_name) })
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [assets, domainFilter])

  const filtered = useMemo(() => {
    let r = assets
    if (domainFilter)    r = r.filter(a => a.domain_id    === domainFilter)
    if (subdomainFilter) r = r.filter(a => a.subdomain_id === subdomainFilter)
    if (nameSearch) {
      const q = nameSearch.toLowerCase()
      r = r.filter(a =>
        a.sf_table_name.toLowerCase().includes(q) ||
        a.sf_schema_name.toLowerCase().includes(q)
      )
    }
    return r
  }, [assets, domainFilter, subdomainFilter, nameSearch])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortCol] ?? 0
      const vb = b[sortCol] ?? 0
      return sortDir === 'desc' ? vb - va : va - vb
    })
  }, [filtered, sortCol, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ChevronsUpDown size={11} className="text-gray-300 ml-1 inline" />
    return sortDir === 'desc'
      ? <ChevronDown size={11} className="text-blue-500 ml-1 inline" />
      : <ChevronUp   size={11} className="text-blue-500 ml-1 inline" />
  }

  const selCls = 'px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Filter toolbar */}
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
        {/* Domain */}
        <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)} className={selCls}>
          <option value="">All Domains</option>
          {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {/* Subdomain */}
        <select value={subdomainFilter} onChange={e => setSubdomainFilter(e.target.value)}
          disabled={subdomains.length === 0} className={selCls}>
          <option value="">All Subdomains</option>
          {subdomains.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {/* Table search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={nameSearch} onChange={e => setNameSearch(e.target.value)}
            placeholder="Search table name…"
            className="pl-7 pr-7 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
          {nameSearch && (
            <button onClick={() => setNameSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Result count */}
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          {filtered.length !== assets.length && ` of ${assets.length}`}
        </span>

        {/* Rows per page */}
        <select value={pageSize} onChange={e => setPageSize(Number(e.target.value) as PageSize)} className={selCls}>
          <option value={10}>10 / page</option>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
        </select>
      </div>

      {/* Table */}
      {paginated.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-gray-400">
          No tables match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Table</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Domain</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Subdomain</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cost / Row</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                    onClick={() => toggleSort('failed_rows_30d')}>
                  Failed Rows <SortIcon col="failed_rows_30d" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                    onClick={() => toggleSort('total_rows_scanned')}>
                  Total Rows <SortIcon col="total_rows_scanned" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                    onClick={() => toggleSort('total_cost')}>
                  Est. Cost <SortIcon col="total_cost" />
                </th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(a => (
                <tr key={a.asset_id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 text-xs">{a.sf_table_name}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{a.sf_schema_name}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.domain_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.subdomain_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {a.cost_per_failed_row != null
                      ? fmtSmall(a.cost_per_failed_row)
                      : <span className="text-gray-300 text-[10px]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-gray-800">
                    {a.failed_rows_30d > 0
                      ? <span className="text-orange-700">{a.failed_rows_30d.toLocaleString()}</span>
                      : <span className="text-gray-400">0</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{a.total_rows_scanned.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {a.total_cost > 0
                      ? <span className="text-xs font-bold text-red-700">{fmt(a.total_cost)}</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/tables/${a.asset_id}`}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end whitespace-nowrap">
                      View <ChevronRight size={11} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
          <span className="text-xs text-gray-500">
            Page {safePage} of {totalPages} &mdash; {sorted.length} row{sorted.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={safePage === 1}
              className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed">
              «
            </button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
              className="p-1 border border-gray-200 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft size={13} />
            </button>
            {/* Page number pills */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(safePage - 2, totalPages - 4))
              const p = start + i
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`px-2.5 py-1 text-xs border rounded transition-colors ${
                    p === safePage
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 hover:bg-white text-gray-600'
                  }`}>
                  {p}
                </button>
              )
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="p-1 border border-gray-200 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight size={13} />
            </button>
            <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages}
              className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed">
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Asset picker (for cost config) ────────────────────────────────────────────

function AssetPicker({ options, excluded, onSelect }: { options: AssetOption[]; excluded: Set<string>; onSelect: (a: AssetOption) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref               = useRef<HTMLDivElement>(null)

  const filtered = options.filter(
    o => !excluded.has(o.asset_id) &&
      (!query || o.label.toLowerCase().includes(query.toLowerCase()) || o.domain_name.toLowerCase().includes(query.toLowerCase()))
  ).slice(0, 50)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
        <Search size={13} className="ml-2.5 text-gray-400 shrink-0" />
        <input type="text" value={query} placeholder="Search asset by name or domain…"
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="flex-1 px-2 py-2 text-sm outline-none bg-transparent" />
        {query && <button onClick={() => { setQuery(''); setOpen(false) }} className="mr-2 text-gray-400 hover:text-gray-600"><X size={13} /></button>}
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {filtered.length === 0
            ? <p className="px-4 py-6 text-xs text-gray-400 text-center">
                {options.filter(o => !excluded.has(o.asset_id)).length === 0 ? 'All assets are already configured' : 'No assets match your search'}
              </p>
            : filtered.map(o => (
                <button key={o.asset_id} onMouseDown={() => { onSelect(o); setQuery(''); setOpen(false) }}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                  <p className="text-sm font-medium text-gray-800">{o.label}</p>
                  <p className="text-xs text-gray-400">{o.domain_name}</p>
                </button>
              ))
          }
        </div>
      )}
    </div>
  )
}

// ── Add cost config inline row ─────────────────────────────────────────────────

function AddCostConfigRow({ allAssets, configured, onSaved, onCancel }: {
  allAssets: AssetOption[]; configured: Set<string>
  onSaved: (c: CostConfig) => void; onCancel: () => void
}) {
  const [selected, setSelected] = useState<AssetOption | null>(null)
  const [costVal, setCostVal]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const canSave = !!selected && costVal !== '' && Number(costVal) >= 0

  const handleSave = async () => {
    if (!selected || !canSave) return
    setSaving(true); setError('')
    try {
      await costApi.updateConfig(selected.asset_id, { cost_per_failed_row: Number(costVal) })
      onSaved({ asset_id: selected.asset_id, asset_name: selected.label, domain_name: selected.domain_name, cost_per_failed_row: Number(costVal) })
    } catch { setError('Failed to save.'); setSaving(false) }
  }

  return (
    <tr className="bg-blue-50/40 border-b border-blue-100">
      <td className="px-4 py-3" colSpan={2}>
        <div className="flex items-center gap-3">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex-1 max-w-sm">
            <AssetPicker options={allAssets} excluded={configured} onSelect={setSelected} />
          </div>
          {selected && <span className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded-lg font-medium truncate max-w-[180px]">{selected.label}</span>}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="relative w-36">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">$</span>
          <input type="number" min={0} step={0.01} value={costVal} onChange={e => setCostVal(e.target.value)}
            placeholder="e.g. 5.00"
            className="w-full pl-6 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button onClick={handleSave} disabled={!canSave || saving}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Save
          </button>
          <button onClick={onCancel} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800">Cancel</button>
        </div>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExecutivePage() {
  const [period, setPeriod]               = useState<Period>('30')
  const [summary, setSummary]             = useState<CostSummary | null>(null)
  const [domainCosts, setDomainCosts]     = useState<DomainCost[]>([])
  const [subdomainCosts, setSubdomainCosts] = useState<SubdomainCost[]>([])
  const [assetCosts, setAssetCosts]       = useState<AssetCost[]>([])
  const [configs, setConfigs]             = useState<CostConfig[]>([])
  const [allAssets, setAllAssets]         = useState<AssetOption[]>([])
  const [openIncidents, setOpenIncidents] = useState<number>(0)
  const [loading, setLoading]             = useState(true)
  const [drillDomain, setDrillDomain]     = useState<DomainCost | null>(null)
  const [drillSubdomain, setDrillSubdomain] = useState<SubdomainCost | null>(null)
  const [showAddRow, setShowAddRow]       = useState(false)
  const [editValues, setEditValues]       = useState<Record<string, string>>({})
  const [savingConfig, setSavingConfig]   = useState<string | null>(null)
  const [removingConfig, setRemovingConfig] = useState<string | null>(null)

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadOverview = useCallback(async (days: string) => {
    const [overviewRes, statsRes] = await Promise.all([
      costApi.overview({ days }),
      incidentsApi.stats(),
    ])
    const d = overviewRes.data
    setSummary(d?.summary ?? null)
    setDomainCosts(Array.isArray(d?.domain_costs) ? d.domain_costs : [])
    setAssetCosts(Array.isArray(d?.asset_costs) ? d.asset_costs : [])
    setOpenIncidents((statsRes.data as IncidentStats)?.open_count ?? 0)
  }, [])

  const loadSubdomains = useCallback(async (days: string, domainId: string) => {
    const res = await costApi.bySubdomain({ days, domain_id: domainId })
    setSubdomainCosts(Array.isArray(res.data) ? res.data : [])
  }, [])

  const loadAssets = useCallback(async (days: string, domainId?: string, subdomainId?: string) => {
    const params: Record<string, string> = { days }
    if (domainId) params.domain_id = domainId
    if (subdomainId) params.subdomain_id = subdomainId
    const res = await costApi.byAsset(params)
    setAssetCosts(Array.isArray(res.data) ? res.data : [])
  }, [])

  const loadConfigs = useCallback(async () => {
    const [assetsRes, configsRes] = await Promise.all([assetsApi.listEnriched(), costApi.listConfigs()])
    const enriched: any[] = Array.isArray(assetsRes.data) ? assetsRes.data : (assetsRes.data?.items ?? [])
    const assetMap: Record<string, { label: string; domain_name: string }> = {}
    enriched.forEach((a: any) => { assetMap[a.asset_id] = { label: `${a.sf_schema_name}.${a.sf_table_name}`, domain_name: a.domain_name ?? '' } })
    setAllAssets(enriched.map((a: any) => ({ asset_id: a.asset_id, label: `${a.sf_schema_name}.${a.sf_table_name}`, domain_name: a.domain_name ?? '' })))
    const rawConfigs: any[] = Array.isArray(configsRes.data) ? configsRes.data : []
    setConfigs(rawConfigs.filter(c => c.asset_id && c.cost_per_failed_row != null).map(c => ({
      asset_id: c.asset_id,
      asset_name: assetMap[c.asset_id]?.label ?? c.asset_id,
      domain_name: assetMap[c.asset_id]?.domain_name ?? '',
      cost_per_failed_row: c.cost_per_failed_row,
    })))
  }, [])

  const fullLoad = useCallback(async (days: string, domainId?: string, subdomainId?: string) => {
    setLoading(true)
    try {
      if (!domainId && !subdomainId) {
        await Promise.all([loadOverview(days), loadConfigs()])
      } else {
        await Promise.all([
          loadOverview(days),
          loadSubdomains(days, domainId!),
          loadAssets(days, domainId, subdomainId),
          loadConfigs(),
        ])
      }
    } finally {
      setLoading(false)
    }
  }, [loadOverview, loadSubdomains, loadAssets, loadConfigs])

  useEffect(() => {
    fullLoad(period, drillDomain?.domain_id, drillSubdomain?.subdomain_id)
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drill-down handlers ─────────────────────────────────────────────────────

  const drillIntoDomain = async (d: DomainCost) => {
    setDrillDomain(d); setDrillSubdomain(null)
    setLoading(true)
    try {
      await Promise.all([loadSubdomains(period, d.domain_id), loadAssets(period, d.domain_id)])
    } finally { setLoading(false) }
  }

  const drillIntoSubdomain = async (s: SubdomainCost) => {
    setDrillSubdomain(s)
    setLoading(true)
    try { await loadAssets(period, s.domain_id, s.subdomain_id) }
    finally { setLoading(false) }
  }

  const goGlobal = async () => {
    setDrillDomain(null); setDrillSubdomain(null)
    setLoading(true)
    try { await loadAssets(period) }
    finally { setLoading(false) }
  }

  const goDomain = async () => {
    if (!drillDomain) return
    setDrillSubdomain(null)
    setLoading(true)
    try { await loadAssets(period, drillDomain.domain_id) }
    finally { setLoading(false) }
  }

  const handlePeriodChange = (p: Period) => {
    setPeriod(p)
    fullLoad(p, drillDomain?.domain_id, drillSubdomain?.subdomain_id)
  }

  // ── Cost config handlers ────────────────────────────────────────────────────

  const refreshKpis = async () => {
    const res = await costApi.overview({ days: period })
    const d = res.data
    setSummary(d?.summary ?? null)
    setDomainCosts(Array.isArray(d?.domain_costs) ? d.domain_costs : [])
    setAssetCosts(Array.isArray(d?.asset_costs) ? d.asset_costs : [])
  }

  const handleConfigSave = async (assetId: string) => {
    const val = editValues[assetId]
    if (val === undefined) return
    setSavingConfig(assetId)
    try {
      await costApi.updateConfig(assetId, { cost_per_failed_row: Number(val) })
      setEditValues(prev => { const n = { ...prev }; delete n[assetId]; return n })
      setConfigs(prev => prev.map(c => c.asset_id === assetId ? { ...c, cost_per_failed_row: Number(val) } : c))
      await refreshKpis()
    } finally { setSavingConfig(null) }
  }

  const handleRemove = async (assetId: string) => {
    if (!confirm('Remove cost configuration for this asset?')) return
    setRemovingConfig(assetId)
    try {
      await costApi.deleteConfig(assetId)
      setConfigs(prev => prev.filter(c => c.asset_id !== assetId))
      await refreshKpis()
    } finally { setRemovingConfig(null) }
  }

  const configuredIds = new Set(configs.map(c => c.asset_id))

  // ── Chart data ──────────────────────────────────────────────────────────────

  const chartData = drillDomain && !drillSubdomain
    ? subdomainCosts.map(s => ({ name: s.subdomain_name, total_cost: s.total_cost }))
    : domainCosts.map(d => ({ name: d.domain_name, total_cost: d.total_cost }))

  const chartTitle = drillDomain && !drillSubdomain
    ? `Cost by Subdomain — ${drillDomain.domain_name}`
    : 'Cost by Domain'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cost Impact Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Financial impact of data quality failures — drill from global to domain, subdomain, and table level</p>
      </div>

      <HowItWorks
        storageKey="executive"
        title="How the Cost Impact Dashboard Works"
        steps={[
          { icon: <Settings size={13} />, title: 'Configure Cost Parameters', description: 'Add cost-per-failed-row for specific assets in the configuration section below. Only assets with a measurable bad-data cost need to be tracked.' },
          { icon: <DollarSign size={13} />, title: 'Drill Down', description: 'Click any domain card to drill into its subdomains. Click any subdomain row to see the individual table breakdown.' },
          { icon: <ShieldCheck size={13} />, title: 'Filter by Period', description: 'Switch between 7, 30, and 90-day windows to compare cost trends over time.' },
          { icon: <BarChart2 size={13} />, title: 'Cost of Bad Data', description: 'Total cost = failed rows × cost per row. Estimated cost averted = passed rule runs × heuristic incident cost.' },
          { icon: <TrendingUp size={13} />, title: 'Table Search', description: 'Use the search box to filter the asset table at any drill level by table name, schema, or subdomain.' },
        ]}
      />

      {/* Filter bar */}
      <FilterBar period={period} onPeriod={handlePeriodChange} />

      {/* KPI row */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse bg-white rounded-xl border border-gray-200 p-5 h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KpiCard label="Total Cost of Bad Data" value={summary ? fmt(summary.total_cost_30d) : '—'} sub={`Last ${period} days`}
            icon={<DollarSign size={22} className="text-red-600" />} accent="bg-red-50" />
          <KpiCard label="Cost Averted by DQ Rules" value={summary ? fmt(summary.cost_averted) : '—'} sub={`Last ${period} days`}
            icon={<TrendingDown size={22} className="text-green-600" />} accent="bg-green-50" />
          <KpiCard label="Total Failed Rows" value={summary ? summary.total_failed_rows.toLocaleString() : '—'} sub="Across monitored assets"
            icon={<AlertCircle size={22} className="text-orange-600" />} accent="bg-orange-50" />
          <KpiCard label="Open Critical Incidents" value={String(openIncidents)} sub={`${summary?.configured_assets ?? 0} assets with cost config`}
            icon={<BarChart2 size={22} className="text-blue-600" />} accent="bg-blue-50" />
        </div>
      )}

      {/* Breadcrumb */}
      <Breadcrumb domain={drillDomain} subdomain={drillSubdomain} onGlobal={goGlobal} onDomain={goDomain} />

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">{chartTitle}</h2>
        {loading ? (
          <div className="animate-pulse h-48 bg-gray-100 rounded-lg" />
        ) : chartData.filter(d => d.total_cost > 0).length === 0 ? (
          <div className="flex items-center justify-center h-36 text-gray-400 text-sm">
            No cost data — configure asset costs below to see this chart
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={v => `$${((v as number) / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: unknown) => [fmt(value as number), 'Estimated Cost']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="total_cost" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Domain cards — global view */}
      {!drillDomain && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Domain Breakdown <span className="text-gray-400 font-normal text-xs ml-1">— click to drill down</span></h2>
          {loading
            ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="animate-pulse bg-white rounded-xl border border-gray-200 h-36" />)}</div>
            : <DomainCards domains={domainCosts} onDrill={drillIntoDomain} />}
        </div>
      )}

      {/* Subdomain table — domain drill level */}
      {drillDomain && !drillSubdomain && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Subdomains in <span className="text-blue-700">{drillDomain.domain_name}</span>
            <span className="text-gray-400 font-normal text-xs ml-1">— click to drill down</span>
          </h2>
          {loading
            ? <div className="animate-pulse bg-white rounded-xl border border-gray-200 h-40" />
            : <SubdomainTable subdomains={subdomainCosts} onDrill={drillIntoSubdomain} />}
        </div>
      )}

      {/* Asset table — all levels */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          {drillSubdomain
            ? <>Tables in <span className="text-blue-700">{drillSubdomain.subdomain_name}</span></>
            : drillDomain
            ? <>Tables in <span className="text-blue-700">{drillDomain.domain_name}</span></>
            : 'Tables'}
          <span className="ml-2 text-xs text-gray-400 font-normal">{assetCosts.length} asset{assetCosts.length !== 1 ? 's' : ''} loaded</span>
        </h2>
        {loading
          ? <div className="animate-pulse bg-white rounded-xl border border-gray-200 h-40" />
          : <AssetTable assets={assetCosts} />}
      </div>

      {/* Asset Cost Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Asset Cost Configuration</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Only configure assets where bad data has a measurable dollar impact.
              {configs.length > 0 && ` ${configs.length} asset${configs.length !== 1 ? 's' : ''} configured.`}
            </p>
          </div>
          {!showAddRow && !loading && (
            <button onClick={() => setShowAddRow(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap">
              <Plus size={12} /> Add Asset Cost
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="animate-pulse h-10 bg-gray-100 rounded-lg" />)}</div>
        ) : (configs.length > 0 || showAddRow) ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Asset</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Domain</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Cost per Failed Row (USD)</th>
                <th className="px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {showAddRow && (
                <AddCostConfigRow allAssets={allAssets} configured={configuredIds}
                  onSaved={newConfig => {
                    setConfigs(prev => [...prev, newConfig])
                    setShowAddRow(false)
                    refreshKpis()
                  }}
                  onCancel={() => setShowAddRow(false)} />
              )}
              {configs.map(c => {
                const savedVal   = String(c.cost_per_failed_row)
                const editing    = editValues[c.asset_id] !== undefined
                const val        = editing ? editValues[c.asset_id] : savedVal
                const isDirty    = editing && val !== savedVal
                const isSaving   = savingConfig === c.asset_id
                const isRemoving = removingConfig === c.asset_id
                return (
                  <tr key={c.asset_id} className="hover:bg-gray-50/40">
                    <td className="px-4 py-3 text-xs font-medium text-gray-800">{c.asset_name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.domain_name}</td>
                    <td className="px-4 py-3">
                      <div className="relative w-36">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">$</span>
                        <input type="number" min={0} step={0.01} value={val}
                          onChange={e => setEditValues(prev => ({ ...prev, [c.asset_id]: e.target.value }))}
                          className="w-full pl-6 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isDirty && (
                          <button onClick={() => handleConfigSave(c.asset_id)} disabled={isSaving}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                            {isSaving ? <Loader2 size={10} className="animate-spin" /> : <Pencil size={10} />} Save
                          </button>
                        )}
                        {!isDirty && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 size={10} /> Saved
                          </span>
                        )}
                        <button onClick={() => handleRemove(c.asset_id)} disabled={isRemoving}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
                          title="Remove cost config">
                          {isRemoving ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-6 py-12 text-center">
            <DollarSign size={36} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600 mb-1">No asset costs configured yet</p>
            <p className="text-xs text-gray-400 mb-5 max-w-sm mx-auto">
              Add only the tables where bad data has a measurable business impact. You don&apos;t need to configure every asset.
            </p>
            <button onClick={() => setShowAddRow(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus size={13} /> Add Asset Cost
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
