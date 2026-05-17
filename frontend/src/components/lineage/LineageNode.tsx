'use client'
import { useState } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import type { LineageAsset } from '@/types/lineage'
import { assetsApi } from '@/services/apiClient'

export type LineageNodeData = LineageAsset & {
  isBase: boolean
  depth: number
  isExpanded: boolean
  isExpandLoading: boolean
  onExpand?: () => void
}

interface ColumnDetail {
  column_name: string
  data_type: string | null
  is_primary_key?: boolean
  is_nullable?: boolean | string
}

export function LineageNode({ data }: NodeProps) {
  const d = data as unknown as LineageNodeData
  const { fitView } = useReactFlow()
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [columns, setColumns] = useState<ColumnDetail[] | null>(null)
  const [columnsLoading, setColumnsLoading] = useState(false)
  const isView = d.table_type?.toUpperCase().includes('VIEW') ?? false
  const isUpstream = d.depth < 0
  const isDownstream = d.depth > 0

  const handleToggleColumns = (e: React.MouseEvent) => {
    e.stopPropagation()
    const nextOpen = !columnsOpen

    if (nextOpen && columns === null && !columnsLoading) {
      setColumnsLoading(true)
      assetsApi.columns(d.asset_id)
        .then(r => {
          setColumns(r.data.columns ?? [])
          setTimeout(() => fitView({ duration: 300, padding: 0.3 }), 100)
        })
        .catch(() => setColumns([]))
        .finally(() => setColumnsLoading(false))
    } else if (nextOpen) {
      setTimeout(() => fitView({ duration: 300, padding: 0.3 }), 100)
    }

    setColumnsOpen(nextOpen)
  }

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: '#93c5fd' }} />

      <div
        className={`bg-white rounded-lg p-3 w-44 shadow-sm transition-shadow ${
          d.isBase
            ? 'border-2 border-blue-500 ring-2 ring-blue-100'
            : 'border border-gray-200'
        }`}
      >
        {d.isBase && (
          <span className="inline-block text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mb-1.5 uppercase tracking-wide">
            BASE
          </span>
        )}

        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs shrink-0">{isView ? '👁' : '📋'}</span>
          <span className="text-[11px] font-semibold text-gray-900 truncate" title={d.sf_table_name}>
            {d.sf_table_name}
          </span>
        </div>

        <p className="text-[10px] text-gray-400 mb-2">
          {isView ? 'View' : 'Table'} in {d.sf_schema_name}
        </p>

        <div className="flex gap-3 mb-2">
          <div>
            <p className="text-[11px] font-semibold text-gray-700">
              {d.row_count != null ? d.row_count.toLocaleString() : '—'}
            </p>
            <p className="text-[9px] text-gray-400">rows</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-700">{d.column_count}</p>
            <p className="text-[9px] text-gray-400">cols</p>
          </div>
        </div>

        <button
          className="text-[10px] text-blue-500 hover:underline flex items-center gap-1"
          onClick={handleToggleColumns}
        >
          {columnsOpen ? '▴' : '▾'} view columns
        </button>

        {columnsOpen && (
          <div className="mt-1.5 pt-1.5 border-t border-gray-100 max-h-40 overflow-y-auto space-y-0.5">
            {columnsLoading ? (
              <p className="text-[10px] text-gray-400 py-0.5">Loading…</p>
            ) : !columns || columns.length === 0 ? (
              <p className="text-[10px] text-gray-400">{d.column_count} columns</p>
            ) : (
              columns.map(c => (
                <div key={c.column_name} className="flex items-center gap-1">
                  {c.is_primary_key && (
                    <span title="Primary key" className="text-[8px] text-amber-500 shrink-0">🔑</span>
                  )}
                  <span
                    className="text-[10px] text-gray-700 truncate flex-1"
                    title={c.column_name}
                  >
                    {c.column_name}
                  </span>
                  <span className="text-[9px] text-gray-400 shrink-0 uppercase font-mono">
                    {c.data_type?.split('(')[0] ?? '?'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {(isUpstream || isDownstream) && (
          <div className={`mt-2 flex ${isUpstream ? 'justify-start' : 'justify-end'}`}>
            {d.isExpandLoading ? (
              <span className="text-[10px] text-gray-400">loading…</span>
            ) : d.isExpanded ? (
              <span className="text-[10px] text-gray-300">✓ expanded</span>
            ) : (
              <button
                className="text-[10px] text-indigo-500 hover:text-indigo-700 hover:underline"
                onClick={e => { e.stopPropagation(); d.onExpand?.() }}
              >
                {isUpstream ? '◄ expand' : 'expand ►'}
              </button>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: '#93c5fd' }} />
    </>
  )
}
