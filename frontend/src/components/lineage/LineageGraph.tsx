'use client'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { lineageNodeTypes } from './LineageNodes'
import LineageToolbar, { type FilterState } from './LineageToolbar'
import LineageSidePanel from './LineageSidePanel'
import type { DataObjectNode, DataObjectEdge, LineageGraphResponse } from './lineageTypes'
import { lineageApi } from '@/services/apiClient'

// ── Layout constants ────────────────────────────────────────────────
const NODE_W    = 260
const NODE_H    = 180
const COL_GAP   = 120
const ROW_GAP   = 40

// ── LineageNodeData (must match LineageNodes) ───────────────────────
interface LineageNodeData {
  node: DataObjectNode
  isFocal: boolean
  isNeighbor: boolean
  onExpand: (objectId: string, direction: 'source' | 'target') => void
  onSelect: (node: DataObjectNode) => void
}

// ── Column assignment via BFS ───────────────────────────────────────
function assignColumns(
  focalId: string,
  allNodes: DataObjectNode[],
  edges: DataObjectEdge[],
): Map<string, number> {
  const colMap = new Map<string, number>([[focalId, 0]])
  const queue: string[] = [focalId]
  while (queue.length > 0) {
    const id = queue.shift()!
    const col = colMap.get(id)!
    for (const e of edges) {
      if (e.source_object_id === id && !colMap.has(e.target_object_id)) {
        colMap.set(e.target_object_id, col + 1)
        queue.push(e.target_object_id)
      }
      if (e.target_object_id === id && !colMap.has(e.source_object_id)) {
        colMap.set(e.source_object_id, col - 1)
        queue.push(e.source_object_id)
      }
    }
  }
  // Any unassigned nodes get placed at col 999 (disconnected)
  for (const n of allNodes) {
    if (!colMap.has(n.object_id)) colMap.set(n.object_id, 999)
  }
  return colMap
}

// ── Build ReactFlow nodes + edges ───────────────────────────────────
function buildLayout(
  focalId: string,
  allNodes: DataObjectNode[],
  edges: DataObjectEdge[],
  selectedId: string | null,
  handlers: {
    onExpand: (objectId: string, direction: 'source' | 'target') => void
    onSelect: (node: DataObjectNode) => void
  },
): { nodes: Node[]; edges: Edge[] } {
  const colMap = assignColumns(focalId, allNodes, edges)

  // Group nodes by column
  const byCol = new Map<number, DataObjectNode[]>()
  for (const n of allNodes) {
    const col = colMap.get(n.object_id) ?? 0
    if (!byCol.has(col)) byCol.set(col, [])
    byCol.get(col)!.push(n)
  }

  // Determine neighbor IDs for highlight
  const neighborIds = new Set<string>()
  if (selectedId) {
    for (const e of edges) {
      if (e.source_object_id === selectedId) neighborIds.add(e.target_object_id)
      if (e.target_object_id === selectedId) neighborIds.add(e.source_object_id)
    }
  }

  const rfNodes: Node[] = []

  for (const [col, colNodes] of Array.from(byCol.entries()).sort(([a], [b]) => a - b)) {
    const x = col * (NODE_W + COL_GAP)
    const totalH = colNodes.length * (NODE_H + ROW_GAP) - ROW_GAP
    let y = -totalH / 2
    for (const n of colNodes) {
      rfNodes.push({
        id: n.object_id,
        type: 'lineageNode',
        position: { x, y },
        data: {
          node: n,
          isFocal: n.object_id === focalId,
          isNeighbor: neighborIds.has(n.object_id),
          onExpand: handlers.onExpand,
          onSelect: handlers.onSelect,
        } as unknown as Record<string, unknown>,
        draggable: true,
      })
      y += NODE_H + ROW_GAP
    }
  }

  const rfEdges: Edge[] = edges.map(e => ({
    id: e.relationship_id,
    source: e.source_object_id,
    target: e.target_object_id,
    type: 'smoothstep',
    label: e.relationship_type.replace('_', ' '),
    labelStyle: { fontSize: 9, fill: '#94a3b8', fontFamily: 'monospace' },
    labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: '#818CF8' },
    style: { stroke: '#818CF8', strokeWidth: 1.5, opacity: 0.8 },
  }))

  return { nodes: rfNodes, edges: rfEdges }
}

// ── Inner canvas component (needs useReactFlow inside provider) ─────
interface CanvasProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: ReturnType<typeof useNodesState>[2]
  onEdgesChange: ReturnType<typeof useEdgesState>[2]
  onZoomInRef: React.MutableRefObject<() => void>
  onZoomOutRef: React.MutableRefObject<() => void>
  onFitViewRef: React.MutableRefObject<() => void>
}

function LineageCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onZoomInRef,
  onZoomOutRef,
  onFitViewRef,
}: CanvasProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  useEffect(() => {
    onZoomInRef.current = zoomIn
    onZoomOutRef.current = zoomOut
    onFitViewRef.current = () => fitView({ padding: 0.15 })
  }, [zoomIn, zoomOut, fitView, onZoomInRef, onZoomOutRef, onFitViewRef])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={lineageNodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.15}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      colorMode="dark"
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(99,102,241,0.13)" />
    </ReactFlow>
  )
}

// ── Main component ──────────────────────────────────────────────────
export default function LineageGraph({ objectId }: { objectId: string }) {
  const [depth, setDepth] = useState('2')
  const [, setFilters] = useState<FilterState>({})
  const [graphData, setGraphData] = useState<LineageGraphResponse | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [selectedNode, setSelectedNode] = useState<DataObjectNode | null>(null)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Zoom callback refs — populated by LineageCanvas
  const zoomInRef  = useRef<() => void>(() => {})
  const zoomOutRef = useRef<() => void>(() => {})
  const fitViewRef = useRef<() => void>(() => {})

  const allNodes: DataObjectNode[] = graphData
    ? [graphData.focal_node, ...graphData.nodes]
    : []
  const allEdges: DataObjectEdge[] = graphData?.edges ?? []

  // Load graph on objectId or depth change
  const load = useCallback(() => {
    if (!objectId) return
    setStatus('loading')
    setGraphData(null)
    setSelectedNode(null)
    lineageApi.graph(objectId, depth)
      .then((res: { data: LineageGraphResponse }) => {
        setGraphData(res.data)
        setStatus('ok')
      })
      .catch(() => setStatus('error'))
  }, [objectId, depth])

  useEffect(() => { load() }, [load])

  // Rebuild ReactFlow layout when graph data or selection changes
  useEffect(() => {
    if (!graphData) return
    const allN = [graphData.focal_node, ...graphData.nodes]
    const { nodes: n, edges: e } = buildLayout(
      graphData.focal_node.object_id,
      allN,
      graphData.edges,
      selectedNode?.object_id ?? null,
      {
        onExpand: (_id, _direction) => {
          // On expand: bump depth by 1 (max 3)
          const next = depth === 'all' ? 'all' : String(Math.min(parseInt(depth) + 1, 3))
          if (next !== depth) setDepth(next)
        },
        onSelect: (node) => setSelectedNode(node),
      },
    )
    setRfNodes(n)
    setRfEdges(e)
  }, [graphData, selectedNode, depth, setRfNodes, setRfEdges])

  // Navigate to another node (from side panel click or search)
  const handleNodeSelect = useCallback((id: string) => {
    const found = allNodes.find(n => n.object_id === id)
    if (found) setSelectedNode(found)
  }, [allNodes])

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
      <LineageToolbar
        depth={depth}
        onDepthChange={setDepth}
        onFilterChange={setFilters}
        onNodeSelect={(node) => setSelectedNode(node)}
        onZoomIn={() => zoomInRef.current()}
        onZoomOut={() => zoomOutRef.current()}
        onFitView={() => fitViewRef.current()}
      />

      <div className="relative" style={{ height: 520 }}>
        {status === 'loading' && (
          <div className="flex items-center justify-center h-full gap-2 text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading lineage…
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <AlertCircle size={24} className="text-red-400" />
            <p className="text-sm">Failed to load lineage data</p>
            <button onClick={load} className="flex items-center gap-1.5 text-xs text-blue-400 hover:underline">
              <RefreshCw size={11} /> Retry
            </button>
          </div>
        )}
        {status === 'ok' && graphData && !graphData.focal_node && (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            No lineage data available for this object.
          </div>
        )}
        {status === 'ok' && graphData?.focal_node && (
          <ReactFlowProvider>
            <LineageCanvas
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onZoomInRef={zoomInRef}
              onZoomOutRef={zoomOutRef}
              onFitViewRef={fitViewRef}
            />
          </ReactFlowProvider>
        )}
      </div>

      {selectedNode && graphData && (
        <LineageSidePanel
          node={selectedNode}
          allNodes={allNodes}
          allEdges={allEdges}
          onClose={() => setSelectedNode(null)}
          onNodeSelect={handleNodeSelect}
        />
      )}

      {status === 'ok' && graphData && (
        <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/40 flex items-center gap-4 flex-wrap text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded bg-blue-600" /> TABLE
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded bg-purple-600" /> VIEW
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded bg-green-600" /> MV
          </span>
          <span className="ml-auto opacity-70">
            {allNodes.length} objects · {allEdges.length} relationships · depth {depth}
          </span>
        </div>
      )}
    </div>
  )
}
