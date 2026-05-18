# AI Native Features — Plan C: Predictive Quality & Remediation (Features 7, 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LLM-based predictive data quality (Feature 7) and structured autonomous remediation suggestions (Feature 8).

**Architecture:** Feature 7 uses `DQRuleRun` history fed to the LLM to detect trends and predict risk — no ML training required. Feature 8 generates structured remediation plans using rule type, failure pattern, and a per-rule-type playbook template. Both store results in the existing `AnomalyDetector`/`AnomalyDetection` tables (already in the DB schema). A nightly APScheduler job runs predictions across all active assets.

**Tech Stack:** FastAPI, SQLAlchemy async, existing `LLMProvider.complete()`, `get_provider_from_db()`, APScheduler (already used in `scheduler_service.py`).

**Prerequisite:** Plans A and B must be merged first.

---

## Files Modified

| File | Change |
|---|---|
| `app/services/ai_service.py` | Add `predict_asset_quality()`, `get_at_risk_assets()`, `generate_remediation_plan()` |
| `app/api/ai.py` | Add `POST /ai/assets/{id}/predict-quality`, `GET /ai/assets/at-risk`, `POST /ai/assets/{id}/remediation-plan`, `POST /ai/rules/{id}/remediation-playbook` |
| `app/services/scheduler_service.py` | Add nightly prediction job |

---

### Task 1: Add `predict_asset_quality()` service function

**Files:**
- Modify: `app/services/ai_service.py` — append at end of file

This function fetches the last 60 `DQRuleRun` records for an asset, computes simple trend stats (pass rate trajectory, failure frequency, worst rule), feeds them to the LLM, and returns a risk score + forecast. Results are stored in `AnomalyDetector` (one per asset, `detector_type="llm_predictor"`) and a new `AnomalyDetection` row.

- [ ] **Add `predict_asset_quality()` to `ai_service.py`:**

```python
async def predict_asset_quality(
    asset_id: str,
    provider_name: str | None,
    db: AsyncSession,
) -> dict:
    """
    Predict future data quality risk for an asset using LLM trend analysis on the last 60 runs.
    Stores result in AnomalyDetector + AnomalyDetection and returns the prediction dict.
    """
    import json as _j
    from collections import defaultdict
    from app.db.models import (
        DataAsset, Domain, DQRuleRun, DQRule,
        AnomalyDetector, AnomalyDetection,
    )
    from datetime import timedelta

    asset_res = await db.execute(
        select(DataAsset, Domain)
        .join(Domain, DataAsset.domain_id == Domain.domain_id)
        .where(DataAsset.asset_id == asset_id)
    )
    row = asset_res.one_or_none()
    if not row:
        return {"error": "Asset not found"}
    asset, domain = row.DataAsset, row.Domain

    # Last 60 runs for this asset
    runs_res = await db.execute(
        select(DQRuleRun, DQRule)
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .where(DQRuleRun.asset_id == asset_id)
        .order_by(desc(DQRuleRun.created_at))
        .limit(60)
    )
    runs = runs_res.all()

    if len(runs) < 3:
        return {
            "asset_id": asset_id,
            "risk_score": None,
            "message": "Insufficient run history (need at least 3 runs).",
        }

    # Build trend stats
    scores = [r.DQRuleRun.quality_score for r in runs if r.DQRuleRun.quality_score is not None]
    fail_rates = [r.DQRuleRun.failure_percentage for r in runs if r.DQRuleRun.failure_percentage is not None]
    statuses = [r.DQRuleRun.status for r in runs]
    fail_count = statuses.count("failed") + statuses.count("error")

    # Recent vs older quality — split in half
    half = len(scores) // 2
    recent_avg = sum(scores[:half]) / half if half else 0
    older_avg  = sum(scores[half:]) / (len(scores) - half) if len(scores) - half > 0 else 0
    trend = "improving" if recent_avg > older_avg + 2 else (
            "degrading"  if recent_avg < older_avg - 2 else "stable")

    # Worst rule
    rule_fail: dict[str, int] = defaultdict(int)
    for r in runs:
        if r.DQRuleRun.status == "failed":
            rule_fail[r.DQRule.rule_name] += 1
    worst_rule = max(rule_fail, key=lambda k: rule_fail[k]) if rule_fail else "none"

    # Build per-day quality for last 14 days
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    day_scores: dict[str, list[float]] = defaultdict(list)
    for r in runs:
        if r.DQRuleRun.created_at and r.DQRuleRun.quality_score is not None:
            age = (now - r.DQRuleRun.created_at).days
            if age <= 14:
                day_scores[str(age)].append(r.DQRuleRun.quality_score)
    daily_avg = {
        d: round(sum(v) / len(v), 1) for d, v in sorted(day_scores.items(), key=lambda x: int(x[0]))
    }

    trend_text = (
        f"Asset: {asset.sf_schema_name}.{asset.sf_table_name} (domain: {domain.domain_name})\n"
        f"Total runs analysed: {len(runs)}\n"
        f"Failed/error runs: {fail_count} of {len(runs)} ({100*fail_count//len(runs)}%)\n"
        f"Average quality score (recent {half} runs): {recent_avg:.1f}%\n"
        f"Average quality score (older {len(scores)-half} runs): {older_avg:.1f}%\n"
        f"Trend: {trend}\n"
        f"Most frequently failing rule: {worst_rule} ({rule_fail.get(worst_rule,0)} times)\n"
        f"Daily quality scores (day 0 = today): {daily_avg}\n"
    )

    sys_predict = (
        "You are a data quality analyst. Based on historical quality trends, predict whether "
        "this asset is likely to experience a quality failure in the next 7 days. "
        "Return ONLY valid JSON:\n"
        '{"risk_score": 0.0-1.0, "risk_level": "critical"|"high"|"medium"|"low", '
        '"prediction": "single sentence prediction", '
        '"likely_failure_rule": "rule name or null", '
        '"recommended_preventive_action": "single sentence action", '
        '"confidence": 0.0-1.0}'
    )

    provider = await get_provider_from_db(provider_name, db)
    raw = await provider.complete(trend_text, sys_predict, max_tokens=400)
    try:
        start = raw.find("{"); end = raw.rfind("}") + 1
        prediction = _j.loads(raw[start:end]) if start >= 0 else {}
    except Exception:
        prediction = {"risk_score": 0.5, "risk_level": "medium", "prediction": raw[:200]}

    # Upsert AnomalyDetector for this asset
    detector_res = await db.execute(
        select(AnomalyDetector).where(
            AnomalyDetector.asset_id == asset_id,
            AnomalyDetector.detector_type == "llm_predictor",
        )
    )
    detector = detector_res.scalar_one_or_none()
    from app.db.models import gen_uuid, now as _now
    if not detector:
        detector = AnomalyDetector(
            detector_id=gen_uuid(),
            asset_id=asset_id,
            detector_type="llm_predictor",
            config={"provider": provider_name or "default"},
            is_active=True,
        )
        db.add(detector)
        await db.flush()

    detector.last_trained_at = _now()

    # Store detection result
    detection = AnomalyDetection(
        detection_id=gen_uuid(),
        detector_id=detector.detector_id,
        asset_id=asset_id,
        anomaly_type="quality_forecast",
        severity=prediction.get("risk_level", "medium"),
        observed_value=f"quality_score={recent_avg:.1f}%,trend={trend}",
        expected_range=">=95%",
        confidence=prediction.get("confidence", 0.5),
    )
    db.add(detection)
    await db.commit()

    return {
        "asset_id": asset_id,
        "table": f"{asset.sf_schema_name}.{asset.sf_table_name}",
        "trend": trend,
        "recent_quality_avg": round(recent_avg, 1),
        "runs_analysed": len(runs),
        "prediction": prediction,
    }
```

- [ ] **Verify import chain:**
```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app && python -c "from app.services.ai_service import predict_asset_quality; print('ok')"
```
Expected: `ok`.

- [ ] **Commit:**
```bash
git add app/services/ai_service.py
git commit -m "feat: add predict_asset_quality() — LLM-based 60-run trend analysis stored in AnomalyDetection"
```

---

### Task 2: Add prediction endpoint and at-risk assets list

**Files:**
- Modify: `app/api/ai.py` — add two endpoints

- [ ] **Add both endpoints to `app/api/ai.py`:**

```python
@router.post("/assets/{asset_id}/predict-quality")
@limiter.limit("10/minute")
async def predict_asset_quality(
    request: Request,
    asset_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Predict whether an asset will fail quality checks in the next 7 days.
    Uses LLM trend analysis on the last 60 rule runs.
    """
    try:
        result = await ai_service.predict_asset_quality(
            asset_id, payload.get("provider"), db
        )
        return result
    except RuntimeError as e:
        raise _llm_err(e)


@router.get("/assets/at-risk")
@limiter.limit("5/minute")
async def at_risk_assets(
    request: Request,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Return assets with the highest predicted quality risk, based on stored AnomalyDetection records.
    Does NOT trigger new LLM calls — reads from the last nightly prediction run.
    """
    from sqlalchemy import select, desc
    from app.db.models import AnomalyDetection, AnomalyDetector, DataAsset, Domain

    det_res = await db.execute(
        select(AnomalyDetection, AnomalyDetector, DataAsset, Domain)
        .join(AnomalyDetector, AnomalyDetection.detector_id == AnomalyDetector.detector_id)
        .join(DataAsset, AnomalyDetection.asset_id == DataAsset.asset_id)
        .join(Domain, DataAsset.domain_id == Domain.domain_id)
        .where(
            AnomalyDetector.detector_type == "llm_predictor",
            AnomalyDetection.anomaly_type == "quality_forecast",
            AnomalyDetection.is_acknowledged == False,
        )
        .order_by(desc(AnomalyDetection.detected_at))
        .limit(limit * 3)  # over-fetch to deduplicate per asset
    )
    rows = det_res.all()

    # Keep only latest detection per asset
    seen: set[str] = set()
    results = []
    for r in rows:
        aid = r.AnomalyDetection.asset_id
        if aid in seen:
            continue
        seen.add(aid)
        results.append({
            "asset_id": aid,
            "table": f"{r.DataAsset.sf_schema_name}.{r.DataAsset.sf_table_name}",
            "domain": r.Domain.domain_name,
            "risk_level": r.AnomalyDetection.severity,
            "confidence": r.AnomalyDetection.confidence,
            "observed": r.AnomalyDetection.observed_value,
            "detected_at": str(r.AnomalyDetection.detected_at),
        })
        if len(results) >= limit:
            break

    return {"at_risk_assets": results, "count": len(results)}
```

- [ ] **Commit:**
```bash
git add app/api/ai.py
git commit -m "feat: add POST /ai/assets/{id}/predict-quality and GET /ai/assets/at-risk endpoints"
```

---

### Task 3: Add nightly prediction job to scheduler

**Files:**
- Modify: `app/services/scheduler_service.py` — add `_bg_predict_all_assets()` and register it

The job runs at 02:00 UTC nightly, loops over all active assets, and calls `predict_asset_quality()` for each. Uses `asyncio.sleep` between calls to avoid rate-limiting the LLM.

- [ ] **Append to `app/services/scheduler_service.py`** (before `start_scheduler()` definition):

```python
async def _bg_predict_all_assets() -> None:
    """Nightly job: run LLM quality prediction for all active assets."""
    import asyncio
    _log = logging.getLogger("dq_platform.prediction")
    try:
        from app.db.database import AsyncSessionLocal
        from app.db.models import DataAsset
        from app.services.ai_service import predict_asset_quality
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            assets_res = await db.execute(
                select(DataAsset.asset_id).where(DataAsset.is_active == True).limit(200)
            )
            asset_ids = [r for r in assets_res.scalars().all()]

        _log.info(f"Starting nightly quality prediction for {len(asset_ids)} assets")
        success = 0
        for asset_id in asset_ids:
            try:
                async with AsyncSessionLocal() as db:
                    result = await predict_asset_quality(asset_id, None, db)
                    if "error" not in result:
                        success += 1
            except Exception as exc:
                _log.warning(f"Prediction failed for asset {asset_id}: {exc}")
            await asyncio.sleep(0.5)  # rate limit buffer between LLM calls

        _log.info(f"Nightly prediction complete: {success}/{len(asset_ids)} assets predicted")
    except Exception as exc:
        _log.error(f"Nightly prediction job failed: {exc}")
```

- [ ] **Register the job in `start_scheduler()`** — inside `start_scheduler()`, after the `_bg_evaluate_policies` job registration (look for the block that adds `evaluate_policies` at `00:15`):

```python
    scheduler.add_job(
        _bg_predict_all_assets,
        trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
        id="nightly_quality_prediction",
        replace_existing=True,
        misfire_grace_time=3600,
    )
```

- [ ] **Verify imports compile:**
```bash
python -c "from app.services.scheduler_service import _bg_predict_all_assets; print('ok')"
```
Expected: `ok`.

- [ ] **Commit:**
```bash
git add app/services/scheduler_service.py
git commit -m "feat: add nightly LLM quality prediction job (02:00 UTC) across all active assets"
```

---

### Task 4: Add structured remediation plan generation

**Files:**
- Modify: `app/services/ai_service.py` — add `generate_remediation_plan()`
- Modify: `app/api/ai.py` — add `POST /ai/assets/{asset_id}/remediation-plan`

Generates a structured, prioritised remediation plan for an asset based on its recent failures. Each step includes: action, priority, owner_role, estimated_effort. Uses a per-rule-type playbook template as a hint in the prompt so the LLM produces practical, actionable steps rather than generic advice.

- [ ] **Add `generate_remediation_plan()` to `ai_service.py`:**

```python
# Playbook hints per rule type — injected into the LLM prompt to guide practical suggestions
_REMEDIATION_HINTS: dict[str, str] = {
    "null_check":                "Check upstream ETL for missing field mappings. Verify NOT NULL constraints in source system.",
    "uniqueness_check":          "Identify duplicate ingestion pipelines. Check deduplication logic in ETL. Add QUALIFY ROW_NUMBER() dedup.",
    "freshness_check":           "Verify upstream ETL job completion. Check scheduler logs. Confirm data pipeline SLA.",
    "volume_check":              "Compare row counts to yesterday. Check for upstream truncation, filter changes, or source extraction failures.",
    "regex_check":               "Audit source system for format changes. Add input validation at ingestion. Quarantine malformed records.",
    "range_check":               "Check for unit changes (e.g., cents vs dollars). Look for outliers or data entry errors in source.",
    "accepted_values_check":     "Update accepted values list if business expanded it. Check source enum changes. Alert source system owner.",
    "referential_integrity_check": "Investigate orphaned records. Check if parent records were deleted. Add cascading delete or soft delete.",
    "business_rule_check":       "Review business rule definition for accuracy. Check if business process changed. Engage business owner.",
    "schema_drift_check":        "Compare current schema to baseline. Identify who altered the table. Restore missing columns or update baseline.",
    "distribution_consistency_check": "Check for seasonality effects. Compare to same period last year. Investigate upstream data source changes.",
    "semantic_consistency_check": "Audit cross-column business logic. Check for upstream field reuse or misalignment.",
    "custom_sql_check":          "Review custom SQL logic against current data model. Check for schema changes that invalidate the query.",
    "llm_semantic_check":        "Review the LLM validation prompt for accuracy. Sample failing rows to understand pattern.",
}


async def generate_remediation_plan(
    asset_id: str,
    provider_name: str | None,
    db: AsyncSession,
) -> dict:
    """
    Generate a structured, prioritised remediation plan for an asset's recent failures.
    Returns {steps: [{action, rule_name, rule_type, priority, owner_role, estimated_effort}], summary}.
    """
    import json as _j
    from app.db.models import DataAsset, DQRule, DQRuleRun, Domain

    asset_res = await db.execute(
        select(DataAsset, Domain)
        .join(Domain, DataAsset.domain_id == Domain.domain_id)
        .where(DataAsset.asset_id == asset_id)
    )
    row = asset_res.one_or_none()
    if not row:
        return {"error": "Asset not found"}
    asset, domain = row.DataAsset, row.Domain

    # Last 30 failed runs for this asset
    failed_res = await db.execute(
        select(DQRuleRun, DQRule)
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .where(DQRuleRun.asset_id == asset_id, DQRuleRun.status.in_(["failed", "error"]))
        .order_by(desc(DQRuleRun.created_at))
        .limit(30)
    )
    failed_runs = failed_res.all()

    if not failed_runs:
        return {
            "asset_id": asset_id,
            "steps": [],
            "summary": "No recent failures found — asset appears healthy.",
        }

    # Deduplicate by rule, keep worst failure
    by_rule: dict[str, dict] = {}
    for r in failed_runs:
        rid = r.DQRule.rule_id
        if rid not in by_rule or (r.DQRuleRun.failure_percentage or 0) > by_rule[rid]["failure_pct"]:
            by_rule[rid] = {
                "rule_name": r.DQRule.rule_name,
                "rule_type": r.DQRule.rule_type,
                "severity": r.DQRule.severity,
                "failure_pct": r.DQRuleRun.failure_percentage or 0,
                "failed_rows": r.DQRuleRun.failed_rows_count or 0,
                "error_message": r.DQRuleRun.error_message or "",
                "hint": _REMEDIATION_HINTS.get(r.DQRule.rule_type, "Review rule logic and source data."),
            }

    failures_text = "\n".join(
        f"- {v['rule_name']} ({v['rule_type']}, severity={v['severity']}): "
        f"{v['failure_pct']:.1f}% failed, {v['failed_rows']} rows. "
        f"Playbook hint: {v['hint']}"
        for v in by_rule.values()
    )

    sys_remed = (
        "You are a data engineering expert. Generate a structured remediation plan for data quality failures. "
        "Return ONLY valid JSON:\n"
        '{"steps": [{"action": "...", "rule_name": "...", "rule_type": "...", '
        '"priority": "critical"|"high"|"medium"|"low", "owner_role": "...", '
        '"estimated_effort": "..."}], '
        '"summary": "2-sentence executive summary of what broke and what to do"}'
    )
    prompt = (
        f"Asset: {asset.sf_schema_name}.{asset.sf_table_name} "
        f"(domain: {domain.domain_name}, criticality: {asset.criticality})\n\n"
        f"Recent failures ({len(by_rule)} distinct rules):\n{failures_text}\n\n"
        f"Generate a prioritised remediation plan."
    )

    provider = await get_provider_from_db(provider_name, db)
    raw = await provider.complete(prompt, sys_remed, max_tokens=1200)
    try:
        start = raw.find("{"); end = raw.rfind("}") + 1
        plan = _j.loads(raw[start:end]) if start >= 0 else {}
    except Exception:
        plan = {"steps": [], "summary": raw[:300]}

    return {
        "asset_id": asset_id,
        "table": f"{asset.sf_schema_name}.{asset.sf_table_name}",
        "failures_analysed": len(by_rule),
        "steps": plan.get("steps", []),
        "summary": plan.get("summary", ""),
    }
```

- [ ] **Add endpoint to `app/api/ai.py`:**

```python
@router.post("/assets/{asset_id}/remediation-plan")
@limiter.limit("10/minute")
async def asset_remediation_plan(
    request: Request,
    asset_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Generate a structured, prioritised remediation plan for an asset's recent quality failures.
    Each step includes: action, rule_name, rule_type, priority, owner_role, estimated_effort.
    """
    try:
        plan = await ai_service.generate_remediation_plan(
            asset_id, payload.get("provider"), db
        )
        return plan
    except RuntimeError as e:
        raise _llm_err(e)
```

- [ ] **Commit:**
```bash
git add app/services/ai_service.py app/api/ai.py
git commit -m "feat: add generate_remediation_plan() and POST /ai/assets/{id}/remediation-plan with per-rule-type playbook hints"
```

---

### Task 5: Add per-rule remediation playbook endpoint

**Files:**
- Modify: `app/api/ai.py` — add `POST /ai/rules/{rule_id}/remediation-playbook`

Given a specific rule, generates a focused remediation playbook for that rule's type and failure history. Simpler than the asset-level plan — one rule, deep focus.

- [ ] **Add endpoint to `app/api/ai.py`:**

```python
@router.post("/rules/{rule_id}/remediation-playbook")
@limiter.limit("20/minute")
async def rule_remediation_playbook(
    request: Request,
    rule_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Generate a focused remediation playbook for a specific rule, using its failure history
    and a rule-type-specific hint from the internal playbook.
    """
    from sqlalchemy import select, desc
    from app.db.models import DQRule, DQRuleRun, DataAsset
    from app.services.llm_providers import get_provider_from_db
    from app.services.ai_service import _REMEDIATION_HINTS, _SYS_JSON_ONLY
    import json as _j

    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = rule_res.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == rule.asset_id))
    asset = asset_res.scalar_one_or_none()

    # Last 20 runs for this rule
    runs_res = await db.execute(
        select(DQRuleRun)
        .where(DQRuleRun.rule_id == rule_id)
        .order_by(desc(DQRuleRun.created_at))
        .limit(20)
    )
    runs = runs_res.scalars().all()
    fail_pcts = [r.failure_percentage for r in runs if r.failure_percentage is not None]
    avg_fail  = sum(fail_pcts) / len(fail_pcts) if fail_pcts else 0
    fail_count = sum(1 for r in runs if r.status in ("failed", "error"))

    hint = _REMEDIATION_HINTS.get(rule.rule_type, "Review rule logic and source data quality.")

    sys_play = (
        "You are a data engineering expert. Generate a 3-5 step remediation playbook "
        "for a specific data quality rule. Each step must be concrete and actionable. "
        "Return ONLY valid JSON:\n"
        '{"playbook_title": "...", "steps": [{"step": N, "action": "...", '
        '"who": "...", "how": "...", "done_when": "..."}], '
        '"prevention_tip": "single sentence on how to prevent recurrence"}'
    )
    prompt = (
        f"Rule: {rule.rule_name}\n"
        f"Type: {rule.rule_type}\n"
        f"Severity: {rule.severity}\n"
        f"Column: {rule.target_column or 'N/A'}\n"
        f"Table: {asset.sf_table_name if asset else rule.asset_id}\n"
        f"Description: {rule.rule_description or 'N/A'}\n"
        f"Last {len(runs)} runs: {fail_count} failed, avg failure rate {avg_fail:.1f}%\n"
        f"Rule config: {rule.rule_config}\n"
        f"Playbook hint: {hint}\n\n"
        f"Generate a specific remediation playbook for this rule."
    )

    try:
        provider = await get_provider_from_db(payload.get("provider"), db)
        raw = await provider.complete(prompt, sys_play, max_tokens=900)
        start = raw.find("{"); end = raw.rfind("}") + 1
        playbook = _j.loads(raw[start:end]) if start >= 0 else {}
    except Exception as e:
        raise HTTPException(503, f"LLM error: {e}")

    return {
        "rule_id": rule_id,
        "rule_name": rule.rule_name,
        "rule_type": rule.rule_type,
        "playbook": playbook,
    }
```

- [ ] **Commit:**
```bash
git add app/api/ai.py
git commit -m "feat: add POST /ai/rules/{id}/remediation-playbook with type-specific playbook hints"
```

---

### Task 6: Final verification — all Plan C endpoints

- [ ] **Start the server:**
```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
uvicorn app.main:app --port 8000 &
sleep 5
```

- [ ] **Verify all new routes registered:**
```bash
curl -s http://localhost:8000/openapi.json | python3 -c "
import json, sys
paths = json.load(sys.stdin)['paths']
targets = [
    '/ai/assets/{asset_id}/predict-quality',
    '/ai/assets/at-risk',
    '/ai/assets/{asset_id}/remediation-plan',
    '/ai/rules/{rule_id}/remediation-playbook',
]
for t in targets:
    print(t, '✅' if t in paths else '❌ MISSING')
"
```
Expected: all four `✅`.

- [ ] **Verify nightly prediction job registered:**
```bash
python -c "
from app.services.scheduler_service import scheduler
from app.services.scheduler_service import start_scheduler
start_scheduler()
jobs = [j.id for j in scheduler.get_jobs()]
print('nightly_quality_prediction' in jobs)
"
```
Expected: `True`.

- [ ] **Final commit:**
```bash
git add .
git commit -m "feat: Plan C complete — predictive quality, at-risk assets, nightly job, remediation plans"
```
