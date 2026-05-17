# Data Lineage Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Lineage tab between Schema and Profile Trends on the asset detail page, showing an interactive upstream/downstream graph derived from SQL view definitions stored in `DataAsset.view_definition`.

**Architecture:** A new `GET /lineage/{asset_id}` endpoint parses the asset's `view_definition` with sqlglot to extract upstream table references, then scans other assets' view definitions to find downstream consumers. All lineage is derived from `DataAsset` records matched by `sf_table_name` — no PK/FK relationships used. The frontend renders the result as a ReactFlow graph (already installed: `@xyflow/react ^12.10.2`) with a click-to-update side panel.

**Tech Stack:** Python/FastAPI (backend), sqlglot (SQL parsing), Next.js 15/TypeScript/Tailwind (frontend), @xyflow/react 12 (graph), SQLAlchemy async (DB queries)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `requirements.txt` | Add sqlglot |
| Create | `app/api/lineage.py` | FastAPI router: parse SQL, query assets, return lineage |
| Modify | `app/main.py:16-26` | Import and register lineage router |
| Create | `tests/test_lineage.py` | Unit tests for SQL parser + API |
| Create | `frontend/src/types/lineage.ts` | TypeScript interfaces: `LineageAsset`, `LineageResponse` |
| Modify | `frontend/src/services/apiClient.ts:394` | Add `lineageApi.get()` |
| Create | `frontend/src/components/lineage/LineageNode.tsx` | Custom ReactFlow node (card with table info + expand) |
| Create | `frontend/src/components/lineage/LineageSidePanel.tsx` | Right panel: metrics, description, owners, tags, terms |
| Create | `frontend/src/components/lineage/LineageTab.tsx` | ReactFlow canvas + layout + side panel wiring |
| Modify | `frontend/src/app/dashboard/tables/[assetId]/page.tsx:386-408` | Inject Lineage tab between Schema and Profile Trends |

---

## Task 1: Add sqlglot and SQL parsing utility

**Files:**
- Modify: `requirements.txt`
- Create: `app/api/lineage.py` (parsing function only)
- Create: `tests/test_lineage.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_lineage.py`:

```python
import pytest
from app.api.lineage import extract_table_refs


def test_simple_from_join():
    sql = "SELECT a.col1, b.col2 FROM orders a JOIN customers b ON a.id = b.id"
    refs = extract_table_refs(sql)
    assert "ORDERS" in refs
    assert "CUSTOMERS" in refs


def test_cte():
    sql = """
    WITH base AS (SELECT * FROM raw_orders WHERE status = 'active')
    SELECT b.*, p.name FROM base b JOIN products p ON b.product_id = p.id
    """
    refs = extract_table_refs(sql)
    assert "RAW_ORDERS" in refs
    assert "PRODUCTS" in refs


def test_schema_qualified_name():
    sql = "SELECT * FROM mydb.myschema.my_table t INNER JOIN myschema.other_table o ON t.id = o.id"
    refs = extract_table_refs(sql)
    assert "MY_TABLE" in refs
    assert "OTHER_TABLE" in refs


def test_bad_sql_returns_empty():
    assert extract_table_refs("this is not sql @@##") == []


def test_empty_string_returns_empty():
    assert extract_table_refs("") == []


def test_returns_uppercase():
    sql = "SELECT * FROM MyMixedCaseTable"
    refs = extract_table_refs(sql)
    assert "MYMIXEDCASETABLE" in refs
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_lineage.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.api.lineage'`

- [ ] **Step 3: Add sqlglot to requirements.txt**

Append to `requirements.txt`:
```
sqlglot>=25.0.0
```

Install:
```bash
pip install sqlglot
```

- [ ] **Step 4: Create app/api/lineage.py with the parsing function**

```python
import logging
import sqlglot
import sqlglot.expressions as exp
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.db.database import get_db
from app.db.models import (
    DataAsset, ColumnMetadata, ColumnProfileHistory,
    DataClassification, GlossaryTerm, GlossaryTermAsset,
)
from app.core.security import get_current_user

logger = logging.getLogger("dq_platform.lineage")

router = APIRouter(prefix="/lineage", tags=["Lineage"])


def extract_table_refs(view_sql: str) -> list[str]:
    """Return upper-cased table names from every FROM/JOIN in the view SQL."""
    if not view_sql:
        return []
    try:
        tree = sqlglot.parse_one(view_sql, dialect="snowflake")
    except Exception:
        return []
    refs: set[str] = set()
    for table in tree.find_all(exp.Table):
        if table.name:
            refs.add(table.name.upper())
    return list(refs)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_lineage.py -v
```

Expected: all 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add requirements.txt app/api/lineage.py tests/test_lineage.py
git commit -m "feat: add sqlglot dependency and SQL table-ref parser for lineage"
```

---

## Task 2: Backend lineage API endpoint

**Files:**
- Modify: `app/api/lineage.py` (add `_enrich` helper + `get_lineage` endpoint)

- [ ] **Step 1: Write the failing API test**

Add to `tests/test_lineage.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_get_lineage_404():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/lineage/nonexistent-id-12345")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_extract_refs_used_for_upstream():
    """extract_table_refs is the source of truth for upstream detection."""
    from app.api.lineage import extract_table_refs
    sql = "SELECT o.*, c.name FROM ORDERS o JOIN CUSTOMERS c ON o.cust_id = c.id"
    refs = extract_table_refs(sql)
    assert set(refs) == {"ORDERS", "CUSTOMERS"}
```

- [ ] **Step 2: Run to verify the 404 test currently fails (no route yet)**

```bash
pytest tests/test_lineage.py::test_get_lineage_404 -v
```

Expected: FAIL — no `/lineage` route registered yet

- [ ] **Step 3: Add `_enrich` helper and the GET endpoint to app/api/lineage.py**

Append below the `extract_table_refs` function:

```python
async def _enrich(asset: DataAsset, db: AsyncSession) -> dict:
    """Build the serialisable node dict for one DataAsset."""
    col_result = await db.execute(
        select(func.count()).select_from(ColumnMetadata).where(
            ColumnMetadata.asset_id == asset.asset_id
        )
    )
    col_count: int = col_result.scalar() or 0

    row_result = await db.execute(
        select(ColumnProfileHistory.row_count)
        .where(ColumnProfileHistory.asset_id == asset.asset_id)
        .order_by(ColumnProfileHistory.profile_date.desc())
        .limit(1)
    )
    row_count = row_result.scalar()

    cls_result = await db.execute(
        select(DataClassification.classification)
        .where(DataClassification.asset_id == asset.asset_id)
    )
    classifications = list(cls_result.scalars().all())

    terms_result = await db.execute(
        select(GlossaryTerm.term_name)
        .join(GlossaryTermAsset, GlossaryTerm.term_id == GlossaryTermAsset.term_id)
        .where(GlossaryTermAsset.asset_id == asset.asset_id)
    )
    terms = list(terms_result.scalars().all())

    return {
        "asset_id": asset.asset_id,
        "sf_table_name": asset.sf_table_name,
        "sf_schema_name": asset.sf_schema_name,
        "sf_database_name": asset.sf_database_name,
        "table_type": asset.table_type,
        "table_description": asset.table_description,
        "owner_name": asset.owner_name,
        "technical_owner_name": asset.technical_owner_name,
        "column_count": col_count,
        "row_count": row_count,
        "classifications": classifications,
        "terms": terms,
    }


@router.get("/{asset_id}")
async def get_lineage(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    asset = await db.get(DataAsset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    # ── Upstream: tables/views referenced in this asset's view SQL ──────────
    upstream_assets: list[DataAsset] = []
    if asset.view_definition:
        refs = extract_table_refs(asset.view_definition)
        if refs:
            result = await db.execute(
                select(DataAsset).where(
                    and_(
                        func.upper(DataAsset.sf_table_name).in_(refs),
                        DataAsset.connection_id == asset.connection_id,
                        DataAsset.asset_id != asset_id,
                    )
                )
            )
            upstream_assets = list(result.scalars().all())

    # ── Downstream: other views whose SQL references this asset's table name ─
    downstream_assets: list[DataAsset] = []
    candidate_result = await db.execute(
        select(DataAsset).where(
            and_(
                DataAsset.view_definition.ilike(f"%{asset.sf_table_name}%"),
                DataAsset.connection_id == asset.connection_id,
                DataAsset.asset_id != asset_id,
            )
        )
    )
    for candidate in candidate_result.scalars().all():
        refs = extract_table_refs(candidate.view_definition or "")
        if asset.sf_table_name.upper() in refs:
            downstream_assets.append(candidate)

    return {
        "asset": await _enrich(asset, db),
        "upstream": [await _enrich(a, db) for a in upstream_assets],
        "downstream": [await _enrich(a, db) for a in downstream_assets],
    }
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_lineage.py -v
```

Expected: all 8 tests PASS (the 404 now returns 404 because the asset doesn't exist in DB)

- [ ] **Step 5: Commit**

```bash
git add app/api/lineage.py tests/test_lineage.py
git commit -m "feat: add lineage API endpoint with upstream/downstream resolution"
```

---

## Task 3: Register lineage router in main.py

**Files:**
- Modify: `app/main.py`

- [ ] **Step 1: Add lineage to the import block**

In `app/main.py`, the import block at line 16 reads:
```python
from app.api import (
    domains, subdomains, assets, rules, schedules, executions,
    dashboard, ai, alerts, audit, config, connections,
    # §53 Catalog & Governance
    glossary, classifications, columns, data_products,
    comments, announcements, access_requests, tags, usage, catalog,
    # §54-§68 Advanced features
    governance, contracts, compliance, cost, incidents,
    anomaly, marketplace, mesh, observability, cicd,
    privacy, admin,
)
```

Change to:
```python
from app.api import (
    domains, subdomains, assets, rules, schedules, executions,
    dashboard, ai, alerts, audit, config, connections,
    # §53 Catalog & Governance
    glossary, classifications, columns, data_products,
    comments, announcements, access_requests, tags, usage, catalog,
    lineage,
    # §54-§68 Advanced features
    governance, contracts, compliance, cost, incidents,
    anomaly, marketplace, mesh, observability, cicd,
    privacy, admin,
)
```

- [ ] **Step 2: Register the router**

After line 176 (`app.include_router(catalog.router)`), add:
```python
app.include_router(lineage.router)
```

- [ ] **Step 3: Verify the app starts**

```bash
python -c "from app.main import app; print('OK')"
```

Expected output: `OK`

- [ ] **Step 4: Verify the route is registered**

```bash
python -c "from app.main import app; routes = [r.path for r in app.routes]; print([r for r in routes if 'lineage' in r])"
```

Expected: `['/lineage/{asset_id}']`

- [ ] **Step 5: Commit**

```bash
git add app/main.py
git commit -m "feat: register lineage router in main.py"
```

---

## Task 4: Frontend TypeScript types

**Files:**
- Create: `frontend/src/types/lineage.ts`

- [ ] **Step 1: Create the type file**

```typescript
// frontend/src/types/lineage.ts

export interface LineageAsset {
  asset_id: string
  sf_table_name: string
  sf_schema_name: string
  sf_database_name: string | null
  table_type: string | null
  table_description: string | null
  owner_name: string | null
  technical_owner_name: string | null
  column_count: number
  row_count: number | null
  classifications: string[]
  terms: string[]
}

export interface LineageResponse {
  asset: LineageAsset
  upstream: LineageAsset[]
  downstream: LineageAsset[]
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/lineage.ts
git commit -m "feat: add LineageAsset and LineageResponse TypeScript interfaces"
```

---

## Task 5: Add lineageApi to apiClient.ts

**Files:**
- Modify: `frontend/src/services/apiClient.ts`

- [ ] **Step 1: Append lineageApi after the last export (adminApi at line 390)**

At the very end of `frontend/src/services/apiClient.ts` (after line 394 `}`), add:

```typescript

// Lineage
export const lineageApi = {
  get: (assetId: string) => api.get(`/lineage/${assetId}`),
}
```

- [ ] **Step 2: Verify type-check passes**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/apiClient.ts
git commit -m "feat: add lineageApi.get() to apiClient"
```

---

## Task 6: LineageNode custom ReactFlow component

**Files:**
- Create: `frontend/src/components/lineage/LineageNode.tsx`

- [ ] **Step 1: Create LineageNode.tsx**

```tsx
'use client'
import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LineageAsset } from '@/types/lineage'

export type LineageNodeData = LineageAsset & {
  isBase: boolean
  onSelect: (asset: LineageAsset) => void
}

export function LineageNode({ data }: NodeProps) {
  const d = data as LineageNodeData
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
```

- [ ] **Step 2: Verify type-check passes**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/lineage/LineageNode.tsx
git commit -m "feat: add LineageNode custom ReactFlow node component"
```

---

## Task 7: LineageSidePanel component

**Files:**
- Create: `frontend/src/components/lineage/LineageSidePanel.tsx`

- [ ] **Step 1: Create LineageSidePanel.tsx**

```tsx
import type { LineageAsset } from '@/types/lineage'

interface Props {
  asset: LineageAsset | null
  onClose: () => void
}

export function LineageSidePanel({ asset, onClose }: Props) {
  if (!asset) {
    return (
      <div className="w-[300px] border-l border-gray-200 bg-white flex items-center justify-center shrink-0">
        <p className="text-sm text-gray-400 px-4 text-center">Click a node to see details</p>
      </div>
    )
  }

  const isView = asset.table_type?.toUpperCase().includes('VIEW') ?? false
  const owners = [asset.owner_name, asset.technical_owner_name].filter(Boolean) as string[]

  return (
    <div className="w-[300px] border-l border-gray-200 bg-white flex flex-col overflow-y-auto shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 break-words leading-tight">{asset.sf_table_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isView ? '👁 View' : '📋 Table'} · {asset.sf_schema_name}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 mt-0.5"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {/* Row / Column metrics */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Overview</p>
        <div className="flex divide-x divide-gray-100">
          <div className="flex-1 text-center px-2">
            <p className="text-lg font-bold text-blue-600">
              {asset.row_count != null ? asset.row_count.toLocaleString() : '—'}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">Rows</p>
          </div>
          <div className="flex-1 text-center px-2">
            <p className="text-lg font-bold text-blue-600">{asset.column_count}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Columns</p>
          </div>
        </div>
      </div>

      {/* Description */}
      {asset.table_description && (
        <div className="p-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Description</p>
          <p className="text-xs text-gray-600 leading-relaxed">{asset.table_description}</p>
        </div>
      )}

      {/* Owners */}
      {owners.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Owners</p>
          <div className="flex flex-wrap gap-1.5">
            {owners.map(name => (
              <span
                key={name}
                className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-2 py-1 text-xs text-gray-600"
              >
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[8px] font-bold flex items-center justify-center shrink-0">
                  {name[0].toUpperCase()}
                </span>
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Classification */}
      {asset.classifications.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Classification</p>
          <div className="flex flex-wrap gap-1.5">
            {asset.classifications.map(c => (
              <span
                key={c}
                className="px-2 py-0.5 text-xs rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-medium"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Terms */}
      {asset.terms.length > 0 && (
        <div className="p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Terms</p>
          <div className="flex flex-wrap gap-1.5">
            {asset.terms.map(t => (
              <span
                key={t}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 border border-blue-200"
              >
                📄 {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check passes**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/lineage/LineageSidePanel.tsx
git commit -m "feat: add LineageSidePanel with metrics, owners, classification, terms"
```

---

## Task 8: LineageTab main component

**Files:**
- Create: `frontend/src/components/lineage/LineageTab.tsx`

- [ ] **Step 1: Create LineageTab.tsx**

```tsx
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
    data: { ...a, isBase, onSelect } as unknown as LineageNodeData,
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
```

- [ ] **Step 2: Verify type-check passes**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/lineage/LineageTab.tsx
git commit -m "feat: add LineageTab with ReactFlow graph and side panel wiring"
```

---

## Task 9: Inject Lineage tab into asset detail page

**Files:**
- Modify: `frontend/src/app/dashboard/tables/[assetId]/page.tsx`

- [ ] **Step 1: Add GitFork import**

In `page.tsx`, find the lucide-react import line (near the top). Add `GitFork` to it. Example — if the line reads:

```tsx
import { Shield, Columns, TrendingUp, ... } from 'lucide-react'
```

Change to include `GitFork`:

```tsx
import { Shield, Columns, TrendingUp, GitFork, ... } from 'lucide-react'
```

- [ ] **Step 2: Add LineageTab import**

Add near the other component imports at the top of `page.tsx`:

```tsx
import { LineageTab } from '@/components/lineage/LineageTab'
```

- [ ] **Step 3: Update the activeTab type**

Find the line that declares `activeTab` state. It currently reads something like:

```tsx
const [activeTab, setActiveTab] = useState<'quality' | 'schema' | 'trends'>('quality')
```

Change to:

```tsx
const [activeTab, setActiveTab] = useState<'quality' | 'schema' | 'lineage' | 'trends'>('quality')
```

- [ ] **Step 4: Add Lineage tab to the tab list**

The tab array at lines 386-390 reads:

```tsx
{([
  { id: 'quality',  label: 'Quality',         icon: <Shield size={14} /> },
  { id: 'schema',   label: 'Schema',           icon: <Columns size={14} /> },
  { id: 'trends',   label: 'Profile Trends',   icon: <TrendingUp size={14} /> },
] as const).map(tab => (
```

Change to:

```tsx
{([
  { id: 'quality',  label: 'Quality',         icon: <Shield size={14} /> },
  { id: 'schema',   label: 'Schema',           icon: <Columns size={14} /> },
  { id: 'lineage',  label: 'Lineage',          icon: <GitFork size={14} /> },
  { id: 'trends',   label: 'Profile Trends',   icon: <TrendingUp size={14} /> },
] as const).map(tab => (
```

- [ ] **Step 5: Render the Lineage tab panel**

Find the comment `{/* ── Schema tab */}` and the block immediately after the schema closing tag (look for `{/* ── Profile Trends tab */}` or `{activeTab === 'trends'`). Insert the lineage panel between them:

```tsx
      {/* ── Lineage tab ─────────────────────────────────────────── */}
      {activeTab === 'lineage' && (
        <div className="py-4">
          <LineageTab assetId={assetId} />
        </div>
      )}
```

- [ ] **Step 6: Verify type-check passes**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 7: Run the dev server and manually verify**

```bash
cd frontend && npm run dev
```

1. Open http://localhost:3000
2. Navigate to any asset detail page (`/dashboard/tables/<assetId>`)
3. Confirm "Lineage" tab appears between Schema and Profile Trends
4. Click Lineage — for a VIEW asset with `view_definition`, the graph should render with upstream and downstream nodes
5. Click any node — the right panel should update with that asset's rows, columns, description, owners, classifications, and terms
6. For a TABLE asset with no `view_definition`, confirm the empty-state message renders without errors

- [ ] **Step 8: Run all tests**

```bash
pytest tests/ -v
```

Expected: all tests pass (no regressions)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/dashboard/tables/\[assetId\]/page.tsx
git commit -m "feat: inject Lineage tab between Schema and Profile Trends on asset detail page"
```

---

## Verification Checklist

| Check | How |
|-------|-----|
| SQL parser handles CTEs, schema-qualified names, bad SQL | `pytest tests/test_lineage.py -v` |
| API returns 404 for unknown asset | `pytest tests/test_lineage.py::test_get_lineage_404 -v` |
| Lineage tab appears between Schema and Profile Trends | Visual in browser |
| Graph renders upstream nodes on left, BASE in center, downstream on right | Visual — open a VIEW asset |
| Clicking a node updates the side panel | Visual — click each node |
| TABLE asset with no view_definition shows empty state | Visual — open a TABLE asset |
| No PK/FK references used anywhere | Code review — grep `is_primary_key\|is_foreign_key` in `app/api/lineage.py` (should return nothing) |
| Type-check clean | `cd frontend && npm run type-check` |
| All backend tests pass | `pytest tests/ -v` |
