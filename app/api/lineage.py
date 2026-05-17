import asyncio
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
from app.core.security import get_current_user, check_domain_access

logger = logging.getLogger("dq_platform.lineage")

router = APIRouter(prefix="/lineage", tags=["Lineage"])


def extract_table_refs(view_sql: str) -> list[str]:
    """Return upper-cased table names from every FROM/JOIN in the view SQL, excluding CTE aliases."""
    if not view_sql or not view_sql.strip():
        return []
    try:
        tree = sqlglot.parse_one(view_sql, dialect="snowflake")
    except Exception as exc:
        logger.debug("extract_table_refs parse error: %s", exc)
        return []
    # Collect CTE alias names so we can exclude them
    cte_names: set[str] = {
        cte.alias.upper() for cte in tree.find_all(exp.CTE) if cte.alias
    }
    refs: set[str] = set()
    for table in tree.find_all(exp.Table):
        if table.name and table.name.upper() not in cte_names:
            refs.add(table.name.upper())
    return list(refs)


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
        .distinct()
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
    user=Depends(get_current_user),
):
    asset = await db.get(DataAsset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")

    check_domain_access(user, asset.domain_id)

    # ── Upstream ──────────────────────────────────────────────────────────────
    upstream_assets: list[DataAsset] = []
    if asset.view_definition and asset.connection_id:
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

    # ── Downstream ────────────────────────────────────────────────────────────
    downstream_assets: list[DataAsset] = []
    if asset.connection_id:
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

    asset_node = await _enrich(asset, db)
    upstream_nodes = await asyncio.gather(*[_enrich(a, db) for a in upstream_assets]) if upstream_assets else []
    downstream_nodes = await asyncio.gather(*[_enrich(a, db) for a in downstream_assets]) if downstream_assets else []
    return {
        "asset": asset_node,
        "upstream": list(upstream_nodes),
        "downstream": list(downstream_nodes),
    }
