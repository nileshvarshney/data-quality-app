'use client'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useRouter } from 'next/navigation'
import { Database, Key, Link2, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import type { TableNodeData, GraphColumn } from './lineageTypes'

// ── Score helpers ──────────────────────────────────────────────────

function scoreColor(s: number | null | undefined) {
  if (s == null) return 'text-gray-400'
  if (s >= 95) return 'text-emerald-600'
  if (s >= 80) return 'text-amber-600'
  if (s >= 60) return 'text-orange-500'
  return 'text-red-600'
}

function scoreBg(s: number | null | undefined) {
  if (s == null) return 'bg-gray-100 border-gray-200'
  if (s >= 95) return 'bg-emerald-50 border-emerald-200'
  if (s >= 80) return 'bg-amber-50 border-amber-200'
  if (s >= 60) return 'bg-orange-50 border-orange-200'
  return 'bg-red-50 border-red-200'
}

// ── Column row ─────────────────────────────────────────────────────

function ColRow({ col }: { col: GraphColumn }) {
  return (
    <div className="flex items-center gap-2 px-3 h-[26px] hover:bg-gray-50/80 transition-colors group/col">
      {/* Column lineage indicator dot */}
      <div className={clsx(
        'w-[7px] h-[7px] rounded-full border shrink-0',
        col.is_primary_key
          ? 'border-amber-400 bg-amber-100'
          : col.is_foreign_key
          ? 'border-violet-400 bg-violet-100'
          : 'border-gray-300 bg-white',
      )} />

      {/* Icons for PK / FK */}
      {col.is_primary_key && (
        <Key size={8} className="text-amber-500 shrink-0 -ml-1" />
      )}
      {!col.is_primary_key && col.is_foreign_key && (
        <Link2 size={8} className="text-violet-400 shrink-0 -ml-1" />
      )}

      <span className="text-[11px] text-gray-700 truncate flex-1 font-mono leading-none">
        {col.column_name}
      </span>
      <span className="text-[10px] text-gray-400 shrink-0 font-mono leading-none">
        {(col.data_type ?? '').replace(/\(.+\)/, '').substring(0, 14)}
      </span>
    </div>
  )
}

// ── Main TableNode ─────────────────────────────────────────────────

const MAX_COLS_COLLAPSED = 7
const MAX_COLS_EXPANDED_SOLO = 50   // show all when no connections

export function TableNode({ data }: NodeProps) {
  const d = data as unknown as TableNodeData
  const router = useRouter()
  const node = d.node as any
  const columns: GraphColumn[] = node.columns ?? []
  const [expanded, setExpanded] = useState(false)

  const maxVisible = d.showAllColumns ? MAX_COLS_EXPANDED_SOLO : MAX_COLS_COLLAPSED
  const visibleCols = expanded ? columns : columns.slice(0, maxVisible)
  const overflow = Math.max(0, columns.length - maxVisible)

  const isClickable = d.direction !== 'current' && !!node.asset_id
  const handleClick = () => {
    if (isClickable) router.push(`/dashboard/tables/${node.asset_id}`)
  }

  // Direction-based accent color
  const accentClass =
    d.direction === 'current'
      ? 'border-indigo-500'
      : d.direction === 'upstream'
      ? 'border-blue-400'
      : 'border-emerald-400'

  const headerBg =
    d.direction === 'current'
      ? 'bg-indigo-50/60'
      : 'bg-gray-50/70'

  const iconColor =
    d.direction === 'current'
      ? 'text-indigo-500'
      : d.direction === 'upstream'
      ? 'text-blue-500'
      : 'text-emerald-500'

  // Source badge label
  const sourceBadge =
    node.source === 'fk_detection' ? 'FK' :
    node.downstream_type === 'dbt_model' ? 'dbt' :
    node.downstream_type === 'looker_dashboard' ? 'Looker' :
    node.downstream_type === 'tableau' ? 'Tableau' : null

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'bg-white rounded-[8px] border-[1.5px] shadow-[0_2px_8px_rgba(0,0,0,0.07)]',
        'overflow-hidden flex flex-col',
        accentClass,
        isClickable && 'cursor-pointer hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-shadow',
        d.direction === 'current' && 'shadow-[0_2px_12px_rgba(99,102,241,0.15)]',
      )}
      style={{ width: d.showAllColumns ? 300 : 260 }}
    >
      {/* Header */}
      <div className={clsx('px-3 pt-2.5 pb-2 border-b border-gray-100', headerBg)}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <Database size={11} className={clsx('shrink-0', iconColor)} />
          <span className="text-[10px] text-gray-400 truncate flex-1 uppercase tracking-wider leading-none">
            {node.sf_schema_name || node.sf_database_name || 'Snowflake'}
          </span>
          {node.quality_score != null && (
            <span className={clsx(
              'text-[9px] font-semibold px-1.5 py-0.5 rounded-full border leading-none',
              scoreBg(node.quality_score), scoreColor(node.quality_score),
            )}>
              {node.quality_score.toFixed(0)}%
            </span>
          )}
          {sourceBadge && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600 leading-none ml-0.5">
              {sourceBadge}
            </span>
          )}
        </div>
        <p className={clsx(
          'text-xs font-bold truncate leading-snug',
          d.direction === 'current' ? 'text-indigo-900' : 'text-gray-800',
        )}>
          {node.sf_table_name || node.downstream_name || '—'}
        </p>
        {d.direction === 'current' && (
          <p className="text-[9px] text-indigo-400 font-medium leading-none mt-0.5">Current table</p>
        )}
        {node.fk_column && (
          <p className="text-[9px] text-violet-500 leading-none mt-0.5">via {node.fk_column}</p>
        )}
        {node.is_critical && (
          <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 leading-none mt-1">
            Critical
          </span>
        )}
      </div>

      {/* Column count header */}
      {columns.length > 0 && (
        <div className="px-3 py-1 border-b border-gray-100 bg-gray-50/30 flex items-center gap-1">
          <span className="text-[10px] text-gray-400">{columns.length} columns</span>
        </div>
      )}

      {/* Column list */}
      <div className="flex-1 divide-y divide-gray-50/80">
        {visibleCols.map(col => (
          <ColRow key={col.column_name} col={col} />
        ))}
        {columns.length === 0 && (
          <div className="px-3 py-3 text-[10px] text-gray-400 italic">
            No column metadata — profile this table to see columns
          </div>
        )}
      </div>

      {/* Show more / less */}
      {!d.showAllColumns && overflow > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(x => !x) }}
          className="flex items-center gap-1 px-3 py-1.5 text-[10px] text-blue-500 font-medium hover:bg-blue-50 transition-colors border-t border-gray-100"
        >
          {expanded
            ? <><ChevronUp size={10} /> Show less</>
            : <><ChevronDown size={10} /> +{overflow} more columns</>
          }
        </button>
      )}

      {/* ReactFlow handles (invisible, for edges only) */}
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, width: 6, height: 6, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 6, height: 6, pointerEvents: 'none' }} />
    </div>
  )
}

export const lineageNodeTypes = { tableNode: TableNode }
