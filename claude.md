# CLAUDE.md

# Project: AI/LLM-Powered Enterprise Snowflake Data Quality Platform

## 1. Goal

Build an enterprise-grade Data Quality platform for Snowflake using Python.

The platform should allow data engineering teams to define, store, schedule, execute, monitor, and explain data quality rules across multiple business domains such as Revenue, Finance, Operations, Planning, GTM, HR, and Others.

The system must support domain-level, subdomain-level, schema-level, and table-level visibility. It should also include AI/LLM capabilities to suggest rules, explain failures, generate SQL checks, and help data engineers troubleshoot data quality issues.

---

## 2. Target Users

### Primary Users

- Data Engineers
- Analytics Engineers
- Data Platform Engineers
- Data Governance Teams
- Data Quality Owners

### Secondary Users

- Business Analysts
- Finance Analysts
- Revenue Operations Teams
- HR Operations Teams
- GTM Operations Teams
- Leadership and Data Owners

---

## 3. Business Domains

The application must support multiple business domains.

### Required Domains

1. Revenue
2. Finance
3. Operations
4. Planning
5. GTM
6. HR
7. Others

Each domain can have multiple subdomains.

---

## 4. Domain and Subdomain Examples

### Revenue

Subdomains:

- Billing
- Sales
- Subscriptions
- Pricing
- Invoice Management

Example rules:

- Invoice ID should not be null
- Invoice amount should be greater than or equal to zero
- No duplicate invoice ID
- Revenue date should not be in the future
- Subscription status should be valid

### Finance

Subdomains:

- General Ledger
- Accounts Payable
- Accounts Receivable
- Expenses
- Forecasting

Example rules:

- Debit and credit should balance
- GL account should not be null
- Transaction amount should not be zero
- Month-end data should be complete
- No duplicate journal entry ID

### Operations

Subdomains:

- Inventory
- Fulfillment
- Logistics
- Supply Chain

Example rules:

- Inventory quantity should not be negative
- Shipment date should be greater than or equal to order date
- Order ID should exist in order master table
- No orphan shipment records

### Planning

Subdomains:

- Demand Planning
- Workforce Planning
- Capacity Planning
- Forecast Planning

Example rules:

- Forecast period should not be null
- Forecast value should be within expected range
- Forecast version should be valid
- Planning table should be refreshed before SLA time

### GTM

Subdomains:

- Leads
- Campaigns
- Marketing
- Sales Pipeline
- Customer Acquisition

Example rules:

- Lead email should be valid
- Campaign start date should be before campaign end date
- Opportunity stage should be valid
- Conversion rate should be between 0 and 100

### HR

Subdomains:

- Employees
- Payroll
- Hiring
- Attendance
- Benefits

Example rules:

- Employee ID should be unique
- Salary should be greater than zero
- Joining date should be before exit date
- Payroll record should exist for active employees

### Others

Subdomains:

- Product
- Support
- Analytics
- Custom

---

## 5. Core Platform Requirements

The platform must provide the following capabilities:

1. Store all data quality rules in a database
2. Support domain, subdomain, schema, and table mapping
3. Support rule scheduling and execution frequency
4. Execute rules against Snowflake tables
5. Store rule execution results historically
6. Show current and historical data quality scores
7. Provide dashboard views at table, subdomain, and domain level
8. Support alerting when critical rules fail
9. Support AI/LLM rule generation and failure explanation
10. Support enterprise governance, ownership, audit logging, and RBAC

---

## 6. High-Level Architecture

```text
                        +----------------------+
                        |      Dashboard       |
                        |  React / Next.js   |
                        +----------+-----------+
                                   |
                                   v
                        +----------------------+
                        |      FastAPI API     |
                        | Rule Mgmt / Results  |
                        +----------+-----------+
                                   |
           +-----------------------+-----------------------+
           |                                               |
           v                                               v
+----------------------+                         +----------------------+
| Snowflake Metadata DB|                         |    LLM Service       |
| Rules / Runs / Audit |                         | OpenAI/Gemini/Ollama |
+----------+-----------+                         +----------+-----------+
           |                                                |
           v                                                v
+----------------------+                         +----------------------+
| Rule Execution Engine|                         | AI Rule Suggestions  |
| Python + Snowflake SQL|                         | Failure Explanation  |
+----------+-----------+                         +----------------------+
           |
           v
+----------------------+
|      Snowflake       |
| Source Data Tables   |
| INFORMATION_SCHEMA   |
| ACCOUNT_USAGE        |
+----------+-----------+
           |
           v
+----------------------+
| Snowflake Result DB  |
| Historical Metrics   |
+----------------------+
```

---

## 7. Recommended Tech Stack

### Backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy
- Alembic

### Data Warehouse

- Snowflake

### Metadata Store

Preferred option:

- Snowflake metadata tables

Recommended Snowflake layout:

```text
DQ_PLATFORM_DB
  METADATA_SCHEMA
    DOMAINS
    SUBDOMAINS
    DATA_ASSETS
    DQ_RULES
    DQ_SCHEDULES
    AUDIT_LOGS

  RESULTS_SCHEMA
    DQ_RULE_RUNS
    DQ_RULE_RUN_SAMPLES
    DQ_QUALITY_SCORES
    DQ_ALERTS

  CONFIG_SCHEMA
    APP_CONFIG
    NOTIFICATION_CONFIG
```

Recommended warehouses:

```text
DQ_SMALL_WH      -- metadata reads, dashboard queries
DQ_EXECUTION_WH  -- rule execution
DQ_AI_WH         -- optional Snowpark/LLM workloads
```

Alternative:

- PostgreSQL only for local MVP, but production metadata should live in Snowflake.

### Rule Execution

- Python rule engine
- Snowflake SQL
- Snowflake Snowflake Python Client

### Scheduler

Options:

- Snowflake Tasks
- Snowflake Dynamic Tables for some derived metrics
- Apache Airflow
- Prefect
- Dagster
- Celery Beat
- APScheduler for local MVP

### Frontend UI

MVP and Enterprise UI:

- React or Next.js frontend
- TypeScript
- Professional CSS architecture
- CSS Modules, Tailwind CSS, or SCSS
- Component-based UI
- FastAPI backend APIs
- Recharts or Apache ECharts for dashboard charts
- No Streamlit

### AI/LLM Layer

Default initial provider:

- Ollama

Additional configurable providers:

- OpenAI
- Claude
- Gemini Flash

### Deployment

- Docker
- Snowpark Container Services / Docker / Kubernetes
- Kubernetes for enterprise scale
- GitHub Actions for CI/CD

---

## 8. Snowflake Metadata Storage Strategy

The platform must store its own metadata inside Snowflake.

Recommended database:

```sql
CREATE DATABASE IF NOT EXISTS DQ_PLATFORM_DB;
CREATE SCHEMA IF NOT EXISTS DQ_PLATFORM_DB.METADATA_SCHEMA;
CREATE SCHEMA IF NOT EXISTS DQ_PLATFORM_DB.RESULTS_SCHEMA;
CREATE SCHEMA IF NOT EXISTS DQ_PLATFORM_DB.CONFIG_SCHEMA;
```

Recommended warehouses:

```sql
CREATE WAREHOUSE IF NOT EXISTS DQ_SMALL_WH
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE;

CREATE WAREHOUSE IF NOT EXISTS DQ_EXECUTION_WH
  WAREHOUSE_SIZE = 'SMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE;
```

Recommended role:

```sql
CREATE ROLE IF NOT EXISTS DQ_PLATFORM_ROLE;
GRANT USAGE ON DATABASE DQ_PLATFORM_DB TO ROLE DQ_PLATFORM_ROLE;
GRANT USAGE ON ALL SCHEMAS IN DATABASE DQ_PLATFORM_DB TO ROLE DQ_PLATFORM_ROLE;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA DQ_PLATFORM_DB.METADATA_SCHEMA TO ROLE DQ_PLATFORM_ROLE;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA DQ_PLATFORM_DB.RESULTS_SCHEMA TO ROLE DQ_PLATFORM_ROLE;
```

For source data, grant read-only access to monitored databases and schemas.

```sql
GRANT USAGE ON DATABASE SOURCE_DATABASE TO ROLE DQ_PLATFORM_ROLE;
GRANT USAGE ON SCHEMA SOURCE_DATABASE.SOURCE_SCHEMA TO ROLE DQ_PLATFORM_ROLE;
GRANT SELECT ON ALL TABLES IN SCHEMA SOURCE_DATABASE.SOURCE_SCHEMA TO ROLE DQ_PLATFORM_ROLE;
```

## 8. Database Design

All rules must be stored in a database. Do not store production rules only in YAML files.

YAML or VARIANT can be used for import/export, but the database is the source of truth.

---

## 9. Core Tables

### 9.1 domains

Stores business domains.

```sql
CREATE TABLE domains (
    domain_id VARCHAR NOT NULL,
    domain_name VARCHAR NOT NULL,
    description VARCHAR,
    owner_name VARCHAR,
    owner_email VARCHAR,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP_NTZ,
    updated_at TIMESTAMP_NTZ
);
```

Example records:

```text
revenue
finance
operations
planning
gtm
hr
others
```

---

### 9.2 subdomains

Stores subdomains under each domain.

```sql
CREATE TABLE subdomains (
    subdomain_id VARCHAR NOT NULL,
    domain_id VARCHAR NOT NULL,
    subdomain_name VARCHAR NOT NULL,
    description VARCHAR,
    owner_name VARCHAR,
    owner_email VARCHAR,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP_NTZ,
    updated_at TIMESTAMP_NTZ
);
```

---

### 9.3 data_assets

Stores Snowflake project, schema, and table metadata.

```sql
CREATE TABLE data_assets (
    asset_id VARCHAR NOT NULL,
    domain_id VARCHAR NOT NULL,
    subdomain_id VARCHAR NOT NULL,
    snowflake_project_id VARCHAR NOT NULL,
    sf_schema_name VARCHAR NOT NULL,
    sf_table_name VARCHAR NOT NULL,
    table_type VARCHAR,
    table_description VARCHAR,
    owner_name VARCHAR,
    owner_email VARCHAR,
    criticality VARCHAR,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP_NTZ,
    updated_at TIMESTAMP_NTZ
);
```

Criticality values:

```text
critical
high
medium
low
```

---

### 9.4 dq_rules

Stores all data quality rules.

```sql
CREATE TABLE dq_rules (
    rule_id VARCHAR NOT NULL,
    rule_name VARCHAR NOT NULL,
    rule_description VARCHAR,
    domain_id VARCHAR NOT NULL,
    subdomain_id VARCHAR NOT NULL,
    asset_id VARCHAR NOT NULL,
    rule_type VARCHAR NOT NULL,
    rule_category VARCHAR,
    target_column VARCHAR,
    rule_sql VARCHAR,
    rule_config VARIANT,
    severity VARCHAR NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR,
    approved_by VARCHAR,
    created_at TIMESTAMP_NTZ,
    updated_at TIMESTAMP_NTZ
);
```

Rule types:

```text
null_check
uniqueness_check
duplicate_check
accepted_values_check
range_check
freshness_check
volume_check
schema_drift_check
referential_integrity_check
regex_check
business_rule_check
custom_sql_check
```

Severity values:

```text
critical
high
medium
low
```

---

### 9.5 dq_schedules

Stores schedule configuration for rule execution.

Each rule should have its own schedule or inherit a schedule from table, subdomain, or domain level.

```sql
CREATE TABLE dq_schedules (
    schedule_id VARCHAR NOT NULL,
    rule_id VARCHAR,
    asset_id VARCHAR,
    subdomain_id VARCHAR,
    domain_id VARCHAR,
    schedule_level VARCHAR NOT NULL,
    frequency VARCHAR NOT NULL,
    cron_expression VARCHAR,
    timezone VARCHAR DEFAULT 'America/Los_Angeles',
    start_time TIMESTAMP_NTZ,
    end_time TIMESTAMP_NTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP_NTZ,
    updated_at TIMESTAMP_NTZ
);
```

Schedule level values:

```text
rule
table
subdomain
domain
global
```

Frequency values:

```text
hourly
daily
weekly
monthly
cron
on_demand
```

Examples:

```text
Revenue critical rules: hourly
Finance GL rules: daily at 6 AM
HR payroll rules: daily
Planning forecast rules: weekly
Low-priority rules: weekly
```

---

### 9.6 dq_rule_runs

Stores each execution run.

```sql
CREATE TABLE dq_rule_runs (
    run_id VARCHAR NOT NULL,
    rule_id VARCHAR NOT NULL,
    asset_id VARCHAR NOT NULL,
    domain_id VARCHAR NOT NULL,
    subdomain_id VARCHAR NOT NULL,
    execution_start_time TIMESTAMP_NTZ,
    execution_end_time TIMESTAMP_NTZ,
    status VARCHAR NOT NULL,
    total_rows_scanned NUMBER,
    failed_rows_count NUMBER,
    passed_rows_count NUMBER,
    failure_percentage FLOAT,
    quality_score FLOAT,
    error_message VARCHAR,
    executed_sql VARCHAR,
    created_at TIMESTAMP_NTZ
);
```

Status values:

```text
passed
failed
warning
error
skipped
```

Quality score calculation:

```text
quality_score = 100 - failure_percentage
```

---

### 9.7 dq_rule_run_samples

Stores sample failed records.

```sql
CREATE TABLE dq_rule_run_samples (
    sample_id VARCHAR NOT NULL,
    run_id VARCHAR NOT NULL,
    rule_id VARCHAR NOT NULL,
    failed_record VARIANT,
    created_at TIMESTAMP_NTZ
);
```

---

### 9.8 dq_quality_scores

Stores aggregated quality score by table, subdomain, and domain.

```sql
CREATE TABLE dq_quality_scores (
    score_id VARCHAR NOT NULL,
    score_date DATE NOT NULL,
    score_level VARCHAR NOT NULL,
    domain_id VARCHAR,
    subdomain_id VARCHAR,
    asset_id VARCHAR,
    total_rules NUMBER,
    passed_rules NUMBER,
    failed_rules NUMBER,
    warning_rules NUMBER,
    error_rules NUMBER,
    quality_score FLOAT,
    created_at TIMESTAMP_NTZ
);
```

Score level values:

```text
table
subdomain
domain
global
```

---

### 9.9 dq_alerts

Stores alerts generated from failed rules.

```sql
CREATE TABLE dq_alerts (
    alert_id VARCHAR NOT NULL,
    run_id VARCHAR NOT NULL,
    rule_id VARCHAR NOT NULL,
    domain_id VARCHAR NOT NULL,
    subdomain_id VARCHAR NOT NULL,
    asset_id VARCHAR NOT NULL,
    severity VARCHAR NOT NULL,
    alert_status VARCHAR NOT NULL,
    alert_message VARCHAR,
    notified_to VARCHAR,
    notification_channel VARCHAR,
    created_at TIMESTAMP_NTZ,
    resolved_at TIMESTAMP_NTZ
);
```

Alert status values:

```text
open
acknowledged
resolved
ignored
```

Notification channels:

```text
email
slack
teams
pagerduty
webhook
```

---

### 9.10 audit_logs

Stores user and system actions.

```sql
CREATE TABLE audit_logs (
    audit_id VARCHAR NOT NULL,
    user_email VARCHAR,
    action VARCHAR NOT NULL,
    entity_type VARCHAR NOT NULL,
    entity_id VARCHAR,
    old_value VARIANT,
    new_value VARIANT,
    created_at TIMESTAMP_NTZ
);
```

---

## 10. Rule Configuration

Rules are stored in the database, but the app should support import and export using YAML or VARIANT.

Example YAML import:

```yaml
domain: revenue
subdomain: billing
asset:
  snowflake_project_id: my-snowflake-project
  sf_schema_name: revenue_dw
  sf_table_name: invoices

schedule:
  frequency: daily
  timezone: America/Los_Angeles
  cron_expression: "0 6 * * *"

rules:
  - rule_name: invoice_id_not_null
    rule_type: null_check
    target_column: invoice_id
    severity: critical

  - rule_name: invoice_amount_positive
    rule_type: range_check
    target_column: invoice_amount
    severity: high
    config:
      min_value: 0

  - rule_name: invoice_id_unique
    rule_type: uniqueness_check
    target_column: invoice_id
    severity: critical

  - rule_name: valid_invoice_status
    rule_type: accepted_values_check
    target_column: invoice_status
    severity: medium
    config:
      accepted_values:
        - PAID
        - PENDING
        - FAILED
        - CANCELLED
```

After import, all rules must be inserted into the `dq_rules` table and schedules into the `dq_schedules` table.

---

## 11. Rule Types and SQL Generation

The rule engine should generate Snowflake SQL based on rule type and config.

### 11.1 Null Check

Purpose:

Ensure required columns are not null.

Example:

```sql
SELECT COUNT(*) AS failed_count
FROM `database.schema.table`
WHERE column_name IS NULL;
```

---

### 11.2 Uniqueness Check

Purpose:

Ensure column values are unique.

Example:

```sql
SELECT COUNT(*) AS failed_count
FROM (
    SELECT column_name, COUNT(*) AS cnt
    FROM `database.schema.table`
    GROUP BY column_name
    HAVING COUNT(*) > 1
);
```

---

### 11.3 Accepted Values Check

Purpose:

Ensure column values belong to an approved list.

Example:

```sql
SELECT COUNT(*) AS failed_count
FROM `database.schema.table`
WHERE column_name NOT IN ('ACTIVE', 'INACTIVE', 'PENDING');
```

---

### 11.4 Range Check

Purpose:

Ensure numeric values are within an allowed range.

Example:

```sql
SELECT COUNT(*) AS failed_count
FROM `database.schema.table`
WHERE amount < 0 OR amount > 1000000;
```

---

### 11.5 Freshness Check

Purpose:

Ensure data is updated within SLA.

Example:

```sql
SELECT
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(updated_at), HOUR) AS hours_since_last_update
FROM `database.schema.table`;
```

---

### 11.6 Volume Check

Purpose:

Detect row count spikes or drops.

Example:

```sql
SELECT COUNT(*) AS current_row_count
FROM `database.schema.table`
WHERE TO_DATE(created_at) = CURRENT_DATE();
```

Compare current row count with historical average from previous runs.

---

### 11.7 Schema Drift Check

Purpose:

Detect missing, new, or changed columns.

Use Snowflake INFORMATION_SCHEMA.

Example:

```sql
SELECT column_name, data_type
FROM `database.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'target_table';
```

---

### 11.8 Referential Integrity Check

Purpose:

Ensure values exist in a reference table.

Example:

```sql
SELECT COUNT(*) AS failed_count
FROM `database.schema.child_table` c
LEFT JOIN `database.schema.parent_table` p
ON c.parent_id = p.parent_id
WHERE p.parent_id IS NULL;
```

---

### 11.9 Regex Check

Purpose:

Validate pattern such as email, phone, zip code, or IDs.

Example:

```sql
SELECT COUNT(*) AS failed_count
FROM `database.schema.table`
WHERE NOT REGEXP_LIKE(email, '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
```

---

### 11.10 Custom SQL Check

Purpose:

Allow advanced custom business rules.

Example:

```sql
SELECT COUNT(*) AS failed_count
FROM `database.schema.orders`
WHERE ship_date < order_date;
```

---

## 12. Scheduling Requirements

The platform must allow scheduling at multiple levels.

### Schedule Levels

1. Global schedule
2. Domain schedule
3. Subdomain schedule
4. Table schedule
5. Rule schedule

Priority order:

```text
Rule schedule > Table schedule > Subdomain schedule > Domain schedule > Global schedule
```

Example:

```text
Global: weekly
Revenue domain: daily
Revenue Billing table: hourly
Critical invoice rules: every 15 minutes
```

The most specific active schedule should win.

---

## 13. Execution Flow

### Step 1: Scheduler Trigger

Scheduler finds active rules based on schedule frequency.

### Step 2: Load Rule Metadata

Load:

- Rule details
- Asset details
- Domain
- Subdomain
- Schedule
- Rule config

### Step 3: Generate SQL

Generate SQL from rule type and rule config.

### Step 4: Execute SQL in Snowflake

Run SQL using Snowflake Python client.

### Step 5: Store Results

Insert records into:

- dq_rule_runs
- dq_rule_run_samples
- dq_quality_scores

### Step 6: Generate Alerts

If failed rule severity is critical or high, create alert.

### Step 7: AI Explanation

For failed rules, call LLM to generate plain-English explanation.

### Step 8: Dashboard Refresh

Dashboard reads latest results and historical trends.

---

## 14. Dashboard Requirements

The dashboard must support multiple views.

---

## 15. Global Dashboard

Shows overall data quality across the company.

Metrics:

- Overall quality score
- Total domains
- Total tables monitored
- Total active rules
- Rules passed today
- Rules failed today
- Critical failures
- Open alerts
- Trend of quality score over time

---

## 16. Domain Dashboard

Shows quality by domain.

Example:

```text
Revenue: 94%
Finance: 91%
Operations: 89%
Planning: 96%
GTM: 87%
HR: 98%
Others: 90%
```

Required charts:

- Quality score by domain
- Failed rules by domain
- Critical failures by domain
- Domain trend over time
- Domain SLA breaches

Filters:

- Date range
- Domain
- Severity
- Status
- Owner

---

## 17. Subdomain Dashboard

Shows quality by subdomain inside a domain.

Example:

```text
Revenue
  Billing: 92%
  Sales: 96%
  Subscriptions: 90%
  Pricing: 95%
```

Required charts:

- Quality score by subdomain
- Failed rules by subdomain
- Rule failure trend
- Top failing tables
- SLA miss trend

---

## 18. Table Dashboard

Shows quality for an individual Snowflake table.

Required table-level details:

- Current quality score
- Historical quality score trend
- Total rules assigned
- Passed rules
- Failed rules
- Warning rules
- Last execution time
- Last successful execution
- Freshness status
- Row count trend
- Schema drift status
- Failed rule details
- Sample failed records
- AI-generated explanation

Example table view:

```text
Table: revenue_dw.invoices
Domain: Revenue
Subdomain: Billing
Current Quality Score: 91%
Last Run: 2026-05-04 06:00 AM
Failed Rules:
  - invoice_amount_positive
  - valid_invoice_status
```

---

## 19. Historical Quality Tracking

The platform must store and display history for:

1. Individual table
2. Subdomain
3. Domain
4. Global platform

Historical metrics:

- Daily quality score
- Weekly quality score
- Monthly quality score
- Passed rule count
- Failed rule count
- Critical failure count
- SLA breaches
- Row count changes
- Schema drift events

---

## 20. Data Quality Score Formula

Basic formula:

```text
quality_score = (passed_rules / total_rules) * 100
```

Weighted formula:

```text
critical failure = -25 points
high failure = -15 points
medium failure = -7 points
low failure = -3 points
```

Recommended enterprise formula:

```text
Start with 100
Subtract weighted penalties based on severity
Minimum score = 0
Maximum score = 100
```

Example:

```text
quality_score = 100 - severity_penalty
```

Severity penalties:

```text
critical = 25
high = 15
medium = 7
low = 3
```

---

## 21. LLM Provider Configuration

The application must support multiple LLM providers using a provider abstraction layer.

Initial default provider:

```text
Ollama
```

Supported providers:

```text
ollama
openai
claude
gemini_flash
```

The application must start with Ollama as the default local LLM option, but the configuration must allow switching to OpenAI, Claude, or Gemini Flash without changing business logic.

Recommended design:

```text
LLMProvider interface
  ├── OllamaProvider
  ├── OpenAIProvider
  ├── ClaudeProvider
  └── GeminiFlashProvider
```

The following AI features must use this provider abstraction:

- Rule generation
- SQL rule generation
- Failure explanation
- Domain and subdomain classification
- Data quality chatbot

Example configuration:

```yaml
llm:
  default_provider: ollama

  ollama:
    enabled: true
    base_url: http://localhost:11434
    model: qwen2.5:7b-instruct

  openai:
    enabled: true
    model: gpt-4o-mini

  claude:
    enabled: true
    model: claude-3-5-sonnet-latest

  gemini_flash:
    enabled: true
    model: gemini-1.5-flash
```

Environment variable support:

```text
LLM_PROVIDER=ollama

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct

OPENAI_API_KEY=replace-me
OPENAI_MODEL=gpt-4o-mini

ANTHROPIC_API_KEY=replace-me
CLAUDE_MODEL=claude-3-5-sonnet-latest

GEMINI_API_KEY=replace-me
GEMINI_MODEL=gemini-1.5-flash
```

Provider selection rules:

```text
1. Use provider from request if provided.
2. Otherwise use LLM_PROVIDER environment variable.
3. Otherwise use default_provider from config.
4. If no provider is configured, default to Ollama.
```


## 21. AI/LLM Features

The AI layer must support the following capabilities.

---

## 22. AI Rule Generator

User input:

```text
Generate data quality rules for Revenue Billing invoice table.
```

LLM should generate:

- Rule names
- Rule types
- Target columns
- Severity
- SQL logic
- Business explanation

The generated rules should be reviewed by a user before saving into the database.

---

## 23. AI SQL Rule Generator

User input:

```text
Create a rule to check duplicate invoice_id in revenue invoice table.
```

Expected output:

```sql
SELECT COUNT(*) AS failed_count
FROM (
    SELECT invoice_id, COUNT(*) AS cnt
    FROM database.schema.invoices
    GROUP BY invoice_id
    HAVING COUNT(*) > 1
);
```

---

## 24. AI Failure Explanation

When a rule fails, LLM should explain:

- What failed
- Why it matters
- Possible root cause
- Business impact
- Suggested fix

Example:

```text
The invoice_amount_positive rule failed because 120 invoice records have negative invoice amounts.
This can impact revenue reporting and billing accuracy.
Possible causes include refund records being loaded into the invoice table without proper transaction type classification.
Suggested fix: separate refund transactions or update the rule to allow negative values only when transaction_type = 'REFUND'.
```

---

## 25. AI Domain Classifier

When a new table is scanned, AI can suggest:

- Domain
- Subdomain
- Possible owner
- Suggested rules

Example:

```text
Table: invoice_line_items
Suggested domain: Revenue
Suggested subdomain: Billing
Reason: The table contains invoice_id, customer_id, product_id, invoice_amount, and billing_date.
```

---

## 26. AI Chatbot

The platform should include a chatbot for data engineers.

Example questions:

```text
Why did Revenue quality score drop today?
Which Finance tables failed yesterday?
Show failed rules for HR Payroll.
Suggest rules for GTM leads table.
Which domain has the most critical failures this week?
Explain schema drift on operations inventory table.
```

---

## 27. Professional UI Requirements

The application must include a production-quality web UI.

Do not use Streamlit.

Recommended frontend stack:

```text
Next.js
React
TypeScript
CSS Modules or Tailwind CSS
Recharts or Apache ECharts
Axios or Fetch API client
```

Required UI characteristics:

- Professional enterprise look and feel
- Responsive layout
- Sidebar navigation
- Top navigation bar
- Domain and subdomain filters
- Date range filters
- Severity filters
- Status filters
- Reusable card components
- Reusable chart components
- Reusable table components
- Loading states
- Empty states
- Error states
- Pagination
- Search
- Sorting
- Dark mode ready styling
- Accessible color contrast
- Clean CSS structure

Main UI pages:

```text
/dashboard/global
/dashboard/domains
/dashboard/domains/[domainId]
/dashboard/subdomains/[subdomainId]
/dashboard/tables/[assetId]
/rules
/rules/create
/schedules
/assets
/alerts
/audit
/ai-assistant
```

Required CSS files or modules:

```text
globals.css
layout.module.css
dashboard.module.css
cards.module.css
tables.module.css
forms.module.css
charts.module.css
filters.module.css
```

The UI must call FastAPI APIs. It should not directly connect to Snowflake.


## 27. API Requirements

Build REST APIs using FastAPI.

---

## 28. Domain APIs

```text
POST /domains
GET /domains
GET /domains/{domain_id}
PUT /domains/{domain_id}
DELETE /domains/{domain_id}
```

---

## 29. Subdomain APIs

```text
POST /subdomains
GET /subdomains
GET /subdomains/{subdomain_id}
PUT /subdomains/{subdomain_id}
DELETE /subdomains/{subdomain_id}
```

---

## 30. Data Asset APIs

```text
POST /assets
GET /assets
GET /assets/{asset_id}
PUT /assets/{asset_id}
DELETE /assets/{asset_id}
```

---

## 31. Rule APIs

```text
POST /rules
GET /rules
GET /rules/{rule_id}
PUT /rules/{rule_id}
DELETE /rules/{rule_id}
POST /rules/import
GET /rules/export
```

---

## 32. Schedule APIs

```text
POST /schedules
GET /schedules
GET /schedules/{schedule_id}
PUT /schedules/{schedule_id}
DELETE /schedules/{schedule_id}
```

---

## 33. Execution APIs

```text
POST /execute/rule/{rule_id}
POST /execute/table/{asset_id}
POST /execute/subdomain/{subdomain_id}
POST /execute/domain/{domain_id}
GET /runs
GET /runs/{run_id}
```

---

## 34. Dashboard APIs

```text
GET /dashboard/global
GET /dashboard/domains
GET /dashboard/domains/{domain_id}
GET /dashboard/subdomains/{subdomain_id}
GET /dashboard/tables/{asset_id}
GET /dashboard/history/table/{asset_id}
GET /dashboard/history/subdomain/{subdomain_id}
GET /dashboard/history/domain/{domain_id}
```

---

## 35. AI APIs

```text
POST /ai/generate-rules
POST /ai/explain-failure
POST /ai/generate-sql
POST /ai/classify-table
POST /ai/chat
```

---

## 36. RBAC Requirements

Support these roles:

### Admin

Can manage all domains, rules, schedules, and users.

### Domain Owner

Can manage rules and schedules for their domain.

### Data Owner

Can manage rules for assigned tables.

### Viewer

Can only view dashboards and results.

### Auditor

Can view audit logs and historical results.

---

## 37. Alerting Requirements

The platform should send alerts when:

- Critical rule fails
- High severity rule fails
- Freshness SLA is breached
- Schema drift is detected
- Quality score drops below threshold
- Table execution fails

Alert routing should be based on domain, subdomain, and table owner.

Example:

```text
Revenue critical alert -> #revenue-data-quality Slack channel
Finance critical alert -> finance-data-owner@example.com
HR payroll alert -> hr-data-owner@example.com
```

---

## 38. Rule Lifecycle

Rule lifecycle:

```text
draft -> pending_review -> approved -> active -> disabled -> archived
```

AI-generated rules should start as:

```text
pending_review
```

Only approved rules can run in production.

---

## 39. Project Folder Structure

```text
snowflake-dq-copilot/
  app/
    main.py
    api/
      domains.py
      subdomains.py
      assets.py
      rules.py
      schedules.py
      executions.py
      dashboard.py
      ai.py
    core/
      config.py
      security.py
      logging.py
    db/
      models.py
      repository.py
      snowflake_client.py
    services/
      rule_engine.py
      sql_generator.py
      scheduler_service.py
      execution_service.py
      scoring_service.py
      alert_service.py
      ai_service.py
    schemas/
      domain.py
      subdomain.py
      asset.py
      rule.py
      schedule.py
      run.py
      dashboard.py
      ai.py
  frontend/
    package.json
    next.config.js
    tsconfig.json
    src/
      app/
        layout.tsx
        page.tsx
        domains/
        subdomains/
        tables/
        rules/
        schedules/
        alerts/
      components/
        layout/
        dashboard/
        charts/
        rules/
        tables/
        filters/
      styles/
        globals.css
        dashboard.css
        forms.css
        tables.css
      services/
        apiClient.ts
        dashboardService.ts
        ruleService.ts
      types/
        domain.ts
        rule.ts
        dashboard.ts
  migrations/
  tests/
    test_rule_engine.py
    test_sql_generator.py
    test_scoring_service.py
    test_scheduler_service.py
  config/
    sample_rules.yaml
  Dockerfile
  docker-compose.yml
  requirements.txt
  README.md
  CLAUDE.md
```

---

## 40. MVP Scope

Build MVP in this order.

### Phase 1: Metadata and Rule Management

Features:

- Create domains
- Create subdomains
- Register Snowflake tables
- Create rules
- Store rules in database
- Create schedules

### Phase 2: Rule Execution Engine

Features:

- Generate SQL from rule type
- Execute SQL against Snowflake
- Store rule run results
- Store failed sample records
- Support manual execution

### Phase 3: Scheduler

Features:

- Run rules based on frequency
- Support hourly, daily, weekly, monthly, cron
- Support rule/table/subdomain/domain-level schedule inheritance

### Phase 4: Professional Web Dashboard

Features:

- React or Next.js frontend
- Professional CSS-based layout
- Global quality dashboard
- Domain quality dashboard
- Subdomain quality dashboard
- Table quality dashboard
- Historical quality score trends
- Filters by date, domain, subdomain, severity, owner, and status
- No Streamlit

### Phase 5: AI/LLM Layer

Features:

- Suggest rules from schema
- Generate SQL rules
- Explain rule failures
- Classify table into domain/subdomain
- Chatbot for data quality questions

### Phase 6: Enterprise Features

Features:

- RBAC
- Audit logs
- Alerting
- Approval workflow
- CI/CD
- Production deployment

---

## 41. Claude Code Implementation Instructions

When generating code for this project:

1. Use Python and FastAPI for backend.
2. Use Pydantic models for request and response validation.
3. Store rules, schedules, assets, domains, subdomains, and execution history in database tables.
4. Use Snowflake Python Client to execute generated SQL.
5. Keep SQL generation separate from execution logic.
6. Keep scoring logic separate from rule execution.
7. Build the app in small phases.
8. After each phase, provide runnable code and test instructions.
9. Include simple local development setup using Docker Compose for API, frontend, scheduler, and optional Ollama.
10. Use environment variables for Snowflake account/database, schema, credentials, and LLM provider.
11. Use clear logging.
12. Add unit tests for rule generation, scoring, and schedule resolution.
13. Keep backend code simple and readable for data engineers, and keep frontend code professional, modular, and production-grade.
14. Do not hardcode domains, rules, or schedules in Python files.
15. All production rules must be stored in the database.
16. YAML/VARIANT should only be used for import/export or seed data.
17. Build a professional React or Next.js dashboard from the beginning. Do not use Streamlit.
18. Make both backend and frontend runnable locally before cloud deployment.
19. Include sample Snowflake tables and sample rules for testing.
20. Include README instructions.

---

## 42. Environment Variables

```text
APP_ENV=local
Snowflake_PROJECT_ID=my-snowflake-project
SF_METADATA_DATASET=dq_metadata
SF_RESULTS_DATASET=dq_results
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

LLM_PROVIDER=openai
OPENAI_API_KEY=replace-me
GEMINI_API_KEY=replace-me
OLLAMA_BASE_URL=http://localhost:11434

SCHEDULER_TYPE=apscheduler
DEFAULT_TIMEZONE=America/Los_Angeles
```

---

## 43. Sample Seed Data

### Domains

```text
Revenue
Finance
Operations
Planning
GTM
HR
Others
```

### Revenue Subdomains

```text
Billing
Sales
Subscriptions
Pricing
```

### Finance Subdomains

```text
General Ledger
Accounts Payable
Accounts Receivable
Expenses
Forecasting
```

### HR Subdomains

```text
Employees
Payroll
Hiring
Attendance
Benefits
```

---

## 44. Acceptance Criteria

The project is successful when:

1. Users can create domains and subdomains.
2. Users can register Snowflake tables under a domain and subdomain.
3. Users can create data quality rules from the UI or API.
4. All rules are saved in the database.
5. Users can configure schedule frequency.
6. Rules can run manually and on schedule.
7. Rule execution results are stored historically.
8. Dashboard shows table-level quality.
9. Dashboard shows subdomain-level quality.
10. Dashboard shows domain-level quality.
11. Dashboard shows historical quality trends.
12. AI can suggest rules.
13. AI can explain failures.
14. Critical failures generate alerts.
15. Audit logs capture rule and schedule changes.

---

## 45. Final Product Vision

The final product should behave like an enterprise data quality command center for Snowflake.

It should answer questions such as:

```text
What is the current data quality score for Revenue?
Which Finance tables failed today?
How has HR Payroll quality changed over the last 30 days?
Which subdomain has the most critical data quality failures?
Why did the invoice table fail?
What rules should I add to a new GTM leads table?
```

The goal is to help data engineers and business teams detect bad data early, understand failures quickly, and improve trust in Snowflake data products.

---

## 46. Enterprise Data Governance Capabilities

The platform implements enterprise-grade data governance controls that go beyond basic RBAC.

### 46.1 Role-Based Access Control (RBAC)

Five roles with strict enforcement at the API layer:

| Role | Scope | Permissions |
|---|---|---|
| `admin` | Global | Full access — users, domains, rules, schedules, config, approve/reject, audit |
| `domain_owner` | Own domain only | Manage rules and schedules in assigned `domain_id`; approve/reject rules |
| `data_owner` | Assigned tables | Create and edit rules for assigned tables |
| `viewer` | Read-only | Dashboards, alerts, runs, AI assistant (no write) |
| `auditor` | Read-only + audit | Same as viewer plus access to all audit logs |

### 46.2 Row-Level Domain Isolation

`domain_owner` users are physically restricted to their assigned domain. They cannot query data from other domains even by manipulating query parameters.

Enforcement points:
- `GET /rules/enriched` — WHERE domain_id = user.domain_id
- `GET /assets/enriched` — WHERE domain_id = user.domain_id
- `GET /runs/enriched`, `GET /runs` — WHERE domain_id = user.domain_id
- `GET /dashboard/global` — aggregates scoped to user's domain
- `GET /dashboard/domains` — returns only user's domain card
- `GET /dashboard/domains/{id}` — 403 if domain_id ≠ user.domain_id
- `GET /dashboard/subdomains/{id}` — 403 if subdomain not in user's domain
- `GET /dashboard/tables/{id}` — 403 if asset not in user's domain
- `POST /execute/*` — 403 if target resource not in user's domain
- `GET /alerts` — scoped to user's domain
- `GET /schedules` — scoped to user's domain

Helper functions in `app/core/security.py`:
- `get_domain_filter(user)` — returns domain_id for domain_owner, None otherwise
- `check_domain_access(user, resource_domain_id)` — raises HTTP 403 on mismatch
- `apply_domain_filter(query, model_field, user)` — appends WHERE clause to SQLAlchemy query

### 46.3 OAuth2 / SSO

Google OAuth2 authorization code flow implemented in `app/api/oauth.py`:

```
GET /auth/oauth/providers           — list enabled SSO providers
GET /auth/oauth/google              — redirect to Google consent
GET /auth/oauth/google/callback     — exchange code, issue JWT, redirect to frontend
```

First-time SSO users are created with `viewer` role. Admins promote them via `PATCH /users/{id}`.

Config:
```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OAUTH_REDIRECT_URI=https://your-domain/auth/oauth/google/callback
FRONTEND_URL=https://your-domain
```

### 46.4 Service Accounts (API Key Auth)

Machine-to-machine authentication for CI/CD pipelines and automated scripts:

```
POST   /service-accounts            — create (returns key once)
GET    /service-accounts            — list all (admin only)
PATCH  /service-accounts/{id}       — update name/role/status
PATCH  /service-accounts/{id}/rotate — issue new key, invalidate old
DELETE /service-accounts/{id}       — delete
```

Key format: `sa_<8-char-prefix>_<32-char-secret>`

Usage:
```bash
curl -H "X-API-Key: sa_AbCd1234_..." https://dq-platform/rules
```

### 46.5 Credential Encryption at Rest

All Snowflake passwords and LLM API keys stored in the database are encrypted using Fernet symmetric encryption (AES-128-CBC + HMAC). Set `ENCRYPTION_KEY` to enable.

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 46.6 Audit Trail

Every create, update, delete, approve, reject, rollback, bulk status change, and certification action is appended to `audit_logs` with:
- `user_email` — who performed the action
- `action` — CREATE, UPDATE, DELETE, APPROVE, REJECT, ROLLBACK, BULK_STATUS_CHANGE, CERTIFY
- `entity_type` — rule, domain, asset, user, alert, etc.
- `old_value` / `new_value` — before/after JSON snapshots

Audit logs are immutable (no DELETE endpoint). Export via `GET /audit/export?days=30`.

### 46.7 SLA & Quality Threshold Management

Admins configure quality thresholds in **Settings → SLA & Quality**:

**Global thresholds** (stored in `app_config`):
- `sla_threshold` — green floor (default 95%). Below this = breach.
- `warning_threshold` — yellow band floor (default 85%).
- `critical_penalty`, `high_penalty`, `medium_penalty`, `low_penalty` — severity points.

**Per-entity SLA configs** (stored in `sla_configs` table):
```
entity_type:  global | domain | subdomain | table
min_quality_score:  float (e.g. 98.0 for critical Revenue tables)
max_failure_pct:    float
alert_on_breach:    bool
notification_emails: comma-separated list (overrides global)
notification_slack_channel: webhook URL (overrides global)
```

API:
```
GET    /sla-configs
POST   /sla-configs
PUT    /sla-configs/{id}
DELETE /sla-configs/{id}
```

---

## 47. Full AI / LLM Capabilities

The platform has two AI entry points:

### 47.1 AI Copilot (Floating Widget — bottom-right)

A context-aware floating panel accessible from any page. Components:
- **Rule Creation Wizard** — guided 6-step flow: Domain → Subdomain → Table → Column selection → Rule type → Generate SQL → Review & Save
- **AI chat** — live platform data queries (same as AI Assistant page)
- **Context chips** — quick-select recent tables and domains
- **Streaming responses** — `POST /ai/chat/stream` SSE endpoint

### 47.2 AI Assistant (Full Page — `/ai-assistant`)

Dedicated full-page chat workspace for longer conversations. Conversation history persists in `sessionStorage`. LLM status banner shows if Ollama is unreachable or missing a model.

### 47.3 AI API Endpoints

```
POST /ai/generate-rules      — suggest 5-8 rules from table schema
POST /ai/explain-failure      — plain-English root cause for a failed run
POST /ai/generate-sql         — natural language → Snowflake SQL
POST /ai/classify-table       — suggest domain, subdomain, owner
POST /ai/chat                 — free-form platform questions
POST /ai/chat/stream          — SSE streaming chat
```

All AI endpoints use a provider abstraction layer (`app/services/llm_providers.py`) that supports Ollama (default), OpenAI, Anthropic Claude, and Google Gemini Flash. Switch providers without code changes:

```env
LLM_PROVIDER=openai   # or ollama | claude | gemini_flash
```

### 47.4 LLM Provider Details

| Provider | Notes |
|---|---|
| Ollama | Local, private, no API cost. Recommended: `qwen2.5:7b-instruct` |
| OpenAI | Best quality. `gpt-4o-mini` for cost, `gpt-4o` for quality |
| Anthropic Claude | Strong reasoning. `claude-3-5-sonnet-latest` |
| Google Gemini Flash | Fast and cost-effective. Sync call wrapped in `asyncio.to_thread()` |

### 47.5 AI-Powered Rule Lifecycle

AI-generated rules always start as `pending_review` — they never auto-activate. An admin or domain_owner must approve before execution begins.

---

## 48. Data Lineage and Impact Tracking

Data lineage tracks the upstream sources and downstream consumers of each Snowflake table, enabling data teams to:
- Understand blast radius when a table fails (which downstream reports/models depend on it)
- Prioritize rule remediation by impact
- Trace data quality failures to their root source

### 48.1 Lineage Data Model

```sql
CREATE TABLE data_lineage (
    lineage_id VARCHAR(36) PRIMARY KEY,
    upstream_asset_id VARCHAR(36) REFERENCES data_assets(asset_id),
    downstream_asset_id VARCHAR(36) REFERENCES data_assets(asset_id),
    lineage_type VARCHAR(30),        -- 'table_to_table' | 'table_to_report' | 'table_to_model'
    downstream_name VARCHAR(200),    -- display name if downstream is not a registered asset
    downstream_type VARCHAR(50),     -- 'snowflake_table' | 'dbt_model' | 'looker_dashboard' | 'metabase' | 'custom'
    transformation_sql TEXT,         -- SQL or dbt ref() that links them
    description TEXT,
    owner_email VARCHAR(200),
    is_critical BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_lineage_upstream   ON data_lineage(upstream_asset_id);
CREATE INDEX ix_lineage_downstream ON data_lineage(downstream_asset_id);
```

### 48.2 Lineage API Endpoints

```
GET    /assets/{asset_id}/lineage/upstream     — what feeds this table
GET    /assets/{asset_id}/lineage/downstream   — what depends on this table
GET    /assets/{asset_id}/lineage/impact       — full impact analysis (failures + downstream count)
POST   /assets/{asset_id}/lineage              — add a lineage link
DELETE /assets/lineage/{lineage_id}            — remove a lineage link
```

### 48.3 Impact Analysis

`GET /assets/{asset_id}/lineage/impact` returns:
```json
{
  "asset_id": "...",
  "sf_table_name": "invoices",
  "current_quality_score": 87.3,
  "failing_rules": 2,
  "downstream_count": 5,
  "downstream": [
    {
      "downstream_name": "revenue_summary_dashboard",
      "downstream_type": "looker_dashboard",
      "is_critical": true,
      "owner_email": "rev-team@co.com"
    }
  ],
  "blast_radius_score": "HIGH"
}
```

`blast_radius_score`:
- `HIGH` — 3+ critical downstream consumers or dashboard
- `MEDIUM` — downstream consumers exist but not critical
- `LOW` — no registered downstream dependencies

### 48.4 AI + Lineage Integration

When `POST /ai/explain-failure` is called for a failing table, the AI explanation automatically includes:
- Number of downstream consumers affected
- Names of critical downstream dashboards/models
- Recommended escalation path based on owner_email

### 48.5 Lineage UI

Table Dashboard shows a **Lineage** section:
- **Upstream tab** — tables that feed this table (click to navigate to their dashboard)
- **Downstream tab** — tables/reports/models that depend on this table
- **Impact badge** — HIGH / MEDIUM / LOW blast radius shown next to certification badge
- **Add lineage** button (admin/domain_owner only) — form to register upstream or downstream link

---

## 49. Performance Architecture

### 49.1 Snowflake Connection Pooling

`app/db/snowflake_pool.py` maintains one `SnowflakeConnectionPool` per unique credential set. Connections are:
- Validated with `SELECT 1` before reuse
- Discarded on error (not returned to pool)
- Run in `asyncio.to_thread()` so the event loop is never blocked

```env
SNOWFLAKE_POOL_MIN_SIZE=1
SNOWFLAKE_POOL_MAX_SIZE=5        # increase for large rule batches
SNOWFLAKE_POOL_ACQUIRE_TIMEOUT=30
```

### 49.2 Concurrent Rule Execution

`execute_asset_rules()` runs all rules for a table concurrently using `asyncio.gather()` bounded by a semaphore equal to `SNOWFLAKE_POOL_MAX_SIZE`. For a table with 20 rules this yields ~5x throughput compared to sequential execution.

### 49.3 Background Job Tracking

`POST /rules/bulk/execute` returns immediately with a `job_id`. Poll `GET /rules/bulk/jobs/{job_id}` for status (`queued` → `running` → `completed`/`failed`).

### 49.4 Database Indexes

Hot-path tables have composite indexes:
```sql
ix_rule_runs_rule_created   ON dq_rule_runs(rule_id, created_at DESC)
ix_rule_runs_asset_created  ON dq_rule_runs(asset_id, created_at DESC)
ix_rule_runs_domain_status  ON dq_rule_runs(domain_id, status)
ix_quality_scores_date_level ON dq_quality_scores(score_date, score_level)
```

---

## 50. Secrets Management (Production)

### HashiCorp Vault (KV v2)

```env
VAULT_ADDR=https://vault.example.com
VAULT_TOKEN=hvs.CAESIQ...
VAULT_SECRET_PATH=secret/data/dq-platform/prod
```

Vault secret JSON keys: `secret_key`, `encryption_key`, `snowflake_password`, `openai_api_key`, `google_client_secret`, etc.

### AWS Secrets Manager

```env
AWS_SECRETS_NAME=prod/dq-platform/secrets
AWS_REGION=us-east-1
```

Both backends are loaded by `app/core/secrets_loader.bootstrap()` at app startup before validation. Install boto3 for AWS: `pip install boto3`.

---

## 51. Frontend Architecture (Current State)

### Pages

| Route | Description |
|---|---|
| `/login` | Sign-in form + Google SSO button |
| `/auth/callback` | OAuth2 token landing (reads `?token=&refresh=` from URL) |
| `/dashboard/global` | Global quality command center with layout controls |
| `/dashboard/domains` | Domain score grid |
| `/dashboard/domains/[id]` | Domain detail with subdomains |
| `/dashboard/subdomains/[id]` | Subdomain detail with tables |
| `/dashboard/tables/[id]` | Table detail — rules, trend, lineage, certification |
| `/rules` | Rule list with bulk actions, filters, inline edit |
| `/rules/create` | Rule creation form |
| `/rules/[id]` | Rule detail — version history, run history, clone |
| `/assets` | Data assets with certification and lineage |
| `/schedules` | Schedule management |
| `/runs` | Execution logs with delta badges and CSV export |
| `/alerts` | Alert lifecycle management |
| `/audit` | Audit log viewer with CSV export |
| `/ai-assistant` | Full-page AI chat (deep conversations) |
| `/settings` | Config tabs including SLA & Quality thresholds |
| `/help` | In-app metrics glossary, rule types, FAQ |
| `/admin/domains` | Domain and subdomain management |
| `/admin/users` | User management |

### Key Components

| Component | Description |
|---|---|
| `AIChatBot` | Floating AI Copilot (bottom-right) — Rule Creation Wizard + quick chat |
| `CommandPalette` | ⌘K palette for navigation |
| `MetricInfo` | ℹ icon with rich tooltip for every dashboard metric |
| `Tooltip` | Rich tooltip with JSX content support, auto-flip |
| `Section` (global dashboard) | Collapsible section with minimize/restore |
| `SlaQualityTab` (settings) | SLA threshold and per-entity config management |

### Layout Controls (Global Dashboard)

- **3 layouts**: Default (grid), Compact (denser), Wide (single column)
- **Per-section collapse** — click section header to minimize
- **Panel show/hide** — Recent Failures and Open Alerts can be individually shown/hidden with a vertical collapsed strip
- **Minimize all / Reset** buttons
- All preferences persisted in `localStorage` under key `dq-global-layout`

---

---

## 53. Atlan-Inspired Data Catalog and Governance Features

The platform extends beyond data quality monitoring to become a full enterprise data catalog and governance hub. The features below are inspired by Atlan, DataHub, and Collibra — the leading enterprise data governance products.

---

### 53.1 Business Glossary

A centralized repository of business terms that connects the language of business stakeholders to the technical metadata of data assets.

#### Data Model

```sql
CREATE TABLE glossary_terms (
    term_id        VARCHAR(36) PRIMARY KEY,
    term_name      VARCHAR(200) NOT NULL UNIQUE,
    definition     TEXT NOT NULL,
    examples       TEXT,                          -- example values or usage
    synonyms       TEXT,                          -- comma-separated aliases
    domain_id      VARCHAR(36),                   -- owning domain (optional)
    owner_email    VARCHAR(200),
    status         VARCHAR(20) DEFAULT 'active',  -- draft | active | deprecated
    parent_term_id VARCHAR(36),                   -- hierarchical glossary
    created_by     VARCHAR(200),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE glossary_term_assets (
    id          VARCHAR(36) PRIMARY KEY,
    term_id     VARCHAR(36) NOT NULL REFERENCES glossary_terms(term_id),
    asset_id    VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    column_name VARCHAR(200),                    -- null = linked to whole table
    created_by  VARCHAR(200),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### API Endpoints

```
GET    /glossary/terms                     — list all terms (filter by domain, status)
POST   /glossary/terms                     — create a term
GET    /glossary/terms/{id}                — get term with linked assets
PUT    /glossary/terms/{id}                — update
DELETE /glossary/terms/{id}                — soft delete (status=deprecated)
POST   /glossary/terms/{id}/link-asset     — link a term to a table or column
DELETE /glossary/terms/{id}/link-asset/{link_id}
GET    /assets/{asset_id}/glossary         — all terms linked to a table
```

#### UI

- **Glossary page** (`/glossary`) — searchable directory of all business terms with domain filter, hierarchy tree view, and status filter (active / draft / deprecated)
- **Term detail page** — definition, examples, synonyms, linked assets with clickable table/column links
- **Table Dashboard** — "Business Terms" card lists terms linked to this table; click opens term detail
- **Column inline linking** — in the asset detail, each column row has a "+ Link Term" button

---

### 53.2 Data Classification and Sensitivity Labels

Tag columns and tables with data sensitivity classifications to support data privacy, compliance (GDPR, HIPAA, SOX), and access control.

#### Classifications

```
PII             — Personally Identifiable Information (name, email, SSN, DOB)
SENSITIVE       — Business-sensitive but not PII (revenue figures, salary, contracts)
CONFIDENTIAL    — Internal use only
RESTRICTED      — Highly controlled (legal hold, M&A data)
PUBLIC          — Freely shareable
```

#### Data Model

```sql
CREATE TABLE data_classifications (
    classification_id   VARCHAR(36) PRIMARY KEY,
    asset_id            VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    column_name         VARCHAR(200),           -- null = whole table
    classification      VARCHAR(30) NOT NULL,   -- PII | SENSITIVE | CONFIDENTIAL | RESTRICTED | PUBLIC
    justification       TEXT,
    applied_by          VARCHAR(200),
    reviewed_at         TIMESTAMP,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_classifications_asset ON data_classifications(asset_id);
```

#### API Endpoints

```
GET    /assets/{asset_id}/classifications        — list all classifications for a table
POST   /assets/{asset_id}/classifications        — apply a classification
DELETE /assets/{asset_id}/classifications/{id}   — remove a classification
GET    /classifications/summary                  — counts by classification level
GET    /classifications/pii-assets               — all tables/columns marked PII
```

#### UI Behavior

- **Column grid in asset detail** — each column row shows a colored classification badge (red=PII, orange=SENSITIVE, yellow=CONFIDENTIAL, etc.)
- **Table Dashboard** — a "Sensitivity" section shows a summary of classification counts
- **Data Assets list** — filter by classification; PII tables shown with a warning icon
- **Admins and domain owners** can apply/remove classifications
- AI can auto-suggest classifications: `POST /ai/classify-columns` — analyzes column names and types and suggests sensitivity labels

---

### 53.3 Column-Level Metadata and Data Profiling

Each registered Snowflake table gets a column-level metadata registry that captures business descriptions, sample values, and statistical profiles.

#### Data Model

```sql
CREATE TABLE column_metadata (
    col_id          VARCHAR(36) PRIMARY KEY,
    asset_id        VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    column_name     VARCHAR(200) NOT NULL,
    data_type       VARCHAR(100),
    is_nullable     BOOLEAN,
    description     TEXT,                       -- business description (editable)
    sample_values   TEXT,                       -- JSON array of up to 5 sample values
    is_primary_key  BOOLEAN DEFAULT FALSE,
    is_foreign_key  BOOLEAN DEFAULT FALSE,
    references_table VARCHAR(200),              -- for FK columns
    -- profiling stats (updated on each schema scan)
    null_count      BIGINT,
    unique_count    BIGINT,
    min_value       TEXT,
    max_value       TEXT,
    avg_value       FLOAT,
    cardinality_pct FLOAT,                      -- unique_count / total_rows * 100
    last_profiled_at TIMESTAMP,
    updated_by      VARCHAR(200),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (asset_id, column_name)
);
CREATE INDEX ix_col_meta_asset ON column_metadata(asset_id);
```

#### API Endpoints

```
GET    /assets/{asset_id}/columns                — full column list with metadata
PUT    /assets/{asset_id}/columns/{column_name}  — update description / business metadata
POST   /assets/{asset_id}/columns/profile        — trigger a live Snowflake profiling run
GET    /assets/{asset_id}/columns/profile/status — profile job status
```

#### Profiling Logic

`POST /assets/{id}/columns/profile` executes per-column aggregate SQL against Snowflake:

```sql
SELECT
  column_name,
  COUNT(*)          AS total_rows,
  COUNT(column)     AS non_null_count,
  COUNT(DISTINCT column) AS unique_count,
  MIN(column)::TEXT  AS min_value,
  MAX(column)::TEXT  AS max_value
FROM schema.table
GROUP BY 1;
```

Results are stored in `column_metadata` and shown in the Column Detail panel.

#### UI

- **Column grid** — shown in Table Dashboard under a "Schema" tab: name, type, nullable, description (inline-editable), null%, cardinality, sample values, classification badge, and linked glossary terms
- **Profile now button** — triggers an on-demand profiling run; progress shown with a job status badge
- Columns with high null % (>10%) are flagged in orange; columns with low cardinality flagged for potential accepted_values rule suggestion

---

### 53.4 Data Products

A data product is a curated, documented, and governed collection of related tables that together deliver a business-level data asset (e.g., "Revenue 360", "Customer 360").

#### Data Model

```sql
CREATE TABLE data_products (
    product_id      VARCHAR(36) PRIMARY KEY,
    product_name    VARCHAR(200) NOT NULL,
    description     TEXT,
    domain_id       VARCHAR(36) REFERENCES domains(domain_id),
    owner_email     VARCHAR(200),
    status          VARCHAR(20) DEFAULT 'draft',  -- draft | published | deprecated
    tags            TEXT,                         -- comma-separated
    readme          TEXT,                         -- Markdown documentation
    version         VARCHAR(20) DEFAULT '1.0',
    created_by      VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE data_product_assets (
    id          VARCHAR(36) PRIMARY KEY,
    product_id  VARCHAR(36) NOT NULL REFERENCES data_products(product_id),
    asset_id    VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    role        VARCHAR(50),                      -- 'primary' | 'supporting' | 'output'
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### API Endpoints

```
GET    /data-products                     — list all (filter by domain, status)
POST   /data-products                     — create
GET    /data-products/{id}                — detail with linked assets
PUT    /data-products/{id}                — update metadata / readme
POST   /data-products/{id}/assets         — add a table to the product
DELETE /data-products/{id}/assets/{link_id}
GET    /data-products/{id}/quality        — aggregated quality score across all product tables
DELETE /data-products/{id}                — soft delete
```

#### UI

- **Data Products page** (`/data-products`) — card grid showing each product with quality score, table count, owner, and status badge
- **Product detail page** — README (rendered Markdown), linked tables with quality scores, SLA status, lineage mini-graph, and a "Request Access" button
- **Global Dashboard** — "Data Products" KPI card with count and overall quality

---

### 53.5 Collaboration — Comments, Annotations, and Questions

Users can comment on any asset, column, rule, or run to enable team collaboration and knowledge sharing inside the platform.

#### Data Model

```sql
CREATE TABLE asset_comments (
    comment_id  VARCHAR(36) PRIMARY KEY,
    entity_type VARCHAR(30) NOT NULL,   -- 'asset' | 'rule' | 'run' | 'column' | 'data_product'
    entity_id   VARCHAR(36) NOT NULL,
    parent_id   VARCHAR(36),            -- for threaded replies
    body        TEXT NOT NULL,          -- Markdown
    comment_type VARCHAR(20) DEFAULT 'comment',  -- 'comment' | 'question' | 'issue' | 'announcement'
    is_resolved BOOLEAN DEFAULT FALSE,
    author_email VARCHAR(200),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_comments_entity ON asset_comments(entity_type, entity_id);
```

Comment types:
- **comment** — general observation or note
- **question** — a question that can be marked answered
- **issue** — a data quality issue flagged by a consumer (auto-creates a linked DQ rule suggestion)
- **announcement** — admin broadcast (e.g., "This table is being deprecated on Jan 1")

#### API Endpoints

```
GET    /comments?entity_type=asset&entity_id=xxx    — list comments
POST   /comments                                    — create comment
PUT    /comments/{id}                               — edit
DELETE /comments/{id}                               — delete (own comment only; admin can delete any)
POST   /comments/{id}/resolve                       — mark as resolved (for questions/issues)
```

#### UI

- **Table Dashboard** — "Discussion" tab shows all comments on this asset with threaded replies
- **Rule Detail** — comment thread below run history
- **Announcement banner** — if an `announcement` type comment exists for an asset, it appears as a yellow banner on the dashboard
- **Unresolved questions badge** — count on the asset card in the data catalog

---

### 53.6 Popularity, Usage, and Trust Scores

Track how often an asset is queried, rated, and accessed to help teams prioritize governance efforts.

#### Data Model

```sql
CREATE TABLE asset_usage (
    usage_id    VARCHAR(36) PRIMARY KEY,
    asset_id    VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    event_type  VARCHAR(30) NOT NULL,  -- 'view_dashboard' | 'run_rule' | 'api_query' | 'schema_browse'
    user_email  VARCHAR(200),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_usage_asset_created ON asset_usage(asset_id, created_at DESC);

CREATE TABLE asset_ratings (
    rating_id   VARCHAR(36) PRIMARY KEY,
    asset_id    VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review      TEXT,
    user_email  VARCHAR(200),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (asset_id, user_email)
);
```

#### Metrics

- **View count** — number of dashboard views in the last 30 days
- **Rule run count** — number of DQ rule executions
- **Average rating** — 1–5 star rating from data consumers
- **Trust score** — composite: `(quality_score * 0.6) + (avg_rating/5 * 100 * 0.2) + (freshness_ok * 20)`

#### API Endpoints

```
GET    /assets/{asset_id}/usage            — usage stats (last 7/30/90 days)
POST   /assets/{asset_id}/rate             — submit a rating (1–5)
GET    /assets/{asset_id}/rating           — average rating and reviews
GET    /assets/most-used                   — top 10 assets by view/run count
GET    /assets/most-trusted                — top 10 by trust score
```

#### UI

- **Asset card** — star rating display (read-only) + view count badge
- **Table Dashboard** header — trust score gauge, view count, and "Rate this dataset" button
- **Data Catalog page** — sortable by trust score, popularity, or quality score

---

### 53.7 Data Catalog Search and Discovery

Full-text search across all assets, columns, business terms, descriptions, tags, and owners — similar to Atlan's global search.

#### Search Index

Build an in-database search using PostgreSQL `tsvector` full-text search:

```sql
-- Materialized view combining all searchable metadata
CREATE MATERIALIZED VIEW catalog_search_index AS
SELECT
    'asset'           AS entity_type,
    da.asset_id       AS entity_id,
    da.sf_table_name  AS title,
    d.domain_name     AS domain,
    da.table_description AS description,
    da.owner_name     AS owner,
    da.criticality    AS tags,
    to_tsvector('english',
        coalesce(da.sf_table_name, '') || ' ' ||
        coalesce(da.table_description, '') || ' ' ||
        coalesce(d.domain_name, '') || ' ' ||
        coalesce(da.owner_name, '') || ' ' ||
        coalesce(da.owner_email, '')
    ) AS search_vector
FROM data_assets da
LEFT JOIN domains d ON da.domain_id = d.domain_id
UNION ALL
SELECT
    'glossary_term',
    term_id, term_name, '', definition, owner_email, synonyms,
    to_tsvector('english', term_name || ' ' || coalesce(definition,'') || ' ' || coalesce(synonyms,''))
FROM glossary_terms
UNION ALL
SELECT
    'data_product',
    product_id, product_name, '', description, owner_email, tags,
    to_tsvector('english', product_name || ' ' || coalesce(description,'') || ' ' || coalesce(tags,''))
FROM data_products;

CREATE INDEX ix_catalog_search ON catalog_search_index USING GIN(search_vector);
```

#### API Endpoints

```
GET /catalog/search?q=invoice&type=asset,glossary&domain=revenue&limit=20
GET /catalog/recent                   — recently viewed assets (per user)
GET /catalog/popular                  — most-viewed assets platform-wide
GET /catalog/domains/{id}/assets      — all assets in a domain with metadata
GET /catalog/assets/{id}              — enriched asset detail for catalog view
```

Search response includes: entity_type, title, domain, description, owner, quality_score, trust_score, classification badges, linked term count, and last updated.

#### UI — Data Catalog Page (`/catalog`)

- **Global search bar** at the top — type to search across all asset types; results appear with entity type icons
- **Facet filters** — Domain, Asset Type, Classification, Certification, Owner, Tag
- **Sort by** — Quality Score, Trust Score, Last Updated, Popularity, Alphabetical
- **Asset card view** — show name, domain, description, owner, quality badge, certification badge, classification tags, and rating
- **Table view toggle** — denser view with columns: Name, Domain, Owner, Quality, Certification, Last Updated, Trust Score
- **Saved searches** — users can bookmark search queries
- **Quick filters** — "My assets", "PII tables", "Uncertified", "Low quality", "Recently added"

---

### 53.8 Announcements and Deprecation Notices

Admins can broadcast announcements about assets — upcoming deprecation, planned maintenance, known data issues, or migration guides.

#### Data Model

```sql
CREATE TABLE asset_announcements (
    announcement_id VARCHAR(36) PRIMARY KEY,
    entity_type     VARCHAR(30) NOT NULL,   -- 'asset' | 'domain' | 'subdomain' | 'global'
    entity_id       VARCHAR(36),
    title           VARCHAR(200) NOT NULL,
    body            TEXT,                   -- Markdown
    announcement_type VARCHAR(20) NOT NULL, -- 'info' | 'warning' | 'deprecation' | 'maintenance'
    expires_at      TIMESTAMP,
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### Types

- `info` — blue banner: new table added, schema expanded
- `warning` — yellow banner: known data issue, late pipeline
- `deprecation` — red banner: this table will be removed on [date], migrate to [new table]
- `maintenance` — gray banner: scheduled downtime for pipeline

#### API Endpoints

```
GET    /announcements?entity_type=asset&entity_id=xxx   — active announcements
POST   /announcements                                    — create (admin/domain_owner)
PUT    /announcements/{id}
DELETE /announcements/{id}
```

#### UI

- Announcements appear as colored banners at the top of the Table Dashboard, Domain Dashboard, and the relevant asset cards in the catalog
- A **global announcements banner** (entity_type=global) appears at the top of every page
- Expired announcements are hidden automatically (checked against `expires_at`)

---

### 53.9 Access Request Workflow

Data consumers can request access to datasets they cannot currently see, creating a governed access approval flow.

#### Data Model

```sql
CREATE TABLE access_requests (
    request_id      VARCHAR(36) PRIMARY KEY,
    asset_id        VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    requester_email VARCHAR(200) NOT NULL,
    requester_name  VARCHAR(200),
    reason          TEXT NOT NULL,
    access_level    VARCHAR(20) DEFAULT 'read',  -- 'read' | 'write'
    status          VARCHAR(20) DEFAULT 'pending',  -- pending | approved | denied | expired
    reviewer_email  VARCHAR(200),
    review_note     TEXT,
    expires_at      TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### API Endpoints

```
POST   /access-requests                    — submit a request
GET    /access-requests?status=pending     — list (admin sees all; user sees own)
POST   /access-requests/{id}/approve       — approve (admin/domain_owner/data_owner)
POST   /access-requests/{id}/deny          — deny with a reason
```

#### UI

- **"Request Access" button** on every asset detail page (shown to users who do not own the asset)
- **Admin → Access Requests** panel — lists pending requests with Approve / Deny buttons and a reason text field
- **Notifications** — requester gets a toast notification when their request is approved or denied
- Approved requests are logged in `audit_logs` with entity_type = 'access_request'

---

### 53.10 Tags and Custom Attributes

Flexible labeling system beyond fixed classifications — teams can apply any tag to any asset.

#### Data Model

```sql
CREATE TABLE tags (
    tag_id      VARCHAR(36) PRIMARY KEY,
    tag_name    VARCHAR(100) NOT NULL UNIQUE,
    color       VARCHAR(7) DEFAULT '#6366f1',  -- hex color
    description TEXT,
    created_by  VARCHAR(200),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE asset_tags (
    id          VARCHAR(36) PRIMARY KEY,
    tag_id      VARCHAR(36) NOT NULL REFERENCES tags(tag_id),
    entity_type VARCHAR(30) NOT NULL,  -- 'asset' | 'rule' | 'data_product'
    entity_id   VARCHAR(36) NOT NULL,
    created_by  VARCHAR(200),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (tag_id, entity_type, entity_id)
);

CREATE TABLE custom_attributes (
    attr_id     VARCHAR(36) PRIMARY KEY,
    attr_key    VARCHAR(100) NOT NULL,           -- e.g. "data_steward", "retention_days"
    attr_value  TEXT,
    entity_type VARCHAR(30) NOT NULL,
    entity_id   VARCHAR(36) NOT NULL,
    updated_by  VARCHAR(200),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (attr_key, entity_type, entity_id)
);
```

#### API Endpoints

```
GET    /tags                                      — list all tags
POST   /tags                                      — create tag
POST   /assets/{id}/tags                          — apply tags
DELETE /assets/{id}/tags/{tag_id}                 — remove tag
GET    /assets?tag=pii_reviewed                   — filter assets by tag
POST   /assets/{id}/custom-attributes             — set a custom key-value attribute
GET    /assets/{id}/custom-attributes             — get all custom attributes
```

#### UI

- **Tag pills** visible on asset cards, table dashboard header, and catalog rows
- **Tag filter** in the catalog facet panel
- **Tag management page** (`/admin/tags`) — create, color-code, and delete tags (admin only)
- **Custom attributes panel** on Table Dashboard — a collapsible section showing arbitrary key-value pairs editable by domain owners (e.g., `data_steward: jane@co.com`, `retention_days: 365`, `gdpr_relevant: true`)

---

### 53.11 dbt, Airflow, and Third-Party Integrations

Pull lineage, metadata, and run history from external tools used in the data stack.

#### dbt Integration

```
POST /integrations/dbt/upload          — upload dbt manifest.json + catalog.json
GET  /integrations/dbt/models          — list parsed dbt models
POST /integrations/dbt/sync            — sync model descriptions and lineage into assets
```

On sync:
- Creates `data_assets` records for dbt models not already registered
- Sets `table_description` from dbt model descriptions
- Populates `column_metadata.description` from dbt column descriptions
- Writes `data_lineage` records from dbt `ref()` relationships
- Imports dbt test failures as DQ rule run records

#### Airflow Integration

```
POST /integrations/airflow/dag-runs    — ingest DAG run history
GET  /assets/{id}/pipeline-runs        — last 10 pipeline executions for this table
```

Shows pipeline freshness on the Table Dashboard: last DAG run status (success/failed), duration, and next scheduled run.

#### Looker / Tableau / Metabase

```
POST /integrations/looker/lineage      — import Looker LookML explores that reference tables
POST /integrations/tableau/lineage     — import Tableau workbook → table dependencies
```

Downstream dashboards appear in the lineage graph with a Looker/Tableau icon and link to the external tool.

---

### 53.12 Governance Scorecards

A per-domain governance scorecard that rates domains on metadata completeness, documentation quality, classification coverage, and data quality compliance.

#### Scorecard Dimensions

| Dimension | Weight | Calculation |
|---|---|---|
| Data Quality | 40% | Avg quality score across all tables in domain |
| Documentation | 20% | % of tables with a description + % of columns with descriptions |
| Classification | 15% | % of tables with at least one classification applied |
| Ownership | 10% | % of tables with an owner_email assigned |
| Certification | 10% | % of tables certified (not uncertified) |
| SLA Compliance | 5% | % of tables meeting their SLA threshold |

Overall governance score: weighted sum, 0–100.

#### API Endpoints

```
GET /governance/scorecards             — scorecard for every domain
GET /governance/scorecards/{domain_id} — detailed scorecard breakdown
GET /governance/scorecards/global      — platform-wide governance score
```

#### UI

- **Domain Dashboard** — "Governance Scorecard" panel with a radar chart showing all 6 dimensions
- **Governance page** (`/governance`) — side-by-side domain scorecard comparison, drill-down into weakest dimension per domain
- **Global Dashboard** — "Governance Score" KPI card alongside the quality score

---

### 53.13 Policy Engine

Define and enforce data governance policies that automatically flag assets or trigger alerts when violated.

#### Policy Types

| Policy | Trigger |
|---|---|
| `no_pii_without_classification` | PII column detected but no classification applied |
| `certification_required` | Table has been in production > 30 days but is still uncertified |
| `owner_required` | Table has no owner_email |
| `stale_description` | Table description unchanged for > 90 days |
| `sla_breach` | Quality score below configured threshold |
| `no_rules_defined` | Table registered for > 7 days with zero active rules |
| `high_null_rate` | Column null% exceeds configured threshold (default 20%) |

#### Data Model

```sql
CREATE TABLE governance_policies (
    policy_id       VARCHAR(36) PRIMARY KEY,
    policy_name     VARCHAR(200) NOT NULL,
    policy_type     VARCHAR(50) NOT NULL,
    description     TEXT,
    severity        VARCHAR(20) DEFAULT 'medium',  -- info | warning | critical
    is_active       BOOLEAN DEFAULT TRUE,
    config          JSONB,                          -- policy-specific params
    created_by      VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE policy_violations (
    violation_id    VARCHAR(36) PRIMARY KEY,
    policy_id       VARCHAR(36) NOT NULL REFERENCES governance_policies(policy_id),
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       VARCHAR(36) NOT NULL,
    violation_detail TEXT,
    status          VARCHAR(20) DEFAULT 'open',   -- open | acknowledged | resolved
    detected_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMP
);
```

#### API Endpoints

```
GET    /governance/policies                — list policies
POST   /governance/policies                — create policy
PUT    /governance/policies/{id}           — update
POST   /governance/policies/evaluate       — run evaluation against all assets (returns violations)
GET    /governance/violations              — list open violations
POST   /governance/violations/{id}/resolve — mark resolved
```

#### UI

- **Governance page** — "Violations" tab listing all open policy violations grouped by severity, with Resolve button
- **Table Dashboard** — "Policy Violations" badge next to certification if there are open violations
- **Nightly scheduler job** (`evaluate_policies()`) — runs every night at 00:15, writes new violations, resolves auto-resolved ones

---

### 53.14 Data Contracts

A data contract is a formal agreement between a data producer and data consumer that specifies the expected schema, quality guarantees, and SLA for a dataset.

#### Data Model

```sql
CREATE TABLE data_contracts (
    contract_id     VARCHAR(36) PRIMARY KEY,
    asset_id        VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    contract_name   VARCHAR(200) NOT NULL,
    version         VARCHAR(20) DEFAULT '1.0',
    producer_team   VARCHAR(200),
    consumer_team   VARCHAR(200),
    status          VARCHAR(20) DEFAULT 'draft',  -- draft | active | violated | deprecated
    -- Schema guarantee
    schema_json     JSONB,                         -- expected columns + types
    -- Quality guarantees
    min_quality_score FLOAT DEFAULT 95.0,
    max_null_pct    FLOAT,
    max_staleness_hours INTEGER DEFAULT 24,
    -- Operational
    sla_description TEXT,
    breach_action   VARCHAR(50),                   -- 'alert' | 'block' | 'notify'
    effective_from  DATE,
    effective_until DATE,
    created_by      VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### Contract Status Transitions

```
draft → active → (violated | deprecated)
violated → active (after remediation)
```

A contract is automatically set to `violated` when:
- The table's quality score drops below `min_quality_score`
- A column in `schema_json` goes missing (schema drift)
- Data freshness exceeds `max_staleness_hours`

#### API Endpoints

```
GET    /contracts                         — list all contracts
POST   /contracts                         — create a contract
GET    /contracts/{id}                    — contract detail with current compliance status
PUT    /contracts/{id}                    — update
POST   /contracts/{id}/validate           — evaluate contract compliance now
GET    /assets/{asset_id}/contracts       — contracts for a specific asset
```

#### UI

- **Contract page** (`/contracts`) — list with status badges (Active green / Violated red / Draft gray)
- **Table Dashboard** — "Contracts" section shows active contracts with a compliance status indicator
- **Contract detail** — YAML-formatted view of expected schema vs actual, quality SLAs, and a violation timeline chart
- AI can generate a contract draft: `POST /ai/generate-contract` with table schema + domain rules as input

---

## 52. Acceptance Criteria (Extended)

The platform is production-ready when all original criteria (§44) are met PLUS:

| # | Criterion |
|---|---|
| 16 | Domain owners can only see and modify their assigned domain's data |
| 17 | Admins can create service accounts with scoped API keys for CI/CD |
| 18 | Users can sign in via Google SSO; first-time SSO users get `viewer` role |
| 19 | Snowflake credentials and LLM API keys are encrypted at rest |
| 20 | Quality score thresholds (SLA, warning, penalties) are configurable per entity |
| 21 | Bulk rule execution is non-blocking and returns a job_id for polling |
| 22 | Every metric on every dashboard has a tooltip explaining its formula |
| 23 | Data lineage links can be registered and impact analysis returned per table |
| 24 | AI Copilot (floating) and AI Assistant (full-page) are clearly distinct entry points |
| 25 | Empty states have illustrations and clear CTAs on all list pages |
| 26 | Skeleton loading states replace bare spinners on rules and alerts pages |
| **Catalog & Governance (Atlan-Inspired)** | |
| 27 | Business glossary terms can be created, linked to tables and columns, and searched |
| 28 | Columns and tables can be tagged with sensitivity classifications (PII, SENSITIVE, etc.) |
| 29 | Column-level metadata (description, sample values, null%, cardinality) is stored and displayed |
| 30 | On-demand column profiling job executes against Snowflake and populates stats |
| 31 | Data products can be created bundling multiple related tables with documentation |
| 32 | Users can comment, ask questions, and file issues on any asset or rule |
| 33 | Announcements (deprecation, maintenance, warnings) appear as banners on affected dashboards |
| 34 | Data consumers can submit access requests; admins/owners can approve or deny |
| 35 | Assets can be tagged with custom labels and arbitrary key-value metadata attributes |
| 36 | Full-text catalog search returns assets, glossary terms, and data products |
| 37 | dbt manifest.json can be uploaded to sync model descriptions and ref() lineage |
| 38 | Per-domain governance scorecards rate documentation, classification, ownership, and quality |
| 39 | Policy engine detects violations (uncertified tables, PII without classification, no owner) nightly |
| 40 | Data contracts define schema + quality guarantees; violated automatically when breached |
| 41 | Asset popularity (view count, run count), trust score, and star ratings are tracked and displayed |
| **AI-Native & Predictive Intelligence** | |
| 42 | AI auto-suggests rules for newly registered tables within 5 minutes |
| 43 | Self-healing remediation SQL is generated and dry-runnable for common failures |
| 44 | Users can define rules in plain English; AI converts to SQL and rule config |
| 45 | Conversational AI can create rules, update configs, and query audit logs via natural language |
| 46 | Predictive quality scores shown as a forecast band on the trend chart with risk badges |
| 47 | ML anomaly detectors detect distribution shifts and volume spikes not caught by rules |
| 48 | Root cause analysis report automatically generated for every critical failure |
| **Observability & Incident Management** | |
| 49 | OTEL metrics emitted for every rule run, quality score, and alert |
| 50 | Real-time SSE event stream broadcasts quality events to Grafana and other consumers |
| 51 | Quality incidents automatically created for critical failures with MTTD/MTTR tracking |
| 52 | On-call schedules route critical alerts to the right engineer at the right time |
| 53 | Post-mortem drafts auto-generated after incident resolution |
| **Streaming & Multi-Engine** | |
| 54 | Real-time quality checks applied to Kafka/Kinesis messages as they arrive |
| 55 | BigQuery, Databricks, Redshift, and Synapse supported as rule execution engines |
| 56 | Cross-engine consistency check validates data parity during warehouse migrations |
| **Privacy, Security & Compliance** | |
| 57 | Column-level masking policies enforce PII protection based on caller role |
| 58 | AI PII discovery scan identifies unclassified sensitive columns |
| 59 | Compliance evidence packages generated for GDPR, SOX, HIPAA with one click |
| 60 | GDPR right-to-erasure impact analysis returns all affected tables via lineage |
| **Data Mesh & Federated Governance** | |
| 61 | Each domain has a self-service governance workspace |
| 62 | Cross-domain data sharing agreements with quality SLA tracking |
| 63 | Data mesh topology graph shows inter-domain quality flows |
| **CI/CD & Marketplace** | |
| 64 | GitHub Actions `dq-check` gate blocks merges when quality regresses |
| 65 | dbt test results sync into unified quality score |
| 66 | Rule template marketplace with industry packs and AI-powered matching |
| **Cost Impact & Business ROI** | |
| 67 | Cost per bad row configured per table; cumulative incident cost tracked |
| 68 | Executive dashboard shows dollar cost of bad data and ROI of DQ investment |
| **Semantic Quality** | |
| 69 | Semantic consistency rules defined in natural language (AI converts to SQL) |
| 70 | LLM-powered validation for complex business rules that SQL cannot express |

---

## 54. AI-Native Autonomous Data Quality

This platform moves beyond rule-based detection to an AI-first approach where intelligence is embedded into every layer of quality management.

### 54.1 Autonomous Rule Generation

The AI continuously analyzes table schemas, historical run results, and business glossary terms to auto-suggest new rules — without waiting for a human to ask.

**Trigger conditions for auto-suggestion:**
- A new table is registered with no rules → AI proposes a starter rule set within 5 minutes
- A column's null rate crosses 0% for the first time → suggests a `null_check`
- A new column appears (schema drift event) → suggests appropriate rule type based on column name and data type
- A rule consistently passes with 100% score for 30 days → AI may suggest tightening thresholds

**API:**
```
POST /ai/auto-suggest/table/{asset_id}      — trigger on-demand suggestion
GET  /ai/auto-suggest/queue                 — list pending AI suggestions awaiting review
POST /ai/auto-suggest/{suggestion_id}/accept
POST /ai/auto-suggest/{suggestion_id}/reject
```

All auto-suggested rules start as `pending_review`. The platform never activates an AI-generated rule without human approval.

### 54.2 Self-Healing Data Quality

When a rule fails and the AI has high confidence in the root cause, it can generate and propose a remediation SQL script or a configuration change.

**Remediation types:**
- `backfill_nulls` — generate an `UPDATE … SET col = default WHERE col IS NULL` for nullable columns with a known default
- `trim_whitespace` — detect and fix leading/trailing whitespace in string columns
- `normalize_case` — fix mixed-case values in accepted_values columns
- `remove_duplicates` — generate a `DELETE` that removes duplicate rows while keeping the most recent
- `fix_date_format` — detect ISO vs non-ISO date strings and propose a conversion

**API:**
```
POST /ai/remediation/suggest/{run_id}       — generate remediation for a failing run
POST /ai/remediation/{id}/preview           — dry-run against Snowflake (no changes)
POST /ai/remediation/{id}/apply             — execute the fix (admin only, requires confirmation)
```

All remediations are dry-runnable before application. Every applied remediation is logged in `audit_logs` with the full SQL executed.

### 54.3 Natural Language Rule Definition

Data engineers and business analysts can write rules in plain English — the AI converts them to executable Snowflake SQL with the correct rule type, config, and severity.

**Examples:**
```
"Invoice amounts must always be positive"
→ rule_type: range_check, min_value: 0, severity: critical

"Customer email must look like a valid email address"
→ rule_type: regex_check, pattern: ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$

"The orders table should be refreshed by 7 AM every weekday"
→ rule_type: freshness_check, max_hours: 9 (from midnight), schedule: weekdays at 07:00

"There should never be two orders with the same order_id"
→ rule_type: uniqueness_check, target_column: order_id, severity: critical
```

**API:**
```
POST /ai/rules/from-natural-language
{
  "description": "Invoice amounts must always be positive",
  "asset_id": "...",
  "domain_context": "Revenue billing"
}
```

**UI:** A natural language input box at the top of the Create Rule form. As the user types, the AI fills in rule type, target column, config, and severity in real time.

### 54.4 Conversational Governance Assistant

An AI assistant that understands platform context and can perform governance actions via conversation — not just answer questions.

**Capabilities beyond Q&A:**
- "Create a null check on invoice_id in the revenue invoices table" → creates a draft rule
- "Set the warning threshold for Finance to 90%" → updates the SLA config
- "Show me all uncertified tables in HR with no owner" → executes a platform query and returns results
- "Who made changes to the payroll rules this week?" → queries audit_logs and returns a summary
- "Apply the standard Revenue ruleset to the new billing_v2 table" → clones rules from a template
- "Generate a data contract for the customer_360 data product" → drafts a contract

All actions taken via the assistant are logged in `audit_logs` with `actor: ai_assistant`.

**API:**
```
POST /ai/govern
{
  "instruction": "Create a null check on invoice_id in the revenue invoices table",
  "dry_run": true   — if true, returns what would happen without executing
}
```

### 54.5 AI Quality Score Prediction

A trained ML model forecasts next-day quality scores for each table based on:
- Historical score trend (last 30 runs)
- Day-of-week patterns
- Pipeline lag indicators
- Anomaly in upstream table quality scores

**API:**
```
GET /ai/predict/quality/{asset_id}?horizon_days=7
→ {
    "asset_id": "...",
    "current_score": 94.2,
    "predictions": [
      {"date": "2026-05-13", "predicted_score": 93.1, "confidence": 0.87},
      {"date": "2026-05-14", "predicted_score": 91.5, "confidence": 0.72}
    ],
    "risk": "MEDIUM",
    "risk_reason": "Historical pattern shows score drops on Mondays after batch loads"
  }
```

**UI:** Prediction band shown as a shaded area on the 30-day quality trend chart, with a risk badge ("Low Risk", "At Risk", "High Risk").

---

## 55. Predictive and Proactive Quality Intelligence

### 55.1 Anomaly Detection Engine

ML-based statistical anomaly detection that operates alongside rule-based checks — catching issues that no manually written rule would catch.

**Detection methods:**
- **Z-score** — flags values more than N standard deviations from the column mean
- **Isolation Forest** — unsupervised anomaly detection for tabular row-level outliers
- **Seasonal decomposition** — detects volume anomalies accounting for weekly/monthly seasonality
- **Interquartile Range (IQR)** — robust to non-normal distributions

**Data Model:**
```sql
CREATE TABLE anomaly_detectors (
    detector_id     VARCHAR(36) PRIMARY KEY,
    asset_id        VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    column_name     VARCHAR(200),
    detector_type   VARCHAR(30) NOT NULL,      -- zscore | iqr | isolation_forest | seasonal
    config          JSONB,                     -- sensitivity, training_window, etc.
    is_active       BOOLEAN DEFAULT TRUE,
    last_trained_at TIMESTAMP,
    created_by      VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE anomaly_detections (
    detection_id    VARCHAR(36) PRIMARY KEY,
    detector_id     VARCHAR(36) NOT NULL REFERENCES anomaly_detectors(detector_id),
    asset_id        VARCHAR(36) NOT NULL,
    run_id          VARCHAR(36),
    column_name     VARCHAR(200),
    anomaly_type    VARCHAR(50),               -- volume_spike | volume_drop | value_outlier | distribution_shift
    severity        VARCHAR(20),
    observed_value  TEXT,
    expected_range  TEXT,
    confidence      FLOAT,
    detected_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    is_acknowledged BOOLEAN DEFAULT FALSE
);
```

**API:**
```
POST /anomaly/detectors                        — create a detector for a column or table
GET  /anomaly/detectors?asset_id=...           — list detectors
POST /anomaly/detectors/{id}/train             — trigger training on historical data
GET  /anomaly/detections?asset_id=...          — list anomalies detected
POST /anomaly/detections/{id}/acknowledge      — mark as reviewed
```

**UI:** Anomaly detections appear alongside rule failures on the Table Dashboard under a separate "Anomalies" tab, with confidence scores and expected range visualizations.

### 55.2 Quality Degradation Early Warning System

A proactive alerting layer that fires before a quality SLA is breached — giving teams time to intervene.

**Warning triggers:**
- Score drops more than X points (configurable) in a 24-hour window → "Rapid degradation" warning
- Trend analysis shows score declining steadily for 3+ consecutive runs → "Trending down" warning
- A critical-severity rule has not been run in more than N hours (stale execution) → "Stale check" warning
- An upstream table's score degrades below threshold → "Upstream risk" warning propagated downstream via lineage

**API:**
```
GET /early-warnings                            — current active early warnings
GET /early-warnings/history                    — past 30 days
POST /early-warnings/{id}/suppress?hours=24    — snooze a warning
```

### 55.3 Root Cause Analysis (RCA) Engine

When a rule fails, the RCA engine automatically investigates the most likely upstream cause by:

1. Checking upstream lineage tables for quality degradation in the same time window
2. Checking pipeline run logs (Airflow integration) for late or failed DAG runs
3. Comparing column value distributions between the failing run and the previous passing run
4. Checking if a schema change occurred (new column, dropped column, type change)
5. Checking git history via GitHub/GitLab webhooks for SQL or dbt model changes

**API:**
```
POST /ai/rca/{run_id}                          — trigger RCA for a failed run
GET  /ai/rca/{run_id}/report                   — get RCA report
```

**RCA Report Response:**
```json
{
  "run_id": "...",
  "rule_name": "invoice_amount_positive",
  "confidence": 0.91,
  "root_cause": "upstream_quality_degradation",
  "explanation": "The source table revenue_raw.transactions degraded from 98.2% to 67.1% quality score at 02:14 AM — 4 hours before this rule failed. 1,847 rows in transactions had NULL amount values that propagated downstream.",
  "upstream_asset": "revenue_raw.transactions",
  "upstream_run_id": "...",
  "recommended_action": "Investigate the ETL pipeline for revenue_raw.transactions. Contact owner: etl-team@co.com"
}
```

---

## 56. Real-Time Streaming Data Quality

Extend data quality monitoring from batch SQL to streaming data pipelines (Kafka, Kinesis, Pub/Sub).

### 56.1 Streaming Rule Execution

Rules applied to messages as they arrive in a streaming topic, before they land in Snowflake.

**Supported sources:**
- Apache Kafka (via Kafka Consumer API)
- Amazon Kinesis
- Google Cloud Pub/Sub
- Apache Pulsar

**Streaming rule types:**
```
schema_validation     — each message must conform to a JSON Schema
null_check            — required fields must be present in every message
range_check           — numeric fields within bounds in real-time
regex_check           — format validation (email, phone, ID patterns)
duplicate_detection   — detect duplicate message keys within a rolling window
freshness_check       — messages must arrive within N seconds of event time
sequence_check        — event sequence numbers must be monotonically increasing
```

**Data Model:**
```sql
CREATE TABLE streaming_sources (
    source_id      VARCHAR(36) PRIMARY KEY,
    source_name    VARCHAR(200) NOT NULL,
    source_type    VARCHAR(30) NOT NULL,    -- kafka | kinesis | pubsub | pulsar
    connection_config JSONB NOT NULL,       -- bootstrap_servers, topic, group_id, etc.
    schema_json    JSONB,                   -- expected message schema (JSON Schema)
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE streaming_rule_runs (
    srun_id         VARCHAR(36) PRIMARY KEY,
    source_id       VARCHAR(36) REFERENCES streaming_sources(source_id),
    rule_id         VARCHAR(36) REFERENCES dq_rules(rule_id),
    window_start    TIMESTAMP NOT NULL,
    window_end      TIMESTAMP NOT NULL,
    messages_checked BIGINT DEFAULT 0,
    violations      BIGINT DEFAULT 0,
    violation_rate  FLOAT,
    sample_violations JSONB,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**API:**
```
POST /streaming/sources                        — register a streaming source
GET  /streaming/sources                        — list sources
POST /streaming/sources/{id}/rules             — attach a rule to a source
POST /streaming/sources/{id}/start-monitoring  — begin real-time monitoring
POST /streaming/sources/{id}/stop-monitoring
GET  /streaming/runs?source_id=...             — streaming rule run results
GET  /streaming/violations/live                — SSE stream of real-time violations
```

**UI:**
- **Streaming Monitoring page** (`/streaming`) — live dashboard with messages/sec, violation rate gauge, and a real-time violation feed
- Table Dashboard shows a "Streaming" tab if the asset has an associated streaming source

### 56.2 Change Data Capture (CDC) Quality

Monitor Debezium / Fivetran CDC streams for data quality issues at the row-event level:
- `UPDATE` events where old_value → new_value violates a rule
- `DELETE` events on rows that have downstream foreign key references
- `INSERT` events that duplicate existing primary key values

---

## 57. Multi-Engine and Multi-Cloud Data Quality

Break out of Snowflake-only execution to support the full modern data stack.

### 57.1 Supported Execution Engines

| Engine | Connection type | Rules supported |
|---|---|---|
| Snowflake | Native connector (current) | All 12 rule types |
| Google BigQuery | BigQuery Python client | All 12 rule types |
| Databricks / Spark SQL | JDBC / REST API | All rule types except streaming |
| Amazon Redshift | psycopg2 / Redshift connector | All 12 rule types |
| Azure Synapse Analytics | pyodbc / JDBC | All 12 rule types |
| PostgreSQL | asyncpg (direct) | All 12 rule types |
| dbt Core | dbt Cloud API / dbt Core CLI | null, unique, accepted_values, custom_sql |
| Apache Iceberg | PyIceberg | Volume, schema drift, freshness |
| Delta Lake | delta-rs | Volume, schema drift, freshness |

### 57.2 Engine Connection Model

```sql
CREATE TABLE engine_connections (
    engine_id       VARCHAR(36) PRIMARY KEY,
    engine_name     VARCHAR(200) NOT NULL,
    engine_type     VARCHAR(30) NOT NULL,    -- bigquery | databricks | redshift | synapse | postgres | dbt
    connection_config JSONB NOT NULL,        -- engine-specific params
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

`data_assets` gains a `engine_id` column alongside `connection_id` — the rule execution service dispatches to the right engine based on the asset's engine type.

### 57.3 Cross-Engine Data Quality Consistency Check

A new rule type `cross_engine_consistency_check` runs the same aggregation on two different engines and compares results:

```json
{
  "rule_type": "cross_engine_consistency_check",
  "source_engine_id": "snowflake-prod",
  "target_engine_id": "bigquery-analytics",
  "source_sql": "SELECT COUNT(*), SUM(amount) FROM prod.revenue.invoices WHERE date = CURRENT_DATE",
  "target_sql": "SELECT COUNT(*), SUM(amount) FROM `analytics.revenue.invoices` WHERE date = CURRENT_DATE",
  "tolerance_pct": 0.1
}
```

Passes if both results are within `tolerance_pct` of each other. Critical for validating data warehouse migrations.

---

## 58. Data Quality Observability Platform

Model data quality as a first-class observability signal — alongside metrics, logs, and traces.

### 58.1 OpenTelemetry Integration

Emit data quality signals as OpenTelemetry (OTEL) spans and metrics so they appear natively in Datadog, Grafana, New Relic, Honeycomb, and other observability platforms.

**Emitted OTEL metrics:**
```
dq.rule.quality_score{rule_id, asset_id, domain, severity}   — gauge
dq.rule.failed_rows{rule_id, asset_id}                        — counter
dq.rule.execution_duration_ms{rule_id, engine}                — histogram
dq.table.quality_score{asset_id, domain}                      — gauge
dq.alert.open_count{domain, severity}                         — gauge
```

**Config:**
```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_SERVICE_NAME=dq-platform
OTEL_ENABLED=true
```

### 58.2 Data Freshness SLA Dashboard

A dedicated real-time board showing freshness status for every monitored table:

```
Table                          Last Run    Freshness    SLA    Status
revenue.invoices               5m ago      99.97%       6h     ✅ On time
finance.gl_journal             2h ago      98.1%        4h     ⚠️  At risk
hr.payroll_summary             26h ago     —            24h    🔴 Breached
```

**API:**
```
GET /observability/freshness-board       — current freshness status for all tables
GET /observability/sla-breach-timeline   — history of SLA breaches over last 30 days
GET /observability/quality-heatmap       — domain × day-of-week quality score heatmap
```

### 58.3 Quality Event Stream

A Server-Sent Events (SSE) endpoint broadcasting every quality event in real time:

```
GET /observability/events/stream

data: {"event":"rule_completed","rule_id":"...","status":"failed","score":67.2,"ts":"2026-05-12T06:14:22Z"}
data: {"event":"alert_created","alert_id":"...","severity":"critical","domain":"revenue","ts":"..."}
data: {"event":"anomaly_detected","detector_id":"...","asset_id":"...","confidence":0.93,"ts":"..."}
```

Enables real-time quality dashboards in Grafana using the JSON datasource plugin.

### 58.4 Incident Timeline

Every quality failure automatically creates a structured incident record linking:
- The failing run
- The alert created
- The RCA report
- Remediation attempts
- Comments and resolution notes

```sql
CREATE TABLE quality_incidents (
    incident_id     VARCHAR(36) PRIMARY KEY,
    title           VARCHAR(200),
    asset_id        VARCHAR(36) NOT NULL,
    severity        VARCHAR(20),
    status          VARCHAR(20) DEFAULT 'open',   -- open | investigating | mitigated | resolved
    trigger_run_id  VARCHAR(36),
    alert_id        VARCHAR(36),
    rca_report      JSONB,
    timeline        JSONB,                        -- ordered list of events
    resolved_by     VARCHAR(200),
    ttd_minutes     INTEGER,                      -- time-to-detect
    ttr_minutes     INTEGER,                      -- time-to-resolve
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMP
);
```

**Incident KPIs tracked:** MTTD (Mean Time to Detect), MTTR (Mean Time to Resolve), Incident Rate by domain.

---

## 59. Business Cost Impact and ROI Analytics

Quantify the financial cost of data quality failures to justify data engineering investment.

### 59.1 Cost Model

```sql
CREATE TABLE quality_cost_configs (
    config_id       VARCHAR(36) PRIMARY KEY,
    asset_id        VARCHAR(36) REFERENCES data_assets(asset_id),
    domain_id       VARCHAR(36) REFERENCES domains(domain_id),
    cost_per_failed_row FLOAT,                   -- $ cost of one bad row reaching production
    cost_per_incident   FLOAT,                   -- $ fixed cost of a quality incident
    revenue_impact_pct  FLOAT,                   -- % of domain revenue at risk per SLA breach
    currency            VARCHAR(3) DEFAULT 'USD',
    updated_by          VARCHAR(200),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 59.2 Cost Calculations

**Per-run cost estimate:**
```
cost = failed_rows × cost_per_failed_row
     + (1 if status='failed' else 0) × cost_per_incident
```

**Cumulative domain cost (30 days):**
```
Σ cost across all failing runs for all tables in domain
```

**ROI of adding a rule:**
```
ROI = avoided_cost_per_month / rule_maintenance_cost_per_month
```

**API:**
```
GET /cost/summary                              — platform-wide cost impact
GET /cost/by-domain                            — cost breakdown per domain
GET /cost/by-table/{asset_id}                  — per-table cost analysis
GET /cost/roi/rule/{rule_id}                   — ROI calculation for a specific rule
PUT /cost/configs/{asset_id}                   — set cost parameters for a table
```

### 59.3 Executive Dashboard

A senior-leadership view (`/dashboard/executive`) showing:
- **Total estimated cost of bad data this month** — dollar figure with trend
- **Cost averted by data quality rules** — prevented failures × cost_per_incident
- **ROI of the DQ platform** — cost_averted / platform_operating_cost
- **Top 5 most expensive quality domains** — bar chart
- **Cost trend over 12 months** — line chart
- **Quality investment vs cost** — scatter plot correlating rule count with incident cost

---

## 60. Regulatory Compliance Automation

Automatically map data assets and rules to regulatory frameworks and generate compliance evidence.

### 60.1 Supported Frameworks

| Framework | Scope | Key requirements mapped |
|---|---|---|
| GDPR (EU) | PII data in EU persons | Right to erasure, data minimization, accuracy, consent |
| CCPA (California) | PII for CA residents | Right to know, delete, opt-out |
| HIPAA (US) | Health information | PHI accuracy, audit trail, minimum necessary |
| SOX (US) | Financial reporting | GL accuracy, completeness, authorization |
| BCBS 239 (Banking) | Risk data | Accuracy, integrity, aggregation, timeliness |
| ISO 27001 | Information security | Data classification, access control |

### 60.2 Compliance Mapping Data Model

```sql
CREATE TABLE compliance_frameworks (
    framework_id    VARCHAR(36) PRIMARY KEY,
    framework_name  VARCHAR(100) NOT NULL UNIQUE,
    version         VARCHAR(20),
    description     TEXT,
    is_active       BOOLEAN DEFAULT TRUE
);

CREATE TABLE compliance_requirements (
    req_id          VARCHAR(36) PRIMARY KEY,
    framework_id    VARCHAR(36) NOT NULL REFERENCES compliance_frameworks(framework_id),
    req_code        VARCHAR(50),               -- e.g. "GDPR Art.5(1)(d)"
    req_name        VARCHAR(200),
    req_description TEXT,
    dq_rule_types   TEXT                       -- comma-separated rule types that satisfy this requirement
);

CREATE TABLE compliance_mappings (
    mapping_id      VARCHAR(36) PRIMARY KEY,
    asset_id        VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    framework_id    VARCHAR(36) NOT NULL REFERENCES compliance_frameworks(framework_id),
    req_id          VARCHAR(36) REFERENCES compliance_requirements(req_id),
    rule_id         VARCHAR(36) REFERENCES dq_rules(rule_id),  -- the rule providing evidence
    status          VARCHAR(20) DEFAULT 'mapped',  -- mapped | gap | remediated
    evidence_note   TEXT,
    mapped_by       VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 60.3 Compliance Evidence Reports

```
GET  /compliance/frameworks                       — list frameworks
POST /compliance/frameworks/{id}/assess/{asset_id} — run a compliance assessment
GET  /compliance/report/{framework_id}            — full compliance report
GET  /compliance/gaps                             — all assets with compliance gaps
GET  /compliance/evidence/{mapping_id}            — audit-ready evidence package
```

**Evidence package** (PDF-exportable) contains:
- Asset name, classification, owner
- Framework requirement text
- Mapped DQ rule definition
- Last 30 run results proving compliance
- Signature block for approver

### 60.4 GDPR Right-to-Erasure Impact Analysis

`POST /compliance/gdpr/erasure-impact?entity_id=customer_123` returns:
- All tables containing data for this entity
- Downstream tables via lineage
- Affected DQ rules that would need re-running after erasure
- Estimated time to propagate erasure through lineage graph

---

## 61. Data Mesh and Federated Governance

Support organizations operating a data mesh architecture — decentralized domain ownership with centralized governance.

### 61.1 Data Mesh Model

Each business domain functions as an autonomous **data domain team** that owns, produces, and governs their data products. The central platform enforces **federated computational governance** — global standards applied automatically, local innovation permitted.

**Global standards enforced centrally:**
- All tables must have an owner
- All PII columns must be classified
- All production tables must have a freshness SLA rule
- All data products must have a published data contract

**Local autonomy permitted:**
- Domain-specific rule types and thresholds
- Domain-controlled SLA values
- Domain-managed access policies

### 61.2 Domain Self-Service Portal

Each domain gets a self-service governance workspace at `/domains/{domain_id}/workspace`:

- **My Domain's Assets** — full catalog filtered to this domain
- **My Pending Rules** — rules awaiting approval in this domain
- **My Governance Score** — domain scorecard with improvement suggestions
- **Policy Violations** — policy breaches open in this domain
- **My SLA Configs** — manage domain-level thresholds
- **Data Product Builder** — create/publish data products for this domain

### 61.3 Cross-Domain Data Sharing Agreements

When a table in Domain A is consumed by Domain B:

```sql
CREATE TABLE data_sharing_agreements (
    agreement_id    VARCHAR(36) PRIMARY KEY,
    producer_domain_id VARCHAR(36) NOT NULL REFERENCES domains(domain_id),
    consumer_domain_id VARCHAR(36) NOT NULL REFERENCES domains(domain_id),
    asset_id        VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    quality_sla     FLOAT NOT NULL,             -- minimum quality guarantee from producer
    freshness_sla   INTEGER NOT NULL,           -- maximum staleness in hours
    breach_action   VARCHAR(30),               -- 'notify_consumer' | 'block_pipeline' | 'alert_all'
    effective_from  DATE,
    status          VARCHAR(20) DEFAULT 'active',
    signed_by_producer VARCHAR(200),
    signed_by_consumer VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**API:**
```
POST /mesh/sharing-agreements                  — create a cross-domain sharing agreement
GET  /mesh/sharing-agreements?domain_id=...   — list agreements for a domain
GET  /mesh/sharing-agreements/{id}/compliance — is the producer meeting the SLA right now?
POST /mesh/sharing-agreements/{id}/breach     — record an SLA breach and trigger action
```

### 61.4 Data Mesh Topology View

Visual graph (`/mesh/topology`) showing all domains as nodes and cross-domain data flows as directed edges. Edge color indicates SLA compliance:
- Green = producer meets quality SLA
- Yellow = warning band
- Red = SLA breached

---

## 62. Privacy Engineering and Differential Privacy

Enterprise-grade privacy controls embedded into the data quality platform.

### 62.1 Dynamic Data Masking

Column-level masking policies that apply based on the caller's role:

```sql
CREATE TABLE masking_policies (
    policy_id       VARCHAR(36) PRIMARY KEY,
    asset_id        VARCHAR(36) NOT NULL REFERENCES data_assets(asset_id),
    column_name     VARCHAR(200) NOT NULL,
    masking_type    VARCHAR(30) NOT NULL,       -- full_mask | partial_mask | hash | tokenize | nullify
    applies_to_roles TEXT,                      -- comma-separated roles that see masked data
    unmasked_roles  TEXT,                       -- roles that see real data
    created_by      VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (asset_id, column_name)
);
```

**Masking types:**
- `full_mask` — `email@domain.com` → `****@*****.***`
- `partial_mask` — `4111-1111-1111-1234` → `****-****-****-1234`
- `hash` — SHA-256 hash (consistent for join keys, non-reversible)
- `tokenize` — format-preserving tokenization (preserves string length and type)
- `nullify` — returns NULL for masked callers

When a DQ rule references a masked column, the rule execution uses the unmasked value but sample failed records are masked before storage.

### 62.2 Privacy Budget Tracking

Track how many privacy-sensitive queries have been run against PII data (for differential privacy compliance):

```sql
CREATE TABLE privacy_budget_usage (
    usage_id        VARCHAR(36) PRIMARY KEY,
    asset_id        VARCHAR(36) NOT NULL,
    column_name     VARCHAR(200),
    query_type      VARCHAR(50),
    epsilon_consumed FLOAT,                    -- differential privacy epsilon budget used
    user_email      VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**API:**
```
GET /privacy/budget/{asset_id}               — remaining privacy budget
GET /privacy/budget/history                  — all budget consumption events
POST /privacy/masking-policies               — create a masking policy
```

### 62.3 PII Data Discovery

`POST /ai/discover-pii/{asset_id}` runs an AI scan of column names, data types, and sample values to identify likely PII columns not yet classified:

```json
{
  "asset_id": "...",
  "findings": [
    {"column_name": "customer_name", "pii_type": "full_name", "confidence": 0.97, "suggested_classification": "PII"},
    {"column_name": "dob", "pii_type": "date_of_birth", "confidence": 0.93, "suggested_classification": "PII"},
    {"column_name": "zip_code", "pii_type": "quasi_identifier", "confidence": 0.81, "suggested_classification": "SENSITIVE"}
  ]
}
```

One-click application of suggested classifications from the scan results.

---

## 63. Zero-Trust Dynamic Access Control

Context-aware, attribute-based access control (ABAC) that evaluates access decisions at query time — not just at login.

### 63.1 Attribute-Based Access Policies

Beyond role-based access, define policies that combine multiple attributes:

```
IF user.role = "analyst"
   AND asset.classification = "PII"
   AND request.time NOT IN business_hours
   AND user.mfa_verified = false
THEN DENY with message "PII access outside business hours requires MFA"
```

```sql
CREATE TABLE abac_policies (
    policy_id       VARCHAR(36) PRIMARY KEY,
    policy_name     VARCHAR(200) NOT NULL,
    description     TEXT,
    condition_json  JSONB NOT NULL,             -- structured policy condition
    effect          VARCHAR(10) NOT NULL,       -- ALLOW | DENY
    resources       TEXT,                       -- comma-separated resource patterns (asset:*, rule:read)
    priority        INTEGER DEFAULT 100,        -- lower = evaluated first
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      VARCHAR(200),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 63.2 Just-in-Time (JIT) Access

Users can request temporary elevated access to a sensitive asset for a defined window:

```
POST /access/jit-request
{
  "asset_id": "...",
  "reason": "Quarterly audit of revenue tables",
  "requested_duration_hours": 4,
  "access_level": "read"
}
```

Auto-approved for auditors during business hours; requires manager approval for analysts; never auto-approved for PII tables after hours.

### 63.3 Access Audit Heat Map

Visual report showing who accessed which sensitive tables when — surfacing unusual patterns:
- Unusual access time (outside working hours for user's timezone)
- Unusual access volume (10x more table views than normal)
- Cross-domain access (domain_owner accessing another domain)

---

## 64. Data Quality CI/CD — Quality Gates in Pipelines

Integrate data quality enforcement directly into software delivery pipelines.

### 64.1 GitHub Actions / GitLab CI Integration

A `dq-check` CLI action that runs quality gates in CI/CD before merging code that touches data pipelines:

```yaml
# .github/workflows/data-quality.yml
- name: Data Quality Gate
  uses: dq-platform/action@v2
  with:
    api_url: ${{ secrets.DQ_PLATFORM_URL }}
    api_key: ${{ secrets.DQ_SERVICE_ACCOUNT_KEY }}
    asset_id: ${{ env.ASSET_ID }}
    min_quality_score: 95
    fail_on_critical: true
    report_format: github-checks   # posts results as GitHub check annotations
```

**API endpoints supporting CI/CD:**
```
POST /cicd/gate/evaluate
{
  "asset_id": "...",
  "min_quality_score": 95,
  "fail_on_critical": true,
  "run_rules": true             — execute rules fresh before evaluating
}

GET  /cicd/gate/status/{job_id}  — poll gate evaluation status
```

**Gate response:**
```json
{
  "gate_passed": false,
  "quality_score": 87.3,
  "blocking_failures": [
    {"rule_name": "invoice_id_not_null", "severity": "critical", "failed_rows": 234}
  ],
  "recommendations": ["Fix null invoice_ids before merging this pipeline change"],
  "report_url": "https://dq-platform/cicd/reports/abc123"
}
```

### 64.2 dbt Test Result Sync

Pull dbt test results into the DQ platform as rule run records:

```
POST /integrations/dbt/test-results
```

Each dbt test maps to a DQ rule type:
- `dbt.not_null` → `null_check`
- `dbt.unique` → `uniqueness_check`
- `dbt.accepted_values` → `accepted_values_check`
- `dbt.relationships` → `referential_integrity_check`
- `dbt.generic_test` → `custom_sql_check`

Results appear in Execution Logs alongside native DQ rule runs, unified in the quality score.

### 64.3 Pre-Merge Quality Preview

Before a pull request that modifies a dbt model or SQL pipeline is merged, the DQ platform:
1. Runs the modified pipeline against a staging Snowflake schema
2. Runs all rules against the staging output
3. Posts a quality score comparison (baseline vs PR) as a PR comment
4. Blocks merge if quality regresses more than 5% (configurable)

---

## 65. Community Rule Marketplace

A public/private marketplace for sharing, discovering, and importing reusable DQ rule templates.

### 65.1 Rule Templates

```sql
CREATE TABLE rule_templates (
    template_id     VARCHAR(36) PRIMARY KEY,
    template_name   VARCHAR(200) NOT NULL,
    description     TEXT,
    rule_type       VARCHAR(50) NOT NULL,
    default_config  JSONB,
    target_domains  TEXT,                       -- comma-separated domain names this template suits
    target_industries TEXT,                     -- Finance | Healthcare | E-commerce | HR
    tags            TEXT,
    author_email    VARCHAR(200),
    is_public       BOOLEAN DEFAULT FALSE,      -- public = visible to all orgs, false = org-private
    downloads       INTEGER DEFAULT 0,
    rating          FLOAT DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 65.2 Marketplace APIs

```
GET  /marketplace/templates?industry=Finance&domain=GL
POST /marketplace/templates                    — publish a template
POST /marketplace/templates/{id}/import        — import to your org (creates a draft rule)
POST /marketplace/templates/{id}/rate          — rate a template 1-5
GET  /marketplace/templates/popular            — top downloaded templates
GET  /marketplace/templates/featured           — curated by the platform team
```

### 65.3 Built-in Template Packs

The platform ships with curated rule template packs by industry:

| Pack | Template count | Domain focus |
|---|---|---|
| Revenue Operations | 18 | Billing, invoices, subscriptions, revenue recognition |
| Financial Controls | 22 | GL, journal entries, accounts payable/receivable, SOX |
| Healthcare HIPAA | 15 | PHI accuracy, patient records, claims data |
| E-commerce | 16 | Orders, inventory, pricing, fulfillment |
| HR & Payroll | 12 | Employee records, payroll, benefits, headcount |
| Marketing Analytics | 10 | Campaign performance, lead data, attribution |

### 65.4 AI-Powered Template Matching

`GET /marketplace/templates/recommended?asset_id={id}` analyzes column names and domain context to recommend the most relevant templates:

```json
{
  "asset_id": "...",
  "sf_table_name": "invoices",
  "recommendations": [
    {"template_id": "...", "template_name": "Invoice ID Not Null", "match_score": 0.97, "reason": "Column 'invoice_id' detected"},
    {"template_id": "...", "template_name": "Invoice Amount Positive", "match_score": 0.93, "reason": "Column 'invoice_amount' of type NUMBER detected"},
    {"template_id": "...", "template_name": "Invoice Status Enum", "match_score": 0.88, "reason": "Column 'status' with low cardinality — likely an enum"}
  ]
}
```

---

## 66. Semantic and Contextual Data Quality

Move beyond syntactic rule checks (is this value NULL?) to semantic understanding (does this value make business sense?).

### 66.1 Semantic Rule Types

New rule types that understand context and meaning:

**`semantic_consistency_check`**
Cross-column logical consistency check using natural language definition:
```json
{
  "rule_type": "semantic_consistency_check",
  "condition": "end_date must be after start_date",
  "columns": ["start_date", "end_date"]
}
```
AI converts this to: `WHERE end_date < start_date OR (start_date IS NOT NULL AND end_date IS NULL)`

**`business_metric_check`**
Validates that a derived business metric stays within expected bounds:
```json
{
  "rule_type": "business_metric_check",
  "metric_name": "gross_margin_pct",
  "sql": "SELECT AVG((revenue - cogs) / NULLIF(revenue, 0) * 100) AS value FROM ...",
  "min_value": 20.0,
  "max_value": 80.0
}
```

**`referential_sanity_check`**
Validates business logic that spans multiple tables:
```json
{
  "rule_type": "referential_sanity_check",
  "description": "Every shipped order must have a valid tracking number",
  "sql": "SELECT COUNT(*) AS failed_count FROM orders WHERE status = 'SHIPPED' AND (tracking_number IS NULL OR tracking_number = '')"
}
```

**`distribution_consistency_check`**
Validates that the statistical distribution of a column has not shifted significantly between runs (Kolmogorov-Smirnov test or Population Stability Index):
```json
{
  "rule_type": "distribution_consistency_check",
  "column_name": "invoice_amount",
  "method": "psi",             — Population Stability Index
  "psi_threshold": 0.2,        — fail if PSI > 0.2 (significant shift)
  "baseline_run_id": "..."     — comparison baseline
}
```

### 66.2 LLM-Powered Semantic Validation

For complex business rules that cannot be expressed as SQL:

```json
{
  "rule_type": "llm_semantic_check",
  "sample_size": 100,           — number of rows to evaluate
  "validation_prompt": "For each row, check: Is the invoice_status value consistent with the payment_date being set? An invoice with status PAID should always have a payment_date. An invoice with status PENDING should never have a payment_date.",
  "severity": "high"
}
```

The platform samples N rows, sends them to the LLM with the validation prompt, and aggregates pass/fail results. Cost-efficient for complex semantic rules that SQL cannot express.

---

## 67. DataOps Incident Management

Treat data quality failures as infrastructure incidents — with on-call routing, SLA timers, and post-mortems.

### 67.1 On-Call Routing

```sql
CREATE TABLE oncall_schedules (
    schedule_id     VARCHAR(36) PRIMARY KEY,
    domain_id       VARCHAR(36) REFERENCES domains(domain_id),
    oncall_email    VARCHAR(200) NOT NULL,
    oncall_slack    VARCHAR(200),
    pagerduty_key   VARCHAR(200),
    effective_from  TIMESTAMP NOT NULL,
    effective_until TIMESTAMP NOT NULL,
    timezone        VARCHAR(50) DEFAULT 'UTC'
);
```

When a critical-severity rule fails:
1. Create a quality incident record
2. Look up the on-call engineer for this domain at this time
3. Page them via PagerDuty, Slack DM, or email based on the schedule
4. Start the MTTD timer

### 67.2 Incident Runbooks

Each data asset can have an attached runbook — a step-by-step guide for the on-call engineer when a specific rule fails:

```sql
CREATE TABLE incident_runbooks (
    runbook_id      VARCHAR(36) PRIMARY KEY,
    rule_id         VARCHAR(36) REFERENCES dq_rules(rule_id),
    title           VARCHAR(200),
    steps           TEXT NOT NULL,              -- Markdown numbered list
    escalation_path TEXT,
    related_dashboards TEXT,
    created_by      VARCHAR(200),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

When an incident is created for a failing rule, the runbook is attached to the incident record and surfaced in the alert notification.

### 67.3 Post-Mortem Templates

After an incident is resolved, the platform auto-generates a post-mortem draft:

```
POST /incidents/{id}/generate-postmortem
```

**Output includes:**
- Timeline of events (when rule failed, when alert fired, when acknowledged, when resolved)
- RCA summary from the AI RCA engine
- MTTD and MTTR
- Contributing factors (upstream degradation, pipeline delay, schema change)
- Recommended follow-up actions
- Action item assignments

Post-mortems are stored as incident comments of type `postmortem` and exported to Confluence/Notion via webhook.

---

## 68. Updated Vision: The Next-Generation Data Intelligence Platform

The platform's ultimate vision extends beyond any single capability:

### Platform Positioning

| Capability Layer | Description |
|---|---|
| **Data Quality Engine** | Rule-based + ML anomaly detection across batch, streaming, and multi-engine |
| **Observability** | OTEL metrics, real-time SSE event stream, freshness SLA board, incident timeline |
| **AI Copilot** | Autonomous rule generation, self-healing, NL-to-rule, predictive quality, conversational governance |
| **Data Catalog** | Full-text search, column profiling, business glossary, classification, usage analytics |
| **Governance Hub** | Policy engine, data contracts, compliance automation, scorecard, data mesh support |
| **Collaboration** | Comments, questions, announcements, access requests, trust ratings |
| **Privacy Engineering** | PII discovery, dynamic masking, privacy budget, GDPR erasure impact |
| **Cost & ROI** | Cost per bad row, incident ROI, executive dashboard |
| **CI/CD Integration** | Quality gates, dbt sync, pre-merge preview, GitHub Actions |
| **Marketplace** | Community rule templates, industry packs, AI-powered matching |

### Competitive Differentiation

| Platform | What they do well | What we do better |
|---|---|---|
| Monte Carlo | ML anomaly detection | + Rule-based DQ + AI Copilot + Governance + Marketplace |
| Atlan | Data catalog + governance | + DQ execution + Streaming + RCA + Predictive AI + CI/CD |
| Great Expectations | Rule-based DQ checks | + Catalog + AI + Governance + Cost impact + Compliance |
| dbt tests | In-pipeline SQL tests | + Full observability + Governance + Lineage + Streaming |
| Collibra | Enterprise governance | + Execution + AI + Anomaly detection + Real-time |
| Informatica | Legacy MDM + DQ | + Modern UI + AI-native + Cloud-native + Open architecture |

The platform is the **only product** in the market that unifies: rule-based DQ execution, ML anomaly detection, real-time streaming quality, AI-native governance, full data catalog, compliance automation, cost impact analysis, and CI/CD quality gates in a single open-source-deployable platform.

---

## 52. Acceptance Criteria (Extended)

The platform is production-ready when all original criteria (§44) are met PLUS:

