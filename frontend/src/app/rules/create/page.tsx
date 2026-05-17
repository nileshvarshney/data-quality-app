'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { rulesApi, domainsApi, subdomainsApi, assetsApi, executionsApi } from '@/services/apiClient'
import { ArrowLeft, ChevronDown, RefreshCw, X, Play, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react'
import Link from 'next/link'

// ── Constants ────────────────────────────────────────────────────────────────

const RULE_TYPES = [
  // Standard checks
  { value: 'null_check',                    label: 'Null Check' },
  { value: 'uniqueness_check',              label: 'Uniqueness Check' },
  { value: 'duplicate_check',              label: 'Duplicate Check' },
  { value: 'accepted_values_check',        label: 'Accepted Values Check' },
  { value: 'range_check',                  label: 'Range Check' },
  { value: 'freshness_check',              label: 'Freshness Check' },
  { value: 'volume_check',                 label: 'Volume Check' },
  { value: 'schema_drift_check',           label: 'Schema Drift Check' },
  { value: 'referential_integrity_check',  label: 'Referential Integrity Check' },
  { value: 'regex_check',                  label: 'Regex Check' },
  { value: 'business_rule_check',          label: 'Business Rule Check' },
  { value: 'custom_sql_check',             label: 'Custom SQL Check' },
  // §66 Semantic & Contextual checks
  { value: 'semantic_consistency_check',    label: 'Semantic Consistency (NL condition)' },
  { value: 'business_metric_check',         label: 'Business Metric Check (KPI bounds)' },
  { value: 'referential_sanity_check',      label: 'Referential Sanity (cross-table logic)' },
  { value: 'distribution_consistency_check', label: 'Distribution Consistency (PSI/drift)' },
  { value: 'llm_semantic_check',            label: 'LLM Semantic Check (AI-validated)' },
]

// Rule types where target column is not required
const NO_COLUMN_RULES = new Set([
  'volume_check', 'schema_drift_check', 'custom_sql_check', 'business_rule_check',
  'semantic_consistency_check', 'business_metric_check', 'referential_sanity_check',
  'llm_semantic_check',
])

// Rule types that allow selecting multiple columns
const MULTI_COLUMN_RULES = new Set([
  'null_check', 'uniqueness_check', 'duplicate_check',
])

// ── Utilities ────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function generateRuleName(schema: string, table: string, columns: string[], ruleType: string): string {
  // Up to 3 columns to keep name readable
  const parts = [schema, table, ...columns.slice(0, 3), ruleType]
  return parts.map(slugify).filter(Boolean).join('_').slice(0, 120)
}

const DESC_TEMPLATES: Record<string, (cols: string, tbl: string) => string> = {
  null_check:                    (c, t) => `Ensures ${c} has no null values in ${t}`,
  uniqueness_check:              (c, t) => `Ensures ${c} is unique in ${t}`,
  duplicate_check:               (c, t) => `Detects duplicate values in ${c} within ${t}`,
  accepted_values_check:         (c, t) => `Validates ${c} contains only accepted values in ${t}`,
  range_check:                   (c, t) => `Validates ${c} is within the expected numeric range in ${t}`,
  freshness_check:               (c, t) => `Ensures data via ${c} in ${t} is refreshed within the SLA window`,
  volume_check:                  (_, t) => `Monitors row count volume in ${t} for anomalies`,
  schema_drift_check:            (_, t) => `Detects unexpected schema changes in ${t}`,
  referential_integrity_check:   (c, t) => `Validates ${c} references are intact in ${t}`,
  regex_check:                   (c, t) => `Validates ${c} matches the expected pattern in ${t}`,
  business_rule_check:           (_, t) => `Applies custom business logic validation on ${t}`,
  custom_sql_check:              (_, t) => `Custom SQL-based data quality check on ${t}`,
}

function generateDescription(ruleType: string, columns: string[], schema: string, table: string): string {
  const colStr = columns.length > 0 ? columns.join(', ') : 'column'
  const tbl = [schema, table].filter(Boolean).join('.')
  const tmpl = DESC_TEMPLATES[ruleType]
  return tmpl ? tmpl(colStr, tbl) : `Data quality check on ${tbl}`
}

// ── Rule-type config fields (rendered based on selected rule type) ────────────

function RuleConfigFields({
  ruleType, config, setConfig, inputCls, labelCls,
  acceptedValuesStr, onAcceptedValuesChange,
  expectedColumnsStr, onExpectedColumnsChange,
}: {
  ruleType: string
  config: Record<string, any>
  setConfig: (key: string, val: any) => void
  inputCls: string
  labelCls: string
  acceptedValuesStr?: string
  onAcceptedValuesChange?: (s: string) => void
  expectedColumnsStr?: string
  onExpectedColumnsChange?: (s: string) => void
}) {
  const parseRangeValue = (v: string) => {
    if (v === '') return undefined
    const n = Number(v)
    return isNaN(n) ? v : n
  }

  switch (ruleType) {
    case 'accepted_values_check':
      return (
        <div>
          <label className={labelCls}>Accepted Values *</label>
          <input
            className={inputCls}
            value={acceptedValuesStr ?? (config.accepted_values || []).join(', ')}
            onChange={e => onAcceptedValuesChange?.(e.target.value)}
            onBlur={e => setConfig('accepted_values', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
            placeholder="ACTIVE, INACTIVE, PENDING"
          />
          <p className="text-xs text-gray-400 mt-1">
            Comma-separated list of allowed values
            {acceptedValuesStr && ` · ${acceptedValuesStr.split(',').map(s => s.trim()).filter(Boolean).length} value(s)`}
          </p>
        </div>
      )
    case 'range_check':
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Min Value</label>
            <input className={inputCls}
              value={config.min_value ?? ''}
              onChange={e => setConfig('min_value', parseRangeValue(e.target.value))}
              placeholder="0 or 2024-01-01" />
          </div>
          <div>
            <label className={labelCls}>Max Value</label>
            <input className={inputCls}
              value={config.max_value ?? ''}
              onChange={e => setConfig('max_value', parseRangeValue(e.target.value))}
              placeholder="1000000 or 2024-12-31" />
          </div>
        </div>
      )
    case 'freshness_check':
      return (
        <div>
          <label className={labelCls}>Max Hours Since Last Update</label>
          <input type="number" className={inputCls}
            value={config.max_hours ?? 24}
            onChange={e => setConfig('max_hours', Number(e.target.value))}
            placeholder="24" />
        </div>
      )
    case 'referential_integrity_check':
      return (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Reference Table *</label>
            <input className={inputCls}
              value={config.reference_table || ''}
              onChange={e => setConfig('reference_table', e.target.value)}
              placeholder="schema.parent_table" />
          </div>
          <div>
            <label className={labelCls}>Reference Column *</label>
            <input className={inputCls}
              value={config.reference_column || ''}
              onChange={e => setConfig('reference_column', e.target.value)}
              placeholder="parent_id" />
          </div>
        </div>
      )
    case 'regex_check':
      return (
        <div>
          <label className={labelCls}>Regex Pattern *</label>
          <input className={`${inputCls} font-mono`}
            value={config.pattern || ''}
            onChange={e => setConfig('pattern', e.target.value)}
            placeholder="^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$" />
        </div>
      )
    case 'business_rule_check':
      return (
        <div>
          <label className={labelCls}>Business Condition *</label>
          <textarea className={`${inputCls} font-mono text-xs`} rows={3}
            value={config.condition || ''}
            onChange={e => setConfig('condition', e.target.value)}
            placeholder="ship_date >= order_date" />
          <p className="text-xs text-gray-400 mt-1">SQL WHERE condition (without the WHERE keyword)</p>
        </div>
      )
    case 'volume_check':
      return (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Date Column</label>
            <input className={inputCls}
              value={config.date_column || ''}
              onChange={e => setConfig('date_column', e.target.value)}
              placeholder="created_at" />
            <p className="text-xs text-gray-400 mt-1">Column used to filter today&apos;s rows (leave blank to count all rows)</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Min Rows</label>
              <input type="number" className={inputCls}
                value={config.min_rows ?? ''}
                onChange={e => setConfig('min_rows', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="e.g. 1000" />
            </div>
            <div>
              <label className={labelCls}>Max Rows</label>
              <input type="number" className={inputCls}
                value={config.max_rows ?? ''}
                onChange={e => setConfig('max_rows', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="e.g. 1000000" />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            If neither min nor max is set, the rule compares against the 7-run historical average (±30% tolerance).
          </p>
        </div>
      )
    case 'schema_drift_check':
      return (
        <div>
          <label className={labelCls}>Expected Columns</label>
          <input className={inputCls}
            value={expectedColumnsStr ?? (config.expected_columns || []).join(', ')}
            onChange={e => onExpectedColumnsChange?.(e.target.value)}
            onBlur={e => setConfig('expected_columns', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
            placeholder="id, name, email, created_at" />
          <p className="text-xs text-gray-400 mt-1">Comma-separated list of expected column names</p>
        </div>
      )
    case 'semantic_consistency_check':
      return (
        <div>
          <label className={labelCls}>Consistency Condition</label>
          <textarea className={inputCls} rows={2}
            value={config.condition || ''}
            onChange={e => setConfig('condition', e.target.value)}
            placeholder="end_date >= start_date AND qty > 0" />
          <p className="text-xs text-gray-400 mt-1">SQL expression that must be TRUE for valid rows</p>
        </div>
      )
    case 'referential_sanity_check':
      return (
        <div>
          <label className={labelCls}>Sanity Condition</label>
          <textarea className={inputCls} rows={2}
            value={config.condition || ''}
            onChange={e => setConfig('condition', e.target.value)}
            placeholder="order_status IN ('OPEN','CLOSED','CANCELLED')" />
          <p className="text-xs text-gray-400 mt-1">Rows matching this condition are considered invalid</p>
        </div>
      )
    case 'business_metric_check':
      return (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Metric SQL *</label>
            <input className={inputCls}
              value={config.metric_sql || ''}
              onChange={e => setConfig('metric_sql', e.target.value)}
              placeholder="AVG(order_amount)" />
            <p className="text-xs text-gray-400 mt-1">Aggregate SQL expression evaluated against the full table</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Min Value</label>
              <input type="number" className={inputCls}
                value={config.min_value ?? ''}
                onChange={e => setConfig('min_value', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="50" />
            </div>
            <div>
              <label className={labelCls}>Max Value</label>
              <input type="number" className={inputCls}
                value={config.max_value ?? ''}
                onChange={e => setConfig('max_value', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="10000" />
            </div>
          </div>
        </div>
      )
    case 'distribution_consistency_check':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Baseline Mean</label>
              <input type="number" className={inputCls}
                value={config.baseline_mean ?? ''}
                onChange={e => setConfig('baseline_mean', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="100.0" />
            </div>
            <div>
              <label className={labelCls}>Baseline Std Dev</label>
              <input type="number" className={inputCls}
                value={config.baseline_std ?? ''}
                onChange={e => setConfig('baseline_std', e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="15.0" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Tolerance %</label>
            <input type="number" className={inputCls}
              value={config.tolerance_pct ?? 20}
              onChange={e => setConfig('tolerance_pct', Number(e.target.value))}
              placeholder="20" />
            <p className="text-xs text-gray-400 mt-1">Acceptable deviation from baseline mean (default 20%)</p>
          </div>
        </div>
      )
    case 'llm_semantic_check':
      return (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Sample Size</label>
            <input type="number" className={inputCls}
              value={config.sample_size ?? 100}
              onChange={e => setConfig('sample_size', Number(e.target.value))}
              placeholder="100" />
            <p className="text-xs text-gray-400 mt-1">Number of rows to send to the LLM for evaluation</p>
          </div>
          <div>
            <label className={labelCls}>Validation Prompt</label>
            <textarea className={inputCls} rows={3}
              value={config.validation_prompt || ''}
              onChange={e => setConfig('validation_prompt', e.target.value)}
              placeholder="Check that each row represents a valid and complete customer record..." />
          </div>
        </div>
      )
    default:
      return null
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CreateRulePage() {
  const router = useRouter()

  // Cascade dropdown data
  const [domains, setDomains]   = useState<any[]>([])
  const [subdomains, setSubdomains] = useState<any[]>([])
  const [assets, setAssets]     = useState<any[]>([])
  const [selectedAsset, setSelectedAsset] = useState<any>(null)

  // Column picker
  const [availableColumns, setAvailableColumns] = useState<any[]>([])
  const [columnsLoading, setColumnsLoading] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [colOpen, setColOpen]   = useState(false)
  const [colSearch, setColSearch] = useState('')
  const colRef = useRef<HTMLDivElement>(null)

  // Core form
  const [form, setForm] = useState({
    domain_id: '', subdomain_id: '', asset_id: '',
    rule_type: 'null_check', severity: 'medium', status: 'draft',
    rule_name: '', rule_description: '', rule_sql: '',
  })

  // Rule-type-specific config (accepted_values, range, etc.)
  const [ruleConfig, setRuleConfig] = useState<Record<string, any>>({})
  // Local string for accepted_values so commas can be typed freely
  const [acceptedValuesStr, setAcceptedValuesStr] = useState('')
  // Local string for expected_columns so commas can be typed freely
  const [expectedColumnsStr, setExpectedColumnsStr] = useState('')

  // Track if user has manually edited the auto-generated fields
  const nameManual = useRef(false)
  const descManual = useRef(false)

  // UI state
  const [sqlGenerating, setSqlGenerating] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  // Test rule state
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    status: string
    quality_score: number | null
    total_rows_scanned: number | null
    failed_rows_count: number | null
    passed_rows_count: number | null
    failure_percentage: number | null
    executed_sql: string
    duration_ms: number
    issues: string[]
    sample_rows?: Record<string, any>[]
  } | null>(null)
  const [testError, setTestError] = useState('')

  // ── Close column dropdown on outside click ────────────────────────────────
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (colRef.current && !colRef.current.contains(e.target as Node)) setColOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // ── Cascade: domains ──────────────────────────────────────────────────────
  useEffect(() => { domainsApi.list().then(r => setDomains(r.data)) }, [])

  useEffect(() => {
    if (!form.domain_id) return
    subdomainsApi.list(form.domain_id).then(r => setSubdomains(r.data))
    setForm(f => ({ ...f, subdomain_id: '', asset_id: '' }))
    setSelectedAsset(null); setSelectedColumns([]); setAvailableColumns([])
    nameManual.current = false; descManual.current = false
  }, [form.domain_id])

  useEffect(() => {
    if (!form.subdomain_id) return
    assetsApi.list({ subdomain_id: form.subdomain_id }).then(r => setAssets(r.data?.items ?? r.data))
    setForm(f => ({ ...f, asset_id: '' }))
    setSelectedAsset(null); setSelectedColumns([]); setAvailableColumns([])
    nameManual.current = false; descManual.current = false
  }, [form.subdomain_id])

  useEffect(() => {
    if (!form.asset_id) return
    const asset = assets.find(a => a.asset_id === form.asset_id) || null
    setSelectedAsset(asset)
    setSelectedColumns([]); setAvailableColumns([])
    nameManual.current = false; descManual.current = false
    if (asset) {
      setColumnsLoading(true)
      assetsApi.columns(form.asset_id)
        .then(r => setAvailableColumns(r.data.columns || []))
        .catch(() => setAvailableColumns([]))
        .finally(() => setColumnsLoading(false))
    }
  }, [form.asset_id, assets])

  // ── Auto-generate rule name ───────────────────────────────────────────────
  useEffect(() => {
    if (nameManual.current || !selectedAsset) return
    setForm(f => ({
      ...f,
      rule_name: generateRuleName(
        selectedAsset.sf_schema_name,
        selectedAsset.sf_table_name,
        selectedColumns,
        f.rule_type,
      ),
    }))
  }, [selectedAsset, selectedColumns, form.rule_type])

  // ── Auto-generate description ─────────────────────────────────────────────
  useEffect(() => {
    if (descManual.current || !selectedAsset) return
    setForm(f => ({
      ...f,
      rule_description: generateDescription(
        f.rule_type,
        selectedColumns,
        selectedAsset.sf_schema_name,
        selectedAsset.sf_table_name,
      ),
    }))
  }, [selectedAsset, selectedColumns, form.rule_type])

  // ── Auto-generate SQL (debounced 500 ms) ──────────────────────────────────
  const { asset_id, rule_type } = form
  useEffect(() => {
    if (!asset_id) return
    const needsCol = !NO_COLUMN_RULES.has(rule_type)
    if (needsCol && selectedColumns.length === 0) return

    const timer = setTimeout(async () => {
      setSqlGenerating(true)
      try {
        const resp = await rulesApi.previewSql({
          rule_type,
          target_column: selectedColumns[0] || undefined,
          rule_config: {
            ...ruleConfig,
            ...(selectedColumns.length > 1 ? { columns: selectedColumns } : {}),
          },
          asset_id,
        })
        setForm(f => ({ ...f, rule_sql: resp.data.sql }))
      } catch { /* keep whatever SQL is already shown */ }
      finally { setSqlGenerating(false) }
    }, 500)

    return () => clearTimeout(timer)
  }, [asset_id, rule_type, selectedColumns, ruleConfig])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))
  const setConfig = (key: string, val: any) => setRuleConfig(r => ({ ...r, [key]: val }))

  const toggleColumn = (col: string) => {
    if (MULTI_COLUMN_RULES.has(form.rule_type)) {
      setSelectedColumns(prev =>
        prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
      )
    } else {
      setSelectedColumns([col])
      setColOpen(false)
    }
  }

  const regenerateSQL = async () => {
    if (!form.asset_id) return
    setSqlGenerating(true)
    try {
      const resp = await rulesApi.previewSql({
        rule_type: form.rule_type,
        target_column: selectedColumns[0] || undefined,
        rule_config: {
          ...ruleConfig,
          ...(selectedColumns.length > 1 ? { columns: selectedColumns } : {}),
        },
        asset_id: form.asset_id,
      })
      setForm(f => ({ ...f, rule_sql: resp.data.sql }))
    } catch { /* ignore */ }
    finally { setSqlGenerating(false) }
  }

  const handleTestRule = async () => {
    if (!form.asset_id) return
    setTesting(true)
    setTestResult(null)
    setTestError('')
    try {
      const finalConfig = {
        ...ruleConfig,
        ...(form.rule_type === 'accepted_values_check' && acceptedValuesStr
          ? { accepted_values: acceptedValuesStr.split(',').map((s: string) => s.trim()).filter(Boolean) }
          : {}),
        ...(form.rule_type === 'schema_drift_check' && expectedColumnsStr
          ? { expected_columns: expectedColumnsStr.split(',').map((s: string) => s.trim()).filter(Boolean) }
          : {}),
        ...(selectedColumns.length > 1 ? { columns: selectedColumns } : {}),
      }
      const resp = await executionsApi.testRule({
        asset_id: form.asset_id,
        rule_type: form.rule_type,
        target_column: selectedColumns[0] || undefined,
        rule_config: Object.keys(finalConfig).length > 0 ? finalConfig : undefined,
        rule_sql: form.rule_sql || undefined,
      })
      setTestResult(resp.data)
    } catch (err: any) {
      setTestError(err.response?.data?.detail || 'Test execution failed')
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const finalConfig = {
        ...ruleConfig,
        ...(form.rule_type === 'accepted_values_check' && acceptedValuesStr
          ? { accepted_values: acceptedValuesStr.split(',').map((s: string) => s.trim()).filter(Boolean) }
          : {}),
        ...(form.rule_type === 'schema_drift_check' && expectedColumnsStr
          ? { expected_columns: expectedColumnsStr.split(',').map((s: string) => s.trim()).filter(Boolean) }
          : {}),
        ...(selectedColumns.length > 1 ? { columns: selectedColumns } : {}),
      }
      await rulesApi.create({
        ...form,
        target_column: selectedColumns[0] || undefined,
        rule_config: Object.keys(finalConfig).length > 0 ? finalConfig : undefined,
      })
      router.push('/rules')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create rule')
    } finally {
      setSaving(false)
    }
  }

  // ── Style helpers ─────────────────────────────────────────────────────────
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const needsColumn = !NO_COLUMN_RULES.has(form.rule_type)
  const isMultiCol  = MULTI_COLUMN_RULES.has(form.rule_type)
  const isFormValid = !!(
    form.domain_id &&
    form.subdomain_id &&
    form.asset_id &&
    form.rule_name.trim() &&
    (!needsColumn || selectedColumns.length > 0)
  )
  const filteredCols = availableColumns.filter(c =>
    c.column_name.toLowerCase().includes(colSearch.toLowerCase())
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-3xl">
      <Link href="/rules" className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-6">
        <ArrowLeft size={14} /> Back to Rules
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Rule</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Section 1: Location ─────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Domain *</label>
              <select className={inputCls} value={form.domain_id}
                onChange={e => set('domain_id', e.target.value)} required>
                <option value="">Select domain…</option>
                {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Subdomain *</label>
              <select className={inputCls} value={form.subdomain_id}
                onChange={e => set('subdomain_id', e.target.value)} required disabled={!form.domain_id}>
                <option value="">Select subdomain…</option>
                {subdomains.map(s => <option key={s.subdomain_id} value={s.subdomain_id}>{s.subdomain_name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Table / Asset *</label>
              <select className={inputCls} value={form.asset_id}
                onChange={e => set('asset_id', e.target.value)} required disabled={!form.subdomain_id}>
                <option value="">Select table…</option>
                {assets.map(a => (
                  <option key={a.asset_id} value={a.asset_id}>
                    {a.sf_schema_name}.{a.sf_table_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ── Section 2: Rule Configuration ───────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rule Configuration</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Rule Type *</label>
              <select className={inputCls} value={form.rule_type}
                onChange={e => {
                  set('rule_type', e.target.value)
                  setRuleConfig({})
                  setAcceptedValuesStr('')
                  setExpectedColumnsStr('')
                  setSelectedColumns([])
                  nameManual.current = false
                  descManual.current = false
                }}>
                {RULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Severity *</label>
              <select className={inputCls} value={form.severity} onChange={e => set('severity', e.target.value)}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Target Column(s) picker */}
          {needsColumn && (
            <div>
              <label className={labelCls}>
                Target Column{isMultiCol ? 's' : ''} *
                {isMultiCol && (
                  <span className="ml-2 text-xs font-normal text-gray-400">multi-select supported</span>
                )}
              </label>

              {/* Selected column tags (multi-column rules) */}
              {isMultiCol && selectedColumns.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedColumns.map(col => (
                    <span key={col}
                      className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-full">
                      {col}
                      <button type="button"
                        onClick={() => setSelectedColumns(p => p.filter(c => c !== col))}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Column dropdown — shown when columns were fetched from Snowflake */}
              {availableColumns.length > 0 ? (
                <div className="relative" ref={colRef}>
                  <button type="button" onClick={() => setColOpen(o => !o)}
                    className={`${inputCls} flex items-center justify-between text-left`}>
                    <span className={selectedColumns.length === 0 ? 'text-gray-400' : 'text-gray-900'}>
                      {selectedColumns.length === 0
                        ? 'Select column…'
                        : isMultiCol
                          ? `${selectedColumns.length} column${selectedColumns.length > 1 ? 's' : ''} selected`
                          : selectedColumns[0]}
                    </span>
                    <ChevronDown size={14} className="text-gray-400 shrink-0" />
                  </button>

                  {colOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden flex flex-col">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Search columns…"
                          value={colSearch}
                          onChange={e => setColSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="overflow-y-auto flex-1">
                        {filteredCols.length === 0 ? (
                          <div className="px-3 py-4 text-xs text-gray-400 text-center">No columns found</div>
                        ) : (
                          filteredCols.map(col => {
                            const checked = selectedColumns.includes(col.column_name)
                            return (
                              <button key={col.column_name} type="button"
                                onClick={() => toggleColumn(col.column_name)}
                                className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-gray-50 text-left">
                                <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                                  checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                                }`}>
                                  {checked && (
                                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5"
                                        strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                                <span className="text-sm text-gray-800 flex-1">{col.column_name}</span>
                                <span className="text-xs text-gray-400">{col.data_type}</span>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : columnsLoading ? (
                <div className={`${inputCls} text-gray-400 bg-gray-50`}>Loading columns…</div>
              ) : form.asset_id ? (
                <div>
                  <input className={inputCls}
                    value={selectedColumns.join(', ')}
                    onChange={e =>
                      setSelectedColumns(e.target.value.split(',').map(s => s.trim()).filter(Boolean))
                    }
                    placeholder="invoice_id, amount  (comma-separated)"
                  />
                  <p className="text-xs text-gray-400 mt-1">No Snowflake connection — enter column names manually</p>
                </div>
              ) : (
                <div className={`${inputCls} text-gray-400 bg-gray-50 cursor-not-allowed`}>
                  Select a table first
                </div>
              )}
            </div>
          )}

          {/* Dynamic config fields per rule type */}
          <RuleConfigFields
            ruleType={form.rule_type}
            config={ruleConfig}
            setConfig={setConfig}
            inputCls={inputCls}
            labelCls={labelCls}
            acceptedValuesStr={acceptedValuesStr}
            onAcceptedValuesChange={setAcceptedValuesStr}
            expectedColumnsStr={expectedColumnsStr}
            onExpectedColumnsChange={setExpectedColumnsStr}
          />
        </section>

        {/* ── Section 3: Rule Identity (auto-generated, editable) ──────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Rule Identity</h2>
            <span className="text-xs text-gray-400">Auto-generated · editable</span>
          </div>

          <div>
            <label className={labelCls}>Rule Name *</label>
            <input className={inputCls}
              value={form.rule_name}
              onChange={e => { set('rule_name', e.target.value); nameManual.current = true }}
              required
              placeholder="e.g. billing_invoices_invoice_id_null_check"
            />
            <p className="text-xs text-gray-400 mt-1">
              Generated from: schema · table · column(s) · rule type — unique and readable
            </p>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea className={inputCls} rows={2}
              value={form.rule_description}
              onChange={e => { set('rule_description', e.target.value); descManual.current = true }}
              placeholder="Auto-generated from rule type and column selection"
            />
          </div>

          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="pending_review">Pending Review</option>
            </select>
          </div>
        </section>

        {/* ── Section 4: Generated SQL ─────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Generated SQL</h2>
              <p className="text-xs text-gray-400 mt-0.5">Auto-generated · you can edit before saving</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={regenerateSQL}
                disabled={!isFormValid || sqlGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 disabled:opacity-40 transition-colors">
                <RefreshCw size={12} className={sqlGenerating ? 'animate-spin' : ''} />
                {sqlGenerating ? 'Generating…' : 'Regenerate SQL'}
              </button>
              <button type="button" onClick={handleTestRule}
                disabled={!isFormValid || testing || sqlGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-40 transition-colors">
                <Play size={12} className={testing ? 'animate-pulse' : ''} />
                {testing ? 'Testing…' : 'Test Rule'}
              </button>
            </div>
          </div>

          <textarea
            className={`${inputCls} font-mono text-xs leading-relaxed`}
            rows={7}
            value={form.rule_sql}
            onChange={e => set('rule_sql', e.target.value)}
            placeholder={
              !form.asset_id
                ? 'Select a table first…'
                : needsColumn && selectedColumns.length === 0
                  ? 'Select target column(s) above to generate SQL…'
                  : 'SQL will be generated automatically…'
            }
          />

          {/* Test error */}
          {testError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <XCircle size={15} className="shrink-0 mt-0.5" />
              <span>{testError}</span>
            </div>
          )}

          {/* Test results panel */}
          {testResult && (
            <div className={`rounded-lg border p-4 space-y-3 ${
              testResult.status === 'passed'
                ? 'bg-emerald-50 border-emerald-200'
                : testResult.status === 'error'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
            }`}>
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {testResult.status === 'passed' ? (
                    <CheckCircle size={16} className="text-emerald-600" />
                  ) : testResult.status === 'error' ? (
                    <XCircle size={16} className="text-red-600" />
                  ) : (
                    <AlertTriangle size={16} className="text-amber-600" />
                  )}
                  <span className={`text-sm font-semibold ${
                    testResult.status === 'passed' ? 'text-emerald-800'
                    : testResult.status === 'error' ? 'text-red-800'
                    : 'text-amber-800'
                  }`}>
                    Test {testResult.status === 'passed' ? 'Passed' : testResult.status === 'error' ? 'Error' : 'Failed'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {testResult.duration_ms}ms
                  </span>
                  {testResult.quality_score !== null && (
                    <span className={`font-semibold ${
                      testResult.quality_score >= 90 ? 'text-emerald-700'
                      : testResult.quality_score >= 75 ? 'text-amber-700'
                      : 'text-red-700'
                    }`}>
                      Score: {testResult.quality_score.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Metrics row */}
              {testResult.total_rows_scanned !== null && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg p-2.5 text-center border border-gray-100">
                    <div className="text-lg font-bold text-gray-800">
                      {testResult.total_rows_scanned.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">Rows Scanned</div>
                  </div>
                  <div className={`rounded-lg p-2.5 text-center border ${
                    testResult.failed_rows_count === 0 ? 'bg-white border-gray-100' : 'bg-red-50 border-red-100'
                  }`}>
                    <div className={`text-lg font-bold ${
                      testResult.failed_rows_count === 0 ? 'text-gray-800' : 'text-red-700'
                    }`}>
                      {(testResult.failed_rows_count ?? 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">Failed Rows</div>
                  </div>
                  <div className="bg-white rounded-lg p-2.5 text-center border border-gray-100">
                    <div className="text-lg font-bold text-gray-800">
                      {(testResult.failure_percentage ?? 0).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500">Failure Rate</div>
                  </div>
                </div>
              )}

              {/* Issues list */}
              {testResult.issues.length > 0 && (
                <ul className="space-y-1">
                  {testResult.issues.map((issue, i) => (
                    <li key={i} className={`text-xs flex items-start gap-1.5 ${
                      testResult.status === 'passed' ? 'text-emerald-700'
                      : testResult.status === 'error' ? 'text-red-700'
                      : 'text-amber-800'
                    }`}>
                      <span className="mt-0.5 shrink-0">
                        {testResult.status === 'passed' ? '✓' : '•'}
                      </span>
                      {issue}
                    </li>
                  ))}
                </ul>
              )}

              {/* Sample failed rows table */}
              {testResult.sample_rows && testResult.sample_rows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                    Sample Failed Rows
                    <span className="text-gray-400 font-normal">(up to 5)</span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                    <table className="text-[10px] w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {Object.keys(testResult.sample_rows[0]).map(col => (
                            <th key={col} className="px-2 py-1.5 text-left font-medium text-gray-500 whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {testResult.sample_rows.map((row, i) => (
                          <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                            {Object.values(row).map((val, j) => (
                              <td key={j} className="px-2 py-1.5 font-mono text-gray-700 max-w-[160px]">
                                <span className="block truncate" title={val === null ? 'null' : String(val)}>
                                  {val === null
                                    ? <span className="text-gray-300 italic not-italic">NULL</span>
                                    : String(val)}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <button type="submit" disabled={!isFormValid || saving}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Creating Rule…' : 'Create Rule'}
        </button>
        <p className="text-xs text-center text-gray-500 mt-2">
          Rules are saved as drafts. Use &quot;Submit for Review&quot; on the rule detail page to begin the approval process.
        </p>
      </form>
    </div>
  )
}
