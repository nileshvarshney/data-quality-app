from pydantic_settings import BaseSettings
from typing import Optional

_WEAK_SECRET_KEYS = {
    "change-me-in-production-use-openssl-rand-hex-32",
    "change-me-in-production",
    "secret",
    "changeme",
    "",
}


class Settings(BaseSettings):
    app_env: str = "local"
    app_name: str = "Data Quality & Governance"
    debug: bool = False

    # Snowflake — used for both DQ rule execution AND platform data storage
    snowflake_account: str = ""
    snowflake_user: str = ""
    snowflake_password: str = ""
    snowflake_warehouse: str = "DQ_EXECUTION_WH"
    snowflake_profile_warehouse: str = "DQ_SMALL_WH"
    snowflake_database: str = ""   # source data database (for DQ checks)
    snowflake_schema: str = ""     # source data schema (for DQ checks)
    snowflake_role: str = "DQ_PLATFORM_ROLE"
    # Platform's own application tables live in a separate database/schema
    snowflake_app_database: str = "DQ_PLATFORM_DB"
    snowflake_app_schema: str = "DQ_APP"

    # LLM
    llm_provider: str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b-instruct"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str = ""
    claude_model: str = "claude-3-5-sonnet-latest"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Scheduler
    scheduler_type: str = "apscheduler"
    default_timezone: str = "America/Los_Angeles"

    # Security
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    # Key for Fernet encryption of credentials stored in the DB.
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    encryption_key: str = ""

    # Alerts & Notifications
    slack_webhook_url: str = ""
    teams_webhook_url: str = ""
    pagerduty_integration_key: str = ""
    alert_webhook_url: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "dq-platform@example.com"
    smtp_use_tls: bool = True
    alert_email_recipients: str = ""

    # Security
    # In production this MUST be True. Set AUTH_REQUIRED=false only for local dev.
    auth_required: bool = True
    allowed_origins: str = "http://localhost:3000,http://localhost:3001"
    rate_limit_per_minute: int = 120

    # OAuth2 / SSO
    google_client_id: str = ""
    google_client_secret: str = ""
    # Where Google redirects after consent (must match Google Cloud Console)
    oauth_redirect_uri: str = "http://localhost:8000/auth/oauth/google/callback"
    # Where the backend redirects after issuing tokens (frontend callback page)
    frontend_url: str = "http://localhost:3000"

    # ── Secrets backends (production) ────────────────────────────────────────
    # HashiCorp Vault — Vault Agent sidecar injects secrets as env vars by
    # default.  Set these only if you want the app itself to fetch from Vault.
    vault_addr: str = ""           # e.g. https://vault.example.com
    vault_token: str = ""          # or use VAULT_TOKEN env var directly
    vault_secret_path: str = ""    # KV v2 path, e.g. secret/data/dq-platform

    # AWS Secrets Manager — set to enable automatic secret resolution at startup.
    # The app calls GetSecretValue and merges the JSON into settings.
    aws_secrets_name: str = ""     # e.g. prod/dq-platform/secrets
    aws_region: str = "us-east-1"

    # Performance
    db_pool_size: int = 10
    db_max_overflow: int = 20
    execution_timeout_seconds: int = 300
    execution_max_retries: int = 3

    # Snowflake connection pool
    snowflake_pool_min_size: int = 1
    snowflake_pool_max_size: int = 5
    snowflake_pool_acquire_timeout: float = 30.0

    class Config:
        env_file = ".env"
        case_sensitive = False

    def is_weak_secret_key(self) -> bool:
        return self.secret_key.lower() in _WEAK_SECRET_KEYS or len(self.secret_key) < 32


settings = Settings()
