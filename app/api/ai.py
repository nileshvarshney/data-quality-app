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
    Convert a plain-English rule description to a structured rule definition (§54.3).
    payload: {description: str, asset_id: str, domain_context?: str}
    """
    from sqlalchemy import select
    from app.db.models import DataAsset
    from app.services.llm_providers import get_provider_from_db

    description = payload.get("description", "")
    asset_id    = payload.get("asset_id", "")
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

    return {"asset_id": asset_id, "input_description": description, "rule_definition": result}


@router.post("/rca/{run_id}")
async def trigger_rca(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Trigger Root Cause Analysis for a failed run (§55.3)."""
    from sqlalchemy import select, desc
    from app.db.models import DQRuleRun, DQRule, DataAsset
    from app.services.llm_providers import get_provider_from_db

    run_res = await db.execute(select(DQRuleRun).where(DQRuleRun.run_id == run_id))
    run = run_res.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")

    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == run.rule_id))
    rule = rule_res.scalar_one_or_none()

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == run.asset_id))
    asset = asset_res.scalar_one_or_none()

    # lineage context removed - now uses data_object_relationships (object_id-based)
    upstream_links = []

    # Build context for LLM
    context = (
        f"Rule: {rule.rule_name if rule else run.rule_id}\n"
        f"Table: {asset.sf_table_name if asset else run.asset_id}\n"
        f"Failed rows: {run.failed_rows_count}\n"
        f"Failure %: {run.failure_percentage}\n"
        f"Error message: {run.error_message or 'none'}\n"
        f"Executed SQL: {(run.executed_sql or '')[:500]}\n"
        f"Upstream tables: {', '.join([l.upstream_asset_id or '' for l in upstream_links]) or 'none'}\n"
    )
    sys_rca = (
        "You are a data engineering expert. Analyse the data quality failure and return "
        "ONLY valid JSON: {root_cause, explanation, confidence (0-1), contributing_factors (list), recommended_action}."
    )
    prompt = (
        f"Data quality failure:\n{context}\n"
        f"Identify the most likely root cause."
    )
    try:
        from app.services.ai_service import _SYS_JSON_ONLY as _SJ  # noqa: F401 (unused name ok)
        provider = await get_provider_from_db(None, db)
        raw = await provider.complete(prompt, system=sys_rca, max_tokens=700)
        import json as _j
        start = raw.find("{"); end = raw.rfind("}") + 1
        rca = _j.loads(raw[start:end]) if start >= 0 else {"root_cause": "Analysis unavailable", "explanation": raw}
    except Exception as e:
        rca = {"root_cause": "LLM unavailable", "explanation": str(e), "confidence": 0}

    return {"run_id": run_id, "rule_id": run.rule_id, "asset_id": run.asset_id, "rca": rca}


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
