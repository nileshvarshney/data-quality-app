# AI Native Features — Plan B: Enhanced Analysis & Documentation (Features 4, 5, 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich RCA with cross-run patterns (Feature 4), add AI documentation generation for assets and columns (Feature 5), and build the AI Steward Assistant (Feature 6).

**Architecture:** All changes are backend-only (`app/services/ai_service.py`, `app/api/ai.py`). Existing DB fields absorb all AI output — `DataAsset.table_description`, `ColumnMetadata.description`, `PolicyViolation.violation_detail`. No migrations required.

**Tech Stack:** FastAPI, SQLAlchemy async, existing `LLMProvider.complete()`, `get_provider_from_db()`.

**Prerequisite:** Plan A must be merged first (adds `gather_governance_context()` needed by Feature 6).

---

## Files Modified

| File | Change |
|---|---|
| `app/services/ai_service.py` | Add `enrich_rca()`, `generate_asset_description()`, `generate_column_docs()`, `suggest_glossary_terms()`, `get_steward_review_queue()`, `suggest_violation_resolution()` |
| `app/api/ai.py` | Update `trigger_rca`, add `/ai/assets/{id}/generate-description`, `/ai/assets/{id}/generate-column-docs`, `/ai/glossary/suggest-terms`, `/ai/governance/review-queue`, `/ai/governance/violations/{id}/suggest-resolution` |

---

### Task 1: Enrich RCA with cross-run trend data

**Files:**
- Modify: `app/api/ai.py` — replace `trigger_rca` body (lines 327–380)

The current RCA only uses one run's data. We fetch the last 30 runs for the same rule and add day-of-week / hour-of-day pattern analysis to the LLM prompt.

- [ ] **Replace `trigger_rca` with the enriched version:**

```python
@router.post("/rca/{run_id}")
async def trigger_rca(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Root Cause Analysis for a failed run — includes 30-run trend and cross-asset correlation."""
    from sqlalchemy import select, desc, func
    from app.db.models import DQRuleRun, DQRule, DataAsset, DQAlert
    from app.services.llm_providers import get_provider_from_db
    import json as _j
    from collections import Counter

    run_res = await db.execute(select(DQRuleRun).where(DQRuleRun.run_id == run_id))
    run = run_res.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")

    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == run.rule_id))
    rule = rule_res.scalar_one_or_none()

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == run.asset_id))
    asset = asset_res.scalar_one_or_none()

    # Last 30 runs for same rule (trend analysis)
    hist_res = await db.execute(
        select(DQRuleRun)
        .where(DQRuleRun.rule_id == run.rule_id)
        .order_by(desc(DQRuleRun.created_at))
        .limit(30)
    )
    history = hist_res.scalars().all()
    fail_pcts = [r.failure_percentage for r in history if r.failure_percentage is not None]
    fail_statuses = Counter(r.status for r in history)
    # Day-of-week pattern: which days had failures?
    fail_days = Counter(
        r.created_at.strftime("%A") for r in history if r.status == "failed" and r.created_at
    )
    # Hour-of-day pattern
    fail_hours = Counter(
        r.created_at.hour for r in history if r.status == "failed" and r.created_at
    )
    trend_summary = (
        f"Last {len(history)} runs: {fail_statuses.get('passed',0)} passed, "
        f"{fail_statuses.get('failed',0)} failed, {fail_statuses.get('error',0)} errors. "
        f"Avg failure %: {sum(fail_pcts)/len(fail_pcts):.1f}% across {len(fail_pcts)} runs. "
        f"Most failures on: {fail_days.most_common(2)}. "
        f"Peak failure hours: {fail_hours.most_common(2)}."
    ) if history else "No run history available."

    # Sibling asset failures in same domain ±2h
    from datetime import timedelta
    window = timedelta(hours=2)
    sibling_res = await db.execute(
        select(func.count(DQRuleRun.run_id))
        .where(
            DQRuleRun.domain_id == run.domain_id,
            DQRuleRun.status == "failed",
            DQRuleRun.asset_id != run.asset_id,
            DQRuleRun.created_at >= (run.created_at - window),
            DQRuleRun.created_at <= (run.created_at + window),
        )
    )
    sibling_failures = sibling_res.scalar() or 0

    # Build enriched context
    context = (
        f"Rule: {rule.rule_name if rule else run.rule_id}\n"
        f"Rule type: {rule.rule_type if rule else 'unknown'}\n"
        f"Severity: {rule.severity if rule else 'unknown'}\n"
        f"Table: {asset.sf_table_name if asset else run.asset_id}\n"
        f"Domain: {asset.sf_schema_name if asset else 'unknown'}\n"
        f"Failed rows: {run.failed_rows_count} / {run.total_rows_scanned} "
        f"({run.failure_percentage:.1f}%)\n"
        f"Error message: {run.error_message or 'none'}\n"
        f"Executed SQL: {(run.executed_sql or '')[:400]}\n"
        f"--- Historical trend ---\n{trend_summary}\n"
        f"Sibling asset failures in same domain ±2h: {sibling_failures}\n"
    )

    sys_rca = (
        "You are a data engineering expert. Analyse the data quality failure. "
        "Consider the historical trend and sibling failures when identifying the root cause. "
        "Return ONLY valid JSON with these fields:\n"
        "root_cause (string), explanation (string), confidence (0.0-1.0), "
        "contributing_factors (list of strings), "
        "recommended_action (object with: step string, priority 'critical'|'high'|'medium'|'low', "
        "owner_role string, estimated_effort string), "
        "pattern_detected (string or null — describe any day/time pattern)"
    )

    try:
        provider = await get_provider_from_db(None, db)
        raw = await provider.complete(context, system=sys_rca, max_tokens=900)
        start = raw.find("{"); end = raw.rfind("}") + 1
        rca = _j.loads(raw[start:end]) if start >= 0 else {
            "root_cause": "Analysis unavailable", "explanation": raw
        }
    except Exception as e:
        rca = {"root_cause": "LLM unavailable", "explanation": str(e), "confidence": 0}

    return {
        "run_id": run_id,
        "rule_id": run.rule_id,
        "asset_id": run.asset_id,
        "trend_summary": trend_summary,
        "sibling_failures_in_window": sibling_failures,
        "rca": rca,
    }
```

- [ ] **Verify Python syntax:**
```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app && python -c "from app.api.ai import router; print('ok')"
```
Expected: `ok`.

- [ ] **Commit:**
```bash
git add app/api/ai.py
git commit -m "feat: enrich RCA with 30-run trend, day/hour patterns, and sibling domain failure correlation"
```

---

### Task 2: Add asset description generation endpoint

**Files:**
- Modify: `app/services/ai_service.py` — add `generate_asset_description()`
- Modify: `app/api/ai.py` — add `POST /ai/assets/{asset_id}/generate-description`

Uses `ColumnMetadata` stats (data types, cardinality, sample values, profiling) and the table name to generate a business-friendly description, then saves it to `DataAsset.table_description`.

- [ ] **Add `generate_asset_description()` to `ai_service.py`** — append at the end of the file:

```python
async def generate_asset_description(
    asset_id: str,
    provider_name: str | None,
    db: AsyncSession,
) -> str:
    """
    Generate a business-friendly table description using column metadata and profiling stats.
    Saves the result to DataAsset.table_description and returns it.
    """
    from app.db.models import DataAsset, ColumnMetadata, Domain, Subdomain

    asset_res = await db.execute(
        select(DataAsset, Domain, Subdomain)
        .join(Domain, DataAsset.domain_id == Domain.domain_id)
        .join(Subdomain, DataAsset.subdomain_id == Subdomain.subdomain_id)
        .where(DataAsset.asset_id == asset_id)
    )
    row = asset_res.one_or_none()
    if not row:
        return "Asset not found."
    asset, domain, subdomain = row.DataAsset, row.Domain, row.Subdomain

    cols_res = await db.execute(
        select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id).limit(50)
    )
    cols = cols_res.scalars().all()

    col_lines = []
    for c in cols:
        line = f"- {c.column_name} ({c.data_type or 'unknown'})"
        if c.cardinality_pct is not None:
            line += f", cardinality {c.cardinality_pct:.0f}%"
        if c.sample_values:
            line += f", samples: {c.sample_values[:80]}"
        col_lines.append(line)

    sys_doc = (
        "You are a data governance expert. Write a concise 2-4 sentence business description "
        "for a Snowflake table. Describe what business data it contains, who likely uses it, "
        "and what it is useful for. Do NOT mention column names directly. Write for a business audience."
    )
    prompt = (
        f"Table: {asset.sf_schema_name}.{asset.sf_table_name}\n"
        f"Domain: {domain.domain_name} > {subdomain.subdomain_name}\n"
        f"Owner: {asset.owner_name or 'unknown'}\n"
        f"Criticality: {asset.criticality}\n"
        f"Columns ({len(cols)}):\n" + "\n".join(col_lines[:30])
    )

    provider = await get_provider_from_db(provider_name, db)
    description = await provider.complete(prompt, sys_doc, max_tokens=300)
    description = description.strip()

    # Persist to asset
    asset.table_description = description
    await db.commit()
    return description
```

- [ ] **Add endpoint to `app/api/ai.py`:**

```python
@router.post("/assets/{asset_id}/generate-description")
@limiter.limit("20/minute")
async def generate_asset_description(
    request: Request,
    asset_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Generate and save a business description for a data asset using its column metadata."""
    try:
        description = await ai_service.generate_asset_description(
            asset_id, payload.get("provider"), db
        )
        return {"asset_id": asset_id, "description": description}
    except RuntimeError as e:
        raise _llm_err(e)
```

- [ ] **Verify:**
```bash
python -c "from app.services.ai_service import generate_asset_description; print('ok')"
```

- [ ] **Commit:**
```bash
git add app/services/ai_service.py app/api/ai.py
git commit -m "feat: add generate_asset_description() and POST /ai/assets/{id}/generate-description"
```

---

### Task 3: Add column documentation generation endpoint

**Files:**
- Modify: `app/services/ai_service.py` — add `generate_column_docs()`
- Modify: `app/api/ai.py` — add `POST /ai/assets/{asset_id}/generate-column-docs`

Generates a description for every column on an asset using profiling stats, then persists each to `ColumnMetadata.description`. Returns a summary of how many columns were documented.

- [ ] **Add `generate_column_docs()` to `ai_service.py`:**

```python
async def generate_column_docs(
    asset_id: str,
    provider_name: str | None,
    db: AsyncSession,
) -> dict:
    """
    Generate business descriptions for all columns on an asset using profiling stats.
    Saves to ColumnMetadata.description. Returns {documented: N, skipped: N}.
    """
    from app.db.models import DataAsset, ColumnMetadata

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        return {"error": "Asset not found"}

    cols_res = await db.execute(
        select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id)
    )
    cols = cols_res.scalars().all()
    if not cols:
        return {"documented": 0, "skipped": 0, "message": "No column metadata — run profiling first"}

    # Build one prompt for all columns to minimise LLM calls
    col_lines = "\n".join(
        f"{c.column_name} ({c.data_type or '?'})"
        + (f" — samples: {c.sample_values[:60]}" if c.sample_values else "")
        + (f", {c.cardinality_pct:.0f}% unique" if c.cardinality_pct is not None else "")
        for c in cols
    )
    sys_col = (
        "You are a data governance expert. Write a concise 1-sentence business description "
        "for each column in the list. Describe what the column stores in plain English. "
        "Return ONLY a JSON object mapping column_name → description string."
    )
    prompt = (
        f"Table: {asset.sf_schema_name}.{asset.sf_table_name}\n"
        f"Columns:\n{col_lines}"
    )

    import json as _j
    provider = await get_provider_from_db(provider_name, db)
    raw = await provider.complete(prompt, sys_col, max_tokens=1200)
    try:
        start = raw.find("{"); end = raw.rfind("}") + 1
        col_map: dict[str, str] = _j.loads(raw[start:end]) if start >= 0 else {}
    except Exception:
        col_map = {}

    documented = 0
    skipped = 0
    col_by_name = {c.column_name: c for c in cols}
    for col_name, desc in col_map.items():
        if col_name in col_by_name and desc:
            col_by_name[col_name].description = str(desc).strip()
            documented += 1
        else:
            skipped += 1
    await db.commit()
    return {"asset_id": asset_id, "documented": documented, "skipped": skipped}
```

- [ ] **Add endpoint to `app/api/ai.py`:**

```python
@router.post("/assets/{asset_id}/generate-column-docs")
@limiter.limit("10/minute")
async def generate_column_docs(
    request: Request,
    asset_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Generate and save column descriptions for all columns on a data asset."""
    try:
        result = await ai_service.generate_column_docs(
            asset_id, payload.get("provider"), db
        )
        return result
    except RuntimeError as e:
        raise _llm_err(e)
```

- [ ] **Commit:**
```bash
git add app/services/ai_service.py app/api/ai.py
git commit -m "feat: add generate_column_docs() and POST /ai/assets/{id}/generate-column-docs"
```

---

### Task 4: Add glossary term suggestion endpoint

**Files:**
- Modify: `app/services/ai_service.py` — add `suggest_glossary_terms()`
- Modify: `app/api/ai.py` — add `POST /ai/glossary/suggest-terms`

Pulls existing table names, domain names, and any existing glossary terms, then asks the LLM to suggest new business terms worth defining.

- [ ] **Add `suggest_glossary_terms()` to `ai_service.py`:**

```python
async def suggest_glossary_terms(
    domain_id: str | None,
    provider_name: str | None,
    db: AsyncSession,
) -> list[dict]:
    """
    Suggest new glossary terms based on asset names, column names, and existing terms.
    Returns a list of {term_name, definition, domain, examples} dicts.
    """
    from app.db.models import DataAsset, Domain, GlossaryTerm, ColumnMetadata

    # Existing terms to avoid duplicates
    existing_res = await db.execute(select(GlossaryTerm.term_name).limit(100))
    existing = {r for r in existing_res.scalars().all()}

    # Asset + column context
    asset_q = select(DataAsset, Domain).join(Domain, DataAsset.domain_id == Domain.domain_id)
    if domain_id:
        asset_q = asset_q.where(DataAsset.domain_id == domain_id)
    asset_res = await db.execute(asset_q.limit(30))
    asset_rows = asset_res.all()

    asset_lines = [
        f"- {r.DataAsset.sf_table_name} (domain: {r.Domain.domain_name})"
        for r in asset_rows
    ]

    existing_text = ", ".join(sorted(existing)[:30]) if existing else "None"

    sys_glossary = (
        "You are a data governance expert. Suggest 5-8 new business glossary terms based on "
        "the data asset names provided. Each term should be a business concept that a non-technical "
        "stakeholder would want defined. Return ONLY a JSON array: "
        '[{"term_name": "...", "definition": "...", "domain": "...", "examples": "..."}]'
    )
    prompt = (
        f"Data assets:\n" + "\n".join(asset_lines) +
        f"\n\nExisting glossary terms (do not duplicate): {existing_text}\n\n"
        f"Suggest new terms for the business glossary."
    )

    import json as _j
    provider = await get_provider_from_db(provider_name, db)
    raw = await provider.complete(prompt, sys_glossary, max_tokens=1000)
    try:
        start = raw.find("["); end = raw.rfind("]") + 1
        return _j.loads(raw[start:end]) if start >= 0 else []
    except Exception:
        return []
```

- [ ] **Add endpoint to `app/api/ai.py`:**

```python
@router.post("/glossary/suggest-terms")
@limiter.limit("10/minute")
async def suggest_glossary_terms(
    request: Request,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Suggest new business glossary terms based on registered data assets.
    Optional body: {domain_id?: str, provider?: str}
    """
    try:
        terms = await ai_service.suggest_glossary_terms(
            payload.get("domain_id"), payload.get("provider"), db
        )
        return {"suggestions": terms, "count": len(terms)}
    except RuntimeError as e:
        raise _llm_err(e)
```

- [ ] **Commit:**
```bash
git add app/services/ai_service.py app/api/ai.py
git commit -m "feat: add suggest_glossary_terms() and POST /ai/glossary/suggest-terms"
```

---

### Task 5: Add AI Steward review queue

**Files:**
- Modify: `app/services/ai_service.py` — add `get_steward_review_queue()`
- Modify: `app/api/ai.py` — add `GET /ai/governance/review-queue`

Returns an AI-prioritised list of governance actions: open violations (ranked by severity and age) and pending rule approvals (ranked by rule severity), each with a suggested action from the LLM.

- [ ] **Add `get_steward_review_queue()` to `ai_service.py`:**

```python
async def get_steward_review_queue(
    provider_name: str | None,
    db: AsyncSession,
) -> dict:
    """
    Return an AI-prioritised governance review queue with suggested actions for each item.
    """
    import json as _j
    from app.db.models import GovernancePolicy, PolicyViolation, DQRule, DataAsset, Domain

    # Top 10 open violations
    viol_res = await db.execute(
        select(PolicyViolation, GovernancePolicy)
        .join(GovernancePolicy, PolicyViolation.policy_id == GovernancePolicy.policy_id)
        .where(PolicyViolation.status == "open")
        .order_by(
            GovernancePolicy.severity.desc(),
            PolicyViolation.detected_at.asc(),  # oldest first
        )
        .limit(10)
    )
    violations = [
        {
            "violation_id": r.PolicyViolation.violation_id,
            "policy_name": r.GovernancePolicy.policy_name,
            "severity": r.GovernancePolicy.severity,
            "detail": r.PolicyViolation.violation_detail,
            "detected_at": str(r.PolicyViolation.detected_at),
            "entity_type": r.PolicyViolation.entity_type,
        }
        for r in viol_res.all()
    ]

    # Top 10 pending rule approvals
    pending_res = await db.execute(
        select(DQRule, DataAsset, Domain)
        .join(DataAsset, DQRule.asset_id == DataAsset.asset_id)
        .join(Domain, DQRule.domain_id == Domain.domain_id)
        .where(DQRule.status == "pending_review", DQRule.is_active == True)
        .order_by(DQRule.severity.desc())
        .limit(10)
    )
    pending = [
        {
            "rule_id": r.DQRule.rule_id,
            "rule_name": r.DQRule.rule_name,
            "rule_type": r.DQRule.rule_type,
            "severity": r.DQRule.severity,
            "table": f"{r.DataAsset.sf_schema_name}.{r.DataAsset.sf_table_name}",
            "domain": r.Domain.domain_name,
            "created_by": r.DQRule.created_by,
            "description": r.DQRule.rule_description,
        }
        for r in pending_res.all()
    ]

    if not violations and not pending:
        return {"violations": [], "pending_approvals": [], "summary": "No items require attention."}

    sys_queue = (
        "You are a data governance assistant. Given a list of open policy violations and "
        "pending rule approvals, provide a brief suggested action for each item. "
        "Return ONLY valid JSON: "
        '{"violation_actions": {"<violation_id>": "<action>"}, '
        '"approval_actions": {"<rule_id>": "<action>"}, '
        '"priority_summary": "<2 sentence summary of what to do first>"}'
    )
    prompt = (
        f"Open violations ({len(violations)}):\n{_j.dumps(violations, default=str)}\n\n"
        f"Pending approvals ({len(pending)}):\n{_j.dumps(pending, default=str)}"
    )
    provider = await get_provider_from_db(provider_name, db)
    raw = await provider.complete(prompt, sys_queue, max_tokens=1000)
    try:
        start = raw.find("{"); end = raw.rfind("}") + 1
        ai_actions = _j.loads(raw[start:end]) if start >= 0 else {}
    except Exception:
        ai_actions = {}

    return {
        "violations": violations,
        "pending_approvals": pending,
        "ai_actions": ai_actions,
        "summary": ai_actions.get("priority_summary", ""),
    }
```

- [ ] **Add endpoint to `app/api/ai.py`:**

```python
@router.get("/governance/review-queue")
@limiter.limit("20/minute")
async def steward_review_queue(
    request: Request,
    provider: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    AI-prioritised governance review queue: open violations + pending rule approvals
    with suggested actions for each item.
    """
    try:
        return await ai_service.get_steward_review_queue(provider, db)
    except RuntimeError as e:
        raise _llm_err(e)
```

- [ ] **Commit:**
```bash
git add app/services/ai_service.py app/api/ai.py
git commit -m "feat: add get_steward_review_queue() and GET /ai/governance/review-queue with AI-prioritised actions"
```

---

### Task 6: Add violation resolution suggestion endpoint

**Files:**
- Modify: `app/services/ai_service.py` — add `suggest_violation_resolution()`
- Modify: `app/api/ai.py` — add `POST /ai/governance/violations/{violation_id}/suggest-resolution`

Given a specific violation, fetches its policy and entity context, then drafts a resolution note the steward can use directly.

- [ ] **Add `suggest_violation_resolution()` to `ai_service.py`:**

```python
async def suggest_violation_resolution(
    violation_id: str,
    provider_name: str | None,
    db: AsyncSession,
) -> str:
    """
    Draft a resolution note for a policy violation.
    Returns a ready-to-use resolution text the steward can approve or edit.
    """
    from app.db.models import PolicyViolation, GovernancePolicy, DataAsset, Domain

    viol_res = await db.execute(
        select(PolicyViolation, GovernancePolicy)
        .join(GovernancePolicy, PolicyViolation.policy_id == GovernancePolicy.policy_id)
        .where(PolicyViolation.violation_id == violation_id)
    )
    row = viol_res.one_or_none()
    if not row:
        return "Violation not found."
    violation, policy = row.PolicyViolation, row.GovernancePolicy

    entity_context = ""
    if violation.entity_type == "asset" and violation.entity_id:
        asset_res = await db.execute(
            select(DataAsset, Domain)
            .join(Domain, DataAsset.domain_id == Domain.domain_id)
            .where(DataAsset.asset_id == violation.entity_id)
        )
        asset_row = asset_res.one_or_none()
        if asset_row:
            entity_context = (
                f"Asset: {asset_row.DataAsset.sf_table_name} "
                f"(Domain: {asset_row.Domain.domain_name}, "
                f"Owner: {asset_row.DataAsset.owner_email or 'unknown'})"
            )

    sys_res = (
        "You are a data governance steward. Draft a concise, professional resolution note "
        "for a governance policy violation. The note should: (1) acknowledge the violation, "
        "(2) state the corrective action taken or to be taken, "
        "(3) indicate timeline for resolution. "
        "Write in first-person active voice. 2-4 sentences maximum."
    )
    prompt = (
        f"Policy: {policy.policy_name} (type: {policy.policy_type}, severity: {policy.severity})\n"
        f"Violation detail: {violation.violation_detail or 'Not specified'}\n"
        f"Entity: {entity_context or violation.entity_id}\n"
        f"Detected: {violation.detected_at}\n\n"
        f"Draft a resolution note for this violation."
    )
    provider = await get_provider_from_db(provider_name, db)
    return await provider.complete(prompt, sys_res, max_tokens=300)
```

- [ ] **Add endpoint to `app/api/ai.py`:**

```python
@router.post("/governance/violations/{violation_id}/suggest-resolution")
@limiter.limit("20/minute")
async def suggest_violation_resolution(
    request: Request,
    violation_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Draft a professional resolution note for a governance policy violation."""
    try:
        resolution = await ai_service.suggest_violation_resolution(
            violation_id, payload.get("provider"), db
        )
        return {"violation_id": violation_id, "suggested_resolution": resolution}
    except RuntimeError as e:
        raise _llm_err(e)
```

- [ ] **Verify all new routes:**
```bash
python -c "from app.api.ai import router; paths=[r.path for r in router.routes]; print('\n'.join(p for p in paths if 'governance' in p or 'generate' in p or 'glossary' in p))"
```
Expected output includes: `/ai/governance/review-queue`, `/ai/governance/violations/{violation_id}/suggest-resolution`, `/ai/assets/{asset_id}/generate-description`, `/ai/assets/{asset_id}/generate-column-docs`, `/ai/glossary/suggest-terms`.

- [ ] **Commit:**
```bash
git add app/services/ai_service.py app/api/ai.py
git commit -m "feat: Plan B complete — enriched RCA, asset/column doc generation, glossary suggestions, steward review queue"
```
