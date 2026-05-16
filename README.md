# Data Quality Platform

Enterprise-grade Snowflake Data Quality Platform — monitor, score, alert on, and govern data quality across every domain in your organization.

---

## Table of Contents

1. [What's Inside](#whats-inside)
2. [Quick Start](#quick-start)
3. [Docker Compose](#docker-compose)
4. [Database Setup](#database-setup)
5. [Snowflake Integration](#snowflake-integration)
6. [LLM / AI Configuration](#llm--ai-configuration)
7. [Authentication](#authentication)
8. [Service Accounts / API Key Auth](#service-accounts--api-key-auth)
9. [Alert Notifications](#alert-notifications)
10. [Vault / AWS Secrets Manager](#vault--aws-secrets-manager)
11. [Architecture Overview](#architecture-overview)
12. [Supported Rule Types](#supported-rule-types)
13. [API Reference](#api-reference)
14. [Importing Rules via YAML](#importing-rules-via-yaml)
15. [Running Tests](#running-tests)
16. [Environment Variable Reference](#environment-variable-reference)

---

## What's Inside

| Layer | Technology |
|---|---|
| Backend API | Python 3.12+, FastAPI, SQLAlchemy (async), Alembic |
| Frontend | Next.js 15, React, TypeScript, Tailwind CSS |
| Metadata store | PostgreSQL 16 |
| Rule execution | Snowflake Python Connector, connection pool |
| Scheduler | APScheduler |
| AI / LLM | Ollama, OpenAI, Anthropic Claude, Google Gemini Flash |
| Auth | JWT 30min access / 7d refresh, bcrypt, OAuth2 SSO, API keys |
| Notifications | SMTP email + Slack incoming webhook |

### Feature highlights

- **12 built-in rule types** — null, uniqueness, range, freshness, referential integrity, regex, custom SQL, and more
- **Rule approval workflow** — draft → pending review → active; approve or reject with a reason
- **Rule version history + rollback** — every change is snapshotted; restore any prior version in one click
- **Dataset certification** — mark tables as certified / warning / failed / uncertified
- **Click-through drill-down** — Global → Domain → Subdomain → Table → Rule → Run history
- **Admin domain management** — create/edit/delete domains and subdomains from the UI
- **Concurrent rule execution** — all rules for a table run in parallel via `asyncio.gather()` bounded by the connection pool size
- **Background job tracking** — bulk executions return a `job_id` immediately; poll `GET /rules/bulk/jobs/{job_id}` for status
- **Snowflake connection pooling** — one pool per unique credential set; configurable min/max size with health-check-on-acquire
- **OAuth2 / Google SSO** — sign in with Google; callback page stores tokens automatically
- **Service accounts** — machine-to-machine API key auth via `X-API-Key` header; keys rotatable at any time
- **Row-level domain isolation** — `domain_owner` users only see their own domain's rules and assets
- **Vault / AWS Secrets Manager** — secrets loaded from HashiCorp Vault or AWS Secrets Manager at startup
- **AI rule generation** — LLM suggests rules based on table schema
- **AI failure explanation** — plain-English root cause for every failed rule
- **AI chatbot** — ask questions about platform health and data quality
- **Alerts** — automatic Slack/email on critical failures with acknowledge/resolve/ignore workflow
- **Audit CSV export** — download filtered audit logs as a CSV file
- **RBAC** — five roles (admin, domain_owner, data_owner, viewer, auditor)
- **Full audit trail** — every create, update, approve, reject, and rollback is logged immutably
- **Command palette** — press `⌘K` / `Ctrl+K` anywhere to search and jump to any page
- **Toast notifications** — success/error toasts via Sonner throughout the UI
- **Skeleton loading states** — animated placeholder rows on Rules and Alerts pages
- **Illustrated empty states** — contextual icons and CTA buttons when lists are empty

---

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 22+
- Docker (for PostgreSQL)

### 1. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 2. Backend setup

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # edit .env — at minimum set LLM_PROVIDER
```

Run migrations and seed initial data (7 domains, 32 subdomains, sample rules, default admin user):

```bash
PYTHONPATH=. alembic upgrade head
PYTHONPATH=. python app/db/seed.py
```

Start the API:

```bash
PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:3000

Default login: **admin@example.com** / **admin123**
(Change this password immediately in production.)

### 4. Run tests

```bash
source .venv/bin/activate
PYTHONPATH=. python -m pytest tests/ -v
```

---

## Docker Compose

Run all services together:

```bash
# API + PostgreSQL + Frontend
docker compose up -d

# Include Ollama for local AI (downloads ~4 GB model on first run)
docker compose --profile ollama up -d

# Pull the default model after Ollama starts
docker exec -it dq_ollama ollama pull qwen2.5:7b-instruct
```

Services and ports:

| Service | Port | Container name |
|---|---|---|
| PostgreSQL | 5432 | `dq_postgres` |
| FastAPI | 8000 | `dq_api` |
| Next.js | 3000 | `dq_frontend` |
| Ollama | 11434 | `dq_ollama` (profile: `ollama`) |

---

## Database Setup

The platform uses **two databases** for different purposes:

| Database | Purpose |
|---|---|
| PostgreSQL | Metadata — rules, runs, alerts, scores, audit logs |
| Snowflake | Source data tables — SQL executes here during rule runs |

### PostgreSQL

Docker defaults (matches `.env.example`):

```
Host: localhost  Port: 5432
Database: dqplatform  User: dquser  Password: dqpass
```

Override in `.env`:

```env
DATABASE_URL=postgresql+asyncpg://dquser:dqpass@localhost:5432/dqplatform
SYNC_DATABASE_URL=postgresql://dquser:dqpass@localhost:5432/dqplatform
```

**Managed cloud databases** work the same way — just replace the host and credentials. Tested with AWS RDS, Google Cloud SQL, and Azure Database for PostgreSQL.

### Migrations

```bash
# Apply all migrations (run after every `git pull`)
PYTHONPATH=. alembic upgrade head

# Current migrations:
# 0001 — initial schema (all core tables)
# 0002 — enterprise upgrades (rule_versions, certification, ownership fields)
# 0003 — OAuth and service accounts (users.oauth_provider, users.oauth_id, service_accounts table)
```

### Seed data

```bash
PYTHONPATH=. python app/db/seed.py
```

The seed is idempotent. It creates:
- 7 domains: Revenue, Finance, Operations, Planning, GTM, HR, Others
- 32 subdomains
- 1 sample asset: `revenue_dw.invoices` (Revenue › Billing)
- 5 sample rules on that asset
- Default admin user: `admin@example.com` / `admin123`

### Schema overview

```
users                — Accounts and RBAC roles (+ oauth_provider, oauth_id)
domains              — Business domains
subdomains           — Subdomains per domain
data_assets          — Registered Snowflake tables (with certification_status)
dq_rules             — Rule definitions (with version, approval, rejection fields)
rule_versions        — Immutable snapshots before each rule update
rule_tags            — Tags on rules
dq_schedules         — Schedule configs (rule / table / subdomain / domain / global)
dq_rule_runs         — One row per rule execution
dq_rule_run_samples  — Sample failed records from each run
dq_quality_scores    — Daily aggregated quality scores by level
dq_alerts            — Alerts generated from failed rules
sla_configs          — SLA thresholds per entity
audit_logs           — Immutable action history
snowflake_connections — Stored Snowflake connection configs
service_accounts     — Machine-to-machine API key credentials
app_config           — Runtime key-value config (LLM, SMTP, etc.)
```

---

## Snowflake Integration

Snowflake is used **only for executing rule SQL against source data tables**. All metadata stays in PostgreSQL.

### Snowflake setup (one time)

```sql
CREATE ROLE IF NOT EXISTS DQ_PLATFORM_ROLE;

CREATE WAREHOUSE IF NOT EXISTS DQ_EXECUTION_WH
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE;

GRANT USAGE ON WAREHOUSE DQ_EXECUTION_WH TO ROLE DQ_PLATFORM_ROLE;

-- Grant read access to monitored databases
GRANT USAGE ON DATABASE YOUR_SOURCE_DB TO ROLE DQ_PLATFORM_ROLE;
GRANT USAGE ON ALL SCHEMAS IN DATABASE YOUR_SOURCE_DB TO ROLE DQ_PLATFORM_ROLE;
GRANT SELECT ON ALL TABLES IN DATABASE YOUR_SOURCE_DB TO ROLE DQ_PLATFORM_ROLE;
GRANT SELECT ON FUTURE TABLES IN DATABASE YOUR_SOURCE_DB TO ROLE DQ_PLATFORM_ROLE;

CREATE USER IF NOT EXISTS dq_platform_user
  PASSWORD = 'strong-password-here'
  DEFAULT_ROLE = DQ_PLATFORM_ROLE
  DEFAULT_WAREHOUSE = DQ_EXECUTION_WH;

GRANT ROLE DQ_PLATFORM_ROLE TO USER dq_platform_user;
```

### Environment variables

```env
SNOWFLAKE_ACCOUNT=myorg-myaccount      # Admin > Accounts in Snowsight
SNOWFLAKE_USER=dq_platform_user
SNOWFLAKE_PASSWORD=strong-password-here
SNOWFLAKE_WAREHOUSE=DQ_EXECUTION_WH
SNOWFLAKE_DATABASE=YOUR_SOURCE_DB
SNOWFLAKE_SCHEMA=PUBLIC
SNOWFLAKE_ROLE=DQ_PLATFORM_ROLE
```

The platform also supports **per-connection config** stored in the database (Settings → Snowflake in the UI). Per-connection settings override the environment variables for browsing and table registration.

### Connection Pooling

The platform maintains a connection pool per unique Snowflake credential set (`app/db/snowflake_pool.py`). Connections are health-checked before being handed to the caller. Pool settings:

| Variable | Default | Description |
|---|---|---|
| `SNOWFLAKE_POOL_MIN_SIZE` | `1` | Minimum idle connections in the pool |
| `SNOWFLAKE_POOL_MAX_SIZE` | `5` | Maximum open connections per credential set |
| `SNOWFLAKE_POOL_ACQUIRE_TIMEOUT` | `30.0` | Seconds to wait for an available connection |

Concurrent rule execution (`execute_asset_rules`) runs all rules for a table simultaneously using `asyncio.gather()`, with a semaphore sized to `SNOWFLAKE_POOL_MAX_SIZE` to prevent pool exhaustion.

### Running without Snowflake

If `SNOWFLAKE_ACCOUNT` is not set, all features work except rule execution — which returns an error stored in the run record. Useful for exploring the UI before connecting Snowflake.

---

## LLM / AI Configuration

The platform has a provider abstraction layer. Switch between providers using a single environment variable.

### Provider selection order

1. `provider` field in the API request body (per-request override)
2. `LLM_PROVIDER` environment variable
3. Default: `ollama`

### Supported providers

| Provider | Env value | Notes |
|---|---|---|
| Ollama (local) | `ollama` | No API key; private; runs on your machine |
| OpenAI | `openai` | Best quality overall; `gpt-4o-mini` recommended |
| Anthropic Claude | `claude` | Strong reasoning; `claude-3-5-sonnet-latest` recommended |
| Google Gemini Flash | `gemini_flash` | Fast and cost-effective; `gemini-1.5-flash` recommended; runs async via `asyncio.to_thread()` |

### Option 1: Ollama (default, local)

```bash
# Install
brew install ollama          # macOS
curl -fsSL https://ollama.com/install.sh | sh   # Linux

# Pull a model
ollama pull qwen2.5:7b-instruct   # recommended
ollama pull llama3.2:3b           # smaller/faster
ollama pull codellama:7b          # better SQL generation
```

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
```

RAM requirements: `3b` → 4 GB, `7b` → 8 GB, `8b` → 10 GB.

### Option 2: OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
```

### Option 3: Anthropic Claude

```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-3-5-sonnet-latest
```

### Option 4: Google Gemini Flash

```env
LLM_PROVIDER=gemini_flash
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-1.5-flash
```

### AI features

| Feature | Endpoint | Description |
|---|---|---|
| Rule generation | `POST /ai/generate-rules` | Suggests 5–8 rules for a given table schema |
| Failure explanation | `POST /ai/explain-failure` | Plain-English root cause + remediation for a failed run |
| SQL generation | `POST /ai/generate-sql` | Converts natural language to Snowflake SQL |
| Table classification | `POST /ai/classify-table` | Suggests domain, subdomain, and owner |
| AI chatbot | `POST /ai/chat` | Free-form questions about platform health |
| AI chatbot (streaming) | `POST /ai/chat/stream` | SSE streaming response |

---

## Authentication

### Development (default)

Authentication is **on by default** (`AUTH_REQUIRED=true`). Users must log in to access API endpoints. To disable authentication during local development, set `AUTH_REQUIRED=false`.

### Production

Ensure the following are set in `.env`:

```env
AUTH_REQUIRED=true
SECRET_KEY=generate-with-openssl-rand-hex-32
ACCESS_TOKEN_EXPIRE_MINUTES=30     # 30-minute access token
```

```env
# frontend/.env.local
NEXT_PUBLIC_AUTH_REQUIRED=true
```

Restart both services. Users are redirected to `/login`.

Token lifetime:
- **Access token** — 30 minutes (short-lived; refresh automatically)
- **Refresh token** — 7 days

`get_current_user` checks the `X-API-Key` header before falling back to the `Authorization: Bearer` JWT, so service accounts and regular users share the same auth middleware.

### Default admin account

Created by `seed.py`:
- Email: `admin@example.com`
- Password: `admin123`

Change immediately in production:

```bash
curl -X POST http://localhost:8000/auth/login \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  -H "Content-Type: application/json"

# Use the returned token to change password:
curl -X POST http://localhost:8000/users/{user_id}/change-password \
  -H "Authorization: Bearer <token>" \
  -d '{"current_password":"admin123","new_password":"your-strong-password"}' \
  -H "Content-Type: application/json"
```

### SSO / OAuth2 (Google)

Google SSO is available out of the box. The frontend login page shows a "Sign in with Google" button if the backend reports the provider as available.

**Backend setup:**

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
OAUTH_REDIRECT_URI=http://localhost:8000/auth/oauth/google/callback
FRONTEND_URL=http://localhost:3000
```

**OAuth2 endpoints (`app/api/oauth.py`):**

| Endpoint | Description |
|---|---|
| `GET /auth/oauth/providers` | Returns list of configured SSO providers |
| `GET /auth/oauth/google` | Redirects the browser to Google's consent screen |
| `GET /auth/oauth/google/callback` | Exchanges the code, creates/updates the user, redirects to `FRONTEND_URL/auth/callback?token=&refresh=` |

The frontend `/auth/callback` page reads the `token` and `refresh` query parameters and stores them in localStorage, then redirects to the dashboard.

New columns on the `users` table support SSO:
- `oauth_provider VARCHAR(50)` — SSO provider name (e.g., `google`)
- `oauth_id VARCHAR(200)` — Provider's unique user ID

### RBAC roles

| Role | Access |
|---|---|
| `admin` | Full — users, domains, rules, schedules, config, approve/reject |
| `domain_owner` | Own domain — manage rules, schedules; approve/reject rules; row-level isolation enforced |
| `data_owner` | Assigned tables — manage rules |
| `viewer` | Read-only — dashboards, alerts, run history |
| `auditor` | Read-only — includes audit logs |

Admin section in the sidebar is only visible to `admin` users. Approval buttons on the Rules page are only active for `admin` and `domain_owner`. `domain_owner` users can only query their own domain's data on `/rules/enriched` and `/assets/enriched` (enforced by `get_domain_filter()` in `security.py`).

---

## Service Accounts / API Key Auth

Service accounts enable machine-to-machine access (CI pipelines, data pipelines, monitoring agents) without a username/password login.

### How it works

1. An admin creates a service account. The API returns a single-use key in the format `sa_<prefix>_<secret>`.
2. The key hash is stored in the `service_accounts` table; the plaintext is never stored again.
3. Callers pass the key in the `X-API-Key` HTTP header on every request.
4. If the key is valid and the account is active, the request proceeds with the service account's assigned role.

### Endpoints (`app/api/service_accounts.py`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/service-accounts` | List all service accounts (admin only) |
| `POST` | `/service-accounts` | Create a new service account — **key returned once** |
| `PATCH` | `/service-accounts/{id}/rotate` | Rotate the API key — old key is immediately invalidated |
| `PATCH` | `/service-accounts/{id}` | Update name, role, or active status |
| `DELETE` | `/service-accounts/{id}` | Delete a service account |

### Example

```bash
# Create a service account
curl -X POST http://localhost:8000/service-accounts \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "airflow-pipeline", "role": "data_owner", "domain_id": "<domain_id>"}'

# Response includes the key — save it now, it is not shown again:
# { "sa_id": "...", "key": "sa_abc123_<secret>", ... }

# Use the key in subsequent requests
curl http://localhost:8000/rules \
  -H "X-API-Key: sa_abc123_<secret>"

# Rotate the key
curl -X PATCH http://localhost:8000/service-accounts/<sa_id>/rotate \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### `service_accounts` table

| Column | Type | Description |
|---|---|---|
| `sa_id` | VARCHAR | Primary key |
| `name` | VARCHAR | Human-readable label |
| `key_prefix` | VARCHAR | First segment of the key (`sa_<prefix>`) |
| `key_hash` | VARCHAR | bcrypt hash of the full key |
| `role` | VARCHAR | Effective RBAC role |
| `domain_id` | VARCHAR | Optional domain scope |
| `is_active` | BOOLEAN | Soft-disable without deleting |
| `created_by` | VARCHAR | User who created it |
| `last_used_at` | TIMESTAMP_NTZ | Updated on each successful auth |

---

## Alert Notifications

Alerts fire automatically when critical/high/medium severity rules fail. Two channels are supported.

### Slack

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000/B00000/XXXXXXXXXX
```

Create a webhook at https://api.slack.com/apps → Incoming Webhooks.

### Email (SMTP)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=dq-platform@yourcompany.com
SMTP_USE_TLS=true
ALERT_EMAIL_RECIPIENTS=data-team@yourcompany.com,oncall@yourcompany.com
```

### Per-table routing

Use `POST /sla-configs` to route alerts for a specific table to a custom email list or Slack channel:

```bash
curl -X POST http://localhost:8000/sla-configs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "table",
    "entity_id": "<asset_id>",
    "min_quality_score": 95.0,
    "notification_emails": "billing-team@co.com",
    "notification_slack_channel": "https://hooks.slack.com/..."
  }'
```

Alerts deduplicate within a 4-hour window — a rule that fails repeatedly won't spam you.

---

## Vault / AWS Secrets Manager

The platform can load secrets from HashiCorp Vault KV v2 or AWS Secrets Manager at startup (`app/core/secrets_loader.py`). Retrieved values are merged into the application settings before any service initializes, so downstream code never needs to know where secrets came from.

### Priority order

```
Environment variables → Vault → AWS Secrets Manager → .env file defaults
```

### HashiCorp Vault (KV v2)

```env
VAULT_ADDR=https://vault.example.com
VAULT_TOKEN=hvs.your-token-here
VAULT_SECRET_PATH=secret/data/dq-platform
```

The secret at `VAULT_SECRET_PATH` should contain a flat JSON object whose keys match the application's environment variable names (e.g., `SNOWFLAKE_PASSWORD`, `OPENAI_API_KEY`).

### AWS Secrets Manager

```env
AWS_SECRETS_NAME=dq-platform/production
AWS_REGION=us-east-1
```

The secret value must be a JSON object with the same key naming convention. Standard AWS credential resolution applies (instance profile, `~/.aws/credentials`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` env vars).

### When neither is configured

If none of the Vault/AWS variables are set, `secrets_loader.py` is a no-op and the application falls back to `.env` / environment variables as before.

---

## Architecture Overview

```
Browser (Next.js 15, TypeScript, Tailwind)
      │
      │  REST / JSON  (JWT bearer or X-API-Key)
      ▼
FastAPI (Python 3.12, async SQLAlchemy)
      │                    │
      │                    │ APScheduler (background)
      ▼                    ▼
PostgreSQL 16         Rule Execution Engine
(metadata store)          │  asyncio.gather() + semaphore
                          │
                          │ Snowflake Connection Pool
                          │ (per-credential, health-checked)
                          ▼
                     Snowflake (source data, read-only)
      │
      │ HTTP
      ▼
LLM Provider (Ollama / OpenAI / Claude / Gemini)

      │
      │ startup only
      ▼
Secrets Bootstrap (HashiCorp Vault / AWS Secrets Manager)
```

### Backend API surface (`app/api/`)

| Router file | Prefix | Key endpoints |
|---|---|---|
| `users.py` | `/auth`, `/users` | Login, refresh, me, CRUD users, change password |
| `oauth.py` | `/auth/oauth` | Providers list, Google SSO initiation, OAuth callback |
| `service_accounts.py` | `/service-accounts` | Create, list, rotate, update, delete API keys |
| `domains.py` | `/domains` | CRUD domains |
| `subdomains.py` | `/subdomains` | CRUD subdomains |
| `assets.py` | `/assets` | CRUD assets, enriched list, certify |
| `rules.py` | `/rules` | CRUD rules, enriched list, approve, reject, versions, rollback, tags, bulk ops |
| `schedules.py` | `/schedules` | CRUD schedules, pause, resume, run-now, enriched list |
| `executions.py` | `/execute`, `/runs` | Trigger rule/table/domain execution (sync + async), list runs, samples |
| `dashboard.py` | `/dashboard` | Global, domain, subdomain, table dashboards, history, SLA breaches, summary |
| `ai.py` | `/ai` | Generate rules, explain failure, generate SQL, classify table, chat, stream |
| `alerts.py` | `/alerts` | List, enriched, summary, acknowledge, resolve, ignore |
| `audit.py` | `/audit` | List with filters, summary, CSV export |
| `config.py` | `/config` | Get/update key-value config, test DB/Snowflake/LLM |
| `connections.py` | `/connections` | CRUD Snowflake connections, test, browse databases/schemas/tables |

### Background job tracking

`POST /rules/bulk/execute` returns a job handle immediately instead of waiting:

```json
{ "job_id": "job_abc123", "poll_url": "/rules/bulk/jobs/job_abc123" }
```

Poll `GET /rules/bulk/jobs/{job_id}` until `status` is `completed` or `failed`:

```json
{ "job_id": "job_abc123", "status": "running", "progress": 14, "total": 50 }
```

Job states: `queued` → `running` → `completed` / `failed`.

### Frontend pages (`frontend/src/app/`)

| Route | Description |
|---|---|
| `/login` | Sign-in form with "Sign in with Google" button; redirects to dashboard on success |
| `/auth/callback` | OAuth return page — reads `?token=&refresh=` and stores tokens |
| `/dashboard/global` | Platform-wide quality score, trend, and stat cards |
| `/dashboard/domains` | All domains with quality bar chart |
| `/dashboard/domains/[id]` | Domain detail — subdomains, trend, top failures |
| `/dashboard/subdomains/[id]` | Subdomain detail — tables with scores (includes `domain_name` breadcrumb) |
| `/dashboard/tables/[id]` | Table detail — rules (clickable), certification, trend |
| `/rules` | Rule list with filters, skeleton loading, illustrated empty state, inline edit drawer, run, archive |
| `/rules/create` | Rule creation form |
| `/rules/[id]` | Rule detail — details, run history, version history, approve/reject |
| `/assets` | Dataset list with inline edit drawer, certification badge, deactivate |
| `/schedules` | Schedule management |
| `/runs` | Execution log with filters and CSV export |
| `/alerts` | Alert list with skeleton loading, illustrated empty state, acknowledge/resolve/ignore, Table/Rule links |
| `/audit` | Audit log viewer with CSV export |
| `/ai-assistant` | AI chatbot (also in sidebar under "AI" section) |
| `/settings` | App config, Snowflake connections, LLM, scheduler |
| `/admin/domains` | Admin-only — create/edit/delete domains and subdomains |

### Command Palette / Keyboard Shortcuts

Press **`⌘K`** (macOS) or **`Ctrl+K`** (Windows/Linux) anywhere in the application to open the command palette. It provides:

- Fuzzy-search across all navigation destinations
- Keyboard navigation with `↑` / `↓` arrow keys
- `Enter` to navigate to the selected page
- `Escape` to dismiss

No mouse required — power users can jump between any page without leaving the keyboard.

---

## Supported Rule Types

| Rule type | Purpose | Required config |
|---|---|---|
| `null_check` | Column must not be NULL | — |
| `uniqueness_check` | All values must be unique | — |
| `duplicate_check` | Alias for uniqueness_check | — |
| `accepted_values_check` | Value must be in an allowed list | `accepted_values: [...]` |
| `range_check` | Numeric value within min/max | `min_value` and/or `max_value` |
| `freshness_check` | Table updated within N hours | `max_hours` (default 24) |
| `volume_check` | Row count for today | `date_column` (default `created_at`) |
| `schema_drift_check` | Expected columns must exist | `expected_columns: [...]` |
| `referential_integrity_check` | FK values must exist in parent | `reference_table`, `reference_column` |
| `regex_check` | Values must match a pattern | `pattern` |
| `business_rule_check` | Custom WHERE condition | `condition` |
| `custom_sql_check` | Fully custom SQL returning `failed_count` | `sql` |

### Config examples

```json
{ "accepted_values": ["PAID", "PENDING", "FAILED", "CANCELLED"] }

{ "min_value": 0, "max_value": 1000000 }

{ "max_hours": 6 }

{ "pattern": "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$" }

{ "reference_table": "\"schema\".\"customers\"", "reference_column": "customer_id" }

{ "condition": "ship_date >= order_date" }

{ "sql": "SELECT COUNT(*) AS failed_count FROM \"schema\".\"orders\" WHERE total < 0" }
```

---

## API Reference

Full interactive docs: http://localhost:8000/docs

### Authentication

```bash
# Login (returns access_token and refresh_token)
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  | jq -r .access_token)

# Use JWT token
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/domains

# Use service account API key
curl -H "X-API-Key: sa_abc123_<secret>" http://localhost:8000/rules
```

### Key request examples

```bash
# List domains
curl http://localhost:8000/domains

# Create a rule
curl -X POST http://localhost:8000/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rule_name": "invoice_id_not_null",
    "domain_id": "<domain_id>",
    "subdomain_id": "<subdomain_id>",
    "asset_id": "<asset_id>",
    "rule_type": "null_check",
    "target_column": "invoice_id",
    "severity": "critical"
  }'

# Approve a rule
curl -X POST http://localhost:8000/rules/<rule_id>/approve \
  -H "Authorization: Bearer $TOKEN"

# Reject a rule
curl -X POST http://localhost:8000/rules/<rule_id>/reject \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rejection_reason": "SQL has performance issues on large tables"}'

# Run a rule immediately (sync — waits for result)
curl -X POST http://localhost:8000/execute/rule/<rule_id>/sync \
  -H "Authorization: Bearer $TOKEN"

# Bulk execute all rules for a table (async — returns job_id immediately)
curl -X POST http://localhost:8000/rules/bulk/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"asset_id": "<asset_id>"}'

# Poll bulk job status
curl http://localhost:8000/rules/bulk/jobs/<job_id> \
  -H "Authorization: Bearer $TOKEN"

# Get rule version history
curl http://localhost:8000/rules/<rule_id>/versions \
  -H "Authorization: Bearer $TOKEN"

# Rollback a rule to version 2
curl -X POST http://localhost:8000/rules/<rule_id>/rollback/2 \
  -H "Authorization: Bearer $TOKEN"

# Certify a dataset
curl -X POST http://localhost:8000/assets/<asset_id>/certify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"certification_status": "certified"}'

# Export audit logs as CSV (last 30 days)
curl "http://localhost:8000/audit/export?days=30" \
  -H "Authorization: Bearer $TOKEN" \
  -o audit_export.csv

# Global dashboard
curl http://localhost:8000/dashboard/global

# AI: generate rules for a table
curl -X POST http://localhost:8000/ai/generate-rules \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "Revenue",
    "subdomain": "Billing",
    "table_name": "invoices",
    "columns": [
      {"column_name": "invoice_id", "data_type": "VARCHAR"},
      {"column_name": "invoice_amount", "data_type": "NUMBER"}
    ]
  }'

# Create a service account
curl -X POST http://localhost:8000/service-accounts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "airflow-pipeline", "role": "data_owner"}'
```

---

## Importing Rules via YAML

Bulk-import rules for a table using the import endpoint. Imported rules start with status `pending_review` and must be approved before executing.

```bash
curl -X POST http://localhost:8000/rules/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "Revenue",
    "subdomain": "Billing",
    "asset": {
      "sf_schema_name": "revenue_dw",
      "sf_table_name": "invoices"
    },
    "rules": [
      {
        "rule_name": "invoice_id_not_null",
        "rule_type": "null_check",
        "target_column": "invoice_id",
        "severity": "critical"
      },
      {
        "rule_name": "invoice_amount_positive",
        "rule_type": "range_check",
        "target_column": "invoice_amount",
        "severity": "high",
        "config": { "min_value": 0 }
      }
    ]
  }'
```

See `config/sample_rules.yaml` for a full example including schedule config.

---

## Running Tests

```bash
source .venv/bin/activate
PYTHONPATH=. python -m pytest tests/ -v
```

Current test coverage:

| Test file | What it covers |
|---|---|
| `test_sql_generator.py` | SQL generation for all 12 rule types |
| `test_rule_engine.py` | Edge cases — missing config, unknown type |
| `test_scoring_service.py` | Quality score calculation and severity penalties |
| `test_approval_workflow.py` | Rule lifecycle states, version logic, certification rules |
| `test_domain_logic.py` | Scoring functions, severity penalties, valid enum values |

Run with coverage:

```bash
PYTHONPATH=. python -m pytest tests/ --cov=app --cov-report=term-missing
```

---

## Environment Variable Reference

### Application

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `local` | Environment tag shown in health check |
| `DEBUG` | `true` | Enable verbose logging |
| `SECRET_KEY` | `change-me-in-production` | JWT signing key — use `openssl rand -hex 32` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token lifetime (30 minutes) |
| `AUTH_REQUIRED` | `true` | Set `false` only for local development |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS allowed origins (comma-separated) |

### Database

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://dquser:dqpass@localhost:5432/dqplatform` | Async connection (FastAPI) |
| `SYNC_DATABASE_URL` | `postgresql://dquser:dqpass@localhost:5432/dqplatform` | Sync connection (Alembic) |

### Snowflake

| Variable | Default | Description |
|---|---|---|
| `SNOWFLAKE_ACCOUNT` | — | Account identifier (`orgname-accountname`) |
| `SNOWFLAKE_USER` | — | Service user |
| `SNOWFLAKE_PASSWORD` | — | Service user password |
| `SNOWFLAKE_WAREHOUSE` | `DQ_EXECUTION_WH` | Execution warehouse |
| `SNOWFLAKE_DATABASE` | — | Default source database |
| `SNOWFLAKE_SCHEMA` | — | Default source schema |
| `SNOWFLAKE_ROLE` | `DQ_PLATFORM_ROLE` | Role for the service user |
| `SNOWFLAKE_POOL_MIN_SIZE` | `1` | Minimum idle connections per credential set |
| `SNOWFLAKE_POOL_MAX_SIZE` | `5` | Maximum open connections per credential set |
| `SNOWFLAKE_POOL_ACQUIRE_TIMEOUT` | `30.0` | Seconds to wait for a pool connection |

### LLM / AI

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | Active provider: `ollama`, `openai`, `claude`, `gemini_flash` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `qwen2.5:7b-instruct` | Ollama model name |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `CLAUDE_MODEL` | `claude-3-5-sonnet-latest` | Claude model |
| `GEMINI_API_KEY` | — | Google AI API key |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Gemini model |

### Scheduler

| Variable | Default | Description |
|---|---|---|
| `SCHEDULER_TYPE` | `apscheduler` | Scheduler backend |
| `DEFAULT_TIMEZONE` | `America/Los_Angeles` | Default timezone for schedules |

### Notifications

| Variable | Default | Description |
|---|---|---|
| `SLACK_WEBHOOK_URL` | — | Slack incoming webhook for alerts |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `SMTP_FROM_EMAIL` | `dq-platform@example.com` | From address for alert emails |
| `SMTP_USE_TLS` | `true` | Use STARTTLS |
| `ALERT_EMAIL_RECIPIENTS` | — | Comma-separated default alert email list |

### OAuth2 / SSO

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | — | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth2 client secret |
| `OAUTH_REDIRECT_URI` | `http://localhost:8000/auth/oauth/google/callback` | Callback URL registered in Google Cloud Console |
| `FRONTEND_URL` | `http://localhost:3000` | Base URL of the frontend (used for post-OAuth redirect) |

### Secrets Bootstrap

| Variable | Default | Description |
|---|---|---|
| `VAULT_ADDR` | — | HashiCorp Vault server URL (e.g., `https://vault.example.com`) |
| `VAULT_TOKEN` | — | Vault token with read access to `VAULT_SECRET_PATH` |
| `VAULT_SECRET_PATH` | — | KV v2 path (e.g., `secret/data/dq-platform`) |
| `AWS_SECRETS_NAME` | — | AWS Secrets Manager secret name (e.g., `dq-platform/production`) |
| `AWS_REGION` | — | AWS region for Secrets Manager (e.g., `us-east-1`) |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API base URL |
| `NEXT_PUBLIC_AUTH_REQUIRED` | `true` | Set `false` to skip login redirect during local development |
