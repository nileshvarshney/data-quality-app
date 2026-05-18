'use client'
import { useState } from 'react'
import {
  BookOpen, BarChart2, Shield, Play, Bell, ClipboardList,
  BrainCircuit, Database, Calendar, ChevronRight, ChevronDown,
  Keyboard, HelpCircle, AlertCircle, CheckCircle, XCircle,
  AlertTriangle, Clock, TrendingUp, Zap, Search,
  Layers, Lock, Globe, GitBranch, ShoppingBag, Activity,
  DollarSign, KeyRound, Users, FileText, Package, Eye,
  Cpu, MapPin, Tag, Sparkles, Radio,
} from 'lucide-react'
import clsx from 'clsx'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavSection {
  id: string
  label: string
  icon: React.ReactNode
}

interface FAQ { q: string; a: string }

// ── Sidebar nav data ──────────────────────────────────────────────────────────

const NAV: NavSection[] = [
  { id: 'getting-started', label: 'Getting Started',          icon: <BookOpen size={14}/> },
  { id: 'scores',          label: 'Quality Scores',           icon: <BarChart2 size={14}/> },
  { id: 'metrics',         label: 'Dashboard Metrics',        icon: <TrendingUp size={14}/> },
  { id: 'rules',           label: 'Rule Types',               icon: <Shield size={14}/> },
  { id: 'catalog',         label: 'Data Catalog & Glossary',  icon: <Layers size={14}/> },
  { id: 'governance',      label: 'Governance & Compliance',  icon: <ClipboardList size={14}/> },
  { id: 'ai',              label: 'AI Features',              icon: <BrainCircuit size={14}/> },
  { id: 'privacy',         label: 'Privacy & Masking',        icon: <Lock size={14}/> },
  { id: 'incidents',       label: 'Incident Management',      icon: <AlertCircle size={14}/> },
  { id: 'lineage',         label: 'Lineage & Impact',         icon: <GitBranch size={14}/> },
  { id: 'marketplace',     label: 'Rule Marketplace',         icon: <ShoppingBag size={14}/> },
  { id: 'lifecycle',       label: 'Rule Lifecycle',           icon: <Play size={14}/> },
  { id: 'runs',            label: 'Run Statuses',             icon: <CheckCircle size={14}/> },
  { id: 'alerts',          label: 'Alerts',                   icon: <Bell size={14}/> },
  { id: 'roles',           label: 'Roles & Access',           icon: <Users size={14}/> },
  { id: 'schedules',       label: 'Schedules',                icon: <Calendar size={14}/> },
  { id: 'api',             label: 'API & Integration',        icon: <KeyRound size={14}/> },
  { id: 'faq',             label: 'FAQ',                      icon: <HelpCircle size={14}/> },
]

// ── Rule type data ────────────────────────────────────────────────────────────

const RULE_TYPES = [
  { type: 'null_check',                    label: 'Null Check',                   semantic: false, desc: 'Ensures a column has no NULL values. Use for required fields like IDs and dates.', config: 'None required.' },
  { type: 'uniqueness_check',              label: 'Uniqueness Check',              semantic: false, desc: 'Ensures all values in a column are distinct. Use for primary keys and natural keys.', config: 'None required.' },
  { type: 'duplicate_check',              label: 'Duplicate Check',              semantic: false, desc: 'Alias for uniqueness_check — identical behavior.', config: 'None required.' },
  { type: 'accepted_values_check',        label: 'Accepted Values',              semantic: false, desc: 'Ensures values belong to an approved list. Use for status codes, type enums, country codes.', config: 'accepted_values: ["PAID", "PENDING", "FAILED"]' },
  { type: 'range_check',                  label: 'Range Check',                  semantic: false, desc: 'Ensures numeric values fall within a min/max range. Use for amounts, quantities, percentages.', config: 'min_value: 0  and/or  max_value: 1000000' },
  { type: 'freshness_check',              label: 'Freshness Check',              semantic: false, desc: 'Ensures a table has been updated within an SLA window. Use for pipelines with daily or hourly SLAs.', config: 'max_hours: 24  (default)' },
  { type: 'volume_check',                 label: 'Volume Check',                 semantic: false, desc: 'Monitors row counts. If min_rows/max_rows are set, checks against thresholds. If not set, compares against the 7-run historical average ± 30% — fails on sudden spikes or drops.', config: 'min_rows: 100, max_rows: 10000, date_column: "created_at"' },
  { type: 'schema_drift_check',           label: 'Schema Drift',                 semantic: false, desc: 'Detects if expected columns have been removed or renamed. Use to catch breaking upstream changes.', config: 'expected_columns: ["id", "amount", "status"]' },
  { type: 'referential_integrity_check',  label: 'Referential Integrity',        semantic: false, desc: 'Checks that every FK value exists in the parent table. Use for order → customer, invoice → contract links.', config: 'reference_table: "schema.customers", reference_column: "customer_id"' },
  { type: 'regex_check',                  label: 'Regex Check',                  semantic: false, desc: 'Validates that values match a pattern. Use for emails, phone numbers, postal codes, IDs.', config: 'pattern: "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\\\.[A-Za-z]{2,}$"' },
  { type: 'business_rule_check',          label: 'Business Rule',                semantic: false, desc: "Validates a custom SQL WHERE condition. Use when built-in types don't cover your logic.", config: 'condition: "ship_date >= order_date"' },
  { type: 'custom_sql_check',             label: 'Custom SQL',                   semantic: false, desc: 'Fully custom SQL that must return a column named failed_count. Use for any complex multi-table check.', config: 'SQL must return: SELECT COUNT(*) AS failed_count …' },
  { type: 'semantic_consistency_check',   label: 'Semantic Consistency',         semantic: true,  desc: 'Validates cross-column logic expressed in plain English. The AI translates your condition to SQL and evaluates it. Use when the relationship is too nuanced for raw SQL.', config: 'condition: "discount_pct must never exceed 100 minus margin_pct"' },
  { type: 'business_metric_check',        label: 'Business Metric',              semantic: true,  desc: 'Validates that a derived KPI stays within an expected range. Provide a SQL fragment that computes the metric, then set bounds. Use for revenue per user, churn rate, average order value.', config: 'metric_sql: "SUM(revenue)/COUNT(DISTINCT user_id)", min_value: 50, max_value: 500' },
  { type: 'distribution_consistency_check', label: 'Distribution Consistency',  semantic: true,  desc: 'Detects statistical distribution shifts using Population Stability Index (PSI). Fails if PSI exceeds a threshold, indicating the column distribution has drifted from a baseline. Use for model input features and KPI numerators.', config: 'baseline_mean: 142.5, tolerance_pct: 20' },
  { type: 'llm_semantic_check',           label: 'LLM Semantic Check',           semantic: true,  desc: 'Sends a sample of rows to the configured LLM and asks it to evaluate them against a natural-language validation prompt. Returns failed_count based on LLM judgment. Use for unstructured or hard-to-codify quality conditions.', config: 'validation_prompt: "Is this a valid US mailing address?", sample_size: 50' },
]

// ── FAQ data ──────────────────────────────────────────────────────────────────

const FAQS: FAQ[] = [
  { q: 'Why is the quality score lower than expected?', a: 'The aggregate score uses severity-weighted penalties, not a simple pass rate. A single critical failure deducts 25 points. Check which rules failed and their severity — a few high-severity failures can significantly lower the score even if most rules pass.' },
  { q: 'My rule passed but the table dashboard still shows a low score.', a: 'The dashboard quality score is computed from all rules assigned to the table, not just the one you ran. Check the table dashboard for the full rule list and look for other failing rules.' },
  { q: 'A rule shows "error" status — what does that mean?', a: 'An error means the SQL failed to execute. Common causes: the Snowflake connection is not configured, the table or column does not exist, or the warehouse is suspended. Click the run row to see the error message, then check Settings → Snowflake.' },
  { q: 'When does a volume_check use historical baseline vs thresholds?', a: 'If you set min_rows or max_rows in the rule config, those thresholds are used. If neither is set, the rule compares the current row count against the average of the last 7 passing runs. It fails if the count deviates more than 30% from that average. The baseline is only computed if there are at least 3 historical passing runs.' },
  { q: 'My rule was pending_review for a while — who can approve it?', a: 'Users with the admin role can approve any rule. Users with domain_owner can approve rules in their assigned domain. Go to Rules, filter by Status = Pending Review, and click Review on the rule.' },
  { q: 'How do I prevent alerts from spamming me for a frequently-failing rule?', a: 'Alerts are automatically deduplicated — a second alert for the same rule will not be created within a 4-hour window. If the rule is expected to fail (known noise), use the Ignore action on the alert.' },
  { q: 'Can I run rules without a Snowflake connection?', a: 'No. Rule execution requires a live Snowflake connection. All other platform features (creating rules, managing assets, viewing dashboards, AI assistant) work without Snowflake. Rule executions without a connection return an error stored in the run record.' },
  { q: 'What is the difference between domain_owner and data_owner roles?', a: 'domain_owner can manage all rules and schedules within their assigned domain and can approve/reject rules. data_owner can manage rules for specific tables they own. Neither can access the Admin section or manage other users.' },
  { q: 'How do I use the API from a CI/CD pipeline?', a: 'Create a service account in Admin → Settings → Service Accounts (or via POST /service-accounts). Copy the api_key shown once at creation. In your pipeline, add the header X-API-Key: <your-key> to every request instead of a Bearer token.' },
  { q: 'Where are quality scores stored and how often are they updated?', a: 'Scores are pre-aggregated into the dq_quality_scores table at table, subdomain, domain, and global levels. They are updated after every execution batch and by a nightly job at 00:05. On days with no executions, the nightly job keeps the previous score.' },
  { q: 'How does domain isolation work for the domain_owner role?', a: 'When a user has domain_owner for a specific domain (e.g. Revenue), all API calls automatically apply a domain filter. They cannot list, read, or modify rules, assets, alerts, or runs from any other domain. The restriction is enforced server-side — not just in the UI.' },
  { q: 'What is the difference between AI Copilot and AI Assistant?', a: 'AI Copilot is the floating button in the bottom-right corner of every page. It provides a quick rule wizard and short contextual questions. AI Assistant (/ai-assistant) is a full-page deep-conversation experience with conversation history, context awareness, and the ability to reference your actual rules, runs, and schemas.' },
  { q: 'How do I set up Google SSO?', a: 'Go to Admin → Settings → Authentication. Enable "Google OAuth2" and paste your Google Cloud OAuth 2.0 Client ID and Client Secret. Set the redirect URI to https://<your-domain>/auth/callback/google in your Google Cloud Console. Users can then log in via "Continue with Google" on the login page.' },
  { q: 'When does a contract get automatically violated?', a: 'A data contract is checked after every execution batch. It is marked violated when: (1) a rule linked to the contract fails with severity critical or high, (2) the quality score of a linked asset drops below the contract\'s minimum_score threshold, or (3) a freshness SLA window is breached. Violations create an incident automatically if auto_incident is enabled on the contract.' },
  { q: 'How do I use the rule marketplace?', a: 'Go to Marketplace in the sidebar. Browse by domain or search by keyword. Click "Preview" on any template to see the generated SQL. Click "Import as Draft" to create a new rule pre-filled with the template config — it starts in draft status so you can adjust it before submitting for review.' },
  { q: 'What triggers a governance policy violation?', a: 'Each built-in policy type has its own trigger: pii_exposure fires when a column classified PII has no masking policy applied; data_retention fires when a table\'s oldest record exceeds the configured max_age_days; schema_approval fires when a schema change is detected without an associated approved rule update; access_review fires when a user has not been reviewed in the configured period.' },
  { q: 'How is MTTD calculated for incidents?', a: 'MTTD (Mean Time to Detect) = timestamp of the first failed rule run that triggered the incident, minus the estimated time the bad data was written. When a freshness check is in scope, the last successful run is used as the data-good boundary. MTTR = incident resolved_at minus incident created_at.' },
  { q: 'Can I add custom classification labels beyond PII/SENSITIVE?', a: 'Currently the five built-in sensitivity labels are PII, SENSITIVE, CONFIDENTIAL, RESTRICTED, and PUBLIC. Custom labels are on the roadmap. For now, use the column description field and a business_glossary term link to annotate columns with your own taxonomy, and filter by glossary term in the Catalog.' },
  { q: 'What semantic rule types are available?', a: 'Four semantic rule types are available: semantic_consistency_check (cross-column plain-English condition), business_metric_check (KPI bounds validation), distribution_consistency_check (PSI-based distribution drift), and llm_semantic_check (LLM evaluates rows against a natural-language prompt). All four require a configured LLM provider in Settings → AI.' },
  { q: 'How do I export compliance evidence for GDPR?', a: 'Go to Governance → Compliance. Select the GDPR framework and click "Export Evidence Package". This generates a ZIP file containing: the governance scorecard PDF, all active masking policies for PII columns, a list of data contracts covering GDPR-tagged assets, the audit log extract for the requested period, and the PII exposure report.' },
]

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionTitle({ id, icon, children }: { id: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-xl font-bold text-gray-900 mb-5 pt-2 scroll-mt-6">
      <span className="text-blue-500">{icon}</span>
      {children}
    </h2>
  )
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-700 mb-2 mt-6">{children}</h3>
}

function MetricRow({ label, value, desc }: { label: string; value?: string; desc: string }) {
  return (
    <div className="flex gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="w-48 shrink-0">
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        {value && <span className="ml-2 text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{value}</span>}
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
    </div>
  )
}

function RuleCard({ rt }: { rt: typeof RULE_TYPES[0] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <code className={clsx('text-xs font-mono px-2 py-0.5 rounded', rt.semantic ? 'text-purple-700 bg-purple-50' : 'text-indigo-700 bg-indigo-50')}>
            {rt.type}
          </code>
          <span className="text-sm font-semibold text-gray-800">{rt.label}</span>
          {rt.semantic && (
            <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">AI</span>
          )}
        </div>
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100 space-y-2">
          <p className="text-sm text-gray-700 leading-relaxed">{rt.desc}</p>
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5 shrink-0">Config</span>
            <code className="text-xs font-mono text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 leading-relaxed">{rt.config}</code>
          </div>
        </div>
      )}
    </div>
  )
}

function FaqItem({ faq }: { faq: FAQ }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 transition-colors gap-3"
      >
        <span className="text-sm font-medium text-gray-800">{faq.q}</span>
        {open ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100">
          <p className="text-sm text-gray-700 leading-relaxed">{faq.a}</p>
        </div>
      )}
    </div>
  )
}

function InfoBox({ children, color = 'blue' }: { children: React.ReactNode; color?: 'blue' | 'purple' | 'yellow' | 'green' | 'gray' }) {
  const cls = {
    blue:   'bg-blue-50 border-blue-100 text-blue-800',
    purple: 'bg-purple-50 border-purple-100 text-purple-800',
    yellow: 'bg-yellow-50 border-yellow-100 text-yellow-800',
    green:  'bg-green-50 border-green-100 text-green-800',
    gray:   'bg-gray-50 border-gray-200 text-gray-700',
  }[color]
  return <div className={clsx('border rounded-xl p-4 text-sm leading-relaxed', cls)}>{children}</div>
}

function TableGrid({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {row.map((cell, j) => (
                <td key={j} className={clsx('px-4 py-3 text-xs text-gray-700', j === 0 && 'font-semibold text-gray-900')}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [search, setSearch] = useState('')

  const filteredFaqs = FAQS.filter(f =>
    !search || f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-[1280px]">

      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen size={24} className="text-blue-500" />
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Help & Reference</h1>
        </div>
        <p className="text-sm text-gray-500">
          Complete user manual for DataGuardian — the AI-powered Snowflake Data Intelligence Platform.
          Use the sidebar to jump to any section.
        </p>
      </div>

      <div className="flex gap-8">

        {/* ── Sidebar nav ── */}
        <aside className="w-56 shrink-0 hidden lg:block">
          <div className="sticky top-6 space-y-0.5 max-h-[calc(100vh-80px)] overflow-y-auto pr-1">
            {NAV.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                <span className="text-gray-400 shrink-0">{s.icon}</span>
                <span className="leading-tight">{s.label}</span>
              </a>
            ))}
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="flex-1 space-y-14 min-w-0">

          {/* ══════════════════════════════════════════════════
              SECTION 1: Getting Started
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="getting-started" icon={<BookOpen size={18}/>}>Getting Started</SectionTitle>

            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              DataGuardian is an enterprise command center for Snowflake data reliability. It lets
              data engineering teams define, schedule, execute, and monitor hundreds of data quality rules across multiple
              business domains, with AI assistance to accelerate rule creation and failure diagnosis. Every quality
              result, alert, and governance event is stored historically so you can track trends, meet SLAs, and satisfy
              compliance frameworks like GDPR, HIPAA, and SOX.
            </p>

            {/* Navigation overview */}
            <SubTitle>Navigation Overview — 9 Sidebar Sections</SubTitle>
            <TableGrid
              headers={['Section', 'What you find here']}
              rows={[
                ['Dashboard', 'Global, domain, subdomain, and table quality scores with charts and trend lines.'],
                ['Rules', 'Create, edit, approve, and manage all data quality rules. Includes AI rule wizard.'],
                ['Assets', 'Register Snowflake tables and map them to domains and subdomains.'],
                ['Schedules', 'Configure when rules run — at global, domain, subdomain, table, or rule level.'],
                ['Alerts', 'View, acknowledge, and resolve quality alerts across all domains.'],
                ['Governance', 'Scorecards, policy engine, data contracts, compliance frameworks, and audit logs.'],
                ['Catalog', 'Business glossary, sensitivity classifications, column profiling, and data products.'],
                ['Incidents', 'Incident management, on-call schedules, runbooks, and MTTD / MTTR tracking.'],
                ['AI Assistant', 'Full-page AI chat for deep queries about your rules, runs, schemas, and quality trends.'],
              ]}
            />

            {/* Keyboard shortcuts */}
            <SubTitle>Keyboard Shortcuts</SubTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { keys: ['⌘', 'K'],    action: 'Open command palette — navigate anywhere, fast (17 items)' },
                { keys: ['Ctrl', 'K'], action: 'Open command palette (Windows / Linux)' },
                { keys: ['↑', '↓'],    action: 'Navigate command palette items' },
                { keys: ['↵'],          action: 'Open selected command palette item' },
                { keys: ['Esc'],        action: 'Close command palette, modals, and drawers' },
                { keys: ['⌘', '/'],    action: 'Focus global search bar' },
                { keys: ['G', 'D'],    action: 'Go to Global Dashboard (sequential chord)' },
                { keys: ['G', 'R'],    action: 'Go to Rules page (sequential chord)' },
              ].map(s => (
                <div key={s.action} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                  <div className="flex gap-1 shrink-0">
                    {s.keys.map(k => (
                      <kbd key={k} className="text-xs font-mono bg-gray-100 border border-gray-300 text-gray-600 px-2 py-0.5 rounded shadow-sm">{k}</kbd>
                    ))}
                  </div>
                  <p className="text-sm text-gray-600">{s.action}</p>
                </div>
              ))}
            </div>

            {/* Quick start */}
            <SubTitle>Quick Start Workflow</SubTitle>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-2">
              {[
                { step: '1', label: 'Register table', desc: 'Go to Assets → New Asset. Choose domain, subdomain, and point to your Snowflake table.', color: 'bg-blue-500' },
                { step: '2', label: 'Create rules', desc: 'Go to Rules → New Rule (or use AI Copilot). Pick rule type, target column, and severity.', color: 'bg-indigo-500' },
                { step: '3', label: 'Set a schedule', desc: 'Go to Schedules → New Schedule. Choose frequency and attach it to the asset or rule.', color: 'bg-purple-500' },
                { step: '4', label: 'Monitor', desc: 'Open the table dashboard. Rules run automatically. Check alerts and quality score trends.', color: 'bg-emerald-500' },
              ].map(s => (
                <div key={s.step} className="border border-gray-200 rounded-xl p-4">
                  <div className={clsx('w-7 h-7 rounded-full text-white text-sm font-bold flex items-center justify-center mb-3', s.color)}>{s.step}</div>
                  <p className="text-sm font-semibold text-gray-800 mb-1">{s.label}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 2: Quality Scores
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="scores" icon={<BarChart2 size={18}/>}>Quality Scores Explained</SectionTitle>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-6">
              <p className="text-sm font-semibold text-blue-800 mb-2">How the aggregate score is calculated</p>
              <p className="text-sm text-blue-700 leading-relaxed">
                Start at <strong>100</strong>. Subtract a penalty for each rule that <em>failed</em> in the period.
                The score is clamped between <strong>0</strong> and <strong>100</strong>.
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[['Critical','25','bg-red-100 text-red-800'],['High','15','bg-orange-100 text-orange-800'],['Medium','7','bg-yellow-100 text-yellow-800'],['Low','3','bg-gray-100 text-gray-600']].map(([sev, pts, cls]) => (
                  <div key={sev} className={clsx('rounded-lg px-3 py-2 text-center', cls)}>
                    <div className="text-xs font-medium">{sev}</div>
                    <div className="text-lg font-bold">−{pts}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-blue-600 mt-3">
                Example: 1 critical failure + 2 medium failures → 100 − 25 − 7 − 7 = <strong>61%</strong>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { range: '≥ 95%', label: 'Healthy',          cls: 'bg-green-50 border-green-200 text-green-800',   dot: 'bg-green-500' },
                { range: '85–94%', label: 'Needs attention', cls: 'bg-yellow-50 border-yellow-200 text-yellow-800', dot: 'bg-yellow-500' },
                { range: '< 85%', label: 'Critical',          cls: 'bg-red-50 border-red-200 text-red-800',         dot: 'bg-red-500' },
              ].map(c => (
                <div key={c.range} className={clsx('rounded-xl border px-4 py-3 flex items-center gap-3', c.cls)}>
                  <div className={clsx('w-2.5 h-2.5 rounded-full shrink-0', c.dot)} />
                  <div>
                    <p className="text-sm font-bold">{c.range}</p>
                    <p className="text-xs font-medium opacity-80">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm text-gray-600 leading-relaxed">
              The <strong>per-run score</strong> (shown in Execution Logs) uses a simpler formula:{' '}
              <code className="mx-1.5 text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                score = max(0, 100 − failed_rows / total_rows × 100)
              </code>
              This measures how many individual rows violated the rule.
              The <strong>dashboard score</strong> uses the severity-weighted aggregate above across all rules.
            </p>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 3: Dashboard Metrics
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="metrics" icon={<TrendingUp size={18}/>}>Dashboard Metrics</SectionTitle>
            <p className="text-sm text-gray-500 mb-4">Every metric shown in the platform — what it counts and how to read it.</p>

            <SubTitle>Global Dashboard</SubTitle>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              <MetricRow label="Overall Quality Score" desc="Weighted aggregate score across every rule execution recorded today at the global level." />
              <MetricRow label="14-Day Trend" desc="Sparkline of the daily global quality score. A downward slope indicates deteriorating data quality over the period." />
              <MetricRow label="Total Domains" desc="Count of active business domains registered in the platform." />
              <MetricRow label="Tables Monitored" desc="Registered Snowflake tables that have at least one active rule assigned." />
              <MetricRow label="Active Rules" desc="Rules with status 'active' — scheduled to run automatically or available for manual execution." />
              <MetricRow label="Passed Today" desc="Rules whose most recent run today returned status 'passed'." />
              <MetricRow label="Failed Today" desc="Rules whose most recent run today returned 'failed' or 'error'." />
              <MetricRow label="Open Alerts" desc="Alerts with status 'open' across all domains. These require acknowledgement or resolution." />
              <MetricRow label="Pass Rate Today" value="passed / (passed + failed) × 100" desc="Percentage of rules that passed in today's executions. Different from quality score — this is a simple ratio, not severity-weighted." />
            </div>

            <SubTitle>Table Dashboard</SubTitle>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              <MetricRow label="Quality Score" desc="Severity-weighted score across all rules on this table for today." />
              <MetricRow label="Last Run" desc="Timestamp of the most recent rule execution on this table." />
              <MetricRow label="Total Rules" desc="All rules assigned to this table, regardless of status." />
              <MetricRow label="Passed" desc="Rules that passed in their last execution." />
              <MetricRow label="Failed" desc="Rules that failed in their last execution (any severity)." />
              <MetricRow label="Warnings" desc="Rules that returned 'warning' status — a failure of a low-severity rule. Does not create an alert by default." />
            </div>

            <SubTitle>Execution Logs</SubTitle>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              <MetricRow label="Score" desc="Per-run quality score: 100 − (failed_rows / total_rows × 100), clamped to 0–100." />
              <MetricRow label="Rows Scanned" desc="Total rows the rule's SQL evaluated. For null/uniqueness checks this is the whole table. For freshness/volume this may be a single aggregate row." />
              <MetricRow label="Failed Rows" desc="Rows that violated the rule condition." />
              <MetricRow label="Failure %" value="failed / total × 100" desc="Proportion of rows that failed. A 0.01% failure on a 10M-row table may still be critical depending on the business rule." />
              <MetricRow label="Δ delta badge" desc="▲ or ▼ percentage change vs. the same rule's previous run. Green means quality improved; red means it degraded." />
              <MetricRow label="Duration" desc="Wall-clock time for the Snowflake SQL to return results. High durations may indicate warehouse contention or unoptimized SQL." />
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 4: Rule Types
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="rules" icon={<Shield size={18}/>}>Rule Types</SectionTitle>
            <p className="text-sm text-gray-500 mb-2">Click any rule type to see its description and required configuration.</p>
            <div className="flex gap-4 mb-4">
              <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-full">Standard — 12 types</span>
              <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2 py-1 rounded-full flex items-center gap-1"><Sparkles size={11}/> AI / Semantic — 4 types</span>
            </div>
            <div className="space-y-2">
              {RULE_TYPES.map(rt => <RuleCard key={rt.type} rt={rt} />)}
            </div>
            <InfoBox color="purple" >
              <strong>Semantic rule types</strong> require a configured LLM provider in Admin → Settings → AI. They consume
              more Snowflake credits and LLM tokens than standard types. Use them for logic that cannot be expressed in SQL alone.
            </InfoBox>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 5: Data Catalog & Glossary
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="catalog" icon={<Layers size={18}/>}>Data Catalog &amp; Glossary</SectionTitle>

            <SubTitle>Business Glossary</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              The Business Glossary is a shared dictionary of approved business terms (e.g. "ARR", "Churned Customer", "Invoice Age").
              Each term has a definition, owner, and optionally links to one or more tables or columns that implement it.
              Linked terms appear as tooltips on column names throughout the platform, helping analysts understand
              what data means without leaving the page.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              To create a term: go to <strong>Catalog → Glossary → New Term</strong>. Fill in name, definition, domain, and
              optional column links. Terms can be tagged for compliance frameworks (e.g. "GDPR — personal data").
            </p>

            <SubTitle>Sensitivity Classifications</SubTitle>
            <TableGrid
              headers={['Label', 'Meaning', 'Masking required by default']}
              rows={[
                ['PII',          'Personally Identifiable Information — name, email, SSN, phone, address.', 'Yes — full_mask or hash'],
                ['SENSITIVE',    'Commercially sensitive but not personal — revenue, salaries, deal values.', 'Yes — partial_mask or tokenize'],
                ['CONFIDENTIAL', 'Internal-only data not for external sharing — internal projections, HR notes.', 'Recommended'],
                ['RESTRICTED',   'Executive or board-level data — M&A targets, undisclosed financials.', 'Yes'],
                ['PUBLIC',       'Approved for external use — product descriptions, public pricing.', 'No'],
              ]}
            />

            <SubTitle>Column Metadata &amp; Profiling</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Column profiling gathers statistics directly from Snowflake and stores them in the catalog. To trigger profiling
              for a table, go to <strong>Assets → [table] → Profile Columns</strong>. Profiling runs in the DQ_SMALL_WH
              warehouse and takes seconds to minutes depending on table size.
            </p>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              <MetricRow label="null_pct"          desc="Percentage of NULL values in the column." />
              <MetricRow label="distinct_count"    desc="Count of distinct non-null values." />
              <MetricRow label="min / max"         desc="Minimum and maximum values for numeric and date columns." />
              <MetricRow label="mean / std_dev"    desc="Mean and standard deviation for numeric columns." />
              <MetricRow label="top_values"        desc="Top 10 most frequent values and their occurrence counts." />
              <MetricRow label="sample_values"     desc="5 random non-null sample values shown in the catalog UI." />
              <MetricRow label="last_profiled_at"  desc="Timestamp of the most recent profiling run." />
            </div>

            <SubTitle>Data Products</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed">
              A Data Product is a curated collection of assets and glossary terms that represents a publishable unit
              for consumers (e.g. "Revenue Analytics Product", "HR Workforce Snapshot"). To create a data product:
              go to <strong>Catalog → Data Products → New</strong>. Add assets, set an SLA, assign an owner, and
              publish. Published data products appear in the product directory and can have data contracts attached.
            </p>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 6: Governance & Compliance
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="governance" icon={<ClipboardList size={18}/>}>Governance &amp; Compliance</SectionTitle>

            <SubTitle>Governance Scorecards</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              The governance scorecard measures the health of your data governance program across six dimensions.
              Scores are updated daily and available per domain, subdomain, and globally.
            </p>
            <TableGrid
              headers={['Dimension', 'Weight', 'What it measures']}
              rows={[
                ['Data Quality',      '30%', 'Severity-weighted rule pass rate across all active rules.'],
                ['Documentation',     '20%', 'Percentage of tables and columns with descriptions and glossary links.'],
                ['Ownership',         '15%', 'Percentage of assets with assigned owners and domain mappings.'],
                ['Freshness',         '15%', 'SLA compliance rate for freshness_check rules.'],
                ['Privacy Coverage',  '10%', 'Percentage of PII/SENSITIVE columns with active masking policies.'],
                ['Policy Compliance', '10%', 'Percentage of policy rules with zero open violations.'],
              ]}
            />

            <SubTitle>Policy Engine</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              The policy engine automatically detects governance violations and logs them to the audit trail.
              Four built-in policy types ship out of the box:
            </p>
            <div className="space-y-2">
              {[
                { type: 'pii_exposure',    desc: 'Fires when a column classified PII or SENSITIVE has no active masking policy applied. Checks are run nightly.' },
                { type: 'data_retention',  desc: 'Fires when the oldest record in a table exceeds the configured max_age_days for that asset.' },
                { type: 'schema_approval', desc: 'Fires when a schema drift check detects a column addition or removal that has no corresponding approved rule update within 24 hours.' },
                { type: 'access_review',   desc: 'Fires when a user account has not been reviewed by an admin within the configured review_interval_days.' },
              ].map(p => (
                <div key={p.type} className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl">
                  <code className="text-xs font-mono text-orange-700 bg-orange-50 px-2 py-1 rounded shrink-0">{p.type}</code>
                  <p className="text-sm text-gray-600 leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>

            <SubTitle>Data Contracts</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              A data contract is a formal agreement between a data producer and a consumer. It specifies:
              the asset covered, a minimum quality score, a freshness SLA, and which rules are in scope.
              Contracts move through a lifecycle: <code className="text-xs bg-gray-100 px-1 rounded">draft → active → violated → resolved</code>.
            </p>
            <InfoBox color="yellow">
              <strong>Breach conditions:</strong> A contract is automatically violated when a linked rule fails with
              severity critical or high, the asset quality score drops below <code>minimum_score</code>, or a
              freshness SLA window is exceeded. When <code>auto_incident: true</code> is set on the contract, an
              incident is opened automatically on breach.
            </InfoBox>

            <SubTitle>Compliance Frameworks</SubTitle>
            <TableGrid
              headers={['Framework', 'Focus area', 'Key platform features used']}
              rows={[
                ['GDPR',      'EU personal data protection',       'PII classification, masking policies, data retention, consent tracking, evidence export.'],
                ['CCPA',      'California consumer privacy',       'PII exposure report, data product catalog, access review policy.'],
                ['HIPAA',     'US healthcare data privacy',        'PHI column classification, masking, audit logs, access controls.'],
                ['SOX',       'Financial reporting accuracy',      'Finance domain quality rules, audit logs, change approval workflow.'],
                ['BCBS 239',  'Banking risk data aggregation',     'Data lineage, completeness rules, data contracts, governance scorecards.'],
                ['ISO 27001', 'Information security management',   'Access review policy, audit logs, service account management, RBAC.'],
              ]}
            />
            <p className="text-sm text-gray-500 mt-2">
              To export a compliance evidence package, go to <strong>Governance → Compliance → [Framework] → Export Evidence</strong>.
            </p>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 7: AI Features
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="ai" icon={<BrainCircuit size={18}/>}>AI Features</SectionTitle>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div className="border border-purple-200 bg-purple-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-purple-800 mb-1 flex items-center gap-2"><Sparkles size={14}/> AI Copilot</p>
                <p className="text-xs text-purple-700 leading-relaxed">Floating button (bottom-right, every page). Quick rule wizard, short contextual questions, inline suggestions. Best for one-off tasks while you work.</p>
              </div>
              <div className="border border-indigo-200 bg-indigo-50 rounded-xl p-4">
                <p className="text-sm font-semibold text-indigo-800 mb-1 flex items-center gap-2"><BrainCircuit size={14}/> AI Assistant</p>
                <p className="text-xs text-indigo-700 leading-relaxed">Full-page deep-conversation experience at <code>/ai-assistant</code>. Conversation history, schema context, rule and run awareness. Best for investigation and analysis.</p>
              </div>
            </div>

            <SubTitle>NL-to-Rule (Natural Language Rule Generation)</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Type a quality requirement in plain English and the AI generates a structured rule ready for review.
              The AI determines the rule type, target column, severity, and config automatically. Example:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Input</p>
              <p className="text-sm text-gray-700 italic">"Invoice amounts must always be positive"</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-2">Generated Rule</p>
              <div className="text-xs font-mono text-gray-600 space-y-0.5">
                <p>rule_type: range_check</p>
                <p>target_column: invoice_amount</p>
                <p>config: {'{ min_value: 0 }'}</p>
                <p>severity: high</p>
                <p>status: pending_review</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">Generated rules always start in <code>pending_review</code> status and must be approved before running in production.</p>

            <SubTitle>Root Cause Analysis (RCA)</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              After a rule fails, click <strong>Explain Failure</strong> on the run detail page.
              The AI investigates the failure and produces a structured RCA report containing:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                'What failed — which rows and values',
                'Why it matters — business impact description',
                'Possible root cause — upstream pipeline hypothesis',
                'Suggested fix — SQL patch or rule adjustment',
                'Related rules — other rules that may be affected',
                'Escalation recommendation — severity-based guidance',
              ].map(item => (
                <div key={item} className="flex items-start gap-2 p-2.5 border border-gray-100 rounded-lg bg-gray-50">
                  <CheckCircle size={13} className="text-green-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-600 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>

            <SubTitle>PII Discovery</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              PII Discovery scans column names and sample values using the LLM to identify personally identifiable
              information. To run it: go to <strong>Assets → [table] → Discover PII</strong>. The AI returns a list
              of suspected PII columns with confidence scores and suggested sensitivity labels.
              You can accept suggestions in bulk or per-column. Accepted suggestions apply the classification label
              to the column and optionally create a policy violation if no masking policy exists.
            </p>

            <SubTitle>Auto-Suggest Rules</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed">
              Auto-suggest is triggered when you register a new asset or click <strong>Suggest Rules</strong> on
              any asset page. The AI inspects the column names, data types, sensitivity labels, and domain context
              to propose a starter rule set. Suggestions appear in a review panel — approve individually, approve all,
              or reject. Approved suggestions are created as <code>pending_review</code> rules.
            </p>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 8: Privacy & Masking
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="privacy" icon={<Lock size={18}/>}>Privacy &amp; Masking</SectionTitle>

            <SubTitle>Masking Policy Types</SubTitle>
            <TableGrid
              headers={['Type', 'What it does', 'Example output']}
              rows={[
                ['full_mask',    'Replaces the entire value with a fixed string.',               '"john.doe@acme.com" → "***"'],
                ['partial_mask', 'Masks all but the last N characters.',                         '"4111111111111234" → "************1234"'],
                ['hash',         'One-way SHA-256 hash — deterministic, irreversible.',          '"john@acme.com" → "a3f1b2c4..."'],
                ['tokenize',     'Replaces value with a reversible token stored in a vault.',    '"John Doe" → "TKN-8821-XZW"'],
                ['nullify',      'Sets value to NULL for downstream consumers.',                  '"555-1234" → NULL'],
              ]}
            />
            <p className="text-sm text-gray-500 mt-2">
              To create a masking policy: go to <strong>Governance → Masking Policies → New Policy</strong>. Select the
              masking type, the column(s) to apply it to, and the roles that may see the unmasked value.
            </p>

            <SubTitle>PII Exposure Report</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              The PII Exposure Report shows every column classified as PII or SENSITIVE that does not have an active
              masking policy. Access it at <strong>Governance → Privacy → PII Exposure</strong>. The report is
              sorted by domain and criticality. Each row has a quick-action button to create a masking policy inline.
            </p>

            <SubTitle>Masking &amp; Rule Execution</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed">
              Rule execution always uses the <code>DQ_PLATFORM_ROLE</code> which has direct read access to source tables.
              Masking policies apply to other consumers, not to rule execution. Failed sample records stored in
              <code className="mx-1 text-xs bg-gray-100 px-1 rounded">dq_rule_run_samples</code> are automatically
              redacted for columns classified PII before being written to the results schema.
            </p>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 9: Incident Management
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="incidents" icon={<AlertCircle size={18}/>}>Incident Management</SectionTitle>

            <SubTitle>Incident Lifecycle</SubTitle>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
              {[
                { status: 'open',          cls: 'bg-red-50 text-red-800 border-red-200',       desc: 'New incident. Assigned to on-call engineer. SLA timer starts.' },
                { status: 'investigating', cls: 'bg-yellow-50 text-yellow-800 border-yellow-200', desc: 'On-call acknowledged. Root cause analysis in progress.' },
                { status: 'mitigated',     cls: 'bg-blue-50 text-blue-800 border-blue-200',    desc: 'Short-term fix applied. Data quality restored. Full fix pending.' },
                { status: 'resolved',      cls: 'bg-green-50 text-green-800 border-green-200', desc: 'Root cause fixed. Verified. MTTR recorded. Post-mortem can be generated.' },
              ].map(s => (
                <div key={s.status} className={clsx('border rounded-xl p-3', s.cls)}>
                  <code className="text-[10px] font-semibold">{s.status}</code>
                  <p className="text-xs leading-relaxed mt-1 opacity-90">{s.desc}</p>
                </div>
              ))}
            </div>

            <SubTitle>MTTD and MTTR</SubTitle>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-800 mb-1">MTTD — Mean Time to Detect</p>
                <p className="text-xs text-gray-500 mb-2">How quickly bad data was discovered.</p>
                <code className="text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 block">
                  MTTD = first_failed_run_at − data_good_boundary
                </code>
                <p className="text-xs text-gray-500 mt-2">Data good boundary = last successful freshness run timestamp, or the previous passing run for other rule types.</p>
              </div>
              <div className="border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-800 mb-1">MTTR — Mean Time to Resolve</p>
                <p className="text-xs text-gray-500 mb-2">How quickly the incident was closed.</p>
                <code className="text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 block">
                  MTTR = incident.resolved_at − incident.created_at
                </code>
                <p className="text-xs text-gray-500 mt-2">MTTD and MTTR averages appear on the Incidents dashboard by domain and severity.</p>
              </div>
            </div>

            <SubTitle>On-Call Schedules</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Configure on-call schedules at <strong>Incidents → On-Call</strong>. Each schedule is linked to a domain
              and specifies a rotation of engineers with primary and backup contacts. When an incident is created for
              a domain, the platform routes the notification to whoever is on-call for that domain at that time.
              Escalation triggers when the primary does not acknowledge within the configured SLA (default 15 minutes).
            </p>

            <SubTitle>Runbooks</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed">
              A runbook is a step-by-step remediation guide linked to a specific rule or asset. Create runbooks at
              <strong> Incidents → Runbooks → New</strong>. Link a runbook to a rule by editing the rule and selecting
              the runbook in the <strong>Runbook</strong> field. When that rule fails and creates an incident, the runbook
              link appears directly in the incident detail page, reducing time-to-fix.
            </p>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 10: Data Lineage & Impact
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="lineage" icon={<GitBranch size={18}/>}>Data Lineage &amp; Impact Analysis</SectionTitle>

            <SubTitle>Lineage Types</SubTitle>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-800 mb-1">Upstream</p>
                <p className="text-xs text-gray-600 leading-relaxed">Tables and pipelines that write data into this asset. A failure upstream propagates into this table. Upstream lineage helps identify the root cause of a quality failure.</p>
              </div>
              <div className="border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-800 mb-1">Downstream</p>
                <p className="text-xs text-gray-600 leading-relaxed">Tables, reports, and data products that consume this asset. A failure here propagates to all downstream consumers. Use blast radius to quantify impact before making changes.</p>
              </div>
            </div>

            <SubTitle>Blast Radius</SubTitle>
            <TableGrid
              headers={['Rating', 'Criteria']}
              rows={[
                ['HIGH',   'More than 10 downstream assets, OR any downstream asset is a data product, OR a downstream table has a critical data contract.'],
                ['MEDIUM', '3–10 downstream assets, OR a downstream table has a high-severity rule.'],
                ['LOW',    'Fewer than 3 downstream assets with no data products or contracts.'],
              ]}
            />
            <p className="text-sm text-gray-500 mt-2">
              Blast radius is shown on the asset detail page and in the Impact Analysis panel when you run
              <strong> Assets → [table] → Analyze Impact</strong>.
            </p>

            <SubTitle>Adding Lineage Links</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Lineage links can be added three ways: (1) manually via <strong>Assets → [table] → Lineage → Add Link</strong>;
              (2) automatically from a dbt manifest upload (see API & Integration); (3) via the lineage API endpoint
              <code className="mx-1 text-xs bg-gray-100 px-1 rounded">POST /lineage</code>.
            </p>

            <SubTitle>Impact Analysis Response Structure</SubTitle>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 font-mono text-xs text-gray-600 space-y-1">
              <p>{'{'}</p>
              <p className="pl-4">asset_id: "...",</p>
              <p className="pl-4">blast_radius: "HIGH" | "MEDIUM" | "LOW",</p>
              <p className="pl-4">downstream_count: 14,</p>
              <p className="pl-4">affected_data_products: ["Revenue Analytics"],</p>
              <p className="pl-4">affected_contracts: ["Contract-Rev-001"],</p>
              <p className="pl-4">downstream_assets: [ {'{ asset_id, table_name, domain, criticality }'} ]</p>
              <p>{'}'}</p>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 11: Rule Marketplace
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="marketplace" icon={<ShoppingBag size={18}/>}>Rule Marketplace</SectionTitle>

            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              The Rule Marketplace is a curated library of rule templates that you can import with one click.
              Templates are organized by domain (Revenue, Finance, HR, etc.) and rule type. Each template ships
              with a description, example SQL, and recommended severity.
            </p>

            <SubTitle>Browsing Templates</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Go to <strong>Marketplace</strong> in the sidebar. Use domain filters, rule type filters, or the
              search bar to find templates. Click <strong>Preview</strong> to see the generated SQL before importing.
              Each template shows how many teams have used it and its average quality impact score.
            </p>

            <SubTitle>AI-Recommended Templates</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              When you open the Marketplace from an asset page, the AI analyzes the asset's column names,
              data types, domain, subdomain, and existing rules, then surfaces the top 5 most relevant templates
              at the top of the list. Matching uses semantic similarity between your schema and template metadata,
              not just keyword matching.
            </p>

            <SubTitle>Importing a Template</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Click <strong>Import as Draft</strong> on any template. A new rule is created pre-filled with the
              template configuration and linked to the current asset. The rule starts in <code>draft</code> status —
              review the SQL, adjust the config, then submit for approval. Imported rules are fully editable.
            </p>

            <SubTitle>Publishing Your Own Templates</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed">
              Any active rule can be published as a template. Go to the rule detail page and click
              <strong> Publish to Marketplace</strong>. Add a title, description, and domain tags. Published
              templates are visible to all users in your organization's marketplace. Admin approval is required
              before a template becomes searchable.
            </p>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 12: Rule Lifecycle
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="lifecycle" icon={<Play size={18}/>}>Rule Lifecycle</SectionTitle>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {[
                { status: 'draft',          cls: 'bg-gray-100 text-gray-700',     desc: 'Not ready. May be the result of a rejection or an in-progress template import. Cannot execute.' },
                { status: 'pending_review', cls: 'bg-yellow-100 text-yellow-800', desc: 'Awaiting approval from an admin or domain_owner. Cannot execute. AI-generated rules always start here.' },
                { status: 'approved',       cls: 'bg-blue-100 text-blue-800',     desc: 'Approved but not yet manually activated. Cannot execute. Visible in the rules list.' },
                { status: 'active',         cls: 'bg-green-100 text-green-800',   desc: 'Running on schedule and available for manual execution. Contributes to quality scores.' },
                { status: 'disabled',       cls: 'bg-orange-100 text-orange-800', desc: 'Temporarily paused. No scheduled runs. Can be re-enabled without re-approval.' },
                { status: 'archived',       cls: 'bg-red-100 text-red-800',       desc: 'Permanently retired. Historical run data preserved. Cannot be un-archived.' },
              ].map(s => (
                <div key={s.status} className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl">
                  <span className={clsx('text-[10px] font-semibold px-2 py-1 rounded shrink-0 mt-0.5', s.cls)}>{s.status}</span>
                  <p className="text-sm text-gray-600 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            <InfoBox color="gray">
              <strong>Version history &amp; rollback:</strong> Every change to a rule — edit, approve, reject, rollback — creates an
              immutable snapshot in the Version History tab. Click <strong>Restore</strong> on any version to roll back to that
              state. After rollback, the rule moves to <code className="text-xs bg-gray-200 px-1 rounded">pending_review</code> and
              must be approved again before execution.
            </InfoBox>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 13: Run Statuses
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="runs" icon={<CheckCircle size={18}/>}>Run Statuses</SectionTitle>
            <div className="space-y-3">
              {[
                { status: 'passed',  icon: <CheckCircle size={16} className="text-green-500"/>,   cls: 'bg-green-50 border-green-200',   desc: 'Zero rows failed the rule condition. The table passes this check.' },
                { status: 'failed',  icon: <XCircle size={16} className="text-red-500"/>,          cls: 'bg-red-50 border-red-200',       desc: 'One or more rows failed. Applies to high and critical severity rules. Triggers an alert if not deduplicated within 4 hours.' },
                { status: 'warning', icon: <AlertTriangle size={16} className="text-yellow-500"/>, cls: 'bg-yellow-50 border-yellow-200', desc: 'One or more rows failed, but the rule severity is low. No alert is created. Recorded in the quality score as a low penalty.' },
                { status: 'error',   icon: <AlertCircle size={16} className="text-orange-500"/>,  cls: 'bg-orange-50 border-orange-200', desc: 'The SQL could not execute. Common causes: Snowflake not configured, table does not exist, warehouse suspended. Check the error message in the run detail.' },
                { status: 'skipped', icon: <Clock size={16} className="text-gray-400"/>,           cls: 'bg-gray-50 border-gray-200',     desc: 'The rule was inactive or the scheduler was configured to skip it. No execution occurred.' },
              ].map(r => (
                <div key={r.status} className={clsx('flex items-start gap-3 p-4 border rounded-xl', r.cls)}>
                  {r.icon}
                  <div>
                    <code className="text-xs font-semibold">{r.status}</code>
                    <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 14: Alerts
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="alerts" icon={<Bell size={18}/>}>Alerts</SectionTitle>
            <div className="space-y-3 mb-6">
              {[
                { status: 'open',         cls: 'bg-red-50 text-red-800 border-red-200',       desc: 'Unresolved alert. Requires acknowledgement or remediation.' },
                { status: 'acknowledged', cls: 'bg-blue-50 text-blue-800 border-blue-200',    desc: 'Someone has seen the alert and is working on it. The underlying issue is not yet fixed.' },
                { status: 'resolved',     cls: 'bg-green-50 text-green-800 border-green-200', desc: 'The issue has been fixed. The alert is closed.' },
                { status: 'ignored',      cls: 'bg-gray-100 text-gray-700 border-gray-200',   desc: 'Suppressed as expected noise. Use when a rule failure is known and acceptable.' },
              ].map(a => (
                <div key={a.status} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                  <span className={clsx('text-[10px] font-semibold px-2 py-1 rounded border shrink-0', a.cls)}>{a.status}</span>
                  <p className="text-sm text-gray-600">{a.desc}</p>
                </div>
              ))}
            </div>
            <InfoBox color="blue">
              <strong>Deduplication:</strong> A new alert is not created for the same rule within a 4-hour window.
              If a rule fails every minute, you get at most one alert every 4 hours. Notification channels supported:
              Slack, Microsoft Teams, Email, PagerDuty, and generic Webhook.
            </InfoBox>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 15: Roles & Access
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="roles" icon={<Users size={18}/>}>Roles &amp; Access</SectionTitle>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Role', 'Dashboards', 'Rules / Assets', 'Approve / Reject', 'Admin UI', 'Audit Logs'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { role: 'admin',        dash: '✓ All',       rules: '✓ All domains',  approve: '✓ Any rule',  admin: '✓',  audit: '✓' },
                    { role: 'domain_owner', dash: '✓ All',       rules: '✓ Own domain',   approve: '✓ Own domain', admin: '✗', audit: '✓' },
                    { role: 'data_owner',   dash: '✓ All',       rules: '✓ Own tables',   approve: '✗',           admin: '✗', audit: '✓' },
                    { role: 'viewer',       dash: '✓ Read-only', rules: '✗ Read-only',    approve: '✗',           admin: '✗', audit: '✗' },
                    { role: 'auditor',      dash: '✓ Read-only', rules: '✗ Read-only',    approve: '✗',           admin: '✗', audit: '✓' },
                  ].map(r => (
                    <tr key={r.role} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-indigo-700 bg-indigo-50/50 font-semibold">{r.role}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{r.dash}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{r.rules}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{r.approve}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{r.admin}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{r.audit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <InfoBox color="gray">
              <strong>Domain isolation:</strong> When a user has the <code>domain_owner</code> role for a specific domain,
              all API queries automatically apply a domain filter. They cannot list, read, or modify rules, assets, alerts,
              incidents, or runs belonging to any other domain. This restriction is enforced server-side — it is not
              merely a UI filter. A user can hold <code>domain_owner</code> for multiple domains simultaneously.
            </InfoBox>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 16: Schedules
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="schedules" icon={<Calendar size={18}/>}>Schedules</SectionTitle>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Schedules control when rules run automatically. You can set a schedule at any level — the most
              specific active schedule wins.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 font-mono text-xs text-gray-600">
              Rule &gt; Table &gt; Subdomain &gt; Domain &gt; Global
            </div>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              {[
                { freq: 'hourly',    desc: 'Runs every hour. Use for critical tables with tight SLAs.' },
                { freq: 'daily',     desc: 'Runs once per day at a configured time. Most common for batch pipelines.' },
                { freq: 'weekly',    desc: 'Runs once per week. Suitable for lower-priority reference tables.' },
                { freq: 'monthly',   desc: 'Runs once per month. Use for slowly-changing dimension tables.' },
                { freq: 'cron',      desc: 'Arbitrary cron expression — e.g. "0 6 * * 1-5" for weekdays at 6 AM.' },
                { freq: 'on_demand', desc: 'Never runs automatically. Execute manually from the Rules or Schedules page.' },
              ].map(s => (
                <div key={s.freq} className="flex items-center gap-4 px-4 py-3">
                  <code className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded w-24 shrink-0">{s.freq}</code>
                  <p className="text-sm text-gray-600">{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 17: API & Integration
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="api" icon={<KeyRound size={18}/>}>API &amp; Integration</SectionTitle>

            <SubTitle>Service Accounts</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Service accounts provide API key authentication for CI/CD pipelines, scripts, and integrations.
              To create one: go to <strong>Admin → Settings → Service Accounts → New</strong>. The
              <code className="mx-1 text-xs bg-gray-100 px-1 rounded">api_key</code> is shown once at creation — copy it immediately.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 font-mono text-xs text-gray-600 mb-3 space-y-1">
              <p className="text-gray-400"># Use in every API request</p>
              <p>curl -H "X-API-Key: dqp_live_xxxxxxxxxxxxxxxxxxxx" \</p>
              <p className="pl-4">https://your-host/api/rules</p>
            </div>
            <p className="text-xs text-gray-500">
              Key format: <code>dqp_live_</code> prefix for production, <code>dqp_test_</code> for staging.
              Revoke compromised keys at <strong>Admin → Settings → Service Accounts → Revoke</strong>.
            </p>

            <SubTitle>Google SSO</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-2">Setup steps:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600 ml-2 mb-3">
              <li>Create an OAuth 2.0 Client ID in Google Cloud Console (Web application type).</li>
              <li>Set Authorized Redirect URI to <code className="text-xs bg-gray-100 px-1 rounded">https://&lt;your-domain&gt;/auth/callback/google</code>.</li>
              <li>Go to <strong>Admin → Settings → Authentication → Google OAuth2</strong>.</li>
              <li>Paste Client ID and Client Secret, then enable the toggle.</li>
              <li>Users can now log in via <strong>Continue with Google</strong> on the login page.</li>
            </ol>

            <SubTitle>dbt Integration</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Upload your dbt <code>manifest.json</code> to automatically sync asset lineage, column descriptions,
              and model metadata. Upload via <strong>Admin → Integrations → dbt → Upload Manifest</strong>, or
              via <code className="text-xs bg-gray-100 px-1 rounded">POST /integrations/dbt/manifest</code>.
            </p>
            <TableGrid
              headers={['What syncs', 'Destination']}
              rows={[
                ['Model definitions and column descriptions', 'Data Catalog — column metadata'],
                ['Model dependencies (ref() and source())',  'Lineage graph — upstream/downstream links'],
                ['dbt tags and meta fields',                  'Asset tags and domain hints'],
                ['dbt tests (not_null, unique, etc.)',        'Imported as draft rules in the platform'],
              ]}
            />

            <SubTitle>OpenTelemetry Metrics</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              The platform emits OTEL metrics to the configured collector endpoint (set
              <code className="mx-1 text-xs bg-gray-100 px-1 rounded">OTEL_EXPORTER_OTLP_ENDPOINT</code> in env).
            </p>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              <MetricRow label="dq.rule.executions"    desc="Counter — incremented on every rule run, tagged by domain, rule_type, status." />
              <MetricRow label="dq.rule.duration_ms"   desc="Histogram — SQL execution time in milliseconds." />
              <MetricRow label="dq.quality_score"      desc="Gauge — current quality score by domain, subdomain, and table." />
              <MetricRow label="dq.alerts.open"        desc="Gauge — count of open alerts by domain and severity." />
              <MetricRow label="dq.incidents.open"     desc="Gauge — count of open incidents." />
              <MetricRow label="dq.incidents.mttd_min" desc="Histogram — mean time to detect in minutes." />
              <MetricRow label="dq.incidents.mttr_min" desc="Histogram — mean time to resolve in minutes." />
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 18: FAQ
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="faq" icon={<HelpCircle size={18}/>}>Frequently Asked Questions</SectionTitle>

            <div className="relative mb-5">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search all 20 questions…"
                className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              />
            </div>

            <div className="space-y-2">
              {filteredFaqs.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No questions match &quot;{search}&quot;</p>
                : filteredFaqs.map(faq => <FaqItem key={faq.q} faq={faq} />)
              }
            </div>

            <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">
              <p className="font-semibold mb-1">Need more help?</p>
              <p>Ask the{' '}
                <Link href="/ai-assistant" className="underline">AI Assistant</Link>{' '}
                any question about your platform's data quality — it has full context of your rules, runs, schemas,
                and quality history. For API documentation, visit{' '}
                <code className="text-xs bg-blue-100 px-1 rounded">/api/docs</code> (FastAPI interactive docs).
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
