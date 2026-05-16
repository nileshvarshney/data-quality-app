import re
import logging
from typing import Any
from app.core.config import settings

logger = logging.getLogger("dq_platform.snowflake")

_IDENT_RE = re.compile(r'^[A-Za-z0-9_$]+$')


def _safe_ident(value: str, label: str) -> str:
    if not value or not _IDENT_RE.match(value):
        raise ValueError(
            f"Invalid {label} '{value}': must contain only letters, digits, underscores, or dollar signs."
        )
    return value


class SnowflakeClient:
    """
    Env-var-based global Snowflake client.

    Delegates all query execution to a SnowflakeConnectionPool so that
    connections are reused rather than opened fresh for every call.
    The legacy `_conn` attribute is kept as None for backward compatibility
    with the resolver in execution_service.py which checks `if not client._conn`.
    """

    def __init__(self):
        self._conn = None  # kept for legacy resolver check
        self._pool = None

    def _get_pool(self):
        if self._pool is not None:
            return self._pool
        if not settings.snowflake_account:
            return None
        from app.db.snowflake_pool import get_or_create_pool
        kwargs = dict(
            account=settings.snowflake_account,
            user=settings.snowflake_user,
            password=settings.snowflake_password,
            warehouse=settings.snowflake_warehouse,
        )
        if settings.snowflake_database:
            kwargs["database"] = settings.snowflake_database
        if settings.snowflake_schema:
            kwargs["schema"] = settings.snowflake_schema
        if settings.snowflake_role:
            kwargs["role"] = settings.snowflake_role
        self._pool = get_or_create_pool(
            kwargs,
            min_size=settings.snowflake_pool_min_size,
            max_size=settings.snowflake_pool_max_size,
            acquire_timeout=settings.snowflake_pool_acquire_timeout,
        )
        logger.info("Snowflake global client pool initialised")
        return self._pool

    def execute_query(self, sql: str, params: dict | None = None) -> list[dict[str, Any]]:
        pool = self._get_pool()
        if pool is None:
            raise RuntimeError("Snowflake not configured")
        return pool.execute_query(sql, session_timeout=settings.execution_timeout_seconds)

    def execute_count_query(self, sql: str) -> int:
        rows = self.execute_query(sql)
        if rows and rows[0]:
            return int(list(rows[0].values())[0])
        return 0

    def get_table_row_count(self, database: str, schema: str, table: str) -> int:
        sql = f'SELECT COUNT(*) AS cnt FROM "{database}"."{schema}"."{table}"'
        return self.execute_count_query(sql)

    def get_table_columns(self, database: str, schema: str, table: str) -> list[dict]:
        db_safe = _safe_ident(database, "database")
        schema_safe = _safe_ident(schema, "schema")
        table_safe = _safe_ident(table, "table")
        sql = f"""
            SELECT column_name, data_type, is_nullable
            FROM "{db_safe}".INFORMATION_SCHEMA.COLUMNS
            WHERE UPPER(table_schema) = '{schema_safe.upper()}'
              AND UPPER(table_name)   = '{table_safe.upper()}'
            ORDER BY ordinal_position
        """
        return self.execute_query(sql)

    def close(self):
        """No-op — pool lifecycle is managed by close_all_pools() at shutdown."""
        pass


snowflake_client = SnowflakeClient()
