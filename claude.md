# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

Enterprise Snowflake Data Quality & Governance platform. Backend: FastAPI + SQLAlchemy (async, PostgreSQL). Frontend: Next.js 15 + TypeScript + Tailwind. Full spec lives in `claude.md`.

---

## Development Commands

### Full Stack (Docker)

```bash
# Start postgres + api + frontend
docker compose up

# Include local Ollama (LLM)
docker compose --profile ollama up

# Rebuild after dependency changes
docker compose up --build
```

### Backend (local)

```bash
# Install dependencies
pip install -r requirements.txt

# Start API (requires postgres running)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Run all tests
pytest

# Run a single test file
pytest tests/test_sql_generator.py -v

# Run a single test
pytest tests/test_rule_engine.py::test_freshness_check_generates_valid_sql -v

# Run with coverage
pytest --cov=app tests/
```

### Frontend (local)

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run type-check # tsc --noEmit (no transpile)
npm run lint
```

### Database

```bash
# Apply migrations
alembic upgrade head

# Create a new migration
alembic revision --autogenerate -m "description"
```

### Key environment variables (`.env`)

```
DATABASE_URL=postgresql+asyncpg://dquser:dqpass@localhost:5432/dqplatform
SYNC_DATABASE_URL=postgresql://dquser:dqpass@localhost:5432/dqplatform
AUTH_REQUIRED=false         # disable auth for local dev
LLM_PROVIDER=openai         # ollama | openai | claude | gemini_flash
OPENAI_API_KEY=...
SECRET_KEY=<openssl rand -hex 32>
```

---

## Architecture

### Request Flow

```
Browser → Next.js page → services/apiClient.ts (axios) → FastAPI router
         → service layer → SQLAlchemy (PostgreSQL) or SnowflakePool
```

`apiClient.ts` attaches JWT from `localStorage`, retries on 401 with refresh token.

### Backend Layer Responsibilities

| Layer | Path | Role |
|---|---|---|
| Routers | `app/api/*.py` | HTTP handlers, auth enforcement, request/response shaping |
| Services | `app/services/*.py` | Business logic, orchestration |
| Models | `app/db/models.py` | SQLAlchemy ORM (all 50+ tables) |
| Config | `app/core/config.py` | Pydantic `Settings`, reads `.env` |
| Security | `app/core/security.py` | JWT, RBAC helpers, API key auth |

**Database init** — `app/db/database.py:create_tables()` calls `Base.metadata.create_all()` then runs idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migrations inline (no Alembic needed for column additions). Run Alembic only for new tables.

**Scheduler** — APScheduler starts in `lifespan()`. Nightly jobs: `evaluate_policies()` at 00:15, `catalog_search_index` refresh. Schedule inheritance: rule > table > subdomain > domain > global.

**SQL generation** — `app/services/sql_generator.py:SQLGenerator.generate()` dispatches by `rule_type`. Identifiers validated with `_IDENT_RE`; conditions checked against `_CONDITION_BLOCKLIST_RE` (SQL injection guard). Generates Snowflake SQL for all 12 rule types.

**LLM abstraction** — `app/services/llm_providers.py`. Active provider set via `LLM_PROVIDER` env var. All AI routes in `app/api/ai.py` call `ai_service.py` which calls the provider. Gemini uses `asyncio.to_thread()` because its SDK is sync.

**Auth** — JWT Bearer tokens + service account `X-API-Key` header (format: `sa_<8-char-prefix>_<32-char-secret>`). `AUTH_REQUIRED=false` disables all auth checks (local dev only). RBAC enforced at router level via `get_current_user` + role checks. Domain isolation for `domain_owner` via `check_domain_access()` / `apply_domain_filter()` helpers in `core/security.py`.

**Snowflake execution** — `app/db/snowflake_pool.py` pools connections per credential set. `asyncio.to_thread()` prevents event-loop blocking. `execution_service.py` runs rules concurrently with `asyncio.gather()` bounded by a semaphore.

### Frontend Patterns

All API calls go through `frontend/src/services/apiClient.ts` (axios instance). Pages live in `frontend/src/app/<route>/page.tsx` (Next.js App Router). Shared UI in `frontend/src/components/common/`. Charts use Recharts. Lineage graph uses `@xyflow/react`.

The floating AI Copilot widget (`components/ai/AIChatBot.tsx`) is separate from the full-page `/ai-assistant` route.

### Key Conventions

- All new backend routes: add router in `app/api/`, register in `app/main.py`.
- New tables: add to `create_tables()` migrations list in `app/db/database.py`; also add SQLAlchemy model in `app/db/models.py`.
- Rule types must be handled in `sql_generator.py` and the sample-SQL generator (`generate_sample()`).
- AI-generated rules always start as `pending_review` — never auto-activate.
- Audit every write action via `app/api/audit.py` helpers.
