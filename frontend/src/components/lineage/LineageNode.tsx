'use client'
import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LineageAsset } from '@/types/lineage'

export type LineageNodeData = LineageAsset & {
  isBase: boolean
  onSelect: (asset: LineageAsset) => void
}

export function LineageNode({ data }: NodeProps) {
  const d = data as unknown as LineageNodeData
  const [expanded, setExpanded] = useState(false)
  const isView = d.table_type?.toUpperCase().includes('VIEW') ?? false

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: '#93c5fd' }} />

      <div
        className={`bg-white rounded-lg p-3 w-44 cursor-pointer shadow-sm transition-shadow ${
          d.isBase
            ? 'border-2 border-blue-500 ring-2 ring-blue-100'
            : 'border border-gray-200 hover:shadow-md'
        }`}
        onClick={() => d.onSelect(d)}
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

        <button
          className="text-[10px] text-blue-500 hover:underline flex items-center gap-1"
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        >
          {expanded ? '▴' : '▾'} view columns
        </button>

        {expanded && (
          <p className="mt-1.5 text-[10px] text-gray-500">{d.column_count} columns</p>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: '#93c5fd' }} />
    </>
  )
}
