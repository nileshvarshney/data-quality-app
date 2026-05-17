import asyncio
from contextlib import asynccontextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session, DeclarativeBase
from snowflake.sqlalchemy import URL as SnowflakeURL
from app.core.config import settings


class Base(DeclarativeBase):
    pass


def _build_snowflake_url() -> SnowflakeURL:
    return SnowflakeURL(
        account=settings.snowflake_account,
        user=settings.snowflake_user,
        password=settings.snowflake_password,
        database=settings.snowflake_app_database,
        schema=settings.snowflake_app_schema,
        warehouse=settings.snowflake_warehouse,
        role=settings.snowflake_role,
    )


engine = create_engine(
    _build_snowflake_url(),
    echo=settings.debug,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=True,
)

_SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class SnowflakeAsyncSession:
    """Wraps a sync SQLAlchemy Session with async methods via asyncio.to_thread.

    Drop-in replacement for AsyncSession — all routers and services work without changes.
    """

    def __init__(self, session: Session):
        self._s = session

    # ── query ops ─────────────────────────────────────────────────────────────
    async def execute(self, statement, *args, **kwargs):
        return await asyncio.to_thread(self._s.execute, statement, *args, **kwargs)

    async def scalar(self, statement, *args, **kwargs):
        return await asyncio.to_thread(self._s.scalar, statement, *args, **kwargs)

    async def scalars(self, statement, *args, **kwargs):
        return await asyncio.to_thread(self._s.scalars, statement, *args, **kwargs)

    async def get(self, entity, pk, **kwargs):
        return await asyncio.to_thread(self._s.get, entity, pk, **kwargs)

    # ── mutation ops ──────────────────────────────────────────────────────────
    def add(self, instance):
        self._s.add(instance)

    def add_all(self, instances):
        self._s.add_all(instances)

    async def delete(self, instance):
        await asyncio.to_thread(self._s.delete, instance)

    async def merge(self, instance):
        return await asyncio.to_thread(self._s.merge, instance)

    # ── transaction ops ───────────────────────────────────────────────────────
    async def flush(self, objects=None):
        await asyncio.to_thread(self._s.flush, objects)

    async def commit(self):
        await asyncio.to_thread(self._s.commit)

    async def rollback(self):
        await asyncio.to_thread(self._s.rollback)

    async def refresh(self, instance, attribute_names=None):
        await asyncio.to_thread(self._s.refresh, instance, attribute_names)

    async def close(self):
        await asyncio.to_thread(self._s.close)

    # ── context manager (supports `async with db.begin():`) ───────────────────
    @asynccontextmanager
    async def begin(self):
        try:
            yield self
            await self.commit()
        except Exception:
            await self.rollback()
            raise

    # ── sync passthrough ──────────────────────────────────────────────────────
    def expire(self, instance, attribute_names=None):
        self._s.expire(instance, attribute_names)

    def expunge(self, instance):
        self._s.expunge(instance)

    def expunge_all(self):
        self._s.expunge_all()


async def get_db():
    """FastAPI dependency — yields SnowflakeAsyncSession (same interface as AsyncSession)."""
    session = _SessionLocal()
    db = SnowflakeAsyncSession(session)
    try:
        yield db
    finally:
        await db.close()


@asynccontextmanager
async def get_session_ctx():
    """Async context manager for use outside of FastAPI route handlers (lifespan, services)."""
    session = _SessionLocal()
    db = SnowflakeAsyncSession(session)
    try:
        yield db
    finally:
        await db.close()


# Backwards-compatibility alias — existing callers that do:
#   async with AsyncSessionLocal() as db: ...
# continue to work unchanged.
AsyncSessionLocal = get_session_ctx


def create_tables():
    """Idempotent table creation. Called once at startup via asyncio.to_thread."""
    Base.metadata.create_all(bind=engine, checkfirst=True)


async def check_db_health() -> tuple[bool, str]:
    """Returns (ok, error_message). Used by the /health endpoint."""
    try:
        def _ping():
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        await asyncio.to_thread(_ping)
        return True, ""
    except Exception as exc:
        return False, str(exc)
