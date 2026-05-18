'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { rulesApi, executionsApi, domainsApi, subdomainsApi } from '@/services/apiClient'
import SeverityBadge from '@/components/common/SeverityBadge'
import Tooltip from '@/components/common/Tooltip'
import {
  Plus, Play, Search, Database, ChevronDown, CheckCircle, XCircle,
  Loader2, List, ThumbsUp, Pencil, Trash2, X, Shield,
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bId\b/g, 'ID').replace(/\bSql\b/g, 'SQL')
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  active:         { label: 'Active',          cls: 'bg-green-100 text-green-700' },
  draft:          { label: 'Draft',           cls: 'bg-gray-100 text-gray-500' },
  pending_review: { label: 'Pending Review',  cls: 'bg-yellow-100 text-yellow-700' },
  disabled:       { label: 'Disabled',        cls: 'bg-orange-100 text-orange-600' },
  archived:       { label: 'Archived',        cls: 'bg-red-100 text-red-600' },
}

function StatusPill({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return <span className={clsx('inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded', c.cls)}>{c.label}</span>
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnrichedRule {
  rule_id: string
  rule_name: string
  rule_description: string | null
  rule_type: string
  target_column: string | null
  rule_config: { columns?: string[]; [key: string]: any } | null
  severity: string
  status: string
  is_active: boolean
  created_by: string | null
  created_at: string
  domain_id: string
  domain_name: string
  subdomain_id: string
  subdomain_name: string
  asset_id: string
  sf_database_name: string | null
  sf_schema_name: string
  sf_table_name: string
  table_criticality: string
}

// ── Compact status toggle ─────────────────────────────────────────────────────

function StatusToggle({ rule, onUpdate }: { rule: EnrichedRule; onUpdate: (id: string, status: string) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const options = ['active', 'draft', 'disabled', 'pending_review'] as const

  const change = async (s: string) => {
    setOpen(false); setBusy(true)
    try { await rulesApi.setStatus(rule.rule_id, s); onUpdate(rule.rule_id, s) }
    finally { setBusy(false) }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="flex items-center gap-0.5 group"
        title="Change status"
      >
        {busy ? <Loader2 size={10} className="animate-spin text-gray-400" /> : <StatusPill status={rule.status} />}
        <ChevronDown size={9} className={clsx('text-gray-300 group-hover:text-gray-500 transition-transform mt-px', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-30 left-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36" onMouseLeave={() => setOpen(false)}>
          {options.map(s => (
            <button key={s} onClick={() => change(s)}
              className={clsx('w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2', rule.status === s && 'bg-gray-50')}>
              {rule.status === s && <CheckCircle size={9} className="text-green-500 shrink-0" />}
              <StatusPill status={s} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Edit drawer ───────────────────────────────────────────────────────────────

const RULE_TYPES = [
  'null_check','uniqueness_check','duplicate_check','accepted_values_check',
  'range_check','freshness_check','volume_check','schema_drift_check',
  'referential_integrity_check','regex_check','business_rule_check','custom_sql_check',
]

function EditRuleDrawer({ rule, onClose, onSaved }: {
  rule: EnrichedRule; onClose: () => void; onSaved: (u: EnrichedRule) => void
}) {
  const [form, setForm] = useState({
    rule_name: rule.rule_name,
    rule_description: rule.rule_description || '',
    rule_type: rule.rule_type,
    target_column: rule.target_column || '',
    severity: rule.severity,
    status: rule.status,
    rule_sql: '',
  })
  const [config, setConfigState] = useState<Record<string, any>>(rule.rule_config || {})
  // Local string state for accepted_values so commas can be typed freely
  const [acceptedValuesStr, setAcceptedValuesStr] = useState(
    () => (rule.rule_config?.accepted_values as string[] || []).join(', ')
  )
  // Local string state for expected_columns so commas can be typed freely
  const [expectedColumnsStr, setExpectedColumnsStr] = useState(
    () => (rule.rule_config?.expected_columns as string[] || []).join(', ')
  )
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ status: string; score: number | null; error: string | null } | null>(null)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setCfg = (k: string, v: any) => setConfigState(c => ({ ...c, [k]: v }))

  useEffect(() => {
    rulesApi.get(rule.rule_id).then(r => {
      setForm(f => ({ ...f, rule_sql: r.data.rule_sql || '' }))
      const cfg = r.data.rule_config || {}
      setConfigState(cfg)
      if (cfg.accepted_values) setAcceptedValuesStr((cfg.accepted_values as string[]).join(', '))
      if (cfg.expected_columns) setExpectedColumnsStr((cfg.expected_columns as string[]).join(', '))
    })
  }, [rule.rule_id])

  const handleTypeChange = async (newType: string) => {
    set('rule_type', newType)
    setConfigState({})
    setAcceptedValuesStr('')
    setExpectedColumnsStr('')
    try {
      const res = await rulesApi.previewSql({
        rule_type: newType,
        target_column: form.target_column || undefined,
        rule_config: {},
        asset_id: rule.asset_id,
      })
      setForm(f => ({ ...f, rule_sql: res.data.sql || '', rule_type: newType }))
    } catch { /* SQL preview failed — keep empty */ }
  }

  const buildFinalConfig = () => {
    const finalConfig = { ...config }
    if (form.rule_type === 'accepted_values_check') {
      finalConfig.accepted_values = acceptedValuesStr.split(',').map((s: string) => s.trim()).filter(Boolean)
    }
    if (form.rule_type === 'schema_drift_check') {
      finalConfig.expected_columns = expectedColumnsStr.split(',').map((s: string) => s.trim()).filter(Boolean)
    }
    return finalConfig
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await executionsApi.runRuleSync(rule.rule_id)
      setTestResult({ status: res.data.status, score: res.data.quality_score, error: res.data.error_message })
    } catch (e: any) {
      setTestResult({ status: 'error', score: null, error: e.response?.data?.detail || e.message })
    } finally { setTesting(false) }
  }

  const save = async () => {
    setSaving(true); setError('')
    const finalConfig = buildFinalConfig()
    try {
      await rulesApi.update(rule.rule_id, {
        rule_name: form.rule_name,
        rule_description: form.rule_description || undefined,
        rule_type: form.rule_type,
        target_column: form.target_column || undefined,
        severity: form.severity,
        status: form.status,
        rule_sql: form.rule_sql || undefined,
        rule_config: Object.keys(finalConfig).length > 0 ? finalConfig : undefined,
      })
      onSaved({ ...rule, ...form, rule_config: finalConfig })
    } catch (e: any) { setError(e.response?.data?.detail || 'Failed to save') }
    finally { setSaving(false) }
  }

  const inp = "w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  const inpReadOnly = "w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-500 font-mono cursor-not-allowed"

  const parseRangeValue = (v: string) => {
    if (v === '') return undefined
    const n = Number(v)
    return isNaN(n) ? v : n
  }

  const renderConfigFields = () => {
    switch (form.rule_type) {
      case 'accepted_values_check':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Accepted Values <span className="font-normal text-gray-400">(separate with commas)</span>
            </label>
            <input
              className={inp}
              value={acceptedValuesStr}
              onChange={e => setAcceptedValuesStr(e.target.value)}
              placeholder="ACTIVE, INACTIVE, PENDING"
            />
            {acceptedValuesStr && (
              <p className="text-[10px] text-gray-400 mt-1">
                {acceptedValuesStr.split(',').map(s => s.trim()).filter(Boolean).length} value(s) defined
              </p>
            )}
          </div>
        )
      case 'range_check':
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min Value</label>
              <input className={inp} value={config.min_value ?? ''}
                onChange={e => setCfg('min_value', parseRangeValue(e.target.value))}
                placeholder="0 or 2024-01-01" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max Value</label>
              <input className={inp} value={config.max_value ?? ''}
                onChange={e => setCfg('max_value', parseRangeValue(e.target.value))}
                placeholder="1000000 or 2024-12-31" />
            </div>
          </div>
        )
      case 'freshness_check':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Max Hours</label>
            <input type="number" className={inp} value={config.max_hours ?? 24}
              onChange={e => setCfg('max_hours', Number(e.target.value))} />
          </div>
        )
      case 'volume_check':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date Column</label>
              <input className={inp} value={config.date_column || ''} onChange={e => setCfg('date_column', e.target.value)} placeholder="created_at" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Min Rows</label>
                <input type="number" className={inp} value={config.min_rows ?? ''}
                  onChange={e => setCfg('min_rows', e.target.value === '' ? undefined : Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Rows</label>
                <input type="number" className={inp} value={config.max_rows ?? ''}
                  onChange={e => setCfg('max_rows', e.target.value === '' ? undefined : Number(e.target.value))} />
              </div>
            </div>
          </div>
        )
      case 'referential_integrity_check':
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ref Table</label>
              <input className={inp} value={config.reference_table || ''} onChange={e => setCfg('reference_table', e.target.value)} placeholder="schema.table" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ref Column</label>
              <input className={inp} value={config.reference_column || ''} onChange={e => setCfg('reference_column', e.target.value)} placeholder="id" />
            </div>
          </div>
        )
      case 'regex_check':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Regex Pattern</label>
            <input className={`${inp} font-mono`} value={config.pattern || ''} onChange={e => setCfg('pattern', e.target.value)} />
          </div>
        )
      case 'business_rule_check':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
            <textarea className={`${inp} font-mono text-xs`} rows={2} value={config.condition || ''}
              onChange={e => setCfg('condition', e.target.value)} placeholder="ship_date >= order_date" />
          </div>
        )
      case 'schema_drift_check':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Expected Columns</label>
            <input className={inp} value={expectedColumnsStr}
              onChange={e => setExpectedColumnsStr(e.target.value)}
              placeholder="id, name, email, created_at" />
          </div>
        )
      case 'semantic_consistency_check':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Consistency Condition</label>
            <textarea className={`${inp} font-mono text-xs`} rows={2}
              value={config.condition || ''}
              onChange={e => setCfg('condition', e.target.value)}
              placeholder="end_date >= start_date AND qty > 0" />
            <p className="text-[10px] text-gray-400 mt-1">SQL expression that must be TRUE for valid rows</p>
          </div>
        )
      case 'referential_sanity_check':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sanity Condition</label>
            <textarea className={`${inp} font-mono text-xs`} rows={2}
              value={config.condition || ''}
              onChange={e => setCfg('condition', e.target.value)}
              placeholder="order_status IN ('OPEN','CLOSED','CANCELLED')" />
            <p className="text-[10px] text-gray-400 mt-1">Rows matching this condition are considered invalid</p>
          </div>
        )
      case 'business_metric_check':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Metric SQL *</label>
              <input className={`${inp} font-mono text-xs`}
                value={config.metric_sql || ''}
                onChange={e => setCfg('metric_sql', e.target.value)}
                placeholder="AVG(order_amount)" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Min Value</label>
                <input type="number" className={inp}
                  value={config.min_value ?? ''}
                  onChange={e => setCfg('min_value', e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Value</label>
                <input type="number" className={inp}
                  value={config.max_value ?? ''}
                  onChange={e => setCfg('max_value', e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="10000" />
              </div>
            </div>
          </div>
        )
      case 'distribution_consistency_check':
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Baseline Mean</label>
                <input type="number" className={inp}
                  value={config.baseline_mean ?? ''}
                  onChange={e => setCfg('baseline_mean', e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="100.0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Baseline Std Dev</label>
                <input type="number" className={inp}
                  value={config.baseline_std ?? ''}
                  onChange={e => setCfg('baseline_std', e.target.value === '' ? undefined : Number(e.target.value))}
                  placeholder="15.0" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tolerance %</label>
              <input type="number" className={inp}
                value={config.tolerance_pct ?? 20}
                onChange={e => setCfg('tolerance_pct', Number(e.target.value))}
                placeholder="20" />
            </div>
          </div>
        )
      case 'llm_semantic_check':
        return (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sample Size</label>
              <input type="number" className={inp}
                value={config.sample_size ?? 100}
                onChange={e => setCfg('sample_size', Number(e.target.value))}
                placeholder="100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Validation Prompt</label>
              <textarea className={`${inp} text-xs`} rows={3}
                value={config.validation_prompt || ''}
                onChange={e => setCfg('validation_prompt', e.target.value)}
                placeholder="Check that each row represents a valid and complete customer record..." />
            </div>
          </div>
        )
      default: return null
    }
  }

  const configSection = renderConfigFields()

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-[480px] bg-white h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-400 font-mono truncate max-w-[300px]">{rule.rule_name}</p>
            <h2 className="text-sm font-semibold text-gray-900 mt-0.5">Edit Rule</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rule Name *</label>
            <input className={inp} value={form.rule_name} onChange={e => set('rule_name', e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea className={inp} rows={2} value={form.rule_description} onChange={e => set('rule_description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rule Type</label>
              <select className={inp} value={form.rule_type} onChange={e => handleTypeChange(e.target.value)}>
                {RULE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Target Column <span className="font-normal text-gray-400">(read-only)</span>
              </label>
              <div className={inpReadOnly} title="Target column cannot be changed after creation">
                {form.target_column || <span className="italic text-gray-300">none</span>}
              </div>
            </div>
          </div>

          {/* Rule-type specific config fields */}
          {configSection && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Rule Config</p>
              {configSection}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Severity</label>
              <select className={inp} value={form.severity} onChange={e => set('severity', e.target.value)}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select className={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="pending_review">Pending Review</option>
                <option value="disabled">Disabled</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Custom SQL <span className="font-normal text-gray-400">(blank = auto-generate)</span></label>
            <textarea className={`${inp} font-mono text-xs`} rows={6} value={form.rule_sql}
              onChange={e => set('rule_sql', e.target.value)} placeholder="SELECT COUNT(*) AS failed_count FROM ..." />
          </div>
        </div>

        {/* Test result banner */}
        {testResult && (
          <div className={clsx(
            'mx-5 mb-2 px-3 py-2 rounded-md text-xs flex items-center gap-2 border',
            testResult.status === 'passed'
              ? 'bg-green-50 border-green-200 text-green-700'
              : testResult.status === 'error'
              ? 'bg-orange-50 border-orange-200 text-orange-700'
              : 'bg-red-50 border-red-200 text-red-700'
          )}>
            {testResult.status === 'passed' ? <CheckCircle size={13} /> : <XCircle size={13} />}
            <span className="font-medium capitalize">{testResult.status}</span>
            {testResult.score != null && <span className="font-mono">{testResult.score}%</span>}
            {testResult.error && <span className="truncate text-[10px] opacity-80">{testResult.error}</span>}
          </div>
        )}

        <div className="px-5 py-3.5 border-t border-gray-200 flex gap-2">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={handleTest} disabled={testing || rule.status !== 'active'}
            title={rule.status !== 'active' ? 'Rule must be active to test' : 'Run against Snowflake (saved version)'}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {testing ? 'Testing…' : 'Test Rule'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Run result badge (inline) ─────────────────────────────────────────────────

function RunResult({ result }: { result: { status: string; score: number | null; error: string | null; run_id: string } }) {
  const ok = result.status === 'passed'
  const err = result.status === 'error'
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
      ok ? 'bg-green-50 text-green-700' : err ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'
    )}>
      {ok ? <CheckCircle size={9} /> : <XCircle size={9} />}
      {result.status}
      {result.score != null && <span className="font-mono">{result.score}%</span>}
      {result.run_id && <Link href={`/runs?rule_id=${result.run_id}`} className="underline" onClick={e => e.stopPropagation()}>↗</Link>}
    </span>
  )
}

// ── Filter chip ───────────────────────────────────────────────────────────────

function FilterChip({ label, onRemove, icon }: { label: string; onRemove: () => void; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20">
      {icon}{label}
      <button onClick={onRemove} className="ml-0.5 hover:text-indigo-900 dark:hover:text-indigo-100 transition-colors"><X size={9} /></button>
    </span>
  )
}

// ── Icon button ───────────────────────────────────────────────────────────────

function Btn({ onClick, title, cls, disabled, children }: {
  onClick: () => void; title: string; cls: string; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={clsx('p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed', cls)}>
      {children}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RulesPage() {
  const [rules, setRules]           = useState<EnrichedRule[]>([])
  const [domains, setDomains]       = useState<any[]>([])
  const [subdomains, setSubdomains] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [running, setRunning]       = useState<string | null>(null)
  const [runResults, setRunResults] = useState<Record<string, { status: string; score: number | null; error: string | null; run_id: string }>>({})
  const [editingRule, setEditingRule] = useState<EnrichedRule | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  const [search, setSearch]               = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter]   = useState('')
  const [domainFilter, setDomainFilter]   = useState('')
  const [subdomainFilter, setSubdomainFilter] = useState('')
  const [tableFilter, setTableFilter]     = useState('')

  // Unique tables derived from visible rules for the table filter
  const tableOptions = useMemo(() => {
    const seen = new Map<string, { assetId: string; label: string }>()
    for (const r of rules) {
      if (!seen.has(r.asset_id)) seen.set(r.asset_id, { assetId: r.asset_id, label: `${r.sf_schema_name}.${r.sf_table_name}` })
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [rules])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([rulesApi.listEnriched(), domainsApi.list()])
      .then(([r, d]) => { setRules(r.data?.items ?? r.data); setDomains(d.data?.items ?? d.data) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (domainFilter) {
      subdomainsApi.list(domainFilter).then(r => setSubdomains(r.data))
      setSubdomainFilter('')
    } else {
      setSubdomains([])
      setSubdomainFilter('')
    }
  }, [domainFilter])

  const anyFilter = !!(search || severityFilter || statusFilter || domainFilter || subdomainFilter || tableFilter)

  const filtered = useMemo(() => rules.filter(r => {
    if (search) {
      const q = search.toLowerCase()
      if (!r.rule_name.toLowerCase().includes(q) &&
          !(r.rule_description ?? '').toLowerCase().includes(q) &&
          !r.sf_table_name.toLowerCase().includes(q)) return false
    }
    if (severityFilter && r.severity !== severityFilter) return false
    if (statusFilter  && r.status !== statusFilter)       return false
    if (domainFilter  && r.domain_id !== domainFilter)    return false
    if (subdomainFilter && r.subdomain_id !== subdomainFilter) return false
    if (tableFilter   && r.asset_id !== tableFilter)      return false
    return true
  }), [rules, search, severityFilter, statusFilter, domainFilter, subdomainFilter, tableFilter])

  const clearFilters = () => {
    setSearch(''); setSeverityFilter(''); setStatusFilter('')
    setDomainFilter(''); setSubdomainFilter(''); setTableFilter('')
  }

  const handleRun = async (ruleId: string) => {
    setRunning(ruleId)
    setRunResults(prev => { const n = { ...prev }; delete n[ruleId]; return n })
    try {
      const res = await executionsApi.runRuleSync(ruleId)
      setRunResults(prev => ({ ...prev, [ruleId]: { status: res.data.status, score: res.data.quality_score, error: res.data.error_message, run_id: res.data.run_id } }))
    } catch (e: any) {
      setRunResults(prev => ({ ...prev, [ruleId]: { status: 'error', score: null, error: e.response?.data?.detail || e.message, run_id: '' } }))
    } finally { setRunning(null) }
  }

  const handleStatusUpdate = (id: string, status: string) =>
    setRules(prev => prev.map(r => r.rule_id === id ? { ...r, status, is_active: status === 'active' } : r))

  const handleSaved = (updated: EnrichedRule) => {
    setRules(prev => prev.map(r => r.rule_id === updated.rule_id ? { ...r, ...updated } : r))
    setEditingRule(null)
  }

  const handleDelete = async (ruleId: string, ruleName: string) => {
    if (!confirm(`Archive "${ruleName}"? Execution stops but history is preserved.`)) return
    setDeleting(ruleId)
    try { await rulesApi.delete(ruleId); setRules(prev => prev.filter(r => r.rule_id !== ruleId)) }
    finally { setDeleting(null) }
  }

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(r => r.rule_id)))
    }
  }

  const handleBulkStatus = async (status: string) => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      await rulesApi.bulkStatus([...selectedIds], status)
      setRules(prev => prev.map(r => selectedIds.has(r.rule_id) ? { ...r, status, is_active: status === 'active' } : r))
      setSelectedIds(new Set())
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Bulk update failed')
    } finally { setBulkLoading(false) }
  }

  const handleBulkRun = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      await rulesApi.bulkExecute([...selectedIds])
      load()
      setSelectedIds(new Set())
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Bulk execute failed')
    } finally { setBulkLoading(false) }
  }

  const sel = 'px-2.5 py-1.5 border border-gray-200 dark:border-[var(--border)] rounded-lg text-xs bg-white dark:bg-[var(--surface)] focus:outline-none focus:ring-1 focus:ring-indigo-400 text-gray-600 dark:text-[var(--text-2)]'

  return (
    <div className="flex flex-col min-h-0">

      {/* ── Top bar ── */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-[var(--border)] bg-white dark:bg-[var(--surface)]">

        {/* Row 1: title + actions */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-gray-900 dark:text-[var(--text)] flex items-center gap-2">
              <Shield size={15} className="text-indigo-500" /> Rules
            </h1>
            <span className="text-xs text-gray-400 dark:text-[var(--text-4)]">
              {anyFilter ? `${filtered.length} of ${rules.length}` : rules.length} rules
            </span>
            {anyFilter && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                <X size={10} /> clear filters
              </button>
            )}
          </div>
          <Link href="/rules/create"
            className="flex items-center gap-1.5 px-3 py-1.5 btn-gradient rounded-lg text-xs font-semibold">
            <Plus size={11} /> New Rule
          </Link>
        </div>

        {/* Row 2: filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search rules, tables…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-200 dark:border-[var(--border)] rounded-lg text-xs w-48 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-[var(--surface)] text-gray-700 dark:text-[var(--text-2)]"
            />
          </div>

          <div className="w-px h-4 bg-gray-200 dark:bg-[var(--border)]" />

          {/* Domain */}
          <select value={domainFilter} onChange={e => { setDomainFilter(e.target.value); setSubdomainFilter(''); setTableFilter('') }} className={sel}>
            <option value="">All Domains</option>
            {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
          </select>

          {/* Subdomain — shown when domain selected */}
          {subdomains.length > 0 && (
            <select value={subdomainFilter} onChange={e => { setSubdomainFilter(e.target.value); setTableFilter('') }} className={sel}>
              <option value="">All Subdomains</option>
              {subdomains.map(s => <option key={s.subdomain_id} value={s.subdomain_id}>{s.subdomain_name}</option>)}
            </select>
          )}

          {/* Table */}
          <select value={tableFilter} onChange={e => setTableFilter(e.target.value)} className={sel}>
            <option value="">All Tables</option>
            {tableOptions.map(t => <option key={t.assetId} value={t.assetId}>{t.label}</option>)}
          </select>

          <div className="w-px h-4 bg-gray-200 dark:bg-[var(--border)]" />

          {/* Severity */}
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className={sel}>
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Status */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={sel}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending_review">Pending Review</option>
            <option value="draft">Draft</option>
            <option value="disabled">Disabled</option>
            <option value="archived">Archived</option>
          </select>

          {/* Active filter chips */}
          {anyFilter && (
            <div className="flex items-center gap-1.5 flex-wrap ml-1">
              {domainFilter && <FilterChip label={domains.find(d => d.domain_id === domainFilter)?.domain_name ?? domainFilter} onRemove={() => { setDomainFilter(''); setSubdomainFilter(''); setTableFilter('') }} />}
              {subdomainFilter && <FilterChip label={subdomains.find(s => s.subdomain_id === subdomainFilter)?.subdomain_name ?? subdomainFilter} onRemove={() => { setSubdomainFilter(''); setTableFilter('') }} />}
              {tableFilter && <FilterChip label={tableOptions.find(t => t.assetId === tableFilter)?.label ?? tableFilter} onRemove={() => setTableFilter('')} icon={<Database size={9} />} />}
              {severityFilter && <FilterChip label={severityFilter} onRemove={() => setSeverityFilter('')} />}
              {statusFilter && <FilterChip label={statusFilter.replace('_', ' ')} onRemove={() => setStatusFilter('')} />}
            </div>
          )}
        </div>
      </div>

      {/* ── Bulk action toolbar ── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 bg-blue-50 border-b border-blue-100">
          <span className="text-xs font-medium text-blue-700">{selectedIds.size} selected</span>
          <div className="flex items-center gap-1.5 ml-2">
            <button onClick={() => handleBulkStatus('active')} disabled={bulkLoading}
              className="px-2.5 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              Activate
            </button>
            <button onClick={() => handleBulkStatus('disabled')} disabled={bulkLoading}
              className="px-2.5 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
              Disable
            </button>
            <button onClick={() => handleBulkStatus('archived')} disabled={bulkLoading}
              className="px-2.5 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50">
              Archive
            </button>
            <button onClick={handleBulkRun} disabled={bulkLoading}
              className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
              {bulkLoading ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
              Run All
            </button>
          </div>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-blue-600 hover:underline">
            Clear selection
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto bg-white">
        {loading ? (
          /* Skeleton rows */
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 w-8" /><th className="px-4 py-2 w-[36%]" /><th className="px-3 py-2 w-[17%]" />
                <th className="px-3 py-2 w-[12%]" /><th className="px-3 py-2 w-[6%]" /><th className="px-3 py-2 w-[10%]" /><th className="px-3 py-2 w-[16%]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-3 py-3"><div className="w-3.5 h-3.5 bg-gray-200 rounded" /></td>
                  <td className="px-4 py-3">
                    <div className="h-3.5 bg-gray-200 rounded w-3/4 mb-1.5" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                  </td>
                  <td className="px-3 py-3"><div className="h-3 bg-gray-200 rounded w-2/3" /></td>
                  <td className="px-3 py-3"><div className="h-3 bg-gray-200 rounded w-3/4" /></td>
                  <td className="px-3 py-3"><div className="h-5 bg-gray-200 rounded-full w-12" /></td>
                  <td className="px-3 py-3"><div className="h-5 bg-gray-200 rounded-full w-16" /></td>
                  <td className="px-3 py-3 text-right"><div className="h-6 bg-gray-200 rounded w-16 ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Shield size={28} className="text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-700">
              {anyFilter ? 'No rules match your filters' : 'No rules yet'}
            </p>
            <p className="text-xs text-gray-400 mt-1 text-center max-w-xs">
              {anyFilter
                ? 'Try adjusting or clearing the active filters to see more results.'
                : 'Create your first data quality rule to start monitoring your Snowflake tables.'}
            </p>
            <div className="mt-4">
              {anyFilter
                ? <button onClick={clearFilters} className="text-xs text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">Clear filters</button>
                : <Link href="/rules/create" className="text-xs text-white bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium">Create your first rule</Link>
              }
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                </th>
                <th className="text-left px-4 py-2 font-medium text-gray-400 w-[36%]">Rule</th>
                <th className="text-left px-3 py-2 font-medium text-gray-400 w-[17%]">Table</th>
                <th className="text-left px-3 py-2 font-medium text-gray-400 w-[12%]">Domain</th>
                <th className="text-left px-3 py-2 font-medium text-gray-400 w-[6%]">Sev</th>
                <th className="text-left px-3 py-2 font-medium text-gray-400 w-[10%]">Status</th>
                <th className="text-right px-3 py-2 font-medium text-gray-400 w-[16%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(rule => {
                const result = runResults[rule.rule_id]
                const isSelected = selectedIds.has(rule.rule_id)
                return (
                  <tr key={rule.rule_id} className={clsx('hover:bg-gray-50/60 group', isSelected && 'bg-blue-50/40')}>

                    {/* Checkbox */}
                    <td className="px-3 py-2 w-8">
                      <input type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(rule.rule_id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    </td>

                    {/* Rule name */}
                    <td className="px-4 py-2 max-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Tooltip
                          text={rule.rule_description ? `${rule.rule_name} — ${rule.rule_description}` : rule.rule_name}
                          position="top"
                          className="flex-1 min-w-0"
                        >
                          <Link
                            href={`/rules/${rule.rule_id}`}
                            className="font-medium text-gray-800 hover:text-blue-600 transition-colors truncate block w-full"
                          >
                            {rule.rule_name}
                          </Link>
                        </Tooltip>
                        {result && <span className="shrink-0"><RunResult result={result} /></span>}
                        {rule.status === 'pending_review' && (
                          <Tooltip text="Pending review — click to approve" position="top">
                            <Link href={`/rules/${rule.rule_id}`}
                              className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded whitespace-nowrap">
                              <ThumbsUp size={8} /> Review
                            </Link>
                          </Tooltip>
                        )}
                      </div>
                      <Tooltip text={rule.rule_type.replace(/_/g, ' ')} position="bottom" className="block">
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">
                          {rule.rule_type.replace(/_check$/, '').replace(/_/g, ' ')}
                        </p>
                      </Tooltip>
                    </td>

                    {/* Table + columns */}
                    <td className="px-3 py-2">
                      <Tooltip text={`${rule.sf_database_name ? rule.sf_database_name + '.' : ''}${rule.sf_schema_name}.${rule.sf_table_name}`} position="top">
                        <div className="flex items-center gap-1 min-w-0">
                          <Database size={10} className="text-gray-300 shrink-0" />
                          <span className="text-[10px] text-gray-600 font-mono truncate max-w-[220px]">
                            {rule.sf_schema_name}.{rule.sf_table_name}
                          </span>
                        </div>
                      </Tooltip>
                      {(() => {
                        const cols = rule.rule_config?.columns?.length
                          ? rule.rule_config.columns
                          : rule.target_column ? [rule.target_column] : []
                        return cols.length > 0 ? (
                          <div className="flex flex-wrap gap-1 pl-3.5 mt-1">
                            {cols.map(c => (
                              <Tooltip key={c} text={c} position="bottom">
                                <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1 rounded whitespace-nowrap max-w-[100px] truncate block">
                                  {c}
                                </span>
                              </Tooltip>
                            ))}
                          </div>
                        ) : null
                      })()}
                    </td>

                    {/* Domain / subdomain */}
                    <td className="px-3 py-2">
                      <Tooltip text={rule.domain_name} position="top" className="block">
                        <p className="text-gray-700 font-medium truncate">{rule.domain_name}</p>
                      </Tooltip>
                      <Tooltip text={rule.subdomain_name} position="bottom" className="block">
                        <p className="text-gray-400 truncate">{rule.subdomain_name}</p>
                      </Tooltip>
                    </td>

                    {/* Severity */}
                    <td className="px-3 py-2">
                      <SeverityBadge severity={rule.severity} />
                    </td>

                    {/* Status toggle */}
                    <td className="px-3 py-2">
                      <StatusToggle rule={rule} onUpdate={handleStatusUpdate} />
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Tooltip text={rule.status !== 'active' ? 'Rule must be active to run' : 'Run now'} position="top">
                          <Btn
                            onClick={() => handleRun(rule.rule_id)}
                            title=""
                            cls={
                              rule.status === 'active'
                                ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                                : 'text-gray-300 bg-gray-50 cursor-not-allowed'
                            }
                            disabled={running === rule.rule_id || rule.status !== 'active'}
                          >
                            {running === rule.rule_id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Play size={13} />}
                          </Btn>
                        </Tooltip>
                        <Tooltip text="Execution logs" position="top">
                          <Link href={`/runs?rule_id=${rule.rule_id}`}
                            className="p-1.5 rounded text-slate-400 bg-slate-50 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                            <List size={13} />
                          </Link>
                        </Tooltip>
                        <Tooltip text="Edit rule" position="top">
                          <Btn onClick={() => setEditingRule(rule)} title=""
                            cls="text-violet-500 bg-violet-50 hover:bg-violet-100">
                            <Pencil size={13} />
                          </Btn>
                        </Tooltip>
                        <Tooltip text="Archive rule" position="top">
                          <Btn
                            onClick={() => handleDelete(rule.rule_id, rule.rule_name)}
                            title=""
                            cls="text-rose-400 bg-rose-50 hover:text-rose-600 hover:bg-rose-100"
                            disabled={deleting === rule.rule_id}
                          >
                            {deleting === rule.rule_id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={13} />}
                          </Btn>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer counts ── */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center gap-4 px-6 py-2 border-t border-gray-100 bg-white text-[10px] text-gray-400">
          <span>{filtered.length} of {rules.length} rules shown</span>
        </div>
      )}

      {/* Edit drawer */}
      {editingRule && (
        <EditRuleDrawer rule={editingRule} onClose={() => setEditingRule(null)} onSaved={handleSaved} />
      )}
    </div>
  )
}
