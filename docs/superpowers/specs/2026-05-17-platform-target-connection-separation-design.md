# Design: Platform vs Target Snowflake Connection Separation

**Date:** 2026-05-17  
**Branch:** feature/lineage  
**Status:** Approved

---

## Problem

The app conflates three distinct Snowflake connection concerns:

1. **Platform connection** — credentials used by the app to read/write its own tables (`DQ_PLATFORM_DB.DQ_APP`)
2. **Target connection** — the Snowflake database(s) being monitored for data quality
3. **Named connections** — per-asset connections assigned to specific data assets for rule execution

Currently all three share the same env-var namespace (`SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, etc.), a `.env` file is used to supply them in development, and `snowflake_client.py` provides an env-var-based global fallback for rule execution that blurs platform and target concerns.

---

## Goals

- Remove `.env` file dependency — credentials come from real OS/shell/Docker environment variables only
- Make the platform connection (for app tables) explicit and separate from the target DB connection
- Add a dedicated **Target Database** tab in Settings UI with full CRUD for a primary target connection
- Keep the existing **Named Connections** tab for per-asset connections

---

## Architecture

### Connection Types

| Type | Purpose | Managed via |
|---|---|---|
| Platform | App's own tables (`DQ_PLATFORM_DB.DQ_APP`) | Env vars (read-only in UI) |
| Primary Target | Default Snowflake DB for DQ rule execution | Settings → Target Database (CRUD) |
| Named | Per-asset connections | Settings → Named Connections (CRUD) |

### Execution Fallback Chain (updated)

1. Asset has `connection_id` → use that `SnowflakeConnection`
2. Only one active named connection → use it
3. **New:** Primary target connection (`is_primary_target=True`) → use it
4. Error: "No Snowflake connection configured. Go to Settings → Target Database."

Steps 1–2 are unchanged. Step 3 replaces the removed `snowflake_client` env-var fallback.

---

## Section 1 — Configuration & `.env` Removal

### `app/core/config.py`

- Remove `env_file = ".env"` from `Settings.Config` — pydantic-settings reads from OS env vars only
- Rename platform credential settings for clarity:
  - `snowflake_account` → `sf_platform_account`
  - `snowflake_user` → `sf_platform_user`
  - `snowflake_password` → `sf_platform_password`
  - `snowflake_warehouse` → `sf_platform_warehouse`
  - `snowflake_role` → `sf_platform_role`
- Keep `snowflake_app_database` and `snowflake_app_schema` unchanged
- Remove `snowflake_database` and `snowflake_schema` (were only used by the deleted `snowflake_client` fallback)

### `.env.example` (new file, committed to repo)

Documents all required environment variables for local dev and deployment. Not loaded by the app.

### `frontend/.env.local`

Unchanged — `NEXT_PUBLIC_API_URL` is a Next.js build-time convention, not a runtime secret.

---

## Section 2 — Database Model

### `SnowflakeConnection` — two new columns

```
connection_type:    VARCHAR  DEFAULT 'named'   -- 'named' | 'target'
is_primary_target:  BOOLEAN  DEFAULT FALSE
```

- All existing rows default to `connection_type='named'`, `is_primary_target=FALSE`
- Only one row may have `is_primary_target=TRUE` at a time (enforced at API level, not DB constraint)
- Schema change added to `create_tables()` via idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (project convention — no Alembic for column additions)

---

## Section 3 — Backend API Changes

### `app/api/connections.py`

- Add `connection_type: str = "named"` and `is_primary_target: bool = False` to `ConnectionCreate` and `ConnectionUpdate` schemas
- New endpoint: `PUT /connections/{connection_id}/set-primary-target`
  - Sets `is_primary_target=True` on this connection, `connection_type="target"`
  - Clears `is_primary_target` on all other connections
  - Returns the updated connection
- New endpoint: `GET /connections/primary-target`
  - Returns the primary target connection or `404` if none set

### `app/services/execution_service.py`

- Update `resolve_executor()`:
  - Replace step 4 (env-var `snowflake_client` fallback) with: query for `SnowflakeConnection` where `is_primary_target=TRUE`
  - If found, use it; if not, raise `HTTPException(400, "No target connection configured. Go to Settings → Target Database.")`
- Remove import of `snowflake_client`

### `app/db/snowflake_client.py`

- Delete — no longer used once the primary target connection is the fallback

### `app/db/database.py`

- Update `_build_snowflake_url()` to use renamed settings: `sf_platform_account`, `sf_platform_user`, `sf_platform_password`, `sf_platform_warehouse`, `sf_platform_role`

### `app/services/config_service.py`

- Remove `snowflake_database` and `snowflake_schema` from `CONFIG_DEFAULTS`
- Remove `snowflake_account`, `snowflake_user`, `snowflake_password`, `snowflake_warehouse`, `snowflake_role` from `CONFIG_DEFAULTS` — these are now managed as a `SnowflakeConnection` record, not AppConfig
- The `snowflake` category in AppConfig becomes empty and can be removed from the seed

---

## Section 4 — Frontend Settings UI

### `frontend/src/app/settings/page.tsx`

**Tab changes:**

| Old Tab | New Tab | Change |
|---|---|---|
| `database` (Database) | removed | Content merged into Platform Connection |
| `snowflake` (Snowflake) | `platform_connection` (Platform Connection) | Read-only display of env vars |
| *(new)* | `target_database` (Target Database) | Full CRUD for primary target connection |
| `connections` (Connections) | `connections` (Named Connections) | Label update only |

**Platform Connection tab** — read-only:
- Shows: account, user, warehouse, role, app database, app schema
- Reads from a new `GET /config/platform-info` endpoint (returns non-sensitive env var values only — no password)
- Banner: *"These credentials are set via environment variables and cannot be edited here."*

**Target Database tab** — full CRUD:
- Empty state: form with account, user, password, warehouse, role, default database, default schema, description + "Save as Primary Target" button
- Populated state: displays saved connection with Edit / Delete / Test Connection buttons
- "Test Connection" reuses existing `POST /connections/{id}/test`
- On save: calls `POST /connections` then `PUT /connections/{id}/set-primary-target`
- On delete: calls `DELETE /connections/{id}` — clears primary target

**Named Connections tab:**
- Label updated to "Named Connections"
- Tooltip added: *"Named connections are assigned to specific data assets for rule execution."*

---

## Files Changed

### Backend
- `app/core/config.py` — remove `env_file`, rename platform settings
- `app/db/database.py` — use renamed platform settings + idempotent `ALTER TABLE` for new columns
- `app/db/models.py` — add `connection_type` and `is_primary_target` columns to `SnowflakeConnection`
- `app/api/connections.py` — new schema fields, two new endpoints, update `_mask()`
- `app/api/config.py` — add `GET /config/platform-info` endpoint (returns non-sensitive platform env var values)
- `app/services/execution_service.py` — update fallback chain, remove `snowflake_client` import
- `app/services/config_service.py` — remove snowflake AppConfig entries from `CONFIG_DEFAULTS`
- `app/db/snowflake_client.py` — **delete**
- `docker-compose.yml` — rename env var keys to match new `SF_PLATFORM_*` names
- `.env.example` — **new file**

### Frontend
- `frontend/src/app/settings/page.tsx` — tab reorganization, new Target Database tab, read-only Platform Connection tab

---

## Out of Scope

- Multi-tenant target connections (each user has their own target) — handled by Named Connections
- Vault / AWS Secrets Manager integration — already implemented separately in `secrets_loader.py`
- OAuth / SSO changes
