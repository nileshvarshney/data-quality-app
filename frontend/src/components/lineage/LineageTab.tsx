'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { lineageApi } from '@/services/apiClient'
import type { LineageResponse, LineageAsset } from '@/types/lineage'
import { LineageNode, type LineageNodeData } from './LineageNode'
import { LineageSidePanel } from './LineageSidePanel'

const nodeTypes = { lineageNode: LineageNode }

const UPSTREAM_X = 50
const BASE_X = 380
const DOWNSTREAM_X = 710
const NODE_H = 120

interface Props {
  assetId: string
}

export function LineageTab({ assetId }: Props) {
  const [lineage, setLineage] = useState<LineageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<LineageAsset | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const handleSelect = useCallback((asset: LineageAsset) => setSelected(asset), [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    lineageApi.get(assetId)
      .then(r => {
        const data: LineageResponse = r.data
        setLineage(data)
        setSelected(data.asset)
        const { nodes: n, edges: e } = buildGraph(data, handleSelect)
        setNodes(n)
        setEdges(e)
      })
      .catch(() => setError('Failed to load lineage data.'))
      .finally(() => setLoading(false))
  }, [assetId, handleSelect, setNodes, setEdges])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Loading lineage...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-red-500">{error}</div>
    )
  }

  const isEmpty = lineage && lineage.upstream.length === 0 && lineage.downstream.length === 0
  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        No lineage data available. This asset has no registered view dependencies.
      </div>
    )
  }

  return (
    <div className="flex border border-gray-200 rounded-xl overflow-hidden" style={{ height: 600 }}>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={20} color="#e2e8f0" size={1} />
        </ReactFlow>
      </div>
      <LineageSidePanel asset={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function buildGraph(
  data: LineageResponse,
  onSelect: (a: LineageAsset) => void,
): { nodes: Node[]; edges: Edge[] } {
  const { asset, upstream, downstream } = data
  const upCount = upstream.length
  const downCount = downstream.length
  const maxSide = Math.max(upCount, downCount, 1)
  const baseY = ((maxSide - 1) * NODE_H) / 2

  const makeNode = (a: LineageAsset, x: number, y: number, isBase: boolean): Node => ({
    id: a.asset_id,
    type: 'lineageNode',
    position: { x, y },
    data: { ...a, isBase, onSelect } as unknown as Record<string, unknown>,
  })

  const nodes: Node[] = [
    ...upstream.map((a, i) => makeNode(a, UPSTREAM_X, i * NODE_H, false)),
    makeNode(asset, BASE_X, baseY, true),
    ...downstream.map((a, i) => makeNode(a, DOWNSTREAM_X, i * NODE_H, false)),
  ]

  const edgeStyle = { stroke: '#93c5fd', strokeWidth: 2 }
  const markerEnd = { type: MarkerType.ArrowClosed, color: '#93c5fd' }

  const edges: Edge[] = [
    ...upstream.map(a => ({
      id: `${a.asset_id}->${asset.asset_id}`,
      source: a.asset_id,
      target: asset.asset_id,
      type: 'smoothstep',
      animated: true,
      style: edgeStyle,
      markerEnd,
    })),
    ...downstream.map(a => ({
      id: `${asset.asset_id}->${a.asset_id}`,
      source: asset.asset_id,
      target: a.asset_id,
      type: 'smoothstep',
      animated: true,
      style: edgeStyle,
      markerEnd,
    })),
  ]

  return { nodes, edges }
}
