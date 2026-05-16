from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    # Connection pool — sized from config; default 10 connections, 20 overflow
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=30,
    pool_recycle=1800,          # recycle idle connections every 30 min
    pool_pre_ping=True,         # check liveness before handing out
    pool_use_lifo=True,         # LIFO keeps fewer connections warm
    connect_args={"timeout": 10, "command_timeout": 30},
)
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,     # avoid extra SELECT after commit
)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Safe migrations — add columns that may not exist yet
        migrations = [
            # Column additions
            "ALTER TABLE data_assets ADD COLUMN IF NOT EXISTS connection_id VARCHAR(36)",
            "ALTER TABLE snowflake_connections ADD COLUMN IF NOT EXISTS default_schema VARCHAR(200)",
            "ALTER TABLE dq_schedules ADD COLUMN IF NOT EXISTS run_at_hour INTEGER",
            "ALTER TABLE dq_schedules ADD COLUMN IF NOT EXISTS run_at_minute INTEGER",
            "ALTER TABLE dq_schedules ADD COLUMN IF NOT EXISTS rule_ids TEXT",
            "ALTER TABLE dq_rules ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1",
            "ALTER TABLE dq_rules ADD COLUMN IF NOT EXISTS sla_threshold FLOAT",
            "ALTER TABLE dq_alerts ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE",
            "ALTER TABLE dq_alerts ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP",
            "ALTER TABLE dq_alerts ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(200)",
            # Performance indexes on hot-path tables
            "CREATE INDEX IF NOT EXISTS ix_rule_runs_rule_created   ON dq_rule_runs(rule_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_rule_runs_asset_created  ON dq_rule_runs(asset_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_rule_runs_domain_status  ON dq_rule_runs(domain_id, status)",
            "CREATE INDEX IF NOT EXISTS ix_rule_runs_subdomain      ON dq_rule_runs(subdomain_id)",
            "CREATE INDEX IF NOT EXISTS ix_rule_runs_status         ON dq_rule_runs(status)",
            "CREATE INDEX IF NOT EXISTS ix_rule_runs_created_at     ON dq_rule_runs(created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_quality_scores_date_level     ON dq_quality_scores(score_date, score_level)",
            "CREATE INDEX IF NOT EXISTS ix_quality_scores_date_domain    ON dq_quality_scores(score_date, domain_id)",
            "CREATE INDEX IF NOT EXISTS ix_quality_scores_date_subdomain ON dq_quality_scores(score_date, subdomain_id)",
            "CREATE INDEX IF NOT EXISTS ix_quality_scores_date_asset     ON dq_quality_scores(score_date, asset_id)",
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at    ON audit_logs(created_at DESC)",
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_entity        ON audit_logs(entity_type, entity_id)",
            "CREATE INDEX IF NOT EXISTS ix_audit_logs_user_email    ON audit_logs(user_email)",
            # OAuth2 / SSO
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(200)",
            "CREATE INDEX IF NOT EXISTS ix_users_oauth_id ON users(oauth_id)",
            # Service accounts (API key auth)
            """CREATE TABLE IF NOT EXISTS service_accounts (
                sa_id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(200) NOT NULL UNIQUE,
                description TEXT,
                key_prefix VARCHAR(8) NOT NULL,
                key_hash TEXT NOT NULL,
                role VARCHAR(30) NOT NULL DEFAULT 'viewer',
                domain_id VARCHAR(36),
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by VARCHAR(200),
                last_used_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS ix_sa_key_prefix ON service_accounts(key_prefix)",
            # ---------------------------------------------------------------
            # §53-§68  new tables
            # ---------------------------------------------------------------
            """CREATE TABLE IF NOT EXISTS glossary_terms (
                term_id VARCHAR(36) PRIMARY KEY,
                term_name VARCHAR(200) NOT NULL UNIQUE,
                definition TEXT NOT NULL,
                examples TEXT,
                synonyms TEXT,
                domain_id VARCHAR(36),
                owner_email VARCHAR(200),
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                parent_term_id VARCHAR(36),
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS glossary_term_assets (
                id VARCHAR(36) PRIMARY KEY,
                term_id VARCHAR(36) NOT NULL REFERENCES glossary_terms(term_id),
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                column_name VARCHAR(200),
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS ix_glossary_term_assets_term ON glossary_term_assets(term_id)",
            """CREATE TABLE IF NOT EXISTS data_classifications (
                classification_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                column_name VARCHAR(200),
                classification VARCHAR(30) NOT NULL,
                justification TEXT,
                applied_by VARCHAR(200),
                reviewed_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS ix_data_classifications_asset ON data_classifications(asset_id)",
            """CREATE TABLE IF NOT EXISTS column_metadata (
                col_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                column_name VARCHAR(200) NOT NULL,
                data_type VARCHAR(100),
                is_nullable BOOLEAN,
                description TEXT,
                sample_values TEXT,
                is_primary_key BOOLEAN NOT NULL DEFAULT FALSE,
                is_foreign_key BOOLEAN NOT NULL DEFAULT FALSE,
                references_table VARCHAR(200),
                null_count BIGINT,
                unique_count BIGINT,
                min_value TEXT,
                max_value TEXT,
                avg_value FLOAT,
                cardinality_pct FLOAT,
                last_profiled_at TIMESTAMP,
                updated_by VARCHAR(200),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE (asset_id, column_name)
            )""",
            "CREATE INDEX IF NOT EXISTS ix_col_meta_asset ON column_metadata(asset_id)",
            """CREATE TABLE IF NOT EXISTS data_products (
                product_id VARCHAR(36) PRIMARY KEY,
                product_name VARCHAR(200) NOT NULL,
                description TEXT,
                domain_id VARCHAR(36) REFERENCES domains(domain_id),
                owner_email VARCHAR(200),
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                tags TEXT,
                readme TEXT,
                version VARCHAR(20) NOT NULL DEFAULT '1.0',
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS data_product_assets (
                id VARCHAR(36) PRIMARY KEY,
                product_id VARCHAR(36) NOT NULL REFERENCES data_products(product_id),
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                role VARCHAR(50),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS asset_comments (
                comment_id VARCHAR(36) PRIMARY KEY,
                entity_type VARCHAR(30) NOT NULL,
                entity_id VARCHAR(36) NOT NULL,
                parent_id VARCHAR(36),
                body TEXT NOT NULL,
                comment_type VARCHAR(20) NOT NULL DEFAULT 'comment',
                is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
                author_email VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS ix_asset_comments_entity ON asset_comments(entity_type, entity_id)",
            """CREATE TABLE IF NOT EXISTS asset_usage (
                usage_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                event_type VARCHAR(30) NOT NULL,
                user_email VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS ix_asset_usage_asset ON asset_usage(asset_id, created_at DESC)",
            """CREATE TABLE IF NOT EXISTS asset_ratings (
                rating_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                rating SMALLINT NOT NULL,
                review TEXT,
                user_email VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE (asset_id, user_email)
            )""",
            """CREATE TABLE IF NOT EXISTS asset_announcements (
                announcement_id VARCHAR(36) PRIMARY KEY,
                entity_type VARCHAR(30) NOT NULL,
                entity_id VARCHAR(36),
                title VARCHAR(200) NOT NULL,
                body TEXT,
                announcement_type VARCHAR(20) NOT NULL,
                expires_at TIMESTAMP,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS access_requests (
                request_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                requester_email VARCHAR(200) NOT NULL,
                requester_name VARCHAR(200),
                reason TEXT NOT NULL,
                access_level VARCHAR(20) NOT NULL DEFAULT 'read',
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                reviewer_email VARCHAR(200),
                review_note TEXT,
                expires_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS tags (
                tag_id VARCHAR(36) PRIMARY KEY,
                tag_name VARCHAR(100) NOT NULL UNIQUE,
                color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
                description TEXT,
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS asset_tags (
                id VARCHAR(36) PRIMARY KEY,
                tag_id VARCHAR(36) NOT NULL REFERENCES tags(tag_id),
                entity_type VARCHAR(30) NOT NULL,
                entity_id VARCHAR(36) NOT NULL,
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE (tag_id, entity_type, entity_id)
            )""",
            """CREATE TABLE IF NOT EXISTS custom_attributes (
                attr_id VARCHAR(36) PRIMARY KEY,
                attr_key VARCHAR(100) NOT NULL,
                attr_value TEXT,
                entity_type VARCHAR(30) NOT NULL,
                entity_id VARCHAR(36) NOT NULL,
                updated_by VARCHAR(200),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE (attr_key, entity_type, entity_id)
            )""",
            """CREATE TABLE IF NOT EXISTS anomaly_detectors (
                detector_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                column_name VARCHAR(200),
                detector_type VARCHAR(30) NOT NULL,
                config JSON,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                last_trained_at TIMESTAMP,
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS anomaly_detections (
                detection_id VARCHAR(36) PRIMARY KEY,
                detector_id VARCHAR(36) NOT NULL REFERENCES anomaly_detectors(detector_id),
                asset_id VARCHAR(36) NOT NULL,
                run_id VARCHAR(36),
                column_name VARCHAR(200),
                anomaly_type VARCHAR(50),
                severity VARCHAR(20),
                observed_value TEXT,
                expected_range TEXT,
                confidence FLOAT,
                detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
                is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE
            )""",
            "CREATE INDEX IF NOT EXISTS ix_anomaly_detections_asset ON anomaly_detections(detector_id)",
            """CREATE TABLE IF NOT EXISTS quality_cost_configs (
                config_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) REFERENCES data_assets(asset_id),
                domain_id VARCHAR(36) REFERENCES domains(domain_id),
                cost_per_failed_row FLOAT,
                cost_per_incident FLOAT,
                revenue_impact_pct FLOAT,
                currency VARCHAR(3) NOT NULL DEFAULT 'USD',
                updated_by VARCHAR(200),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS quality_incidents (
                incident_id VARCHAR(36) PRIMARY KEY,
                title VARCHAR(200),
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                severity VARCHAR(20),
                status VARCHAR(20) NOT NULL DEFAULT 'open',
                trigger_run_id VARCHAR(36),
                alert_id VARCHAR(36),
                rca_report JSON,
                timeline JSON,
                resolved_by VARCHAR(200),
                ttd_minutes INTEGER,
                ttr_minutes INTEGER,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                resolved_at TIMESTAMP
            )""",
            "CREATE INDEX IF NOT EXISTS ix_quality_incidents_asset ON quality_incidents(asset_id)",
            """CREATE TABLE IF NOT EXISTS compliance_frameworks (
                framework_id VARCHAR(36) PRIMARY KEY,
                framework_name VARCHAR(100) NOT NULL UNIQUE,
                version VARCHAR(20),
                description TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE
            )""",
            """CREATE TABLE IF NOT EXISTS compliance_requirements (
                req_id VARCHAR(36) PRIMARY KEY,
                framework_id VARCHAR(36) NOT NULL REFERENCES compliance_frameworks(framework_id),
                req_code VARCHAR(50),
                req_name VARCHAR(200),
                req_description TEXT,
                dq_rule_types TEXT
            )""",
            """CREATE TABLE IF NOT EXISTS compliance_mappings (
                mapping_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                framework_id VARCHAR(36) NOT NULL REFERENCES compliance_frameworks(framework_id),
                req_id VARCHAR(36) REFERENCES compliance_requirements(req_id),
                rule_id VARCHAR(36) REFERENCES dq_rules(rule_id),
                status VARCHAR(20) NOT NULL DEFAULT 'mapped',
                evidence_note TEXT,
                mapped_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS governance_policies (
                policy_id VARCHAR(36) PRIMARY KEY,
                policy_name VARCHAR(200) NOT NULL,
                policy_type VARCHAR(50) NOT NULL,
                description TEXT,
                severity VARCHAR(20) NOT NULL DEFAULT 'medium',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                config JSON,
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS policy_violations (
                violation_id VARCHAR(36) PRIMARY KEY,
                policy_id VARCHAR(36) NOT NULL REFERENCES governance_policies(policy_id),
                entity_type VARCHAR(30) NOT NULL,
                entity_id VARCHAR(36) NOT NULL,
                violation_detail TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'open',
                detected_at TIMESTAMP NOT NULL DEFAULT NOW(),
                resolved_at TIMESTAMP
            )""",
            "CREATE INDEX IF NOT EXISTS ix_policy_violations_entity ON policy_violations(entity_type, entity_id)",
            """CREATE TABLE IF NOT EXISTS data_contracts (
                contract_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                contract_name VARCHAR(200) NOT NULL,
                version VARCHAR(20) NOT NULL DEFAULT '1.0',
                producer_team VARCHAR(200),
                consumer_team VARCHAR(200),
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                schema_json JSON,
                min_quality_score FLOAT NOT NULL DEFAULT 95.0,
                max_null_pct FLOAT,
                max_staleness_hours INTEGER NOT NULL DEFAULT 24,
                sla_description TEXT,
                breach_action VARCHAR(50),
                effective_from DATE,
                effective_until DATE,
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS rule_templates (
                template_id VARCHAR(36) PRIMARY KEY,
                template_name VARCHAR(200) NOT NULL,
                description TEXT,
                rule_type VARCHAR(50) NOT NULL,
                default_config JSON,
                target_domains TEXT,
                target_industries TEXT,
                tags TEXT,
                author_email VARCHAR(200),
                is_public BOOLEAN NOT NULL DEFAULT FALSE,
                downloads INTEGER NOT NULL DEFAULT 0,
                rating FLOAT NOT NULL DEFAULT 0.0,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS oncall_schedules (
                schedule_id VARCHAR(36) PRIMARY KEY,
                domain_id VARCHAR(36) REFERENCES domains(domain_id),
                oncall_email VARCHAR(200) NOT NULL,
                oncall_slack VARCHAR(200),
                pagerduty_key VARCHAR(200),
                effective_from TIMESTAMP NOT NULL,
                effective_until TIMESTAMP NOT NULL,
                timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS incident_runbooks (
                runbook_id VARCHAR(36) PRIMARY KEY,
                rule_id VARCHAR(36) REFERENCES dq_rules(rule_id),
                title VARCHAR(200),
                steps TEXT NOT NULL,
                escalation_path TEXT,
                related_dashboards TEXT,
                created_by VARCHAR(200),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS data_lineage (
                lineage_id VARCHAR(36) PRIMARY KEY,
                upstream_asset_id VARCHAR(36) REFERENCES data_assets(asset_id),
                downstream_asset_id VARCHAR(36) REFERENCES data_assets(asset_id),
                lineage_type VARCHAR(30),
                downstream_name VARCHAR(200),
                downstream_type VARCHAR(50),
                transformation_sql TEXT,
                description TEXT,
                owner_email VARCHAR(200),
                is_critical BOOLEAN NOT NULL DEFAULT FALSE,
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS ix_lineage_upstream ON data_lineage(upstream_asset_id)",
            "CREATE INDEX IF NOT EXISTS ix_lineage_downstream ON data_lineage(downstream_asset_id)",
            """CREATE TABLE IF NOT EXISTS data_sharing_agreements (
                agreement_id VARCHAR(36) PRIMARY KEY,
                producer_domain_id VARCHAR(36) NOT NULL REFERENCES domains(domain_id),
                consumer_domain_id VARCHAR(36) NOT NULL REFERENCES domains(domain_id),
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                quality_sla FLOAT NOT NULL,
                freshness_sla INTEGER NOT NULL,
                breach_action VARCHAR(30),
                effective_from DATE,
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                signed_by_producer VARCHAR(200),
                signed_by_consumer VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS masking_policies (
                policy_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
                column_name VARCHAR(200) NOT NULL,
                masking_type VARCHAR(30) NOT NULL,
                applies_to_roles TEXT,
                unmasked_roles TEXT,
                created_by VARCHAR(200),
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE (asset_id, column_name)
            )""",
        ]
        for sql in migrations:
            try:
                await conn.execute(__import__('sqlalchemy').text(sql))
            except Exception:
                pass
