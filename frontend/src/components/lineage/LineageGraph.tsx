'use client'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useState } from 'react'
import { GitBranch, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { useTheme } from '@/components/layout/ThemeProvider'
import { lineageNodeTypes } from './LineageNodes'
import type { LineageGraphData, GraphNode, TableNodeData } from './lineageTypes'
import { lineageApi } from '@/services/apiClient'

// ── Layout constants ───────────────────────────────────────────────
const NODE_W       = 260   // node width (solo mode uses 300 via data.showAllColumns)
const NODE_GAP     = 32    // vertical gap between nodes in a column
const PADDING_V    = 80    // vertical canvas padding
const COL_GAP_H    = 90    // horizontal gap between node columns
const COL_UP_X     = 40
const COL_CENTER_X = COL_UP_X + NODE_W + COL_GAP_H
const COL_DOWN_X   = COL_CENTER_X + NODE_W + COL_GAP_H

// Estimate node height based on column count (for vertical layout math)
function estimateNodeH(colCount: number, showAll: boolean): number {
  const header = 68
  const colHeader = colCount > 0 ? 24 : 0
  const colsShown = showAll ? colCount : Math.min(colCount, 7)
  const colRows = colsShown * 26
  const more = (!showAll && colCount > 7) ? 30 : 0
  const empty = colCount === 0 ? 44 : 0
  return header + colHeader + colRows + more + empty + 2
}

// ── Build ReactFlow nodes and edges ───────────────────────────────

function buildGraph(graph: LineageGraphData): { nodes: Node[]; edges: Edge[]; canvasH: number } {
  const hasSides = graph.upstream.length > 0 || graph.downstream.length > 0
  const showAll = !hasSides

  const currentH = estimateNodeH(graph.current.columns.length, showAll)

  // Calculate column heights for layout centering
  const upH = graph.upstream.map(n => estimateNodeH(n.columns.length, false))
  const dnH = graph.downstream.map(n => estimateNodeH(n.columns.length, false))

  const upTotal = upH.reduce((s, h) => s + h, 0) + Math.max(0, graph.upstream.length - 1) * NODE_GAP
  const dnTotal = dnH.reduce((s, h) => s + h, 0) + Math.max(0, graph.downstream.length - 1) * NODE_GAP

  const canvasH = Math.max(
    upTotal + PADDING_V * 2,
    dnTotal + PADDING_V * 2,
    currentH + PADDING_V * 2,
    400,
  )

  const centerY = canvasH / 2

  const nodes: Node[] = []
  const edges: Edge[] = []

  // Center node
  const centerId = `center-${graph.current.asset_id}`
  nodes.push({
    id:   centerId,
    type: 'tableNode',
    position: { x: hasSides ? COL_CENTER_X : (COL_CENTER_X + NODE_W / 2 - 20), y: centerY - currentH / 2 },
    data: {
      node:           graph.current,
      isCurrent:      true,
      direction:      'current',
      showAllColumns: showAll,
      label:          graph.current.sf_table_name,
    } satisfies TableNodeData,
    draggable: false,
  })

  // Upstream nodes + edges
  let upY = centerY - upTotal / 2
  graph.upstream.forEach((n, i) => {
    const h = upH[i]
    const nodeId = `up-${n.asset_id ?? n.lineage_id ?? i}`
    nodes.push({
      id:   nodeId,
      type: 'tableNode',
      position: { x: COL_UP_X, y: upY },
      data: {
        node:           n,
        isCurrent:      false,
        direction:      'upstream',
        showAllColumns: false,
        label:          n.sf_table_name,
      } satisfies TableNodeData,
      draggable: false,
    })
    edges.push({
      id:        `edge-up-${i}`,
      source:    nodeId,
      target:    centerId,
      type:      'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#818CF8' },
      style:     { stroke: '#818CF8', strokeWidth: 1.5 },
    })
    upY += h + NODE_GAP
  })

  // Downstream nodes + edges
  let dnY = centerY - dnTotal / 2
  graph.downstream.forEach((n, i) => {
    const h = dnH[i]
    const nodeId = `down-${n.asset_id ?? n.lineage_id ?? i}`
    nodes.push({
      id:   nodeId,
      type: 'tableNode',
      position: { x: COL_DOWN_X, y: dnY },
      data: {
        node:           n,
        isCurrent:      false,
        direction:      'downstream',
        showAllColumns: false,
        label:          n.sf_table_name,
      } satisfies TableNodeData,
      draggable: false,
    })
    edges.push({
      id:        `edge-down-${i}`,
      source:    centerId,
      target:    nodeId,
      type:      'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#34D399' },
      style:     { stroke: '#34D399', strokeWidth: 1.5 },
    })
    dnY += h + NODE_GAP
  })

  return { nodes, edges, canvasH }
}

// ── Empty / error states ───────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-gray-400 text-sm">
      <Loader2 size={16} className="animate-spin" />
      <span>Loading lineage graph…</span>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
      <AlertCircle size={24} className="text-red-400" />
      <p className="text-sm">Failed to load lineage data</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline"
      >
        <RefreshCw size={11} /> Retry
      </button>
    </div>
  )
}

// ── Legend ─────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="px-5 py-2 border-t border-gray-100 flex items-center gap-5 flex-wrap text-[10px] text-gray-400">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-[1.5px] bg-indigo-400 rounded" />
        Upstream flow
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-4 h-[1.5px] bg-emerald-400 rounded" />
        Downstream flow
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-[7px] h-[7px] rounded-full border border-amber-400 bg-amber-100" />
        Primary key
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-[7px] h-[7px] rounded-full border border-violet-400 bg-violet-100" />
        Foreign key
      </span>
      <span className="ml-auto opacity-60">
        Scroll/pinch to zoom · Click a table to navigate
      </span>
    </div>
  )
}

// ── Main LineageGraph ──────────────────────────────────────────────

export default function LineageGraph({ assetId }: { assetId: string }) {
  const { theme } = useTheme()
  const [graph, setGraph]   = useState<LineageGraphData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [canvasH, setCanvasH] = useState(480)

  const load = () => {
    setStatus('loading')
    ;(lineageApi as any).graph(assetId)
      .then((res: any) => {
        const data: LineageGraphData = res.data
        setGraph(data)
        const { nodes: n, edges: e, canvasH: h } = buildGraph(data)
        setNodes(n)
        setEdges(e)
        setCanvasH(h)
        setStatus('ok')
      })
      .catch(() => setStatus('error'))
  }

  useEffect(() => { load() }, [assetId])

  const upCount = graph?.upstream.length ?? 0
  const dnCount = graph?.downstream.length ?? 0
  const hasSides = upCount > 0 || dnCount > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <GitBranch size={14} className="text-gray-400 shrink-0" />
        <span className="text-sm font-semibold text-gray-800">Data Lineage</span>
        {status === 'ok' && (
          <span className="text-xs text-gray-400">
            {hasSides
              ? `${upCount} upstream · ${dnCount} downstream`
              : 'No lineage connections — showing all columns'}
          </span>
        )}
        {status === 'ok' && graph && (
          <div className="ml-auto flex items-center gap-3 text-[10px] text-gray-400">
            {(graph.upstream.some(n => n.source === 'fk_detection') ||
              graph.downstream.some(n => n.source === 'fk_detection')) && (
              <span className="px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-500 font-medium">
                FK auto-detected
              </span>
            )}
          </div>
        )}
      </div>

      {/* Canvas */}
      <div style={{ height: status === 'ok' ? canvasH : 320 }} className="relative">
        {status === 'loading' && <Skeleton />}
        {status === 'error'   && <ErrorState onRetry={load} />}
        {status === 'ok' && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={lineageNodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18, includeHiddenNodes: false }}
            minZoom={0.2}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
            colorMode={theme === 'dark' ? 'dark' : 'light'}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1}
              color={theme === 'dark' ? 'rgba(99,102,241,0.1)' : '#DDE3EB'}
            />
            <Controls
              showFitView
              showZoom
              showInteractive={false}
              position="bottom-right"
            />
          </ReactFlow>
        )}
      </div>

      {/* Legend */}
      {status === 'ok' && <Legend />}
    </div>
  )
}
