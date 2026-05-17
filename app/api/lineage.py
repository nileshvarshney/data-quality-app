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
