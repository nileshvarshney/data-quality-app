from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sql_delete, func
from app.db.database import get_db
from app.db.models import DataLineage, DataAsset, DQQualityScore, ColumnMetadata
from app.core.security import get_current_user, check_domain_access
import uuid
from datetime import datetime, timezone, date as date_type

router = APIRouter(tags=["Lineage"])
_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt(row: DataLineage, upstream_asset: DataAsset | None = None, downstream_asset: DataAsset | None = None) -> dict:
    return {
        "lineage_id":           row.lineage_id,
        "upstream_asset_id":    row.upstream_asset_id,
        "downstream_asset_id":  row.downstream_asset_id,
        "lineage_type":         row.lineage_type,
        "downstream_name":      row.downstream_name,
        "downstream_type":      row.downstream_type,
        "transformation_sql":   row.transformation_sql,
        "description":          row.description,
        "owner_email":          row.owner_email,
        "is_critical":          row.is_critical,
        "created_by":           row.created_by,
        "created_at":           row.created_at.isoformat(),
        # Friendly names resolved from joined DataAsset rows
        "upstream_table_name":   (
            f"{upstream_asset.sf_schema_name}.{upstream_asset.sf_table_name}" if upstream_asset else None
        ),
        "downstream_table_name": (
            f"{downstream_asset.sf_schema_name}.{downstream_asset.sf_table_name}" if downstream_asset else None
        ),
    }


async def _resolve_assets(rows: list[DataLineage], db: AsyncSession, id_field: str) -> dict[str, DataAsset]:
    """Batch-load DataAsset records for a list of lineage rows keyed by id_field."""
    ids = {getattr(r, id_field) for r in rows if getattr(r, id_field)}
    if not ids:
        return {}
    result = await db.execute(select(DataAsset).where(DataAsset.asset_id.in_(ids)))
    return {a.asset_id: a for a in result.scalars().all()}


@router.get("/assets/{asset_id}/lineage/upstream")
async def get_upstream(asset_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)
    result = await db.execute(select(DataLineage).where(DataLineage.downstream_asset_id == asset_id))
    rows = result.scalars().all()
    upstream_map = await _resolve_assets(rows, db, "upstream_asset_id")
    return [_fmt(r, upstream_asset=upstream_map.get(r.upstream_asset_id)) for r in rows]


@router.get("/assets/{asset_id}/lineage/downstream")
async def get_downstream(asset_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)
    result = await db.execute(select(DataLineage).where(DataLineage.upstream_asset_id == asset_id))
    rows = result.scalars().all()
    downstream_map = await _resolve_assets(rows, db, "downstream_asset_id")
    return [_fmt(r, downstream_asset=downstream_map.get(r.downstream_asset_id)) for r in rows]


@router.get("/assets/{asset_id}/lineage/impact")
async def get_impact(asset_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    downstream_res = await db.execute(select(DataLineage).where(DataLineage.upstream_asset_id == asset_id))
    downstream = downstream_res.scalars().all()
    downstream_map = await _resolve_assets(downstream, db, "downstream_asset_id")

    from datetime import date
    score_res = await db.execute(
        select(DQQualityScore).where(
            DQQualityScore.asset_id == asset_id,
            DQQualityScore.score_level == "table",
            DQQualityScore.score_date == date.today(),
        )
    )
    score_row = score_res.scalars().first()
    quality_score = float(score_row.quality_score) if score_row and score_row.quality_score else None

    critical_count = sum(1 for d in downstream if d.is_critical)
    if critical_count >= 3 or (downstream and critical_count >= 1):
        blast_radius = "HIGH"
    elif downstream:
        blast_radius = "MEDIUM"
    else:
        blast_radius = "LOW"

    return {
        "asset_id":             asset_id,
        "sf_table_name":        asset.sf_table_name,
        "current_quality_score": quality_score,
        "downstream_count":     len(downstream),
        "blast_radius_score":   blast_radius,
        "downstream": [_fmt(d, downstream_asset=downstream_map.get(d.downstream_asset_id)) for d in downstream],
    }


@router.post("/assets/{asset_id}/lineage", status_code=201)
async def create_lineage(asset_id: str, payload: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)
    row = DataLineage(
        lineage_id=str(uuid.uuid4()),
        upstream_asset_id=payload.get("upstream_asset_id"),
        downstream_asset_id=payload.get("downstream_asset_id"),
        lineage_type=payload.get("lineage_type", "table_to_table"),
        downstream_name=payload.get("downstream_name"),
        downstream_type=payload.get("downstream_type", "snowflake_table"),
        transformation_sql=payload.get("transformation_sql"),
        description=payload.get("description"),
        owner_email=payload.get("owner_email"),
        is_critical=payload.get("is_critical", False),
        created_by=user.get("email"),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    # Resolve asset names for the response
    upstream_asset = None
    downstream_asset = None
    if row.upstream_asset_id:
        upstream_asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == row.upstream_asset_id))).scalar_one_or_none()
    if row.downstream_asset_id:
        downstream_asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == row.downstream_asset_id))).scalar_one_or_none()
    return _fmt(row, upstream_asset=upstream_asset, downstream_asset=downstream_asset)


@router.delete("/assets/lineage/{lineage_id}", status_code=204)
async def delete_lineage(lineage_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    row = (await db.execute(select(DataLineage).where(DataLineage.lineage_id == lineage_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Lineage record not found")
    ref_asset_id = row.upstream_asset_id or row.downstream_asset_id
    if ref_asset_id:
        asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == ref_asset_id))).scalar_one_or_none()
        if asset:
            check_domain_access(user, asset.domain_id)
    await db.execute(sql_delete(DataLineage).where(DataLineage.lineage_id == lineage_id))
    await db.commit()


# ── Helpers for /graph endpoint ───────────────────────────────────────────────

def _fmt_col(col: ColumnMetadata) -> dict:
    return {
        "column_name":      col.column_name,
        "data_type":        col.data_type,
        "is_primary_key":   col.is_primary_key,
        "is_foreign_key":   col.is_foreign_key,
        "references_table": col.references_table,
        "is_nullable":      col.is_nullable,
        "ordinal_position": col.ordinal_position,
    }


async def _get_columns(asset_id: str, db: AsyncSession) -> list[dict]:
    res = await db.execute(
        select(ColumnMetadata)
        .where(ColumnMetadata.asset_id == asset_id)
        .order_by(ColumnMetadata.ordinal_position.nullslast(), ColumnMetadata.column_name)
    )
    return [_fmt_col(c) for c in res.scalars().all()]


async def _get_quality_score(asset_id: str, db: AsyncSession) -> float | None:
    res = await db.execute(
        select(DQQualityScore).where(
            DQQualityScore.asset_id == asset_id,
            DQQualityScore.score_level == "table",
            DQQualityScore.score_date == date_type.today(),
        )
    )
    row = res.scalars().first()
    return float(row.quality_score) if row and row.quality_score is not None else None


def _asset_node(asset: DataAsset, columns: list[dict], quality_score: float | None,
                source: str, lineage_id: str | None, is_critical: bool,
                lineage_type: str | None, downstream_name: str | None,
                downstream_type: str | None, fk_column: str | None = None) -> dict:
    return {
        "lineage_id":       lineage_id,
        "asset_id":         asset.asset_id if asset else None,
        "sf_table_name":    asset.sf_table_name if asset else (downstream_name or "Unknown"),
        "sf_schema_name":   asset.sf_schema_name if asset else "",
        "sf_database_name": asset.sf_database_name if asset else "",
        "quality_score":    quality_score,
        "columns":          columns,
        "source":           source,          # "data_lineage" | "fk_detection"
        "fk_column":        fk_column,
        "is_critical":      is_critical,
        "lineage_type":     lineage_type,
        "downstream_name":  downstream_name,
        "downstream_type":  downstream_type,
    }


@router.get("/assets/{asset_id}/lineage/graph")
async def get_lineage_graph(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return a complete lineage graph for a table including auto-detected FK relationships."""
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    check_domain_access(user, asset.domain_id)

    # Current asset columns + quality
    current_cols = await _get_columns(asset_id, db)
    current_score = await _get_quality_score(asset_id, db)

    # ── Existing data_lineage records ────────────────────────────────────────
    up_rows_res = await db.execute(select(DataLineage).where(DataLineage.downstream_asset_id == asset_id))
    up_rows = up_rows_res.scalars().all()
    dn_rows_res = await db.execute(select(DataLineage).where(DataLineage.upstream_asset_id == asset_id))
    dn_rows = dn_rows_res.scalars().all()

    upstream_asset_map = await _resolve_assets(up_rows, db, "upstream_asset_id")
    downstream_asset_map = await _resolve_assets(dn_rows, db, "downstream_asset_id")

    seen_upstream_ids: set[str] = set()
    seen_downstream_ids: set[str] = set()
    upstream_nodes: list[dict] = []
    downstream_nodes: list[dict] = []

    for row in up_rows:
        up_asset = upstream_asset_map.get(row.upstream_asset_id)
        cols = await _get_columns(row.upstream_asset_id, db) if row.upstream_asset_id else []
        score = await _get_quality_score(row.upstream_asset_id, db) if row.upstream_asset_id else None
        upstream_nodes.append(_asset_node(
            asset=up_asset, columns=cols, quality_score=score,
            source="data_lineage", lineage_id=row.lineage_id,
            is_critical=row.is_critical, lineage_type=row.lineage_type,
            downstream_name=row.downstream_name, downstream_type=row.downstream_type,
        ))
        if row.upstream_asset_id:
            seen_upstream_ids.add(row.upstream_asset_id)

    for row in dn_rows:
        dn_asset = downstream_asset_map.get(row.downstream_asset_id)
        cols = await _get_columns(row.downstream_asset_id, db) if row.downstream_asset_id else []
        score = await _get_quality_score(row.downstream_asset_id, db) if row.downstream_asset_id else None
        downstream_nodes.append(_asset_node(
            asset=dn_asset, columns=cols, quality_score=score,
            source="data_lineage", lineage_id=row.lineage_id,
            is_critical=row.is_critical, lineage_type=row.lineage_type,
            downstream_name=row.downstream_name, downstream_type=row.downstream_type,
        ))
        if row.downstream_asset_id:
            seen_downstream_ids.add(row.downstream_asset_id)

    # ── FK auto-detection: this table's FK columns → upstream ────────────────
    fk_cols_res = await db.execute(
        select(ColumnMetadata).where(
            ColumnMetadata.asset_id == asset_id,
            ColumnMetadata.is_foreign_key == True,
            ColumnMetadata.references_table.isnot(None),
        )
    )
    for fk_col in fk_cols_res.scalars().all():
        ref_name = fk_col.references_table.split(".")[-1].upper()
        match_res = await db.execute(
            select(DataAsset).where(func.upper(DataAsset.sf_table_name) == ref_name)
        )
        matched = match_res.scalars().first()
        if matched and matched.asset_id not in seen_upstream_ids:
            cols = await _get_columns(matched.asset_id, db)
            score = await _get_quality_score(matched.asset_id, db)
            upstream_nodes.append(_asset_node(
                asset=matched, columns=cols, quality_score=score,
                source="fk_detection", lineage_id=None,
                is_critical=False, lineage_type="table_to_table",
                downstream_name=None, downstream_type="snowflake_table",
                fk_column=fk_col.column_name,
            ))
            seen_upstream_ids.add(matched.asset_id)

    # ── FK auto-detection: other tables' FK columns referencing this table → downstream
    this_table_upper = asset.sf_table_name.upper()
    other_fk_res = await db.execute(
        select(ColumnMetadata).where(
            ColumnMetadata.asset_id != asset_id,
            ColumnMetadata.is_foreign_key == True,
            func.upper(func.split_part(ColumnMetadata.references_table, ".", -1)) == this_table_upper,
        )
    )
    for fk_col in other_fk_res.scalars().all():
        if fk_col.asset_id not in seen_downstream_ids:
            child_asset = (await db.execute(
                select(DataAsset).where(DataAsset.asset_id == fk_col.asset_id)
            )).scalar_one_or_none()
            if child_asset:
                cols = await _get_columns(child_asset.asset_id, db)
                score = await _get_quality_score(child_asset.asset_id, db)
                downstream_nodes.append(_asset_node(
                    asset=child_asset, columns=cols, quality_score=score,
                    source="fk_detection", lineage_id=None,
                    is_critical=False, lineage_type="table_to_table",
                    downstream_name=None, downstream_type="snowflake_table",
                    fk_column=fk_col.column_name,
                ))
                seen_downstream_ids.add(child_asset.asset_id)

    return {
        "current": {
            "asset_id":         asset.asset_id,
            "sf_table_name":    asset.sf_table_name,
            "sf_schema_name":   asset.sf_schema_name,
            "sf_database_name": asset.sf_database_name,
            "quality_score":    current_score,
            "columns":          current_cols,
        },
        "upstream":   upstream_nodes,
        "downstream": downstream_nodes,
    }
