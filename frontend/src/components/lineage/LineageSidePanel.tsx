'use client'
import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { lineageApi } from '@/services/apiClient'
import {
  DataObjectNode,
  DataObjectColumn,
  DataObjectEdge,
  ImpactResponse,
  getDirectionLabel,
  getImpactLabel,
  getObjectTypeBadgeClass,
  getObjectTypeLabel,
} from './lineageTypes'

interface Props {
  node: DataObjectNode
  allNodes: DataObjectNode[]
  allEdges: DataObjectEdge[]
  onClose: () => void
  onNodeSelect: (objectId: string) => void
}

function qualityBarColor(score: number): string {
  if (score >= 80) return 'from-green-500 to-emerald-400'
  if (score >= 60) return 'from-yellow-500 to-amber-400'
  return 'from-orange-500 to-red-400'
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-2 bg-slate-800/50 border-y border-slate-700 text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
      {label}
    </div>
  )
}

export default function LineageSidePanel({
  node,
  allNodes,
  allEdges,
  onClose,
  onNodeSelect,
}: Props) {
  const [columns, setColumns] = useState<DataObjectColumn[]>([])
  const [columnsLoading, setColumnsLoading] = useState(true)
  const [impact, setImpact] = useState<ImpactResponse | null>(null)
  const [impactLoading, setImpactLoading] = useState(true)

  useEffect(() => {
    setColumnsLoading(true)
    lineageApi
      .columns(node.object_id)
      .then(r => setColumns((r.data as DataObjectColumn[]) ?? []))
      .catch(() => setColumns([]))
      .finally(() => setColumnsLoading(false))
  }, [node.object_id])

  useEffect(() => {
    setImpactLoading(true)
    lineageApi
      .impact(node.object_id)
      .then(r => setImpact(r.data as ImpactResponse))
      .catch(() => setImpact(null))
      .finally(() => setImpactLoading(false))
  }, [node.object_id])

  const sourceNodes = allEdges
    .filter(e => e.target_object_id === node.object_id)
    .map(e => allNodes.find(n => n.object_id === e.source_object_id))
    .filter((n): n is DataObjectNode => Boolean(n))

  const targetNodes = allEdges
    .filter(e => e.source_object_id === node.object_id)
    .map(e => allNodes.find(n => n.object_id === e.target_object_id))
    .filter((n): n is DataObjectNode => Boolean(n))

  const score = node.quality_score
  const scoreW = score != null ? Math.min(Math.round(score), 100) : 0

  return (
    <div
      className="fixed right-0 top-0 bottom-0 w-96 bg-slate-900 border-l border-slate-700 flex flex-col z-50 overflow-y-auto"
      style={{ animation: 'slideInRight 0.18s ease' }}
    >
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex-shrink-0 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${getObjectTypeBadgeClass(node.object_type)}`}
            >
              {getObjectTypeLabel(node.object_type)}
            </span>
          </div>
          <div className="text-sm font-bold text-slate-100 break-all leading-snug">
            {node.object_name}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {node.database_name} · {node.schema_name}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-0.5 p-0.5"
        >
          <X size={14} />
        </button>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 border-b border-slate-700 space-y-2 text-[11px]">
        {node.domain && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-20 shrink-0">Domain</span>
            <span className="text-slate-300">{node.domain}</span>
          </div>
        )}
        {node.sub_domain && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-20 shrink-0">Sub-domain</span>
            <span className="text-slate-300">{node.sub_domain}</span>
          </div>
        )}
        {node.owner && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-20 shrink-0">Owner</span>
            <span className="text-slate-300 truncate">{node.owner}</span>
          </div>
        )}

        {/* Quality bar */}
        <div className="pt-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-slate-500 text-[10px]">Quality</span>
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              {score != null && (
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${qualityBarColor(score)}`}
                  style={{ width: `${scoreW}%` }}
                />
              )}
            </div>
            <span className="text-[10px] text-slate-400 w-8 text-right shrink-0">
              {score != null ? `${Math.round(score)}%` : '—'}
            </span>
            {node.certification_status === 'certified' && (
              <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-900/50 border border-emerald-700/60 text-emerald-400">
                ✓ certified
              </span>
            )}
          </div>
        </div>

        {node.status && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-20 shrink-0">Status</span>
            <span className="text-slate-300 capitalize">{node.status}</span>
          </div>
        )}

        {node.tags && node.tags.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <span className="text-slate-500 w-20 shrink-0">Tags</span>
            <div className="flex flex-wrap gap-1">
              {node.tags.map(tag => (
                <span
                  key={tag}
                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 border border-slate-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {node.last_refreshed_at && (
          <div className="flex gap-2">
            <span className="text-slate-500 w-20 shrink-0">Refreshed</span>
            <span className="text-slate-400 text-[10px]">
              {new Date(node.last_refreshed_at).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Columns */}
      <SectionHeader label="Columns" />
      <div className="border-b border-slate-700">
        {columnsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={14} className="animate-spin text-slate-500" />
          </div>
        ) : columns.length === 0 ? (
          <div className="px-4 py-3 text-[10px] text-slate-500 italic">No column metadata</div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {columns.map(col => (
              <div key={col.column_id} className="flex items-center gap-2 px-4 py-1.5 font-mono text-[10px]">
                <span className="flex-1 text-slate-300 truncate">{col.column_name}</span>
                {col.data_type && (
                  <span className="text-slate-600 shrink-0">
                    {col.data_type.replace(/\(.+\)/, '').substring(0, 14)}
                  </span>
                )}
                {col.is_nullable === false && (
                  <span className="text-[8px] text-slate-600 shrink-0">[NOT NULL]</span>
                )}
                {col.is_nullable === true && (
                  <span className="text-[8px] text-slate-700 shrink-0">[nullable]</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Source / Upstream */}
      <SectionHeader label={getDirectionLabel(node.object_type, 'source')} />
      <div className="border-b border-slate-700">
        {sourceNodes.length === 0 ? (
          <div className="px-4 py-3 text-[10px] text-slate-500 italic">None</div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {sourceNodes.map(n => (
              <button
                key={n.object_id}
                onClick={() => onNodeSelect(n.object_id)}
                className="w-full text-left px-4 py-2 hover:bg-slate-800/50 transition-colors flex items-center gap-2"
              >
                <span
                  className={`text-[8px] font-semibold px-1 py-0.5 rounded ${getObjectTypeBadgeClass(n.object_type)}`}
                >
                  {getObjectTypeLabel(n.object_type)}
                </span>
                <span className="text-[11px] text-slate-300 truncate">{n.object_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Target / Downstream */}
      <SectionHeader label={getDirectionLabel(node.object_type, 'target')} />
      <div className="border-b border-slate-700">
        {targetNodes.length === 0 ? (
          <div className="px-4 py-3 text-[10px] text-slate-500 italic">None</div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {targetNodes.map(n => (
              <button
                key={n.object_id}
                onClick={() => onNodeSelect(n.object_id)}
                className="w-full text-left px-4 py-2 hover:bg-slate-800/50 transition-colors flex items-center gap-2"
              >
                <span
                  className={`text-[8px] font-semibold px-1 py-0.5 rounded ${getObjectTypeBadgeClass(n.object_type)}`}
                >
                  {getObjectTypeLabel(n.object_type)}
                </span>
                <span className="text-[11px] text-slate-300 truncate">{n.object_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Impact Analysis */}
      <SectionHeader label={getImpactLabel(node.object_type)} />
      <div className="px-4 py-3">
        {impactLoading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 size={14} className="animate-spin text-slate-500" />
          </div>
        ) : impact == null ? (
          <div className="text-[10px] text-slate-500 italic">Could not load impact data</div>
        ) : (
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Impacted views</span>
              <span className="text-slate-300 font-medium">{impact.impacted_views?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Impacted materialized views</span>
              <span className="text-slate-300 font-medium">{impact.impacted_materialized_views?.length ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Connected tables</span>
              <span className="text-slate-300 font-medium">{impact.connected_tables?.length ?? 0}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-800">
              <span className="text-slate-400 font-medium">Total impacted</span>
              <span className="text-indigo-400 font-bold">{impact.total_impacted ?? 0}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
