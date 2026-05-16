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
            "ALTER TABLE data_assets ADD COLUMN IF NOT EXISTS view_definition TEXT",
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
            """CREATE TABLE IF NOT EXISTS column_profile_history (
                history_id VARCHAR(36) PRIMARY KEY,
                asset_id VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id) ON DELETE CASCADE,
                column_name VARCHAR(255) NOT NULL,
                profile_date DATE NOT NULL,
                null_count BIGINT,
                unique_count BIGINT,
                row_count BIGINT,
                cardinality_pct FLOAT,
                top_values TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE (asset_id, column_name, profile_date)
            )""",
            "CREATE INDEX IF NOT EXISTS ix_col_profile_history_asset_date ON column_profile_history(asset_id, profile_date)",
            "CREATE INDEX IF NOT EXISTS ix_col_profile_history_asset_col_date ON column_profile_history(asset_id, column_name, profile_date)",
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
            """CREATE TABLE IF NOT EXISTS data_objects (
                object_id VARCHAR(36) PRIMARY KEY,
                object_name VARCHAR(200) NOT NULL,
                object_type VARCHAR(30) NOT NULL,
                database_name VARCHAR(100) NOT NULL,
                schema_name VARCHAR(100) NOT NULL,
                domain VARCHAR(100),
                sub_domain VARCHAR(100),
                owner VARCHAR(200),
                quality_score FLOAT,
                status VARCHAR(50),
                certification_status VARCHAR(50),
                tags JSONB,
                last_refreshed_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS data_object_relationships (
                relationship_id VARCHAR(36) PRIMARY KEY,
                source_object_id VARCHAR(36) NOT NULL REFERENCES data_objects(object_id) ON DELETE CASCADE,
                target_object_id VARCHAR(36) NOT NULL REFERENCES data_objects(object_id) ON DELETE CASCADE,
                relationship_type VARCHAR(30) NOT NULL,
                transformation_logic TEXT,
                confidence_score FLOAT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            """CREATE TABLE IF NOT EXISTS data_object_columns (
                column_id VARCHAR(36) PRIMARY KEY,
                object_id VARCHAR(36) NOT NULL REFERENCES data_objects(object_id) ON DELETE CASCADE,
                column_name VARCHAR(200) NOT NULL,
                data_type VARCHAR(100),
                ordinal_position INTEGER,
                is_nullable BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )""",
            "CREATE INDEX IF NOT EXISTS ix_rel_source ON data_object_relationships(source_object_id)",
            "CREATE INDEX IF NOT EXISTS ix_rel_target ON data_object_relationships(target_object_id)",
            "CREATE INDEX IF NOT EXISTS ix_doc_object_id ON data_object_columns(object_id)",
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


async def seed_lineage_data():
    """Insert sample lineage objects idempotently. Safe to call on every startup."""
    try:
        from sqlalchemy import text

        async with AsyncSessionLocal() as session:
            # Check if already seeded
            result = await session.execute(text("SELECT COUNT(*) FROM data_objects"))
            if result.scalar() > 0:
                return

            # 10 sample objects
            objects = [
                # HR lineage chain
                {"object_id": "obj-emp-001", "object_name": "emp", "object_type": "TABLE",
                 "database_name": "PROD_DB", "schema_name": "HR_SCHEMA", "domain": "HR",
                 "sub_domain": "Workforce", "owner": "hr@acme.com", "quality_score": 92.0,
                 "status": "active", "certification_status": "certified", "tags": ["hr", "employees"]},
                {"object_id": "obj-dept-001", "object_name": "dept", "object_type": "TABLE",
                 "database_name": "PROD_DB", "schema_name": "HR_SCHEMA", "domain": "HR",
                 "sub_domain": "Workforce", "owner": "hr@acme.com", "quality_score": 88.0,
                 "status": "active", "certification_status": "certified", "tags": ["hr", "departments"]},
                {"object_id": "obj-salary-001", "object_name": "salary", "object_type": "TABLE",
                 "database_name": "PROD_DB", "schema_name": "HR_SCHEMA", "domain": "HR",
                 "sub_domain": "Compensation", "owner": "hr@acme.com", "quality_score": 95.0,
                 "status": "active", "certification_status": "certified", "tags": ["hr", "payroll"]},
                {"object_id": "obj-emptview-001", "object_name": "emp_dept_v", "object_type": "VIEW",
                 "database_name": "PROD_DB", "schema_name": "HR_SCHEMA", "domain": "HR",
                 "sub_domain": "Workforce", "owner": "hr@acme.com", "quality_score": 74.0,
                 "status": "active", "certification_status": "certified", "tags": ["hr", "payroll"]},
                {"object_id": "obj-empdsal-001", "object_name": "emp_dept_sal_v", "object_type": "VIEW",
                 "database_name": "PROD_DB", "schema_name": "HR_SCHEMA", "domain": "HR",
                 "sub_domain": "Compensation", "owner": "hr@acme.com", "quality_score": 81.0,
                 "status": "active", "certification_status": None, "tags": ["hr", "payroll"]},
                {"object_id": "obj-empsum-001", "object_name": "emp_summary_mv", "object_type": "MATERIALIZED_VIEW",
                 "database_name": "PROD_DB", "schema_name": "HR_SCHEMA", "domain": "HR",
                 "sub_domain": "Analytics", "owner": "analytics@acme.com", "quality_score": 78.0,
                 "status": "active", "certification_status": None, "tags": ["hr", "analytics"]},
                {"object_id": "obj-highear-001", "object_name": "high_earners_v", "object_type": "VIEW",
                 "database_name": "PROD_DB", "schema_name": "HR_SCHEMA", "domain": "HR",
                 "sub_domain": "Analytics", "owner": "analytics@acme.com", "quality_score": 85.0,
                 "status": "active", "certification_status": None, "tags": ["hr"]},
                # Sales lineage chain
                {"object_id": "obj-products-001", "object_name": "products", "object_type": "TABLE",
                 "database_name": "PROD_DB", "schema_name": "SALES_SCHEMA", "domain": "Sales",
                 "sub_domain": "Catalog", "owner": "sales@acme.com", "quality_score": 90.0,
                 "status": "active", "certification_status": "certified", "tags": ["sales", "products"]},
                {"object_id": "obj-orders-001", "object_name": "orders", "object_type": "TABLE",
                 "database_name": "PROD_DB", "schema_name": "SALES_SCHEMA", "domain": "Sales",
                 "sub_domain": "Transactions", "owner": "sales@acme.com", "quality_score": 87.0,
                 "status": "active", "certification_status": "certified", "tags": ["sales", "orders"]},
                {"object_id": "obj-prodsales-001", "object_name": "product_sales_v", "object_type": "VIEW",
                 "database_name": "PROD_DB", "schema_name": "SALES_SCHEMA", "domain": "Sales",
                 "sub_domain": "Analytics", "owner": "sales@acme.com", "quality_score": 83.0,
                 "status": "active", "certification_status": None, "tags": ["sales"]},
                {"object_id": "obj-revdaily-001", "object_name": "revenue_daily_mv", "object_type": "MATERIALIZED_VIEW",
                 "database_name": "PROD_DB", "schema_name": "SALES_SCHEMA", "domain": "Sales",
                 "sub_domain": "Analytics", "owner": "analytics@acme.com", "quality_score": 91.0,
                 "status": "active", "certification_status": "certified", "tags": ["sales", "revenue"]},
            ]

            for obj in objects:
                tags = obj.pop("tags")
                await session.execute(text("""
                    INSERT INTO data_objects
                    (object_id, object_name, object_type, database_name, schema_name, domain, sub_domain,
                     owner, quality_score, status, certification_status, tags, created_at, updated_at)
                    VALUES (:object_id, :object_name, :object_type, :database_name, :schema_name,
                            :domain, :sub_domain, :owner, :quality_score, :status, :certification_status,
                            :tags::jsonb, NOW(), NOW())
                    ON CONFLICT (object_id) DO NOTHING
                """), {**obj, "tags": str(tags).replace("'", '"')})

            # Relationships
            relationships = [
                # HR chain: emp + dept → emp_dept_v (JOINS_WITH)
                {"relationship_id": "rel-001", "source_object_id": "obj-emp-001", "target_object_id": "obj-emptview-001", "relationship_type": "JOINS_WITH", "confidence_score": 1.0},
                {"relationship_id": "rel-002", "source_object_id": "obj-dept-001", "target_object_id": "obj-emptview-001", "relationship_type": "JOINS_WITH", "confidence_score": 1.0},
                # emp_dept_v + salary → emp_dept_sal_v (READS_FROM)
                {"relationship_id": "rel-003", "source_object_id": "obj-emptview-001", "target_object_id": "obj-empdsal-001", "relationship_type": "READS_FROM", "confidence_score": 1.0},
                {"relationship_id": "rel-004", "source_object_id": "obj-salary-001", "target_object_id": "obj-empdsal-001", "relationship_type": "READS_FROM", "confidence_score": 1.0},
                # emp_dept_sal_v → emp_summary_mv (AGGREGATES_FROM)
                {"relationship_id": "rel-005", "source_object_id": "obj-empdsal-001", "target_object_id": "obj-empsum-001", "relationship_type": "AGGREGATES_FROM", "confidence_score": 1.0},
                # emp_summary_mv → high_earners_v (DERIVED_FROM)
                {"relationship_id": "rel-006", "source_object_id": "obj-empsum-001", "target_object_id": "obj-highear-001", "relationship_type": "DERIVED_FROM", "confidence_score": 0.95},
                # Sales chain: products + orders → product_sales_v (READS_FROM)
                {"relationship_id": "rel-007", "source_object_id": "obj-products-001", "target_object_id": "obj-prodsales-001", "relationship_type": "READS_FROM", "confidence_score": 1.0},
                {"relationship_id": "rel-008", "source_object_id": "obj-orders-001", "target_object_id": "obj-prodsales-001", "relationship_type": "READS_FROM", "confidence_score": 1.0},
                # product_sales_v → revenue_daily_mv (TRANSFORMS)
                {"relationship_id": "rel-009", "source_object_id": "obj-prodsales-001", "target_object_id": "obj-revdaily-001", "relationship_type": "TRANSFORMS", "confidence_score": 1.0},
            ]

            for rel in relationships:
                await session.execute(text("""
                    INSERT INTO data_object_relationships
                    (relationship_id, source_object_id, target_object_id, relationship_type, confidence_score, created_at, updated_at)
                    VALUES (:relationship_id, :source_object_id, :target_object_id, :relationship_type, :confidence_score, NOW(), NOW())
                    ON CONFLICT (relationship_id) DO NOTHING
                """), rel)

            # Sample columns for emp_dept_v
            columns = [
                {"column_id": "col-001", "object_id": "obj-emptview-001", "column_name": "emp_id", "data_type": "INTEGER", "ordinal_position": 1, "is_nullable": False},
                {"column_id": "col-002", "object_id": "obj-emptview-001", "column_name": "emp_name", "data_type": "VARCHAR", "ordinal_position": 2, "is_nullable": False},
                {"column_id": "col-003", "object_id": "obj-emptview-001", "column_name": "dept_id", "data_type": "INTEGER", "ordinal_position": 3, "is_nullable": True},
                {"column_id": "col-004", "object_id": "obj-emptview-001", "column_name": "dept_name", "data_type": "VARCHAR", "ordinal_position": 4, "is_nullable": True},
                {"column_id": "col-005", "object_id": "obj-emptview-001", "column_name": "hire_date", "data_type": "DATE", "ordinal_position": 5, "is_nullable": True},
                # emp table columns
                {"column_id": "col-010", "object_id": "obj-emp-001", "column_name": "emp_id", "data_type": "INTEGER", "ordinal_position": 1, "is_nullable": False},
                {"column_id": "col-011", "object_id": "obj-emp-001", "column_name": "emp_name", "data_type": "VARCHAR", "ordinal_position": 2, "is_nullable": False},
                {"column_id": "col-012", "object_id": "obj-emp-001", "column_name": "dept_id", "data_type": "INTEGER", "ordinal_position": 3, "is_nullable": True},
                {"column_id": "col-013", "object_id": "obj-emp-001", "column_name": "hire_date", "data_type": "DATE", "ordinal_position": 4, "is_nullable": True},
                # salary table columns
                {"column_id": "col-020", "object_id": "obj-salary-001", "column_name": "emp_id", "data_type": "INTEGER", "ordinal_position": 1, "is_nullable": False},
                {"column_id": "col-021", "object_id": "obj-salary-001", "column_name": "salary_amount", "data_type": "NUMERIC", "ordinal_position": 2, "is_nullable": False},
                {"column_id": "col-022", "object_id": "obj-salary-001", "column_name": "effective_date", "data_type": "DATE", "ordinal_position": 3, "is_nullable": False},
            ]

            for col in columns:
                await session.execute(text("""
                    INSERT INTO data_object_columns
                    (column_id, object_id, column_name, data_type, ordinal_position, is_nullable, created_at, updated_at)
                    VALUES (:column_id, :object_id, :column_name, :data_type, :ordinal_position, :is_nullable, NOW(), NOW())
                    ON CONFLICT (column_id) DO NOTHING
                """), col)

            await session.commit()
    except Exception as e:
        import logging
        logging.getLogger("dq_platform").warning(f"seed_lineage_data skipped: {e}")
