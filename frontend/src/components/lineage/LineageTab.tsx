'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
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
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { lineageApi } from '@/services/apiClient'
import type { LineageResponse, LineageAsset } from '@/types/lineage'
import { LineageNode } from './LineageNode'

const nodeTypes = { lineageNode: LineageNode }

const BASE_X = 380
const COLUMN_WIDTH = 330
const NODE_H = 200

const edgeStyle = { stroke: '#93c5fd', strokeWidth: 2 }
const markerEnd = { type: MarkerType.ArrowClosed, color: '#93c5fd' }

function makeEdge(source: string, target: string): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: 'smoothstep',
    animated: true,
    style: edgeStyle,
    markerEnd,
  }
}

interface Props {
  assetId: string
}

export function LineageTab({ assetId }: Props) {
  const [lineage, setLineage] = useState<LineageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const rfRef = useRef<ReactFlowInstance | null>(null)
  const onInit = useCallback((rf: ReactFlowInstance) => { rfRef.current = rf }, [])

  // Ref breaks the recursive self-reference in handleExpand callbacks stored in node data
  const handleExpandRef = useRef<((assetId: string, depth: number) => void) | null>(null)

  const handleExpand = useCallback((expandId: string, depth: number) => {
    setNodes(nds => nds.map(n =>
      n.id === expandId ? { ...n, data: { ...n.data, isExpandLoading: true } } : n
    ))

    lineageApi.get(expandId)
      .then(r => {
        const resp: LineageResponse = r.data
        const isUpstream = depth < 0
        const newAssets = isUpstream ? resp.upstream : resp.downstream
        const newDepth = isUpstream ? depth - 1 : depth + 1

        setNodes(nds => {
          const existingIds = new Set(nds.map(n => n.id))
          const fresh = newAssets.filter(a => !existingIds.has(a.asset_id))
          const parentY = nds.find(n => n.id === expandId)?.position.y ?? 0
          const startY = parentY - ((fresh.length - 1) * NODE_H) / 2

          const newNodes: Node[] = fresh.map((a, i) => ({
            id: a.asset_id,
            type: 'lineageNode',
            position: { x: BASE_X + newDepth * COLUMN_WIDTH, y: startY + i * NODE_H },
            data: {
              ...a,
              isBase: false,
              depth: newDepth,
              isExpanded: false,
              isExpandLoading: false,
              onExpand: () => handleExpandRef.current?.(a.asset_id, newDepth),
            } as unknown as Record<string, unknown>,
          }))

          const updated = nds.map(n =>
            n.id === expandId
              ? { ...n, data: { ...n.data, isExpanded: true, isExpandLoading: false } }
              : n
          )
          return [...updated, ...newNodes]
        })

        setEdges(eds => {
          const existingIds = new Set(eds.map(e => e.id))
          const newEdges = newAssets
            .filter(a => {
              const id = isUpstream ? `${a.asset_id}->${expandId}` : `${expandId}->${a.asset_id}`
              return !existingIds.has(id)
            })
            .map(a => makeEdge(
              isUpstream ? a.asset_id : expandId,
              isUpstream ? expandId : a.asset_id,
            ))
          return [...eds, ...newEdges]
        })

        setTimeout(() => rfRef.current?.fitView({ duration: 400, padding: 0.3 }), 100)
      })
      .catch(() => {
        setNodes(nds => nds.map(n =>
          n.id === expandId ? { ...n, data: { ...n.data, isExpandLoading: false } } : n
        ))
      })
  }, [setNodes, setEdges])

  // Keep ref current so node callbacks always call the latest version
  handleExpandRef.current = handleExpand

  useEffect(() => {
    setLoading(true)
    setError(null)
    lineageApi.get(assetId)
      .then(r => {
        const data: LineageResponse = r.data
        setLineage(data)
        const { nodes: n, edges: e } = buildGraph(data, handleExpand)
        setNodes(n)
        setEdges(e)
      })
      .catch(() => setError('Failed to load lineage data.'))
      .finally(() => setLoading(false))
  }, [assetId, handleExpand, setNodes, setEdges])

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
    <div
      className="border border-gray-200 rounded-xl overflow-hidden"
      style={{ height: 'calc(100vh - 240px)', minHeight: 500 }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={20} color="#e2e8f0" size={1} />
      </ReactFlow>
    </div>
  )
}

function buildGraph(
  data: LineageResponse,
  onExpand: (assetId: string, depth: number) => void,
): { nodes: Node[]; edges: Edge[] } {
  const { asset, upstream, downstream } = data
  const upCount = upstream.length
  const downCount = downstream.length
  const maxSide = Math.max(upCount, downCount, 1)
  const baseY = ((maxSide - 1) * NODE_H) / 2

  const makeNode = (a: LineageAsset, depth: number, y: number, isBase: boolean): Node => ({
    id: a.asset_id,
    type: 'lineageNode',
    position: { x: BASE_X + depth * COLUMN_WIDTH, y },
    data: {
      ...a,
      isBase,
      depth,
      isExpanded: false,
      isExpandLoading: false,
      onExpand: isBase ? undefined : () => onExpand(a.asset_id, depth),
    } as unknown as Record<string, unknown>,
  })

  const nodes: Node[] = [
    ...upstream.map((a, i) => makeNode(a, -1, i * NODE_H, false)),
    makeNode(asset, 0, baseY, true),
    ...downstream.map((a, i) => makeNode(a, 1, i * NODE_H, false)),
  ]

  const edges: Edge[] = [
    ...upstream.map(a => makeEdge(a.asset_id, asset.asset_id)),
    ...downstream.map(a => makeEdge(asset.asset_id, a.asset_id)),
  ]

  return { nodes, edges }
}
