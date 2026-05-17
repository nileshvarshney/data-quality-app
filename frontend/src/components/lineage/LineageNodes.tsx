'use client'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  DataObjectNode,
  getDirectionLabel,
  getObjectTypeBadgeClass,
  getObjectTypeLabel,
} from './lineageTypes'

interface LineageNodeData {
  node: DataObjectNode
  isFocal: boolean
  isNeighbor: boolean
  onExpand: (objectId: string, direction: 'source' | 'target') => void
  onSelect: (node: DataObjectNode) => void
}

function qualityBarColor(score: number): string {
  if (score >= 80) return 'from-green-500 to-emerald-400'
  if (score >= 60) return 'from-yellow-500 to-amber-400'
  return 'from-orange-500 to-red-400'
}

export default function LineageNode({ data }: NodeProps) {
  const d = data as unknown as LineageNodeData
  const { node, isFocal, isNeighbor, onExpand, onSelect } = d

  const outerRing = isFocal
    ? 'ring-2 ring-indigo-400'
    : isNeighbor
    ? 'ring-1 ring-slate-500'
    : ''

  const score = node.quality_score
  const scoreW = score != null ? Math.min(Math.round(score), 100) : 0

  return (
    <div
      className={`bg-slate-950 border border-slate-700 rounded-lg overflow-hidden flex flex-col cursor-pointer hover:border-indigo-500/60 transition-all ${outerRing}`}
      style={{ width: 260 }}
      onClick={() => onSelect(node)}
    >
      {/* Header */}
      <div className="px-3 pt-2 pb-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${getObjectTypeBadgeClass(node.object_type)}`}
          >
            {getObjectTypeLabel(node.object_type)}
          </span>
          <span className="text-[9px] text-slate-500 truncate">
            {node.database_name} · {node.schema_name}
          </span>
        </div>
        <div className="text-[13px] font-bold text-slate-100 truncate leading-snug">
          {node.object_name}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 flex-1 space-y-1 text-[10px]">
        {(node.domain || node.sub_domain) && (
          <div className="text-slate-400 truncate">
            <span className="text-slate-500">Domain: </span>
            {[node.domain, node.sub_domain].filter(Boolean).join(' · ')}
          </div>
        )}
        {node.owner && (
          <div className="text-slate-400 truncate">
            <span className="text-slate-500">Owner: </span>
            {node.owner}
          </div>
        )}

        {/* Quality bar */}
        <div className="pt-0.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              {score != null && (
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${qualityBarColor(score)}`}
                  style={{ width: `${scoreW}%` }}
                />
              )}
            </div>
            <span className="text-[9px] text-slate-400 shrink-0 w-7 text-right">
              {score != null ? `${Math.round(score)}%` : '—'}
            </span>
            {node.certification_status === 'certified' && (
              <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-900/50 border border-emerald-700/60 text-emerald-400">
                ✓ certified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expand buttons */}
      <div
        className="flex border-t border-slate-800"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => onExpand(node.object_id, 'source')}
          className="flex-1 py-1.5 text-[9px] text-slate-500 hover:text-blue-400 hover:bg-slate-800/50 transition-colors border-r border-slate-800 flex items-center justify-center gap-1"
        >
          ◄ {getDirectionLabel(node.object_type, 'source')}
        </button>
        <button
          onClick={() => onExpand(node.object_id, 'target')}
          className="flex-1 py-1.5 text-[9px] text-slate-500 hover:text-emerald-400 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-1"
        >
          {getDirectionLabel(node.object_type, 'target')} ►
        </button>
      </div>

      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 6, height: 6, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 6, height: 6, pointerEvents: 'none' }} />
    </div>
  )
}

export const lineageNodeTypes = { lineageNode: LineageNode }
