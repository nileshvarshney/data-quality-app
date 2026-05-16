'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { catalogApi } from '@/services/apiClient'
import { Search, Database, BookOpen, Package, Globe, Loader2, Filter, Tag } from 'lucide-react'
import clsx from 'clsx'
import HowItWorks from '@/components/common/HowItWorks'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogResult {
  id: string
  entity_type: 'asset' | 'term' | 'product'
  name: string
  description: string | null
  domain: string | null
  owner: string | null
  extra?: Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENTITY_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  asset:        { label: 'Asset',        icon: <Database size={12} />, cls: 'bg-blue-100 text-blue-700' },
  glossary:     { label: 'Glossary',     icon: <BookOpen size={12} />, cls: 'bg-purple-100 text-purple-700' },
  data_product: { label: 'Data Product', icon: <Package  size={12} />, cls: 'bg-green-100 text-green-700' },
  // legacy aliases
  term:    { label: 'Glossary',     icon: <BookOpen size={12} />, cls: 'bg-purple-100 text-purple-700' },
  product: { label: 'Data Product', icon: <Package  size={12} />, cls: 'bg-green-100 text-green-700' },
}

const ENTITY_HREF: Record<string, (id: string) => string> = {
  asset:        id => `/dashboard/tables/${id}`,
  glossary:     () => '/glossary',
  data_product: () => '/data-products',
  term:         () => '/glossary',
  product:      () => '/data-products',
}

const FILTER_TABS = [
  { value: '',            label: 'All' },
  { value: 'asset',       label: 'Assets' },
  { value: 'glossary',    label: 'Glossary' },
  { value: 'data_product', label: 'Data Products' },
]

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
        <div className="h-5 w-16 bg-gray-200 rounded-full shrink-0" />
      </div>
    </div>
  )
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ item }: { item: CatalogResult }) {
  const cfg  = ENTITY_CONFIG[item.entity_type] ?? ENTITY_CONFIG.asset
  const href = (ENTITY_HREF[item.entity_type] ?? ENTITY_HREF.asset)(item.id)
  return (
    <Link href={href} className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{item.name}</p>
          {item.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
            {item.domain && (
              <span className="flex items-center gap-1">
                <Globe size={11} />
                {item.domain}
              </span>
            )}
            {item.owner && <span>Owner: {item.owner}</span>}
          </div>
        </div>
        <span className={clsx('flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full shrink-0', cfg.cls)}>
          {cfg.icon}
          {cfg.label}
        </span>
      </div>
    </Link>
  )
}

// ── Popular grid ──────────────────────────────────────────────────────────────

function PopularGrid({ items, innerRef }: { items: CatalogResult[]; innerRef?: React.Ref<HTMLDivElement> }) {
  if (items.length === 0) return null
  return (
    <div ref={innerRef} id="popular-assets">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Popular Assets</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(item => <ResultCard key={item.id} item={item} />)}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [query, setQuery]           = useState('')
  const [filter, setFilter]         = useState('')
  const [results, setResults]       = useState<CatalogResult[]>([])
  const [popular, setPopular]       = useState<CatalogResult[]>([])
  const [loading, setLoading]       = useState(false)
  const [popularLoading, setPopularLoading] = useState(true)
  const [searched, setSearched]     = useState(false)
  const popularRef = useRef<HTMLDivElement>(null)

  // Load popular assets on mount
  useEffect(() => {
    setPopularLoading(true)
    catalogApi.popular()
      .then(res => setPopular(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPopular([]))
      .finally(() => setPopularLoading(false))
  }, [])

  const doSearch = useCallback(async (q: string, type: string) => {
    if (!q.trim()) {
      setSearched(false)
      setResults([])
      return
    }
    setLoading(true)
    setSearched(true)
    try {
      const params: Record<string, string> = { q }
      if (type) params.type = type
      const res = await catalogApi.search(params)
      setResults(Array.isArray(res.data) ? res.data : [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => doSearch(query, filter), 300)
    return () => clearTimeout(timer)
  }, [query, filter, doSearch])

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
          { icon: <Database size={13} />, title: 'Register Tables', description: 'Add Snowflake tables as data assets under a domain and subdomain.' },
          { icon: <Search size={13} />, title: 'Search & Discover', description: 'Search across assets, glossary terms, and data products by name, description, or owner.' },
          { icon: <Filter size={13} />, title: 'Filter Results', description: 'Narrow results by entity type, domain, classification, or certification status.' },
          { icon: <Tag size={13} />, title: 'View Details', description: 'Click any result to see quality scores, lineage graph, column metadata, and certifications.' },
        ]}
      />

      {/* Search bar */}
      <div className="relative mb-5">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search assets, glossary terms, data products..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
        />
        {loading && (
          <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />
        )}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-6">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={clsx(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
              filter === tab.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results or popular */}
      {searched ? (
        loading ? (
          <div className="space-y-3">
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
          <div>
            <p className="text-xs text-gray-500 mb-3">{results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;</p>
            <div className="space-y-3">
              {results.map(item => <ResultCard key={item.id} item={item} />)}
            </div>
          </div>
        )
      ) : (
        popularLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <PopularGrid items={popular} innerRef={popularRef} />
        )
      )}
    </div>
  )
}
