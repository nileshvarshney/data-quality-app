'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch, Search, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { lineageApi } from '@/services/apiClient'
import type { DataObjectNode } from './lineageTypes'

export interface FilterState {
  object_type?: string
  schema?: string
  domain?: string
}

interface Props {
  depth: string
  onDepthChange: (depth: string) => void
  onFilterChange: (filters: FilterState) => void
  onNodeSelect: (node: DataObjectNode) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
}

const DEPTH_OPTIONS = ['1', '2', '3', 'all'] as const

export default function LineageToolbar({
  depth,
  onDepthChange,
  onFilterChange,
  onNodeSelect,
  onZoomIn,
  onZoomOut,
  onFitView,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DataObjectNode[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>({})
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Dismiss dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setDropdownOpen(false)
      return
    }
    try {
      const resp = await lineageApi.search({ q })
      const data = resp.data as { results: DataObjectNode[]; total: number }
      setResults(data.results ?? [])
      setDropdownOpen(true)
    } catch {
      setResults([])
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(query)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, doSearch])

  function handleResultClick(node: DataObjectNode) {
    setDropdownOpen(false)
    setQuery(node.object_name)
    onNodeSelect(node)
  }

  function updateFilters(patch: Partial<FilterState>) {
    const next = { ...filters, ...patch }
    setFilters(next)
    onFilterChange(next)
  }

  function clearSearch() {
    setQuery('')
    setResults([])
    setDropdownOpen(false)
  }

  return (
    <div className="px-4 py-2.5 border-b border-slate-700 bg-slate-800/80 flex items-center gap-3 flex-wrap">
      {/* Title */}
      <GitBranch size={14} className="text-indigo-400 shrink-0" />
      <span className="text-sm font-semibold text-slate-200 shrink-0">Data Lineage</span>

      {/* Search */}
      <div ref={searchRef} className="relative flex-1 min-w-[160px] max-w-xs">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setDropdownOpen(true)}
          placeholder="Search objects…"
          className="w-full pl-7 pr-7 py-1.5 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            <X size={10} />
          </button>
        )}
        {dropdownOpen && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-xl z-50 max-h-48 overflow-y-auto">
            {results.map(node => (
              <button
                key={node.object_id}
                onMouseDown={() => handleResultClick(node)}
                className="w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors"
              >
                <div className="text-xs text-slate-200 font-medium truncate">{node.object_name}</div>
                <div className="text-[10px] text-slate-500 truncate">
                  {node.database_name} · {node.schema_name}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter: Object Type */}
      <select
        value={filters.object_type ?? ''}
        onChange={e => updateFilters({ object_type: e.target.value || undefined })}
        className="bg-slate-700 border border-slate-600 rounded text-xs text-slate-300 px-2 py-1.5 focus:outline-none focus:border-indigo-500"
      >
        <option value="">All Types</option>
        <option value="TABLE">TABLE</option>
        <option value="VIEW">VIEW</option>
        <option value="MATERIALIZED_VIEW">MV</option>
      </select>

      {/* Filter: Schema */}
      <input
        type="text"
        placeholder="Schema…"
        value={filters.schema ?? ''}
        onChange={e => updateFilters({ schema: e.target.value || undefined })}
        className="bg-slate-700 border border-slate-600 rounded text-xs text-slate-300 px-2 py-1.5 w-24 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
      />

      {/* Filter: Domain */}
      <input
        type="text"
        placeholder="Domain…"
        value={filters.domain ?? ''}
        onChange={e => updateFilters({ domain: e.target.value || undefined })}
        className="bg-slate-700 border border-slate-600 rounded text-xs text-slate-300 px-2 py-1.5 w-24 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
      />

      {/* Depth selector */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-slate-500 mr-1">Depth:</span>
        {DEPTH_OPTIONS.map(d => (
          <button
            key={d}
            onClick={() => onDepthChange(d)}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              depth === d
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
            }`}
          >
            {d === 'all' ? '∞' : d}
          </button>
        ))}
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        <button
          onClick={onZoomIn}
          title="Zoom in"
          className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ZoomIn size={12} />
        </button>
        <button
          onClick={onZoomOut}
          title="Zoom out"
          className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ZoomOut size={12} />
        </button>
        <button
          onClick={onFitView}
          title="Fit view"
          className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Maximize2 size={12} />
        </button>
      </div>
    </div>
  )
}
