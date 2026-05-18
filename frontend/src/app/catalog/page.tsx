'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, Loader2, LayoutGrid, List, SlidersHorizontal, Database, Tag, BookOpen, Package, LayoutList } from 'lucide-react'
import clsx from 'clsx'
import { catalogApi } from '@/services/apiClient'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import CatalogFacets from '@/components/catalog/CatalogFacets'
import CatalogResultCard, { type CatalogItem } from '@/components/catalog/CatalogResultCard'
import CatalogResultRow from '@/components/catalog/CatalogResultRow'
import QuickFilters from '@/components/catalog/QuickFilters'
import SavedSearches from '@/components/catalog/SavedSearches'
import HowItWorks from '@/components/common/HowItWorks'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Facets {
  domains: { id: string; name: string; count: number }[]
  classifications: { value: string; count: number }[]
  certifications: { value: string; count: number }[]
  tags: { name: string; count: number }[]
}

interface SearchResponse {
  results: CatalogItem[]
  total: number
  page: number
  page_size: number
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex gap-3">
        <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      </div>
    </div>
  )
}

// ── Sort options ──────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'relevance',        label: 'Relevance' },
  { value: 'quality',          label: 'Quality Score' },
  { value: 'trust',            label: 'Trust Score' },
  { value: 'alphabetical',     label: 'A → Z' },
  { value: 'alphabetical_desc',label: 'Z → A' },
  { value: 'updated',          label: 'Last Updated' },
]

const ENTITY_TYPES = [
  { value: undefined,      label: 'All',           icon: <LayoutList size={13} /> },
  { value: 'asset',        label: 'Tables',         icon: <Database   size={13} /> },
  { value: 'glossary',     label: 'Glossary Terms', icon: <BookOpen   size={13} /> },
  { value: 'data_product', label: 'Data Products',  icon: <Package    size={13} /> },
]

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void
}) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
    const p = page <= 3 ? i + 1 : page - 2 + i
    return p >= 1 && p <= totalPages ? p : null
  }).filter(Boolean) as number[]

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
        Prev
      </button>
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)}
          className={clsx('px-3 py-1.5 text-sm rounded-lg border transition-colors',
            p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-gray-50')}>
          {p}
        </button>
      ))}
      <button onClick={() => onChange(page + 1)} disabled={page >= totalPages}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
        Next
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const user         = useCurrentUser()

  const [query,    setQuery]    = useState(searchParams.get('q') ?? '')
  const [sort,     setSort]     = useState(searchParams.get('sort') ?? 'relevance')
  const [viewMode, setViewMode] = useState<'card' | 'table'>(
    (searchParams.get('view') as 'card' | 'table') ?? 'card'
  )
  const [page, setPage] = useState(Number(searchParams.get('page') ?? 1))
  const [filters, setFilters] = useState<Record<string, string | undefined>>({
    type:           searchParams.get('type')           ?? undefined,
    domain_id:      searchParams.get('domain_id')      ?? undefined,
    classification: searchParams.get('classification') ?? undefined,
    certification:  searchParams.get('certification')  ?? undefined,
    owner:          searchParams.get('owner')          ?? undefined,
    tag:            searchParams.get('tag')            ?? undefined,
  })

  const [results,        setResults]        = useState<CatalogItem[]>([])
  const [total,          setTotal]          = useState(0)
  const [facets,         setFacets]         = useState<Facets>({ domains: [], classifications: [], certifications: [], tags: [] })
  const [loading,        setLoading]        = useState(false)
  const [facetLoading,   setFacetLoading]   = useState(true)
  const [popular,        setPopular]        = useState<CatalogItem[]>([])
  const [popularLoading, setPopularLoading] = useState(true)
  const [hasSearched,    setHasSearched]    = useState(!!searchParams.get('q'))
  const [featuredPage,   setFeaturedPage]   = useState(1)
  const FEATURED_PAGE_SIZE = 10

  // -- Sync all state → URL on any change -------------------------------------
  useEffect(() => {
    const params = new URLSearchParams()
    if (query)    params.set('q',    query)
    if (sort && sort !== 'relevance') params.set('sort', sort)
    if (viewMode && viewMode !== 'card') params.set('view', viewMode)
    if (page > 1) params.set('page', String(page))
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    const newUrl = `/catalog${params.toString() ? `?${params.toString()}` : ''}`
    router.replace(newUrl, { scroll: false })
  }, [query, sort, viewMode, page, filters, router])

  // -- Load popular on mount ---------------------------------------------------
  useEffect(() => {
    catalogApi.popular()
      .then(r => setPopular(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPopular([]))
      .finally(() => setPopularLoading(false))
  }, [])

  // -- Load facets independently -----------------------------------------------
  useEffect(() => {
    setFacetLoading(true)
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null))
    catalogApi.facets(params)
      .then(r => setFacets(r.data))
      .catch(() => {})
      .finally(() => setFacetLoading(false))
  }, [filters])

  // -- Debounced search -------------------------------------------------------
  useEffect(() => {
    const hasFilters = Object.values(filters).some(v => v != null)
    if (!query.trim() && !hasFilters) {
      setHasSearched(false)
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      setHasSearched(true)
      try {
        const params: Record<string, string | number> = { sort, page, page_size: 20 }
        if (query.trim()) params.q = query
        Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
        const res = await catalogApi.search(params)
        const body: SearchResponse = res.data
        setResults(body.results ?? [])
        setTotal(body.total ?? 0)
      } catch {
        setResults([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, sort, page, filters])

  // -- Handlers ---------------------------------------------------------------
  const handleFilterChange = (key: string, value: string | undefined) => {
    setPage(1)
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleLoadSaved = (q: string, savedFilters: Record<string, string>) => {
    setQuery(q)
    setFilters(f => ({ ...f, ...savedFilters }))
    setPage(1)
  }

  // suppress unused warning for facetLoading
  void facetLoading

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Data Catalog</h1>
        <p className="text-gray-500 text-sm mt-1">Search across assets, glossary terms, and data products</p>
      </div>

      <HowItWorks
        storageKey="catalog"
        title="How Data Catalog Works"
        steps={[
          { icon: <Database size={13} />, title: 'Register Tables',    description: 'Add Snowflake tables as data assets under a domain.' },
          { icon: <Search   size={13} />, title: 'Search & Discover',  description: 'Full-text search across assets, glossary terms, and data products.' },
          { icon: <SlidersHorizontal size={13} />, title: 'Filter & Sort', description: 'Narrow by domain, classification, certification, or tag.' },
          { icon: <Tag      size={13} />, title: 'View Details',       description: 'Click any result to see quality scores, lineage, and certifications.' },
        ]}
      />

      {/* Search bar row */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search assets, glossary terms, data products..."
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1) }}
            className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
          />
          {loading && <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />}
        </div>

        <select value={sort} onChange={e => { setSort(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div className="flex border border-gray-200 rounded-xl overflow-hidden">
          <button onClick={() => setViewMode('card')}
            className={clsx('p-2.5', viewMode === 'card' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50')}>
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setViewMode('table')}
            className={clsx('p-2.5', viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50')}>
            <List size={16} />
          </button>
        </div>

        <SavedSearches currentQuery={query} currentFilters={filters} onLoad={handleLoadSaved} />
      </div>

      {/* Quick filters */}
      <QuickFilters activeFilters={filters} userEmail={user?.email ?? ''} onChange={handleFilterChange} />

      {/* Entity type tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {ENTITY_TYPES.map(et => {
          const active = filters.type === et.value
          return (
            <button
              key={et.value ?? 'all'}
              onClick={() => handleFilterChange('type', active ? undefined : et.value)}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              )}
            >
              {et.icon}{et.label}
            </button>
          )
        })}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        <CatalogFacets
          facets={facets}
          filters={{
            domain_id:      filters.domain_id,
            classification: filters.classification,
            certification:  filters.certification,
            tag:            filters.tag,
          }}
          onChange={(key, value) => handleFilterChange(key, value)}
        />

        <div className="flex-1 min-w-0">
          {hasSearched ? (
            loading ? (
              <div className={viewMode === 'card' ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : 'space-y-2'}>
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <Search size={28} className="text-gray-400" />
                </div>
                <p className="text-base font-semibold text-gray-800">No results found</p>
                <p className="text-sm text-gray-400 mt-1">Try a different search term or filter</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  {total} result{total !== 1 ? 's' : ''}{query ? ` for "${query}"` : ''}
                </p>
                {viewMode === 'card' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {results.map(item => <CatalogResultCard key={item.id} item={item} />)}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          {['Name', 'Type', 'Domain', 'Owner', 'Quality', 'Certification', 'Rating'].map(h => (
                            <th key={h} className="text-left text-xs font-semibold text-gray-500 px-3 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map(item => <CatalogResultRow key={item.id} item={item} />)}
                      </tbody>
                    </table>
                  </div>
                )}
                <Pagination page={page} total={total} pageSize={20}
                  onChange={p => setPage(p)} />
              </>
            )
          ) : (
            popularLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : popular.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <Database size={28} className="text-gray-400" />
                </div>
                <p className="text-base font-semibold text-gray-800">No data assets registered yet</p>
                <p className="text-sm text-gray-400 mt-1">Register your first Snowflake table to get started</p>
                <a href="/assets" className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                  Register your first table →
                </a>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-gray-700">
                    {popular.some(p => (p as any).usage_count > 0) ? 'Popular Assets' : 'Featured Assets'}
                  </h2>
                  <span className="text-xs text-gray-400">{popular.length} assets</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {['Name', 'Type', 'Domain', 'Owner', 'Quality', 'Certification', 'Rating'].map(h => (
                          <th key={h} className="text-left text-[11px] font-semibold text-gray-500 px-3 py-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {popular
                        .slice((featuredPage - 1) * FEATURED_PAGE_SIZE, featuredPage * FEATURED_PAGE_SIZE)
                        .map(item => <CatalogResultRow key={item.id} item={item} />)}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={featuredPage}
                  total={popular.length}
                  pageSize={FEATURED_PAGE_SIZE}
                  onChange={p => setFeaturedPage(p)}
                />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
