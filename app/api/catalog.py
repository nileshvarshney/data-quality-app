from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.db.database import get_db
from app.db.models import (
    DataAsset, GlossaryTerm, DataProduct, AssetUsage,
    DQQualityScore, DataClassification, GlossaryTermAsset, Domain,
)
from app.core.security import get_current_user

router = APIRouter(prefix="/catalog", tags=["Catalog"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _thirty_days_ago() -> datetime:
    return _now() - timedelta(days=30)


@router.get("/search")
async def catalog_search(
    q: Optional[str] = Query(None, description="Search text"),
    type: Optional[str] = Query(None, description="Filter by type: asset, glossary, data_product"),
    entity_type: Optional[str] = Query(None, description="Alias for type"),
    domain_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Unified search across assets, glossary terms, and data products.
    Returns a combined list with an entity_type field.
    """
    # Accept both param names; 'type' wins over 'entity_type'
    effective_type = type or entity_type

    # Pre-load domain name map
    domains_result = await db.execute(select(Domain.domain_id, Domain.domain_name))
    domain_map: dict = {row.domain_id: row.domain_name for row in domains_result.all()}

    results = []
    search_term = f"%{q}%" if q else "%"

    # Search DataAsset
    if not effective_type or effective_type == "asset":
        asset_q = select(DataAsset)
        if q:
            asset_q = asset_q.where(
                DataAsset.sf_table_name.ilike(search_term)
                | DataAsset.table_description.ilike(search_term)
                | DataAsset.owner_name.ilike(search_term)
            )
        if domain_id:
            asset_q = asset_q.where(DataAsset.domain_id == domain_id)
        asset_q = asset_q.limit(limit)
        asset_result = await db.execute(asset_q)
        for asset in asset_result.scalars().all():
            results.append({
                "entity_type": "asset",
                "id": asset.asset_id,
                "name": asset.sf_table_name,
                "description": asset.table_description,
                "domain": domain_map.get(asset.domain_id),
                "owner": asset.owner_name or asset.owner_email,
                "sf_schema_name": asset.sf_schema_name,
                "criticality": asset.criticality,
                "certification_status": getattr(asset, "certification_status", None),
                "updated_at": asset.updated_at.isoformat() if asset.updated_at else None,
            })

    # Search GlossaryTerm
    if not effective_type or effective_type == "glossary":
        glossary_q = select(GlossaryTerm)
        if q:
            glossary_q = glossary_q.where(
                GlossaryTerm.term_name.ilike(search_term)
                | GlossaryTerm.definition.ilike(search_term)
            )
        if domain_id:
            glossary_q = glossary_q.where(GlossaryTerm.domain_id == domain_id)
        glossary_q = glossary_q.limit(limit)
        glossary_result = await db.execute(glossary_q)
        for term in glossary_result.scalars().all():
            results.append({
                "entity_type": "glossary",
                "id": term.term_id,
                "name": term.term_name,
                "description": term.definition,
                "domain": domain_map.get(term.domain_id),
                "owner": term.owner_email,
                "status": term.status,
                "updated_at": term.updated_at.isoformat() if term.updated_at else None,
            })

    # Search DataProduct
    if not effective_type or effective_type == "data_product":
        product_q = select(DataProduct)
        if q:
            product_q = product_q.where(
                DataProduct.product_name.ilike(search_term)
                | DataProduct.description.ilike(search_term)
            )
        if domain_id:
            product_q = product_q.where(DataProduct.domain_id == domain_id)
        product_q = product_q.limit(limit)
        product_result = await db.execute(product_q)
        for product in product_result.scalars().all():
            results.append({
                "entity_type": "data_product",
                "id": product.product_id,
                "name": product.product_name,
                "description": product.description,
                "domain": domain_map.get(product.domain_id),
                "owner": product.owner_email,
                "status": product.status,
                "updated_at": product.updated_at.isoformat() if product.updated_at else None,
            })

    return results[:limit]


@router.get("/popular")
async def catalog_popular(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Top 10 most-used assets. Falls back to most recently registered assets when no usage data exists."""
    # Pre-load domain name map
    domains_result = await db.execute(select(Domain.domain_id, Domain.domain_name))
    domain_map: dict = {row.domain_id: row.domain_name for row in domains_result.all()}

    cutoff = _thirty_days_ago()
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
        assets_result = await db.execute(
            select(DataAsset).where(DataAsset.asset_id.in_(asset_ids))
        )
        assets = assets_result.scalars().all()
    else:
        # Fallback: return all active assets ordered by domain + table name
        # so every domain is represented in the browse view
        fallback = await db.execute(
            select(DataAsset)
            .where(DataAsset.is_active == True)  # noqa: E712
            .order_by(DataAsset.domain_id, DataAsset.sf_table_name)
            .limit(50)
        )
        assets = fallback.scalars().all()

    def _fmt(a: DataAsset) -> dict:
        return {
            "entity_type": "asset",
            "id": a.asset_id,
            "name": a.sf_table_name,
            "description": a.table_description,
            "domain": domain_map.get(a.domain_id),
            "owner": a.owner_name or a.owner_email,
            "usage_count": usage_map.get(a.asset_id, 0),
        }

    return [_fmt(a) for a in assets]


@router.get("/recent")
async def catalog_recent(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Most recently updated data assets (last 10 by updated_at)."""
    result = await db.execute(
        select(DataAsset)
        .order_by(desc(DataAsset.updated_at))
        .limit(10)
    )
    return [
        {
            "asset_id": a.asset_id,
            "sf_table_name": a.sf_table_name,
            "sf_schema_name": a.sf_schema_name,
            "sf_database_name": a.sf_database_name,
            "domain_id": a.domain_id,
            "subdomain_id": a.subdomain_id,
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
    """
    Enriched asset list for a domain with quality score,
    certification status, classification count, and term count per asset.
    """
    assets_result = await db.execute(
        select(DataAsset).where(
            DataAsset.domain_id == domain_id,
            DataAsset.is_active == True,  # noqa: E712
        ).order_by(DataAsset.sf_table_name)
    )
    assets = assets_result.scalars().all()
    if not assets:
        return []

    asset_ids = [a.asset_id for a in assets]

    # Latest quality scores per asset
    scores_result = await db.execute(
        select(
            DQQualityScore.asset_id,
            func.avg(DQQualityScore.quality_score).label("avg_quality"),
        )
        .where(
            DQQualityScore.asset_id.in_(asset_ids),
            DQQualityScore.score_level == "table",
        )
        .group_by(DQQualityScore.asset_id)
    )
    quality_map = {r.asset_id: round(float(r.avg_quality), 2) for r in scores_result.all()}

    # Classification counts per asset
    class_result = await db.execute(
        select(DataClassification.asset_id, func.count().label("classification_count"))
        .where(DataClassification.asset_id.in_(asset_ids))
        .group_by(DataClassification.asset_id)
    )
    classification_map = {r.asset_id: r.classification_count for r in class_result.all()}

    # Glossary term counts per asset
    terms_result = await db.execute(
        select(GlossaryTermAsset.asset_id, func.count().label("term_count"))
        .where(GlossaryTermAsset.asset_id.in_(asset_ids))
        .group_by(GlossaryTermAsset.asset_id)
    )
    term_map = {r.asset_id: r.term_count for r in terms_result.all()}

    return [
        {
            "asset_id": a.asset_id,
            "sf_table_name": a.sf_table_name,
            "sf_schema_name": a.sf_schema_name,
            "sf_database_name": a.sf_database_name,
            "table_description": a.table_description,
            "criticality": a.criticality,
            "certification_status": a.certification_status,
            "certified_by": a.certified_by,
            "owner_name": a.owner_name,
            "owner_email": a.owner_email,
            "quality_score": quality_map.get(a.asset_id),
            "classification_count": classification_map.get(a.asset_id, 0),
            "term_count": term_map.get(a.asset_id, 0),
            "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        }
        for a in assets
    ]
