'use client'
import { useState, useRef, useEffect } from 'react'
import { Bookmark, Trash2, Plus, ChevronDown } from 'lucide-react'
import { catalogApi } from '@/services/apiClient'

interface SavedSearch {
  search_id: string
  name: string
  query?: string
  filters?: Record<string, string>
}

interface Props {
  currentQuery: string
  currentFilters: Record<string, string | undefined>
  onLoad: (query: string, filters: Record<string, string>) => void
}

export default function SavedSearches({ currentQuery, currentFilters, onLoad }: Props) {
  const [open, setOpen]         = useState(false)
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [saving, setSaving]     = useState(false)
  const [newName, setNewName]   = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    catalogApi.savedSearches.list()
      .then(r => setSearches(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSearches([]))
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSave = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await catalogApi.savedSearches.save({
        name: newName.trim(),
        query: currentQuery,
        filters: Object.fromEntries(
          Object.entries(currentFilters).filter(([, v]) => v != null)
        ) as Record<string, string>,
      })
      setNewName('')
      const r = await catalogApi.savedSearches.list()
      setSearches(Array.isArray(r.data) ? r.data : [])
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await catalogApi.savedSearches.delete(id)
    setSearches(s => s.filter(x => x.search_id !== id))
  }

  const handleLoad = (s: SavedSearch) => {
    onLoad(s.query ?? '', s.filters ?? {})
    setOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:border-blue-300 text-gray-600 transition-colors"
      >
        <Bookmark size={14} />
        Saved
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-30">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2">Save current search</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search name..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleSave}
                disabled={saving || !newName.trim()}
                className="text-xs bg-blue-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                <Plus size={12} />
                Save
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {searches.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No saved searches yet</p>
            ) : (
              searches.map(s => (
                <div key={s.search_id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group">
                  <button
                    onClick={() => handleLoad(s)}
                    className="flex-1 text-left text-sm text-gray-700 hover:text-blue-600 truncate"
                  >
                    {s.name}
                    {s.query && (
                      <span className="text-xs text-gray-400 ml-1">&ldquo;{s.query}&rdquo;</span>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(s.search_id)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
