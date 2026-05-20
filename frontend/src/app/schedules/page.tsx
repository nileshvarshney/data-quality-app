'use client'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { schedulesApi, rulesApi, domainsApi, subdomainsApi, assetsApi } from '@/services/apiClient'
import { useTimezone } from '@/contexts/TimezoneContext'
import { formatTs as _formatTs } from '@/utils/dateFormat'
import {
  Plus, Clock, Pause, Play, Trash2, Loader2,
  Pencil, Check, X, PlayCircle, Calendar, Info,
  Globe, Database, Layers, Table2, Zap, ChevronDown, ChevronUp,
  ExternalLink, AlertCircle, Package, Search,
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BundledRule {
  rule_id: string
  rule_name: string
  rule_description: string | null
  severity: string
}

interface EnrichedSchedule {
  schedule_id: string
  schedule_level: string
  frequency: string
  cron_expression: string | null
  timezone: string
  run_at_hour: number | null
  run_at_minute: number | null
  is_active: boolean
  rule_id: string | null
  rule_name: string | null
  rule_description: string | null
  asset_id: string | null
  asset_name: string | null
  asset_schema: string | null
  domain_id: string | null
  domain_name: string | null
  subdomain_id: string | null
  subdomain_name: string | null
  rule_ids: string[] | null
  bundled_rules: BundledRule[]
  next_run_time: string | null
  created_at: string
  updated_at: string
}

interface Rule    { rule_id: string; rule_name: string; rule_description?: string }
interface Domain  { domain_id: string; domain_name: string }
interface Subdomain { subdomain_id: string; subdomain_name: string; domain_id: string }
interface Asset   { asset_id: string; sf_table_name: string; sf_schema_name: string }

interface RuleStatus {
  rule_id: string
  rule_name: string
  rule_description: string | null
  rule_type: string
  severity: string
  asset_id: string
  domain_id: string
  subdomain_id: string
  has_rule_level_schedule: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly',
  monthly: 'Monthly', cron: 'Custom cron', on_demand: 'On demand',
}
const FREQ_COLORS: Record<string, string> = {
  hourly:    'bg-blue-100 text-blue-800',
  daily:     'bg-indigo-100 text-indigo-800',
  weekly:    'bg-purple-100 text-purple-800',
  monthly:   'bg-pink-100 text-pink-800',
  cron:      'bg-orange-100 text-orange-800',
  on_demand: 'bg-gray-100 text-gray-600',
}

const SEV_COLORS: Record<string, string> = {
  critical: 'text-red-600',
  high:     'text-orange-500',
  medium:   'text-yellow-600',
  low:      'text-gray-500',
}

const LEVEL_META: Record<string, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
  rule:      { label: 'Rule',      icon: <Zap size={11} />,      color: 'bg-violet-100 text-violet-800', desc: 'Runs a single specific rule on its target table.' },
  table:     { label: 'Table',     icon: <Table2 size={11} />,   color: 'bg-teal-100 text-teal-800',    desc: 'Runs selected rules for a Snowflake table.' },
  subdomain: { label: 'Subdomain', icon: <Layers size={11} />,   color: 'bg-amber-100 text-amber-800',  desc: 'Runs selected rules under a subdomain (e.g. Billing).' },
  domain:    { label: 'Domain',    icon: <Database size={11} />, color: 'bg-rose-100 text-rose-800',    desc: 'Runs selected rules across an entire domain (e.g. Revenue).' },
  global:    { label: 'Global',    icon: <Globe size={11} />,    color: 'bg-gray-100 text-gray-700',    desc: 'Default fallback schedule — runs selected rules platform-wide.' },
}

const PRIORITY_ORDER = ['rule', 'table', 'subdomain', 'domain', 'global']

const TIMEZONES = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'UTC', 'Europe/London', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
]
const HOURS   = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 5, 10, 15, 20, 30, 45]

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPlainEnglish(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bId\b/g, 'ID')
}
function fmtPad(n: number) { return String(n).padStart(2, '0') }

function fmtNextRun(iso: string | null, timezone: string): string {
  if (!iso) return '—'
  const d   = new Date(iso)
  const now = Date.now()
  const diff = d.getTime() - now
  if (diff < 0) return 'overdue'
  const mins = Math.floor(diff / 60000)
  if (mins < 60)  return `in ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `in ${hrs}h ${mins % 60}m`
  return _formatTs(iso, timezone)
}

function targetLabel(s: EnrichedSchedule): string {
  switch (s.schedule_level) {
    case 'rule':      return s.rule_description || toPlainEnglish(s.rule_name || '') || '—'
    case 'table':     return s.asset_schema ? `${s.asset_schema}.${s.asset_name}` : s.asset_name || '—'
    case 'subdomain': return s.subdomain_name || '—'
    case 'domain':    return s.domain_name || '—'
    case 'global':    return 'All domains'
    default:          return '—'
  }
}

function runLogsUrl(s: EnrichedSchedule): string {
  const params = new URLSearchParams()
  if (s.schedule_level === 'rule'      && s.rule_id)      params.set('rule_id',      s.rule_id)
  if (s.schedule_level === 'table'     && s.asset_id)     params.set('asset_id',     s.asset_id)
  if (s.schedule_level === 'subdomain' && s.subdomain_id) params.set('subdomain_id', s.subdomain_id)
  if (s.schedule_level === 'domain'    && s.domain_id)    params.set('domain_id',    s.domain_id)
  const qs = params.toString()
  return `/runs${qs ? `?${qs}` : ''}`
}

function targetSubLabel(s: EnrichedSchedule): string | null {
  switch (s.schedule_level) {
    case 'rule':  return s.rule_name ? toPlainEnglish(s.rule_name) : null
    case 'table': return s.asset_name ? 'Snowflake table' : null
    default:      return null
  }
}

// ── Form data ─────────────────────────────────────────────────────────────────

interface ScheduleFormData {
  schedule_level: string
  rule_id: string
  asset_id: string
  subdomain_id: string
  domain_id: string
  frequency: string
  cron_expression: string
  timezone: string
  run_at_hour: number
  run_at_minute: number
  rule_ids: string[]  // explicitly selected rules for bundle schedules
}

const EMPTY_FORM: ScheduleFormData = {
  schedule_level: 'rule',
  rule_id: '',
  asset_id: '',
  subdomain_id: '',
  domain_id: '',
  frequency: 'daily',
  cron_expression: '',
  timezone: 'America/Los_Angeles',
  run_at_hour: 6,
  run_at_minute: 0,
  rule_ids: [],
}

// ── Cron preview ──────────────────────────────────────────────────────────────

function cronPreview(form: ScheduleFormData): string | null {
  const { frequency, run_at_hour: h, run_at_minute: m } = form
  if (frequency === 'daily')   return `${fmtPad(m)} ${fmtPad(h)} * * *`
  if (frequency === 'weekly')  return `${fmtPad(m)} ${fmtPad(h)} * * 1`
  if (frequency === 'monthly') return `${fmtPad(m)} ${fmtPad(h)} 1 * *`
  if (frequency === 'hourly')  return `${fmtPad(m)} * * * *`
  if (frequency === 'cron')    return form.cron_expression || null
  return null
}

// ── Schedule Level explainer (collapsed by default) ───────────────────────────

function LevelExplainer({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-blue-800 hover:bg-blue-100/50 rounded-xl transition-colors"
      >
        <span className="flex items-center gap-2"><Info size={14} /> How schedule levels and priority work</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-blue-900 space-y-3">
          <p className="text-xs text-blue-700">
            Every rule inherits a schedule from the most specific active schedule that applies to it.
            Priority (highest → lowest):
          </p>
          <div className="grid grid-cols-5 gap-2 text-xs">
            {PRIORITY_ORDER.map((level, idx) => {
              const m = LEVEL_META[level]
              return (
                <div key={level} className="flex flex-col items-center gap-1">
                  <div className={clsx('flex items-center gap-1 px-2 py-1 rounded-full font-medium text-xs', m.color)}>
                    {m.icon} {m.label}
                  </div>
                  <span className="text-blue-600 font-bold text-base">{idx + 1}</span>
                  <p className="text-center text-blue-700 leading-snug">{m.desc}</p>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-blue-700 border-t border-blue-200 pt-2">
            <strong>Deduplication:</strong> If a rule has its own rule-level schedule, it will be skipped
            when a broader bundle (table/subdomain/domain/global) fires — preventing duplicate runs.
            New rules created after a bundle schedule is configured are <em>not</em> automatically added
            to existing bundles; you must edit the schedule to add them.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Rule selector for bundle schedules ────────────────────────────────────────

function RuleSelector({
  ruleStatuses,
  selectedIds,
  onChange,
  loading,
}: {
  ruleStatuses: RuleStatus[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  loading: boolean
}) {
  const [search, setSearch] = useState('')

  const filtered = ruleStatuses.filter(r =>
    (r.rule_description || r.rule_name).toLowerCase().includes(search.toLowerCase()) ||
    r.rule_type.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(x => x !== id)
        : [...selectedIds, id]
    )
  }

  const selectAll = () => onChange(ruleStatuses.filter(r => !r.has_rule_level_schedule).map(r => r.rule_id))
  const clearAll  = () => onChange([])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
        <Loader2 size={12} className="animate-spin" /> Loading rules…
      </div>
    )
  }

  if (ruleStatuses.length === 0) {
    return (
      <div className="text-xs text-gray-400 py-3 text-center">
        No active rules found for the selected scope
      </div>
    )
  }

  const availableCount = ruleStatuses.filter(r => !r.has_rule_level_schedule).length

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <Search size={12} className="text-gray-400 flex-shrink-0" />
        <input
          className="flex-1 text-xs bg-transparent outline-none placeholder-gray-400"
          placeholder="Search rules…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="text-xs text-gray-400 shrink-0">
          {selectedIds.length} of {availableCount} selected
        </span>
        <button type="button" onClick={selectAll}
          className="text-xs text-blue-600 hover:underline shrink-0">All</button>
        <button type="button" onClick={clearAll}
          className="text-xs text-gray-500 hover:underline shrink-0">None</button>
      </div>

      {/* Rule list */}
      <div className="max-h-52 overflow-y-auto divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-4">No rules match</div>
        ) : (
          filtered.map(r => {
            const isSelected = selectedIds.includes(r.rule_id)
            const blocked    = r.has_rule_level_schedule

            return (
              <label
                key={r.rule_id}
                className={clsx(
                  'flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                  blocked
                    ? 'bg-gray-50 cursor-not-allowed opacity-60'
                    : isSelected
                      ? 'bg-blue-50'
                      : 'hover:bg-gray-50'
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={blocked}
                  onChange={() => !blocked && toggle(r.rule_id)}
                  className="mt-0.5 accent-blue-600 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 leading-snug truncate">
                    {r.rule_description || toPlainEnglish(r.rule_name)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{r.rule_type.replace(/_/g, ' ')}</span>
                    <span className={clsx('text-xs font-medium', SEV_COLORS[r.severity] ?? 'text-gray-500')}>
                      {r.severity}
                    </span>
                    {blocked && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-600">
                        <AlertCircle size={10} /> own schedule
                      </span>
                    )}
                  </div>
                </div>
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Schedule form ─────────────────────────────────────────────────────────────

function ScheduleForm({
  initial, rules, domains, subdomains, assets, onSave, onCancel, saving, title,
}: {
  initial:    ScheduleFormData
  rules:      Rule[]
  domains:    Domain[]
  subdomains: Subdomain[]
  assets:     Asset[]
  onSave:     (data: ScheduleFormData) => void
  onCancel:   () => void
  saving:     boolean
  title:      string
}) {
  const [form, setForm] = useState<ScheduleFormData>(initial)
  const [ruleStatuses, setRuleStatuses] = useState<RuleStatus[]>([])
  const [loadingRules, setLoadingRules] = useState(false)

  const set = (k: keyof ScheduleFormData, v: any) => setForm(f => ({ ...f, [k]: v }))

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
  const level     = form.schedule_level
  const showTime  = ['daily', 'weekly', 'monthly'].includes(form.frequency)
  const showHourly = form.frequency === 'hourly'
  const preview   = cronPreview(form)
  const isBundleLevel = level !== 'rule'

  // Filter subdomains to selected domain
  const filteredSubdomains = form.domain_id
    ? subdomains.filter(sd => sd.domain_id === form.domain_id)
    : subdomains

  const levelMeta = LEVEL_META[level] ?? { label: level, desc: '', color: 'bg-gray-100 text-gray-700' }

  // Load rule statuses whenever the scope target changes for bundle-level schedules
  useEffect(() => {
    if (!isBundleLevel) return

    const params: { asset_id?: string; subdomain_id?: string; domain_id?: string } = {}
    if (level === 'table'     && form.asset_id)     params.asset_id     = form.asset_id
    if (level === 'subdomain' && form.subdomain_id) params.subdomain_id = form.subdomain_id
    if (level === 'domain'    && form.domain_id)    params.domain_id    = form.domain_id
    // For global, no filter — fetch all

    setLoadingRules(true)
    setRuleStatuses([])
    schedulesApi.rulesStatus(params)
      .then(res => setRuleStatuses(res.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingRules(false))
  }, [level, form.asset_id, form.subdomain_id, form.domain_id, isBundleLevel])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>

      {/* ── Step 1: Level ── */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-700 mb-2">
          1. Schedule Level
          <span className="ml-2 text-gray-400 font-normal">— what scope does this schedule cover?</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {PRIORITY_ORDER.map(lv => {
            const m = LEVEL_META[lv]
            return (
              <button
                key={lv}
                type="button"
                onClick={() => {
                  setForm(f => ({
                    ...f,
                    schedule_level: lv,
                    rule_id: '', asset_id: '', subdomain_id: '', domain_id: '',
                    rule_ids: [],
                  }))
                }}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all',
                  level === lv
                    ? `${m.color} border-current shadow-sm`
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                )}
              >
                {m.icon} {m.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">{levelMeta.desc}</p>
      </div>

      {/* ── Step 2: Target entity ── */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-700 mb-2">
          2. Target
          <span className="ml-2 text-gray-400 font-normal">— which {level === 'global' ? 'scope' : level} should this schedule apply to?</span>
        </label>

        {level === 'rule' && (
          <select className={inputCls} value={form.rule_id} onChange={e => set('rule_id', e.target.value)}>
            <option value="">Select a rule…</option>
            {rules.map(r => (
              <option key={r.rule_id} value={r.rule_id}>
                {r.rule_description || toPlainEnglish(r.rule_name)}
              </option>
            ))}
          </select>
        )}

        {level === 'table' && (
          <select className={inputCls} value={form.asset_id} onChange={e => set('asset_id', e.target.value)}>
            <option value="">Select a table…</option>
            {assets.map(a => (
              <option key={a.asset_id} value={a.asset_id}>
                {a.sf_schema_name}.{a.sf_table_name}
              </option>
            ))}
          </select>
        )}

        {level === 'subdomain' && (
          <>
            <select className={inputCls} value={form.domain_id}
              onChange={e => { set('domain_id', e.target.value); set('subdomain_id', ''); set('rule_ids', []) }}>
              <option value="">Filter by domain (optional)…</option>
              {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
            </select>
            <select className={clsx(inputCls, 'mt-2')} value={form.subdomain_id}
              onChange={e => { set('subdomain_id', e.target.value); set('rule_ids', []) }}>
              <option value="">Select a subdomain…</option>
              {filteredSubdomains.map(sd => (
                <option key={sd.subdomain_id} value={sd.subdomain_id}>{sd.subdomain_name}</option>
              ))}
            </select>
          </>
        )}

        {level === 'domain' && (
          <select className={inputCls} value={form.domain_id}
            onChange={e => { set('domain_id', e.target.value); set('rule_ids', []) }}>
            <option value="">Select a domain…</option>
            {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
          </select>
        )}

        {level === 'global' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
            <Globe size={13} className="text-gray-400" />
            Applies platform-wide — select rules below to include in the global bundle
          </div>
        )}
      </div>

      {/* ── Step 2.5: Rule selection (bundle schedules only) ── */}
      {isBundleLevel && (
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            3. Select Rules for this Bundle
            <span className="ml-2 text-gray-400 font-normal">
              — choose which rules run on this schedule
            </span>
          </label>
          <p className="text-xs text-gray-400 mb-2">
            Rules marked <span className="text-amber-600 font-medium">own schedule</span> already have
            a dedicated rule-level schedule and will be skipped automatically (no duplicate runs).
            Rules added to this platform after this schedule is saved will <em>not</em> be auto-included —
            edit this schedule to add them later.
          </p>
          <RuleSelector
            ruleStatuses={ruleStatuses}
            selectedIds={form.rule_ids}
            onChange={ids => set('rule_ids', ids)}
            loading={loadingRules}
          />
        </div>
      )}

      {/* ── Step 3 (or 4 for bundles): Frequency ── */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-700 mb-2">
          {isBundleLevel ? '4.' : '3.'} Frequency
        </label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <select className={inputCls} value={form.frequency} onChange={e => set('frequency', e.target.value)}>
              <option value="hourly">Every hour</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (Mon)</option>
              <option value="monthly">Monthly (1st)</option>
              <option value="cron">Custom cron expression</option>
              <option value="on_demand">On demand only</option>
            </select>
          </div>

          {showTime && (
            <>
              <div>
                <select className={inputCls} value={form.run_at_hour}
                  onChange={e => set('run_at_hour', parseInt(e.target.value))}>
                  {HOURS.map(h => <option key={h} value={h}>{fmtPad(h)}:00</option>)}
                </select>
              </div>
              <div>
                <select className={inputCls} value={form.run_at_minute}
                  onChange={e => set('run_at_minute', parseInt(e.target.value))}>
                  {MINUTES.map(m => <option key={m} value={m}>:{fmtPad(m)}</option>)}
                </select>
              </div>
            </>
          )}

          {showHourly && (
            <div>
              <select className={inputCls} value={form.run_at_minute}
                onChange={e => set('run_at_minute', parseInt(e.target.value))}>
                {MINUTES.map(m => <option key={m} value={m}>at :{fmtPad(m)}</option>)}
              </select>
            </div>
          )}

          {form.frequency === 'cron' && (
            <div className="col-span-2">
              <input className={inputCls} value={form.cron_expression}
                onChange={e => set('cron_expression', e.target.value)}
                placeholder="e.g. 0 6 * * *  (min hour day month weekday)" />
            </div>
          )}
        </div>

        {preview && (
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <Clock size={11} />
            <span>
              Cron: <span className="font-mono text-gray-700">{preview}</span>
              {' '}({form.timezone})
            </span>
          </div>
        )}
      </div>

      {/* ── Timezone ── */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-700 mb-2">
          {isBundleLevel ? '5.' : '4.'} Timezone
        </label>
        <select className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          value={form.timezone} onChange={e => set('timezone', e.target.value)}>
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={() => onSave(form)} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {saving ? 'Saving…' : 'Save Schedule'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Bundled rules popover ─────────────────────────────────────────────────────

function BundleRulesList({ rules }: { rules: BundledRule[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, flipUp: false })
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const flipUp = spaceBelow < 280
      setPos({
        top: flipUp ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        flipUp,
      })
    }
    setOpen(o => !o)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!rules || rules.length === 0) return null

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 mt-0.5"
      >
        <Package size={11} />
        {rules.length} rule{rules.length !== 1 ? 's' : ''} bundled
        <ChevronDown size={10} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          className="fixed z-50 w-80 bg-white rounded-xl border border-gray-200 shadow-xl p-3"
          style={pos.flipUp
            ? { bottom: window.innerHeight - pos.top, left: pos.left }
            : { top: pos.top, left: pos.left }
          }
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">
              Bundled Rules <span className="text-gray-400 font-normal">({rules.length})</span>
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
            >
              <X size={12} />
            </button>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {rules.map(r => (
              <div key={r.rule_id} className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
                <span className={clsx('text-xs font-bold shrink-0 mt-0.5 w-4', SEV_COLORS[r.severity] ?? 'text-gray-500')}>
                  {r.severity[0].toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-800 leading-snug">
                    {r.rule_description || toPlainEnglish(r.rule_name)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{r.severity}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const { timezone } = useTimezone()
  const [schedules,   setSchedules]   = useState<EnrichedSchedule[]>([])
  const [rules,       setRules]       = useState<Rule[]>([])
  const [domains,     setDomains]     = useState<Domain[]>([])
  const [subdomains,  setSubdomains]  = useState<Subdomain[]>([])
  const [assets,      setAssets]      = useState<Asset[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)
  const [editId,      setEditId]      = useState<string | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [toggling,    setToggling]    = useState<string | null>(null)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [runningNow,  setRunningNow]  = useState<string | null>(null)
  const [runResult,   setRunResult]   = useState<Record<string, string>>({})
  // Explainer is closed by default; user opens on demand
  const [explainerOpen, setExplainerOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      schedulesApi.listEnriched(),
      rulesApi.list(),
      domainsApi.list(),
      subdomainsApi.list(),
      assetsApi.list(),
    ]).then(([s, r, d, sd, a]) => {
      setSchedules(s.data?.items ?? s.data ?? [])
      setRules(r.data?.items ?? r.data ?? [])
      setDomains(d.data?.items ?? d.data ?? [])
      setSubdomains(sd.data?.items ?? sd.data ?? [])
      setAssets(a.data?.items ?? a.data ?? [])
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // ── payload helpers ─────────────────────────────────────────────────────────

  function formToPayload(form: ScheduleFormData) {
    const isBundleLevel = form.schedule_level !== 'rule'
    return {
      schedule_level:   form.schedule_level,
      frequency:        form.frequency,
      cron_expression:  form.cron_expression || undefined,
      timezone:         form.timezone,
      run_at_hour:      form.run_at_hour,
      run_at_minute:    form.run_at_minute,
      rule_id:          form.schedule_level === 'rule'      ? form.rule_id      || undefined : undefined,
      asset_id:         form.schedule_level === 'table'     ? form.asset_id     || undefined : undefined,
      subdomain_id:     form.schedule_level === 'subdomain' ? form.subdomain_id || undefined : undefined,
      domain_id:        ['domain', 'subdomain'].includes(form.schedule_level) ? form.domain_id || undefined : undefined,
      // Always send rule_ids for bundle schedules (even if empty, to signal explicit selection)
      rule_ids:         isBundleLevel ? (form.rule_ids.length > 0 ? form.rule_ids : null) : undefined,
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleCreate = async (form: ScheduleFormData) => {
    setSaving(true)
    try {
      await schedulesApi.create(formToPayload(form))
      setShowCreate(false)
      load()
    } finally { setSaving(false) }
  }

  const handleEdit = async (form: ScheduleFormData) => {
    if (!editId) return
    setSaving(true)
    try {
      await schedulesApi.update(editId, formToPayload(form))
      setEditId(null)
      load()
    } finally { setSaving(false) }
  }

  const handleToggle = async (s: EnrichedSchedule) => {
    setToggling(s.schedule_id)
    try {
      if (s.is_active) await schedulesApi.pause(s.schedule_id)
      else             await schedulesApi.resume(s.schedule_id)
      load()
    } finally { setToggling(null) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule? This cannot be undone.')) return
    setDeleting(id)
    try { await schedulesApi.delete(id); setSchedules(p => p.filter(s => s.schedule_id !== id)) }
    finally { setDeleting(null) }
  }

  const handleRunNow = async (id: string) => {
    setRunningNow(id)
    setRunResult(prev => { const n = {...prev}; delete n[id]; return n })
    try {
      const res = await schedulesApi.runNow(id)
      const statuses = res.data.runs.map((r: any) => r.status)
      const summary  = statuses.length === 0
        ? 'nothing to run'
        : statuses.every((s: string) => s === 'passed')
          ? `${statuses.length} passed`
          : `${statuses.filter((s: string) => s === 'passed').length}/${statuses.length} passed`
      setRunResult(prev => ({ ...prev, [id]: summary }))
    } catch { setRunResult(prev => ({ ...prev, [id]: 'error' })) }
    finally  { setRunningNow(null) }
  }

  // ── Summary counts ──────────────────────────────────────────────────────────

  const active = schedules.filter(s => s.is_active).length
  const paused = schedules.filter(s => !s.is_active).length
  const byLevel = PRIORITY_ORDER.reduce<Record<string, number>>((acc, lv) => {
    acc[lv] = schedules.filter(s => s.schedule_level === lv).length
    return acc
  }, {})

  return (
    <div className="p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedules</h1>
          <p className="text-sm text-gray-500 mt-1">
            {active} active · {paused} paused · {schedules.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExplainerOpen(o => !o)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors',
              explainerOpen
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
            title="How schedule levels work"
          >
            <Info size={13} />
            How it works
          </button>
          <button
            onClick={() => { setShowCreate(true); setEditId(null) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Plus size={14} /> New Schedule
          </button>
        </div>
      </div>

      {/* Level summary pills */}
      {schedules.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {PRIORITY_ORDER.filter(lv => byLevel[lv] > 0).map(lv => {
            const m = LEVEL_META[lv]
            return (
              <span key={lv} className={clsx('flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium', m.color)}>
                {m.icon} {m.label} <span className="opacity-60">({byLevel[lv]})</span>
              </span>
            )
          })}
        </div>
      )}

      {/* Explainer — closed by default, opened via "How it works" button */}
      <LevelExplainer open={explainerOpen} onToggle={() => setExplainerOpen(o => !o)} />

      {/* Create form */}
      {showCreate && (
        <ScheduleForm
          initial={EMPTY_FORM}
          rules={rules}
          domains={domains}
          subdomains={subdomains}
          assets={assets}
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
          saving={saving}
          title="Create New Schedule"
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Clock size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No schedules configured</p>
            <p className="text-sm mt-1">Create a schedule to automate rule execution</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[30%]">Target / Bundle</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[11%]">
                  <span title="Priority: Rule &gt; Table &gt; Subdomain &gt; Domain &gt; Global">Level ↑ priority</span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[12%]">Frequency</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[9%]">Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[10%]">Timezone</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[11%]">Next Run</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[7%]">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[10%]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => {
                const isBusy    = toggling === s.schedule_id || deleting === s.schedule_id
                const isEditing = editId   === s.schedule_id
                const lm        = LEVEL_META[s.schedule_level] ?? { label: s.schedule_level, color: 'bg-gray-100 text-gray-700', icon: null }

                const editInitial: ScheduleFormData = {
                  schedule_level:  s.schedule_level,
                  rule_id:         s.rule_id        || '',
                  asset_id:        s.asset_id       || '',
                  subdomain_id:    s.subdomain_id   || '',
                  domain_id:       s.domain_id      || '',
                  frequency:       s.frequency,
                  cron_expression: s.cron_expression || '',
                  timezone:        s.timezone,
                  run_at_hour:     s.run_at_hour    ?? 6,
                  run_at_minute:   s.run_at_minute  ?? 0,
                  rule_ids:        s.rule_ids ?? [],
                }

                const timeLabel = (() => {
                  if (s.frequency === 'cron')      return s.cron_expression || '—'
                  if (s.frequency === 'on_demand') return '—'
                  if (s.frequency === 'hourly')    return `:${fmtPad(s.run_at_minute ?? 0)}`
                  return `${fmtPad(s.run_at_hour ?? 6)}:${fmtPad(s.run_at_minute ?? 0)}`
                })()

                const priority = PRIORITY_ORDER.indexOf(s.schedule_level) + 1

                return (
                  <React.Fragment key={s.schedule_id}>
                    <tr className={clsx('border-b border-gray-100 group hover:bg-gray-50/50 transition-colors', !s.is_active && 'opacity-60')}>

                      {/* Target + bundle */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 text-sm leading-snug">
                          {targetLabel(s)}
                        </p>
                        {targetSubLabel(s) && (
                          <p className="text-xs text-gray-400 mt-0.5">{targetSubLabel(s)}</p>
                        )}
                        {/* Bundle rule count for non-rule schedules */}
                        {s.schedule_level !== 'rule' && (
                          <BundleRulesList rules={s.bundled_rules ?? []} />
                        )}
                        {runResult[s.schedule_id] && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className={clsx('text-xs font-medium',
                              runResult[s.schedule_id].includes('passed') ? 'text-green-600' : 'text-red-500')}>
                              Last run: {runResult[s.schedule_id]}
                            </p>
                            <Link href={runLogsUrl(s)}
                              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                              View logs <ExternalLink size={10} />
                            </Link>
                          </div>
                        )}
                      </td>

                      {/* Level */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={clsx('flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', lm.color)}
                            title={`Priority ${priority} of 5 — ${LEVEL_META[s.schedule_level]?.desc || ''}`}
                          >
                            {lm.icon} {lm.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">P{priority}</p>
                      </td>

                      {/* Frequency */}
                      <td className="px-4 py-3">
                        <span className={clsx('text-xs font-medium px-2.5 py-0.5 rounded-full',
                          FREQ_COLORS[s.frequency] ?? 'bg-gray-100 text-gray-600')}>
                          {FREQ_LABELS[s.frequency] ?? s.frequency}
                        </span>
                      </td>

                      {/* Time */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{timeLabel}</td>

                      {/* Timezone */}
                      <td className="px-4 py-3 text-xs text-gray-500" title={s.timezone}>
                        {s.timezone.split('/').pop()?.replace('_', ' ')}
                      </td>

                      {/* Next run */}
                      <td className="px-4 py-3">
                        {s.is_active && s.frequency !== 'on_demand' ? (
                          <div className="flex items-center gap-1 text-xs">
                            <Calendar size={11} className="text-blue-400 flex-shrink-0" />
                            <span className={clsx(s.next_run_time ? 'text-blue-700' : 'text-gray-400')}>
                              {fmtNextRun(s.next_run_time, timezone)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {s.frequency === 'on_demand' ? 'Manual only' : '—'}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={clsx('text-xs font-medium px-2.5 py-0.5 rounded-full',
                          s.is_active ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800')}>
                          {s.is_active ? 'Active' : 'Paused'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            title="Edit schedule"
                            onClick={() => setEditId(isEditing ? null : s.schedule_id)}
                            className={clsx('p-1.5 rounded-lg text-xs transition-colors',
                              isEditing ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100')}>
                            {isEditing ? <X size={13} /> : <Pencil size={13} />}
                          </button>

                          <button
                            title="Run now"
                            onClick={() => handleRunNow(s.schedule_id)}
                            disabled={runningNow === s.schedule_id || isBusy}
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50">
                            {runningNow === s.schedule_id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <PlayCircle size={13} />}
                          </button>

                          <button
                            title={s.is_active ? 'Pause schedule' : 'Resume schedule'}
                            onClick={() => handleToggle(s)}
                            disabled={isBusy}
                            className={clsx('p-1.5 rounded-lg transition-colors disabled:opacity-50',
                              s.is_active
                                ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                                : 'bg-green-50 text-green-700 hover:bg-green-100')}>
                            {toggling === s.schedule_id
                              ? <Loader2 size={13} className="animate-spin" />
                              : s.is_active ? <Pause size={13} /> : <Play size={13} />}
                          </button>

                          <button
                            title="Delete schedule"
                            onClick={() => handleDelete(s.schedule_id)}
                            disabled={isBusy}
                            className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50">
                            {deleting === s.schedule_id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={13} />}
                          </button>

                          <Link
                            href={runLogsUrl(s)}
                            title="View execution logs for this schedule"
                            className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                          >
                            <ExternalLink size={13} />
                          </Link>
                        </div>
                      </td>
                    </tr>

                    {/* Inline edit row */}
                    {isEditing && (
                      <tr>
                        <td colSpan={8} className="px-4 py-3 bg-blue-50/40 border-b border-gray-200">
                          <ScheduleForm
                            initial={editInitial}
                            rules={rules}
                            domains={domains}
                            subdomains={subdomains}
                            assets={assets}
                            onSave={handleEdit}
                            onCancel={() => setEditId(null)}
                            saving={saving}
                            title={`Edit schedule — ${targetLabel(s)}`}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
