import json
import re
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.db.models import (
    DQRule, DQRuleRun, Domain, Subdomain, DataAsset,
    DQSchedule, DQAlert, GovernancePolicy, PolicyViolation,
)
from app.services.llm_providers import get_provider_from_db

logger = logging.getLogger("dq_platform.ai")

# ── System prompts ────────────────────────────────────────────────────────────
# PLATFORM_SYSTEM is the full chat prompt (~840 tokens). Keep it only for /chat.
# All other endpoints use the slim task-scoped prompts below (~30–80 tokens each).

PLATFORM_SYSTEM = """You are DQ Intelligence — an AI data quality expert with live access to this enterprise platform.

PLATFORM: Monitors Snowflake across Revenue, Finance, HR, Operations, GTM, Planning. Context provided is LIVE data.

RULES:
1. Answer only from context — never invent scores, rule names, or table names.
2. Synthesise runs + alerts + domain scores into ONE coherent answer.
3. For multi-part questions use ### headings.
4. Be direct. No filler ("Great question!", "As an AI...").

FORMAT:
- **Bold** numbers, rule names, table names, domain names.
- ✅ ≥95% | ⚠️ 80–94% | ❌ <80% | 🔴 open alert
- Diagnostic structure: ### What Failed → ### Root Cause → ### Business Impact → ### Next Steps

SCOPE: quality scores, rules, runs, alerts, schedules, governance, contracts, incidents, catalog, lineage, compliance, cost.
Out of scope: anything unrelated to data quality/governance."""

# Task-scoped slim prompts — used by non-chat AI endpoints.

_SYS_RULE_GEN = (
    "You are a data quality expert. Generate DQ rules as a JSON array. "
    "Each item: rule_name, rule_type, target_column, severity, rule_description. "
    "Valid rule_type: null_check, uniqueness_check, accepted_values_check, range_check, "
    "freshness_check, volume_check, regex_check, business_rule_check, custom_sql_check. "
    "Valid severity: critical, high, medium, low. Return ONLY the JSON array."
)

_SYS_EXPLAIN = (
    "You are a data engineering expert. Explain this data quality failure concisely. "
    "Structure: **What Failed** | **Root Cause** | **Business Impact** | **Recommended Fix**. "
    "Use plain English. Be specific and actionable."
)

_SYS_SQL_GEN = (
    "You are a Snowflake SQL expert. Generate a single Snowflake SQL statement that "
    "returns a column named 'failed_count' (integer). Return ONLY the SQL, no explanation."
)

_SYS_CLASSIFY = (
    "You are a data governance expert. Classify a Snowflake table into a business domain. "
    "Domains: Revenue, Finance, Operations, Planning, GTM, HR, Others. "
    "Return ONLY valid JSON: {domain, subdomain, owner_suggestion, reason, suggested_rules}."
)

_SYS_JSON_ONLY = "Return only valid JSON. No markdown, no explanation, no code fences."

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


# ── Governance context gathering ─────────────────────────────────────────────

async def gather_governance_context(db: AsyncSession) -> dict:
    """Fetch live governance data: violations, pending approvals, policies."""
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


# ── Intent detection (used for auto context gathering) ───────────────────────

def _detect_intent(q: str) -> str:
    m = q.lower()
    if re.search(r'\bgdpr|sox|hipaa|ccpa|compliance|regulation|framework|erasure\b', m): return 'compliance'
    if re.search(r'\bcost|roi|bad data cost|financial impact|dollar\b', m):              return 'cost'
    if re.search(r'\blineage|upstream|downstream|blast radius|depend\b', m):             return 'lineage'
    if re.search(r'\bdata product|catalog|glossary|business term|popular\b', m):         return 'catalog'
    if re.search(r'\bincident|mttd|mttr|mean time|outage\b', m):                         return 'incidents'
    if re.search(r'\bcontract|data contract|sla agreement|violated.*contract\b', m):     return 'contracts'
    if re.search(r'\bgovernance|policy|violation|scorecard|certification\b', m):         return 'governance'
    if re.search(r'\balert|notification|open alert|unresolved\b', m):                    return 'alerts'
    if re.search(r'\brun|execution|execut|log|history|last run|recent run|result\b', m): return 'runs'
    if re.search(r'\bschedul|cron|frequenc|when.*run|hourly|daily|weekly\b', m):         return 'schedules'
    if re.search(r'\basset|table|dataset|schema|registered\b', m):                       return 'assets'
    if re.search(r'\brule|check|validat|null check|uniqueness|regex|freshness\b', m):    return 'rules'
    if re.search(r'\bdomain|quality score|quality\b', m):                                return 'domains'
    return 'global'


# ── Context helpers ───────────────────────────────────────────────────────────

def _compress_context(ctx: dict, max_chars: int = 6000) -> str:
    """
    Serialise context to JSON, truncating arrays to 10 items and omitting
    null/empty values. Caps output at max_chars to stay within token budget.
    """
    def _clean(obj):
        if isinstance(obj, dict):
            return {k: _clean(v) for k, v in obj.items() if v not in (None, "", [], {})}
        if isinstance(obj, list):
            trimmed = obj[:10]
            return [_clean(i) for i in trimmed]
        return obj

    text = json.dumps(_clean(ctx), default=str)
    if len(text) > max_chars:
        text = text[:max_chars] + "… [context truncated]"
    return text


def _trim_history(history: list[dict], max_turns: int = 6) -> list[dict]:
    """Keep only the last max_turns messages to bound history token cost."""
    return history[-max_turns:] if len(history) > max_turns else history


# ── Live DB context gathering ─────────────────────────────────────────────────

async def gather_platform_context(message: str, db: AsyncSession) -> dict:
    """Fetch live platform data relevant to the question, directly from DB."""
    intent = _detect_intent(message)
    ctx: dict = {"intent": intent}

    try:
        from datetime import datetime, timedelta
        cutoff = datetime.utcnow() - timedelta(hours=24)

        # ── Global summary (3 queries instead of 3+N) ──────────────────────
        domain_res = await db.execute(select(Domain).where(Domain.is_active == True))
        domains = domain_res.scalars().all()

        counts_res = await db.execute(
            select(
                func.count(DataAsset.asset_id).label("assets"),
                func.count(DQRule.rule_id).label("rules"),
            )
            .select_from(DataAsset)
            .join(DQRule, DQRule.asset_id == DataAsset.asset_id, isouter=True)
            .where(DataAsset.is_active == True, DQRule.is_active == True)
        )
        counts_row = counts_res.one_or_none()
        total_assets = counts_row.assets if counts_row else 0
        total_rules = counts_row.rules if counts_row else 0

        runs_res = await db.execute(
            select(DQRuleRun.status, func.count(DQRuleRun.run_id))
            .where(DQRuleRun.created_at >= cutoff)
            .group_by(DQRuleRun.status)
        )
        run_counts = {row[0]: row[1] for row in runs_res}

        alert_res = await db.execute(
            select(func.count(DQAlert.alert_id)).where(DQAlert.alert_status == 'open')
        )
        open_alerts = alert_res.scalar() or 0

        ctx["summary"] = {
            "total_domains": len(domains),
            "total_assets": total_assets,
            "total_active_rules": total_rules,
            "open_alerts": open_alerts,
            "runs_24h": {
                "passed": run_counts.get("passed", 0),
                "failed": run_counts.get("failed", 0),
                "error":  run_counts.get("error", 0),
            },
        }

        # ── Domain quality — single GROUP BY query (replaces N×3 queries) ──
        rule_by_domain = await db.execute(
            select(DQRule.domain_id, func.count(DQRule.rule_id).label("cnt"))
            .where(DQRule.is_active == True)
            .group_by(DQRule.domain_id)
        )
        rule_cnt_map = {r.domain_id: r.cnt for r in rule_by_domain}

        runs_by_domain = await db.execute(
            select(
                DQRuleRun.domain_id,
                DQRuleRun.status,
                func.count(DQRuleRun.run_id).label("cnt"),
            )
            .where(DQRuleRun.created_at >= cutoff)
            .group_by(DQRuleRun.domain_id, DQRuleRun.status)
        )
        runs_map: dict[str, dict[str, int]] = {}
        for r in runs_by_domain:
            runs_map.setdefault(r.domain_id, {})[r.status] = r.cnt

        domain_rows = []
        for d in domains:
            dm = runs_map.get(d.domain_id, {})
            passed = dm.get("passed", 0)
            failed = dm.get("failed", 0) + dm.get("error", 0)
            total_runs = passed + failed
            score = round(passed / total_runs * 100, 1) if total_runs else None
            domain_rows.append({
                "domain": d.domain_name,
                "rules": rule_cnt_map.get(d.domain_id, 0),
                "passed": passed,
                "failed": failed,
                "score": score,
                "owner": d.owner_email,
            })
        ctx["domains"] = domain_rows

        # Intent-specific data
        # For diagnostic/overview intents, always pull recent runs and open alerts together
        diagnostic_intents = {'runs', 'global', 'domains', 'rules', 'assets'}
        if intent in diagnostic_intents:
            recent_runs = await db.execute(
                select(DQRuleRun, DQRule, DataAsset, Domain)
                .join(DQRule, DQRuleRun.rule_id == DQRule.rule_id)
                .join(DataAsset, DQRuleRun.asset_id == DataAsset.asset_id)
                .join(Domain, DQRuleRun.domain_id == Domain.domain_id)
                .order_by(desc(DQRuleRun.created_at))
                .limit(20)
            )
            rows = recent_runs.all()
            ctx["recent_runs"] = [
                {
                    "rule_name": r.DQRule.rule_name,
                    "rule_type": r.DQRule.rule_type,
                    "severity": r.DQRule.severity,
                    "table": f"{r.DataAsset.sf_schema_name}.{r.DataAsset.sf_table_name}",
                    "domain": r.Domain.domain_name,
                    "status": r.DQRuleRun.status,
                    "quality_score": r.DQRuleRun.quality_score,
                    "failed_rows": r.DQRuleRun.failed_rows_count,
                    "total_rows": r.DQRuleRun.total_rows_scanned,
                    "executed_at": str(r.DQRuleRun.created_at),
                }
                for r in rows
            ]

        if intent in ('alerts', 'global', 'domains', 'rules'):
            alert_q = await db.execute(
                select(DQAlert, Domain)
                .join(Domain, DQAlert.domain_id == Domain.domain_id)
                .where(DQAlert.alert_status == 'open')
                .order_by(desc(DQAlert.created_at))
                .limit(20)
            )
            ctx["open_alerts_detail"] = [
                {
                    "alert_message": r.DQAlert.alert_message,
                    "severity": r.DQAlert.severity,
                    "domain": r.Domain.domain_name,
                    "notification_channel": r.DQAlert.notification_channel,
                    "created_at": str(r.DQAlert.created_at),
                }
                for r in alert_q.all()
            ]

        if intent in ('rules', 'global'):
            rule_q = await db.execute(
                select(DQRule, DataAsset, Domain)
                .join(DataAsset, DQRule.asset_id == DataAsset.asset_id)
                .join(Domain, DQRule.domain_id == Domain.domain_id)
                .where(DQRule.is_active == True)
                .order_by(DQRule.severity)
                .limit(50)
            )
            ctx["rules"] = [
                {
                    "rule_name": r.DQRule.rule_name,
                    "rule_type": r.DQRule.rule_type,
                    "severity": r.DQRule.severity,
                    "status": r.DQRule.status,
                    "target_column": r.DQRule.target_column,
                    "table": f"{r.DataAsset.sf_schema_name}.{r.DataAsset.sf_table_name}",
                    "domain": r.Domain.domain_name,
                }
                for r in rule_q.all()
            ]

        if intent == 'schedules':
            sched_q = await db.execute(
                select(DQSchedule).where(DQSchedule.is_active == True).limit(30)
            )
            ctx["schedules"] = [
                {
                    "schedule_level": s.schedule_level,
                    "frequency": s.frequency,
                    "cron_expression": s.cron_expression,
                    "timezone": s.timezone,
                    "is_active": s.is_active,
                }
                for s in sched_q.scalars().all()
            ]

        if intent == 'assets':
            asset_q = await db.execute(
                select(DataAsset, Domain, Subdomain)
                .join(Domain, DataAsset.domain_id == Domain.domain_id)
                .join(Subdomain, DataAsset.subdomain_id == Subdomain.subdomain_id)
                .where(DataAsset.is_active == True)
                .limit(30)
            )
            ctx["assets"] = [
                {
                    "table": f"{r.DataAsset.sf_schema_name}.{r.DataAsset.sf_table_name}",
                    "domain": r.Domain.domain_name,
                    "subdomain": r.Subdomain.subdomain_name,
                    "criticality": r.DataAsset.criticality,
                    "owner_name": r.DataAsset.owner_name,
                    "owner_email": r.DataAsset.owner_email,
                }
                for r in asset_q.all()
            ]

    except Exception as e:
        logger.warning(f"Context gathering failed partially: {e}")
        ctx["context_error"] = str(e)

    return ctx


# ── Rule generation ───────────────────────────────────────────────────────────

async def generate_rules(
    domain: str, subdomain: str, table_name: str,
    columns: list[dict] | None, context: str | None,
    provider_name: str | None, db: AsyncSession,
) -> list[dict]:
    col_info = "\n".join(
        f"- {c['column_name']} ({c.get('data_type', 'unknown')})" for c in (columns or [])
    )
    prompt = (
        f"Generate 5-8 data quality rules for {domain} > {subdomain} > {table_name}.\n"
        f"Columns:\n{col_info or 'Not provided'}\n"
        f"Context: {context or 'None'}"
    )
    provider = await get_provider_from_db(provider_name, db)
    raw = await provider.complete(prompt, _SYS_RULE_GEN, max_tokens=1500)
    try:
        start = raw.find("[")
        end = raw.rfind("]") + 1
        return json.loads(raw[start:end]) if start >= 0 else []
    except Exception as e:
        logger.error(f"Failed to parse AI rules: {e}\nRaw: {raw}")
        return []


# ── Failure explanation ───────────────────────────────────────────────────────

async def explain_failure(
    run_id: str, rule_id: str, provider_name: str | None, db: AsyncSession
) -> str:
    run_res = await db.execute(select(DQRuleRun).where(DQRuleRun.run_id == run_id))
    run = run_res.scalar_one_or_none()
    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = rule_res.scalar_one_or_none()
    if not run or not rule:
        return "Rule run or rule not found."

    prompt = (
        f"Rule: {rule.rule_name} | Type: {rule.rule_type} | Column: {rule.target_column or 'N/A'} | "
        f"Severity: {rule.severity}\n"
        f"Failed: {run.failed_rows_count}/{run.total_rows_scanned} rows "
        f"({run.failure_percentage}%)\n"
        f"Error: {run.error_message or 'None'}\n"
        f"SQL: {(run.executed_sql or 'N/A')[:300]}"
    )
    provider = await get_provider_from_db(provider_name, db)
    return await provider.complete(prompt, _SYS_EXPLAIN, max_tokens=800)


# ── SQL generation ────────────────────────────────────────────────────────────

async def generate_sql(
    description: str, table_name: str, schema_name: str,
    database_name: str | None, columns: list[dict] | None,
    provider_name: str | None, db: AsyncSession,
) -> str:
    table_ref = (
        f'"{database_name}"."{schema_name}"."{table_name}"'
        if database_name else f'"{schema_name}"."{table_name}"'
    )
    col_info = "\n".join(
        f"- {c['column_name']} ({c.get('data_type', 'unknown')})" for c in (columns or [])
    )
    prompt = (
        f"Check: {description}\n"
        f"Table: {table_ref}\n"
        f"Columns:\n{col_info or 'Not provided'}"
    )
    provider = await get_provider_from_db(provider_name, db)
    return await provider.complete(prompt, _SYS_SQL_GEN, max_tokens=600)


# ── Table classification ──────────────────────────────────────────────────────

async def classify_table(
    table_name: str, columns: list[dict],
    provider_name: str | None, db: AsyncSession,
) -> dict:
    col_info = "\n".join(
        f"- {c['column_name']} ({c.get('data_type', 'unknown')})" for c in columns
    )
    prompt = f"Table: {table_name}\nColumns:\n{col_info}"
    provider = await get_provider_from_db(provider_name, db)
    raw = await provider.complete(prompt, _SYS_CLASSIFY, max_tokens=400)
    try:
        start, end = raw.find("{"), raw.rfind("}") + 1
        return json.loads(raw[start:end]) if start >= 0 else {}
    except Exception:
        return {"domain": "Others", "subdomain": "Custom", "reason": raw}


# ── Chat (with compressed context + bounded history) ─────────────────────────

async def chat(
    message: str,
    context: dict | None,
    provider_name: str | None,
    db: AsyncSession,
    history: list[dict] | None = None,
) -> str:
    if not context:
        context = await gather_platform_context(message, db)

    ctx_block = f"\n\nLive Platform Data:\n{_compress_context(context)}\n" if context else ""
    prompt = f"{ctx_block}\nQuestion: {message}"

    trimmed_history = _trim_history(history or [])
    messages: list[dict] = [{"role": "system", "content": PLATFORM_SYSTEM}]
    for h in trimmed_history:
        messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
    messages.append({"role": "user", "content": prompt})

    provider = await get_provider_from_db(provider_name, db)

    if hasattr(provider, 'complete_messages'):
        return await provider.complete_messages(messages)
    return await provider.complete(prompt, PLATFORM_SYSTEM, max_tokens=1500)


async def explain_incident(
    incident_id: str,
    provider_name: str | None,
    db: AsyncSession,
) -> str:
    """Explain a quality incident aggregating all related rule run failures."""
    from app.db.models import QualityIncident
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
