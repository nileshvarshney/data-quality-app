# AI Native Features — Plan A: Gap Closures (Features 1, 2, 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close remaining gaps in AI Governance Copilot (Feature 1), Natural Language Rule Authoring (Feature 2), and AI Incident Explanation (Feature 3).

**Architecture:** All backend changes are confined to `app/services/ai_service.py`, `app/api/ai.py`, and `app/services/execution_service.py`. No new tables or migrations are required — `DQRuleRun.ai_explanation` already exists, `QualityIncident.rca_report` already exists. Each task adds a new function or endpoint following the existing patterns exactly.

**Tech Stack:** FastAPI, SQLAlchemy async, existing `LLMProvider` interface (`provider.complete(prompt, system, max_tokens)`), `get_provider_from_db()` factory.

---

## Files Modified

| File | Change |
|---|---|
| `app/services/ai_service.py` | Add `GOVERNANCE_SYSTEM` prompt, `gather_governance_context()`, `explain_incident()`, `refine_nl_rule()` |
| `app/api/ai.py` | Add `/ai/chat/governance` endpoint, `/ai/incidents/{id}/explain` endpoint, update `/ai/rules/from-natural-language` to accept `prior_result` |
| `app/services/execution_service.py` | Wire `llm_semantic_check` to call LLM during execution |

---

### Task 1: Add governance-specific system prompt and context gatherer

**Files:**
- Modify: `app/services/ai_service.py` (after `PLATFORM_SYSTEM`, around line 34)

The current `PLATFORM_SYSTEM` is generic. Governance teams need answers about policy violations, approval queues, rule certification, and compliance. Add a focused prompt and a context function that pulls live governance data.

- [ ] **Add `GOVERNANCE_SYSTEM` prompt and `gather_governance_context()` function** — insert after line 63 (`_SYS_JSON_ONLY = ...`):

```python
GOVERNANCE_SYSTEM = """You are DQ Governance Advisor — an AI assistant for data stewards and governance teams.

PLATFORM: Snowflake data quality platform with governance policies, rule approvals, policy violations, and compliance tracking.

YOUR ROLE: Help governance teams prioritise work, understand violations, suggest resolutions, and review rule changes.

RULES:
1. Answer only from the live context provided — never invent policy names or violation counts.
2. Lead with actionable recommendations, not observations.
3. Use ### headings for multi-part answers.
4. Be direct. No filler.

FORMAT:
- **Bold** policy names, rule names, violation IDs.
- 🔴 critical | 🟠 high | 🟡 medium | 🟢 low severity
- Steward actions: ✅ Approve | ❌ Reject | 🔄 Needs review | 📋 Assign

SCOPE: policy violations, rule approvals, certification status, compliance gaps, governance scorecards.
Out of scope: anything unrelated to governance/compliance."""


async def gather_governance_context(db: AsyncSession) -> dict:
    """Fetch live governance data: violations, pending approvals, policies."""
    from app.db.models import GovernancePolicy, PolicyViolation, DQRule, DataAsset, Domain
    ctx: dict = {}
    try:
        # Open violations (up to 30)
        viol_res = await db.execute(
            select(PolicyViolation, GovernancePolicy)
            .join(GovernancePolicy, PolicyViolation.policy_id == GovernancePolicy.policy_id)
            .where(PolicyViolation.status == "open")
            .order_by(desc(PolicyViolation.detected_at))
            .limit(30)
        )
        ctx["open_violations"] = [
            {
                "violation_id": r.PolicyViolation.violation_id,
                "policy_name": r.GovernancePolicy.policy_name,
                "severity": r.GovernancePolicy.severity,
                "entity_type": r.PolicyViolation.entity_type,
                "entity_id": r.PolicyViolation.entity_id,
                "detail": r.PolicyViolation.violation_detail,
                "detected_at": str(r.PolicyViolation.detected_at),
            }
            for r in viol_res.all()
        ]

        # Rules pending approval (up to 20)
        pending_res = await db.execute(
            select(DQRule, DataAsset, Domain)
            .join(DataAsset, DQRule.asset_id == DataAsset.asset_id)
            .join(Domain, DQRule.domain_id == Domain.domain_id)
            .where(DQRule.status == "pending_review", DQRule.is_active == True)
            .order_by(DQRule.severity)
            .limit(20)
        )
        ctx["pending_approvals"] = [
            {
                "rule_id": r.DQRule.rule_id,
                "rule_name": r.DQRule.rule_name,
                "rule_type": r.DQRule.rule_type,
                "severity": r.DQRule.severity,
                "table": f"{r.DataAsset.sf_schema_name}.{r.DataAsset.sf_table_name}",
                "domain": r.Domain.domain_name,
                "created_by": r.DQRule.created_by,
            }
            for r in pending_res.all()
        ]

        # Active policies summary
        pol_res = await db.execute(
            select(GovernancePolicy).where(GovernancePolicy.is_active == True).limit(20)
        )
        ctx["active_policies"] = [
            {"policy_name": p.policy_name, "policy_type": p.policy_type, "severity": p.severity}
            for p in pol_res.scalars().all()
        ]

    except Exception as e:
        logger.warning(f"Governance context gathering failed: {e}")
        ctx["context_error"] = str(e)
    return ctx
```

- [ ] **Run type check:** `cd /Users/laxmansrigiri/git_repo/data-quality-app/frontend && npm run type-check 2>&1 | tail -3` — expect clean (frontend unchanged). Backend: `cd .. && python -c "from app.services.ai_service import gather_governance_context, GOVERNANCE_SYSTEM; print('ok')"` — expect `ok`.

- [ ] **Commit:**
```bash
git add app/services/ai_service.py
git commit -m "feat: add GOVERNANCE_SYSTEM prompt and gather_governance_context() for steward chat"
```

---

### Task 2: Add `/ai/chat/governance` endpoint

**Files:**
- Modify: `app/api/ai.py` (after the existing `/ai/chat/stream` endpoint, around line 228)

This endpoint uses `GOVERNANCE_SYSTEM` and `gather_governance_context()` instead of the generic versions. It always returns JSON (no streaming) to keep it simple.

- [ ] **Add the endpoint** — append after the existing `generate_postmortem` function:

```python
@router.post("/chat/governance")
@limiter.limit("30/minute")
async def governance_chat(
    request: Request,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Governance-focused chat: uses GOVERNANCE_SYSTEM prompt and pulls live violations,
    pending approvals, and active policies as context.
    """
    try:
        from app.services.ai_service import (
            gather_governance_context, GOVERNANCE_SYSTEM,
            _compress_context, _trim_history,
        )
        from app.services.config_service import get_value
        from app.core.config import settings

        gov_ctx = payload.context or await gather_governance_context(db)
        ctx_block = f"\n\nLive Governance Data:\n{_compress_context(gov_ctx)}\n"
        prompt = f"{ctx_block}\nQuestion: {payload.message}"

        trimmed = _trim_history([{"role": h.role, "content": h.content} for h in (payload.history or [])])
        from app.services.llm_providers import get_provider_from_db as _gpfdb
        provider = await _gpfdb(payload.provider, db)

        if hasattr(provider, "complete_messages"):
            messages = [{"role": "system", "content": GOVERNANCE_SYSTEM}]
            for h in trimmed:
                messages.append({"role": h["role"], "content": h["content"]})
            messages.append({"role": "user", "content": prompt})
            response = await provider.complete_messages(messages)
        else:
            response = await provider.complete(prompt, GOVERNANCE_SYSTEM, max_tokens=1500)

        active_provider = payload.provider or await get_value("llm_provider", db) or settings.llm_provider
        return ChatResponse(response=response, provider=active_provider)
    except RuntimeError as e:
        raise _llm_err(e)
```

- [ ] **Test the endpoint manually:**
```bash
curl -s -X POST http://localhost:8000/ai/chat/governance \
  -H "Content-Type: application/json" \
  -d '{"message": "What policy violations need my attention?"}' | python3 -m json.tool
```
Expected: JSON with `response` and `provider` keys.

- [ ] **Commit:**
```bash
git add app/api/ai.py
git commit -m "feat: add /ai/chat/governance endpoint with steward-focused system prompt"
```

---

### Task 3: Wire `llm_semantic_check` to call LLM during execution

**Files:**
- Modify: `app/services/execution_service.py` (after the `volume_check` special-case block, around line 255)

The `llm_semantic_check` rule type generates SQL that samples rows but currently leaves `failed_count = 0` — the LLM validation step was never wired in. We fix this by detecting the rule type after SQL execution and calling the LLM to evaluate the sampled rows.

- [ ] **Add the `_llm_semantic_validate()` helper** — insert before `execute_rule()` (around line 189):

```python
async def _llm_semantic_validate(
    rule: "DQRule",
    sample_rows: list[dict],
    db: "AsyncSession",
) -> int:
    """
    Call the LLM to validate sampled rows for an llm_semantic_check rule.
    Returns the number of rows the LLM considers failing.
    """
    if not sample_rows:
        return 0
    config = rule.rule_config or {}
    validation_prompt = config.get(
        "validation_prompt",
        f"Check if each row violates: {rule.rule_description or rule.rule_name}"
    )
    rows_text = "\n".join(str(r) for r in sample_rows[:20])
    prompt = (
        f"Validation rule: {validation_prompt}\n\n"
        f"Rows to check ({len(sample_rows)} rows):\n{rows_text}\n\n"
        f"Return ONLY a JSON object: {{\"failed_count\": <integer>, \"reason\": \"<brief explanation>\"}}"
    )
    sys_semantic = (
        "You are a data quality validator. Given rows of data and a validation rule, "
        "count how many rows FAIL the rule. Return only valid JSON."
    )
    try:
        from app.services.llm_providers import get_provider_from_db
        from app.db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as llm_db:
            provider = await get_provider_from_db(None, llm_db)
        import json as _j
        raw = await provider.complete(prompt, sys_semantic, max_tokens=200)
        start = raw.find("{"); end = raw.rfind("}") + 1
        result = _j.loads(raw[start:end]) if start >= 0 else {}
        return int(result.get("failed_count", 0))
    except Exception as e:
        logger.warning(f"LLM semantic validation failed for rule {rule.rule_id}: {e}")
        return 0
```

- [ ] **Insert the llm_semantic_check branch** — inside `execute_rule()`, after the `volume_check` block (after line ~258), add:

```python
        # llm_semantic_check: SQL samples failing rows; LLM validates them
        if rule.rule_type == "llm_semantic_check" and rows:
            sample_rows = [dict(r) for r in rows]
            failed_count = await _llm_semantic_validate(rule, sample_rows, db)
            total_count = total_count or len(sample_rows)
```

- [ ] **Verify syntax:** `python -c "import app.services.execution_service; print('ok')"` from project root — expect `ok`.

- [ ] **Commit:**
```bash
git add app/services/execution_service.py
git commit -m "feat: wire llm_semantic_check rule type to call LLM for row validation during execution"
```

---

### Task 4: Add refinement support to natural language rule conversion

**Files:**
- Modify: `app/api/ai.py` — update `rule_from_natural_language` handler (around line 276)

Currently the endpoint is single-shot. Add optional `prior_result` and `refinement` fields so the user can say "make it stricter" and get an improved version.

- [ ] **Update the `rule_from_natural_language` endpoint** — replace the existing handler body with:

```python
@router.post("/rules/from-natural-language")
@limiter.limit("20/minute")
async def rule_from_natural_language(
    request: Request,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Convert plain-English rule to structured JSON.
    Supports iterative refinement via `prior_result` + `refinement` fields.
    payload: {description, asset_id?, domain_context?, provider?, prior_result?, refinement?}
    """
    from sqlalchemy import select
    from app.db.models import DataAsset
    from app.services.llm_providers import get_provider_from_db

    description  = payload.get("description", "")
    asset_id     = payload.get("asset_id", "")
    prior_result = payload.get("prior_result")   # dict from a previous call
    refinement   = payload.get("refinement", "") # e.g. "make the threshold stricter"

    if not description:
        raise HTTPException(400, "description is required")

    asset_name = ""
    if asset_id:
        asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
        asset = asset_res.scalar_one_or_none()
        asset_name = f"{asset.sf_schema_name}.{asset.sf_table_name}" if asset else ""

    sys_nl = (
        "Convert a plain-English data quality rule to a structured JSON definition. "
        "Return ONLY JSON: {rule_type, target_column, severity, rule_config, rule_description, suggested_sql}. "
        "rule_type options: null_check, uniqueness_check, accepted_values_check, range_check, "
        "freshness_check, volume_check, regex_check, business_rule_check, custom_sql_check, "
        "semantic_consistency_check. severity: critical|high|medium|low."
    )

    if prior_result and refinement:
        import json as _j
        prompt = (
            f"Table: {asset_name or 'unknown'}\n"
            f"Domain: {payload.get('domain_context', '')}\n"
            f"Original rule: {description}\n"
            f"Previous result: {_j.dumps(prior_result)}\n"
            f"Refinement request: {refinement}\n"
            f"Return an improved version of the rule definition."
        )
    else:
        prompt = (
            f"Table: {asset_name or 'unknown'}\n"
            f"Domain: {payload.get('domain_context', '')}\n"
            f"Rule: {description}"
        )

    try:
        provider = await get_provider_from_db(payload.get("provider"), db)
        raw = await provider.complete(prompt, system=sys_nl, max_tokens=500)
        import json as _j
        start = raw.find("{"); end = raw.rfind("}") + 1
        result = _j.loads(raw[start:end]) if start >= 0 else {}
    except Exception as e:
        raise HTTPException(503, f"LLM error: {e}")

    return {
        "asset_id": asset_id,
        "input_description": description,
        "refinement": refinement or None,
        "rule_definition": result,
    }
```

- [ ] **Test refinement:**
```bash
curl -s -X POST http://localhost:8000/ai/rules/from-natural-language \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Email column must be valid",
    "prior_result": {"rule_type": "regex_check", "severity": "medium"},
    "refinement": "make severity critical and add a stricter regex"
  }' | python3 -m json.tool
```
Expected: JSON with updated `rule_definition.severity = "critical"`.

- [ ] **Commit:**
```bash
git add app/api/ai.py
git commit -m "feat: add iterative refinement to /ai/rules/from-natural-language via prior_result + refinement fields"
```

---

### Task 5: Add incident-level AI explanation endpoint

**Files:**
- Modify: `app/services/ai_service.py` — add `explain_incident()` function
- Modify: `app/api/ai.py` — add `POST /ai/incidents/{incident_id}/explain` endpoint

The existing `explain_failure` works per rule-run. This new function aggregates all rule runs for an incident (via `trigger_run_id` and sibling runs in the same time window) and explains the full incident in business terms including lineage context.

- [ ] **Add `explain_incident()` to `ai_service.py`** — append after `explain_failure()`:

```python
async def explain_incident(
    incident_id: str,
    provider_name: str | None,
    db: AsyncSession,
) -> str:
    """
    Explain a quality incident in business terms.
    Aggregates all related rule runs and injects asset + domain context.
    """
    from app.db.models import QualityIncident, DQRuleRun, DQRule, DataAsset, Domain
    from datetime import timedelta

    inc_res = await db.execute(
        select(QualityIncident).where(QualityIncident.incident_id == incident_id)
    )
    incident = inc_res.scalar_one_or_none()
    if not incident:
        return "Incident not found."

    asset_res = await db.execute(
        select(DataAsset, Domain)
        .join(Domain, DataAsset.domain_id == Domain.domain_id)
        .where(DataAsset.asset_id == incident.asset_id)
    )
    asset_row = asset_res.one_or_none()
    asset = asset_row.DataAsset if asset_row else None
    domain = asset_row.Domain if asset_row else None

    # Collect related rule runs: trigger run + runs on same asset within ±1h
    related_runs: list[str] = []
    if incident.trigger_run_id:
        trigger_res = await db.execute(
            select(DQRuleRun, DQRule)
            .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
            .where(DQRuleRun.run_id == incident.trigger_run_id)
        )
        for rr in trigger_res.all():
            related_runs.append(
                f"- {rr.DQRule.rule_name} ({rr.DQRule.rule_type}): "
                f"{rr.DQRuleRun.failed_rows_count} failed rows "
                f"({rr.DQRuleRun.failure_percentage:.1f}%)"
            )

    # Also grab other failures on same asset around the same time
    window_start = incident.created_at - timedelta(hours=1)
    window_end   = incident.created_at + timedelta(hours=1)
    sibling_res = await db.execute(
        select(DQRuleRun, DQRule)
        .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
        .where(
            DQRuleRun.asset_id == incident.asset_id,
            DQRuleRun.status == "failed",
            DQRuleRun.created_at >= window_start,
            DQRuleRun.created_at <= window_end,
            DQRuleRun.run_id != (incident.trigger_run_id or ""),
        )
        .limit(10)
    )
    for rr in sibling_res.all():
        related_runs.append(
            f"- {rr.DQRule.rule_name} ({rr.DQRule.rule_type}): "
            f"{rr.DQRuleRun.failed_rows_count} failed rows"
        )

    table_name = f"{asset.sf_schema_name}.{asset.sf_table_name}" if asset else incident.asset_id
    domain_name = domain.domain_name if domain else "Unknown"
    runs_text = "\n".join(related_runs) or "No rule run details available."

    prompt = (
        f"Incident: {incident.title or 'Data Quality Incident'}\n"
        f"Table: {table_name}\n"
        f"Domain: {domain_name}\n"
        f"Criticality: {asset.criticality if asset else 'unknown'}\n"
        f"Severity: {incident.severity}\n"
        f"Status: {incident.status}\n"
        f"Time to detect: {incident.ttd_minutes or 'unknown'} minutes\n"
        f"Failed checks:\n{runs_text}\n"
        f"Prior RCA: {incident.rca_report or 'None'}\n\n"
        f"Explain this incident in plain business language. "
        f"Who is affected? What decisions or reports are at risk? What should the data owner do first?"
    )
    provider = await get_provider_from_db(provider_name, db)
    return await provider.complete(prompt, _SYS_EXPLAIN, max_tokens=1000)
```

- [ ] **Add the endpoint to `app/api/ai.py`** — append after `governance_chat`:

```python
@router.post("/incidents/{incident_id}/explain")
@limiter.limit("20/minute")
async def explain_incident(
    request: Request,
    incident_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Explain a quality incident in business terms, aggregating all related rule failures.
    Optional body: {provider?: str}
    """
    try:
        explanation = await ai_service.explain_incident(
            incident_id, payload.get("provider"), db
        )
        return {"incident_id": incident_id, "explanation": explanation}
    except RuntimeError as e:
        raise _llm_err(e)
```

- [ ] **Verify Python syntax:**
```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app && python -c "
from app.services.ai_service import explain_incident
from app.api.ai import router
print('ok')
"
```
Expected: `ok`.

- [ ] **Commit:**
```bash
git add app/services/ai_service.py app/api/ai.py
git commit -m "feat: add explain_incident() and POST /ai/incidents/{id}/explain endpoint with multi-run aggregation"
```

---

### Task 6: Verify all Plan A endpoints are reachable

- [ ] Start the API server:
```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app && uvicorn app.main:app --port 8000 --reload &
sleep 4
```

- [ ] **Check all new routes appear in OpenAPI:**
```bash
curl -s http://localhost:8000/openapi.json | python3 -c "
import json,sys
paths = json.load(sys.stdin)['paths']
targets = ['/ai/chat/governance', '/ai/incidents/{incident_id}/explain']
for t in targets:
    print(t, '✅' if t in paths else '❌ MISSING')
"
```
Expected: both `✅`.

- [ ] **Commit:**
```bash
git add .
git commit -m "feat: Plan A complete — governance chat, llm_semantic_check, NL rule refinement, incident explanation"
```
