import json as _json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.schemas.ai import (
    GenerateRulesRequest, ExplainFailureRequest, GenerateSQLRequest,
    ClassifyTableRequest, ChatRequest, ChatResponse,
)
from app.services import ai_service
from app.core.security import get_current_user
from app.core.limiter import limiter

router = APIRouter(prefix="/ai", tags=["AI/LLM"])


def _llm_err(e: RuntimeError) -> HTTPException:
    return HTTPException(status_code=503, detail=str(e))


@router.get("/models")
async def list_models(db: AsyncSession = Depends(get_db)):
    """Return the active provider config and available Ollama models."""
    from app.services.config_service import get_value
    from app.core.config import settings
    from app.services.llm_providers import OllamaProvider

    async def cfg(key: str, fallback: str = "") -> str:
        v = await get_value(key, db)
        return v if v else fallback

    provider    = await cfg("llm_provider",   settings.llm_provider or "ollama")
    ollama_url  = await cfg("ollama_base_url", settings.ollama_base_url or "http://localhost:11434")
    ollama_model = await cfg("ollama_model",  settings.ollama_model or "qwen2.5:7b-instruct")

    available: list[str] = []
    if provider == "ollama":
        p = OllamaProvider(ollama_url, ollama_model)
        available = await p.list_models()

    return {
        "provider":        provider,
        "ollama_base_url": ollama_url,
        "ollama_model":    ollama_model,
        "available_models": available,
        "model_installed": ollama_model in available if available else None,
    }


@router.post("/generate-rules")
@limiter.limit("20/minute")
async def generate_rules(
    request: Request,
    payload: GenerateRulesRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        rules = await ai_service.generate_rules(
            payload.domain, payload.subdomain, payload.table_name,
            payload.columns, payload.context, payload.provider, db,
        )
        return {"rules": rules, "count": len(rules)}
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/explain-failure")
@limiter.limit("20/minute")
async def explain_failure(
    request: Request,
    payload: ExplainFailureRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        explanation = await ai_service.explain_failure(
            payload.run_id, payload.rule_id, payload.provider, db,
        )
        return {"explanation": explanation, "run_id": payload.run_id, "rule_id": payload.rule_id}
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/generate-sql")
@limiter.limit("20/minute")
async def generate_sql(
    request: Request,
    payload: GenerateSQLRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        sql = await ai_service.generate_sql(
            payload.description, payload.table_name, payload.schema_name,
            payload.database_name, payload.columns, payload.provider, db,
        )
        return {"sql": sql}
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/classify-table")
async def classify_table(
    payload: ClassifyTableRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        result = await ai_service.classify_table(
            payload.table_name, payload.columns, payload.provider, db,
        )
        return result
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat(
    request: Request,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        history = [{"role": h.role, "content": h.content} for h in (payload.history or [])]
        response = await ai_service.chat(
            payload.message, payload.context, payload.provider, db, history=history,
        )
        from app.services.config_service import get_value
        from app.core.config import settings
        provider = payload.provider or await get_value("llm_provider", db) or settings.llm_provider
        return ChatResponse(response=response, provider=provider)
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/chat/stream")
@limiter.limit("30/minute")
async def chat_stream(
    request: Request,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Server-Sent Events endpoint. Streams tokens from Ollama as they are generated.
    Each event: data: {"token": "...", "done": false}
    Final event: data: {"token": "", "done": true, "provider": "ollama"}
    """
    import httpx
    from app.services.config_service import get_value
    from app.core.config import settings

    async def cfg(key: str, fallback: str = "") -> str:
        v = await get_value(key, db)
        return v if v else fallback

    provider_name = (payload.provider or await cfg("llm_provider", settings.llm_provider) or "ollama").lower()

    # Non-Ollama providers: call once and wrap as a single SSE event.
    # Keep the await INSIDE the generator so any RuntimeError becomes an error
    # SSE event rather than an HTTP 503 response code.
    if provider_name != "ollama":
        async def non_stream():
            try:
                response = await ai_service.chat(
                    payload.message, payload.context, payload.provider, db
                )
                yield f"data: {_json.dumps({'token': response, 'done': False})}\n\n"
                yield f"data: {_json.dumps({'token': '', 'done': True, 'provider': provider_name})}\n\n"
            except RuntimeError as e:
                yield f"data: {_json.dumps({'error': str(e), 'done': True})}\n\n"
        return StreamingResponse(
            non_stream(), media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    base_url = (await cfg("ollama_base_url", settings.ollama_base_url or "http://localhost:11434")).rstrip("/")
    model    =  await cfg("ollama_model",    settings.ollama_model    or "qwen2.5:1.5b")

    # Auto-gather context from DB if none provided by frontend
    context = payload.context
    if not context:
        context = await ai_service.gather_platform_context(payload.message, db)

    ctx = f"\n\nLive Platform Data:\n{ai_service._compress_context(context)}\n" if context else ""
    prompt = f"{ctx}\nQuestion: {payload.message}"

    # Build multi-turn message array with bounded history
    trimmed = ai_service._trim_history([{"role": h.role, "content": h.content} for h in (payload.history or [])])
    messages = [{"role": "system", "content": ai_service.PLATFORM_SYSTEM}]
    for h in trimmed:
        messages.append(h)
    messages.append({"role": "user", "content": prompt})

    async def stream_tokens():
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/api/chat",
                    json={"model": model, "messages": messages, "stream": True},
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = _json.loads(line)
                            token = chunk.get("message", {}).get("content", "")
                            done  = chunk.get("done", False)
                            yield f"data: {_json.dumps({'token': token, 'done': done, 'provider': provider_name})}\n\n"
                            if done:
                                break
                        except Exception:
                            continue
        except httpx.ConnectError:
            err = (f"Cannot connect to Ollama at {base_url}. "
                   "If running in Docker use http://host.docker.internal:11434")
            yield f"data: {_json.dumps({'error': err, 'done': True})}\n\n"
        except Exception as e:
            yield f"data: {_json.dumps({'error': str(e), 'done': True})}\n\n"

    return StreamingResponse(stream_tokens(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── §47 Advanced AI Endpoints ─────────────────────────────────────────────────

@router.post("/discover-pii/{asset_id}")
@limiter.limit("10/minute")
async def discover_pii(
    request: Request,
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Scan column names and types to identify likely PII columns (§62.3)."""
    from sqlalchemy import select
    from app.db.models import ColumnMetadata, DataAsset
    from app.services.llm_providers import get_provider_from_db

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")

    cols_res = await db.execute(select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id))
    cols = cols_res.scalars().all()
    if not cols:
        return {"asset_id": asset_id, "findings": [], "message": "No column metadata — run profiling first"}

    col_list = "\n".join(f"- {c.column_name} ({c.data_type or 'unknown'})" for c in cols)
    prompt = (
        f"Table: {asset.sf_table_name}\nColumns:\n{col_list}\n\n"
        f"Classify each column as PII, SENSITIVE, CONFIDENTIAL, or PUBLIC.\n"
        f"Return JSON array: "
        f'[{{"column_name":"...","pii_type":"...","confidence":0.0-1.0,"suggested_classification":"..."}}]'
    )
    try:
        from app.services.ai_service import _SYS_JSON_ONLY
        provider = await get_provider_from_db(None, db)
        raw = await provider.complete(prompt, system=_SYS_JSON_ONLY, max_tokens=900)
        import json as _j
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        findings = _j.loads(raw[start:end]) if start >= 0 else []
    except Exception:
        findings = []

    return {"asset_id": asset_id, "sf_table_name": asset.sf_table_name, "findings": findings}


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
    prior_result = payload.get("prior_result")
    refinement   = payload.get("refinement", "")

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


@router.post("/rca/{run_id}")
async def trigger_rca(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Root Cause Analysis — enriched with 30-run trend, day/hour patterns, sibling failures."""
    from sqlalchemy import select, desc, func
    from app.db.models import DQRuleRun, DQRule, DataAsset
    from app.services.llm_providers import get_provider_from_db
    import json as _j
    from collections import Counter
    from datetime import timedelta

    run_res = await db.execute(select(DQRuleRun).where(DQRuleRun.run_id == run_id))
    run = run_res.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")

    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == run.rule_id))
    rule = rule_res.scalar_one_or_none()

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == run.asset_id))
    asset = asset_res.scalar_one_or_none()

    # Last 30 runs for same rule
    hist_res = await db.execute(
        select(DQRuleRun)
        .where(DQRuleRun.rule_id == run.rule_id)
        .order_by(desc(DQRuleRun.created_at))
        .limit(30)
    )
    history = hist_res.scalars().all()
    fail_pcts = [r.failure_percentage for r in history if r.failure_percentage is not None]
    fail_statuses = Counter(r.status for r in history)
    fail_days = Counter(
        r.created_at.strftime("%A") for r in history if r.status == "failed" and r.created_at
    )
    fail_hours = Counter(
        r.created_at.hour for r in history if r.status == "failed" and r.created_at
    )
    avg_fail_pct = f"{sum(fail_pcts)/len(fail_pcts):.1f}%" if fail_pcts else "N/A"
    trend_summary = (
        f"Last {len(history)} runs: {fail_statuses.get('passed',0)} passed, "
        f"{fail_statuses.get('failed',0)} failed, {fail_statuses.get('error',0)} errors. "
        f"Avg failure %: {avg_fail_pct} across {len(fail_pcts)} runs. "
        f"Most failures on: {fail_days.most_common(2)}. "
        f"Peak failure hours: {fail_hours.most_common(2)}."
    ) if history else "No run history available."

    # Sibling failures in same domain ±2h
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

    context = (
        f"Rule: {rule.rule_name if rule else run.rule_id}\n"
        f"Rule type: {rule.rule_type if rule else 'unknown'}\n"
        f"Severity: {rule.severity if rule else 'unknown'}\n"
        f"Table: {asset.sf_table_name if asset else run.asset_id}\n"
        f"Failed rows: {run.failed_rows_count} / {run.total_rows_scanned} "
        f"({run.failure_percentage or 0.0:.1f}%)\n"
        f"Error message: {run.error_message or 'none'}\n"
        f"Executed SQL: {(run.executed_sql or '')[:400]}\n"
        f"--- Historical trend ---\n{trend_summary}\n"
        f"Sibling asset failures in same domain ±2h: {sibling_failures}\n"
    )

    sys_rca = (
        "You are a data engineering expert. Analyse the data quality failure. "
        "Consider the historical trend and sibling failures when identifying the root cause. "
        "Return ONLY valid JSON: {root_cause, explanation, confidence (0-1), "
        "contributing_factors (list), recommended_action (object: step, priority, owner_role, estimated_effort), "
        "pattern_detected (string or null)}"
    )
    try:
        provider = await get_provider_from_db(None, db)
        raw = await provider.complete(context, system=sys_rca, max_tokens=900)
        start = raw.find("{"); end = raw.rfind("}") + 1
        rca = _j.loads(raw[start:end]) if start >= 0 else {"root_cause": "Analysis unavailable", "explanation": raw}
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


@router.post("/chat/governance")
@limiter.limit("30/minute")
async def governance_chat(
    request: Request,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Governance-focused chat using GOVERNANCE_SYSTEM prompt and live violation/approval context."""
    try:
        from app.services.ai_service import (
            gather_governance_context, GOVERNANCE_SYSTEM,
            _compress_context, _trim_history,
        )
        from app.services.llm_providers import get_provider_from_db as _gpfdb
        from app.services.config_service import get_value
        from app.core.config import settings

        gov_ctx = payload.context or await gather_governance_context(db)
        ctx_block = f"\n\nLive Governance Data:\n{_compress_context(gov_ctx)}\n"
        prompt = f"{ctx_block}\nQuestion: {payload.message}"

        trimmed = _trim_history([{"role": h.role, "content": h.content} for h in (payload.history or [])])
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


@router.post("/incidents/{incident_id}/explain")
@limiter.limit("20/minute")
async def explain_incident_endpoint(
    request: Request,
    incident_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Explain a quality incident in business terms, aggregating all related rule failures."""
    try:
        explanation = await ai_service.explain_incident(
            incident_id, payload.get("provider"), db
        )
        return {"incident_id": incident_id, "explanation": explanation}
    except RuntimeError as e:
        raise _llm_err(e)


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


@router.post("/glossary/suggest-terms")
@limiter.limit("10/minute")
async def suggest_glossary_terms(
    request: Request,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Suggest new business glossary terms based on registered data assets."""
    try:
        terms = await ai_service.suggest_glossary_terms(
            payload.get("domain_id"), payload.get("provider"), db
        )
        return {"suggestions": terms, "count": len(terms)}
    except RuntimeError as e:
        raise _llm_err(e)


@router.get("/governance/review-queue")
@limiter.limit("20/minute")
async def steward_review_queue(
    request: Request,
    provider: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """AI-prioritised governance review queue with violations and pending approvals."""
    try:
        return await ai_service.get_steward_review_queue(provider, db)
    except RuntimeError as e:
        raise _llm_err(e)


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


@router.post("/assets/{asset_id}/predict-quality")
@limiter.limit("10/minute")
async def predict_asset_quality(
    request: Request,
    asset_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Predict whether an asset will fail quality checks in the next 7 days."""
    try:
        return await ai_service.predict_asset_quality(
            asset_id, payload.get("provider"), db
        )
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
    """Return assets with highest predicted quality risk from last nightly prediction run."""
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
        .limit(limit * 3)
    )
    rows = det_res.all()

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


@router.post("/assets/{asset_id}/remediation-plan")
@limiter.limit("10/minute")
async def asset_remediation_plan(
    request: Request,
    asset_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Generate structured remediation plan for an asset's recent quality failures."""
    try:
        return await ai_service.generate_remediation_plan(
            asset_id, payload.get("provider"), db
        )
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/rules/{rule_id}/remediation-playbook")
@limiter.limit("20/minute")
async def rule_remediation_playbook(
    request: Request,
    rule_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Generate a focused remediation playbook for a specific rule."""
    from sqlalchemy import select, desc
    from app.db.models import DQRule, DQRuleRun, DataAsset
    from app.services.llm_providers import get_provider_from_db
    from app.services.ai_service import _REMEDIATION_HINTS
    import json as _j

    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = rule_res.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == rule.asset_id))
    asset = asset_res.scalar_one_or_none()

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
        "You are a data engineering expert. Generate a 3-5 step remediation playbook. "
        "Return ONLY valid JSON: {\"playbook_title\": \"...\", \"steps\": [{\"step\": N, "
        "\"action\": \"...\", \"who\": \"...\", \"how\": \"...\", \"done_when\": \"...\"}], "
        "\"prevention_tip\": \"single sentence\"}"
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
        "Generate a specific remediation playbook."
    )

    try:
        provider = await get_provider_from_db(payload.get("provider"), db)
        raw = await provider.complete(prompt, sys_play, max_tokens=900)
        start = raw.find("{"); end = raw.rfind("}") + 1
        playbook = _j.loads(raw[start:end]) if start >= 0 else {}
    except Exception as e:
        raise HTTPException(503, f"LLM error: {e}")

    return {"rule_id": rule_id, "rule_name": rule.rule_name, "rule_type": rule.rule_type, "playbook": playbook}


@router.post("/incidents/{incident_id}/generate-postmortem")
async def generate_postmortem(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Auto-generate a post-mortem draft for a resolved incident (§67.3)."""
    from sqlalchemy import select
    from app.db.models import QualityIncident, DataAsset
    from app.services.llm_providers import get_provider_from_db

    inc_res = await db.execute(select(QualityIncident).where(QualityIncident.incident_id == incident_id))
    incident = inc_res.scalar_one_or_none()
    if not incident:
        raise HTTPException(404, "Incident not found")

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == incident.asset_id))
    asset = asset_res.scalar_one_or_none()

    context = (
        f"Incident: {incident.title or 'Data quality incident'}\n"
        f"Table: {asset.sf_table_name if asset else incident.asset_id}\n"
        f"Severity: {incident.severity}\n"
        f"Status: {incident.status}\n"
        f"Time to detect: {incident.ttd_minutes} minutes\n"
        f"Time to resolve: {incident.ttr_minutes} minutes\n"
        f"RCA: {incident.rca_report}\n"
    )
    sys_pm = (
        "You are a senior data engineering lead. Write a concise formal post-mortem in Markdown. "
        "Sections: Executive Summary, Timeline, Root Cause, Contributing Factors, "
        "Impact, Remediation Steps, Action Items."
    )
    prompt = f"Incident details:\n{context}"
    try:
        provider = await get_provider_from_db(None, db)
        postmortem = await provider.complete(prompt, system=sys_pm, max_tokens=2000)
    except Exception as e:
        postmortem = f"Post-mortem generation failed: {e}"

    return {
        "incident_id": incident_id,
        "postmortem": postmortem,
        "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
