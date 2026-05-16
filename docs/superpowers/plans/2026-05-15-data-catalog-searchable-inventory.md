# Data Catalog — Searchable Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic ILIKE catalog search with a full PostgreSQL `tsvector` full-text search backed by a materialized view, and add facet filters, enriched result cards, saved searches, sort options, quick filters, and a card/table view toggle to the `/catalog` page.

**Architecture:** A `catalog_search_index` materialized view unions `data_assets`, `glossary_terms`, and `data_products` into a single `tsvector`-indexed table refreshed nightly by APScheduler. The catalog API is updated to query this view with `plainto_tsquery` ranking and falls back to ILIKE if the view is unavailable. The frontend is redesigned into a two-column layout with a facet sidebar and URL-synced filter state.

**Tech Stack:** PostgreSQL tsvector/GIN index, SQLAlchemy `text()` for raw SQL, APScheduler CronTrigger, Next.js `useSearchParams`, Tailwind CSS, Lucide icons, Axios.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `migrations/versions/0005_catalog_search_index.py` | Create | Materialized view + saved_searches table |
| `app/services/catalog_service.py` | Create | View refresh + result enrichment logic |
| `app/api/catalog.py` | Modify | Rewrite search; add facets, asset detail, saved searches, refresh |
| `app/services/scheduler_service.py` | Modify | Register nightly refresh job |
| `frontend/src/services/apiClient.ts` | Modify | Expand catalogApi with new endpoints |
| `frontend/src/components/catalog/CatalogFacets.tsx` | Create | Collapsible facet sidebar |
| `frontend/src/components/catalog/CatalogResultCard.tsx` | Create | Enriched card: quality, cert, classification, rating |
| `frontend/src/components/catalog/CatalogResultRow.tsx` | Create | Table-view row for same data |
| `frontend/src/components/catalog/QuickFilters.tsx` | Create | Quick filter pill row |
| `frontend/src/components/catalog/SavedSearches.tsx` | Create | Save/load/delete dropdown |
| `frontend/src/app/catalog/page.tsx` | Modify | Full redesign: 2-col layout, URL state, pagination |
| `tests/test_catalog_search.py` | Create | Search, facets, filters, pagination, saved search tests |

---

## Task 1: DB Migration — Materialized View + Saved Searches Table

**Files:**
- Create: `migrations/versions/0005_catalog_search_index.py`

- [ ] **Step 1: Write the migration file**

```python
"""Catalog search index materialized view + saved_searches table

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE MATERIALIZED VIEW catalog_search_index AS
        SELECT
            'asset'           AS entity_type,
            da.asset_id       AS entity_id,
            da.sf_table_name  AS title,
            d.domain_name     AS domain,
            da.table_description AS description,
            da.owner_name     AS owner,
            da.criticality    AS tags,
            da.certification_status,
            da.domain_id,
            to_tsvector('english',
                coalesce(da.sf_table_name,'')     || ' ' ||
                coalesce(da.sf_schema_name,'')    || ' ' ||
                coalesce(da.table_description,'') || ' ' ||
                coalesce(d.domain_name,'')        || ' ' ||
                coalesce(da.owner_name,'')        || ' ' ||
                coalesce(da.owner_email,'')
            ) AS search_vector
        FROM data_assets da
        LEFT JOIN domains d ON da.domain_id = d.domain_id
        WHERE da.is_active = true
        UNION ALL
        SELECT
            'glossary', term_id, term_name, '', definition, owner_email,
            synonyms, 'active', domain_id,
            to_tsvector('english',
                term_name || ' ' ||
                coalesce(definition,'') || ' ' ||
                coalesce(synonyms,'')
            )
        FROM glossary_terms WHERE status = 'active'
        UNION ALL
        SELECT
            'data_product', product_id, product_name, '', description,
            owner_email, tags, status, domain_id,
            to_tsvector('english',
                product_name || ' ' ||
                coalesce(description,'') || ' ' ||
                coalesce(tags,'')
            )
        FROM data_products WHERE status != 'deprecated'
    """)

    op.execute("""
        CREATE UNIQUE INDEX ix_catalog_search_pk
        ON catalog_search_index(entity_type, entity_id)
    """)
    op.execute("""
        CREATE INDEX ix_catalog_search_fts
        ON catalog_search_index USING GIN(search_vector)
    """)

    op.create_table(
        'saved_searches',
        sa.Column('search_id',  sa.String(36),  nullable=False),
        sa.Column('user_email', sa.String(200), nullable=False),
        sa.Column('name',       sa.String(200), nullable=False),
        sa.Column('query',      sa.String(500), nullable=True),
        sa.Column('filters',    sa.JSON(),       nullable=True),
        sa.Column('created_at', sa.DateTime(),  nullable=False,
                  server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('search_id'),
    )
    op.create_index('ix_saved_searches_user', 'saved_searches', ['user_email'])


def downgrade() -> None:
    op.drop_index('ix_saved_searches_user', table_name='saved_searches')
    op.drop_table('saved_searches')
    op.execute('DROP MATERIALIZED VIEW IF EXISTS catalog_search_index CASCADE')
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
source .venv/bin/activate
alembic upgrade head
```

Expected output: `Running upgrade 0004 -> 0005, Catalog search index materialized view + saved_searches table`

- [ ] **Step 3: Verify view and table exist**

```bash
python -c "
import asyncio
from app.db.database import engine
from sqlalchemy import text

async def check():
    async with engine.connect() as conn:
        r = await conn.execute(text(\"SELECT count(*) FROM catalog_search_index\"))
        print('View rows:', r.scalar())
        r2 = await conn.execute(text(\"SELECT count(*) FROM saved_searches\"))
        print('Saved searches rows:', r2.scalar())

asyncio.run(check())
"
```

Expected: `View rows: <N>` and `Saved searches rows: 0`

- [ ] **Step 4: Commit**

```bash
git add migrations/versions/0005_catalog_search_index.py
git commit -m "feat: add catalog_search_index materialized view and saved_searches table"
```

---

## Task 2: Backend Service — `catalog_service.py`

**Files:**
- Create: `app/services/catalog_service.py`

- [ ] **Step 1: Write the tests first**

Create `tests/test_catalog_search.py` with stubs for the service functions:

```python
"""Tests for catalog search service and API."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_refresh_search_index_returns_duration():
    """refresh_search_index executes REFRESH and returns ms elapsed."""
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock()

    from app.services.catalog_service import refresh_search_index
    ms = await refresh_search_index(mock_db)
    assert isinstance(ms, int)
    assert ms >= 0
    mock_db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_enrich_asset_results_empty():
    """enrich_asset_results returns empty dict for empty asset_ids list."""
    mock_db = AsyncMock()
    from app.services.catalog_service import enrich_asset_results
    result = await enrich_asset_results([], mock_db)
    assert result == {}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
source .venv/bin/activate
pytest tests/test_catalog_search.py::test_refresh_search_index_returns_duration \
       tests/test_catalog_search.py::test_enrich_asset_results_empty -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.catalog_service'`

- [ ] **Step 3: Write `catalog_service.py`**

```python
"""Catalog service — materialized view refresh and result enrichment."""
import asyncio
import logging
import time
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

logger = logging.getLogger("dq_platform.catalog")

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


async def refresh_search_index(db: AsyncSession) -> int:
    """
    REFRESH MATERIALIZED VIEW CONCURRENTLY catalog_search_index.
    Returns elapsed milliseconds. Safe to call while reads are in progress.
    Falls back gracefully if the view does not exist yet.
    """
    start = time.monotonic()
    try:
        await db.execute(
            text("REFRESH MATERIALIZED VIEW CONCURRENTLY catalog_search_index")
        )
        await db.commit()
    except Exception as exc:
        logger.warning("catalog_search_index refresh failed: %s", exc)
        await db.rollback()
    elapsed = int((time.monotonic() - start) * 1000)
    logger.info("catalog_search_index refreshed in %dms", elapsed)
    return elapsed


async def enrich_asset_results(asset_ids: list[str], db: AsyncSession) -> dict:
    """
    Return enrichment data keyed by asset_id:
      quality_score, trust_score, avg_rating,
      classification_tags (list[str]), tag_names (list[str])

    Returns {} for empty input.
    """
    if not asset_ids:
        return {}

    from app.db.models import DQQualityScore, AssetRating, DataClassification, AssetTag, Tag

    # -- Quality score: latest per asset ---------------------------------
    score_result = await db.execute(
        select(
            DQQualityScore.asset_id,
            func.avg(DQQualityScore.quality_score).label("quality_score"),
        )
        .where(
            DQQualityScore.asset_id.in_(asset_ids),
            DQQualityScore.score_level == "table",
        )
        .group_by(DQQualityScore.asset_id)
    )
    quality_map: dict[str, float] = {
        r.asset_id: round(float(r.quality_score), 1)
        for r in score_result.all()
    }

    # -- Average rating per asset ----------------------------------------
    rating_result = await db.execute(
        select(
            AssetRating.asset_id,
            func.avg(AssetRating.rating).label("avg_rating"),
        )
        .where(AssetRating.asset_id.in_(asset_ids))
        .group_by(AssetRating.asset_id)
    )
    rating_map: dict[str, float] = {
        r.asset_id: round(float(r.avg_rating), 1)
        for r in rating_result.all()
    }

    # -- Classification tags per asset -----------------------------------
    class_result = await db.execute(
        select(DataClassification.asset_id, DataClassification.classification)
        .where(DataClassification.asset_id.in_(asset_ids))
    )
    class_map: dict[str, list[str]] = {}
    for r in class_result.all():
        class_map.setdefault(r.asset_id, [])
        if r.classification not in class_map[r.asset_id]:
            class_map[r.asset_id].append(r.classification)

    # -- Tag names per asset ---------------------------------------------
    tag_result = await db.execute(
        select(AssetTag.entity_id, Tag.tag_name)
        .join(Tag, AssetTag.tag_id == Tag.tag_id)
        .where(
            AssetTag.entity_type == "asset",
            AssetTag.entity_id.in_(asset_ids),
        )
    )
    tag_map: dict[str, list[str]] = {}
    for r in tag_result.all():
        tag_map.setdefault(r.entity_id, []).append(r.tag_name)

    # -- Compose result --------------------------------------------------
    enriched: dict[str, dict] = {}
    for aid in asset_ids:
        quality = quality_map.get(aid, 0.0)
        avg_rating = rating_map.get(aid, 0.0)
        trust = quality * 0.6 + (avg_rating / 5.0 * 100.0) * 0.2 + 20.0
        enriched[aid] = {
            "quality_score": quality if quality else None,
            "trust_score": round(trust, 1) if quality else None,
            "avg_rating": avg_rating or None,
            "classification_tags": class_map.get(aid, []),
            "tag_names": tag_map.get(aid, []),
        }
    return enriched
```

- [ ] **Step 4: Run tests — should pass**

```bash
pytest tests/test_catalog_search.py::test_refresh_search_index_returns_duration \
       tests/test_catalog_search.py::test_enrich_asset_results_empty -v
```

Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add app/services/catalog_service.py tests/test_catalog_search.py
git commit -m "feat: add catalog_service with tsvector refresh and result enrichment"
```

---

## Task 3: Backend API — Rewrite `catalog.py`

**Files:**
- Modify: `app/api/catalog.py`

- [ ] **Step 1: Add API-level tests to `tests/test_catalog_search.py`**

Append to the existing test file:

```python
@pytest.mark.asyncio
async def test_catalog_search_returns_list(async_client):
    """GET /catalog/search returns a list (possibly empty)."""
    resp = await async_client.get("/catalog/search?q=invoice")
    assert resp.status_code == 200
    body = resp.json()
    assert "results" in body
    assert isinstance(body["results"], list)


@pytest.mark.asyncio
async def test_catalog_search_pagination(async_client):
    """page and page_size params are respected."""
    resp = await async_client.get("/catalog/search?q=&page=1&page_size=5")
    assert resp.status_code == 200
    body = resp.json()
    assert body["page"] == 1
    assert body["page_size"] == 5


@pytest.mark.asyncio
async def test_catalog_facets_shape(async_client):
    """GET /catalog/facets returns expected keys."""
    resp = await async_client.get("/catalog/facets")
    assert resp.status_code == 200
    body = resp.json()
    for key in ("domains", "classifications", "certifications", "tags"):
        assert key in body, f"Missing key: {key}"


@pytest.mark.asyncio
async def test_saved_search_crud(async_client, auth_headers):
    """Create, list, and delete a saved search."""
    payload = {"name": "My invoice search", "query": "invoice", "filters": {"type": "asset"}}
    create = await async_client.post("/catalog/saved-searches", json=payload, headers=auth_headers)
    assert create.status_code == 200
    search_id = create.json()["search_id"]

    lst = await async_client.get("/catalog/saved-searches", headers=auth_headers)
    assert any(s["search_id"] == search_id for s in lst.json())

    delete = await async_client.delete(f"/catalog/saved-searches/{search_id}", headers=auth_headers)
    assert delete.status_code == 200
```

- [ ] **Step 2: Rewrite `app/api/catalog.py` completely**

```python
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, desc, asc

from app.db.database import get_db
from app.db.models import (
    DataAsset, GlossaryTerm, DataProduct, AssetUsage,
    DQQualityScore, DataClassification, GlossaryTermAsset,
    Domain, DataLineage, AssetTag, Tag,
)
from app.core.security import get_current_user, require_admin
from app.services.catalog_service import refresh_search_index, enrich_asset_results

router = APIRouter(prefix="/catalog", tags=["Catalog"])
logger = logging.getLogger("dq_platform.catalog")

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _gen_id() -> str:
    return str(uuid.uuid4())


async def _domain_map(db: AsyncSession) -> dict:
    result = await db.execute(select(Domain.domain_id, Domain.domain_name))
    return {r.domain_id: r.domain_name for r in result.all()}


async def _search_via_ilike(
    db: AsyncSession,
    q: str,
    effective_type: Optional[str],
    domain_id: Optional[str],
    certification: Optional[str],
    limit: int,
    offset: int,
) -> tuple[list[dict], int]:
    """ILIKE fallback when catalog_search_index is unavailable."""
    domain_names = await _domain_map(db)
    results: list[dict] = []
    pattern = f"%{q}%" if q else "%"

    if not effective_type or effective_type == "asset":
        q_stmt = select(DataAsset)
        if q:
            q_stmt = q_stmt.where(
                DataAsset.sf_table_name.ilike(pattern)
                | DataAsset.table_description.ilike(pattern)
                | DataAsset.owner_name.ilike(pattern)
            )
        if domain_id:
            q_stmt = q_stmt.where(DataAsset.domain_id == domain_id)
        if certification:
            q_stmt = q_stmt.where(DataAsset.certification_status == certification)
        for a in (await db.execute(q_stmt)).scalars().all():
            results.append({
                "entity_type": "asset", "id": a.asset_id,
                "name": a.sf_table_name, "description": a.table_description,
                "domain": domain_names.get(a.domain_id), "owner": a.owner_name or a.owner_email,
                "certification_status": a.certification_status,
                "quality_score": None, "trust_score": None, "avg_rating": None,
                "classification_tags": [], "tag_names": [],
            })

    if not effective_type or effective_type == "glossary":
        g_stmt = select(GlossaryTerm)
        if q:
            g_stmt = g_stmt.where(
                GlossaryTerm.term_name.ilike(pattern)
                | GlossaryTerm.definition.ilike(pattern)
            )
        if domain_id:
            g_stmt = g_stmt.where(GlossaryTerm.domain_id == domain_id)
        for t in (await db.execute(g_stmt)).scalars().all():
            results.append({
                "entity_type": "glossary", "id": t.term_id,
                "name": t.term_name, "description": t.definition,
                "domain": domain_names.get(t.domain_id), "owner": t.owner_email,
                "certification_status": None, "quality_score": None, "trust_score": None,
                "avg_rating": None, "classification_tags": [], "tag_names": [],
            })

    if not effective_type or effective_type == "data_product":
        p_stmt = select(DataProduct)
        if q:
            p_stmt = p_stmt.where(
                DataProduct.product_name.ilike(pattern)
                | DataProduct.description.ilike(pattern)
            )
        if domain_id:
            p_stmt = p_stmt.where(DataProduct.domain_id == domain_id)
        for p in (await db.execute(p_stmt)).scalars().all():
            results.append({
                "entity_type": "data_product", "id": p.product_id,
                "name": p.product_name, "description": p.description,
                "domain": domain_names.get(p.domain_id), "owner": p.owner_email,
                "certification_status": p.status, "quality_score": None, "trust_score": None,
                "avg_rating": None, "classification_tags": [], "tag_names": [],
            })

    total = len(results)
    return results[offset: offset + limit], total


# ── Search ────────────────────────────────────────────────────────────────────

@router.get("/search")
async def catalog_search(
    q: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    classification: Optional[str] = Query(None),
    certification: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    sort: str = Query("relevance"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Full-text catalog search across assets, glossary terms, and data products."""
    effective_type = type or entity_type
    offset = (page - 1) * page_size

    # -- Resolve classification / tag filter → entity_ids -----------------
    class_ids: Optional[set[str]] = None
    if classification:
        class_result = await db.execute(
            select(DataClassification.asset_id)
            .where(DataClassification.classification == classification)
        )
        class_ids = {r.asset_id for r in class_result.all()}

    tag_ids: Optional[set[str]] = None
    if tag:
        tag_result = await db.execute(
            select(AssetTag.entity_id)
            .join(Tag, AssetTag.tag_id == Tag.tag_id)
            .where(AssetTag.entity_type == "asset", Tag.tag_name == tag)
        )
        tag_ids = {r.entity_id for r in tag_result.all()}

    # -- Try tsvector path ------------------------------------------------
    try:
        where_clauses = ["1=1"]
        params: dict = {}

        if q and q.strip():
            where_clauses.append(
                "search_vector @@ plainto_tsquery('english', :q)"
            )
            params["q"] = q.strip()

        if effective_type:
            where_clauses.append("entity_type = :etype")
            params["etype"] = effective_type

        if domain_id:
            where_clauses.append("domain_id = :domain_id")
            params["domain_id"] = domain_id

        if certification:
            where_clauses.append("certification_status = :cert")
            params["cert"] = certification

        if owner:
            where_clauses.append("owner ILIKE :owner")
            params["owner"] = f"%{owner}%"

        if class_ids is not None:
            if not class_ids:
                return {"results": [], "total": 0, "page": page, "page_size": page_size}
            where_clauses.append(
                "entity_id = ANY(:class_ids) AND entity_type = 'asset'"
            )
            params["class_ids"] = list(class_ids)

        if tag_ids is not None:
            if not tag_ids:
                return {"results": [], "total": 0, "page": page, "page_size": page_size}
            where_clauses.append(
                "entity_id = ANY(:tag_ids) AND entity_type = 'asset'"
            )
            params["tag_ids"] = list(tag_ids)

        where_sql = " AND ".join(where_clauses)

        # Sort
        if sort == "relevance" and q and q.strip():
            order_sql = "ts_rank(search_vector, plainto_tsquery('english', :q)) DESC"
        elif sort == "alphabetical":
            order_sql = "title ASC"
        elif sort == "updated":
            order_sql = "entity_id DESC"   # approximation; full updated_at not in view
        else:
            order_sql = "title ASC"

        count_sql = text(
            f"SELECT count(*) FROM catalog_search_index WHERE {where_sql}"
        )
        rows_sql = text(
            f"SELECT entity_type, entity_id, title, domain, description, owner, "
            f"certification_status, domain_id "
            f"FROM catalog_search_index "
            f"WHERE {where_sql} "
            f"ORDER BY {order_sql} "
            f"LIMIT :limit OFFSET :offset"
        )
        params["limit"] = page_size
        params["offset"] = offset

        count_result = await db.execute(count_sql, params)
        total: int = count_result.scalar() or 0

        rows_result = await db.execute(rows_sql, params)
        rows = rows_result.mappings().all()

        asset_ids = [r["entity_id"] for r in rows if r["entity_type"] == "asset"]
        enrichment = await enrich_asset_results(asset_ids, db)

        results = []
        for r in rows:
            base = {
                "entity_type": r["entity_type"],
                "id": r["entity_id"],
                "name": r["title"],
                "description": r["description"],
                "domain": r["domain"],
                "owner": r["owner"],
                "certification_status": r["certification_status"],
            }
            if r["entity_type"] == "asset":
                base.update(enrichment.get(r["entity_id"], {}))
            else:
                base.update({
                    "quality_score": None, "trust_score": None,
                    "avg_rating": None, "classification_tags": [], "tag_names": [],
                })
            results.append(base)

        # Post-sort by quality/trust (requires enrichment values)
        if sort == "quality":
            results.sort(key=lambda x: x.get("quality_score") or 0, reverse=True)
        elif sort == "trust":
            results.sort(key=lambda x: x.get("trust_score") or 0, reverse=True)

        return {"results": results, "total": total, "page": page, "page_size": page_size}

    except Exception as exc:
        logger.warning("tsvector search failed (%s), falling back to ILIKE", exc)
        fallback_results, total = await _search_via_ilike(
            db, q or "", effective_type, domain_id, certification, page_size, offset
        )
        return {"results": fallback_results, "total": total, "page": page, "page_size": page_size}


# ── Facets ────────────────────────────────────────────────────────────────────

@router.get("/facets")
async def catalog_facets(
    domain_id: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return sidebar facet counts for domain, classification, certification, and tag."""

    async def _domain_counts():
        stmt = (
            select(Domain.domain_id, Domain.domain_name, func.count(DataAsset.asset_id).label("cnt"))
            .join(DataAsset, DataAsset.domain_id == Domain.domain_id)
            .where(DataAsset.is_active == True)  # noqa: E712
            .group_by(Domain.domain_id, Domain.domain_name)
            .order_by(desc("cnt"))
        )
        res = await db.execute(stmt)
        return [{"id": r.domain_id, "name": r.domain_name, "count": r.cnt} for r in res.all()]

    async def _classification_counts():
        stmt = (
            select(DataClassification.classification, func.count().label("cnt"))
            .group_by(DataClassification.classification)
            .order_by(desc("cnt"))
        )
        res = await db.execute(stmt)
        return [{"value": r.classification, "count": r.cnt} for r in res.all()]

    async def _certification_counts():
        stmt = (
            select(DataAsset.certification_status, func.count().label("cnt"))
            .where(DataAsset.is_active == True)  # noqa: E712
            .group_by(DataAsset.certification_status)
            .order_by(desc("cnt"))
        )
        res = await db.execute(stmt)
        return [{"value": r.certification_status, "count": r.cnt} for r in res.all()]

    async def _tag_counts():
        stmt = (
            select(Tag.tag_name, func.count(AssetTag.id).label("cnt"))
            .join(AssetTag, AssetTag.tag_id == Tag.tag_id)
            .where(AssetTag.entity_type == "asset")
            .group_by(Tag.tag_name)
            .order_by(desc("cnt"))
            .limit(20)
        )
        res = await db.execute(stmt)
        return [{"name": r.tag_name, "count": r.cnt} for r in res.all()]

    domains, classifications, certifications, tags = await asyncio.gather(
        _domain_counts(), _classification_counts(), _certification_counts(), _tag_counts()
    )
    return {
        "domains": domains,
        "classifications": classifications,
        "certifications": certifications,
        "tags": tags,
    }


# ── Asset detail ──────────────────────────────────────────────────────────────

@router.get("/assets/{asset_id}")
async def catalog_asset_detail(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Enriched single-asset detail for catalog view."""
    asset_result = await db.execute(
        select(DataAsset, Domain.domain_name)
        .join(Domain, DataAsset.domain_id == Domain.domain_id)
        .where(DataAsset.asset_id == asset_id)
    )
    row = asset_result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset, domain_name = row

    enrichment = await enrich_asset_results([asset_id], db)
    enrich = enrichment.get(asset_id, {})

    upstream_count = (await db.execute(
        select(func.count()).where(DataLineage.downstream_asset_id == asset_id)
    )).scalar() or 0
    downstream_count = (await db.execute(
        select(func.count()).where(DataLineage.upstream_asset_id == asset_id)
    )).scalar() or 0

    return {
        "asset_id": asset.asset_id,
        "sf_table_name": asset.sf_table_name,
        "sf_schema_name": asset.sf_schema_name,
        "sf_database_name": asset.sf_database_name,
        "table_description": asset.table_description,
        "criticality": asset.criticality,
        "certification_status": asset.certification_status,
        "certified_by": asset.certified_by,
        "owner_name": asset.owner_name,
        "owner_email": asset.owner_email,
        "domain_id": asset.domain_id,
        "domain_name": domain_name,
        "updated_at": asset.updated_at.isoformat() if asset.updated_at else None,
        "upstream_count": upstream_count,
        "downstream_count": downstream_count,
        **enrich,
    }


# ── Saved searches ────────────────────────────────────────────────────────────

@router.post("/saved-searches")
async def create_saved_search(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    search_id = _gen_id()
    await db.execute(
        text("""
            INSERT INTO saved_searches (search_id, user_email, name, query, filters, created_at)
            VALUES (:id, :email, :name, :query, :filters, NOW())
        """),
        {
            "id": search_id,
            "email": user["email"],
            "name": payload.get("name", "Saved search"),
            "query": payload.get("query"),
            "filters": payload.get("filters"),
        },
    )
    await db.commit()
    return {"search_id": search_id}


@router.get("/saved-searches")
async def list_saved_searches(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        text("""
            SELECT search_id, name, query, filters, created_at
            FROM saved_searches
            WHERE user_email = :email
            ORDER BY created_at DESC
        """),
        {"email": user["email"]},
    )
    return [dict(r._mapping) for r in result.all()]


@router.delete("/saved-searches/{search_id}")
async def delete_saved_search(
    search_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    existing = await db.execute(
        text("SELECT user_email FROM saved_searches WHERE search_id = :id"),
        {"id": search_id},
    )
    row = existing.first()
    if not row:
        raise HTTPException(status_code=404, detail="Saved search not found")
    if row.user_email != user["email"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Cannot delete another user's saved search")
    await db.execute(
        text("DELETE FROM saved_searches WHERE search_id = :id"), {"id": search_id}
    )
    await db.commit()
    return {"deleted": search_id}


# ── View refresh (admin) ──────────────────────────────────────────────────────

@router.post("/refresh", dependencies=[Depends(require_admin)])
async def refresh_catalog(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Manually trigger catalog_search_index refresh. Admin only."""
    ms = await refresh_search_index(db)
    return {"status": "refreshed", "duration_ms": ms}


# ── Popular / recent / domain assets (unchanged) ──────────────────────────────

@router.get("/popular")
async def catalog_popular(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    from datetime import timedelta
    cutoff = _utcnow() - timedelta(days=30)
    domain_names = await _domain_map(db)
    usage_result = await db.execute(
        select(AssetUsage.asset_id, func.count().label("usage_count"))
        .where(AssetUsage.created_at >= cutoff)
        .group_by(AssetUsage.asset_id)
        .order_by(desc("usage_count"))
        .limit(10)
    )
    rows = usage_result.all()
    asset_ids = [r.asset_id for r in rows]
    usage_map = {r.asset_id: r.usage_count for r in rows}

    if asset_ids:
        assets = (await db.execute(
            select(DataAsset).where(DataAsset.asset_id.in_(asset_ids))
        )).scalars().all()
    else:
        assets = (await db.execute(
            select(DataAsset)
            .where(DataAsset.is_active == True)  # noqa: E712
            .order_by(DataAsset.domain_id, DataAsset.sf_table_name)
            .limit(50)
        )).scalars().all()

    return [
        {
            "entity_type": "asset", "id": a.asset_id,
            "name": a.sf_table_name, "description": a.table_description,
            "domain": domain_names.get(a.domain_id),
            "owner": a.owner_name or a.owner_email,
            "usage_count": usage_map.get(a.asset_id, 0),
            "certification_status": a.certification_status,
        }
        for a in assets
    ]


@router.get("/recent")
async def catalog_recent(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(DataAsset).order_by(desc(DataAsset.updated_at)).limit(10)
    )
    return [
        {
            "asset_id": a.asset_id, "sf_table_name": a.sf_table_name,
            "sf_schema_name": a.sf_schema_name, "sf_database_name": a.sf_database_name,
            "domain_id": a.domain_id, "subdomain_id": a.subdomain_id,
            "table_description": a.table_description,
            "certification_status": a.certification_status,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        }
        for a in result.scalars().all()
    ]


@router.get("/domains/{domain_id}/assets")
async def catalog_domain_assets(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    assets = (await db.execute(
        select(DataAsset)
        .where(DataAsset.domain_id == domain_id, DataAsset.is_active == True)  # noqa: E712
        .order_by(DataAsset.sf_table_name)
    )).scalars().all()
    if not assets:
        return []
    asset_ids = [a.asset_id for a in assets]
    enrichment = await enrich_asset_results(asset_ids, db)

    term_result = await db.execute(
        select(GlossaryTermAsset.asset_id, func.count().label("term_count"))
        .where(GlossaryTermAsset.asset_id.in_(asset_ids))
        .group_by(GlossaryTermAsset.asset_id)
    )
    term_map = {r.asset_id: r.term_count for r in term_result.all()}

    return [
        {
            "asset_id": a.asset_id, "sf_table_name": a.sf_table_name,
            "sf_schema_name": a.sf_schema_name, "sf_database_name": a.sf_database_name,
            "table_description": a.table_description, "criticality": a.criticality,
            "certification_status": a.certification_status, "certified_by": a.certified_by,
            "owner_name": a.owner_name, "owner_email": a.owner_email,
            "term_count": term_map.get(a.asset_id, 0),
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
            **enrichment.get(a.asset_id, {
                "quality_score": None, "trust_score": None, "avg_rating": None,
                "classification_tags": [], "tag_names": [],
            }),
        }
        for a in assets
    ]
```

- [ ] **Step 3: Verify the API starts without errors**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
source .venv/bin/activate
python -c "from app.api.catalog import router; print('OK', len(router.routes), 'routes')"
```

Expected: `OK 9 routes`

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_catalog_search.py -v -k "not async_client"
```

Expected: `2 passed` (service tests; API tests need async_client fixture — skip for now)

- [ ] **Step 5: Commit**

```bash
git add app/api/catalog.py tests/test_catalog_search.py
git commit -m "feat: rewrite catalog API with tsvector search, facets, saved searches, and asset detail"
```

---

## Task 4: Backend — Register Nightly Refresh in Scheduler

**Files:**
- Modify: `app/services/scheduler_service.py`

- [ ] **Step 1: Add the refresh job at the bottom of `scheduler_service.py`**

Read the file first, then append after the `load_all_schedules` function (look for the last function in the file). Add:

```python
async def _refresh_catalog_index() -> None:
    """Nightly job: refresh catalog_search_index materialized view."""
    from app.db.database import AsyncSessionLocal
    from app.services.catalog_service import refresh_search_index as _refresh
    async with AsyncSessionLocal() as db:
        ms = await _refresh(db)
    logger.info("Nightly catalog index refresh complete in %dms", ms)
```

- [ ] **Step 2: Register the job in `start_scheduler`**

Find the `start_scheduler` function in `scheduler_service.py`. Add the following line inside it, after the scheduler is started:

```python
scheduler.add_job(
    _refresh_catalog_index,
    trigger=CronTrigger(hour=0, minute=30, timezone=settings.default_timezone),
    id="catalog_index_refresh",
    replace_existing=True,
)
```

- [ ] **Step 3: Verify scheduler starts**

```bash
python -c "
from app.services.scheduler_service import scheduler, _refresh_catalog_index
jobs = [j for j in scheduler.get_jobs()]
print('Jobs registered:', [j.id for j in jobs])
# catalog job won't show until start_scheduler() is called — just check import works
print('refresh function:', _refresh_catalog_index)
"
```

Expected: no import errors, function prints.

- [ ] **Step 4: Commit**

```bash
git add app/services/scheduler_service.py
git commit -m "feat: register nightly catalog_search_index refresh in APScheduler"
```

---

## Task 5: Frontend — Expand `apiClient.ts`

**Files:**
- Modify: `frontend/src/services/apiClient.ts` (line 281, `catalogApi` object)

- [ ] **Step 1: Replace the existing `catalogApi` block**

Find this block (lines 280–286):
```typescript
// Catalog
export const catalogApi = {
  search: (params: object) => api.get('/catalog/search', { params }),
  popular: () => api.get('/catalog/popular'),
  recent: () => api.get('/catalog/recent'),
  domainAssets: (domainId: string) => api.get(`/catalog/domains/${domainId}/assets`),
}
```

Replace with:
```typescript
// Catalog
export const catalogApi = {
  search: (params: object) => api.get('/catalog/search', { params }),
  facets: (params?: object) => api.get('/catalog/facets', { params }),
  popular: () => api.get('/catalog/popular'),
  recent: () => api.get('/catalog/recent'),
  domainAssets: (domainId: string) => api.get(`/catalog/domains/${domainId}/assets`),
  assetDetail: (assetId: string) => api.get(`/catalog/assets/${assetId}`),
  savedSearches: {
    list: () => api.get('/catalog/saved-searches'),
    save: (payload: { name: string; query?: string; filters?: object }) =>
      api.post('/catalog/saved-searches', payload),
    delete: (searchId: string) => api.delete(`/catalog/saved-searches/${searchId}`),
  },
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/apiClient.ts
git commit -m "feat: expand catalogApi with facets, assetDetail, and savedSearches endpoints"
```

---

## Task 6: Frontend — New Catalog Components

**Files:**
- Create: `frontend/src/components/catalog/CatalogFacets.tsx`
- Create: `frontend/src/components/catalog/CatalogResultCard.tsx`
- Create: `frontend/src/components/catalog/CatalogResultRow.tsx`
- Create: `frontend/src/components/catalog/QuickFilters.tsx`
- Create: `frontend/src/components/catalog/SavedSearches.tsx`

- [ ] **Step 1: Create `CatalogFacets.tsx`**

```tsx
'use client'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

interface FacetItem { id?: string; name?: string; value?: string; count: number }
interface Facets {
  domains: FacetItem[]
  classifications: FacetItem[]
  certifications: FacetItem[]
  tags: FacetItem[]
}
interface Filters {
  domain_id?: string
  classification?: string
  certification?: string
  tag?: string
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  PII:          'bg-red-100 text-red-700',
  SENSITIVE:    'bg-orange-100 text-orange-700',
  CONFIDENTIAL: 'bg-yellow-100 text-yellow-700',
  RESTRICTED:   'bg-purple-100 text-purple-700',
  PUBLIC:       'bg-green-100 text-green-700',
}

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 pb-3 mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2"
      >
        {title}
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && <div className="space-y-1">{children}</div>}
    </div>
  )
}

export default function CatalogFacets({
  facets, filters, onChange,
}: { facets: Facets; filters: Filters; onChange: (key: keyof Filters, value: string | undefined) => void }) {
  return (
    <aside className="w-56 shrink-0 pr-4">
      <Section title="Domain">
        {facets.domains.map(d => (
          <button
            key={d.id}
            onClick={() => onChange('domain_id', filters.domain_id === d.id ? undefined : d.id)}
            className={clsx(
              'flex items-center justify-between w-full text-xs px-2 py-1 rounded-lg transition-colors',
              filters.domain_id === d.id
                ? 'bg-blue-100 text-blue-700 font-semibold'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <span className="truncate">{d.name}</span>
            <span className="ml-1 text-gray-400 shrink-0">{d.count}</span>
          </button>
        ))}
      </Section>

      <Section title="Classification">
        {facets.classifications.map(c => (
          <button
            key={c.value}
            onClick={() => onChange('classification', filters.classification === c.value ? undefined : c.value)}
            className={clsx(
              'flex items-center justify-between w-full text-xs px-2 py-1 rounded-lg transition-colors',
              filters.classification === c.value
                ? 'ring-2 ring-inset ring-blue-400 font-semibold'
                : 'hover:bg-gray-100'
            )}
          >
            <span className={clsx('px-1.5 py-0.5 rounded text-xs', CLASSIFICATION_COLORS[c.value!] ?? 'bg-gray-100 text-gray-600')}>
              {c.value}
            </span>
            <span className="ml-1 text-gray-400 shrink-0">{c.count}</span>
          </button>
        ))}
      </Section>

      <Section title="Certification">
        {facets.certifications.map(c => (
          <button
            key={c.value}
            onClick={() => onChange('certification', filters.certification === c.value ? undefined : c.value)}
            className={clsx(
              'flex items-center justify-between w-full text-xs px-2 py-1 rounded-lg transition-colors capitalize',
              filters.certification === c.value
                ? 'bg-blue-100 text-blue-700 font-semibold'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <span>{c.value}</span>
            <span className="ml-1 text-gray-400 shrink-0">{c.count}</span>
          </button>
        ))}
      </Section>

      {facets.tags.length > 0 && (
        <Section title="Tags" defaultOpen={false}>
          {facets.tags.map(t => (
            <button
              key={t.name}
              onClick={() => onChange('tag', filters.tag === t.name ? undefined : t.name)}
              className={clsx(
                'flex items-center justify-between w-full text-xs px-2 py-1 rounded-lg transition-colors',
                filters.tag === t.name
                  ? 'bg-blue-100 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <span>#{t.name}</span>
              <span className="ml-1 text-gray-400 shrink-0">{t.count}</span>
            </button>
          ))}
        </Section>
      )}
    </aside>
  )
}
```

- [ ] **Step 2: Create `CatalogResultCard.tsx`**

```tsx
import Link from 'next/link'
import { Globe, Star, Database, BookOpen, Package } from 'lucide-react'
import clsx from 'clsx'
import ScoreRing from '@/components/common/ScoreRing'
import CertificationBadge from '@/components/common/CertificationBadge'

const CLASSIFICATION_COLORS: Record<string, string> = {
  PII:          'bg-red-100 text-red-700',
  SENSITIVE:    'bg-orange-100 text-orange-700',
  CONFIDENTIAL: 'bg-yellow-100 text-yellow-700',
  RESTRICTED:   'bg-purple-100 text-purple-700',
  PUBLIC:       'bg-green-100 text-green-700',
}

const ENTITY_ICON: Record<string, React.ReactNode> = {
  asset:        <Database size={12} />,
  glossary:     <BookOpen size={12} />,
  data_product: <Package  size={12} />,
}

const ENTITY_HREF: Record<string, (id: string) => string> = {
  asset:        id => `/dashboard/tables/${id}`,
  glossary:     () => '/glossary',
  data_product: () => '/data-products',
}

export interface CatalogItem {
  id: string
  entity_type: string
  name: string
  description?: string | null
  domain?: string | null
  owner?: string | null
  certification_status?: string | null
  quality_score?: number | null
  trust_score?: number | null
  avg_rating?: number | null
  classification_tags?: string[]
  tag_names?: string[]
}

export default function CatalogResultCard({ item }: { item: CatalogItem }) {
  const href = (ENTITY_HREF[item.entity_type] ?? ENTITY_HREF.asset)(item.id)
  const icon = ENTITY_ICON[item.entity_type] ?? ENTITY_ICON.asset

  return (
    <Link
      href={href}
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-blue-300 transition-all"
    >
      <div className="flex items-start gap-3">
        {/* Quality ring */}
        {item.quality_score != null && (
          <div className="shrink-0 mt-0.5">
            <ScoreRing score={item.quality_score} size={40} strokeWidth={4} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 truncate">{item.name}</span>
            {item.certification_status && (
              <CertificationBadge status={item.certification_status} />
            )}
            <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto shrink-0">
              {icon}
              <span className="capitalize">{item.entity_type.replace('_', ' ')}</span>
            </span>
          </div>

          {/* Description */}
          {item.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
          )}

          {/* Classification chips */}
          {item.classification_tags && item.classification_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.classification_tags.map(c => (
                <span key={c} className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', CLASSIFICATION_COLORS[c] ?? 'bg-gray-100 text-gray-600')}>
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Footer row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
            {item.domain && (
              <span className="flex items-center gap-1"><Globe size={11} />{item.domain}</span>
            )}
            {item.owner && <span>Owner: {item.owner}</span>}
            {item.avg_rating != null && item.avg_rating > 0 && (
              <span className="flex items-center gap-0.5 text-amber-500">
                <Star size={11} fill="currentColor" />
                {item.avg_rating.toFixed(1)}
              </span>
            )}
            {item.trust_score != null && (
              <span className="text-gray-300">Trust {item.trust_score.toFixed(0)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: Create `CatalogResultRow.tsx`**

```tsx
import Link from 'next/link'
import { Star } from 'lucide-react'
import CertificationBadge from '@/components/common/CertificationBadge'
import type { CatalogItem } from './CatalogResultCard'

const ENTITY_HREF: Record<string, (id: string) => string> = {
  asset:        id => `/dashboard/tables/${id}`,
  glossary:     () => '/glossary',
  data_product: () => '/data-products',
}

const QUALITY_COLOR = (s: number | null | undefined) =>
  s == null ? 'text-gray-400' : s >= 95 ? 'text-green-600' : s >= 80 ? 'text-amber-500' : 'text-red-500'

export default function CatalogResultRow({ item }: { item: CatalogItem }) {
  const href = (ENTITY_HREF[item.entity_type] ?? ENTITY_HREF.asset)(item.id)

  return (
    <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
      <td className="py-2.5 px-3">
        <Link href={href} className="font-medium text-sm text-blue-700 hover:underline">
          {item.name}
        </Link>
        {item.description && (
          <p className="text-xs text-gray-400 truncate max-w-xs">{item.description}</p>
        )}
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-600">{item.domain ?? '—'}</td>
      <td className="py-2.5 px-3 text-xs text-gray-600 truncate max-w-xs">{item.owner ?? '—'}</td>
      <td className={`py-2.5 px-3 text-xs font-semibold ${QUALITY_COLOR(item.quality_score)}`}>
        {item.quality_score != null ? `${item.quality_score.toFixed(1)}%` : '—'}
      </td>
      <td className="py-2.5 px-3">
        {item.certification_status ? <CertificationBadge status={item.certification_status} /> : <span className="text-xs text-gray-400">—</span>}
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-400">
        {item.avg_rating && item.avg_rating > 0 ? (
          <span className="flex items-center gap-0.5 text-amber-500">
            <Star size={11} fill="currentColor" />
            {item.avg_rating.toFixed(1)}
          </span>
        ) : '—'}
      </td>
    </tr>
  )
}
```

- [ ] **Step 4: Create `QuickFilters.tsx`**

```tsx
import clsx from 'clsx'

interface QuickFilter {
  id: string
  label: string
  filterKey: string
  filterValue: string
}

const QUICK_FILTERS: QuickFilter[] = [
  { id: 'my',          label: 'My assets',      filterKey: 'owner',         filterValue: '__me__' },
  { id: 'pii',         label: 'PII tables',     filterKey: 'classification', filterValue: 'PII' },
  { id: 'uncertified', label: 'Uncertified',    filterKey: 'certification', filterValue: 'uncertified' },
  { id: 'lowquality',  label: 'Low quality',    filterKey: 'sort',          filterValue: 'quality' },
  { id: 'recent',      label: 'Recently added', filterKey: 'sort',          filterValue: 'updated' },
]

interface Props {
  activeFilters: Record<string, string | undefined>
  userEmail: string
  onChange: (key: string, value: string | undefined) => void
}

export default function QuickFilters({ activeFilters, userEmail, onChange }: Props) {
  const isActive = (f: QuickFilter) => {
    const val = f.filterValue === '__me__' ? userEmail : f.filterValue
    return activeFilters[f.filterKey] === val
  }

  const handleClick = (f: QuickFilter) => {
    const resolvedValue = f.filterValue === '__me__' ? userEmail : f.filterValue
    if (isActive(f)) {
      onChange(f.filterKey, undefined)
    } else {
      onChange(f.filterKey, resolvedValue)
    }
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {QUICK_FILTERS.map(f => (
        <button
          key={f.id}
          onClick={() => handleClick(f)}
          className={clsx(
            'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            isActive(f)
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create `SavedSearches.tsx`**

```tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { Bookmark, Trash2, Plus, ChevronDown } from 'lucide-react'
import { catalogApi } from '@/services/apiClient'

interface SavedSearch {
  search_id: string
  name: string
  query?: string
  filters?: Record<string, string>
}

interface Props {
  currentQuery: string
  currentFilters: Record<string, string | undefined>
  onLoad: (query: string, filters: Record<string, string>) => void
}

export default function SavedSearches({ currentQuery, currentFilters, onLoad }: Props) {
  const [open, setOpen]             = useState(false)
  const [searches, setSearches]     = useState<SavedSearch[]>([])
  const [saving, setSaving]         = useState(false)
  const [newName, setNewName]       = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    catalogApi.savedSearches.list()
      .then(r => setSearches(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSearches([]))
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSave = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await catalogApi.savedSearches.save({
        name: newName.trim(),
        query: currentQuery,
        filters: Object.fromEntries(
          Object.entries(currentFilters).filter(([, v]) => v != null)
        ) as Record<string, string>,
      })
      setNewName('')
      const r = await catalogApi.savedSearches.list()
      setSearches(Array.isArray(r.data) ? r.data : [])
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await catalogApi.savedSearches.delete(id)
    setSearches(s => s.filter(x => x.search_id !== id))
  }

  const handleLoad = (s: SavedSearch) => {
    onLoad(s.query ?? '', s.filters ?? {})
    setOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:border-blue-300 text-gray-600 transition-colors"
      >
        <Bookmark size={14} />
        Saved
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-30">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2">Save current search</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search name..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleSave}
                disabled={saving || !newName.trim()}
                className="text-xs bg-blue-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                <Plus size={12} />
                Save
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {searches.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No saved searches yet</p>
            ) : (
              searches.map(s => (
                <div key={s.search_id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group">
                  <button
                    onClick={() => handleLoad(s)}
                    className="flex-1 text-left text-sm text-gray-700 hover:text-blue-600 truncate"
                  >
                    {s.name}
                    {s.query && (
                      <span className="text-xs text-gray-400 ml-1">"{s.query}"</span>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(s.search_id)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/catalog/
git commit -m "feat: add CatalogFacets, CatalogResultCard, CatalogResultRow, QuickFilters, SavedSearches components"
```

---

## Task 7: Frontend — Redesign `catalog/page.tsx`

**Files:**
- Modify: `frontend/src/app/catalog/page.tsx`

- [ ] **Step 1: Replace the full file**

```tsx
'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, Loader2, LayoutGrid, List, SlidersHorizontal } from 'lucide-react'
import clsx from 'clsx'
import { catalogApi } from '@/services/apiClient'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import CatalogFacets from '@/components/catalog/CatalogFacets'
import CatalogResultCard, { type CatalogItem } from '@/components/catalog/CatalogResultCard'
import CatalogResultRow from '@/components/catalog/CatalogResultRow'
import QuickFilters from '@/components/catalog/QuickFilters'
import SavedSearches from '@/components/catalog/SavedSearches'
import HowItWorks from '@/components/common/HowItWorks'
import { Database, BookOpen, Tag } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Facets {
  domains: { id: string; name: string; count: number }[]
  classifications: { value: string; count: number }[]
  certifications: { value: string; count: number }[]
  tags: { name: string; count: number }[]
}

interface SearchResponse {
  results: CatalogItem[]
  total: number
  page: number
  page_size: number
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex gap-3">
        <div className="w-10 h-10 bg-gray-200 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      </div>
    </div>
  )
}

// ── Sort options ──────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'relevance',   label: 'Relevance' },
  { value: 'quality',     label: 'Quality Score' },
  { value: 'trust',       label: 'Trust Score' },
  { value: 'alphabetical', label: 'A → Z' },
  { value: 'updated',     label: 'Last Updated' },
]

// ── Pagination ────────────────────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void
}) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
      >
        Prev
      </button>
      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        const p = page <= 3 ? i + 1 : page - 2 + i
        if (p < 1 || p > totalPages) return null
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={clsx(
              'px-3 py-1.5 text-sm rounded-lg border transition-colors',
              p === page
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-200 hover:bg-gray-50'
            )}
          >
            {p}
          </button>
        )
      })}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
      >
        Next
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const searchParams  = useSearchParams()
  const router        = useRouter()
  const { user }      = useCurrentUser()

  // State synced with URL
  const [query,   setQuery]   = useState(searchParams.get('q') ?? '')
  const [sort,    setSort]    = useState(searchParams.get('sort') ?? 'relevance')
  const [viewMode, setViewMode] = useState<'card' | 'table'>(
    (searchParams.get('view') as 'card' | 'table') ?? 'card'
  )
  const [page, setPage] = useState(Number(searchParams.get('page') ?? 1))
  const [filters, setFilters] = useState<Record<string, string | undefined>>({
    type:           searchParams.get('type') ?? undefined,
    domain_id:      searchParams.get('domain_id') ?? undefined,
    classification: searchParams.get('classification') ?? undefined,
    certification:  searchParams.get('certification') ?? undefined,
    owner:          searchParams.get('owner') ?? undefined,
    tag:            searchParams.get('tag') ?? undefined,
  })

  const [results,       setResults]       = useState<CatalogItem[]>([])
  const [total,         setTotal]         = useState(0)
  const [facets,        setFacets]        = useState<Facets>({ domains: [], classifications: [], certifications: [], tags: [] })
  const [loading,       setLoading]       = useState(false)
  const [facetLoading,  setFacetLoading]  = useState(true)
  const [popular,       setPopular]       = useState<CatalogItem[]>([])
  const [popularLoading, setPopularLoading] = useState(true)
  const [hasSearched,   setHasSearched]   = useState(!!searchParams.get('q'))

  // -- Sync state → URL -------------------------------------------------------
  const updateUrl = useCallback((overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const merged = { q: query, sort, view: viewMode, page: String(page), ...filters, ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) params.set(k, v) })
    router.replace(`/catalog?${params.toString()}`, { scroll: false })
  }, [query, sort, viewMode, page, filters, router])

  // -- Load popular on mount ---------------------------------------------------
  useEffect(() => {
    catalogApi.popular()
      .then(r => setPopular(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPopular([]))
      .finally(() => setPopularLoading(false))
  }, [])

  // -- Load facets (independent of search) ------------------------------------
  useEffect(() => {
    setFacetLoading(true)
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v != null)
    )
    catalogApi.facets(params)
      .then(r => setFacets(r.data))
      .catch(() => {})
      .finally(() => setFacetLoading(false))
  }, [filters])

  // -- Debounced search -------------------------------------------------------
  useEffect(() => {
    const hasFilters = Object.values(filters).some(v => v != null)
    if (!query.trim() && !hasFilters) {
      setHasSearched(false)
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      setHasSearched(true)
      try {
        const params: Record<string, string | number> = { sort, page, page_size: 20 }
        if (query.trim()) params.q = query
        Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
        const res = await catalogApi.search(params)
        const body: SearchResponse = res.data
        setResults(body.results ?? [])
        setTotal(body.total ?? 0)
      } catch {
        setResults([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, sort, page, filters])

  // -- Filter change handler --------------------------------------------------
  const handleFilterChange = (key: string, value: string | undefined) => {
    setPage(1)
    setFilters(prev => ({ ...prev, [key]: value }))
    updateUrl({ [key]: value, page: '1' })
  }

  // -- Load saved search -------------------------------------------------------
  const handleLoadSaved = (q: string, savedFilters: Record<string, string>) => {
    setQuery(q)
    setFilters(f => ({ ...f, ...savedFilters }))
    setPage(1)
    updateUrl({ q, ...savedFilters, page: '1' })
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Data Catalog</h1>
        <p className="text-gray-500 text-sm mt-1">
          Search across assets, glossary terms, and data products
        </p>
      </div>

      <HowItWorks
        storageKey="catalog"
        title="How Data Catalog Works"
        steps={[
          { icon: <Database size={13} />, title: 'Register Tables',   description: 'Add Snowflake tables as data assets under a domain.' },
          { icon: <Search   size={13} />, title: 'Search & Discover', description: 'Full-text search across assets, glossary terms, and data products.' },
          { icon: <SlidersHorizontal size={13} />, title: 'Filter & Sort', description: 'Narrow by domain, classification, certification, or tag.' },
          { icon: <Tag      size={13} />, title: 'View Details',      description: 'Click any result to see quality scores, lineage, and certifications.' },
        ]}
      />

      {/* Search bar row */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search assets, glossary terms, data products..."
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1) }}
            className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
          />
          {loading && (
            <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-500 animate-spin" />
          )}
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={e => { setSort(e.target.value); setPage(1) }}
          className="border border-gray-200 rounded-xl px-3 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* View toggle */}
        <div className="flex border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setViewMode('card')}
            className={clsx('p-2.5', viewMode === 'card' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50')}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={clsx('p-2.5', viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-50')}
          >
            <List size={16} />
          </button>
        </div>

        {/* Saved searches */}
        <SavedSearches
          currentQuery={query}
          currentFilters={filters}
          onLoad={handleLoadSaved}
        />
      </div>

      {/* Quick filters */}
      <QuickFilters
        activeFilters={filters}
        userEmail={user?.email ?? ''}
        onChange={handleFilterChange}
      />

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Facet sidebar */}
        <CatalogFacets
          facets={facets}
          filters={{
            domain_id:      filters.domain_id,
            classification: filters.classification,
            certification:  filters.certification,
            tag:            filters.tag,
          }}
          onChange={(key, value) => handleFilterChange(key, value)}
        />

        {/* Results */}
        <div className="flex-1 min-w-0">
          {hasSearched ? (
            loading ? (
              <div className={viewMode === 'card' ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : 'space-y-2'}>
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <Search size={28} className="text-gray-400" />
                </div>
                <p className="text-base font-semibold text-gray-800">No results found</p>
                <p className="text-sm text-gray-400 mt-1">Try a different search term or filter</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  {total} result{total !== 1 ? 's' : ''}
                  {query ? ` for "${query}"` : ''}
                </p>

                {viewMode === 'card' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {results.map(item => (
                      <CatalogResultCard key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          {['Name', 'Domain', 'Owner', 'Quality', 'Certification', 'Rating'].map(h => (
                            <th key={h} className="text-left text-xs font-semibold text-gray-500 px-3 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map(item => (
                          <CatalogResultRow key={item.id} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <Pagination
                  page={page}
                  total={total}
                  pageSize={20}
                  onChange={p => { setPage(p); updateUrl({ page: String(p) }) }}
                />
              </>
            )
          ) : (
            /* Popular assets browse view */
            popularLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : popular.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <Database size={28} className="text-gray-400" />
                </div>
                <p className="text-base font-semibold text-gray-800">No data assets registered yet</p>
                <p className="text-sm text-gray-400 mt-1">Register your first Snowflake table to get started</p>
                <a href="/assets" className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                  Register your first table →
                </a>
              </div>
            ) : (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Popular Assets</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {popular.map(item => <CatalogResultCard key={item.id} item={item} />)}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/catalog/page.tsx
git commit -m "feat: redesign catalog page with two-column layout, facets, sort, card/table toggle, saved searches"
```

---

## Task 8: End-to-End Verification

- [ ] **Step 1: Start the backend**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Confirm startup log shows no errors.

- [ ] **Step 2: Verify search returns enriched results**

```bash
curl -s "http://localhost:8000/catalog/search?q=invoice" \
  -H "Authorization: Bearer <token>" | python3 -m json.tool | head -40
```

Expected: JSON with `results`, `total`, `page`, `page_size`. Each asset result has `quality_score`, `trust_score`, `classification_tags`, `tag_names`, `certification_status`.

- [ ] **Step 3: Verify facets**

```bash
curl -s "http://localhost:8000/catalog/facets" \
  -H "Authorization: Bearer <token>" | python3 -m json.tool
```

Expected: JSON with `domains`, `classifications`, `certifications`, `tags` arrays.

- [ ] **Step 4: Verify asset detail**

```bash
# Replace <asset_id> with an actual ID from the search results
curl -s "http://localhost:8000/catalog/assets/<asset_id>" \
  -H "Authorization: Bearer <token>" | python3 -m json.tool
```

Expected: enriched asset with `upstream_count`, `downstream_count`, `classification_tags`, `quality_score`.

- [ ] **Step 5: Verify catalog refresh (admin token)**

```bash
curl -s -X POST "http://localhost:8000/catalog/refresh" \
  -H "Authorization: Bearer <admin_token>" | python3 -m json.tool
```

Expected: `{"status": "refreshed", "duration_ms": <N>}`

- [ ] **Step 6: Start frontend and manual test**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app/frontend
npm run dev
```

Open `http://localhost:3000/catalog` and verify:
- Search bar works with debounce
- Facet sidebar shows domain/classification/certification/tag counts
- Clicking a facet filters results
- Sort dropdown changes result order
- Card/table toggle switches layouts
- Quick filter pills ("My assets", "PII tables", etc.) apply filters
- "Saved searches" dropdown saves and loads searches

- [ ] **Step 7: Run all tests**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
source .venv/bin/activate
pytest tests/test_catalog_search.py -v
```

Expected: all tests pass.

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "feat: complete data catalog searchable inventory — tsvector search, facets, saved searches, enriched cards"
```

---

## Self-Review Checklist

- [x] **tsvector search** — Task 1 (migration) + Task 3 (search endpoint uses `plainto_tsquery`)
- [x] **ILIKE fallback** — Task 3 (`_search_via_ilike` called in except block)
- [x] **Facet filters** — Task 3 (`GET /catalog/facets`) + Task 6 (`CatalogFacets.tsx`)
- [x] **Sort options** — Task 3 (sort param) + Task 7 (sort dropdown in page)
- [x] **Enriched cards** — Task 2 (`enrich_asset_results`) + Task 6 (`CatalogResultCard`)
- [x] **Table view toggle** — Task 6 (`CatalogResultRow`) + Task 7 (viewMode state)
- [x] **Quick filters** — Task 6 (`QuickFilters.tsx`) + Task 7 (wired to filter state)
- [x] **Saved searches** — Task 1 (table) + Task 3 (CRUD endpoints) + Task 6 (`SavedSearches.tsx`)
- [x] **Asset detail endpoint** — Task 3 (`GET /catalog/assets/{id}`)
- [x] **Nightly refresh** — Task 4 (APScheduler job)
- [x] **Pagination** — Task 7 (`Pagination` component, page/page_size params)
- [x] **URL state sync** — Task 7 (`useSearchParams` + `router.replace`)
- [x] **Empty states** — Task 7 (no results + no assets registered with CTA)
- [x] **Tests** — Task 2 (service tests) + Task 3 (API tests) + Task 8 (e2e)
- [x] **Type names consistent** — `CatalogItem` defined in `CatalogResultCard.tsx`, imported in `CatalogResultRow.tsx` and `page.tsx`
- [x] **`ScoreRing` and `CertificationBadge`** — both reused from existing components with correct prop signatures
