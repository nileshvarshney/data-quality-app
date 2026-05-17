# Schema Drift Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a schema drift detection module that pins an approved baseline per Snowflake asset, detects column additions/deletions/type changes/nullability changes nightly, raises multi-channel alerts, and surfaces a diff UI with one-click approval on the asset detail page.

**Architecture:** Two new SQLAlchemy models (`SchemaBaseline`, `SchemaDriftEvent`) hold the pinned schema and detected changes. A new service (`schema_drift_service.py`) runs a pure diff function then persists events and creates a `DQAlert` via the existing notification pipeline. A separate nightly job at 04:00 UTC runs drift detection against every asset's freshly-updated `ColumnMetadata`. Three new API endpoints feed a new `SchemaDriftTab` React component injected into the asset detail page.

**Tech Stack:** FastAPI, SQLAlchemy async (PostgreSQL), APScheduler, Next.js 15, TypeScript, Tailwind, Axios (`api` from `apiClient.ts`), lucide-react (`GitCompare` icon)

---

## File Map

| Status | Path | Purpose |
|--------|------|---------|
| Create | `docs/superpowers/specs/2026-05-17-schema-drift-detection-design.md` | Spec doc |
| Modify | `app/db/models.py` | Add `SchemaBaseline`, `SchemaDriftEvent`; update `DQAlert` |
| Modify | `app/db/database.py` | Add migrations for new tables + DQAlert columns |
| Create | `app/services/schema_drift_service.py` | Core drift logic |
| Modify | `app/services/scheduler_service.py` | Add nightly drift detection job at 04:00 UTC |
| Create | `app/api/schema_drift.py` | Three API endpoints |
| Modify | `app/main.py` | Import and register schema_drift router |
| Create | `tests/test_schema_drift_service.py` | Unit tests for diff logic + service |
| Create | `tests/test_api_schema_drift.py` | API endpoint tests |
| Create | `frontend/src/types/schemaDrift.ts` | TypeScript types |
| Create | `frontend/src/services/schemaDriftApi.ts` | Axios API client |
| Create | `frontend/src/components/schema-drift/SchemaDriftTab.tsx` | Tab UI |
| Create | `frontend/src/components/schema-drift/DriftEventRow.tsx` | Single diff row |
| Modify | `frontend/src/app/dashboard/tables/[assetId]/page.tsx` | Inject Schema Drift tab |

---

## Task 1: Write spec doc

**Files:**
- Create: `docs/superpowers/specs/2026-05-17-schema-drift-detection-design.md`

- [ ] **Step 1.1: Write spec document**

```bash
cat > docs/superpowers/specs/2026-05-17-schema-drift-detection-design.md << 'SPEC'
# Schema Drift Detection Design

## Problem
The platform profiles Snowflake tables nightly but has no record of *structural* changes —
column additions, deletions, type changes, nullability shifts. When a column is renamed or
dropped, there is no alert and no history.

## Solution
Two new models pin an approved schema baseline and log each detected change.
A nightly job (04:00 UTC, after the 02:00 column profile) compares current `ColumnMetadata`
against the active baseline and raises multi-channel alerts via the existing pipeline.
Users review and accept changes via a new tab on the asset detail page.

## Data Models

### SchemaBaseline
Stores the approved schema snapshot for an asset.
One row per asset per baseline epoch; `status='active'` identifies the current reference.

### SchemaDriftEvent
One row per detected structural change.
`status='open'` until the user accepts all changes (advancing the baseline).

### DQAlert updates
`run_id` and `rule_id` made nullable to support non-rule alerts.
`alert_type` column added (`rule_failure` default | `schema_drift`).
`drift_asset_id` FK added for asset-level anchor on schema drift alerts.

## Change Detection Rules
| Change type | Condition |
|---|---|
| `column_added` | column in current ColumnMetadata but not in baseline snapshot |
| `column_deleted` | column in baseline snapshot but not in current ColumnMetadata |
| `type_changed` | column in both; `data_type` values differ |
| `nullability_changed` | column in both; `is_nullable` values differ |

## Severity Logic
`high` if any `column_deleted` or `type_changed` (potentially breaking).
`medium` if only `column_added` or `nullability_changed`.

## Baseline Approval
"Accept All Changes" button calls `POST /assets/{id}/schema-drift/approve`.
Marks current baseline as `superseded`, creates new baseline from current `ColumnMetadata`,
marks all open events as `accepted`.

## Dedup Guards
1. If open `SchemaDriftEvent` rows already exist for the asset → skip detection (already flagged).
2. If an open `DQAlert` with `alert_type='schema_drift'` exists for the asset → skip new alert.
SPEC
```

- [ ] **Step 1.2: Commit spec doc**

```bash
git add docs/superpowers/specs/2026-05-17-schema-drift-detection-design.md
git commit -m "docs: add schema drift detection design spec"
```

---

## Task 2: DB models + test stubs

**Files:**
- Modify: `app/db/models.py:287-306` (DQAlert), end of file (new models)
- Modify: `app/db/database.py` (create_tables migrations)
- Create: `tests/test_schema_drift_service.py`

- [ ] **Step 2.1: Write test stubs first (TDD)**

Create `tests/test_schema_drift_service.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock


# ── Pure diff function tests (no DB needed) ──────────────────────────────

def test_compute_diff_column_added():
    from app.services.schema_drift_service import _compute_diff
    baseline = [{"column_name": "id", "data_type": "NUMBER", "is_nullable": False}]
    current  = [
        {"column_name": "id",    "data_type": "NUMBER",  "is_nullable": False},
        {"column_name": "email", "data_type": "VARCHAR", "is_nullable": True},
    ]
    events = _compute_diff(baseline, current)
    assert len(events) == 1
    ev = events[0]
    assert ev["change_type"] == "column_added"
    assert ev["column_name"] == "email"
    assert ev["old_value"] is None
    assert ev["new_value"] == "VARCHAR"


def test_compute_diff_column_deleted():
    from app.services.schema_drift_service import _compute_diff
    baseline = [
        {"column_name": "id",        "data_type": "NUMBER",  "is_nullable": False},
        {"column_name": "legacy_col","data_type": "VARCHAR", "is_nullable": True},
    ]
    current = [{"column_name": "id", "data_type": "NUMBER", "is_nullable": False}]
    events = _compute_diff(baseline, current)
    assert len(events) == 1
    ev = events[0]
    assert ev["change_type"] == "column_deleted"
    assert ev["column_name"] == "legacy_col"
    assert ev["old_value"] == "VARCHAR"
    assert ev["new_value"] is None


def test_compute_diff_type_changed():
    from app.services.schema_drift_service import _compute_diff
    baseline = [{"column_name": "amount", "data_type": "FLOAT",   "is_nullable": True}]
    current  = [{"column_name": "amount", "data_type": "NUMBER",  "is_nullable": True}]
    events = _compute_diff(baseline, current)
    assert len(events) == 1
    ev = events[0]
    assert ev["change_type"] == "type_changed"
    assert ev["old_value"] == "FLOAT"
    assert ev["new_value"] == "NUMBER"


def test_compute_diff_nullability_changed():
    from app.services.schema_drift_service import _compute_diff
    baseline = [{"column_name": "email", "data_type": "VARCHAR", "is_nullable": True}]
    current  = [{"column_name": "email", "data_type": "VARCHAR", "is_nullable": False}]
    events = _compute_diff(baseline, current)
    assert len(events) == 1
    ev = events[0]
    assert ev["change_type"] == "nullability_changed"
    assert ev["old_value"] == "True"
    assert ev["new_value"] == "False"


def test_compute_diff_no_changes():
    from app.services.schema_drift_service import _compute_diff
    cols = [{"column_name": "id", "data_type": "NUMBER", "is_nullable": False}]
    events = _compute_diff(cols, cols)
    assert events == []


def test_compute_diff_multiple_changes():
    from app.services.schema_drift_service import _compute_diff
    baseline = [
        {"column_name": "id",    "data_type": "NUMBER",  "is_nullable": False},
        {"column_name": "old_col","data_type": "VARCHAR", "is_nullable": True},
    ]
    current = [
        {"column_name": "id",      "data_type": "BIGINT", "is_nullable": False},
        {"column_name": "new_col", "data_type": "TEXT",   "is_nullable": True},
    ]
    events = _compute_diff(baseline, current)
    types = {e["change_type"] for e in events}
    assert "column_deleted" in types   # old_col removed
    assert "column_added"   in types   # new_col added
    assert "type_changed"   in types   # id: NUMBER → BIGINT


def test_summarize_changes_single():
    from app.services.schema_drift_service import _summarize_changes
    diff = [{"change_type": "column_deleted", "column_name": "x", "old_value": "VARCHAR", "new_value": None}]
    summary = _summarize_changes(diff)
    assert "1 column(s) deleted" in summary


def test_summarize_changes_mixed():
    from app.services.schema_drift_service import _summarize_changes
    diff = [
        {"change_type": "column_deleted",      "column_name": "a", "old_value": "INT",     "new_value": None},
        {"change_type": "column_added",        "column_name": "b", "old_value": None,      "new_value": "TEXT"},
        {"change_type": "nullability_changed", "column_name": "c", "old_value": "True",    "new_value": "False"},
    ]
    summary = _summarize_changes(diff)
    assert "deleted" in summary
    assert "added"   in summary
```

- [ ] **Step 2.2: Run tests to confirm they fail (service not yet implemented)**

```bash
pytest tests/test_schema_drift_service.py -v 2>&1 | head -30
```

Expected: `ImportError` or `ModuleNotFoundError` for `schema_drift_service`.

- [ ] **Step 2.3: Add `SchemaBaseline` and `SchemaDriftEvent` models to `app/db/models.py`**

Add after the `DQAlert` class (around line 306), before `SnowflakeConnection`:

```python
class SchemaBaseline(Base):
    __tablename__ = "schema_baselines"
    __table_args__ = (
        Index("ix_schema_baselines_asset_status", "asset_id", "status"),
    )

    baseline_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    columns_snapshot: Mapped[list | None] = mapped_column(JSON)
    approved_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class SchemaDriftEvent(Base):
    __tablename__ = "schema_drift_events"
    __table_args__ = (
        Index("ix_drift_events_asset_status", "asset_id", "status"),
    )

    event_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("data_assets.asset_id", ondelete="CASCADE"), nullable=False)
    baseline_id: Mapped[str] = mapped_column(String(36), ForeignKey("schema_baselines.baseline_id"), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    change_type: Mapped[str] = mapped_column(String(30), nullable=False)
    column_name: Mapped[str] = mapped_column(String(200), nullable=False)
    old_value: Mapped[str | None] = mapped_column(String(500), nullable=True)
    new_value: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
```

- [ ] **Step 2.4: Update `DQAlert` model to support schema drift alerts**

Replace the `DQAlert` class body (lines 290–305 in `app/db/models.py`) with:

```python
class DQAlert(Base):
    __tablename__ = "dq_alerts"

    alert_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    rule_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    domain_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    subdomain_id: Mapped[str] = mapped_column(String(36), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(36), nullable=False)
    alert_type: Mapped[str] = mapped_column(String(30), nullable=False, default="rule_failure")
    drift_asset_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    alert_status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    alert_message: Mapped[str | None] = mapped_column(Text)
    notified_to: Mapped[str | None] = mapped_column(String(500))
    notification_channel: Mapped[str | None] = mapped_column(String(50))
    notification_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
```

- [ ] **Step 2.5: Add database migrations in `app/db/database.py`**

In the `migrations` list inside `create_tables()`, add these entries at the end (before the closing `]`):

```python
            # Schema drift detection tables
            "ALTER TABLE dq_alerts ALTER COLUMN run_id DROP NOT NULL",
            "ALTER TABLE dq_alerts ALTER COLUMN rule_id DROP NOT NULL",
            "ALTER TABLE dq_alerts ADD COLUMN IF NOT EXISTS alert_type VARCHAR(30) NOT NULL DEFAULT 'rule_failure'",
            "ALTER TABLE dq_alerts ADD COLUMN IF NOT EXISTS drift_asset_id VARCHAR(36)",
            """CREATE TABLE IF NOT EXISTS schema_baselines (
                baseline_id  VARCHAR(36) PRIMARY KEY,
                asset_id     VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id) ON DELETE CASCADE,
                status       VARCHAR(20) NOT NULL DEFAULT 'active',
                columns_snapshot JSON,
                approved_by  VARCHAR(36),
                approved_at  TIMESTAMP,
                created_at   TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS ix_schema_baselines_asset_status ON schema_baselines(asset_id, status)",
            """CREATE TABLE IF NOT EXISTS schema_drift_events (
                event_id     VARCHAR(36) PRIMARY KEY,
                asset_id     VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id) ON DELETE CASCADE,
                baseline_id  VARCHAR(36) NOT NULL REFERENCES schema_baselines(baseline_id),
                detected_at  TIMESTAMP NOT NULL DEFAULT NOW(),
                change_type  VARCHAR(30) NOT NULL,
                column_name  VARCHAR(200) NOT NULL,
                old_value    VARCHAR(500),
                new_value    VARCHAR(500),
                status       VARCHAR(20) NOT NULL DEFAULT 'open',
                resolved_at  TIMESTAMP,
                resolved_by  VARCHAR(36)
            )""",
            "CREATE INDEX IF NOT EXISTS ix_drift_events_asset_status ON schema_drift_events(asset_id, status)",
```

- [ ] **Step 2.6: Run tests — should now fail with ImportError on schema_drift_service (models exist)**

```bash
pytest tests/test_schema_drift_service.py -v 2>&1 | head -20
```

Expected: `ImportError: cannot import name '_compute_diff' from 'app.services.schema_drift_service'` (module missing).

- [ ] **Step 2.7: Commit models**

```bash
git add app/db/models.py app/db/database.py tests/test_schema_drift_service.py
git commit -m "feat: add SchemaBaseline, SchemaDriftEvent models and update DQAlert for drift alerts"
```

---

## Task 3: Schema drift service

**Files:**
- Create: `app/services/schema_drift_service.py`

- [ ] **Step 3.1: Create `app/services/schema_drift_service.py`**

```python
import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ColumnMetadata, DataAsset, DQAlert, SchemaBaseline, SchemaDriftEvent,
)

logger = logging.getLogger("dq_platform.schema_drift")


# ── Pure helpers ──────────────────────────────────────────────────────────────

def _compute_diff(
    baseline_snapshot: list[dict],
    current_cols: list[dict],
) -> list[dict]:
    """Compare baseline snapshot to current columns; return list of change dicts."""
    baseline = {c["column_name"]: c for c in baseline_snapshot}
    current  = {c["column_name"]: c for c in current_cols}

    events: list[dict] = []

    for col_name in set(baseline) - set(current):
        events.append({
            "change_type": "column_deleted",
            "column_name": col_name,
            "old_value":   baseline[col_name].get("data_type"),
            "new_value":   None,
        })

    for col_name in set(current) - set(baseline):
        events.append({
            "change_type": "column_added",
            "column_name": col_name,
            "old_value":   None,
            "new_value":   current[col_name].get("data_type"),
        })

    for col_name in set(baseline) & set(current):
        b, c = baseline[col_name], current[col_name]
        if b.get("data_type") != c.get("data_type"):
            events.append({
                "change_type": "type_changed",
                "column_name": col_name,
                "old_value":   b.get("data_type"),
                "new_value":   c.get("data_type"),
            })
        if b.get("is_nullable") != c.get("is_nullable"):
            events.append({
                "change_type": "nullability_changed",
                "column_name": col_name,
                "old_value":   str(b.get("is_nullable")),
                "new_value":   str(c.get("is_nullable")),
            })

    return events


def _summarize_changes(diff: list[dict]) -> str:
    counts: dict[str, int] = {}
    for d in diff:
        counts[d["change_type"]] = counts.get(d["change_type"], 0) + 1
    parts = []
    if counts.get("column_deleted"):
        parts.append(f"{counts['column_deleted']} column(s) deleted")
    if counts.get("type_changed"):
        parts.append(f"{counts['type_changed']} type(s) changed")
    if counts.get("column_added"):
        parts.append(f"{counts['column_added']} column(s) added")
    if counts.get("nullability_changed"):
        parts.append(f"{counts['nullability_changed']} nullability changed")
    return ", ".join(parts) if parts else "schema changes detected"


def _col_to_snapshot_row(c: ColumnMetadata) -> dict:
    return {
        "column_name":      c.column_name,
        "data_type":        c.data_type,
        "is_nullable":      c.is_nullable,
        "ordinal_position": c.ordinal_position,
    }


# ── DB helpers ────────────────────────────────────────────────────────────────

async def get_active_baseline(asset_id: str, db: AsyncSession) -> SchemaBaseline | None:
    result = await db.execute(
        select(SchemaBaseline).where(
            SchemaBaseline.asset_id == asset_id,
            SchemaBaseline.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def _current_columns(asset_id: str, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id)
    )
    return [_col_to_snapshot_row(c) for c in result.scalars().all()]


# ── Public service functions ──────────────────────────────────────────────────

async def initialize_baseline(asset_id: str, db: AsyncSession) -> SchemaBaseline:
    """Create the first baseline from current ColumnMetadata. No alert raised."""
    snapshot = await _current_columns(asset_id, db)
    baseline = SchemaBaseline(
        baseline_id=str(uuid.uuid4()),
        asset_id=asset_id,
        status="active",
        columns_snapshot=snapshot,
        approved_by=None,
        approved_at=None,
    )
    db.add(baseline)
    await db.commit()
    await db.refresh(baseline)
    logger.info("Initialized schema baseline for asset %s (%d columns)", asset_id, len(snapshot))
    return baseline


async def detect_drift(asset_id: str, db: AsyncSession) -> list[SchemaDriftEvent]:
    """Compare current ColumnMetadata to active baseline; persist events + alert if changed."""
    baseline = await get_active_baseline(asset_id, db)
    if not baseline:
        return []

    # Dedup: skip if open events already exist for this asset
    existing = await db.execute(
        select(SchemaDriftEvent).where(
            SchemaDriftEvent.asset_id == asset_id,
            SchemaDriftEvent.status == "open",
        ).limit(1)
    )
    if existing.scalar_one_or_none():
        logger.debug("Drift dedup: open events exist for asset %s — skipping", asset_id)
        return []

    current = await _current_columns(asset_id, db)
    diff = _compute_diff(baseline.columns_snapshot or [], current)
    if not diff:
        return []

    now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    events = [
        SchemaDriftEvent(
            event_id=str(uuid.uuid4()),
            asset_id=asset_id,
            baseline_id=baseline.baseline_id,
            detected_at=now_dt,
            change_type=d["change_type"],
            column_name=d["column_name"],
            old_value=d["old_value"],
            new_value=d["new_value"],
            status="open",
        )
        for d in diff
    ]
    for ev in events:
        db.add(ev)
    await db.flush()

    # Create alert only if no open drift alert already exists for this asset
    alert_exists = await db.execute(
        select(DQAlert).where(
            DQAlert.drift_asset_id == asset_id,
            DQAlert.alert_type == "schema_drift",
            DQAlert.alert_status == "open",
        ).limit(1)
    )
    if not alert_exists.scalar_one_or_none():
        asset_res = await db.execute(
            select(DataAsset).where(DataAsset.asset_id == asset_id)
        )
        asset = asset_res.scalar_one_or_none()

        high_types = {"column_deleted", "type_changed"}
        severity = "high" if any(d["change_type"] in high_types for d in diff) else "medium"
        change_summary = _summarize_changes(diff)
        asset_label = (
            f"{asset.sf_schema_name}.{asset.sf_table_name}" if asset else asset_id
        )

        alert = DQAlert(
            alert_id=str(uuid.uuid4()),
            run_id=None,
            rule_id=None,
            domain_id=asset.domain_id if asset else "",
            subdomain_id=asset.subdomain_id if asset else "",
            asset_id=asset_id,
            alert_type="schema_drift",
            drift_asset_id=asset_id,
            severity=severity,
            alert_status="open",
            alert_message=f"Schema drift on {asset_label}: {change_summary}",
            notification_channel="multi",
            notification_sent=False,
        )
        db.add(alert)
        await db.commit()
        asyncio.create_task(_dispatch_drift_notification(alert, asset, diff))
    else:
        await db.commit()

    logger.info("Detected %d schema drift event(s) for asset %s", len(events), asset_id)
    return events


async def approve_baseline(
    asset_id: str, user_id: str, db: AsyncSession
) -> SchemaBaseline:
    """Accept all open drift events and advance the baseline to current schema."""
    baseline = await get_active_baseline(asset_id, db)
    if baseline:
        baseline.status = "superseded"

    snapshot = await _current_columns(asset_id, db)
    now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    new_baseline = SchemaBaseline(
        baseline_id=str(uuid.uuid4()),
        asset_id=asset_id,
        status="active",
        columns_snapshot=snapshot,
        approved_by=user_id,
        approved_at=now_dt,
    )
    db.add(new_baseline)

    open_events_result = await db.execute(
        select(SchemaDriftEvent).where(
            SchemaDriftEvent.asset_id == asset_id,
            SchemaDriftEvent.status == "open",
        )
    )
    for ev in open_events_result.scalars().all():
        ev.status = "accepted"
        ev.resolved_at = now_dt
        ev.resolved_by = user_id

    await db.commit()
    await db.refresh(new_baseline)
    logger.info("Baseline approved for asset %s by user %s", asset_id, user_id)
    return new_baseline


# ── Background notification ───────────────────────────────────────────────────

async def _dispatch_drift_notification(
    alert: DQAlert,
    asset: DataAsset | None,
    diff: list[dict],
) -> None:
    """Fire-and-forget: send drift alert notifications via existing channels."""
    try:
        from app.db.database import AsyncSessionLocal
        from app.services.notification_service import dispatch_alert
        from app.core.config import settings
        from sqlalchemy import select as _select

        async with AsyncSessionLocal() as session:
            extra_emails: list[str] = []
            if asset and asset.owner_email:
                extra_emails.append(asset.owner_email)

            asset_name = (
                f"{asset.sf_schema_name}.{asset.sf_table_name}" if asset else (alert.asset_id or "")
            )
            teams_webhook  = getattr(settings, "teams_webhook_url", "") or None
            pagerduty_key  = getattr(settings, "pagerduty_integration_key", "") or None
            custom_webhook = getattr(settings, "alert_webhook_url", "") or None

            results = await dispatch_alert(
                rule_name="Schema Drift Detection",
                severity=alert.severity,
                alert_message=alert.alert_message or "",
                domain_name="",
                asset_name=asset_name,
                failure_pct=None,
                extra_emails=extra_emails,
                slack_channel_webhook=None,
                teams_webhook=teams_webhook,
                pagerduty_key=pagerduty_key,
                custom_webhook=custom_webhook,
            )

            stored_res = await session.execute(
                _select(DQAlert).where(DQAlert.alert_id == alert.alert_id)
            )
            stored = stored_res.scalar_one_or_none()
            if stored:
                stored.notification_sent = any(results.values())
                stored.notification_sent_at = datetime.now(timezone.utc).replace(tzinfo=None)
                stored.notified_to = ", ".join(extra_emails) if extra_emails else None
                await session.commit()

            logger.info("Drift notification dispatch result for alert %s: %s", alert.alert_id, results)
    except Exception as e:
        logger.error("Drift notification failed for alert %s: %s", alert.alert_id, e)
```

- [ ] **Step 3.2: Run tests — all should pass**

```bash
pytest tests/test_schema_drift_service.py -v
```

Expected output:
```
tests/test_schema_drift_service.py::test_compute_diff_column_added PASSED
tests/test_schema_drift_service.py::test_compute_diff_column_deleted PASSED
tests/test_schema_drift_service.py::test_compute_diff_type_changed PASSED
tests/test_schema_drift_service.py::test_compute_diff_nullability_changed PASSED
tests/test_schema_drift_service.py::test_compute_diff_no_changes PASSED
tests/test_schema_drift_service.py::test_compute_diff_multiple_changes PASSED
tests/test_schema_drift_service.py::test_summarize_changes_single PASSED
tests/test_schema_drift_service.py::test_summarize_changes_mixed PASSED
8 passed in ...
```

- [ ] **Step 3.3: Commit service**

```bash
git add app/services/schema_drift_service.py
git commit -m "feat: add schema_drift_service with _compute_diff, detect_drift, initialize_baseline, approve_baseline"
```

---

## Task 4: Scheduler hook

**Files:**
- Modify: `app/services/scheduler_service.py`

- [ ] **Step 4.1: Add nightly drift detection function and register job**

In `app/services/scheduler_service.py`, add after `_nightly_column_profile()` (after line ~201):

```python
async def _nightly_drift_detect():
    """Run schema drift detection for all active assets (04:00 UTC, after column profiling)."""
    from app.db.database import AsyncSessionLocal
    from app.db.models import DataAsset
    from sqlalchemy import select as _select
    from app.services.schema_drift_service import detect_drift, initialize_baseline, get_active_baseline

    async with AsyncSessionLocal() as db:
        result = await db.execute(_select(DataAsset).where(DataAsset.is_active == True))
        assets = result.scalars().all()

    logger.info("Nightly drift detection: checking %d assets", len(assets))
    for asset in assets:
        try:
            async with AsyncSessionLocal() as db:
                baseline = await get_active_baseline(asset.asset_id, db)
                if baseline is None:
                    await initialize_baseline(asset.asset_id, db)
                else:
                    await detect_drift(asset.asset_id, db)
        except Exception as e:
            logger.error("Drift detection failed for asset %s: %s", asset.asset_id, e)
```

Then in `_register_nightly_aggregation()`, add one more job registration:

```python
def _register_nightly_aggregation():
    """Register all nightly system jobs with their default schedules."""
    _schedule_quality_aggregation_job()   # default 00:05
    _schedule_policy_evaluation_job()     # default 00:15
    _schedule_column_profile_job()        # default 02:00
    _schedule_drift_detect_job()          # default 04:00
```

And add the new `_schedule_drift_detect_job()` function right before `_register_nightly_aggregation()`:

```python
def _schedule_drift_detect_job(enabled: bool = True, hour: int = 4, minute: int = 0):
    """Register (or remove) the nightly schema drift detection job."""
    if not enabled:
        try:
            scheduler.remove_job("nightly_drift_detect")
            logger.info("Drift detection job disabled — removed from scheduler")
        except Exception:
            pass
        return
    scheduler.add_job(
        _nightly_drift_detect,
        trigger=CronTrigger(hour=hour, minute=minute, timezone=settings.default_timezone),
        id="nightly_drift_detect",
        replace_existing=True,
    )
    logger.info("Registered nightly drift detection job (%02d:%02d %s)", hour, minute, settings.default_timezone)
```

- [ ] **Step 4.2: Verify existing tests still pass**

```bash
pytest tests/test_schema_drift_service.py tests/test_rule_engine.py -v 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 4.3: Commit scheduler hook**

```bash
git add app/services/scheduler_service.py
git commit -m "feat: register nightly schema drift detection job at 04:00 UTC"
```

---

## Task 5: API endpoints

**Files:**
- Create: `app/api/schema_drift.py`
- Modify: `app/main.py`
- Create: `tests/test_api_schema_drift.py`

- [ ] **Step 5.1: Write test stubs first**

Create `tests/test_api_schema_drift.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock


def _make_mock_db(baseline=None, events=None, asset=None, alert=None):
    """Return a mock AsyncSession that serves fixture objects for select() calls."""
    mock_db = AsyncMock()

    def _scalar_result(obj):
        r = MagicMock()
        r.scalar_one_or_none.return_value = obj
        r.scalars.return_value.all.return_value = (
            [obj] if obj is not None else []
        )
        return r

    def _list_result(objs):
        r = MagicMock()
        r.scalar_one_or_none.return_value = objs[0] if objs else None
        r.scalars.return_value.all.return_value = objs
        return r

    call_count = [0]

    async def _execute(stmt, *args, **kwargs):
        call_count[0] += 1
        # Rotate through: asset check, baseline, events
        if call_count[0] == 1:
            return _scalar_result(asset)
        if call_count[0] == 2:
            return _scalar_result(baseline)
        return _list_result(events or [])

    mock_db.execute = _execute
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    return mock_db


@pytest.mark.asyncio
async def test_get_schema_drift_asset_not_found():
    from app.main import app
    from app.db.database import get_db

    async def mock_db():
        db = AsyncMock()
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=r)
        yield db

    app.dependency_overrides[get_db] = mock_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/assets/nonexistent/schema-drift")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_schema_drift_no_baseline():
    from app.main import app
    from app.db.database import get_db
    from unittest.mock import MagicMock

    asset = MagicMock()
    asset.asset_id = "asset-1"

    call_no = [0]

    async def mock_db():
        db = AsyncMock()

        async def execute(stmt, *a, **kw):
            call_no[0] += 1
            r = MagicMock()
            if call_no[0] == 1:
                r.scalar_one_or_none.return_value = asset   # asset exists
            else:
                r.scalar_one_or_none.return_value = None    # no baseline, no events
                r.scalars.return_value.all.return_value = []
            return r

        db.execute = execute
        yield db

    app.dependency_overrides[get_db] = mock_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/assets/asset-1/schema-drift")
        assert resp.status_code == 200
        data = resp.json()
        assert data["baseline"] is None
        assert data["open_events"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_schema_drift_with_open_events():
    from app.main import app
    from app.db.database import get_db
    from unittest.mock import MagicMock
    from datetime import datetime

    asset = MagicMock()
    asset.asset_id = "asset-1"

    baseline = MagicMock()
    baseline.baseline_id = "bl-1"
    baseline.asset_id = "asset-1"
    baseline.status = "active"
    baseline.columns_snapshot = []
    baseline.approved_by = None
    baseline.approved_at = None
    baseline.created_at = datetime(2026, 5, 1)

    event = MagicMock()
    event.event_id = "ev-1"
    event.asset_id = "asset-1"
    event.baseline_id = "bl-1"
    event.detected_at = datetime(2026, 5, 17)
    event.change_type = "column_added"
    event.column_name = "loyalty_tier"
    event.old_value = None
    event.new_value = "VARCHAR"
    event.status = "open"
    event.resolved_at = None
    event.resolved_by = None

    call_no = [0]

    async def mock_db():
        db = AsyncMock()

        async def execute(stmt, *a, **kw):
            call_no[0] += 1
            r = MagicMock()
            if call_no[0] == 1:
                r.scalar_one_or_none.return_value = asset
            elif call_no[0] == 2:
                r.scalar_one_or_none.return_value = baseline
            else:
                r.scalar_one_or_none.return_value = event
                r.scalars.return_value.all.return_value = [event]
            return r

        db.execute = execute
        yield db

    app.dependency_overrides[get_db] = mock_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/assets/asset-1/schema-drift")
        assert resp.status_code == 200
        data = resp.json()
        assert data["baseline"]["baseline_id"] == "bl-1"
        assert len(data["open_events"]) == 1
        assert data["open_events"][0]["change_type"] == "column_added"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_approve_baseline_asset_not_found():
    from app.main import app
    from app.db.database import get_db

    async def mock_db():
        db = AsyncMock()
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=r)
        yield db

    app.dependency_overrides[get_db] = mock_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/assets/nonexistent/schema-drift/approve")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 5.2: Run test stubs — expect import errors**

```bash
pytest tests/test_api_schema_drift.py -v 2>&1 | head -20
```

Expected: errors because `app/api/schema_drift.py` doesn't exist yet.

- [ ] **Step 5.3: Create `app/api/schema_drift.py`**

```python
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import DataAsset, SchemaBaseline, SchemaDriftEvent
from app.services.schema_drift_service import approve_baseline as _approve_baseline

router = APIRouter(prefix="/api/v1/assets", tags=["Schema Drift"])


def _fmt_baseline(b: SchemaBaseline) -> dict:
    return {
        "baseline_id":       b.baseline_id,
        "asset_id":          b.asset_id,
        "status":            b.status,
        "columns_snapshot":  b.columns_snapshot,
        "approved_by":       b.approved_by,
        "approved_at":       b.approved_at.isoformat() if b.approved_at else None,
        "created_at":        b.created_at.isoformat() if b.created_at else None,
    }


def _fmt_event(e: SchemaDriftEvent) -> dict:
    return {
        "event_id":    e.event_id,
        "asset_id":    e.asset_id,
        "baseline_id": e.baseline_id,
        "detected_at": e.detected_at.isoformat() if e.detected_at else None,
        "change_type": e.change_type,
        "column_name": e.column_name,
        "old_value":   e.old_value,
        "new_value":   e.new_value,
        "status":      e.status,
        "resolved_at": e.resolved_at.isoformat() if e.resolved_at else None,
        "resolved_by": e.resolved_by,
    }


async def _get_asset_or_404(asset_id: str, db: AsyncSession) -> DataAsset:
    result = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.get("/{asset_id}/schema-drift")
async def get_schema_drift(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_asset_or_404(asset_id, db)

    baseline_result = await db.execute(
        select(SchemaBaseline).where(
            SchemaBaseline.asset_id == asset_id,
            SchemaBaseline.status == "active",
        )
    )
    baseline = baseline_result.scalar_one_or_none()

    events_result = await db.execute(
        select(SchemaDriftEvent)
        .where(SchemaDriftEvent.asset_id == asset_id, SchemaDriftEvent.status == "open")
        .order_by(SchemaDriftEvent.detected_at.desc())
    )
    events = events_result.scalars().all()

    return {
        "baseline":    _fmt_baseline(baseline) if baseline else None,
        "open_events": [_fmt_event(e) for e in events],
    }


@router.post("/{asset_id}/schema-drift/approve")
async def approve_schema_baseline(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_asset_or_404(asset_id, db)

    open_result = await db.execute(
        select(SchemaDriftEvent).where(
            SchemaDriftEvent.asset_id == asset_id,
            SchemaDriftEvent.status == "open",
        )
    )
    accepted_count = len(open_result.scalars().all())

    user_id = user.get("user_id") or user.get("sub") or "unknown"
    new_baseline = await _approve_baseline(asset_id, user_id, db)

    return {
        "new_baseline":   _fmt_baseline(new_baseline),
        "accepted_count": accepted_count,
    }


@router.get("/{asset_id}/schema-drift/history")
async def get_schema_drift_history(
    asset_id: str,
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    await _get_asset_or_404(asset_id, db)

    events_result = await db.execute(
        select(SchemaDriftEvent)
        .where(SchemaDriftEvent.asset_id == asset_id)
        .order_by(SchemaDriftEvent.detected_at.desc())
        .limit(limit)
    )
    return {"events": [_fmt_event(e) for e in events_result.scalars().all()]}
```

- [ ] **Step 5.4: Register router in `app/main.py`**

In the imports block at the top of `app/main.py`, add `schema_drift` to the import:

```python
from app.api import (
    domains, subdomains, assets, rules, schedules, executions,
    dashboard, ai, alerts, audit, config, connections,
    # §53 Catalog & Governance
    glossary, classifications, columns, data_products,
    comments, announcements, access_requests, tags, usage, catalog,
    lineage,
    schema_drift,
    # §54-§68 Advanced features
    governance, contracts, compliance, cost, incidents,
    anomaly, marketplace, mesh, observability, cicd,
    privacy, admin,
)
```

Then in the routers section (after `app.include_router(lineage.router)`), add:

```python
app.include_router(schema_drift.router)
```

- [ ] **Step 5.5: Run API tests**

```bash
pytest tests/test_api_schema_drift.py -v
```

Expected:
```
tests/test_api_schema_drift.py::test_get_schema_drift_asset_not_found PASSED
tests/test_api_schema_drift.py::test_get_schema_drift_no_baseline PASSED
tests/test_api_schema_drift.py::test_get_schema_drift_with_open_events PASSED
tests/test_api_schema_drift.py::test_approve_baseline_asset_not_found PASSED
4 passed in ...
```

- [ ] **Step 5.6: Commit API layer**

```bash
git add app/api/schema_drift.py app/main.py tests/test_api_schema_drift.py
git commit -m "feat: add schema drift API endpoints (GET drift, POST approve, GET history)"
```

---

## Task 6: Frontend types + API client

**Files:**
- Create: `frontend/src/types/schemaDrift.ts`
- Create: `frontend/src/services/schemaDriftApi.ts`

- [ ] **Step 6.1: Create `frontend/src/types/schemaDrift.ts`**

```typescript
export interface SchemaBaselineColumn {
  column_name: string
  data_type: string | null
  is_nullable: boolean | null
  ordinal_position: number | null
}

export interface SchemaBaseline {
  baseline_id: string
  asset_id: string
  status: 'active' | 'superseded'
  columns_snapshot: SchemaBaselineColumn[] | null
  approved_by: string | null
  approved_at: string | null
  created_at: string | null
}

export interface SchemaDriftEvent {
  event_id: string
  asset_id: string
  baseline_id: string
  detected_at: string | null
  change_type: 'column_added' | 'column_deleted' | 'type_changed' | 'nullability_changed'
  column_name: string
  old_value: string | null
  new_value: string | null
  status: 'open' | 'accepted'
  resolved_at: string | null
  resolved_by: string | null
}

export interface SchemaDriftResponse {
  baseline: SchemaBaseline | null
  open_events: SchemaDriftEvent[]
}

export interface SchemaDriftHistoryResponse {
  events: SchemaDriftEvent[]
}

export interface ApproveBaselineResponse {
  new_baseline: SchemaBaseline
  accepted_count: number
}
```

- [ ] **Step 6.2: Create `frontend/src/services/schemaDriftApi.ts`**

```typescript
import { api } from './apiClient'
import type {
  SchemaDriftResponse,
  ApproveBaselineResponse,
  SchemaDriftHistoryResponse,
} from '@/types/schemaDrift'

export const schemaDriftApi = {
  get: (assetId: string): Promise<SchemaDriftResponse> =>
    api.get<SchemaDriftResponse>(`/api/v1/assets/${assetId}/schema-drift`)
      .then(r => r.data),

  approve: (assetId: string): Promise<ApproveBaselineResponse> =>
    api.post<ApproveBaselineResponse>(`/api/v1/assets/${assetId}/schema-drift/approve`, {})
      .then(r => r.data),

  history: (assetId: string, limit = 30): Promise<SchemaDriftHistoryResponse> =>
    api.get<SchemaDriftHistoryResponse>(
      `/api/v1/assets/${assetId}/schema-drift/history`,
      { params: { limit } }
    ).then(r => r.data),
}
```

- [ ] **Step 6.3: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6.4: Commit frontend types + client**

```bash
git add frontend/src/types/schemaDrift.ts frontend/src/services/schemaDriftApi.ts
git commit -m "feat: add schemaDrift TypeScript types and API client"
```

---

## Task 7: Frontend components + tab injection

**Files:**
- Create: `frontend/src/components/schema-drift/DriftEventRow.tsx`
- Create: `frontend/src/components/schema-drift/SchemaDriftTab.tsx`
- Modify: `frontend/src/app/dashboard/tables/[assetId]/page.tsx`

- [ ] **Step 7.1: Create `frontend/src/components/schema-drift/DriftEventRow.tsx`**

```tsx
import type { SchemaDriftEvent } from '@/types/schemaDrift'

const CHANGE_BADGE: Record<SchemaDriftEvent['change_type'], { label: string; cls: string }> = {
  column_deleted:      { label: 'COLUMN DELETED',      cls: 'bg-red-100 text-red-700' },
  type_changed:        { label: 'TYPE CHANGED',         cls: 'bg-orange-100 text-orange-700' },
  column_added:        { label: 'COLUMN ADDED',         cls: 'bg-blue-100 text-blue-700' },
  nullability_changed: { label: 'NULLABILITY CHANGED',  cls: 'bg-yellow-100 text-yellow-700' },
}

export function DriftEventRow({ event }: { event: SchemaDriftEvent }) {
  const badge = CHANGE_BADGE[event.change_type]
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-2.5 text-sm font-mono text-gray-800">{event.column_name}</td>
      <td className="px-4 py-2.5">
        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
          {badge.label}
        </span>
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-500 font-mono">
        {event.old_value ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-800 font-mono">
        {event.new_value ?? <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}
```

- [ ] **Step 7.2: Create `frontend/src/components/schema-drift/SchemaDriftTab.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { schemaDriftApi } from '@/services/schemaDriftApi'
import type { SchemaDriftResponse, SchemaDriftEvent } from '@/types/schemaDrift'
import { DriftEventRow } from './DriftEventRow'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'unknown date'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function SchemaDriftTab({ assetId }: { assetId: string }) {
  const [data, setData]           = useState<SchemaDriftResponse | null>(null)
  const [history, setHistory]     = useState<SchemaDriftEvent[]>([])
  const [loading, setLoading]     = useState(true)
  const [approving, setApproving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [drift, hist] = await Promise.all([
        schemaDriftApi.get(assetId),
        schemaDriftApi.history(assetId),
      ])
      setData(drift)
      setHistory(hist.events)
    } catch {
      setError('Failed to load schema drift data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [assetId])

  const handleApprove = async () => {
    setApproving(true)
    try {
      await schemaDriftApi.approve(assetId)
      await load()
    } catch {
      setError('Failed to approve baseline.')
    } finally {
      setApproving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 p-8 text-gray-400">
      <Loader2 size={16} className="animate-spin" /> Loading schema drift…
    </div>
  )

  if (error) return (
    <div className="p-8 text-red-500 text-sm">{error}</div>
  )

  if (!data?.baseline) return (
    <div className="p-8 text-center text-gray-500 text-sm">
      No baseline established yet — run a column profile to initialize schema drift tracking.
    </div>
  )

  const { baseline, open_events } = data
  const approvedLabel = baseline.approved_by
    ? `approved by ${baseline.approved_by} on ${formatDate(baseline.approved_at ?? baseline.created_at)}`
    : `initialized on ${formatDate(baseline.created_at)}`

  return (
    <div className="space-y-4">
      {/* Baseline header */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 text-sm text-gray-500">
        Baseline: <span className="text-gray-800 font-medium">{approvedLabel}</span>
      </div>

      {/* Drift events */}
      {open_events.length === 0 ? (
        <div className="bg-white border border-green-200 rounded-xl p-6 flex items-center gap-3 text-green-700">
          <CheckCircle size={18} />
          <span className="font-medium">Schema matches baseline — no drift detected.</span>
        </div>
      ) : (
        <div className="bg-white border border-orange-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2 text-orange-700 text-sm font-medium">
            <AlertTriangle size={15} />
            {open_events.length} change{open_events.length > 1 ? 's' : ''} detected since last approved baseline
          </div>
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Column</th>
                <th className="px-4 py-2">Change</th>
                <th className="px-4 py-2">Old</th>
                <th className="px-4 py-2">New</th>
              </tr>
            </thead>
            <tbody>
              {open_events.map(ev => <DriftEventRow key={ev.event_id} event={ev} />)}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {approving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              {approving ? 'Accepting…' : 'Accept All Changes'}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className="w-full flex items-center gap-2 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {historyOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Drift History (last {history.length} events)
          </button>
          {historyOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {history.map(ev => (
                <div key={ev.event_id} className="px-5 py-2.5 text-sm text-gray-600 flex items-center justify-between">
                  <span>
                    <span className="font-mono text-gray-800">{ev.column_name}</span>
                    {' · '}
                    <span className="capitalize">{ev.change_type.replace(/_/g, ' ')}</span>
                  </span>
                  <span className="text-gray-400 text-xs">
                    {ev.status === 'accepted'
                      ? `accepted${ev.resolved_by ? ` by ${ev.resolved_by}` : ''} · ${formatDate(ev.resolved_at)}`
                      : `detected ${formatDate(ev.detected_at)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7.3: Inject Schema Drift tab into `frontend/src/app/dashboard/tables/[assetId]/page.tsx`**

**3a. Update the `activeTab` state type** (line 200 in the file). Replace:

```typescript
const [activeTab, setActiveTab] = useState<'quality' | 'schema' | 'lineage' | 'trends'>('quality')
```

with:

```typescript
const [activeTab, setActiveTab] = useState<'quality' | 'schema' | 'lineage' | 'drift' | 'trends'>('quality')
```

**3b. Add `GitCompare` to the existing lucide-react import** (line 9 in the file):

```typescript
import {
  Shield, CheckCircle, XCircle, Activity, Clock,
  ChevronRight, RefreshCw, Play, AlertTriangle, Loader2,
  FileText, Bot, Database,
  Columns, Star, Tag, BookOpen, Zap, Pencil, EyeOff, TrendingUp, GitFork, GitCompare,
} from 'lucide-react'
```

**3c. Add the import for `SchemaDriftTab`** (add after the `LineageTab` import, around line 23):

```typescript
import { SchemaDriftTab } from '@/components/schema-drift/SchemaDriftTab'
```

**3d. Add `'drift'` to the tab array** (around line 387–391). Replace the tab array:

```tsx
{([
  { id: 'quality', label: 'Quality',       icon: <Shield size={14} /> },
  { id: 'schema',  label: 'Schema',         icon: <Columns size={14} /> },
  { id: 'lineage', label: 'Lineage',         icon: <GitFork size={14} /> },
  { id: 'drift',   label: 'Schema Drift',   icon: <GitCompare size={14} /> },
  { id: 'trends',  label: 'Profile Trends', icon: <TrendingUp size={14} /> },
] as const).map(tab => (
```

**3e. Add the drift tab panel** after the `{activeTab === 'lineage' && ...}` block:

```tsx
{/* ── Schema Drift tab ────────────────────────────────────── */}
{activeTab === 'drift' && (
  <SchemaDriftTab assetId={assetId} />
)}
```

- [ ] **Step 7.4: Run TypeScript check and lint**

```bash
cd frontend && npm run type-check && npm run lint
```

Expected: no errors.

- [ ] **Step 7.5: Commit frontend components**

```bash
git add \
  frontend/src/components/schema-drift/DriftEventRow.tsx \
  frontend/src/components/schema-drift/SchemaDriftTab.tsx \
  frontend/src/app/dashboard/tables/\[assetId\]/page.tsx
git commit -m "feat: add SchemaDriftTab component and inject into asset detail page"
```

---

## Task 8: End-to-end verification

- [ ] **Step 8.1: Run full test suite**

```bash
pytest tests/test_schema_drift_service.py tests/test_api_schema_drift.py -v
```

Expected: all 12 tests pass.

- [ ] **Step 8.2: Start the dev server**

```bash
docker compose up
```

Wait for `Uvicorn running on http://0.0.0.0:8000` and `Ready on http://localhost:3000`.

- [ ] **Step 8.3: Verify Schema Drift tab appears**

Open `http://localhost:3000`, navigate to any asset detail page (`/dashboard/tables/<asset_id>`).
Confirm the tab bar shows: `Quality | Schema | Lineage | Schema Drift | Profile Trends`.
Click "Schema Drift" — expect: loading spinner, then either the baseline-not-initialized message or the green "matches baseline" state.

- [ ] **Step 8.4: Seed a test drift event (psql)**

```sql
-- 1. Get an asset_id
SELECT asset_id, sf_table_name FROM data_assets LIMIT 1;

-- 2. Get the active baseline for that asset
SELECT baseline_id FROM schema_baselines WHERE asset_id = '<asset_id>' AND status = 'active';

-- 3. Insert a test drift event
INSERT INTO schema_drift_events (event_id, asset_id, baseline_id, change_type, column_name, old_value, new_value, status)
VALUES (gen_random_uuid(), '<asset_id>', '<baseline_id>', 'column_added', 'test_column', NULL, 'VARCHAR', 'open');
```

Refresh the Schema Drift tab — confirm the diff table shows `test_column | COLUMN ADDED | — | VARCHAR`.

- [ ] **Step 8.5: Test the approve flow**

Click "Accept All Changes". Confirm:
- Tab updates to green "Schema matches baseline" state.
- The `test_column` event disappears from the open events.

- [ ] **Step 8.6: Run full backend test suite**

```bash
pytest --cov=app tests/ 2>&1 | tail -15
```

Expected: no regressions; schema drift tests pass.
