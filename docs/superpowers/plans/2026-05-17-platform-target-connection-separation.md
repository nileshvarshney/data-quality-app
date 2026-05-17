# Platform vs Target Snowflake Connection Separation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `.env` file dependency, rename platform Snowflake settings to `sf_platform_*`, add `connection_type` + `is_primary_target` columns to `SnowflakeConnection`, expose two new API endpoints for managing the primary target connection, update the rule execution fallback chain, and reorganize the Settings UI into Platform Connection / Target Database / Named Connections tabs.

**Architecture:** The platform DB connection (for app tables) reads from OS env vars (`SF_PLATFORM_*`) via pydantic-settings with no file loading. Target DB connections for DQ rule execution are stored as `SnowflakeConnection` records — one may be designated primary target (`is_primary_target=True`) and serves as the execution fallback. The env-var-based `snowflake_client.py` global fallback is deleted.

**Tech Stack:** FastAPI, SQLAlchemy (sync via `asyncio.to_thread`), Snowflake SQLAlchemy + connector, pydantic-settings, Next.js 15 / TypeScript / Tailwind

---

## File Map

| File | Action | What changes |
|---|---|---|
| `app/core/config.py` | Modify | Remove `env_file`, rename 5 platform settings, remove 2 source settings |
| `app/core/secrets_loader.py` | Modify | Update `_SENSITIVE_KEYS` to use `sf_platform_password` |
| `app/db/database.py` | Modify | Use renamed settings in `_build_snowflake_url()`; add `ALTER TABLE` for 2 new columns |
| `app/db/models.py` | Modify | Add `connection_type` and `is_primary_target` to `SnowflakeConnection` |
| `app/db/snowflake_client.py` | **Delete** | Replaced by primary target connection fallback |
| `app/services/config_service.py` | Modify | Remove `snowflake` AppConfig category from `CONFIG_DEFAULTS` |
| `app/api/connections.py` | Modify | New schema fields; `GET /connections/primary-target`; `PUT /connections/{id}/set-primary-target`; update `_mask()` |
| `app/api/config.py` | Modify | Add `GET /config/platform-info`; update `POST /config/test/database` message; remove `POST /config/test/snowflake` |
| `app/services/execution_service.py` | Modify | Update `_resolve_executor()` fallback; remove `snowflake_client` import |
| `docker-compose.yml` | Modify | Rename env var keys to `SF_PLATFORM_*`; remove `SNOWFLAKE_DATABASE/SCHEMA` |
| `.env.example` | **Create** | Documents all env vars for local dev |
| `tests/test_connections.py` | **Create** | Unit tests for new connection endpoints and model logic |
| `frontend/src/app/settings/page.tsx` | Modify | Tab reorganization: Platform Connection (read-only), Target Database (CRUD), Named Connections |

---

## Task 1: Rename platform settings and remove `.env` file loading

**Files:**
- Modify: `app/core/config.py`
- Modify: `app/core/secrets_loader.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_connections.py`:

```python
"""Tests for platform/target connection separation."""
import pytest
from app.core.config import settings


def test_platform_settings_use_sf_prefix():
    """Platform settings must use sf_platform_ prefix, not snowflake_."""
    assert hasattr(settings, "sf_platform_account")
    assert hasattr(settings, "sf_platform_user")
    assert hasattr(settings, "sf_platform_password")
    assert hasattr(settings, "sf_platform_warehouse")
    assert hasattr(settings, "sf_platform_role")


def test_removed_source_settings():
    """snowflake_database and snowflake_schema must not exist in settings."""
    assert not hasattr(settings, "snowflake_database")
    assert not hasattr(settings, "snowflake_schema")


def test_env_file_not_configured():
    """Settings must not reference a .env file."""
    config_class = settings.__class__
    model_config = getattr(config_class, "model_config", None)
    # pydantic-settings v2 stores env_file in model_config
    if model_config:
        assert model_config.get("env_file") is None
    else:
        # pydantic v1 style inner Config class
        inner = getattr(config_class, "Config", None)
        if inner:
            assert not hasattr(inner, "env_file") or getattr(inner, "env_file", None) is None
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
pytest tests/test_connections.py::test_platform_settings_use_sf_prefix tests/test_connections.py::test_removed_source_settings tests/test_connections.py::test_env_file_not_configured -v
```

Expected: FAIL — `sf_platform_account` does not exist on settings.

- [ ] **Step 3: Update `app/core/config.py`**

Replace the `Settings` class and inner `Config` entirely:

```python
from pydantic_settings import BaseSettings
from typing import Optional

_WEAK_SECRET_KEYS = {
    "change-me-in-production-use-openssl-rand-hex-32",
    "change-me-in-production",
    "secret",
    "changeme",
    "",
}


class Settings(BaseSettings):
    app_env: str = "local"
    app_name: str = "Data Quality & Governance"
    debug: bool = False

    # ── Platform Snowflake connection (app's own tables: DQ_PLATFORM_DB.DQ_APP) ──
    # Set via env vars: SF_PLATFORM_ACCOUNT, SF_PLATFORM_USER, etc.
    sf_platform_account: str = ""
    sf_platform_user: str = ""
    sf_platform_password: str = ""
    sf_platform_warehouse: str = "DQ_EXECUTION_WH"
    sf_platform_role: str = "DQ_PLATFORM_ROLE"
    # Platform app database and schema (where platform tables live)
    snowflake_app_database: str = "DQ_PLATFORM_DB"
    snowflake_app_schema: str = "DQ_APP"

    # Warehouse used for column profiling (smaller WH, optional)
    snowflake_profile_warehouse: str = "DQ_SMALL_WH"

    # LLM
    llm_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b-instruct"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str = ""
    claude_model: str = "claude-3-5-sonnet-latest"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Scheduler
    scheduler_type: str = "apscheduler"
    default_timezone: str = "America/Los_Angeles"

    # Security
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    encryption_key: str = ""

    # Alerts & Notifications
    slack_webhook_url: str = ""
    teams_webhook_url: str = ""
    pagerduty_integration_key: str = ""
    alert_webhook_url: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "dq-platform@example.com"
    smtp_use_tls: bool = True
    alert_email_recipients: str = ""

    # Security / Auth
    auth_required: bool = True
    allowed_origins: str = "http://localhost:3000,http://localhost:3001"
    rate_limit_per_minute: int = 120

    # OAuth2 / SSO
    google_client_id: str = ""
    google_client_secret: str = ""
    oauth_redirect_uri: str = "http://localhost:8000/auth/oauth/google/callback"
    frontend_url: str = "http://localhost:3000"

    # Secrets backends (production)
    vault_addr: str = ""
    vault_token: str = ""
    vault_secret_path: str = ""
    aws_secrets_name: str = ""
    aws_region: str = "us-east-1"

    # Performance
    db_pool_size: int = 10
    db_max_overflow: int = 20
    execution_timeout_seconds: int = 300
    execution_max_retries: int = 3

    # Snowflake connection pool (for target connections)
    snowflake_pool_min_size: int = 1
    snowflake_pool_max_size: int = 5
    snowflake_pool_acquire_timeout: float = 30.0

    model_config = {"env_file": None, "case_sensitive": False}

    def is_weak_secret_key(self) -> bool:
        return self.secret_key.lower() in _WEAK_SECRET_KEYS or len(self.secret_key) < 32


settings = Settings()
```

- [ ] **Step 4: Update `app/core/secrets_loader.py`**

Change `snowflake_password` → `sf_platform_password` in `_SENSITIVE_KEYS`, and update the module docstring to remove the `.env` reference:

Replace the module docstring line `"Local dev continues to use .env as normal."` with `"Local dev uses OS environment variables directly."`.

Update `_SENSITIVE_KEYS`:

```python
_SENSITIVE_KEYS = {
    "secret_key",
    "encryption_key",
    "sf_platform_password",
    "openai_api_key",
    "anthropic_api_key",
    "gemini_api_key",
    "google_client_secret",
    "smtp_password",
    "pagerduty_integration_key",
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pytest tests/test_connections.py::test_platform_settings_use_sf_prefix tests/test_connections.py::test_removed_source_settings tests/test_connections.py::test_env_file_not_configured -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/core/config.py app/core/secrets_loader.py tests/test_connections.py
git commit -m "feat: rename platform Snowflake settings to sf_platform_* and remove .env file loading"
```

---

## Task 2: Update `database.py` to use renamed settings

**Files:**
- Modify: `app/db/database.py`

- [ ] **Step 1: Update `_build_snowflake_url()` in `app/db/database.py`**

Replace lines 16–25:

```python
def _build_snowflake_url() -> SnowflakeURL:
    return SnowflakeURL(
        account=settings.sf_platform_account,
        user=settings.sf_platform_user,
        password=settings.sf_platform_password,
        database=settings.snowflake_app_database,
        schema=settings.snowflake_app_schema,
        warehouse=settings.sf_platform_warehouse,
        role=settings.sf_platform_role,
    )
```

- [ ] **Step 2: Verify app still imports cleanly**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
python -c "from app.db.database import engine; print('OK')"
```

Expected: `OK` (or a Snowflake auth error — not an import error)

- [ ] **Step 3: Update `check_db_health` message**

In `app/api/config.py`, find `POST /config/test/database` (line ~90). Update the success message:

```python
return {"status": "ok", "message": "Platform Snowflake connection successful"}
```

- [ ] **Step 4: Commit**

```bash
git add app/db/database.py app/api/config.py
git commit -m "feat: update database.py to use sf_platform_* settings"
```

---

## Task 3: Add `connection_type` and `is_primary_target` columns to `SnowflakeConnection`

**Files:**
- Modify: `app/db/models.py`
- Modify: `app/db/database.py` (ALTER TABLE section)

- [ ] **Step 1: Write failing test**

Append to `tests/test_connections.py`:

```python
from app.db.models import SnowflakeConnection


def test_snowflake_connection_has_new_columns():
    """SnowflakeConnection model must have connection_type and is_primary_target."""
    cols = {c.key for c in SnowflakeConnection.__table__.columns}
    assert "connection_type" in cols
    assert "is_primary_target" in cols
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pytest tests/test_connections.py::test_snowflake_connection_has_new_columns -v
```

Expected: FAIL

- [ ] **Step 3: Add columns to `SnowflakeConnection` in `app/db/models.py`**

Find the `SnowflakeConnection` class (line ~344). Add two lines after `is_active`:

```python
class SnowflakeConnection(Base):
    __tablename__ = "snowflake_connections"

    connection_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    connection_name: Mapped[str] = mapped_column(String(200), nullable=False)
    account: Mapped[str] = mapped_column(String(300), nullable=False)
    sf_user: Mapped[str] = mapped_column(String(200), nullable=False)
    password: Mapped[str | None] = mapped_column(Text)
    warehouse: Mapped[str] = mapped_column(String(200), default="DQ_EXECUTION_WH")
    role: Mapped[str | None] = mapped_column(String(200))
    default_database: Mapped[str | None] = mapped_column(String(200))
    default_schema: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    connection_type: Mapped[str] = mapped_column(String(50), default="named")
    is_primary_target: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
```

- [ ] **Step 4: Add `ALTER TABLE` to `create_tables()` in `app/db/database.py`**

After the `conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS ...'))` block (around line 149), add:

```python
        conn.execute(text(
            'ALTER TABLE IF EXISTS snowflake_connections '
            'ADD COLUMN IF NOT EXISTS connection_type VARCHAR(50) DEFAULT \'named\''
        ))
        conn.execute(text(
            'ALTER TABLE IF EXISTS snowflake_connections '
            'ADD COLUMN IF NOT EXISTS is_primary_target BOOLEAN DEFAULT FALSE'
        ))
        conn.commit()
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
pytest tests/test_connections.py::test_snowflake_connection_has_new_columns -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/db/models.py app/db/database.py tests/test_connections.py
git commit -m "feat: add connection_type and is_primary_target columns to SnowflakeConnection"
```

---

## Task 4: Remove `snowflake` AppConfig entries from `config_service.py`

**Files:**
- Modify: `app/services/config_service.py`

- [ ] **Step 1: Remove the entire `snowflake` category block from `CONFIG_DEFAULTS`**

In `app/services/config_service.py`, delete these 7 entries from the `CONFIG_DEFAULTS` list (lines ~26–33):

```python
    # DELETE these lines entirely:
    {"category": "snowflake", "key": "snowflake_account", ...},
    {"category": "snowflake", "key": "snowflake_user", ...},
    {"category": "snowflake", "key": "snowflake_password", ...},
    {"category": "snowflake", "key": "snowflake_warehouse", ...},
    {"category": "snowflake", "key": "snowflake_database", ...},
    {"category": "snowflake", "key": "snowflake_schema", ...},
    {"category": "snowflake", "key": "snowflake_role", ...},
```

Also remove the comment line: `# Snowflake — source data connections`

- [ ] **Step 2: Write test confirming the keys are gone**

Append to `tests/test_connections.py`:

```python
from app.services.config_service import CONFIG_DEFAULTS


def test_snowflake_appconfig_keys_removed():
    """AppConfig must not contain the old snowflake source-data keys."""
    removed_keys = {
        "snowflake_account", "snowflake_user", "snowflake_password",
        "snowflake_warehouse", "snowflake_database", "snowflake_schema", "snowflake_role",
    }
    existing_keys = {item["key"] for item in CONFIG_DEFAULTS}
    assert not removed_keys & existing_keys, f"These keys should be removed: {removed_keys & existing_keys}"
```

- [ ] **Step 3: Run test**

```bash
pytest tests/test_connections.py::test_snowflake_appconfig_keys_removed -v
```

Expected: PASS

- [ ] **Step 4: Remove `POST /config/test/snowflake` from `app/api/config.py`**

Delete the entire `test_snowflake` route function (lines ~100–123 in config.py — from `@router.post("/test/snowflake")` through the closing `except Exception` block).

- [ ] **Step 5: Commit**

```bash
git add app/services/config_service.py app/api/config.py tests/test_connections.py
git commit -m "feat: remove snowflake AppConfig entries and obsolete test endpoint"
```

---

## Task 5: Add new endpoints and fields to `connections.py`

**Files:**
- Modify: `app/api/connections.py`

- [ ] **Step 1: Write failing tests for new endpoints**

Append to `tests/test_connections.py`:

```python
from app.api.connections import _mask
from unittest.mock import MagicMock


def _make_conn(**kwargs):
    """Build a mock SnowflakeConnection with defaults."""
    defaults = dict(
        connection_id="abc-123",
        connection_name="Test",
        account="myorg-myaccount",
        sf_user="dq_user",
        password="enc_pass",
        warehouse="DQ_WH",
        role="DQ_ROLE",
        default_database="MY_DB",
        default_schema="PUBLIC",
        description="desc",
        is_active=True,
        connection_type="named",
        is_primary_target=False,
        created_at=__import__("datetime").datetime(2026, 1, 1),
        updated_at=__import__("datetime").datetime(2026, 1, 1),
    )
    defaults.update(kwargs)
    m = MagicMock()
    for k, v in defaults.items():
        setattr(m, k, v)
    return m


def test_mask_includes_new_fields():
    """_mask() must include connection_type and is_primary_target."""
    conn = _make_conn()
    result = _mask(conn)
    assert result["connection_type"] == "named"
    assert result["is_primary_target"] is False


def test_mask_primary_target():
    """_mask() must reflect is_primary_target=True when set."""
    conn = _make_conn(connection_type="target", is_primary_target=True)
    result = _mask(conn)
    assert result["connection_type"] == "target"
    assert result["is_primary_target"] is True
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_connections.py::test_mask_includes_new_fields tests/test_connections.py::test_mask_primary_target -v
```

Expected: FAIL — `_mask()` does not return `connection_type` or `is_primary_target`.

- [ ] **Step 3: Update `ConnectionCreate`, `ConnectionUpdate`, and `_mask()` in `app/api/connections.py`**

Update `ConnectionCreate`:

```python
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
    connection_type: str = "named"
    is_primary_target: bool = False
```

Update `ConnectionUpdate`:

```python
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
    connection_type: str | None = None
    is_primary_target: bool | None = None
```

Update `_mask()`:

```python
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
        "connection_type": conn.connection_type,
        "is_primary_target": conn.is_primary_target,
        "created_at": conn.created_at.isoformat(),
        "updated_at": conn.updated_at.isoformat(),
    }
```

- [ ] **Step 4: Add the two new endpoints to `app/api/connections.py`**

Add after the existing `delete_connection` route (before the `# ── Test ──` section):

```python
# ── Primary Target ────────────────────────────────────────────────────────────

@router.get("/primary-target")
async def get_primary_target(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return the connection designated as primary target, or 404 if none set."""
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.is_primary_target == True)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "No primary target connection configured")
    return _mask(conn)


@router.put("/{connection_id}/set-primary-target")
async def set_primary_target(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Designate one connection as the primary target; clears the flag on all others."""
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")

    # Clear existing primary target
    existing = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.is_primary_target == True)
    )
    for old in existing.scalars().all():
        old.is_primary_target = False
        old.connection_type = "named"

    conn.is_primary_target = True
    conn.connection_type = "target"
    conn.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(conn)
    return _mask(conn)
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_connections.py::test_mask_includes_new_fields tests/test_connections.py::test_mask_primary_target -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/connections.py tests/test_connections.py
git commit -m "feat: add connection_type/is_primary_target to connections API and new primary-target endpoints"
```

---

## Task 6: Add `GET /config/platform-info` endpoint

**Files:**
- Modify: `app/api/config.py`

- [ ] **Step 1: Add the endpoint to `app/api/config.py`**

Insert after the `get_display_timezone` route (after line ~31):

```python
@router.get("/platform-info")
async def get_platform_info():
    """Return non-sensitive platform Snowflake connection info (sourced from env vars)."""
    return {
        "account": settings.sf_platform_account or "(not set)",
        "user": settings.sf_platform_user or "(not set)",
        "warehouse": settings.sf_platform_warehouse,
        "role": settings.sf_platform_role,
        "app_database": settings.snowflake_app_database,
        "app_schema": settings.snowflake_app_schema,
        "has_password": bool(settings.sf_platform_password),
    }
```

Make sure `settings` is imported at the top of `config.py` (it should already be via `from app.core.config import settings`).

- [ ] **Step 2: Write test for the endpoint**

Append to `tests/test_connections.py`:

```python
from fastapi.testclient import TestClient
from unittest.mock import patch


def test_platform_info_endpoint():
    """GET /config/platform-info must return non-sensitive platform info."""
    from app.main import app
    with patch("app.core.config.settings") as mock_settings:
        mock_settings.sf_platform_account = "myorg-myaccount"
        mock_settings.sf_platform_user = "dq_user"
        mock_settings.sf_platform_password = "secret"
        mock_settings.sf_platform_warehouse = "DQ_WH"
        mock_settings.sf_platform_role = "DQ_ROLE"
        mock_settings.snowflake_app_database = "DQ_PLATFORM_DB"
        mock_settings.snowflake_app_schema = "DQ_APP"
        mock_settings.auth_required = False

        client = TestClient(app)
        response = client.get("/config/platform-info")
        assert response.status_code == 200
        data = response.json()
        assert data["account"] == "myorg-myaccount"
        assert "password" not in data
        assert data["has_password"] is True
```

- [ ] **Step 3: Run test**

```bash
pytest tests/test_connections.py::test_platform_info_endpoint -v
```

Expected: PASS (or skip if Snowflake connection is unavailable at test time — the endpoint itself reads from settings, not DB)

- [ ] **Step 4: Commit**

```bash
git add app/api/config.py tests/test_connections.py
git commit -m "feat: add GET /config/platform-info endpoint"
```

---

## Task 7: Update `execution_service.py` fallback chain

**Files:**
- Modify: `app/services/execution_service.py`

- [ ] **Step 1: Write failing test**

Append to `tests/test_connections.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.execution_service import _resolve_executor


@pytest.mark.asyncio
async def test_resolve_executor_uses_primary_target_as_fallback():
    """When asset has no connection and there are no named connections,
    _resolve_executor must use the primary target connection."""
    asset = MagicMock()
    asset.connection_id = None
    asset.sf_table_name = "test_table"

    primary_conn = MagicMock()
    primary_conn.connection_id = "primary-123"
    primary_conn.connection_name = "Primary Target"
    primary_conn.password = "enc_pass"

    db = AsyncMock()

    # First query (by connection_id): not called since asset.connection_id is None
    # Second query (active connections): returns empty list
    # Third query (primary target): returns primary_conn
    call_count = 0

    async def mock_execute(stmt):
        nonlocal call_count
        call_count += 1
        result = MagicMock()
        if call_count == 1:
            # active connections query
            result.scalars.return_value.all.return_value = []
        elif call_count == 2:
            # primary target query
            result.scalar_one_or_none.return_value = primary_conn
        return result

    db.execute = mock_execute

    executor = await _resolve_executor(asset, db)
    assert executor is not None


@pytest.mark.asyncio
async def test_resolve_executor_raises_when_no_target():
    """When no connections exist and no primary target, raise RuntimeError with helpful message."""
    asset = MagicMock()
    asset.connection_id = None
    asset.sf_table_name = "test_table"

    db = AsyncMock()
    call_count = 0

    async def mock_execute(stmt):
        nonlocal call_count
        call_count += 1
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        result.scalar_one_or_none.return_value = None
        return result

    db.execute = mock_execute

    with pytest.raises(RuntimeError, match="Settings.*Target Database"):
        await _resolve_executor(asset, db)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_connections.py::test_resolve_executor_uses_primary_target_as_fallback tests/test_connections.py::test_resolve_executor_raises_when_no_target -v
```

Expected: FAIL (old code uses `snowflake_client` fallback, not primary target query)

- [ ] **Step 3: Update `_resolve_executor()` in `app/services/execution_service.py`**

Replace lines 163–172 (the `if not conn_record:` final fallback block):

```python
    if not conn_record:
        # Fallback: look for the designated primary target connection
        primary_res = await db.execute(
            select(SnowflakeConnection).where(SnowflakeConnection.is_primary_target == True)
        )
        conn_record = primary_res.scalar_one_or_none()
        if conn_record:
            logger.debug(f"Using primary target connection '{conn_record.connection_name}'")

    if not conn_record:
        raise RuntimeError(
            "No Snowflake target connection configured. "
            "Go to Settings → Target Database and add a connection."
        )
```

Also remove these two lines from the old fallback (they are now deleted):

```python
        # DELETE: from app.core.config import settings as _settings
        # DELETE: if not _settings.snowflake_account: ...
        # DELETE: from app.db.snowflake_client import snowflake_client
        # DELETE: return snowflake_client
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_connections.py::test_resolve_executor_uses_primary_target_as_fallback tests/test_connections.py::test_resolve_executor_raises_when_no_target -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/execution_service.py tests/test_connections.py
git commit -m "feat: update execution_service fallback to use primary target connection"
```

---

## Task 8: Delete `snowflake_client.py`

**Files:**
- Delete: `app/db/snowflake_client.py`

- [ ] **Step 1: Confirm nothing else imports `snowflake_client`**

```bash
grep -rn "snowflake_client" /Users/laxmansrigiri/git_repo/data-quality-app/app/ --include="*.py"
```

Expected: No output (all imports removed in Task 7).

- [ ] **Step 2: Delete the file**

```bash
git rm app/db/snowflake_client.py
```

- [ ] **Step 3: Confirm tests still pass**

```bash
pytest tests/test_connections.py -v
```

Expected: All PASS (no import of deleted module).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: delete snowflake_client.py — replaced by primary target connection fallback"
```

---

## Task 9: Update `docker-compose.yml` and create `.env.example`

**Files:**
- Modify: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Update `docker-compose.yml`**

Replace the `environment` block in the `api` service (lines ~11–21):

```yaml
    environment:
      APP_ENV: local
      SF_PLATFORM_ACCOUNT: ${SF_PLATFORM_ACCOUNT:-}
      SF_PLATFORM_USER: ${SF_PLATFORM_USER:-}
      SF_PLATFORM_PASSWORD: ${SF_PLATFORM_PASSWORD:-}
      SF_PLATFORM_WAREHOUSE: ${SF_PLATFORM_WAREHOUSE:-DQ_EXECUTION_WH}
      SF_PLATFORM_ROLE: ${SF_PLATFORM_ROLE:-DQ_PLATFORM_ROLE}
      SNOWFLAKE_APP_DATABASE: ${SNOWFLAKE_APP_DATABASE:-DQ_PLATFORM_DB}
      SNOWFLAKE_APP_SCHEMA: ${SNOWFLAKE_APP_SCHEMA:-DQ_APP}
      LLM_PROVIDER: ${LLM_PROVIDER:-ollama}
      OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://host.docker.internal:11434}
      OLLAMA_MODEL: ${OLLAMA_MODEL:-qwen2.5:7b-instruct}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      GEMINI_API_KEY: ${GEMINI_API_KEY:-}
```

- [ ] **Step 2: Create `.env.example`**

```bash
cat > /Users/laxmansrigiri/git_repo/data-quality-app/.env.example << 'EOF'
# ── Platform Snowflake Connection ─────────────────────────────────────────────
# These credentials are used by the app to read/write its own tables.
# Set as OS/shell/Docker environment variables — NOT loaded from a .env file.
SF_PLATFORM_ACCOUNT=myorg-myaccount
SF_PLATFORM_USER=dq_platform_user
SF_PLATFORM_PASSWORD=your_password_here
SF_PLATFORM_WAREHOUSE=DQ_EXECUTION_WH
SF_PLATFORM_ROLE=DQ_PLATFORM_ROLE
SNOWFLAKE_APP_DATABASE=DQ_PLATFORM_DB
SNOWFLAKE_APP_SCHEMA=DQ_APP

# ── Target Database Connection ─────────────────────────────────────────────────
# Managed via Settings → Target Database in the UI.
# No env vars needed — stored encrypted in the platform DB.

# ── Application ────────────────────────────────────────────────────────────────
APP_ENV=local
SECRET_KEY=change-me-generate-with-openssl-rand-hex-32
ENCRYPTION_KEY=change-me-generate-with-fernet-generate-key
AUTH_REQUIRED=false

# ── LLM Provider ──────────────────────────────────────────────────────────────
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=AIza...
EOF
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: update docker-compose to SF_PLATFORM_* env vars and add .env.example"
```

---

## Task 10: Frontend — reorganize Settings tabs

**Files:**
- Modify: `frontend/src/app/settings/page.tsx`

- [ ] **Step 1: Add `connection_type` and `is_primary_target` to the `SFConnection` interface**

Find the `SFConnection` interface (~line 58) and add two fields:

```typescript
interface SFConnection {
  connection_id: string; connection_name: string; account: string
  sf_user: string; password: string | null; has_password: boolean
  warehouse: string; role: string | null; default_database: string | null
  default_schema: string | null; description: string | null
  is_active: boolean; connection_type: string; is_primary_target: boolean
  created_at: string; updated_at: string
}
```

- [ ] **Step 2: Update the `TABS` array**

Find the `TABS` constant (~line 68). Replace it:

```typescript
const TABS = [
  { id: 'general',            label: 'General',             icon: Settings },
  { id: 'platform_connection',label: 'Platform Connection', icon: Database },
  { id: 'target_database',    label: 'Target Database',     icon: Cloud },
  { id: 'llm',                label: 'LLM / AI',            icon: Bot },
  { id: 'notifications',      label: 'Notifications',       icon: Bell },
  { id: 'scheduler',          label: 'Scheduler',           icon: Clock },
  { id: 'sla',                label: 'SLA & Quality',       icon: Info },
  { id: 'security',           label: 'Security',            icon: Lock },
  { id: 'oauth',              label: 'OAuth & SSO',         icon: KeyRound },
  { id: 'performance',        label: 'Performance',         icon: Zap },
  { id: 'integrations',       label: 'Integrations',        icon: Plug },
  { id: 'governance_config',  label: 'Governance',          icon: ShieldCheck },
  { id: 'connections',        label: 'Named Connections',   icon: Globe },
]
```

- [ ] **Step 2: Add a `PlatformInfo` state type and fetch function**

Add near the top of the component (after existing state declarations):

```typescript
interface PlatformInfo {
  account: string
  user: string
  warehouse: string
  role: string
  app_database: string
  app_schema: string
  has_password: boolean
}

const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null)

// Fetch platform info on mount
useEffect(() => {
  configApi.get('platform-info').then(r => setPlatformInfo(r.data)).catch(() => {})
}, [])
```

Note: `configApi.get('platform-info')` calls `GET /config/platform-info` via the existing `configApi` in `apiClient.ts`.

- [ ] **Step 3: Add the Platform Connection tab panel**

Find where the tab panels are rendered (look for `activeTab === 'database'` or `activeTab === 'snowflake'`). Replace the old `database` and `snowflake` panels with a single `platform_connection` panel:

```typescript
{activeTab === 'platform_connection' && (
  <div className="space-y-6">
    <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mb-5">
      <Info size={14} className="mt-0.5 shrink-0" />
      <span>
        These credentials are sourced from environment variables (<code>SF_PLATFORM_*</code>) and
        cannot be edited here. Update them in your shell, <code>docker-compose.yml</code>, or secrets manager.
      </span>
    </div>
    {platformInfo ? (
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Account',      value: platformInfo.account },
          { label: 'User',         value: platformInfo.user },
          { label: 'Warehouse',    value: platformInfo.warehouse },
          { label: 'Role',         value: platformInfo.role },
          { label: 'App Database', value: platformInfo.app_database },
          { label: 'App Schema',   value: platformInfo.app_schema },
          { label: 'Password',     value: platformInfo.has_password ? '●●●●●●●●' : 'Not set' },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-700">
              {value}
            </p>
          </div>
        ))}
      </div>
    ) : (
      <div className="text-sm text-gray-400">Loading platform info…</div>
    )}
  </div>
)}
```

- [ ] **Step 4: Add Target Database tab panel with full CRUD**

Add a new state for the primary target connection:

```typescript
const [primaryTarget, setPrimaryTarget] = useState<SFConnection | null>(null)
const [loadingTarget, setLoadingTarget] = useState(false)
const [showTargetForm, setShowTargetForm] = useState(false)

const fetchPrimaryTarget = useCallback(async () => {
  setLoadingTarget(true)
  try {
    const res = await connectionsApi.getPrimaryTarget()
    setPrimaryTarget(res.data as SFConnection)
  } catch {
    // 404 = no primary target configured
    setPrimaryTarget(null)
  } finally {
    setLoadingTarget(false)
  }
}, [])

useEffect(() => { fetchPrimaryTarget() }, [fetchPrimaryTarget])
```

Add the tab panel:

```typescript
{activeTab === 'target_database' && (
  <div className="space-y-6">
    <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-5">
      <Info size={14} className="mt-0.5 shrink-0" />
      <span>
        This is the Snowflake connection used for DQ rule execution when no specific
        connection is assigned to a data asset.
      </span>
    </div>

    {loadingTarget && <div className="text-sm text-gray-400">Loading…</div>}

    {!loadingTarget && !primaryTarget && !showTargetForm && (
      <div className="text-center py-10 text-gray-400">
        <Cloud size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm mb-4">No primary target connection configured.</p>
        <button
          onClick={() => setShowTargetForm(true)}
          className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus size={14} /> Add Target Connection
        </button>
      </div>
    )}

    {!loadingTarget && !primaryTarget && showTargetForm && (
      <ConnectionForm
        onSave={async (form) => {
          const res = await connectionsApi.create({ ...form, connection_type: 'target', is_primary_target: false })
          await connectionsApi.setPrimaryTarget(res.data.connection_id)
          setShowTargetForm(false)
          await fetchPrimaryTarget()
        }}
        onCancel={() => setShowTargetForm(false)}
      />
    )}

    {!loadingTarget && primaryTarget && (
      <ConnectionCard
        conn={primaryTarget}
        onUpdated={async () => { await fetchPrimaryTarget() }}
        onDeleted={async () => { setPrimaryTarget(null) }}
      />
    )}
  </div>
)}
```

- [ ] **Step 5: Add `getPrimaryTarget` and `setPrimaryTarget` to `connectionsApi` in `apiClient.ts`**

Find `connectionsApi` in `frontend/src/services/apiClient.ts`. Add:

```typescript
getPrimaryTarget: () => api.get(`/connections/primary-target`),
setPrimaryTarget: (id: string) => api.put(`/connections/${id}/set-primary-target`),
```

- [ ] **Step 6: Verify the frontend builds with no type errors**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app/frontend
npm run type-check
```

Expected: No errors

- [ ] **Step 7: Commit**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
git add frontend/src/app/settings/page.tsx frontend/src/services/apiClient.ts
git commit -m "feat: reorganize Settings tabs — Platform Connection (read-only), Target Database (CRUD), Named Connections"
```

---

## Task 11: Run all tests and verify

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
pytest tests/ -v --tb=short
```

Expected: All tests pass. The new `tests/test_connections.py` tests should all be green.

- [ ] **Step 2: Verify no remaining references to deleted settings or files**

```bash
grep -rn "snowflake_client\|from app.db.snowflake_client" app/ --include="*.py"
grep -rn "snowflake_account\|snowflake_user\|snowflake_password\|snowflake_warehouse\|snowflake_role\b" app/core/ app/db/database.py app/services/execution_service.py --include="*.py"
```

Expected: No output from either command.

- [ ] **Step 3: Verify docker-compose no longer references old env var names**

```bash
grep "SNOWFLAKE_ACCOUNT\|SNOWFLAKE_USER\|SNOWFLAKE_PASSWORD\|SNOWFLAKE_DATABASE\|SNOWFLAKE_SCHEMA\b" docker-compose.yml
```

Expected: No output.

- [ ] **Step 4: Final commit if any stragglers**

```bash
git status
# If any files modified, add and commit with:
# git commit -m "chore: cleanup remaining old snowflake setting references"
```
