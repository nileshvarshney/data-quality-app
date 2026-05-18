# CLAUDE.md

Enterprise Snowflake Data Quality & Governance platform. Backend: FastAPI + SQLAlchemy (snowflake-sqlalchemy). Frontend: Next.js 15 + TypeScript + Tailwind.

## Development Commands

### Full Stack (Docker)
```bash
docker compose up                         # api + frontend (Snowflake as backend DB)
docker compose --profile ollama up        # include local Ollama
docker compose up --build                 # rebuild after dep changes
```

### Backend
```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pytest                                    # all tests
pytest tests/test_sql_generator.py -v    # single file
pytest tests/test_rule_engine.py::test_freshness_check_generates_valid_sql -v
pytest --cov=app tests/
```

### Frontend
```bash
cd frontend && npm install
npm run dev        # http://localhost:3000
npm run build
npm run type-check # tsc --noEmit
npm run lint
```

### Key `.env` Variables
See `.env.example` for the full list. Minimum to run locally:
```
SF_PLATFORM_ACCOUNT=myorg-myaccount
SF_PLATFORM_USER=dq_platform_user
SF_PLATFORM_PASSWORD=your_password
SNOWFLAKE_APP_DATABASE=DQ_PLATFORM_DB
SNOWFLAKE_APP_SCHEMA=DQ_APP
AUTH_REQUIRED=false    # disable auth for local dev
LLM_PROVIDER=ollama    # ollama | openai | claude | gemini_flash
SECRET_KEY=<openssl rand -hex 32>
```

## Architecture

**Request flow:** `Browser → Next.js page → services/apiClient.ts → FastAPI router → service layer → Snowflake (via SQLAlchemy + snowflake-sqlalchemy)`

`apiClient.ts` attaches JWT from `localStorage`, retries on 401 with refresh token.

### Backend Layers

| Layer | Path | Role |
|---|---|---|
| Routers | `app/api/*.py` | HTTP handlers, auth, request/response shaping |
| Services | `app/services/*.py` | Business logic, orchestration |
| Models | `app/db/models.py` | SQLAlchemy ORM (50+ tables) |
| Config | `app/core/config.py` | Pydantic `Settings`, reads `.env` |
| Security | `app/core/security.py` | JWT, RBAC helpers, API key auth |

**DB init** — `app/db/database.py:create_tables()` runs at startup via `asyncio.to_thread`. Creates the Snowflake database/schema if missing, then creates each table individually (sorted by FK order), catching "already exists" errors. Column additions use `ALTER TABLE … ADD COLUMN` statements wrapped in try/except. No Alembic — schema changes go directly into `create_tables()`.

**Scheduler** — APScheduler in `lifespan()`. Nightly: `evaluate_policies()` at 00:15, catalog index refresh. Schedule inheritance: rule > table > subdomain > domain > global.

**SQL gen** — `app/services/sql_generator.py:SQLGenerator.generate()` dispatches by `rule_type`. Identifiers validated with `_IDENT_RE`; conditions checked against `_CONDITION_BLOCKLIST_RE`. Supports all 12 rule types.

**LLM** — `app/services/llm_providers.py`; active provider via `LLM_PROVIDER`. All AI routes in `app/api/ai.py` → `ai_service.py` → provider. Gemini uses `asyncio.to_thread()` (sync SDK).

**Auth** — JWT Bearer + service account `X-API-Key` (`sa_<8-char>_<32-char>`). `AUTH_REQUIRED=false` disables all checks locally. RBAC at router via `get_current_user`; domain isolation via `check_domain_access()` / `apply_domain_filter()` in `core/security.py`.

**Snowflake** — `app/db/snowflake_pool.py` pools per-credential. `asyncio.to_thread()` prevents event-loop blocking. Concurrent rule execution via `asyncio.gather()` with semaphore in `execution_service.py`.

### Frontend

All calls via `frontend/src/services/apiClient.ts`. Pages in `frontend/src/app/<route>/page.tsx` (Next.js App Router). Shared UI in `frontend/src/components/common/`. Charts: Recharts. Lineage graph: `@xyflow/react`. AI Copilot widget: `components/ai/AIChatBot.tsx` (separate from `/ai-assistant` route).

## Key Conventions

- New backend routes: add in `app/api/`, register in `app/main.py`
- New tables: add to `create_tables()` in `app/db/database.py` + model in `app/db/models.py`
- Rule types: handle in `sql_generator.py` + `generate_sample()`
- AI-generated rules always start as `pending_review` — never auto-activate
- Audit all writes via `app/api/audit.py` helpers
