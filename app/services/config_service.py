import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import AppConfig
from app.core.encryption import encrypt, decrypt

logger = logging.getLogger("dq_platform.config")

MASKED = "***MASKED***"

# All platform-managed config keys with their defaults and metadata
CONFIG_DEFAULTS: list[dict] = [
    # General
    {"category": "general", "key": "app_name", "value": "Data Quality Platform", "is_secret": False, "description": "Display name shown in the UI and API"},
    {"category": "general", "key": "app_env", "value": "local", "is_secret": False, "description": "Environment: local, staging, or production"},
    {"category": "general", "key": "debug", "value": "true", "is_secret": False, "description": "Enable verbose SQL query logging (true/false)"},
    {"category": "general", "key": "display_timezone", "value": "America/Los_Angeles", "is_secret": False, "description": "Timezone used to display all timestamps across the UI"},

    # Database
    {"category": "database", "key": "database_url", "value": "postgresql+asyncpg://dquser:dqpass@localhost:5432/dqplatform", "is_secret": True, "description": "Async PostgreSQL connection URL (requires restart to take effect)"},
    {"category": "database", "key": "sync_database_url", "value": "postgresql://dquser:dqpass@localhost:5432/dqplatform", "is_secret": True, "description": "Sync PostgreSQL connection URL used by Alembic migrations"},

    # Snowflake
    {"category": "snowflake", "key": "snowflake_account", "value": "", "is_secret": False, "description": "Snowflake account identifier (e.g. myorg-myaccount)"},
    {"category": "snowflake", "key": "snowflake_user", "value": "", "is_secret": False, "description": "Snowflake service account username"},
    {"category": "snowflake", "key": "snowflake_password", "value": "", "is_secret": True, "description": "Snowflake service account password"},
    {"category": "snowflake", "key": "snowflake_warehouse", "value": "DQ_EXECUTION_WH", "is_secret": False, "description": "Snowflake warehouse used for rule execution"},
    {"category": "snowflake", "key": "snowflake_database", "value": "", "is_secret": False, "description": "Default Snowflake source database"},
    {"category": "snowflake", "key": "snowflake_schema", "value": "PUBLIC", "is_secret": False, "description": "Default Snowflake source schema"},
    {"category": "snowflake", "key": "snowflake_role", "value": "DQ_PLATFORM_ROLE", "is_secret": False, "description": "Snowflake role for the service account"},

    # LLM
    {"category": "llm", "key": "llm_provider", "value": "ollama", "is_secret": False, "description": "Active LLM provider: ollama, openai, claude, gemini_flash"},
    {"category": "llm", "key": "ollama_base_url", "value": "", "is_secret": False, "description": "Base URL for the Ollama API server"},
    {"category": "llm", "key": "ollama_model", "value": "qwen2.5:7b-instruct", "is_secret": False, "description": "Ollama model name (run 'ollama list' to see available models)"},
    {"category": "llm", "key": "openai_api_key", "value": "", "is_secret": True, "description": "OpenAI API key (starts with sk- or sk-proj-)"},
    {"category": "llm", "key": "openai_model", "value": "gpt-4o-mini", "is_secret": False, "description": "OpenAI model name"},
    {"category": "llm", "key": "anthropic_api_key", "value": "", "is_secret": True, "description": "Anthropic API key (starts with sk-ant-)"},
    {"category": "llm", "key": "claude_model", "value": "claude-3-5-sonnet-latest", "is_secret": False, "description": "Claude model name"},
    {"category": "llm", "key": "gemini_api_key", "value": "", "is_secret": True, "description": "Google AI API key (starts with AIza)"},
    {"category": "llm", "key": "gemini_model", "value": "gemini-2.5-flash", "is_secret": False, "description": "Gemini model name"},

    # Notifications
    {"category": "notifications", "key": "slack_webhook_url",          "value": "", "is_secret": True,  "description": "Global Slack incoming webhook URL"},
    {"category": "notifications", "key": "teams_webhook_url",          "value": "", "is_secret": True,  "description": "Microsoft Teams incoming webhook URL"},
    {"category": "notifications", "key": "pagerduty_integration_key",  "value": "", "is_secret": True,  "description": "PagerDuty Events API v2 integration key"},
    {"category": "notifications", "key": "alert_webhook_url",          "value": "", "is_secret": False, "description": "Generic JSON webhook URL for alert dispatch"},
    {"category": "notifications", "key": "alert_email_recipients",     "value": "", "is_secret": False, "description": "Comma-separated fallback alert email recipients"},
    {"category": "notifications", "key": "smtp_host",                  "value": "", "is_secret": False, "description": "SMTP server hostname"},
    {"category": "notifications", "key": "smtp_port",                  "value": "587", "is_secret": False, "description": "SMTP server port"},
    {"category": "notifications", "key": "smtp_user",                  "value": "", "is_secret": False, "description": "SMTP username"},
    {"category": "notifications", "key": "smtp_password",              "value": "", "is_secret": True,  "description": "SMTP password"},
    {"category": "notifications", "key": "smtp_from_email",            "value": "dq-platform@example.com", "is_secret": False, "description": "From address for alert emails"},
    # Scheduler
    {"category": "scheduler", "key": "default_timezone",          "value": "America/Los_Angeles", "is_secret": False, "description": "Default timezone for all scheduled rule runs"},
    {"category": "scheduler", "key": "scheduler_type",            "value": "apscheduler",         "is_secret": False, "description": "Scheduler backend (apscheduler)"},
    {"category": "scheduler", "key": "scheduler_enabled",         "value": "true",                "is_secret": False, "description": "Enable or disable the background scheduler entirely"},
    {"category": "scheduler", "key": "global_schedule_frequency", "value": "daily",               "is_secret": False, "description": "Global default schedule frequency: hourly, daily, weekly, monthly, cron, on_demand"},
    {"category": "scheduler", "key": "global_schedule_cron",      "value": "0 6 * * *",           "is_secret": False, "description": "Cron expression for global schedule when frequency=cron (default: 6 AM daily)"},

    # Governance
    {"category": "governance_config", "key": "auto_certify_enabled",       "value": "false", "is_secret": False, "description": "Automatically certify tables that meet quality thresholds for a consecutive period"},
    {"category": "governance_config", "key": "auto_certify_min_score",     "value": "95",    "is_secret": False, "description": "Minimum quality score (%) a table must sustain to be auto-certified"},
    {"category": "governance_config", "key": "auto_certify_min_rule_count","value": "3",     "is_secret": False, "description": "Minimum number of active passing rules required for auto-certification"},
    {"category": "governance_config", "key": "cert_required_after_days",   "value": "30",    "is_secret": False, "description": "Days after registration before a table is flagged as uncertified by policy"},

    # Quality Thresholds — used by dashboards and SLA breach detection
    {"category": "quality", "key": "sla_threshold",     "value": "95", "is_secret": False, "description": "Global SLA floor (%). Quality score below this triggers a breach and turns score red."},
    {"category": "quality", "key": "warning_threshold", "value": "85", "is_secret": False, "description": "Global warning level (%). Score below this turns score yellow before hitting SLA floor."},
    {"category": "quality", "key": "critical_penalty",  "value": "25", "is_secret": False, "description": "Points deducted from aggregate score per critical rule failure."},
    {"category": "quality", "key": "high_penalty",      "value": "15", "is_secret": False, "description": "Points deducted per high severity rule failure."},
    {"category": "quality", "key": "medium_penalty",    "value": "7",  "is_secret": False, "description": "Points deducted per medium severity rule failure."},
    {"category": "quality", "key": "low_penalty",       "value": "3",  "is_secret": False, "description": "Points deducted per low severity rule failure."},
]


async def seed_config(db: AsyncSession):
    for item in CONFIG_DEFAULTS:
        result = await db.execute(select(AppConfig).where(AppConfig.key == item["key"]))
        if not result.scalar_one_or_none():
            db.add(AppConfig(config_id=str(uuid.uuid4()), updated_at=datetime.now(timezone.utc).replace(tzinfo=None), **item))
    await db.commit()


async def get_all(db: AsyncSession) -> list[AppConfig]:
    result = await db.execute(select(AppConfig).order_by(AppConfig.category, AppConfig.key))
    return result.scalars().all()


async def get_by_category(category: str, db: AsyncSession) -> list[AppConfig]:
    result = await db.execute(
        select(AppConfig).where(AppConfig.category == category).order_by(AppConfig.key)
    )
    return result.scalars().all()


async def get_value(key: str, db: AsyncSession) -> str | None:
    """Return the config value, decrypting it if it is marked secret."""
    result = await db.execute(select(AppConfig).where(AppConfig.key == key))
    row = result.scalar_one_or_none()
    if row is None:
        return None
    if row.is_secret and row.value:
        return decrypt(row.value)
    return row.value


async def set_value(key: str, value: str, user: str, db: AsyncSession) -> AppConfig:
    result = await db.execute(select(AppConfig).where(AppConfig.key == key))
    row = result.scalar_one_or_none()
    if not row:
        raise ValueError(f"Unknown config key: {key}")
    if value != MASKED:
        row.value = encrypt(value) if row.is_secret and value else value
        row.updated_by = user
        row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.commit()
        await db.refresh(row)
    return row


async def bulk_update(updates: dict[str, str], user: str, db: AsyncSession) -> list[AppConfig]:
    updated = []
    for key, value in updates.items():
        if value == MASKED:
            continue
        result = await db.execute(select(AppConfig).where(AppConfig.key == key))
        row = result.scalar_one_or_none()
        if row:
            row.value = encrypt(value) if row.is_secret and value else value
            row.updated_by = user
            row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            updated.append(row)
    await db.commit()
    return updated


def mask(row: AppConfig) -> dict:
    return {
        "config_id": row.config_id,
        "category": row.category,
        "key": row.key,
        "value": MASKED if row.is_secret and row.value else row.value,
        "is_secret": row.is_secret,
        "description": row.description,
        "updated_by": row.updated_by,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "has_value": bool(row.value),
    }
