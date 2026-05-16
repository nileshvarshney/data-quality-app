'use client'
import { useState, useRef, useEffect } from 'react'
import {
  aiApi, rulesApi, domainsApi, subdomainsApi, assetsApi,
  dashboardApi, schedulesApi, executionsApi, alertsApi,
  governanceApi, contractsApi, incidentsApi, catalogApi,
  dataProductsApi, costApi, complianceApi,
} from '@/services/apiClient'
import {
  Bot, Send, X, Minimize2, User,
  CheckCircle, Loader2, MessageSquare, Plus, Sparkles,
  ArrowLeft, ChevronRight, Check, Copy, Zap,
  Square, Trash2, AlertCircle, Pencil,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant' | 'error'
  content: string
  streaming?: boolean
}

interface DomainOption    { domain_id: string; domain_name: string }
interface SubdomainOption { subdomain_id: string; subdomain_name: string }
interface AssetOption {
  asset_id: string; sf_table_name: string; sf_schema_name: string
  sf_database_name?: string; connection_id?: string
}
interface ColumnOption    { column_name: string; data_type: string; is_nullable: string }
interface SuggestedRule {
  rule_name: string; rule_type: string; target_column?: string
  severity: string; rule_description?: string
}

type WizardMode = 'manual' | 'ai_suggest' | 'nl'
interface WizardData {
  mode: WizardMode; step: number
  domain_id: string; domain_name: string
  subdomain_id: string; subdomain_name: string
  asset_id: string; asset_name: string
  sf_schema_name: string; sf_table_name: string
  rule_type: string; target_columns: string[]
  ruleConfig: Record<string, any>
  severity: 'critical' | 'high' | 'medium' | 'low'
  rule_name: string; rule_description: string
  generated_sql: string; custom_sql: string; sql_overridden: boolean
  suggestedRules: SuggestedRule[]; savedRuleIds: Set<number>
  nl_description: string; nl_result: Record<string, any> | null
}
type Intent =
  | 'global' | 'domains' | 'rules' | 'assets' | 'schedules' | 'runs' | 'alerts'
  | 'governance' | 'contracts' | 'incidents' | 'catalog' | 'lineage' | 'compliance' | 'cost'

// ── Constants ─────────────────────────────────────────────────────

const RULE_TYPES = [
  { value: 'null_check',                    label: 'Null Check' },
  { value: 'uniqueness_check',              label: 'Uniqueness' },
  { value: 'duplicate_check',               label: 'Duplicate' },
  { value: 'accepted_values_check',         label: 'Accepted Values' },
  { value: 'range_check',                   label: 'Range' },
  { value: 'freshness_check',               label: 'Freshness' },
  { value: 'volume_check',                  label: 'Volume' },
  { value: 'schema_drift_check',            label: 'Schema Drift' },
  { value: 'referential_integrity_check',   label: 'Ref. Integrity' },
  { value: 'regex_check',                   label: 'Regex' },
  { value: 'business_rule_check',           label: 'Business Rule' },
  { value: 'custom_sql_check',              label: 'Custom SQL' },
  { value: 'semantic_consistency_check',    label: 'Semantic Consistency' },
  { value: 'business_metric_check',         label: 'Business Metric' },
  { value: 'referential_sanity_check',      label: 'Ref. Sanity' },
  { value: 'distribution_consistency_check', label: 'Distribution Drift' },
  { value: 'llm_semantic_check',            label: 'LLM Semantic' },
]

const NO_COLUMN_RULES = new Set([
  'volume_check', 'schema_drift_check', 'custom_sql_check', 'business_rule_check',
  'semantic_consistency_check', 'business_metric_check', 'referential_sanity_check', 'llm_semantic_check',
])
const SEVERITIES = [
  { value: 'critical', label: 'Critical', cls: 'border-red-300 bg-red-50 text-red-700' },
  { value: 'high',     label: 'High',     cls: 'border-orange-300 bg-orange-50 text-orange-700' },
  { value: 'medium',   label: 'Medium',   cls: 'border-yellow-300 bg-yellow-50 text-yellow-700' },
  { value: 'low',      label: 'Low',      cls: 'border-gray-200 bg-gray-50 text-gray-600' },
]
const EMPTY_WIZARD: WizardData = {
  mode: 'manual', step: 0,
  domain_id: '', domain_name: '', subdomain_id: '', subdomain_name: '',
  asset_id: '', asset_name: '', sf_schema_name: '', sf_table_name: '',
  rule_type: 'null_check', target_columns: [], ruleConfig: {},
  severity: 'medium', rule_name: '', rule_description: '',
  generated_sql: '', custom_sql: '', sql_overridden: false,
  suggestedRules: [], savedRuleIds: new Set(),
  nl_description: '', nl_result: null,
}
const INPUT_MAX = 1000
const HISTORY_KEY = 'copilot-history'
const DOMAIN_NAMES = ['revenue', 'finance', 'hr', 'operations', 'gtm', 'planning', 'others']
const CHAT_EXAMPLES = [
  'Why did quality drop today?',
  'Overall quality score',
  'Revenue domain health',
  'Failed rules this week',
  'Open critical alerts',
  'Governance violations',
  'Tables with no owners',
  'Data contracts at risk',
  'Finance quality trend',
  'Active incidents',
  'Cost of bad data',
  'Show HR failing rules',
]

// ── Intent detection ──────────────────────────────────────────────

function detectIntent(q: string): { intent: Intent; domainHint: string | null } {
  const m = q.toLowerCase()
  let domainHint: string | null = null
  for (const d of DOMAIN_NAMES) if (m.includes(d)) { domainHint = d; break }

  if (/\bgdpr|sox|hipaa|ccpa|bcbs|iso 27001|compliance|regulation|framework|right to erasure|privacy law\b/.test(m)) return { intent: 'compliance', domainHint }
  if (/\bcost|roi|bad data cost|financial impact|dollar|revenue impact|cost per row\b/.test(m))         return { intent: 'cost',       domainHint }
  if (/\blineage|upstream|downstream|blast radius|depend|impact analysis|data flow|source table\b/.test(m))           return { intent: 'lineage',    domainHint }
  if (/\bdata product|catalog|discover|glossary|business term|search asset|popular table\b/.test(m))                  return { intent: 'catalog',    domainHint }
  if (/\bincident|mttd|mttr|mean time|outage|ongoing issue|quality incident|open incident\b/.test(m))                 return { intent: 'incidents',  domainHint }
  if (/\bcontract|data contract|sla agreement|producer|consumer|contract.*violated|violated.*contract\b/.test(m))     return { intent: 'contracts',  domainHint }
  if (/\bgovernance|policy|violation|scorecard|governance score|certification.*require|owner.*require|pii.*classif\b/.test(m)) return { intent: 'governance', domainHint }
  if (/\balert|notification|open alert|unresolved\b/.test(m))                                                         return { intent: 'alerts',     domainHint }
  if (/\brun|execution|execut|log|history|last run|recent run|result\b/.test(m))                                      return { intent: 'runs',       domainHint }
  if (/\bschedul|cron|frequenc|when.*run|next run|hourly|daily|weekly|monthly\b/.test(m))                             return { intent: 'schedules',  domainHint }
  if (/\basset|table|dataset|schema|view|registered|data asset\b/.test(m))                                            return { intent: 'assets',     domainHint }
  if (/\brule|check|validat|null check|uniqueness|duplicate|regex|freshness|volume\b/.test(m))                        return { intent: 'rules',      domainHint }
  if (domainHint || /\bdomain|quality score|quality\b/.test(m))                                                       return { intent: 'domains',    domainHint }
  return { intent: 'global', domainHint }
}

// Whether the question is diagnostic / multi-topic
function isDiagnosticQuery(q: string): boolean {
  return /\bwhy|what.*(wrong|happen|caus|broke|fail)|explain|root.?cause|probl|issue|drop|declin|degraded|compare|vs\b/.test(q.toLowerCase())
}

// ── Context gathering (parallel multi-source) ────────────────────

/** Fetches the primary intent context — same structure as before for fallback compatibility */
async function fetchPrimaryContext(intent: Intent, domainHint: string | null, question: string): Promise<Record<string, any>> {
  switch (intent) {
    case 'global': {
      const res = await dashboardApi.global()
      const d = res.data
      return {
        topic: 'platform_overview',
        overall_quality_score: d.overall_quality_score,
        total_domains: d.total_domains,
        total_assets: d.total_assets,
        total_active_rules: d.total_active_rules,
        rules_passed_today: d.rules_passed_today,
        rules_failed_today: d.rules_failed_today,
        critical_failures: d.critical_failures,
        open_alerts: d.open_alerts,
        quality_trend_last_7_days: (d.quality_trend ?? []).slice(-7),
      }
    }
    case 'domains': {
      const domsRes = await dashboardApi.domains()
      const domains = domsRes.data
      if (domainHint) {
        const match = domains.find((x: any) => x.domain_name?.toLowerCase().includes(domainHint))
        if (match) {
          try {
            const detail = await dashboardApi.domain(match.domain_id)
            return { topic: 'domain_detail', domain: detail.data, all_domains: domains }
          } catch { /* fall through */ }
        }
      }
      return { topic: 'domain_overview', domains }
    }
    case 'rules': {
      const params: Record<string, any> = { limit: 50 }
      const res = await rulesApi.listEnriched(params)
      let rules = res.data
      if (domainHint) rules = rules.filter((r: any) => (r.domain_name ?? '').toLowerCase().includes(domainHint))
      return {
        topic: 'rules',
        total: res.data.length,
        failed_count: rules.filter((r: any) => r.status === 'failed').length,
        rules: rules.slice(0, 30).map((r: any) => ({
          rule_name: r.rule_name, rule_type: r.rule_type,
          severity: r.severity, status: r.status,
          domain_name: r.domain_name, subdomain_name: r.subdomain_name,
          target_column: r.target_column,
        })),
      }
    }
    case 'assets': {
      const res = await assetsApi.listEnriched()
      let assets = res.data
      if (domainHint) assets = assets.filter((a: any) => (a.domain_name ?? '').toLowerCase().includes(domainHint))
      return {
        topic: 'data_assets',
        total: res.data.length,
        assets: assets.slice(0, 25).map((a: any) => ({
          sf_schema_name: a.sf_schema_name, sf_table_name: a.sf_table_name,
          domain_name: a.domain_name, subdomain_name: a.subdomain_name,
          criticality: a.criticality, certification_status: a.certification_status,
          owner_name: a.owner_name, owner_email: a.owner_email,
          quality_score: a.quality_score,
        })),
      }
    }
    case 'schedules': {
      const res = await schedulesApi.listEnriched()
      return {
        topic: 'schedules',
        total: res.data.length,
        schedules: res.data.slice(0, 20).map((s: any) => ({
          schedule_level: s.schedule_level, frequency: s.frequency,
          rule_name: s.rule_name, is_active: s.is_active,
          cron_expression: s.cron_expression,
        })),
      }
    }
    case 'runs': {
      const params: Record<string, any> = { limit: 30 }
      if (/fail/i.test(question)) params.status = 'failed'
      const res = await executionsApi.listRunsEnriched(params)
      let runs = res.data
      if (domainHint) runs = runs.filter((r: any) => (r.domain_name ?? '').toLowerCase().includes(domainHint))
      return {
        topic: 'execution_runs',
        total: res.data.length,
        failed_count: runs.filter((r: any) => r.status === 'failed' || r.status === 'error').length,
        runs: runs.slice(0, 20).map((r: any) => ({
          rule_name: r.rule_name, sf_table_name: r.sf_table_name,
          domain_name: r.domain_name, subdomain_name: r.subdomain_name,
          status: r.status, quality_score: r.quality_score,
          severity: r.severity, failed_rows_count: r.failed_rows_count,
          created_at: r.created_at,
        })),
      }
    }
    case 'alerts': {
      const res = await alertsApi.listEnriched({ limit: 25 })
      let alerts = res.data
      if (domainHint) alerts = alerts.filter((a: any) => (a.domain_name ?? '').toLowerCase().includes(domainHint))
      const open = alerts.filter((a: any) => a.alert_status === 'open')
      return {
        topic: 'alerts',
        total: res.data.length,
        open_count: open.length,
        alerts: open.slice(0, 15).map((a: any) => ({
          alert_message: a.alert_message, severity: a.severity,
          domain_name: a.domain_name, alert_status: a.alert_status,
          created_at: a.created_at, rule_name: a.rule_name,
        })),
      }
    }
    case 'governance': {
      const [violRes, scorecardRes] = await Promise.allSettled([
        governanceApi.violations({ status: 'open', limit: 20 }),
        governanceApi.scorecards(),
      ])
      const violations = violRes.status === 'fulfilled' ? (violRes.value.data ?? []) : []
      const scorecards = scorecardRes.status === 'fulfilled' ? (scorecardRes.value.data ?? []) : []
      return {
        topic: 'governance',
        open_violations: violations.length,
        violations: violations.slice(0, 15).map((v: any) => ({
          policy_name: v.policy_name, entity_type: v.entity_type,
          violation_detail: v.violation_detail, status: v.status,
          detected_at: v.detected_at,
        })),
        scorecards: scorecards.slice(0, 10).map((s: any) => ({
          domain_name: s.domain_name, governance_score: s.governance_score,
          data_quality_score: s.data_quality_score, documentation_score: s.documentation_score,
          classification_score: s.classification_score, ownership_score: s.ownership_score,
          certification_score: s.certification_score,
        })),
      }
    }
    case 'contracts': {
      const res = await contractsApi.list({ limit: 20 })
      const contracts = Array.isArray(res.data) ? res.data : (res.data?.items ?? [])
      const violated = contracts.filter((c: any) => c.status === 'violated')
      return {
        topic: 'contracts',
        total: contracts.length,
        violated_count: violated.length,
        contracts: contracts.slice(0, 15).map((c: any) => ({
          contract_name: c.contract_name, status: c.status,
          asset_name: c.sf_table_name || c.asset_name,
          min_quality_score: c.min_quality_score,
          producer_team: c.producer_team, consumer_team: c.consumer_team,
        })),
      }
    }
    case 'incidents': {
      const [listRes, statsRes] = await Promise.allSettled([
        incidentsApi.list({ limit: 15 }),
        incidentsApi.stats(),
      ])
      const incidents = listRes.status === 'fulfilled'
        ? (Array.isArray(listRes.value.data) ? listRes.value.data : (listRes.value.data?.items ?? []))
        : []
      const stats = statsRes.status === 'fulfilled' ? (statsRes.value.data ?? {}) : {}
      return {
        topic: 'incidents',
        stats,
        incidents: incidents.slice(0, 10).map((i: any) => ({
          title: i.title, severity: i.severity, status: i.status,
          asset_name: i.sf_table_name || i.asset_name,
          ttd_minutes: i.ttd_minutes, ttr_minutes: i.ttr_minutes,
          created_at: i.created_at,
        })),
      }
    }
    case 'catalog': {
      const [popularRes, productsRes] = await Promise.allSettled([
        catalogApi.popular(),
        dataProductsApi.list({ limit: 10 }),
      ])
      const popular = popularRes.status === 'fulfilled' ? (popularRes.value.data ?? []) : []
      const products = productsRes.status === 'fulfilled'
        ? (Array.isArray(productsRes.value.data) ? productsRes.value.data : (productsRes.value.data?.items ?? []))
        : []
      return {
        topic: 'catalog',
        popular_assets: popular.slice(0, 10).map((a: any) => ({
          sf_table_name: a.sf_table_name, domain_name: a.domain_name,
          view_count: a.view_count, trust_score: a.trust_score,
          certification_status: a.certification_status,
        })),
        data_products: products.slice(0, 8).map((p: any) => ({
          product_name: p.product_name, status: p.status,
          domain_name: p.domain_name, owner_email: p.owner_email,
        })),
      }
    }
    case 'lineage': {
      const assetsRes = await assetsApi.listEnriched({ limit: 20 })
      const assets = Array.isArray(assetsRes.data) ? assetsRes.data : (assetsRes.data?.items ?? [])
      return {
        topic: 'lineage',
        note: 'Lineage details require a specific table. Ask about a specific table name for upstream/downstream analysis.',
        registered_assets: assets.slice(0, 10).map((a: any) => ({
          sf_table_name: a.sf_table_name, sf_schema_name: a.sf_schema_name,
          domain_name: a.domain_name, criticality: a.criticality,
        })),
      }
    }
    case 'compliance': {
      const [frameworksRes, gapsRes] = await Promise.allSettled([
        complianceApi ? complianceApi.frameworks() : Promise.reject(),
        complianceApi ? complianceApi.gaps() : Promise.reject(),
      ])
      const frameworks = frameworksRes.status === 'fulfilled' ? (frameworksRes.value.data ?? []) : []
      const gaps = gapsRes.status === 'fulfilled' ? (gapsRes.value.data ?? []) : []
      return {
        topic: 'compliance',
        frameworks: frameworks.map((f: any) => ({ framework_name: f.framework_name, is_active: f.is_active })),
        compliance_gaps: gaps.slice(0, 10),
      }
    }
    case 'cost': {
      const [summaryRes, domainRes] = await Promise.allSettled([
        costApi.summary(),
        costApi.byDomain(),
      ])
      const summary = summaryRes.status === 'fulfilled' ? (summaryRes.value.data ?? {}) : {}
      const byDomain = domainRes.status === 'fulfilled' ? (domainRes.value.data ?? []) : []
      return {
        topic: 'cost',
        summary,
        by_domain: byDomain.slice(0, 10),
      }
    }
  }
  return {}
}

async function gatherContext(question: string): Promise<Record<string, any>> {
  const { intent, domainHint } = detectIntent(question)
  const diagnostic = isDiagnosticQuery(question)

  // Always fetch the primary context
  const fetches: Promise<any>[] = [
    fetchPrimaryContext(intent, domainHint, question)
      .then(d => ['_primary', d])
      .catch(e => ['_primary', { topic: intent, error: `Failed to load ${intent} data: ${e.message}` }]),
  ]

  // For diagnostic or domain/rules/assets/global questions, supplement with recent runs
  if (diagnostic || ['domains', 'rules', 'assets', 'global'].includes(intent)) {
    if (intent !== 'runs') {
      fetches.push(
        executionsApi.listRunsEnriched({ limit: 15 })
          .then(r => {
            let runs = r.data
            if (domainHint) runs = runs.filter((x: any) => (x.domain_name ?? '').toLowerCase().includes(domainHint))
            return ['supplementary_runs', runs.slice(0, 12).map((r: any) => ({
              rule_name: r.rule_name, sf_table_name: r.sf_table_name,
              domain_name: r.domain_name, status: r.status,
              quality_score: r.quality_score, severity: r.severity,
              failed_rows_count: r.failed_rows_count, created_at: r.created_at,
            }))]
          })
          .catch(() => ['supplementary_runs', []]),
      )
    }
  }

  // For diagnostic or domain/global questions, supplement with open alerts
  if (diagnostic || ['domains', 'global', 'governance'].includes(intent)) {
    if (intent !== 'alerts') {
      fetches.push(
        alertsApi.listEnriched({ limit: 15 })
          .then(r => {
            let alerts = (r.data ?? []).filter((a: any) => a.alert_status === 'open')
            if (domainHint) alerts = alerts.filter((a: any) => (a.domain_name ?? '').toLowerCase().includes(domainHint))
            return ['supplementary_alerts', alerts.slice(0, 10).map((a: any) => ({
              alert_message: a.alert_message, severity: a.severity,
              domain_name: a.domain_name, created_at: a.created_at,
            }))]
          })
          .catch(() => ['supplementary_alerts', []]),
      )
    }
  }

  // For governance/compliance/contract questions also pull domain scores for context
  if (['governance', 'contracts', 'compliance', 'incidents'].includes(intent)) {
    fetches.push(
      dashboardApi.domains()
        .then(r => ['supplementary_domain_scores', (r.data ?? []).map((d: any) => ({
          domain_name: d.domain_name,
          quality_score: d.quality_score,
          failed_rules: d.failed_rules,
        }))])
        .catch(() => ['supplementary_domain_scores', []]),
    )
  }

  const settled = await Promise.allSettled(fetches)
  const ctx: Record<string, any> = {}
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      const [key, value] = r.value
      if (key === '_primary') Object.assign(ctx, value)
      else ctx[key] = value
    }
  }
  return ctx
}

// ── Fallback markdown response (when LLM is unavailable) ─────────

function scoreIcon(s: number) { return s >= 95 ? '✅' : s >= 80 ? '🟡' : '❌' }
function cap(s: string)       { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

function generateFallback(ctx: Record<string, any>): string {
  if (ctx.error) return `⚠️ Could not load platform data.\n\n${ctx.error}`

  switch (ctx.topic) {
    case 'platform_overview': {
      const s = ctx.overall_quality_score
      const trend = (ctx.quality_trend_last_7_days ?? [])
        .map((t: any) => `| ${t.date} | ${t.score != null ? `**${t.score.toFixed(1)}%**` : '—'} |`)
        .join('\n')
      return [
        `### Platform Quality Overview`,
        ``,
        `Overall score: **${s != null ? s.toFixed(1) + '%' : '—'}** ${s != null ? scoreIcon(s) : ''}`,
        ``,
        `| Metric | Value |`,
        `|--------|-------|`,
        `| Domains monitored | ${ctx.total_domains ?? '—'} |`,
        `| Tables monitored | ${ctx.total_assets ?? '—'} |`,
        `| Active rules | ${ctx.total_active_rules ?? '—'} |`,
        `| Passed today | ✅ ${ctx.rules_passed_today ?? '—'} |`,
        `| Failed today | ❌ ${ctx.rules_failed_today ?? '—'} |`,
        `| Critical failures | 🔴 ${ctx.critical_failures ?? '—'} |`,
        `| Open alerts | 🔔 ${ctx.open_alerts ?? '—'} |`,
        ...(trend ? [``, `### 7-Day Trend`, `| Date | Score |`, `|------|-------|`, trend] : []),
        ``,
        `> ⚠️ *AI assistant unavailable — configure your LLM in **Settings → AI/LLM** for richer answers.*`,
      ].join('\n')
    }

    case 'domain_overview': {
      const domains: any[] = ctx.domains ?? []
      const sorted = [...domains].sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0))
      const rows = sorted.map(d =>
        `| ${scoreIcon(d.quality_score ?? 0)} ${d.domain_name} | **${(d.quality_score ?? 0).toFixed(1)}%** | ✅ ${d.passed_rules ?? 0} | ❌ ${d.failed_rules ?? 0} | ${d.total_assets ?? 0} |`
      ).join('\n')
      return [
        `### Domain Quality Scores`,
        ``,
        `| Domain | Score | Passed | Failed | Tables |`,
        `|--------|-------|--------|--------|--------|`,
        rows || `| No domain data | — | — | — | — |`,
        ``,
        `> ⚠️ *AI assistant unavailable — configure your LLM in **Settings → AI/LLM** for analysis.*`,
      ].join('\n')
    }

    case 'domain_detail': {
      const d = ctx.domain ?? {}
      const subs: any[] = d.subdomains ?? []
      const subRows = subs.map(s =>
        `| ${s.subdomain_name} | **${(s.quality_score ?? 0).toFixed(1)}%** ${scoreIcon(s.quality_score ?? 0)} | ${s.total_rules ?? 0} |`
      ).join('\n')
      return [
        `### ${d.domain_name ?? 'Domain'} — Quality Detail`,
        ``,
        `Overall score: **${(d.quality_score ?? 0).toFixed(1)}%** ${scoreIcon(d.quality_score ?? 0)}`,
        ``,
        `| Metric | Value |`,
        `|--------|-------|`,
        `| Total rules | ${d.total_rules ?? '—'} |`,
        `| Passed today | ✅ ${d.passed_rules ?? '—'} |`,
        `| Failed today | ❌ ${d.failed_rules ?? '—'} |`,
        ...(subs.length > 0 ? [
          ``,
          `### Subdomains`,
          `| Subdomain | Score | Rules |`,
          `|-----------|-------|-------|`,
          subRows,
        ] : []),
        ``,
        `> ⚠️ *AI assistant unavailable — configure your LLM in **Settings → AI/LLM**.*`,
      ].join('\n')
    }

    case 'rules': {
      const rules: any[] = ctx.rules ?? []
      const bySev = ['critical', 'high', 'medium', 'low'].map(s => {
        const n = rules.filter(r => r.severity === s).length
        return `| ${cap(s)} | ${n} |`
      }).join('\n')
      const failed = rules.filter(r => r.status === 'failed').slice(0, 8)
      const failRows = failed.map(r =>
        `| ❌ ${r.rule_name} | ${r.rule_type.replace(/_/g, ' ')} | ${r.domain_name ?? '—'} | ${r.severity} |`
      ).join('\n')
      return [
        `### Rules Overview (${ctx.total ?? rules.length} total)`,
        ``,
        `| Severity | Count |`,
        `|----------|-------|`,
        bySev,
        ...(failed.length > 0 ? [
          ``,
          `### Currently Failing Rules`,
          `| Rule | Type | Domain | Severity |`,
          `|------|------|--------|----------|`,
          failRows,
        ] : [``, `✅ No currently failing rules.`]),
        ``,
        `> ⚠️ *AI assistant unavailable — configure your LLM in **Settings → AI/LLM**.*`,
      ].join('\n')
    }

    case 'data_assets': {
      const assets: any[] = ctx.assets ?? []
      const rows = assets.slice(0, 12).map(a => {
        const path = [a.sf_schema_name, a.sf_table_name].filter(Boolean).join('.')
        const cert = a.certification_status === 'certified' ? '✅' : a.certification_status === 'warning' ? '⚠️' : '◯'
        return `| ${cert} ${path} | ${a.domain_name ?? '—'} | ${a.criticality ?? '—'} |`
      }).join('\n')
      return [
        `### Registered Data Assets (${ctx.total ?? assets.length} total)`,
        ``,
        `| Table | Domain | Criticality |`,
        `|-------|--------|-------------|`,
        rows || '| No assets registered | — | — |',
        ``,
        `> ⚠️ *AI assistant unavailable — configure your LLM in **Settings → AI/LLM**.*`,
      ].join('\n')
    }

    case 'schedules': {
      const schedules: any[] = ctx.schedules ?? []
      const active = schedules.filter(s => s.is_active !== false)
      const rows = active.slice(0, 12).map(s =>
        `| ${s.rule_name ?? s.schedule_level ?? 'Global'} | ${s.frequency ?? '—'} | ${s.schedule_level ?? '—'} |`
      ).join('\n')
      return [
        `### Active Schedules (${active.length} of ${ctx.total ?? schedules.length})`,
        ``,
        `| Name | Frequency | Level |`,
        `|------|-----------|-------|`,
        rows || '| No active schedules | — | — |',
        ``,
        `> ⚠️ *AI assistant unavailable — configure your LLM in **Settings → AI/LLM**.*`,
      ].join('\n')
    }

    case 'execution_runs': {
      const runs: any[] = ctx.runs ?? []
      const counts = { passed: 0, failed: 0, warning: 0, error: 0 }
      runs.forEach(r => { if (r.status in counts) counts[r.status as keyof typeof counts]++ })
      const rows = runs.slice(0, 10).map(r => {
        const icon = r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : r.status === 'warning' ? '⚠️' : '🔴'
        return `| ${icon} ${r.rule_name ?? '—'} | ${r.sf_table_name ?? '—'} | ${r.domain_name ?? '—'} | ${r.quality_score != null ? `**${r.quality_score.toFixed(0)}%**` : '—'} |`
      }).join('\n')
      return [
        `### Recent Execution Runs (${ctx.total ?? runs.length} loaded)`,
        ``,
        `✅ Passed: **${counts.passed}** · ❌ Failed: **${counts.failed}** · ⚠️ Warning: **${counts.warning}** · 🔴 Error: **${counts.error}**`,
        ``,
        `| Rule | Table | Domain | Score |`,
        `|------|-------|--------|-------|`,
        rows || '| No runs found | — | — | — |',
        ``,
        `> ⚠️ *AI assistant unavailable — configure your LLM in **Settings → AI/LLM**.*`,
      ].join('\n')
    }

    case 'alerts': {
      const alerts: any[] = ctx.alerts ?? []
      const open = alerts.filter(a => a.alert_status === 'open')
      const rows = open.slice(0, 10).map(a => {
        const icon = a.severity === 'critical' ? '🔴' : a.severity === 'high' ? '🟠' : '🟡'
        const msg = (a.alert_message ?? 'Alert triggered').slice(0, 50)
        return `| ${icon} ${cap(a.severity ?? '—')} | ${msg} | ${a.domain_name ?? '—'} |`
      }).join('\n')
      return [
        `### Open Alerts (${open.length} of ${ctx.total ?? alerts.length})`,
        ``,
        open.length === 0
          ? `✅ No open alerts — all clear!`
          : [`| Severity | Message | Domain |`, `|----------|---------|--------|`, rows].join('\n'),
        ``,
        `> ⚠️ *AI assistant unavailable — configure your LLM in **Settings → AI/LLM**.*`,
      ].join('\n')
    }

    case 'governance': {
      const violations: any[] = ctx.violations ?? []
      const scorecards: any[] = ctx.scorecards ?? []
      const sevOpen = violations.filter(v => v.status === 'open')
      const violRows = sevOpen.slice(0, 8).map(v =>
        `| ⚠️ ${v.policy_name ?? '—'} | ${v.entity_type ?? '—'} | ${(v.violation_detail ?? '').slice(0, 40)} |`
      ).join('\n')
      const scRows = scorecards.slice(0, 8).map(s =>
        `| ${s.domain_name ?? '—'} | **${(s.governance_score ?? 0).toFixed(0)}%** | ${(s.data_quality_score ?? 0).toFixed(0)}% | ${(s.documentation_score ?? 0).toFixed(0)}% | ${(s.ownership_score ?? 0).toFixed(0)}% |`
      ).join('\n')
      return [
        `### Governance Overview`,
        ``,
        `Open violations: **${ctx.open_violations ?? 0}**`,
        ``,
        ...(sevOpen.length > 0 ? [
          `### Open Policy Violations`,
          `| Policy | Entity | Detail |`,
          `|--------|--------|--------|`,
          violRows,
        ] : [`✅ No open governance violations.`]),
        ...(scorecards.length > 0 ? [
          ``,
          `### Governance Scorecards by Domain`,
          `| Domain | Governance | Quality | Docs | Ownership |`,
          `|--------|-----------|---------|------|-----------|`,
          scRows,
        ] : []),
        ``,
        `> ⚠️ *Configure LLM in **Settings → AI/LLM** for deeper analysis.*`,
      ].join('\n')
    }

    case 'contracts': {
      const contracts: any[] = ctx.contracts ?? []
      const violated = contracts.filter(c => c.status === 'violated')
      const rows = contracts.slice(0, 10).map(c => {
        const icon = c.status === 'violated' ? '🔴' : c.status === 'active' ? '✅' : '◯'
        return `| ${icon} ${c.contract_name ?? '—'} | ${c.asset_name ?? '—'} | ${cap(c.status ?? '—')} | ${c.min_quality_score != null ? `${c.min_quality_score}%` : '—'} |`
      }).join('\n')
      return [
        `### Data Contracts (${ctx.total ?? contracts.length} total)`,
        ``,
        violated.length > 0
          ? `🔴 **${violated.length} contract(s) currently violated** — check quality scores and schema compliance.`
          : `✅ All active contracts are compliant.`,
        ``,
        `| Contract | Table | Status | Min Quality |`,
        `|----------|-------|--------|-------------|`,
        rows || `| No contracts | — | — | — |`,
        ``,
        `> ⚠️ *Configure LLM in **Settings → AI/LLM** for contract analysis.*`,
      ].join('\n')
    }

    case 'incidents': {
      const incidents: any[] = ctx.incidents ?? []
      const stats = ctx.stats ?? {}
      const open = incidents.filter(i => i.status === 'open' || i.status === 'investigating')
      const rows = incidents.slice(0, 8).map(i => {
        const icon = i.severity === 'critical' ? '🔴' : i.severity === 'high' ? '🟠' : '🟡'
        return `| ${icon} ${(i.title ?? '—').slice(0, 35)} | ${i.asset_name ?? '—'} | ${cap(i.status ?? '—')} | ${i.ttr_minutes != null ? `${i.ttr_minutes}m` : '—'} |`
      }).join('\n')
      return [
        `### Quality Incidents`,
        ``,
        `Open / Investigating: **${open.length}**`,
        ...(stats.avg_mttd_minutes != null ? [`MTTD: **${stats.avg_mttd_minutes.toFixed(0)} min** · MTTR: **${(stats.avg_mttr_minutes ?? 0).toFixed(0)} min**`] : []),
        ``,
        `| Incident | Table | Status | TTR |`,
        `|----------|-------|--------|-----|`,
        rows || `| No incidents recorded | — | — | — |`,
        ``,
        `> ⚠️ *Configure LLM in **Settings → AI/LLM** for incident analysis.*`,
      ].join('\n')
    }

    case 'catalog': {
      const popular: any[] = ctx.popular_assets ?? []
      const products: any[] = ctx.data_products ?? []
      const assetRows = popular.slice(0, 8).map(a => {
        const cert = a.certification_status === 'certified' ? '✅' : '◯'
        return `| ${cert} ${a.sf_table_name ?? '—'} | ${a.domain_name ?? '—'} | ${a.view_count ?? 0} | ${a.trust_score != null ? `${a.trust_score.toFixed(0)}%` : '—'} |`
      }).join('\n')
      const prodRows = products.slice(0, 6).map(p =>
        `| ${p.product_name ?? '—'} | ${p.domain_name ?? '—'} | ${cap(p.status ?? '—')} |`
      ).join('\n')
      return [
        `### Data Catalog`,
        ``,
        `### Most Popular Assets`,
        `| Table | Domain | Views | Trust |`,
        `|-------|--------|-------|-------|`,
        assetRows || `| No usage data yet | — | — | — |`,
        ...(products.length > 0 ? [
          ``,
          `### Data Products`,
          `| Product | Domain | Status |`,
          `|---------|--------|--------|`,
          prodRows,
        ] : []),
        ``,
        `> ⚠️ *Configure LLM in **Settings → AI/LLM** for catalog analysis.*`,
      ].join('\n')
    }

    case 'lineage': {
      const assets: any[] = ctx.registered_assets ?? []
      const rows = assets.slice(0, 8).map(a =>
        `| ${a.sf_schema_name ?? '—'}.${a.sf_table_name ?? '—'} | ${a.domain_name ?? '—'} | ${a.criticality ?? '—'} |`
      ).join('\n')
      return [
        `### Data Lineage`,
        ``,
        ctx.note ?? '',
        ``,
        `### Registered Assets (sample)`,
        `| Table | Domain | Criticality |`,
        `|-------|--------|-------------|`,
        rows || `| No assets | — | — |`,
        ``,
        `> 💡 *Ask about a specific table (e.g. "lineage for revenue.invoices") for upstream/downstream detail.*`,
        `> ⚠️ *Configure LLM in **Settings → AI/LLM** for lineage analysis.*`,
      ].join('\n')
    }

    case 'compliance': {
      const frameworks: any[] = ctx.frameworks ?? []
      const gaps: any[] = ctx.compliance_gaps ?? []
      const fwRows = frameworks.map(f =>
        `| ${f.framework_name ?? '—'} | ${f.is_active ? '✅ Active' : '◯ Inactive'} |`
      ).join('\n')
      return [
        `### Compliance Overview`,
        ``,
        `### Supported Frameworks`,
        `| Framework | Status |`,
        `|-----------|--------|`,
        fwRows || `| No frameworks configured | — |`,
        ...(gaps.length > 0 ? [
          ``,
          `⚠️ **${gaps.length} compliance gap(s) detected** — run a full assessment from the Governance page.`,
        ] : [``, `✅ No compliance gaps detected.`]),
        ``,
        `> ⚠️ *Configure LLM in **Settings → AI/LLM** for compliance analysis.*`,
      ].join('\n')
    }

    case 'cost': {
      const summary = ctx.summary ?? {}
      const byDomain: any[] = ctx.by_domain ?? []
      const rows = byDomain.slice(0, 8).map(d =>
        `| ${d.domain_name ?? '—'} | ${d.total_cost != null ? `$${d.total_cost.toFixed(0)}` : '—'} | ${d.incident_count ?? 0} |`
      ).join('\n')
      return [
        `### Cost Impact of Bad Data`,
        ``,
        summary.total_cost != null
          ? `Total estimated cost this month: **$${summary.total_cost.toFixed(0)}**`
          : `Cost tracking not yet configured. Set cost-per-row in **Settings** for each table.`,
        ``,
        ...(byDomain.length > 0 ? [
          `### Cost by Domain`,
          `| Domain | Est. Cost | Incidents |`,
          `|--------|----------|-----------|`,
          rows,
        ] : []),
        ``,
        `> ⚠️ *Configure LLM in **Settings → AI/LLM** for ROI analysis.*`,
      ].join('\n')
    }

    default:
      return `> ⚠️ AI assistant is currently unavailable.\n\nTo enable AI-powered answers, configure your LLM provider in **Settings → AI/LLM**.\n\nSupported providers: Ollama (local), OpenAI, Claude, Gemini.`
  }
}

// ── SSE streaming to LLM ──────────────────────────────────────────

/** Returns true if the LLM responded successfully, false if it should fall back. */
async function streamFromLLM(
  question: string,
  context: Record<string, any>,
  history: { role: string; content: string }[],
  onToken: (t: string) => void,
  onDone: () => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null

  let resp: Response
  try {
    resp = await fetch(`${apiUrl}/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message: question, context, history }),
      signal,
    })
    // Non-2xx means the API itself is broken (misconfigured, server error)
    if (!resp.ok) {
      if (resp.status === 429) throw Object.assign(new Error('rate_limit'), { status: 429 })
      return false
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') { onDone(); return true }
    if (err?.status === 429) throw err
    return false
  }

  const reader = resp.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let gotContent = false

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const d = JSON.parse(line.slice(6))
          if (d.error) {
            // LLM-level error (e.g. Ollama not running, bad API key)
            onDone()
            return false
          }
          if (d.token) { onToken(d.token); gotContent = true }
          if (d.done)  { onDone(); return true }
        } catch { /* partial JSON */ }
      }
    }
  } catch (err: any) {
    onDone()
    if (err?.name === 'AbortError') return true
    return false
  }

  onDone()
  return gotContent
}

// ── Markdown renderer ─────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const TOKEN = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null
  let k = 0
  while ((match = TOKEN.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index))
    if (match[1] !== undefined)
      parts.push(<strong key={k++} className="font-semibold text-gray-900">{match[1]}</strong>)
    else if (match[2] !== undefined)
      parts.push(<em key={k++} className="italic">{match[2]}</em>)
    else if (match[3] !== undefined)
      parts.push(<code key={k++} className="bg-gray-100 text-blue-700 px-1 py-0.5 rounded text-[11px] font-mono">{match[3]}</code>)
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts.length ? <>{parts}</> : <>{text}</>
}

function MarkdownMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  const lines = content.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0
  let k = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      nodes.push(
        <pre key={k++} className="bg-gray-900 text-green-300 rounded-lg p-3 my-2 overflow-x-auto text-[11px] font-mono leading-relaxed whitespace-pre">
          {codeLines.join('\n')}
        </pre>
      )
      i++; continue
    }

    // Markdown table
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { tableLines.push(lines[i]); i++ }
      const dataRows = tableLines
        .filter(l => !/^\|[\s\-:|]+\|$/.test(l))
        .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      if (dataRows.length > 0) {
        const [header, ...body] = dataRows
        nodes.push(
          <div key={k++} className="overflow-x-auto my-2 rounded-lg border border-gray-200">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {header.map((h, ci) => (
                    <th key={ci} className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px] whitespace-nowrap">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {body.map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50/50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 text-gray-700">{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // Bullet list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2)); i++
      }
      nodes.push(
        <ul key={k++} className="my-1.5 space-y-1 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-1.5 text-xs text-gray-700 leading-relaxed">
              <span className="text-gray-400 mt-0.5 shrink-0 select-none">•</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      let n = 1
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, '')); i++
      }
      nodes.push(
        <ol key={k++} className="my-1.5 space-y-1 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-1.5 text-xs text-gray-700 leading-relaxed">
              <span className="text-blue-600 font-semibold shrink-0 mt-0.5 select-none">{ii + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Headings
    if (line.startsWith('### ')) {
      nodes.push(<h4 key={k++} className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mt-3 mb-1 border-b border-gray-100 pb-0.5">{renderInline(line.slice(4))}</h4>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      nodes.push(<h3 key={k++} className="text-xs font-bold text-gray-800 mt-3 mb-1">{renderInline(line.slice(3))}</h3>)
      i++; continue
    }
    if (line.startsWith('# ')) {
      nodes.push(<h2 key={k++} className="text-sm font-bold text-gray-900 mt-2 mb-1">{renderInline(line.slice(2))}</h2>)
      i++; continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      nodes.push(
        <blockquote key={k++} className="border-l-2 border-blue-300 pl-3 py-0.5 my-1.5 text-xs text-gray-600 italic">
          {renderInline(line.slice(2))}
        </blockquote>
      )
      i++; continue
    }

    // Horizontal rule
    if (line.trim() === '---' || line.trim() === '***') {
      nodes.push(<hr key={k++} className="border-gray-200 my-2" />)
      i++; continue
    }

    // Empty line — skip (spacing comes from parent gap)
    if (!line.trim()) { i++; continue }

    // Regular paragraph
    nodes.push(<p key={k++} className="text-xs text-gray-800 leading-relaxed">{renderInline(line)}</p>)
    i++
  }

  if (streaming) {
    nodes.push(
      <span key="cursor" className="inline-block w-0.5 h-3 bg-blue-500 ml-0.5 animate-pulse align-middle rounded-full" />
    )
  }

  return <div className="space-y-1">{nodes}</div>
}

// ── Rule Wizard (unchanged) ───────────────────────────────────────

function RuleWizard({ onClose, onSuccess }: {
  onClose: () => void
  onSuccess: (msg: string) => void
}) {
  const [data, setData]         = useState<WizardData>({ ...EMPTY_WIZARD })
  const [domains, setDomains]   = useState<DomainOption[]>([])
  const [subdomains, setSubdomains] = useState<SubdomainOption[]>([])
  const [assets, setAssets]     = useState<AssetOption[]>([])
  const [columns, setColumns]   = useState<ColumnOption[]>([])
  const [colLoading, setColLoading] = useState(false)
  const [sqlLoading, setSqlLoading] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const patch = (p: Partial<WizardData>) => setData(d => ({ ...d, ...p }))

  useEffect(() => {
    domainsApi.list().then(r => setDomains(r.data.filter((d: any) => d.is_active)))
      .catch(() => setError('Could not load domains'))
  }, [])
  useEffect(() => {
    if (!data.domain_id) return
    setSubdomains([])
    subdomainsApi.list(data.domain_id).then(r => setSubdomains(r.data.filter((s: any) => s.is_active)))
  }, [data.domain_id])
  useEffect(() => {
    if (!data.subdomain_id) return
    setAssets([])
    assetsApi.list({ subdomain_id: data.subdomain_id })
      .then(r => {
        const items = r.data?.items ?? r.data ?? []
        setAssets(Array.isArray(items) ? items.filter((a: any) => a.is_active !== false) : [])
      })
      .catch(() => setError('Could not load tables'))
  }, [data.subdomain_id])
  useEffect(() => {
    if (data.mode !== 'ai_suggest' || data.step !== 3) return
    const asset = assets.find(a => a.asset_id === data.asset_id)
    setLoading(true); setError('')
    aiApi.generateRules({ domain: data.domain_name, subdomain: data.subdomain_name, table_name: asset?.sf_table_name ?? data.asset_name })
      .then(r => patch({ suggestedRules: r.data.rules ?? [], step: 4 }))
      .catch(e => setError(e.response?.data?.detail ?? 'AI generation failed'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.step, data.mode])

  const saveManualRule = async () => {
    setSaving(true); setError('')
    try {
      const primaryColumn = data.target_columns[0] || undefined
      const multiCols = data.target_columns.length > 1 ? { columns: data.target_columns } : {}
      const ruleConfig = Object.keys({ ...data.ruleConfig, ...multiCols }).length > 0
        ? { ...data.ruleConfig, ...multiCols }
        : undefined
      const res = await rulesApi.create({
        rule_name: data.rule_name, rule_description: data.rule_description || undefined,
        domain_id: data.domain_id, subdomain_id: data.subdomain_id, asset_id: data.asset_id,
        rule_type: data.rule_type, target_column: primaryColumn, rule_config: ruleConfig,
        rule_sql: data.custom_sql || undefined, severity: data.severity, status: 'active',
      })
      const ruleId = res.data?.rule_id ?? res.data?.id ?? ''
      const link = ruleId ? ` [View rule →](/rules/${ruleId})` : ' View it in [/rules](/rules).'
      onSuccess(`Rule **${data.rule_name}** saved on **${data.asset_name}**.${link}`)
    } catch (e: any) { setError(e.response?.data?.detail ?? 'Failed to create rule'); setSaving(false) }
  }

  const saveSuggestedRule = async (rule: SuggestedRule, idx: number) => {
    try {
      await rulesApi.create({
        rule_name: rule.rule_name, rule_description: rule.rule_description || undefined,
        domain_id: data.domain_id, subdomain_id: data.subdomain_id, asset_id: data.asset_id,
        rule_type: rule.rule_type, target_column: rule.target_column || undefined,
        severity: rule.severity, status: 'active',
      })
      patch({ savedRuleIds: new Set([...data.savedRuleIds, idx]) })
    } catch (e: any) { setError(e.response?.data?.detail ?? `Failed to save "${rule.rule_name}"`) }
  }

  const autoName = (ruleType: string, col: string) => {
    const t = RULE_TYPES.find(r => r.value === ruleType)?.label.toLowerCase().replace(/ /g, '_') ?? ruleType
    return col ? `${col}_${t}` : t
  }

  function StepDomain() {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Select a domain</p>
        {domains.length === 0
          ? <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
          : <div className="grid grid-cols-2 gap-1.5">
              {domains.map(d => (
                <button key={d.domain_id}
                  onClick={() => patch({ domain_id: d.domain_id, domain_name: d.domain_name, subdomain_id: '', asset_id: '', step: 1 })}
                  className="text-left px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors font-medium">
                  {d.domain_name}
                </button>
              ))}
            </div>}
      </div>
    )
  }
  function StepSubdomain() {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">
          Subdomain in <span className="text-blue-600">{data.domain_name}</span>
        </p>
        {subdomains.length === 0
          ? <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
          : <div className="space-y-1">
              {subdomains.map(s => (
                <button key={s.subdomain_id}
                  onClick={() => patch({ subdomain_id: s.subdomain_id, subdomain_name: s.subdomain_name, asset_id: '', step: 2 })}
                  className="w-full text-left px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors">
                  {s.subdomain_name}
                </button>
              ))}
            </div>}
      </div>
    )
  }
  function StepAsset() {
    const selectAsset = (assetId: string) => {
      const a = assets.find(x => x.asset_id === assetId)
      if (!a) return
      patch({
        asset_id: a.asset_id, asset_name: `${a.sf_schema_name}.${a.sf_table_name}`,
        sf_schema_name: a.sf_schema_name, sf_table_name: a.sf_table_name,
        target_columns: [], ruleConfig: {},
      })
      setColLoading(true)
      assetsApi.columns(a.asset_id)
        .then(r => setColumns(r.data.columns ?? []))
        .catch(() => setColumns([]))
        .finally(() => setColLoading(false))
    }
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Table in <span className="text-blue-600">{data.subdomain_name}</span></p>
        {assets.length === 0
          ? <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
          : <>
              <select value={data.asset_id} onChange={e => selectAsset(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="">— select table —</option>
                {assets.map(a => (
                  <option key={a.asset_id} value={a.asset_id}>{a.sf_schema_name}.{a.sf_table_name}</option>
                ))}
              </select>
              {data.asset_id && (
                <button onClick={() => patch({ step: 3 })}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Continue <ChevronRight size={12} />
                </button>
              )}
            </>}
      </div>
    )
  }
  function StepRuleType() {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Rule type</p>
        <div className="grid grid-cols-2 gap-1.5">
          {RULE_TYPES.map(rt => (
            <button key={rt.value}
              onClick={() => patch({ rule_type: rt.value, ruleConfig: {}, target_columns: [], rule_name: autoName(rt.value, ''), step: 4 })}
              className={`text-left px-2.5 py-2 text-xs border rounded-lg transition-colors font-medium
                ${data.rule_type === rt.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'}`}>
              {rt.label}
            </button>
          ))}
        </div>
      </div>
    )
  }
  function WizardConfigFields() {
    const f = 'w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
    const l = 'text-xs font-semibold text-gray-500 block mb-1'
    const patchCfg = (key: string, val: any) => patch({ ruleConfig: { ...data.ruleConfig, [key]: val } })
    switch (data.rule_type) {
      case 'accepted_values_check':
        return (
          <div>
            <label className={l}>Accepted Values *</label>
            <input className={f}
              value={(data.ruleConfig.accepted_values || []).join(', ')}
              onChange={e => patchCfg('accepted_values', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
              placeholder="ACTIVE, INACTIVE, PENDING" />
            <p className="text-[10px] text-gray-400 mt-0.5">Comma-separated allowed values</p>
          </div>
        )
      case 'range_check':
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={l}>Min Value</label>
              <input type="number" className={f}
                value={data.ruleConfig.min_value ?? ''}
                onChange={e => patchCfg('min_value', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="0" />
            </div>
            <div>
              <label className={l}>Max Value</label>
              <input type="number" className={f}
                value={data.ruleConfig.max_value ?? ''}
                onChange={e => patchCfg('max_value', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="1000000" />
            </div>
          </div>
        )
      case 'freshness_check':
        return (
          <div>
            <label className={l}>Max Hours Since Last Update</label>
            <input type="number" className={f}
              value={data.ruleConfig.max_hours ?? 24}
              onChange={e => patchCfg('max_hours', Number(e.target.value))}
              placeholder="24" />
          </div>
        )
      case 'regex_check':
        return (
          <div>
            <label className={l}>Regex Pattern *</label>
            <input className={`${f} font-mono`}
              value={data.ruleConfig.pattern || ''}
              onChange={e => patchCfg('pattern', e.target.value)}
              placeholder="^[A-Za-z0-9._%+-]+@.*" />
          </div>
        )
      case 'referential_integrity_check':
        return (
          <div className="space-y-2">
            <div>
              <label className={l}>Reference Table *</label>
              <input className={f}
                value={data.ruleConfig.reference_table || ''}
                onChange={e => patchCfg('reference_table', e.target.value)}
                placeholder="schema.parent_table" />
            </div>
            <div>
              <label className={l}>Reference Column *</label>
              <input className={f}
                value={data.ruleConfig.reference_column || ''}
                onChange={e => patchCfg('reference_column', e.target.value)}
                placeholder="parent_id" />
            </div>
          </div>
        )
      case 'volume_check':
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={l}>Min Rows</label>
              <input type="number" className={f}
                value={data.ruleConfig.min_rows ?? ''}
                onChange={e => patchCfg('min_rows', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="100" />
            </div>
            <div>
              <label className={l}>Max Rows (opt)</label>
              <input type="number" className={f}
                value={data.ruleConfig.max_rows ?? ''}
                onChange={e => patchCfg('max_rows', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="—" />
            </div>
          </div>
        )
      case 'business_rule_check':
      case 'semantic_consistency_check':
        return (
          <div>
            <label className={l}>Condition *</label>
            <textarea className={`${f} font-mono text-[11px] resize-none`} rows={2}
              value={data.ruleConfig.condition || ''}
              onChange={e => patchCfg('condition', e.target.value)}
              placeholder="e.g. ship_date >= order_date" />
          </div>
        )
      case 'llm_semantic_check':
        return (
          <div>
            <label className={l}>Validation Prompt *</label>
            <textarea className={`${f} text-[11px] resize-none`} rows={3}
              value={data.ruleConfig.validation_prompt || ''}
              onChange={e => patchCfg('validation_prompt', e.target.value)}
              placeholder="Describe what the AI should validate…" />
          </div>
        )
      default:
        return null
    }
  }

  function StepDetails() {
    const needsCol = !NO_COLUMN_RULES.has(data.rule_type)
    const toggleCol = (col: string) => {
      const next = data.target_columns.includes(col)
        ? data.target_columns.filter(c => c !== col)
        : [...data.target_columns, col]
      patch({ target_columns: next, rule_name: autoName(data.rule_type, next[0] ?? '') })
    }
    return (
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Rule name *</label>
          <input value={data.rule_name} onChange={e => patch({ rule_name: e.target.value })}
            className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. invoice_id_not_null" />
        </div>
        {needsCol && (
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">
              Target column(s) <span className="ml-1 font-normal text-gray-400">(multi-select)</span>
            </label>
            {colLoading ? (
              <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin" /> Loading columns…
              </div>
            ) : columns.length > 0 ? (
              <>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                  {columns.map(col => {
                    const sel = data.target_columns.includes(col.column_name)
                    return (
                      <button key={col.column_name} onClick={() => toggleCol(col.column_name)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors border-b border-gray-100 last:border-0
                          ${sel ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors
                          ${sel ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                          {sel && <Check size={9} className="text-white" />}
                        </div>
                        <span className="font-medium truncate">{col.column_name}</span>
                        <span className="ml-auto text-[10px] text-gray-400 shrink-0">{col.data_type}</span>
                      </button>
                    )
                  })}
                </div>
                {data.target_columns.length > 0 && (
                  <p className="mt-1 text-[10px] text-blue-600">Selected: {data.target_columns.join(', ')}</p>
                )}
              </>
            ) : (
              <input value={data.target_columns[0] ?? ''}
                onChange={e => {
                  const col = e.target.value
                  patch({ target_columns: col ? [col] : [], rule_name: autoName(data.rule_type, col) })
                }}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="column_name" />
            )}
          </div>
        )}
        <WizardConfigFields />
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Severity</label>
          <div className="grid grid-cols-4 gap-1">
            {SEVERITIES.map(s => (
              <button key={s.value} onClick={() => patch({ severity: s.value as WizardData['severity'] })}
                className={`py-1.5 text-xs border rounded-lg font-medium transition-colors
                  ${data.severity === s.value ? s.cls + ' border-2' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Description</label>
          <textarea value={data.rule_description} onChange={e => patch({ rule_description: e.target.value })}
            rows={2} className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Optional" />
        </div>
      </div>
    )
  }
  const fetchSqlPreview = async () => {
    setSqlLoading(true); setError('')
    try {
      const multiCols = data.target_columns.length > 1 ? { columns: data.target_columns } : {}
      const ruleConfig = Object.keys({ ...data.ruleConfig, ...multiCols }).length > 0
        ? { ...data.ruleConfig, ...multiCols }
        : undefined
      const res = await rulesApi.previewSql({
        rule_type: data.rule_type, target_column: data.target_columns[0] || undefined,
        rule_config: ruleConfig, asset_id: data.asset_id,
      })
      patch({ generated_sql: res.data.sql, custom_sql: res.data.sql, sql_overridden: false })
    } catch (e: any) {
      setError(e.response?.data?.detail ?? 'Could not generate SQL preview')
    } finally { setSqlLoading(false) }
  }
  function StepSQLPreview() {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-500">Generated SQL</label>
          <div className="flex items-center gap-2">
            {data.sql_overridden && <span className="text-[10px] text-orange-600 font-medium">Custom override active</span>}
            <button onClick={fetchSqlPreview} disabled={sqlLoading}
              className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 disabled:opacity-50">
              {sqlLoading ? <><Loader2 size={10} className="animate-spin" /> Generating…</> : <>↻ Regenerate</>}
            </button>
          </div>
        </div>
        {sqlLoading ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
        ) : data.custom_sql ? (
          <>
            <textarea value={data.custom_sql}
              onChange={e => patch({ custom_sql: e.target.value, sql_overridden: e.target.value !== data.generated_sql })}
              rows={8} spellCheck={false}
              className="w-full px-3 py-2.5 text-[11px] font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y bg-gray-50"
              placeholder="SQL will appear here…" />
            {data.sql_overridden && (
              <button onClick={() => patch({ custom_sql: data.generated_sql, sql_overridden: false })}
                className="text-[10px] text-gray-500 hover:text-gray-700 underline">Reset to generated SQL</button>
            )}
          </>
        ) : (
          <div className="text-center py-6 space-y-2">
            <p className="text-xs text-gray-500">Click below to generate SQL for this rule.</p>
            <button onClick={fetchSqlPreview} className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Generate SQL</button>
          </div>
        )}
      </div>
    )
  }
  function StepConfirm() {
    const sev = SEVERITIES.find(s => s.value === data.severity)
    const colDisplay = data.target_columns.length > 0 ? data.target_columns.join(', ') : '—'
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500">Review & save</p>
        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
          {([
            ['Rule', data.rule_name],
            ['Type', RULE_TYPES.find(r => r.value === data.rule_type)?.label],
            ['Column(s)', colDisplay],
            ['Severity', data.severity],
            ['Table', data.asset_name],
            ['Domain', `${data.domain_name} › ${data.subdomain_name}`],
          ] as [string, string | undefined][]).map(([lbl, v]) => (
            <div key={lbl} className="flex justify-between gap-2">
              <span className="text-gray-500 shrink-0">{lbl}</span>
              <span className={`font-medium text-right truncate ${lbl === 'Severity' ? sev?.cls.split(' ')[2] : 'text-gray-800'}`}>{v}</span>
            </div>
          ))}
        </div>
        {data.custom_sql && (
          <div>
            <p className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
              SQL {data.sql_overridden && <span className="text-orange-500">(custom)</span>}
            </p>
            <pre className="text-[10px] font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap text-gray-700 max-h-28">
              {data.custom_sql}
            </pre>
          </div>
        )}
        <button onClick={saveManualRule} disabled={saving || !data.rule_name}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {saving ? 'Saving…' : 'Save Rule'}
        </button>
      </div>
    )
  }
  function StepAIGenerating() {
    return (
      <div className="flex flex-col items-center py-8 gap-3">
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
          <Sparkles size={20} className="text-blue-600 animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-gray-700">Generating rules…</p>
        <p className="text-xs text-gray-500 text-center">
          AI is analysing <strong>{data.asset_name}</strong> in {data.domain_name} › {data.subdomain_name}
        </p>
      </div>
    )
  }
  function StepAIResults() {
    if (data.suggestedRules.length === 0) return (
      <div className="text-center py-6">
        <p className="text-sm text-gray-500">No rules generated. Try a different table or check LLM settings.</p>
      </div>
    )
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 mb-1">
          {data.suggestedRules.length} rules suggested — save the ones you want
        </p>
        {data.suggestedRules.map((rule, idx) => {
          const saved = data.savedRuleIds.has(idx)
          const sev   = SEVERITIES.find(s => s.value === rule.severity)
          return (
            <div key={idx} className="border border-gray-200 rounded-lg p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{rule.rule_name}</p>
                  <p className="text-gray-500 mt-0.5">
                    {RULE_TYPES.find(r => r.value === rule.rule_type)?.label}
                    {rule.target_column ? ` · ${rule.target_column}` : ''}
                  </p>
                  {rule.rule_description && <p className="text-gray-400 mt-0.5 line-clamp-2">{rule.rule_description}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${sev?.cls ?? ''}`}>{rule.severity}</span>
                  <button onClick={() => !saved && saveSuggestedRule(rule, idx)} disabled={saved}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors
                      ${saved ? 'bg-green-100 text-green-700 cursor-default' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {saved ? <><Check size={9} /> Saved</> : <>Save</>}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {data.savedRuleIds.size > 0 && (
          <p className="text-xs text-green-600 text-center mt-1">
            {data.savedRuleIds.size} rule{data.savedRuleIds.size > 1 ? 's' : ''} saved ·{' '}
            <Link href="/rules" className="underline">View rules</Link>
          </p>
        )}
      </div>
    )
  }

  // NL (natural language) mode steps
  function StepNLDescribe() {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Describe the rule in plain English — the AI will convert it to a structured rule.</p>
        <textarea
          value={data.nl_description}
          onChange={e => patch({ nl_description: e.target.value })}
          rows={4}
          className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="e.g. Invoice amounts must always be positive and never exceed 10 million"
        />
        <p className="text-[10px] text-gray-400">Optional: select a table first (step 1) to help the AI generate accurate SQL.</p>
        {data.asset_id && (
          <p className="text-[10px] text-blue-600">Table: {data.asset_name}</p>
        )}
        <button
          onClick={async () => {
            if (!data.nl_description.trim()) return
            setLoading(true); setError('')
            try {
              const res = await aiApi.rulesFromNL({
                description: data.nl_description,
                asset_id: data.asset_id || undefined,
              })
              patch({ nl_result: res.data.rule_definition ?? res.data, step: 2 })
            } catch (e: any) {
              setError(e.response?.data?.detail ?? 'AI conversion failed — check LLM settings')
            } finally { setLoading(false) }
          }}
          disabled={!data.nl_description.trim() || loading}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <><Loader2 size={12} className="animate-spin" /> Converting…</> : <><Sparkles size={12} /> Convert to Rule</>}
        </button>
      </div>
    )
  }
  function StepNLResult() {
    const r = data.nl_result ?? {}
    const f = 'w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
    const l = 'text-xs font-semibold text-gray-500 block mb-1'
    const rtLabel = RULE_TYPES.find(t => t.value === (r.rule_type ?? data.rule_type))?.label
    const sev: WizardData['severity'] = (['critical', 'high', 'medium', 'low'].includes(r.severity) ? r.severity : data.severity) as WizardData['severity']
    if (!data.domain_id) {
      return <p className="text-xs text-gray-500 py-4 text-center">Please select a domain before saving.</p>
    }
    return (
      <div className="space-y-3">
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          AI generated the rule below — edit any field before saving.
        </p>
        <div>
          <label className={l}>Rule Type</label>
          <p className="text-xs font-medium text-gray-800">{rtLabel ?? r.rule_type ?? '—'}</p>
        </div>
        <div>
          <label className={l}>Rule Name *</label>
          <input className={f} value={data.rule_name || r.rule_name || ''} onChange={e => patch({ rule_name: e.target.value })} placeholder="e.g. invoice_amount_positive" />
        </div>
        <div>
          <label className={l}>Target Column</label>
          <input className={f} value={data.target_columns[0] ?? r.target_column ?? ''} onChange={e => patch({ target_columns: e.target.value ? [e.target.value] : [] })} placeholder="column_name" />
        </div>
        <div>
          <label className={l}>Severity</label>
          <div className="grid grid-cols-4 gap-1">
            {SEVERITIES.map(s => (
              <button key={s.value} onClick={() => patch({ severity: s.value as WizardData['severity'] })}
                className={`py-1.5 text-xs border rounded-lg font-medium transition-colors ${(data.severity || sev) === s.value ? s.cls + ' border-2' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {r.suggested_sql && (
          <div>
            <label className={l}>Generated SQL</label>
            <textarea value={data.custom_sql || r.suggested_sql} onChange={e => patch({ custom_sql: e.target.value })}
              rows={4} className={`${f} font-mono text-[11px] resize-y bg-gray-50`} />
          </div>
        )}
        <button
          onClick={async () => {
            setSaving(true); setError('')
            try {
              const ruleName = data.rule_name || r.rule_name || 'nl_rule'
            const col = data.target_columns[0] || r.target_column || undefined
              const res = await rulesApi.create({
                rule_name: ruleName, rule_description: r.rule_description || data.nl_description,
                domain_id: data.domain_id, subdomain_id: data.subdomain_id || undefined, asset_id: data.asset_id || undefined,
                rule_type: r.rule_type || 'custom_sql_check', target_column: col,
                rule_sql: data.custom_sql || r.suggested_sql || undefined,
                severity: data.severity || sev, status: 'active',
              })
              const ruleId = res.data?.rule_id ?? res.data?.id ?? ''
              const link = ruleId ? ` [View rule →](/rules/${ruleId})` : ''
              onSuccess(`Rule **${ruleName}** saved.${link}`)
            } catch (e: any) { setError(e.response?.data?.detail ?? 'Failed to save rule'); setSaving(false) }
          }}
          disabled={saving || !(data.rule_name || r.rule_name) || !data.domain_id}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : <><Check size={12} /> Save Rule</>}
        </button>
      </div>
    )
  }

  const MANUAL_STEPS = ['Domain', 'Subdomain', 'Table', 'Rule Type', 'Details', 'SQL', 'Confirm']
  const AI_STEPS     = ['Domain', 'Subdomain', 'Table', 'Generating', 'Results']
  const NL_STEPS     = ['Describe', 'Review & Save']
  const steps        = data.mode === 'ai_suggest' ? AI_STEPS : data.mode === 'nl' ? NL_STEPS : MANUAL_STEPS
  const isGenerating = data.mode === 'ai_suggest' && data.step === 3 && loading
  const goToSqlStep  = async () => {
    patch({ step: 5, custom_sql: '', generated_sql: '', sql_overridden: false })
    setTimeout(fetchSqlPreview, 50)
  }
  const canGoBack    = data.step > 0 && !(data.mode === 'ai_suggest' && data.step === 3) && !(data.mode === 'nl' && data.step === 1)
  const canGoNext    = data.mode === 'manual' && data.step === 4 && !!data.rule_name.trim()
  const canGoConfirm = data.mode === 'manual' && data.step === 5

  function renderStep() {
    if (data.mode === 'manual') {
      switch (data.step) {
        case 0: return <StepDomain />
        case 1: return <StepSubdomain />
        case 2: return <StepAsset />
        case 3: return <StepRuleType />
        case 4: return <StepDetails />
        case 5: return <StepSQLPreview />
        case 6: return <StepConfirm />
      }
    } else if (data.mode === 'nl') {
      switch (data.step) {
        case 0: return <StepNLDescribe />
        case 1: return <StepNLResult />
      }
    } else {
      switch (data.step) {
        case 0: return <StepDomain />
        case 1: return <StepSubdomain />
        case 2: return <StepAsset />
        case 3: return <StepAIGenerating />
        case 4: return <StepAIResults />
      }
    }
    return null
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 p-2 border-b border-gray-100 bg-gray-50">
        {([
          { mode: 'manual',     label: 'Manual',   icon: <Plus size={11} /> },
          { mode: 'ai_suggest', label: 'AI Schema', icon: <Sparkles size={11} /> },
          { mode: 'nl',         label: 'Describe',  icon: <Pencil size={11} /> },
        ] as { mode: WizardMode; label: string; icon: React.ReactNode }[]).map(({ mode: m, label, icon }) => (
          <button key={m} onClick={() => setData({ ...EMPTY_WIZARD, mode: m })}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-md font-medium transition-colors
              ${data.mode === m ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {icon} {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100">
        {steps.map((label, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors
              ${idx < data.step ? 'bg-green-500 text-white' : idx === data.step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
              {idx < data.step ? <Check size={9} /> : idx + 1}
            </div>
            <span className={`text-[9px] hidden sm:block ${idx === data.step ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>{label}</span>
            {idx < steps.length - 1 && <ChevronRight size={9} className="text-gray-300 mx-0.5" />}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {error && <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
        {isGenerating ? <StepAIGenerating /> : renderStep()}
      </div>
      <div className="border-t border-gray-100 px-3 py-2 flex gap-2">
        {data.step === 0
          ? <button onClick={onClose} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"><X size={11} /> Cancel</button>
          : canGoBack
          ? <button onClick={() => { patch({ step: data.step - 1 }); setError('') }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              <ArrowLeft size={11} /> Back
            </button>
          : <span />}
        {canGoNext && (
          <button onClick={goToSqlStep}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Preview SQL <ChevronRight size={11} />
          </button>
        )}
        {canGoConfirm && (
          <button onClick={() => patch({ step: 6 })}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Review & Save <ChevronRight size={11} />
          </button>
        )}
        {data.mode === 'ai_suggest' && data.step === 4 && data.savedRuleIds.size > 0 && (
          <button onClick={onClose} className="ml-auto text-xs text-blue-600 hover:underline">Done</button>
        )}
      </div>
    </div>
  )
}

// ── Copy button ───────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })}
      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-auto"
      title="Copy"
    >
      {copied ? <><CheckCircle size={11} className="text-green-500" /> Copied</> : <><Copy size={11} /> Copy</>}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────

const WELCOME_MSG: Message = {
  role: 'assistant',
  content: "Hi! I'm your **AI Copilot** — a superman data intelligence assistant with live access to every corner of this platform.\n\n**What I can answer:**\n\n- **Quality** — overall score, domain health, failing rules, trends\n- **Root Cause** — why quality dropped, which rules are breaking, patterns\n- **Governance** — policy violations, scorecards, uncertified tables, PII gaps\n- **Contracts** — data contracts, SLA violations, producer/consumer health\n- **Incidents** — open incidents, MTTD, MTTR, blast radius\n- **Catalog** — popular assets, data products, business glossary\n- **Lineage** — upstream/downstream dependencies, impact analysis\n- **Compliance** — GDPR, SOX, HIPAA framework gaps\n- **Cost** — bad data ROI, incident cost by domain\n- **Alerts** — open critical alerts, severity breakdowns\n\nTry: *\"Why did Revenue quality drop?\"* or *\"Which Finance tables failed this week?\"*",
}

type LLMStatus = { provider: string; ok: boolean; label: string }

export default function AIChatBot() {
  const [open,     setOpen]     = useState(false)
  const [view,     setView]     = useState<'chat' | 'wizard'>('chat')
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [unread,  setUnread]  = useState(0)
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null)
  const [rateCooldown, setRateCooldown] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const abortRef  = useRef<AbortController | null>(null)

  // Persist chat history to sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(HISTORY_KEY)
      if (stored) {
        const parsed: Message[] = JSON.parse(stored)
        if (parsed.length > 0) setMessages(parsed)
      }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try {
      const toStore = messages.slice(-20).map(m => ({ ...m, streaming: false }))
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(toStore))
    } catch { /* ignore */ }
  }, [messages])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => {
    if (open) {
      setUnread(0)
      if (view === 'chat') setTimeout(() => inputRef.current?.focus(), 150)
      // Check LLM status whenever panel is opened
      aiApi.checkModels().then(r => {
        const d = r.data
        const ok = d.model_installed !== false
        setLlmStatus({ provider: d.provider ?? 'ollama', ok, label: d.ollama_model ?? d.provider ?? 'AI' })
      }).catch(() => setLlmStatus({ provider: 'unknown', ok: false, label: 'Offline' }))
    }
  }, [open, view])

  // Rate-limit countdown
  useEffect(() => {
    if (rateCooldown <= 0) return
    const t = setTimeout(() => setRateCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [rateCooldown])

  // Listen for open-copilot event fired by the sidebar AI Copilot nav item
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('open-ai-copilot', handler)
    return () => window.removeEventListener('open-ai-copilot', handler)
  }, [])

  const stopGeneration = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
    setLoading(false)
    setMessages(m => {
      const last = m[m.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        return [...m.slice(0, -1), { ...last, content: (last.content || '…') + ' ▪', streaming: false }]
      }
      return m
    })
  }

  const send = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading || rateCooldown > 0) return
    setInput('')
    setMessages(m => [...m, { role: 'user', content: msg }])
    setLoading(true); setStreaming(true)

    // Add a placeholder streaming message immediately
    setMessages(m => [...m, { role: 'assistant', content: '', streaming: true }])

    abortRef.current = new AbortController()

    try {
      // 1. Fetch live platform context (always works regardless of LLM)
      const context = await gatherContext(msg)

      // Build conversation history from prior turns (last 4 exchanges = 8 messages)
      const history = messages
        .slice(-8)
        .filter(m => !m.streaming && m.content && m.role !== 'error')
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))

      // 2. Try streaming from LLM
      const llmOk = await streamFromLLM(
        msg,
        context,
        history,
        (token) => {
          setMessages(m => {
            const last = m[m.length - 1]
            if (last?.role === 'assistant') {
              return [...m.slice(0, -1), { ...last, content: last.content + token }]
            }
            return m
          })
        },
        () => {
          setStreaming(false)
          setMessages(m => {
            const last = m[m.length - 1]
            if (last?.role === 'assistant') return [...m.slice(0, -1), { ...last, streaming: false }]
            return m
          })
          if (!open) setUnread(u => u + 1)
        },
        abortRef.current.signal,
      )

      // 3. LLM unavailable — replace the empty placeholder with a formatted fallback
      if (!llmOk) {
        setStreaming(false)
        const fallback = generateFallback(context)
        setMessages(m => {
          const last = m[m.length - 1]
          if (last?.role === 'assistant') {
            return [...m.slice(0, -1), { role: 'assistant', content: fallback, streaming: false }]
          }
          return [...m, { role: 'assistant', content: fallback, streaming: false }]
        })
        if (!open) setUnread(u => u + 1)
      }
    } catch (e: any) {
      setStreaming(false)
      if ((e as any)?.status === 429) {
        setRateCooldown(10)
        setMessages(m => {
          const last = m[m.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            return [...m.slice(0, -1), { role: 'error', content: 'Too many requests — please wait a moment before sending another message.', streaming: false }]
          }
          return m
        })
      } else {
        const msg2 = e.message ?? 'Unexpected error'
        setMessages(m => {
          const last = m[m.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            return [...m.slice(0, -1), { role: 'assistant', content: `> ⚠️ ${msg2}\n\nConfigure your LLM in **Settings → AI/LLM**.`, streaming: false }]
          }
          return m
        })
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const handleWizardSuccess = (msg: string) => {
    setView('chat')
    setMessages(m => [...m, { role: 'assistant', content: `✅ ${msg}` }])
  }

  const explainFailure = async (runId: string, ruleId: string, ruleName: string) => {
    setMessages(m => [...m, { role: 'assistant', content: `Explaining failure for **${ruleName}**…`, streaming: true }])
    setLoading(true); setStreaming(true)
    try {
      const res = await aiApi.explainFailure({ run_id: runId, rule_id: ruleId })
      const explanation = res.data?.explanation ?? 'No explanation returned.'
      setMessages(m => {
        const last = m[m.length - 1]
        if (last?.streaming) return [...m.slice(0, -1), { role: 'assistant', content: explanation, streaming: false }]
        return m
      })
    } catch (e: any) {
      setMessages(m => {
        const last = m[m.length - 1]
        if (last?.streaming) return [...m.slice(0, -1), { role: 'assistant', content: `> ⚠️ Could not explain failure: ${e.response?.data?.detail ?? e.message}`, streaming: false }]
        return m
      })
    } finally { setLoading(false); setStreaming(false) }
  }

  const clearHistory = () => {
    sessionStorage.removeItem(HISTORY_KEY)
    setMessages([WELCOME_MSG])
  }

  return (
    <>
      {/* ── Panel ── */}
      <div className={`ai-chatbot-panel ${open ? 'ai-chatbot-panel--open' : ''}`} role="dialog" aria-label="AI Copilot">

        {/* Header */}
        <div className="ai-chatbot-header">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-white leading-tight">AI Copilot</p>
                {llmStatus ? (
                  <Link href="/settings?tab=llm" onClick={() => setOpen(false)}
                    title={llmStatus.ok ? `${llmStatus.provider}: ${llmStatus.label}` : 'LLM offline — click to configure'}
                    className="flex items-center gap-0.5 text-[9px] bg-white/15 text-blue-100 px-1.5 py-0.5 rounded-full font-semibold hover:bg-white/25 transition-colors">
                    <span className={`w-1.5 h-1.5 rounded-full ${llmStatus.ok ? 'bg-green-400' : 'bg-red-400'}`} />
                    {llmStatus.ok ? llmStatus.label : 'Offline'}
                  </Link>
                ) : (
                  <span className="flex items-center gap-0.5 text-[9px] bg-white/15 text-blue-100 px-1.5 py-0.5 rounded-full font-semibold">
                    <Zap size={8} /> quick access
                  </span>
                )}
              </div>
              <p className="text-[11px] text-blue-200 mt-0.5 leading-none">
                {view === 'wizard' ? 'Rule Creation Wizard' : 'Live data · multi-source · conversation memory'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {view === 'wizard' && (
              <button onClick={() => setView('chat')}
                className="flex items-center gap-1 text-xs text-blue-100 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-colors">
                ← Chat
              </button>
            )}
            {view === 'chat' && (
              <button onClick={clearHistory} title="Clear conversation"
                className="w-7 h-7 flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <Trash2 size={13} />
              </button>
            )}
            {/* Link to the full-page AI Assistant for deeper conversations */}
            <Link href="/ai-assistant" onClick={() => setOpen(false)}
              title="Open full-page AI Assistant"
              className="w-7 h-7 flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <ArrowLeft size={14} className="rotate-[135deg]" />
            </Link>
            <button onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Wizard */}
        {view === 'wizard' && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <RuleWizard onClose={() => setView('chat')} onSuccess={handleWizardSuccess} />
          </div>
        )}

        {/* Chat */}
        {view === 'chat' && (
          <>
            {/* Toolbar */}
            <div className="ai-chatbot-toolbar">
              <button onClick={() => setView('wizard')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">
                <Plus size={12} /> Create Rule
              </button>
              <div className="flex-1" />
              <span className="text-[10px] text-gray-400 font-medium">Live data · LLM formatted</span>
            </div>

            {/* Quick-query chips */}
            <div className="ai-chatbot-chips">
              {CHAT_EXAMPLES.map(ex => (
                <button key={ex} onClick={() => send(ex)}
                  className="px-2.5 py-1 text-[11px] bg-white border border-gray-200 text-gray-600 rounded-full hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors whitespace-nowrap">
                  {ex}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="ai-chatbot-messages">
              {messages.map((msg, i) => {
                if (msg.role === 'user') return (
                  <div key={i} className="flex justify-end">
                    <div className="flex items-end gap-2 max-w-[82%]">
                      <div className="bg-blue-600 text-white text-xs leading-relaxed px-3.5 py-2.5 rounded-2xl rounded-br-sm">
                        {msg.content}
                      </div>
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mb-0.5">
                        <User size={11} className="text-blue-600" />
                      </div>
                    </div>
                  </div>
                )

                if (msg.role === 'error') return (
                  <div key={i} className="flex gap-2 items-start">
                    <AlertCircle size={14} className="text-orange-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">{msg.content}</p>
                  </div>
                )

                // Detect failing runs embedded in context for Explain action
                const prevUser = messages[i - 1]
                const isAssistantWithRuns = msg.role === 'assistant' && !msg.streaming && prevUser?.role === 'user'

                // Assistant message — rendered markdown
                return (
                  <div key={i} className="flex gap-2.5 items-start">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${msg.streaming ? 'bg-blue-100' : 'bg-blue-50'}`}>
                      {msg.streaming
                        ? <Loader2 size={13} className="text-blue-500 animate-spin" />
                        : <Bot size={13} className="text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm">
                        {msg.content || msg.streaming
                          ? <>
                              <MarkdownMessage content={msg.content} streaming={msg.streaming} />
                              {!msg.streaming && msg.content && (
                                <div className="mt-2 pt-1.5 border-t border-gray-100 flex items-center">
                                  <span className="flex items-center gap-1 text-[10px] text-gray-400">
                                    <Zap size={9} /> AI · live data
                                  </span>
                                  <CopyButton text={msg.content} />
                                </div>
                              )}
                            </>
                          : <span className="text-xs text-gray-400 italic">Thinking…</span>}
                      </div>
                    </div>
                  </div>
                )
              })}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="ai-chatbot-input flex-col gap-1">
              <div className="flex gap-2 w-full">
                <input ref={inputRef} type="text" value={input}
                  onChange={e => setInput(e.target.value.slice(0, INPUT_MAX))}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Ask about quality, governance, contracts, incidents…"
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
                {streaming ? (
                  <button onClick={stopGeneration} title="Stop generation"
                    className="w-9 h-9 flex items-center justify-center bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shrink-0">
                    <Square size={14} />
                  </button>
                ) : (
                  <button onClick={() => send()} disabled={!input.trim() || loading || rateCooldown > 0 || input.length >= INPUT_MAX}
                    className="w-9 h-9 flex items-center justify-center bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : rateCooldown > 0 ? <span className="text-[10px] font-bold">{rateCooldown}s</span> : <Send size={15} />}
                  </button>
                )}
              </div>
              {input.length > 800 && (
                <p className={`text-[10px] text-right pr-1 ${input.length >= INPUT_MAX ? 'text-red-500 font-semibold' : input.length >= 950 ? 'text-orange-500' : 'text-gray-400'}`}>
                  {input.length} / {INPUT_MAX}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Trigger button */}
      {/* Floating trigger — labeled "AI Copilot" to distinguish from the full /ai-assistant page */}
      <button
        onClick={() => setOpen(o => !o)}
        className="ai-chatbot-trigger"
        aria-label="Open AI Copilot (quick access)"
        title={open ? 'Close AI Copilot' : 'AI Copilot — rule wizard & quick questions'}
      >
        {open ? <Minimize2 size={19} className="text-white" /> : <MessageSquare size={19} className="text-white" />}
        {!open && unread > 0 && <span className="ai-chatbot-badge">{unread}</span>}
      </button>

      {/* Mobile backdrop */}
      <div className={`ai-chatbot-backdrop ${open ? 'block' : 'hidden'}`} onClick={() => setOpen(false)} aria-hidden />
    </>
  )
}
