export interface Domain {
  domain_id: string
  domain_name: string
  description?: string
  owner_name?: string
  owner_email?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Subdomain {
  subdomain_id: string
  domain_id: string
  subdomain_name: string
  description?: string
  owner_name?: string
  owner_email?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DataAsset {
  asset_id: string
  domain_id: string
  subdomain_id: string
  sf_schema_name: string
  sf_table_name: string
  sf_database_name?: string
  table_description?: string
  owner_name?: string
  owner_email?: string
  criticality: 'critical' | 'high' | 'medium' | 'low'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DQRule {
  rule_id: string
  rule_name: string
  rule_description?: string
  domain_id: string
  subdomain_id: string
  asset_id: string
  rule_type: string
  target_column?: string
  rule_sql?: string
  rule_config?: Record<string, unknown>
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: string
  is_active: boolean
  created_by?: string
  approved_by?: string
  created_at: string
  updated_at: string
}

export interface DQRuleRun {
  run_id: string
  rule_id: string
  asset_id: string
  domain_id: string
  subdomain_id: string
  execution_start_time?: string
  execution_end_time?: string
  status: 'passed' | 'failed' | 'warning' | 'error' | 'skipped'
  total_rows_scanned?: number
  failed_rows_count?: number
  passed_rows_count?: number
  failure_percentage?: number
  quality_score?: number
  error_message?: string
  executed_sql?: string
  ai_explanation?: string
  created_at: string
}

export interface DimensionScores {
  completeness:  number | null
  freshness:     number | null
  consistency:   number | null
  accuracy:      number | null
  business_rule: number | null
}

export interface TrendResponse {
  days:  number
  trend: Array<{ date: string; score: number | null; total: number; passed: number }>
}

export interface GlobalDashboard {
  overall_quality_score: number
  total_domains: number
  total_assets: number
  total_active_rules: number
  rules_passed_today: number
  rules_failed_today: number
  critical_failures: number
  open_alerts: number
  quality_trend: Array<{ date: string; score: number | null; total: number; passed: number }>
  sla_breaches: { table_name: string; schema_name: string; domain_name: string; score: number; days_below_sla: number }[]
  at_risk_tables: { table_name: string; schema_name: string; domain_name: string; score: number; score_delta: number }[]
  recently_fixed: { rule_name: string; table_name: string; domain_name: string; fixed_at: string; new_score: number }[]
}

export interface DomainSummary {
  domain_id: string
  domain_name: string
  quality_score: number
  total_rules: number
  passed_rules: number
  failed_rules: number
  total_assets: number
}

export interface DomainDashboard {
  domain_id:         string
  domain_name:       string
  quality_score:     number
  total_rules:       number
  passed_rules:      number
  failed_rules:      number
  critical_failures: number
  subdomains: {
    subdomain_id:   string
    subdomain_name: string
    quality_score:  number
    total_rules:    number
    asset_count:    number
  }[]
  quality_trend: Array<{ date: string; score: number | null; total: number; passed: number }>
  top_failing_rules: { run_id: string; rule_id: string; status: string; failed_rows: number }[]
  at_risk_tables: { table_name: string; schema_name: string; domain_name: string; score: number; score_delta: number }[]
  sla_breaches: { table_name: string; schema_name: string; domain_name: string; score: number; days_below_sla: number }[]
}

export interface Alert {
  alert_id: string
  rule_id: string
  run_id: string
  domain_id: string
  asset_id: string
  severity: string
  alert_status: string
  alert_message?: string
  created_at: string
}
