# Data Lineage Tab — Design Spec

**Date:** 2026-05-16  
**Branch:** feature/lineage  
**Status:** Approved

---

## Context

The asset detail page (`/dashboard/tables/[assetId]`) currently has three tabs: Quality, Schema, Profile Trends. This spec adds a **Lineage** tab between Schema and Profile Trends.

Lineage is derived **entirely from SQL view definitions** stored in `DataAsset.view_definition`. No primary/foreign key references are used. Upstream sources are tables/views referenced in the view's SQL (`FROM`/`JOIN` clauses). Downstream consumers are other DataAsset records whose `view_definition` references the current asset's table name. All graph nodes represent `DataAsset` objects matched by `sf_table_name` (same connection).

The visual design mirrors the Atlan-style lineage UI: an interactive ReactFlow graph on the left (~70% width) with a persistent detail panel on the right (~30% width) that updates when a node is clicked.

---

## Architecture

### Request Flow

```
Browser (LineageTab) → lineageApi.get(assetId) → GET /lineage/{asset_id}
  → parse DataAsset.view_definition with sqlglot
  → match table refs to DataAsset records (same connection)
  → join classifications, glossary terms, column count, row count
  → return upstream[] + downstream[]
```

### Backend

**New file:** `app/api/lineage.py`  
**New dependency:** `sqlglot` added to `requirements.txt`  
**Router registered in:** `app/main.py`

**Endpoint:** `GET /lineage/{asset_id}`

**Logic:**
1. Fetch `DataAsset` by `asset_id` (404 if not found)
2. **Upstream** (only if `view_definition` is not null):
   - Parse SQL with `sqlglot.parse_one(view_definition, dialect="snowflake")`
   - Walk AST to collect all `Table` nodes from `From` and `Join` expressions
   - Extract `sf_table_name` (unqualified name, case-insensitive)
   - Query `DataAsset` WHERE `UPPER(sf_table_name) IN (refs)` AND `connection_id = asset.connection_id`
3. **Downstream** (for all asset types):
   - Query `DataAsset` WHERE `view_definition ILIKE '%<sf_table_name>%'` AND `connection_id = asset.connection_id` AND `asset_id != asset_id`
   - Secondary filter: re-parse each candidate's SQL to confirm the reference is a real table reference (not just a string match in a comment/literal)
4. For each upstream/downstream node, fetch:
   - Column count: `COUNT(ColumnMetadata)` for that asset
   - Latest row count: most recent `ColumnProfileHistory.row_count` for that asset
   - Classifications: all `DataClassification.classification` for that asset
   - Glossary terms: all `GlossaryTerm.term_name` via `GlossaryTermAsset` join
5. Return structured JSON

**Response schema:**
```json
{
  "asset": {
    "asset_id": "...",
    "sf_table_name": "ORDERS_VIEW",
    "sf_schema_name": "FOOD_BEVERAGE",
    "sf_database_name": "ATLAN_SAMPLE_DATA",
    "table_type": "VIEW",
    "table_description": "...",
    "owner_name": "...",
    "technical_owner_name": "...",
    "column_count": 15,
    "row_count": 2690129,
    // Note: size_bytes not stored — omitted from panel
    "classifications": ["Public", "Confidential"],
    "terms": ["Beverages", "Customer"]
  },
  "upstream": [ /* same shape as asset */ ],
  "downstream": [ /* same shape as asset */ ]
}
```

### SQL Parsing (sqlglot)

```python
import sqlglot
import sqlglot.expressions as exp

def extract_table_refs(view_sql: str) -> list[str]:
    try:
        tree = sqlglot.parse_one(view_sql, dialect="snowflake")
    except Exception:
        return []
    refs = set()
    for table in tree.find_all(exp.Table):
        if table.name:
            refs.add(table.name.upper())
    return list(refs)
```

Handles: CTEs, subqueries, multi-join, LATERAL FLATTEN, aliased tables, schema-qualified names (`db.schema.table` → extracts `table`).

### Frontend

**New components** (in `frontend/src/components/lineage/`):

| File | Purpose |
|---|---|
| `LineageTab.tsx` | ReactFlow canvas + side panel layout, fetches data, manages selected node state |
| `LineageNode.tsx` | Custom ReactFlow node: table name, type icon, schema subtitle, "view columns" expander |
| `LineageSidePanel.tsx` | Right panel: rows/columns metrics, description, owners, classification tags, glossary terms |

**apiClient addition** (`frontend/src/services/apiClient.ts`):
```typescript
export const lineageApi = {
  get: (assetId: string) => api.get(`/lineage/${assetId}`),
}
```

**Tab injection** (`frontend/src/app/dashboard/tables/[assetId]/page.tsx` lines ~387-390):
Add `{ id: 'lineage', label: 'Lineage', icon: <GitFork size={14} /> }` between `schema` and `trends` entries. Add `import { GitFork } from 'lucide-react'`.

### Layout

```
┌─────────────────────────────────────┬──────────────┐
│  ReactFlow Graph (~70% width)       │  Side Panel  │
│                                     │  (300px)     │
│  [upstream]──→──[BASE]──→──[down]   │              │
│  [upstream]──↗          ↘──[down]   │  Asset name  │
│                                     │  Type badge  │
│  Legend: ↑ upstream  ↓ downstream   │  Rows/Cols   │
│  [zoom+] [zoom−] [fit] [search]     │  Description │
│                                     │  Owners      │
│                                     │  Tags/Terms  │
└─────────────────────────────────────┴──────────────┘
```

**Node design** (matching reference image):
- White card, rounded-8, 1px border, drop shadow
- BASE node: 2px blue border + blue glow ring
- Header: type icon (📋 TABLE / 👁 VIEW) + truncated table name
- Subtitle: `{table_type} in {sf_schema_name}`
- Footer: `▾ view columns` expand link (shows column list inline)
- Edges: animated bezier curves, `#93c5fd` blue stroke, arrowhead at target

**Side panel content** (updates on node click):
- Asset name (bold, full)
- Type + schema badge
- Metrics row: Rows (from `ColumnProfileHistory.row_count`) | Columns (count of `ColumnMetadata` rows) — no size metric, not stored
- Description (`table_description`)
- Owners: `owner_name` + `technical_owner_name` as avatar chips
- Classification: colored tags from `DataClassification`
- Terms: glossary term pills from `GlossaryTermAsset` → `GlossaryTerm`

**Empty states:**
- TABLE with no `view_definition` and no downstream: show "No lineage data available. This table has no view dependencies."
- VIEW with `view_definition` but no matching DataAsset refs: show upstream nodes with a note "Source tables not registered as assets"

---

## Files to Modify

| File | Change |
|---|---|
| `requirements.txt` | Add `sqlglot>=25.0.0` |
| `app/api/lineage.py` | **New file** — router with GET endpoint |
| `app/main.py` | Import and register `lineage` router |
| `frontend/src/services/apiClient.ts` | Add `lineageApi.get()` |
| `frontend/src/components/lineage/LineageTab.tsx` | **New file** |
| `frontend/src/components/lineage/LineageNode.tsx` | **New file** |
| `frontend/src/components/lineage/LineageSidePanel.tsx` | **New file** |
| `frontend/src/app/dashboard/tables/[assetId]/page.tsx` | Add Lineage tab entry + render `<LineageTab>` |

---

## Verification

1. **Backend unit test**: Given a VIEW with known `view_definition`, assert `extract_table_refs()` returns the correct table names
2. **API test**: `GET /lineage/{asset_id}` returns 200 with correct upstream/downstream arrays
3. **Frontend**: Open asset detail for a VIEW asset → Lineage tab appears between Schema and Profile Trends → graph renders with upstream/downstream nodes → clicking a node updates the side panel
4. **TABLE asset**: Lineage tab shows only downstream (or empty state if none)
5. **No view_definition**: Tab renders with empty state message, no errors
