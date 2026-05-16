import re
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.db.models import SnowflakeConnection
from app.core.security import get_current_user
from app.core.encryption import encrypt, decrypt

logger = logging.getLogger("dq_platform.connections")
router = APIRouter(prefix="/connections", tags=["Snowflake Connections"])

MASKED = "***MASKED***"

_IDENT_RE = re.compile(r'^[A-Za-z0-9_$]+$')


def _safe_ident(value: str, label: str) -> str:
    """Validate that a Snowflake identifier contains only safe characters."""
    if not value or not _IDENT_RE.match(value):
        raise HTTPException(
            400,
            f"Invalid {label} '{value}': identifiers must contain only "
            "letters, digits, underscores, or dollar signs.",
        )
    return value


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConnectionCreate(BaseModel):
    connection_name: str
    account: str
    sf_user: str
    password: str | None = None
    warehouse: str = "DQ_EXECUTION_WH"
    role: str | None = None
    default_database: str | None = None
    default_schema: str | None = None
    description: str | None = None
    is_active: bool = True


class ConnectionUpdate(BaseModel):
    connection_name: str | None = None
    account: str | None = None
    sf_user: str | None = None
    password: str | None = None
    warehouse: str | None = None
    role: str | None = None
    default_database: str | None = None
    default_schema: str | None = None
    description: str | None = None
    is_active: bool | None = None


def _mask(conn: SnowflakeConnection) -> dict:
    return {
        "connection_id": conn.connection_id,
        "connection_name": conn.connection_name,
        "account": conn.account,
        "sf_user": conn.sf_user,
        "password": MASKED if conn.password else None,
        "has_password": bool(conn.password),
        "warehouse": conn.warehouse,
        "role": conn.role,
        "default_database": conn.default_database,
        "default_schema": conn.default_schema,
        "description": conn.description,
        "is_active": conn.is_active,
        "created_at": conn.created_at.isoformat(),
        "updated_at": conn.updated_at.isoformat(),
    }


def _open_connector(conn: SnowflakeConnection):
    import snowflake.connector
    kwargs = dict(
        account=conn.account,
        user=conn.sf_user,
        password=decrypt(conn.password) or "",
        warehouse=conn.warehouse,
    )
    if conn.role:
        kwargs["role"] = conn.role
    if conn.default_database:
        kwargs["database"] = conn.default_database
    if conn.default_schema:
        kwargs["schema"] = conn.default_schema
    return snowflake.connector.connect(**kwargs)


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("")
async def create_connection(
    payload: ConnectionCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    data = payload.model_dump()
    if data.get("password"):
        data["password"] = encrypt(data["password"])
    conn = SnowflakeConnection(connection_id=str(uuid.uuid4()), **data)
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return _mask(conn)


@router.get("")
async def list_connections(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(SnowflakeConnection).order_by(SnowflakeConnection.connection_name)
    )
    return [_mask(c) for c in result.scalars().all()]


@router.get("/{connection_id}")
async def get_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    return _mask(conn)


@router.put("/{connection_id}")
async def update_connection(
    connection_id: str,
    payload: ConnectionUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "password":
            if value == MASKED:
                continue
            value = encrypt(value) if value else value
        setattr(conn, field, value)
    conn.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(conn)
    return _mask(conn)


@router.delete("/{connection_id}")
async def delete_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    await db.delete(conn)
    await db.commit()
    return {"message": "Connection deleted"}


# ── Test ──────────────────────────────────────────────────────────────────────

@router.post("/{connection_id}/test")
async def test_connection(connection_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    if not conn.password:
        return {"status": "error", "message": "No password saved for this connection"}
    try:
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute("SELECT CURRENT_VERSION(), CURRENT_ROLE(), CURRENT_WAREHOUSE()")
        row = cur.fetchone()
        cur.close()
        sf.close()
        return {
            "status": "ok",
            "message": f"Connected successfully",
            "snowflake_version": row[0],
            "role": row[1],
            "warehouse": row[2],
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── Browse ────────────────────────────────────────────────────────────────────

async def _get_conn_or_404(connection_id: str, db: AsyncSession) -> SnowflakeConnection:
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    return conn


@router.get("/{connection_id}/databases")
async def browse_databases(connection_id: str, db: AsyncSession = Depends(get_db)):
    conn = await _get_conn_or_404(connection_id, db)
    try:
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute("SHOW DATABASES")
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        cur.close()
        sf.close()
        dbs = [dict(zip(col_names, r)) for r in rows]
        return {
            "databases": [
                {
                    "name": d.get("name", ""),
                    "owner": d.get("owner", ""),
                    "comment": d.get("comment", ""),
                    "created_on": str(d.get("created_on", "")),
                }
                for d in dbs
                if d.get("name", "").upper() not in ("SNOWFLAKE", "SNOWFLAKE_SAMPLE_DATA")
            ]
        }
    except Exception as e:
        return {"databases": [], "error": str(e)}


@router.get("/{connection_id}/schemas")
async def browse_schemas(
    connection_id: str,
    database: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_conn_or_404(connection_id, db)
    # Validate identifier to prevent SQL injection
    db_safe = _safe_ident(database, "database")
    try:
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute(f'SHOW SCHEMAS IN DATABASE "{db_safe}"')
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        cur.close()
        sf.close()
        schemas = [dict(zip(col_names, r)) for r in rows]
        return {
            "schemas": [
                {
                    "name": s.get("name", ""),
                    "owner": s.get("owner", ""),
                    "comment": s.get("comment", ""),
                }
                for s in schemas
                if s.get("name", "").upper() != "INFORMATION_SCHEMA"
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"schemas": [], "error": str(e)}


@router.get("/{connection_id}/columns")
async def browse_columns(
    connection_id: str,
    database: str = Query(...),
    schema: str = Query(...),
    table: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_conn_or_404(connection_id, db)
    # Validate all identifiers before interpolation
    db_safe = _safe_ident(database, "database")
    schema_safe = _safe_ident(schema, "schema")
    table_safe = _safe_ident(table, "table")
    try:
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute(f"""
            SELECT column_name, data_type, is_nullable, ordinal_position,
                   COALESCE(comment, '') AS comment
            FROM "{db_safe}".INFORMATION_SCHEMA.COLUMNS
            WHERE UPPER(table_schema) = '{schema_safe.upper()}'
              AND UPPER(table_name)   = '{table_safe.upper()}'
            ORDER BY ordinal_position
        """)
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        cur.close()
        sf.close()
        return {
            "columns": [dict(zip(col_names, r)) for r in rows],
            "database": database,
            "schema": schema,
            "table": table,
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"columns": [], "error": str(e)}


@router.get("/{connection_id}/tables")
async def browse_tables(
    connection_id: str,
    database: str = Query(...),
    schema: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_conn_or_404(connection_id, db)
    db_safe = _safe_ident(database, "database")
    schema_safe = _safe_ident(schema, "schema")
    try:
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute(f"""
            SELECT table_name, table_type,
                   COALESCE(row_count, 0)  AS row_count,
                   COALESCE(bytes, 0)      AS bytes,
                   COALESCE(comment, '')   AS comment,
                   last_altered
            FROM "{db_safe}".INFORMATION_SCHEMA.TABLES
            WHERE UPPER(table_schema) = '{schema_safe.upper()}'
            ORDER BY table_name
        """)
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        cur.close()
        sf.close()
        return {
            "tables": [dict(zip(col_names, r)) for r in rows],
            "database": database,
            "schema": schema,
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"tables": [], "error": str(e)}
