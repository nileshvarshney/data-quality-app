from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.db.database import get_db
from app.db.models import DataObject, DataObjectRelationship, DataObjectColumn

router = APIRouter(prefix="/api/lineage", tags=["Lineage"])


# ── Formatters ────────────────────────────────────────────────────────────────

def _fmt_object(obj: DataObject, columns: list | None = None) -> dict:
    return {
        "object_id": obj.object_id,
        "object_name": obj.object_name,
        "object_type": obj.object_type,
        "database_name": obj.database_name,
        "schema_name": obj.schema_name,
        "domain": obj.domain,
        "sub_domain": obj.sub_domain,
        "owner": obj.owner,
        "quality_score": obj.quality_score,
        "status": obj.status,
        "certification_status": obj.certification_status,
        "tags": obj.tags or [],
        "last_refreshed_at": obj.last_refreshed_at.isoformat() if obj.last_refreshed_at else None,
        "created_at": obj.created_at.isoformat(),
        "updated_at": obj.updated_at.isoformat(),
        "columns": columns or [],
    }


def _fmt_edge(rel: DataObjectRelationship) -> dict:
    return {
        "relationship_id": rel.relationship_id,
        "source_object_id": rel.source_object_id,
        "target_object_id": rel.target_object_id,
        "relationship_type": rel.relationship_type,
        "transformation_logic": rel.transformation_logic,
        "confidence_score": rel.confidence_score,
    }


def _fmt_column(col: DataObjectColumn) -> dict:
    return {
        "column_id": col.column_id,
        "column_name": col.column_name,
        "data_type": col.data_type,
        "ordinal_position": col.ordinal_position,
        "is_nullable": col.is_nullable,
    }


# ── Endpoint 1: GET /api/lineage/object/{object_id} ──────────────────────────

@router.get("/object/{object_id}")
async def get_lineage_object(object_id: str, db: AsyncSession = Depends(get_db)):
    """Return full DataObject metadata including its columns."""
    obj = await db.get(DataObject, object_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    cols_result = await db.execute(
        select(DataObjectColumn)
        .where(DataObjectColumn.object_id == object_id)
        .order_by(DataObjectColumn.ordinal_position)
    )
    cols = cols_result.scalars().all()
    return _fmt_object(obj, [_fmt_column(c) for c in cols])


# ── Endpoint 2: GET /api/lineage/graph/{object_id} ───────────────────────────

@router.get("/graph/{object_id}")
async def get_lineage_graph(
    object_id: str,
    depth: str = "2",
    db: AsyncSession = Depends(get_db),
):
    """BFS traversal up to `depth` hops in both directions. Returns focal node + reachable nodes + edges."""
    obj = await db.get(DataObject, object_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    try:
        max_depth = 999 if depth == "all" else int(depth)
        if max_depth < 0:
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=400, detail="depth must be '1', '2', '3', or 'all'")

    visited_ids: set[str] = {object_id}
    frontier: set[str] = {object_id}
    all_edges: list[DataObjectRelationship] = []
    seen_edge_ids: set[str] = set()

    for _ in range(max_depth):
        if not frontier:
            break
        result = await db.execute(
            select(DataObjectRelationship).where(
                or_(
                    DataObjectRelationship.source_object_id.in_(frontier),
                    DataObjectRelationship.target_object_id.in_(frontier),
                )
            )
        )
        rels = result.scalars().all()
        new_ids: set[str] = set()
        for rel in rels:
            if rel.relationship_id not in seen_edge_ids:
                all_edges.append(rel)
                seen_edge_ids.add(rel.relationship_id)
            if rel.source_object_id not in visited_ids:
                new_ids.add(rel.source_object_id)
            if rel.target_object_id not in visited_ids:
                new_ids.add(rel.target_object_id)
        if not new_ids:
            break
        visited_ids |= new_ids
        frontier = new_ids

    # Fetch all non-focal nodes
    all_node_ids = visited_ids - {object_id}
    nodes_result = await db.execute(
        select(DataObject).where(DataObject.object_id.in_(all_node_ids))
    )
    nodes = nodes_result.scalars().all()

    # Fetch focal node columns
    cols_result = await db.execute(
        select(DataObjectColumn)
        .where(DataObjectColumn.object_id == object_id)
        .order_by(DataObjectColumn.ordinal_position)
    )
    focal_cols = cols_result.scalars().all()

    return {
        "focal_node": _fmt_object(obj, [_fmt_column(c) for c in focal_cols]),
        "nodes": [_fmt_object(n) for n in nodes],
        "edges": [_fmt_edge(e) for e in all_edges],
    }


# ── Endpoint 3: GET /api/lineage/impact/{object_id} ──────────────────────────

@router.get("/impact/{object_id}")
async def get_lineage_impact(object_id: str, db: AsyncSession = Depends(get_db)):
    """BFS forward (source→target) to find all downstream objects, grouped by type."""
    obj = await db.get(DataObject, object_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    visited: set[str] = {object_id}
    frontier: set[str] = {object_id}
    impacted_ids: set[str] = set()

    while frontier:
        result = await db.execute(
            select(DataObjectRelationship.target_object_id).where(
                DataObjectRelationship.source_object_id.in_(frontier)
            )
        )
        new_targets = {r[0] for r in result.fetchall()} - visited
        impacted_ids |= new_targets
        visited |= new_targets
        frontier = new_targets

    if not impacted_ids:
        return {
            "impacted_views": [],
            "impacted_materialized_views": [],
            "connected_tables": [],
            "total_impacted": 0,
        }

    result = await db.execute(
        select(DataObject).where(DataObject.object_id.in_(impacted_ids))
    )
    impacted = result.scalars().all()

    views = [_fmt_object(o) for o in impacted if o.object_type == "VIEW"]
    mvs = [_fmt_object(o) for o in impacted if o.object_type == "MATERIALIZED_VIEW"]
    tables = [_fmt_object(o) for o in impacted if o.object_type == "TABLE"]

    return {
        "impacted_views": views,
        "impacted_materialized_views": mvs,
        "connected_tables": tables,
        "total_impacted": len(impacted),
    }


# ── Endpoint 4: GET /api/lineage/columns/{object_id} ─────────────────────────

@router.get("/columns/{object_id}")
async def get_lineage_columns(object_id: str, db: AsyncSession = Depends(get_db)):
    """Return columns for a specific DataObject."""
    obj = await db.get(DataObject, object_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    result = await db.execute(
        select(DataObjectColumn)
        .where(DataObjectColumn.object_id == object_id)
        .order_by(DataObjectColumn.ordinal_position)
    )
    cols = result.scalars().all()
    return {"object_id": object_id, "columns": [_fmt_column(c) for c in cols]}


# ── Endpoint 5: GET /api/lineage/search ──────────────────────────────────────

@router.get("/search")
async def search_lineage_objects(
    q: str | None = None,
    object_type: str | None = None,
    schema: str | None = None,
    domain: str | None = None,
    owner: str | None = None,
    status: str | None = None,
    min_quality: float | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Search DataObjects by name, type, schema, domain, owner, status, or minimum quality score."""
    stmt = select(DataObject)
    if q:
        stmt = stmt.where(DataObject.object_name.ilike(f"%{q}%"))
    if object_type:
        stmt = stmt.where(DataObject.object_type == object_type)
    if schema:
        stmt = stmt.where(DataObject.schema_name == schema)
    if domain:
        stmt = stmt.where(DataObject.domain == domain)
    if owner:
        stmt = stmt.where(DataObject.owner.ilike(f"%{owner}%"))
    if status:
        stmt = stmt.where(DataObject.status == status)
    if min_quality is not None:
        stmt = stmt.where(DataObject.quality_score >= min_quality)
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    objects = result.scalars().all()
    return {"results": [_fmt_object(o) for o in objects], "total": len(objects)}
