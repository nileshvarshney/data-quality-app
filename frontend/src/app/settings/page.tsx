'use client'
import { useEffect, useState, useCallback } from 'react'
import { configApi, connectionsApi, slaApi, domainsApi, schedulesApi } from '@/services/apiClient'
import {
  Settings, Database, Cloud, Bot, Clock, Info, Bell,
  CheckCircle, XCircle, Loader2, Eye, EyeOff, Save,
  RefreshCw, Plus, Pencil, Trash2, X, Wifi, Mail, Slack,
  Lock, KeyRound, Zap, Plug, ShieldCheck, Globe, AlertTriangle
} from 'lucide-react'
import { useTimezone } from '@/contexts/TimezoneContext'
import clsx from 'clsx'

// ── Field-level validation ────────────────────────────────────────────────────

function validateField(key: string, value: string): string {
  if (!value) return ''
  const isUrl = (v: string) => /^https?:\/\//.test(v)
  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  switch (key) {
    case 'slack_webhook_url':
      return isUrl(value) ? '' : 'Must be a valid URL starting with https://'
    case 'teams_webhook_url':
      return isUrl(value) ? '' : 'Must be a valid URL starting with https://'
    case 'alert_webhook_url':
      return isUrl(value) ? '' : 'Must be a valid URL starting with http:// or https://'
    case 'oauth_redirect_uri':
    case 'frontend_url':
    case 'vault_addr':
    case 'otel_endpoint':
      return isUrl(value) ? '' : 'Must be a valid URL starting with http:// or https://'
    case 'smtp_from_email':
      return isEmail(value) ? '' : 'Must be a valid email address'
    case 'alert_email_recipients':
      return value.split(',').map(s => s.trim()).every(isEmail) ? '' : 'All recipients must be valid email addresses'
    case 'openai_api_key':
      return value.startsWith('sk-') ? '' : 'OpenAI API keys start with sk-'
    case 'anthropic_api_key':
      return value.startsWith('sk-ant-') ? '' : 'Anthropic API keys start with sk-ant-'
    case 'gemini_api_key':
      return value.startsWith('AIza') ? '' : 'Gemini API keys start with AIza'
    case 'allowed_origins':
      return value.split(',').map(s => s.trim()).every(isUrl) ? '' : 'Each origin must start with http:// or https://'
    default:
      return ''
  }
}

// ── Shared types ──────────────────────────────────────────────────────────────

interface ConfigEntry {
  config_id: string; category: string; key: string; value: string | null
  is_secret: boolean; description: string | null; updated_by: string | null
  updated_at: string | null; has_value: boolean
}
type CategoryMap = Record<string, ConfigEntry[]>
type TestStatus = { status: 'idle' | 'testing' | 'ok' | 'error'; message: string }

interface SFConnection {
  connection_id: string; connection_name: string; account: string
  sf_user: string; password: string | null; has_password: boolean
  warehouse: string; role: string | null; default_database: string | null
  default_schema: string | null; description: string | null
  is_active: boolean; connection_type: string; is_primary_target: boolean
  created_at: string; updated_at: string
}


const MASKED = '***MASKED***'

const TABS = [
  { id: 'general',             label: 'General',             icon: Settings },
  { id: 'platform_connection', label: 'Platform Connection', icon: Database },
  { id: 'target_database',     label: 'Target Database',     icon: Cloud },
  { id: 'llm',                 label: 'LLM / AI',            icon: Bot },
  { id: 'notifications',       label: 'Notifications',       icon: Bell },
  { id: 'scheduler',           label: 'Scheduler',           icon: Clock },
  { id: 'sla',                 label: 'SLA & Quality',       icon: Info },
  { id: 'security',            label: 'Security',            icon: Lock },
  { id: 'oauth',               label: 'OAuth & SSO',         icon: KeyRound },
  { id: 'performance',         label: 'Performance',         icon: Zap },
  { id: 'integrations',        label: 'Integrations',        icon: Plug },
  { id: 'governance_config',   label: 'Governance',          icon: ShieldCheck },
  { id: 'connections',         label: 'Named Connections',   icon: Globe },
]

const LLM_PROVIDERS = [
  { value: 'ollama',       label: 'Ollama (Local)',      color: 'bg-green-100 text-green-800' },
  { value: 'openai',       label: 'OpenAI',              color: 'bg-blue-100 text-blue-800' },
  { value: 'claude',       label: 'Anthropic Claude',    color: 'bg-purple-100 text-purple-800' },
  { value: 'gemini_flash', label: 'Google Gemini Flash', color: 'bg-orange-100 text-orange-800' },
]

const TIMEZONES = [
  'America/Los_Angeles','America/Denver','America/Chicago','America/New_York',
  'America/Sao_Paulo','Europe/London','Europe/Paris','Europe/Berlin',
  'Asia/Dubai','Asia/Kolkata','Asia/Singapore','Asia/Tokyo','Australia/Sydney','UTC',
]

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function TestBanner({ status }: { status: TestStatus }) {
  if (status.status === 'idle') return null
  if (status.status === 'testing') return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
      <Loader2 size={14} className="animate-spin" /> Testing…
    </div>
  )
  const ok = status.status === 'ok'
  return (
    <div className={clsx('flex items-start gap-2 px-4 py-2.5 border rounded-lg text-sm',
      ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800')}>
      {ok ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
      <span>{status.message}</span>
    </div>
  )
}

function SaveBar({ saving, saved, onSave }: { saving: boolean; saved: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button onClick={onSave} disabled={saving}
        className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
      {saved && (
        <span className="flex items-center gap-1 text-sm text-green-600">
          <CheckCircle size={14} /> Saved
        </span>
      )}
    </div>
  )
}

function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-5">
      <Info size={14} className="mt-0.5 shrink-0" /><span>{children}</span>
    </div>
  )
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-9 font-mono" />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"

// ── Snowflake Connection Manager ──────────────────────────────────────────────

const EMPTY_CONN = {
  connection_name: '', account: '', sf_user: '', password: '',
  warehouse: 'DQ_EXECUTION_WH', role: '', default_database: '',
  default_schema: '', description: '',
}

function ConnectionForm({
  initial,
  connectionId,
  onSave,
  onCancel,
}: {
  initial?: Partial<typeof EMPTY_CONN>
  connectionId?: string
  onSave: (data: typeof EMPTY_CONN) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({ ...EMPTY_CONN, ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus>({ status: 'idle', message: '' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleTest = async () => {
    if (!form.account || !form.sf_user) {
      setTestStatus({ status: 'error', message: 'Account and user are required to test.' })
      return
    }
    setTestStatus({ status: 'testing', message: '' })
    try {
      let res
      if (form.password && form.password !== MASKED) {
        res = await connectionsApi.testCredentials({
          account: form.account,
          sf_user: form.sf_user,
          password: form.password,
          warehouse: form.warehouse || 'DQ_EXECUTION_WH',
          role: form.role || undefined,
          default_database: form.default_database || undefined,
          default_schema: form.default_schema || undefined,
        })
      } else if (connectionId) {
        res = await connectionsApi.test(connectionId)
      } else {
        setTestStatus({ status: 'error', message: 'Enter a password to test the connection.' })
        return
      }
      setTestStatus({ status: res.data.status, message: res.data.message })
    } catch (e: any) {
      setTestStatus({ status: 'error', message: e.response?.data?.detail || e.message })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.connection_name || !form.account || !form.sf_user) {
      setError('Connection name, account, and user are required.')
      return
    }
    setSaving(true); setError('')
    try { await onSave(form) } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 rounded-xl p-5 bg-gray-50 space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <XCircle size={14} />{error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <FieldLabel label="Connection Name *" hint="A friendly label, e.g. Production DW or Staging" />
          <input className={inputCls} value={form.connection_name} onChange={e => set('connection_name', e.target.value)} placeholder="Production DW" required />
        </div>
        <div>
          <FieldLabel label="Snowflake Account *" hint="myorg-myaccount or xy12345.us-east-1.aws" />
          <input className={inputCls} value={form.account} onChange={e => set('account', e.target.value)} placeholder="myorg-myaccount" required />
        </div>
        <div>
          <FieldLabel label="User *" />
          <input className={inputCls} value={form.sf_user} onChange={e => set('sf_user', e.target.value)} placeholder="dq_platform_user" required />
        </div>
        <div>
          <FieldLabel label="Password" hint={initial?.password ? 'Leave blank to keep existing password' : ''} />
          <SecretInput value={form.password} onChange={v => set('password', v)} placeholder={initial?.password ? '(unchanged)' : 'Enter password'} />
        </div>
        <div>
          <FieldLabel label="Warehouse" />
          <input className={inputCls} value={form.warehouse} onChange={e => set('warehouse', e.target.value)} placeholder="DQ_EXECUTION_WH" />
        </div>
        <div>
          <FieldLabel label="Role" hint="Optional — uses user default if blank" />
          <input className={inputCls} value={form.role} onChange={e => set('role', e.target.value)} placeholder="DQ_PLATFORM_ROLE" />
        </div>
        <div>
          <FieldLabel label="Default Database" hint="Optional — pre-selects in browser" />
          <input className={inputCls} value={form.default_database} onChange={e => set('default_database', e.target.value)} placeholder="MY_DATABASE" />
        </div>
        <div>
          <FieldLabel label="Default Schema" hint="Optional" />
          <input className={inputCls} value={form.default_schema} onChange={e => set('default_schema', e.target.value)} placeholder="PUBLIC" />
        </div>
        <div className="col-span-2">
          <FieldLabel label="Description" />
          <input className={inputCls} value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Production Snowflake for Revenue data" />
        </div>
      </div>
      <TestBanner status={testStatus} />
      <div className="flex gap-3">
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
          {saving ? 'Saving…' : 'Save Connection'}
        </button>
        <button type="button" onClick={handleTest} disabled={testStatus.status === 'testing'}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
          {testStatus.status === 'testing' ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
          {testStatus.status === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </form>
  )
}

function ConnectionCard({
  conn,
  onUpdated,
  onDeleted,
}: {
  conn: SFConnection
  onUpdated: (c: SFConnection) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>({ status: 'idle', message: '' })
  const [deleting, setDeleting] = useState(false)

  const handleTest = async () => {
    setTestStatus({ status: 'testing', message: '' })
    try {
      const res = await connectionsApi.test(conn.connection_id)
      setTestStatus({ status: res.data.status, message: res.data.message })
    } catch (e: any) {
      setTestStatus({ status: 'error', message: e.message })
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete connection "${conn.connection_name}"?`)) return
    setDeleting(true)
    try { await connectionsApi.delete(conn.connection_id); onDeleted(conn.connection_id) }
    finally { setDeleting(false) }
  }

  const handleSave = async (form: typeof EMPTY_CONN) => {
    const payload: any = { ...form }
    if (!payload.password) delete payload.password  // keep existing
    const res = await connectionsApi.update(conn.connection_id, payload)
    onUpdated(res.data)
    setEditing(false)
  }

  return (
    <div className={clsx('border rounded-xl p-4', conn.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60')}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{conn.connection_name}</span>
            <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
              conn.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500')}>
              {conn.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{conn.account}</p>
          {conn.description && <p className="text-xs text-gray-400 mt-0.5 italic">{conn.description}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={handleTest}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            <Wifi size={12} /> Test
          </button>
          <button onClick={() => setEditing(e => !e)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            <Pencil size={12} /> Edit
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-red-100 rounded-lg hover:bg-red-50 text-red-500 disabled:opacity-50">
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      </div>

      {/* Connection metadata */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          { label: 'User',      value: conn.sf_user },
          { label: 'Warehouse', value: conn.warehouse },
          { label: 'Role',      value: conn.role || '(default)' },
          { label: 'Password',  value: conn.has_password ? '●●●●●●●●' : 'Not set' },
          { label: 'Default DB',value: conn.default_database || '—' },
          { label: 'Default Schema', value: conn.default_schema || '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-lg px-2.5 py-1.5">
            <p className="text-gray-400">{label}</p>
            <p className="font-medium text-gray-700 font-mono truncate">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <TestBanner status={testStatus} />
      </div>

      {editing && (
        <div className="mt-4">
          <ConnectionForm
            initial={{
              connection_name: conn.connection_name,
              account: conn.account,
              sf_user: conn.sf_user,
              password: MASKED,
              warehouse: conn.warehouse,
              role: conn.role ?? '',
              default_database: conn.default_database ?? '',
              default_schema: conn.default_schema ?? '',
              description: conn.description ?? '',
            }}
            connectionId={conn.connection_id}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  )
}

// ── Database Tab ─────────────────────────────────────────────────────────────

function DatabaseTab({ onSaveParent }: { onSaveParent: () => Promise<void> }) {
  const [appDb,    setAppDb]    = useState('DQ_PLATFORM_DB')
  const [appSchema, setAppSchema] = useState('DQ_APP')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [saveErr,  setSaveErr]  = useState('')
  const [health,   setHealth]   = useState<'checking' | 'ok' | 'error'>('checking')
  const [healthMsg, setHealthMsg] = useState('')
  const [dirty,    setDirty]    = useState(false)

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--text)] font-mono'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await configApi.getAll()
      const all: Record<string, string> = {}
      Object.values(res.data.config as Record<string, any[]>).flat().forEach((e: any) => { all[e.key] = e.value ?? '' })
      if (all['snowflake_app_database']) setAppDb(all['snowflake_app_database'])
      if (all['snowflake_app_schema'])   setAppSchema(all['snowflake_app_schema'])
    } catch { /* keep defaults */ }
    finally { setLoading(false) }
  }, [])

  const checkHealth = useCallback(async () => {
    setHealth('checking')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/health`)
      const data = await res.json()
      const dbStatus: string = data?.checks?.database ?? ''
      setHealth(dbStatus.toLowerCase().includes('ok') ? 'ok' : 'error')
      setHealthMsg(dbStatus)
    } catch (e: any) { setHealth('error'); setHealthMsg(e.message || 'Cannot reach API') }
  }, [])

  useEffect(() => { load(); checkHealth() }, [load, checkHealth])

  const handleSave = async () => {
    setSaving(true); setSaveErr('')
    try {
      await configApi.bulkUpdate({ snowflake_app_database: appDb, snowflake_app_schema: appSchema })
      setSaved(true); setDirty(false)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) { setSaveErr(e.response?.data?.detail || e.message || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-[var(--text)]">Snowflake App Database</h2>
          <p className="text-xs text-gray-500 dark:text-[var(--text-3)] mt-0.5">
            Snowflake stores all platform metadata — rules, runs, alerts, and audit logs.
          </p>
        </div>
        <button onClick={checkHealth} className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all hover:opacity-80"
          style={health === 'ok'
            ? { background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: '#16a34a' }
            : health === 'error'
            ? { background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#dc2626' }
            : { background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.2)', color: '#6366f1' }}>
          {health === 'checking' && <Loader2 size={11} className="animate-spin" />}
          {health === 'ok'       && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          {health === 'error'    && <span className="w-2 h-2 rounded-full bg-red-500" />}
          {health === 'checking' ? 'Checking…' : health === 'ok' ? 'Connected' : 'Disconnected'}
        </button>
      </div>

      {health === 'error' && healthMsg && (
        <div className="flex items-start gap-2 px-4 py-3 mb-5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-sm text-red-700 dark:text-red-300">
          <XCircle size={14} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Connection error: </span>{healthMsg}
            <p className="text-xs mt-1 opacity-70">Check your Snowflake credentials in the Snowflake tab and ensure SNOWFLAKE_ACCOUNT / SNOWFLAKE_USER / SNOWFLAKE_PASSWORD are set.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-blue-500" /></div>
      ) : (
        <>
          {/* ── App database / schema ── */}
          <div className="border border-gray-200 dark:border-[var(--border)] rounded-xl p-5 mb-5 card-accent-top">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-[var(--text-2)] mb-1">Platform Tables Location</h3>
            <p className="text-xs text-gray-400 dark:text-[var(--text-4)] mb-4">
              The Snowflake database and schema where the platform stores its own tables (rules, runs, users, audit logs, etc.).
              This is separate from the source data being quality-checked.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-[var(--text-3)] mb-1">App Database</label>
                <input className={inputCls} value={appDb} onChange={e => { setAppDb(e.target.value); setDirty(true) }} placeholder="DQ_PLATFORM_DB" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-[var(--text-3)] mb-1">App Schema</label>
                <input className={inputCls} value={appSchema} onChange={e => { setAppSchema(e.target.value); setDirty(true) }} placeholder="DQ_APP" />
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-[var(--surface-sub)] border border-gray-200 dark:border-[var(--border)]">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Full path</p>
              <p className="text-[11px] font-mono text-gray-600 dark:text-[var(--text-3)]">{appDb}.{appSchema}.*</p>
            </div>
          </div>

          {/* ── Info callout ── */}
          <div className="border border-blue-100 dark:border-blue-500/15 bg-blue-50/50 dark:bg-blue-500/5 rounded-xl p-4 mb-5">
            <div className="flex items-center gap-2 mb-2">
              <Info size={13} className="text-blue-500" />
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Snowflake credentials</span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Account, user, password, warehouse, and role are configured via environment variables
              (<code className="bg-blue-100 dark:bg-blue-500/15 px-1 rounded">SNOWFLAKE_ACCOUNT</code>,{' '}
              <code className="bg-blue-100 dark:bg-blue-500/15 px-1 rounded">SNOWFLAKE_USER</code>, etc.).
              Add data source connections in the <strong>Snowflake</strong> tab.
            </p>
          </div>

          {/* ── Buttons ── */}
          {saveErr && (
            <div className="flex items-center gap-2 px-4 py-2.5 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <XCircle size={14} /> {saveErr}
            </div>
          )}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={handleSave} disabled={saving || !dirty}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 btn-gradient">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {saved && <span className="flex items-center gap-1 text-sm text-green-600"><CheckCircle size={14} /> Saved</span>}
          </div>

          {dirty && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle size={12} className="shrink-0" />
              Database/schema changes require an API server restart to take effect.
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SnowflakeTab() {
  const [connections, setConnections] = useState<SFConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  // Platform credentials
  const [creds, setCreds] = useState({
    sf_platform_account: '', sf_platform_user: '', sf_platform_password: '',
    sf_platform_warehouse: 'DQ_EXECUTION_WH', sf_platform_role: 'DQ_PLATFORM_ROLE',
    snowflake_app_database: '', snowflake_app_schema: 'PUBLIC',
  })
  const [hasPassword, setHasPassword] = useState(false)
  const [credSaving, setCredSaving] = useState(false)
  const [credSaved, setCredSaved] = useState(false)
  const [credErr, setCredErr] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus>({ status: 'idle', message: '' })

  const credInputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[var(--surface)] text-gray-900 dark:text-[var(--text)] font-mono'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [connRes, cfgRes] = await Promise.all([connectionsApi.list(), configApi.getAll()])
      setConnections(connRes.data)
      const all: Record<string, any> = {}
      Object.values(cfgRes.data.config as Record<string, any[]>).flat().forEach((e: any) => { all[e.key] = e })
      setCreds({
        sf_platform_account:   all['sf_platform_account']?.value   ?? '',
        sf_platform_user:      all['sf_platform_user']?.value      ?? '',
        sf_platform_password:  '',
        sf_platform_warehouse: all['sf_platform_warehouse']?.value ?? 'DQ_EXECUTION_WH',
        sf_platform_role:      all['sf_platform_role']?.value      ?? 'DQ_PLATFORM_ROLE',
        snowflake_app_database: all['snowflake_app_database']?.value ?? '',
        snowflake_app_schema:   all['snowflake_app_schema']?.value  ?? 'PUBLIC',
      })
      setHasPassword(all['sf_platform_password']?.has_value ?? false)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async (form: typeof EMPTY_CONN) => {
    const res = await connectionsApi.create(form)
    setConnections(prev => [...prev, res.data])
    setShowAdd(false)
  }

  const handleCredSave = async () => {
    setCredSaving(true); setCredErr(''); setCredSaved(false)
    try {
      const updates: Record<string, string> = {}
      Object.entries(creds).forEach(([k, v]) => {
        if (k === 'sf_platform_password' && v === '') return
        updates[k] = v
      })
      await configApi.bulkUpdate(updates)
      setCredSaved(true); setTimeout(() => setCredSaved(false), 3000)
      await load()
    } catch (e: any) { setCredErr(e.response?.data?.detail || e.message || 'Save failed') }
    finally { setCredSaving(false) }
  }

  const handleTest = async () => {
    setTestStatus({ status: 'testing', message: '' })
    try {
      const res = await configApi.testPlatformConnection()
      const d = res.data
      setTestStatus({ status: d.status === 'ok' ? 'ok' : 'error', message: d.message })
    } catch (e: any) {
      setTestStatus({ status: 'error', message: e.response?.data?.detail || e.message || 'Test failed' })
    }
  }

  return (
    <div>
      {/* ── Platform Credentials ── */}
      <div className="mb-7 border border-gray-200 dark:border-[var(--border)] rounded-xl overflow-hidden card-accent-top">
        <div className="px-5 py-4 bg-white dark:bg-[var(--surface)] border-b border-gray-100 dark:border-[var(--border)]">
          <h2 className="text-base font-semibold text-gray-900 dark:text-[var(--text)]">Platform Snowflake Credentials</h2>
          <p className="text-xs text-gray-500 dark:text-[var(--text-3)] mt-0.5">
            Connection used for rule execution and platform metadata. Credentials are stored encrypted in the database.
          </p>
        </div>
        <div className="px-5 py-5 bg-white dark:bg-[var(--surface)]">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 mb-5">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-[var(--text-3)] mb-1">Account *</label>
                  <input className={credInputCls} value={creds.sf_platform_account}
                    onChange={e => setCreds(c => ({ ...c, sf_platform_account: e.target.value }))}
                    placeholder="myorg-myaccount or xy12345.us-east-1.aws" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-[var(--text-3)] mb-1">User *</label>
                  <input className={credInputCls} value={creds.sf_platform_user}
                    onChange={e => setCreds(c => ({ ...c, sf_platform_user: e.target.value }))}
                    placeholder="SERVICE_ACCOUNT" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-[var(--text-3)] mb-1">
                    Password {hasPassword ? '(stored — leave blank to keep)' : '*'}
                  </label>
                  <SecretInput
                    value={creds.sf_platform_password}
                    onChange={v => setCreds(c => ({ ...c, sf_platform_password: v }))}
                    placeholder={hasPassword ? 'Leave blank to keep existing' : 'Enter password'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-[var(--text-3)] mb-1">Warehouse</label>
                  <input className={credInputCls} value={creds.sf_platform_warehouse}
                    onChange={e => setCreds(c => ({ ...c, sf_platform_warehouse: e.target.value }))}
                    placeholder="DQ_EXECUTION_WH" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-[var(--text-3)] mb-1">Role</label>
                  <input className={credInputCls} value={creds.sf_platform_role}
                    onChange={e => setCreds(c => ({ ...c, sf_platform_role: e.target.value }))}
                    placeholder="DQ_PLATFORM_ROLE" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-[var(--text-3)] mb-1">Default Database</label>
                  <input className={credInputCls} value={creds.snowflake_app_database}
                    onChange={e => setCreds(c => ({ ...c, snowflake_app_database: e.target.value }))}
                    placeholder="MY_DATABASE" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-[var(--text-3)] mb-1">Default Schema</label>
                  <input className={credInputCls} value={creds.snowflake_app_schema}
                    onChange={e => setCreds(c => ({ ...c, snowflake_app_schema: e.target.value }))}
                    placeholder="PUBLIC" />
                </div>
              </div>
              {credErr && (
                <div className="flex items-center gap-2 px-4 py-2.5 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <XCircle size={14} /> {credErr}
                </div>
              )}
              <TestBanner status={testStatus} />
              <div className="flex items-center gap-3 mt-4">
                <button onClick={handleCredSave} disabled={credSaving}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 btn-gradient">
                  {credSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {credSaving ? 'Saving…' : 'Save Credentials'}
                </button>
                <button onClick={handleTest} disabled={testStatus.status === 'testing'}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-gray-300 dark:border-[var(--border)] text-gray-700 dark:text-[var(--text-2)] hover:bg-gray-50 dark:hover:bg-[var(--surface)] disabled:opacity-40">
                  {testStatus.status === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                  Test Connection
                </button>
                {credSaved && <span className="flex items-center gap-1 text-sm text-green-600"><CheckCircle size={14} /> Saved</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Data Source Connections ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-[var(--text)]">Data Source Connections</h2>
          <p className="text-xs text-gray-500 dark:text-[var(--text-3)] mt-0.5">
            Each connection can access its own set of databases, schemas, and tables.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus size={13} /> Add Connection
        </button>
      </div>

      {showAdd && (
        <div className="mb-5">
          <ConnectionForm
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-blue-600" />
        </div>
      ) : connections.length === 0 ? (
        <div className="text-center py-14 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
          <Cloud size={36} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">No data source connections yet</p>
          <p className="text-sm mt-1">Add a connection to start browsing and executing rules</p>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map(conn => (
            <ConnectionCard
              key={conn.connection_id}
              conn={conn}
              onUpdated={updated => setConnections(prev => prev.map(c => c.connection_id === updated.connection_id ? updated : c))}
              onDeleted={id => setConnections(prev => prev.filter(c => c.connection_id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Config field helpers ──────────────────────────────────────────────────────

function Field({
  entry, value, onChange, type = 'text', placeholder, hint, children, error,
}: {
  entry: ConfigEntry; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; hint?: string; children?: React.ReactNode
  error?: string
}) {
  const [show, setShow] = useState(false)
  const isSecret = entry.is_secret
  const inputType = isSecret && !show ? 'password' : type
  const hasErr = !!error
  return (
    <div className="mb-5">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {entry.description || entry.key}
      </label>
      {children ?? (
        <div className="relative">
          <input type={inputType} value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder ?? (isSecret && entry.has_value ? 'Leave blank to keep existing value' : '')}
            className={clsx('w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 pr-10 font-mono',
              hasErr ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500')} />
          {isSecret && (
            <button type="button" onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
      )}
      {hasErr && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><XCircle size={11} /> {error}</p>}
      {!hasErr && hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {isSecret && entry.has_value && !hasErr && (
        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
          <CheckCircle size={11} /> A value is currently saved
        </p>
      )}
    </div>
  )
}

// ── SLA & Quality tab ─────────────────────────────────────────────────────────

function SlaQualityTab({ configApi: _configApi }: { configApi: typeof configApi }) {
  const [thresholds, setThresholds] = useState({
    sla_threshold: '95',
    warning_threshold: '85',
    critical_penalty: '25',
    high_penalty: '15',
    medium_penalty: '7',
    low_penalty: '3',
  })
  const [slaConfigs, setSlaConfigs] = useState<any[]>([])
  const [domains, setDomains] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [slaLoading, setSlaLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    Promise.all([
      _configApi.getAll('quality'),
      slaApi.list(),
      domainsApi.list(),
    ]).then(([cfg, sla, dom]) => {
      const entries: any[] = cfg.data?.items ?? cfg.data ?? []
      const t: any = { ...thresholds }
      entries.forEach((e: any) => { if (e.key in t) t[e.key] = e.value ?? t[e.key] })
      setThresholds(t)
      setSlaConfigs(sla.data ?? [])
      setDomains(dom.data ?? [])
      setSlaLoading(false)
    }).catch(() => setSlaLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveThresholds = async () => {
    setSaving(true)
    try {
      const updates: Record<string, string> = {}
      Object.entries(thresholds).forEach(([k, v]) => { updates[k] = String(v) })
      await _configApi.bulkUpdate(updates)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (cfg: any) => {
    setEditId(cfg.sla_id)
    setForm({ ...cfg })
    setShowForm(false)
  }

  const openNew = () => {
    setEditId(null)
    setForm({ entity_type: 'global', entity_id: 'global', min_quality_score: 95, max_failure_pct: 5, alert_on_breach: true, notification_emails: '', notification_slack_channel: '' })
    setShowForm(true)
  }

  const saveSla = async () => {
    if (editId) {
      await slaApi.update(editId, form)
    } else {
      await slaApi.create(form)
    }
    const r = await slaApi.list()
    setSlaConfigs(r.data ?? [])
    setEditId(null)
    setShowForm(false)
  }

  const deleteSla = async (id: string) => {
    await slaApi.delete(id)
    setSlaConfigs(s => s.filter(x => x.sla_id !== id))
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white'
  const numInp = `${inp} w-28`

  return (
    <div className="space-y-8">

      {/* ── Global quality thresholds ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Global Quality Thresholds</h2>
        <p className="text-sm text-gray-500 mb-5">
          These values control how quality scores are colored and when SLA breaches are triggered across all dashboards.
        </p>

        {/* Color key */}
        <div className="flex flex-wrap gap-3 mb-6">
          {[
            { color: 'bg-green-500', label: `≥ ${thresholds.sla_threshold}%`, desc: 'Healthy (SLA met)' },
            { color: 'bg-yellow-500', label: `${thresholds.warning_threshold}–${parseInt(thresholds.sla_threshold) - 1}%`, desc: 'Warning' },
            { color: 'bg-red-500',    label: `< ${thresholds.warning_threshold}%`, desc: 'Critical / SLA breach' },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <span className={`w-3 h-3 rounded-full ${c.color} shrink-0`} />
              <span className="text-xs font-semibold text-gray-700">{c.label}</span>
              <span className="text-xs text-gray-400">{c.desc}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              SLA Threshold (green floor) <span className="text-gray-400 font-normal">%</span>
            </label>
            <input type="number" min={0} max={100} value={thresholds.sla_threshold}
              onChange={e => setThresholds(t => ({ ...t, sla_threshold: e.target.value }))}
              className={numInp} />
            <p className="text-[11px] text-gray-400 mt-1">Score below this triggers SLA breach and turns red</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Warning Threshold <span className="text-gray-400 font-normal">%</span>
            </label>
            <input type="number" min={0} max={100} value={thresholds.warning_threshold}
              onChange={e => setThresholds(t => ({ ...t, warning_threshold: e.target.value }))}
              className={numInp} />
            <p className="text-[11px] text-gray-400 mt-1">Score below this turns yellow (warning state)</p>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl mb-5">
          <p className="text-xs font-semibold text-gray-700 mb-3">Severity Score Penalties</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { key: 'critical_penalty', label: 'Critical', cls: 'text-red-600' },
              { key: 'high_penalty',     label: 'High',     cls: 'text-orange-500' },
              { key: 'medium_penalty',   label: 'Medium',   cls: 'text-yellow-600' },
              { key: 'low_penalty',      label: 'Low',      cls: 'text-gray-500' },
            ].map(({ key, label, cls }) => (
              <div key={key}>
                <label className={`block text-xs font-semibold mb-1 ${cls}`}>{label} penalty</label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500">−</span>
                  <input type="number" min={0} max={100}
                    value={(thresholds as any)[key]}
                    onChange={e => setThresholds(t => ({ ...t, [key]: e.target.value }))}
                    className="w-16 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <span className="text-xs text-gray-400">pts</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Aggregate score = 100 − (sum of penalties for each failing rule). Minimum 0.
          </p>
        </div>

        <SaveBar saving={saving} saved={saved} onSave={saveThresholds} />
      </div>

      {/* ── Per-entity SLA configs ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Per-Entity SLA Configs</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Override thresholds and alert routing for specific domains, tables, or globally.
            </p>
          </div>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={13} /> Add Config
          </button>
        </div>

        {slaLoading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : (

          <>
            {/* Edit / Create form */}
            {(showForm || editId) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-4 space-y-4">
                <p className="text-sm font-semibold text-blue-900">{editId ? 'Edit SLA Config' : 'New SLA Config'}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Entity Type</label>
                    <select value={form.entity_type ?? 'global'}
                      onChange={e => setForm((f: any) => ({ ...f, entity_type: e.target.value, entity_id: e.target.value === 'global' ? 'global' : '' }))}
                      className={inp}>
                      <option value="global">Global (all domains)</option>
                      <option value="domain">Domain</option>
                      <option value="subdomain">Subdomain</option>
                      <option value="table">Table (asset_id)</option>
                    </select>
                  </div>

                  {form.entity_type !== 'global' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {form.entity_type === 'domain' ? 'Domain' : 'Entity ID'}
                      </label>
                      {form.entity_type === 'domain' ? (
                        <select value={form.entity_id ?? ''}
                          onChange={e => setForm((f: any) => ({ ...f, entity_id: e.target.value }))}
                          className={inp}>
                          <option value="">— select domain —</option>
                          {domains.map((d: any) => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
                        </select>
                      ) : (
                        <input value={form.entity_id ?? ''} onChange={e => setForm((f: any) => ({ ...f, entity_id: e.target.value }))}
                          placeholder="Paste the ID" className={inp} />
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Min Quality Score (%)</label>
                    <input type="number" min={0} max={100} value={form.min_quality_score ?? 95}
                      onChange={e => setForm((f: any) => ({ ...f, min_quality_score: parseFloat(e.target.value) }))}
                      className={inp} />
                    <p className="text-[11px] text-gray-400 mt-0.5">Alert fires when score drops below this</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Max Failure % (optional)</label>
                    <input type="number" min={0} max={100} value={form.max_failure_pct ?? 5}
                      onChange={e => setForm((f: any) => ({ ...f, max_failure_pct: parseFloat(e.target.value) }))}
                      className={inp} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Alert Email Recipients</label>
                    <input value={form.notification_emails ?? ''} onChange={e => setForm((f: any) => ({ ...f, notification_emails: e.target.value }))}
                      placeholder="team@company.com, oncall@company.com" className={inp} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Slack Webhook URL</label>
                    <input value={form.notification_slack_channel ?? ''} onChange={e => setForm((f: any) => ({ ...f, notification_slack_channel: e.target.value }))}
                      placeholder="https://hooks.slack.com/services/…" className={inp} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={saveSla}
                    className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
                    <Save size={13} /> {editId ? 'Update' : 'Create'}
                  </button>
                  <button onClick={() => { setEditId(null); setShowForm(false) }}
                    className="px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            {slaConfigs.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl text-gray-400">
                <Info size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No SLA configs yet</p>
                <p className="text-xs mt-1">Add a config to override thresholds for a specific domain or table.</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="text-left px-4 py-3">Scope</th>
                      <th className="text-left px-4 py-3">Min Score</th>
                      <th className="text-left px-4 py-3">Max Fail %</th>
                      <th className="text-left px-4 py-3">Notify</th>
                      <th className="text-right px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {slaConfigs.map((cfg: any) => (
                      <tr key={cfg.sla_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-gray-800 capitalize">{cfg.entity_type}</p>
                          {cfg.entity_id && cfg.entity_id !== 'global' && (
                            <p className="text-[10px] text-gray-400 font-mono">{cfg.entity_id.slice(0, 16)}…</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-bold ${cfg.min_quality_score >= 95 ? 'text-green-600' : cfg.min_quality_score >= 85 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {cfg.min_quality_score}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{cfg.max_failure_pct}%</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {cfg.notification_emails && <span className="text-[11px] text-gray-500 truncate max-w-[160px]">✉ {cfg.notification_emails.split(',')[0]}{cfg.notification_emails.includes(',') ? '…' : ''}</span>}
                            {cfg.notification_slack_channel && <span className="text-[11px] text-gray-500"># Slack</span>}
                            {!cfg.notification_emails && !cfg.notification_slack_channel && <span className="text-[11px] text-gray-300">Global routing</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEdit(cfg)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteSla(cfg.sla_id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Generic Nightly Job Panel ─────────────────────────────────────────────────

interface NightlyJobPanelProps {
  jobId: string
  title: string
  description: string
  defaultHour: number
  defaultMinute: number
  onConfigure: (enabled: boolean, hour: number, minute: number) => Promise<void>
  onRunNow: () => Promise<void>
}

function NightlyJobPanel({ jobId, title, description, defaultHour, defaultMinute, onConfigure, onRunNow }: NightlyJobPanelProps) {
  const { formatTs } = useTimezone()
  const [enabled, setEnabled] = useState(true)
  const [hour, setHour] = useState(defaultHour)
  const [minute, setMinute] = useState(defaultMinute)
  const [nextRun, setNextRun] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    schedulesApi.jobs().then(r => {
      const job = (r.data as any[]).find((j: any) => j.id === jobId)
      if (job) {
        setNextRun(job.next_run_time ?? null)
        if (job.trigger) {
          const m = job.trigger.match(/hour='?(\d+)'?.*minute='?(\d+)'?/)
          if (m) { setHour(parseInt(m[1])); setMinute(parseInt(m[2])) }
        }
        setEnabled(true)
      } else {
        setEnabled(false)
        setNextRun(null)
      }
    }).catch(() => {})
  }, [jobId])

  const handleSave = async () => {
    setSaving(true); setMsg('')
    try {
      await onConfigure(enabled, hour, minute)
      setSaved(true)
      setMsg(enabled
        ? `Saved — runs daily at ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
        : 'Saved — job disabled')
      setTimeout(() => setSaved(false), 3000)
      const r = await schedulesApi.jobs()
      const job = (r.data as any[]).find((j: any) => j.id === jobId)
      setNextRun(job?.next_run_time ?? null)
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  const handleRunNow = async () => {
    setRunning(true); setMsg('')
    try {
      await onRunNow()
      setMsg('Job started — running in the background.')
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed to start') }
    finally { setRunning(false) }
  }

  const selCls = 'px-2.5 py-1.5 border border-gray-200 dark:border-[var(--border)] rounded-lg text-xs bg-white dark:bg-[var(--surface)] text-gray-700 dark:text-[var(--text-2)] focus:outline-none focus:ring-1 focus:ring-indigo-400'

  return (
    <div className="mb-5 border border-gray-200 dark:border-[var(--border)] rounded-xl overflow-hidden card-accent-top">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-[var(--border)] flex items-center justify-between bg-white dark:bg-[var(--surface)]">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-[var(--text)]">{title}</h3>
          <p className="text-xs text-gray-400 dark:text-[var(--text-4)] mt-0.5">{description}</p>
        </div>
        <button type="button" onClick={() => setEnabled(e => !e)}
          className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-4', enabled ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-gray-600')}>
          <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>
      <div className="px-5 py-4 bg-gray-50/50 dark:bg-[var(--surface-sub)] space-y-4">
        <div className={clsx('flex items-center gap-4', !enabled && 'opacity-40 pointer-events-none')}>
          <span className="text-xs font-medium text-gray-600 dark:text-[var(--text-3)] w-20 shrink-0">Runs daily at</span>
          <div className="flex items-center gap-2">
            <select value={hour} onChange={e => setHour(parseInt(e.target.value))} className={selCls}>
              {Array.from({length: 24}, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">:</span>
            <select value={minute} onChange={e => setMinute(parseInt(e.target.value))} className={selCls}>
              {[0, 15, 30, 45].map(m => (
                <option key={m} value={m}>{String(m).padStart(2,'0')}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-gray-400 dark:text-[var(--text-4)]">platform timezone</span>
        </div>
        <div className="text-xs text-gray-500 dark:text-[var(--text-3)]">
          <span className="font-medium text-gray-700 dark:text-[var(--text-2)]">Next run: </span>
          {nextRun
            ? formatTs(nextRun)
            : enabled ? 'Calculating…' : 'Disabled'}
        </div>
        {msg && (
          <p className={clsx('text-xs flex items-center gap-1', saved ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-[var(--text-3)]')}>
            {saved && <CheckCircle size={11} />}{msg}
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 btn-gradient rounded-lg text-xs font-semibold disabled:opacity-50">
            {saving ? <><Loader2 size={11} className="animate-spin" /> Saving…</> : <><Save size={11} /> Save Schedule</>}
          </button>
          <button onClick={handleRunNow} disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-[var(--border)] text-gray-600 dark:text-[var(--text-2)] rounded-lg text-xs hover:bg-gray-50 dark:hover:bg-[var(--surface)] disabled:opacity-50">
            {running ? <><Loader2 size={11} className="animate-spin" /> Starting…</> : <><Zap size={11} /> Run Now</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Column Profiling Job Panel ────────────────────────────────────────────────

function ColumnProfilingJobPanel() {
  const { formatTs } = useTimezone()
  const [enabled, setEnabled] = useState(true)
  const [hour, setHour] = useState(2)
  const [minute, setMinute] = useState(0)
  const [nextRun, setNextRun] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState('')

  // Load current schedule from APScheduler jobs list
  useEffect(() => {
    schedulesApi.jobs().then(r => {
      const job = (r.data as any[]).find((j: any) => j.id === 'nightly_column_profile')
      if (job) {
        setNextRun(job.next_run_time ?? null)
        if (job.trigger) {
          const m = job.trigger.match(/hour='?(\d+)'?.*minute='?(\d+)'?/)
          if (m) { setHour(parseInt(m[1])); setMinute(parseInt(m[2])) }
        }
        setEnabled(true)
      } else {
        setEnabled(false)
        setNextRun(null)
      }
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true); setMsg('')
    try {
      await schedulesApi.columnProfileConfigure(enabled, hour, minute)
      setSaved(true); setMsg(enabled ? `Saved — runs daily at ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}` : 'Saved — profiling disabled')
      setTimeout(() => setSaved(false), 3000)
      // Refresh next run
      const r = await schedulesApi.jobs()
      const job = (r.data as any[]).find((j: any) => j.id === 'nightly_column_profile')
      setNextRun(job?.next_run_time ?? null)
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  const handleRunNow = async () => {
    setRunning(true); setMsg('')
    try {
      await schedulesApi.columnProfileRunNow()
      setMsg('Column profiling started for all active assets — stats will update in the background.')
    } catch (e: any) { setMsg(e.response?.data?.detail || 'Failed to start') }
    finally { setRunning(false) }
  }

  const selCls = 'px-2.5 py-1.5 border border-gray-200 dark:border-[var(--border)] rounded-lg text-xs bg-white dark:bg-[var(--surface)] text-gray-700 dark:text-[var(--text-2)] focus:outline-none focus:ring-1 focus:ring-indigo-400'

  return (
    <div className="mb-7 border border-gray-200 dark:border-[var(--border)] rounded-xl overflow-hidden card-accent-top">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-[var(--border)] flex items-center justify-between bg-white dark:bg-[var(--surface)]">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-[var(--text)]">Column Profiling Job</h3>
          <p className="text-xs text-gray-400 dark:text-[var(--text-4)] mt-0.5">
            Automatically re-profiles all active tables to keep Null %, Distinct, Min/Max, Top Values, and Sample Values fresh.
          </p>
        </div>
        {/* Enable/disable toggle */}
        <button type="button" onClick={() => setEnabled(e => !e)}
          className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0', enabled ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-gray-600')}>
          <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>

      <div className="px-5 py-4 bg-gray-50/50 dark:bg-[var(--surface-sub)] space-y-4">
        {/* Schedule time */}
        <div className={clsx('flex items-center gap-4', !enabled && 'opacity-40 pointer-events-none')}>
          <span className="text-xs font-medium text-gray-600 dark:text-[var(--text-3)] w-20 shrink-0">Runs daily at</span>
          <div className="flex items-center gap-2">
            <select value={hour} onChange={e => setHour(parseInt(e.target.value))} className={selCls}>
              {Array.from({length: 24}, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">:</span>
            <select value={minute} onChange={e => setMinute(parseInt(e.target.value))} className={selCls}>
              {[0, 15, 30, 45].map(m => (
                <option key={m} value={m}>{String(m).padStart(2,'0')}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-gray-400 dark:text-[var(--text-4)]">in your platform timezone</span>
        </div>

        {/* Next run + triggers info */}
        <div className="flex items-start gap-6 flex-wrap text-xs text-gray-500 dark:text-[var(--text-3)]">
          <div>
            <span className="font-medium text-gray-700 dark:text-[var(--text-2)]">Next run: </span>
            {nextRun
              ? formatTs(nextRun)
              : enabled ? 'Calculating…' : 'Disabled'}
          </div>
          <div><span className="font-medium text-gray-700 dark:text-[var(--text-2)]">Also runs: </span>Automatically when a new table is registered</div>
        </div>

        {/* Message */}
        {msg && (
          <p className={clsx('text-xs flex items-center gap-1', saved ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-[var(--text-3)]')}>
            {saved && <CheckCircle size={11} />}{msg}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 btn-gradient rounded-lg text-xs font-semibold disabled:opacity-50">
            {saving ? <><Loader2 size={11} className="animate-spin" /> Saving…</> : <><Save size={11} /> Save Schedule</>}
          </button>
          <button onClick={handleRunNow} disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-[var(--border)] text-gray-600 dark:text-[var(--text-2)] rounded-lg text-xs hover:bg-gray-50 dark:hover:bg-[var(--surface)] disabled:opacity-50">
            {running ? <><Loader2 size={11} className="animate-spin" /> Starting…</> : <><Zap size={11} /> Run Now</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general')
  const [config, setConfig] = useState<CategoryMap>({})
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set())
  const [pendingTab, setPendingTab] = useState<string | null>(null)
  const [dbTest, setDbTest] = useState<TestStatus>({ status: 'idle', message: '' })
  const [llmTest, setLlmTest] = useState<TestStatus>({ status: 'idle', message: '' })
  // Notification test statuses
  const [emailTest, setEmailTest]       = useState<TestStatus>({ status: 'idle', message: '' })
  const [slackTest, setSlackTest]       = useState<TestStatus>({ status: 'idle', message: '' })
  const [teamsTest, setTeamsTest]       = useState<TestStatus>({ status: 'idle', message: '' })
  const [pdTest,    setPdTest]          = useState<TestStatus>({ status: 'idle', message: '' })
  const [webhookTest, setWebhookTest]   = useState<TestStatus>({ status: 'idle', message: '' })
  // Integration test statuses
  const [vaultTest, setVaultTest]       = useState<TestStatus>({ status: 'idle', message: '' })
  const [awsTest, setAwsTest]           = useState<TestStatus>({ status: 'idle', message: '' })
  const [otelTest, setOtelTest]         = useState<TestStatus>({ status: 'idle', message: '' })
  // OAuth test status
  const [oauthTest, setOauthTest]       = useState<TestStatus>({ status: 'idle', message: '' })
  const { setTimezone } = useTimezone()

  // Platform connection state
  const [platformTestStatus, setPlatformTestStatus] = useState<TestStatus>({ status: 'idle', message: '' })
  const [platformEditing, setPlatformEditing] = useState(false)
  const [platformHasPassword, setPlatformHasPassword] = useState(false)

  // Target database state
  const [primaryTarget, setPrimaryTargetState] = useState<SFConnection | null>(null)
  const [loadingTarget, setLoadingTarget] = useState(false)
  const [showTargetForm, setShowTargetForm] = useState(false)

  const fetchPrimaryTarget = useCallback(async () => {
    setLoadingTarget(true)
    try {
      const res = await connectionsApi.getPrimaryTarget()
      setPrimaryTargetState(res.data as SFConnection)
    } catch {
      setPrimaryTargetState(null)
    } finally {
      setLoadingTarget(false)
    }
  }, [])

  useEffect(() => { fetchPrimaryTarget() }, [fetchPrimaryTarget])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await configApi.getAll()
      const grouped: CategoryMap = res.data.config
      setConfig(grouped)
      const initial: Record<string, string> = {}
      const flat: any[] = Object.values(grouped).flat()
      flat.forEach(e => {
        initial[e.key] = e.is_secret ? '' : (e.value ?? '')
      })
      const pwEntry = flat.find(e => e.key === 'sf_platform_password')
      setPlatformHasPassword(pwEntry?.has_value ?? false)
      setEdits(initial)
    } catch {
      // DB not yet reachable (bootstrap state) — fields stay blank so the user can fill them in
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const set = (key: string, value: string) => {
    setEdits(e => ({ ...e, [key]: value }))
    setSaved(false)
    setDirtyTabs(d => new Set(d).add(activeTab))
    const err = validateField(key, value)
    setValidationErrors(v => err ? { ...v, [key]: err } : Object.fromEntries(Object.entries(v).filter(([k]) => k !== key)))
  }
  const val = (key: string) => edits[key] ?? ''
  const fieldError = (key: string) => validationErrors[key] ?? ''
  const hasErrors = Object.keys(validationErrors).length > 0

  const switchTab = (id: string) => {
    if (dirtyTabs.has(activeTab)) { setPendingTab(id); return }
    setActiveTab(id); setSaved(false)
  }
  const confirmSwitch = async (save: boolean) => {
    if (save) await handleSave()
    else setDirtyTabs(d => { const n = new Set(d); n.delete(activeTab); return n })
    if (pendingTab) { setActiveTab(pendingTab); setSaved(false) }
    setPendingTab(null)
  }

  const entry = (key: string): ConfigEntry | undefined =>
    Object.values(config).flat().find(e => e.key === key)

  const fakeEntry = (key: string, description: string, isSecret = false): ConfigEntry => ({
    config_id: '', category: '', key, value: null, is_secret: isSecret,
    description, updated_by: null, updated_at: null, has_value: false,
    ...(entry(key) ?? {}),
  })

  const handleSave = async () => {
    setSaving(true); setSaved(false); setSaveError('')
    try {
      const rows = config[activeTab] ?? []
      const updates: Record<string, string> = {}
      rows.forEach(e => {
        const v = edits[e.key] ?? ''
        if (e.is_secret && v === '') return
        if (v === MASKED) return
        updates[e.key] = v
      })
      if (Object.keys(updates).length > 0) await configApi.bulkUpdate(updates)
      if (updates['display_timezone']) setTimezone(updates['display_timezone'])
      setSaved(true); setTimeout(() => setSaved(false), 3000)
      setDirtyTabs(d => { const n = new Set(d); n.delete(activeTab); return n })
      await load()
    } catch (e: any) {
      setSaveError(e.response?.data?.detail || e.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const runTest = async (fn: () => Promise<any>, setStatus: (s: TestStatus) => void) => {
    await handleSave()
    setStatus({ status: 'testing', message: '' })
    try { const res = await fn(); setStatus({ status: res.data.status, message: res.data.message }) }
    catch (e: any) { setStatus({ status: 'error', message: e.response?.data?.detail || e.response?.data?.message || e.message }) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-blue-600" />
    </div>
  )

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure connections, LLM providers, and platform behaviour</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-44 shrink-0">
          <nav className="space-y-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => switchTab(id)}
                className={clsx('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                  activeTab === id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
                <Icon size={15} />{label}
                {dirtyTabs.has(id) && id !== activeTab && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
              </button>
            ))}
          </nav>
        </div>

        {/* Panel */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6 min-h-[480px]">
          {saveError && (
            <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <XCircle size={14} className="mt-0.5 shrink-0" />
              <span>{saveError}</span>
              <button onClick={() => setSaveError('')} className="ml-auto text-red-400 hover:text-red-600">
                <X size={13} />
              </button>
            </div>
          )}

          {/* Unsaved-changes tab-switch warning (S4) */}
          {pendingTab && (
            <div className="flex items-center gap-3 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle size={14} className="shrink-0" />
              <span>Unsaved changes in this tab.</span>
              <button onClick={() => confirmSwitch(true)} disabled={saving || hasErrors}
                className="ml-auto px-3 py-1 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 disabled:opacity-50">
                Save &amp; switch
              </button>
              <button onClick={() => confirmSwitch(false)}
                className="px-3 py-1 border border-amber-300 text-amber-700 text-xs rounded-lg hover:bg-amber-100">
                Discard &amp; switch
              </button>
            </div>
          )}

          {/* ── General ── */}
          {activeTab === 'general' && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-5">General Settings</h2>
              <Field entry={fakeEntry('app_name', 'Platform display name')} value={val('app_name')} onChange={v => set('app_name', v)} />
              <Field entry={fakeEntry('app_env', 'Environment')} value={val('app_env')} onChange={v => set('app_env', v)} hint="local · staging · production">
                <select value={val('app_env')} onChange={e => set('app_env', e.target.value)} className={inputCls}>
                  <option value="local">local</option>
                  <option value="staging">staging</option>
                  <option value="production">production</option>
                </select>
              </Field>
              <Field
                entry={fakeEntry('display_timezone', 'Display Timezone')}
                value={val('display_timezone')}
                onChange={v => set('display_timezone', v)}
                hint="All timestamps across dashboards, runs, alerts, and audit logs will display in this timezone."
              >
                <div className="flex items-center gap-2">
                  <Globe size={15} className="text-gray-400 shrink-0" />
                  <select value={val('display_timezone')} onChange={e => set('display_timezone', e.target.value)} className={inputCls}>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </Field>
              <Field entry={fakeEntry('debug', 'Verbose SQL logging')} value={val('debug')} onChange={v => set('debug', v)} hint="Logs every SQL query — disable in production">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => set('debug', val('debug') === 'true' ? 'false' : 'true')}
                    className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      val('debug') === 'true' ? 'bg-blue-600' : 'bg-gray-200')}>
                    <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                      val('debug') === 'true' ? 'translate-x-6' : 'translate-x-1')} />
                  </button>
                  <span className="text-sm text-gray-600">{val('debug') === 'true' ? 'Enabled' : 'Disabled'}</span>
                </div>
              </Field>
              <SaveBar saving={saving} saved={saved} onSave={handleSave} />
            </div>
          )}

          {/* ── Platform Connection ── */}
          {activeTab === 'platform_connection' && (
            <div className="space-y-6">
              <SectionNote>
                These are the Snowflake credentials used by the platform to store its own tables (rules, runs, users, etc.).
                Changes take effect after restarting the server.
              </SectionNote>

              {/* Detail card (read-only view) */}
              {!platformEditing && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{val('sf_platform_account') || '(not configured)'}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800">Platform</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">{val('sf_platform_user') || '—'}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={async () => {
                          setPlatformTestStatus({ status: 'testing', message: '' })
                          try {
                            const res = await configApi.testPlatformConnection({})
                            setPlatformTestStatus({ status: res.data.status, message: res.data.message })
                          } catch (e: any) {
                            setPlatformTestStatus({ status: 'error', message: e.response?.data?.detail || e.message })
                          }
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                        <Wifi size={12} /> Test
                      </button>
                      <button
                        onClick={() => setPlatformEditing(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                        <Pencil size={12} /> Edit
                      </button>
                    </div>
                  </div>

                  {/* Connection metadata grid */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { label: 'Warehouse',   value: val('sf_platform_warehouse') || '—' },
                      { label: 'Role',        value: val('sf_platform_role') || '(default)' },
                      { label: 'Password',    value: platformHasPassword ? '●●●●●●●●' : 'Not set' },
                      { label: 'App Database',value: val('snowflake_app_database') || '—' },
                      { label: 'App Schema',  value: val('snowflake_app_schema') || '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                        <p className="text-gray-400">{label}</p>
                        <p className="font-medium text-gray-700 font-mono truncate">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3">
                    <TestBanner status={platformTestStatus} />
                  </div>
                </div>
              )}

              {/* Edit form */}
              {platformEditing && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel label="Account" hint="e.g. myorg-myaccount or xy12345.us-east-1.aws" />
                      <input className={inputCls} value={edits['sf_platform_account'] ?? ''} onChange={e => set('sf_platform_account', e.target.value)} placeholder="myorg-myaccount" />
                    </div>
                    <div>
                      <FieldLabel label="User" hint="Service account username" />
                      <input className={inputCls} value={edits['sf_platform_user'] ?? ''} onChange={e => set('sf_platform_user', e.target.value)} placeholder="dq_platform_user" />
                    </div>
                    <div>
                      <FieldLabel label="Password" hint="Leave blank to keep existing" />
                      <SecretInput value={edits['sf_platform_password'] ?? ''} onChange={v => set('sf_platform_password', v)} placeholder="(unchanged)" />
                    </div>
                    <div>
                      <FieldLabel label="Warehouse" />
                      <input className={inputCls} value={edits['sf_platform_warehouse'] ?? ''} onChange={e => set('sf_platform_warehouse', e.target.value)} placeholder="COMPUTE_WH" />
                    </div>
                    <div>
                      <FieldLabel label="Role" hint="Optional — uses account default if blank" />
                      <input className={inputCls} value={edits['sf_platform_role'] ?? ''} onChange={e => set('sf_platform_role', e.target.value)} placeholder="ACCOUNTADMIN" />
                    </div>
                    <div>
                      <FieldLabel label="App Database" hint="Database where platform tables live" />
                      <input className={inputCls} value={edits['snowflake_app_database'] ?? ''} onChange={e => set('snowflake_app_database', e.target.value)} placeholder="DQ_PLATFORM_DB" />
                    </div>
                    <div>
                      <FieldLabel label="App Schema" />
                      <input className={inputCls} value={edits['snowflake_app_schema'] ?? ''} onChange={e => set('snowflake_app_schema', e.target.value)} placeholder="DQ_APP" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <SaveBar saving={saving} saved={saved} onSave={async () => { await handleSave(); setPlatformEditing(false) }} />
                    <button
                      onClick={async () => {
                        setPlatformTestStatus({ status: 'testing', message: '' })
                        try {
                          const creds = {
                            account:   val('sf_platform_account')   || undefined,
                            user:      val('sf_platform_user')      || undefined,
                            password:  val('sf_platform_password')  || undefined,
                            warehouse: val('sf_platform_warehouse') || undefined,
                            role:      val('sf_platform_role')      || undefined,
                          }
                          const res = await configApi.testPlatformConnection(creds)
                          setPlatformTestStatus({ status: res.data.status, message: res.data.message })
                        } catch (e: any) {
                          setPlatformTestStatus({ status: 'error', message: e.response?.data?.detail || e.message })
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                      <Wifi size={14} /> Test Connection
                    </button>
                    <button
                      onClick={() => { setPlatformEditing(false); setPlatformTestStatus({ status: 'idle', message: '' }) }}
                      className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500">
                      Cancel
                    </button>
                  </div>
                  <TestBanner status={platformTestStatus} />
                </>
              )}
            </div>
          )}

          {/* ── Target Database ── */}
          {activeTab === 'target_database' && (
            <div className="space-y-6">
              <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-5">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span>
                  This is the Snowflake connection used for DQ rule execution when no specific
                  connection is assigned to a data asset.
                </span>
              </div>

              {loadingTarget && <div className="text-sm text-gray-400">Loading…</div>}

              {!loadingTarget && !primaryTarget && !showTargetForm && (
                <div className="text-center py-10 text-gray-400">
                  <Cloud size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm mb-4">No primary target connection configured.</p>
                  <button
                    onClick={() => setShowTargetForm(true)}
                    className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                    <Plus size={14} /> Add Target Connection
                  </button>
                </div>
              )}

              {!loadingTarget && !primaryTarget && showTargetForm && (
                <ConnectionForm
                  onSave={async (form) => {
                    const res = await connectionsApi.create({ ...form, connection_type: 'target', is_primary_target: false })
                    await connectionsApi.setPrimaryTarget(res.data.connection_id)
                    setShowTargetForm(false)
                    await fetchPrimaryTarget()
                  }}
                  onCancel={() => setShowTargetForm(false)}
                />
              )}

              {!loadingTarget && primaryTarget && (
                <ConnectionCard
                  conn={primaryTarget}
                  onUpdated={(_c: SFConnection) => { fetchPrimaryTarget() }}
                  onDeleted={(_id: string) => { setPrimaryTargetState(null) }}
                />
              )}
            </div>
          )}

          {/* ── Named Connections ── */}
          {activeTab === 'connections' && <SnowflakeTab />}

          {/* ── LLM ── */}
          {activeTab === 'llm' && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-3">LLM / AI Configuration</h2>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Active Provider</label>
                <div className="grid grid-cols-2 gap-3">
                  {LLM_PROVIDERS.map(p => (
                    <button key={p.value} type="button" onClick={() => set('llm_provider', p.value)}
                      className={clsx('flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-all',
                        val('llm_provider') === p.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white')}>
                      <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', p.color)}>
                        {val('llm_provider') === p.value ? '● Active' : '○'}
                      </span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <hr className="my-5 border-gray-100" />
              {/* Ollama */}
              <div className={clsx('mb-4 p-4 rounded-xl border', val('llm_provider') === 'ollama' ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100')}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">Ollama (Local)</h3>
                  {val('llm_provider') === 'ollama' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Active</span>}
                </div>
                <div className="grid grid-cols-2 gap-x-4">
                  <Field entry={fakeEntry('ollama_base_url', 'API base URL')} value={val('ollama_base_url')} onChange={v => set('ollama_base_url', v)} placeholder="http://localhost:11434" hint="Local: http://localhost:11434 · Docker: http://host.docker.internal:11434" />
                  <Field entry={fakeEntry('ollama_model', 'Model name')} value={val('ollama_model')} onChange={v => set('ollama_model', v)} placeholder="qwen2.5:7b-instruct" hint="Run 'ollama list' to see available models" />
                </div>
              </div>
              {/* OpenAI */}
              <div className={clsx('mb-4 p-4 rounded-xl border', val('llm_provider') === 'openai' ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100')}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">OpenAI</h3>
                  {val('llm_provider') === 'openai' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Active</span>}
                </div>
                <div className="grid grid-cols-2 gap-x-4">
                  <Field entry={fakeEntry('openai_api_key', 'API Key', true)} value={val('openai_api_key')} onChange={v => set('openai_api_key', v)} placeholder="sk-proj-..." />
                  <Field entry={fakeEntry('openai_model', 'Model')} value={val('openai_model')} onChange={v => set('openai_model', v)}>
                    <select value={val('openai_model')} onChange={e => set('openai_model', e.target.value)} className={inputCls}>
                      <option value="gpt-4o-mini">gpt-4o-mini (recommended)</option>
                      <option value="gpt-4o">gpt-4o</option>
                      <option value="gpt-4-turbo">gpt-4-turbo</option>
                      <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                    </select>
                  </Field>
                </div>
              </div>
              {/* Claude */}
              <div className={clsx('mb-4 p-4 rounded-xl border', val('llm_provider') === 'claude' ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100')}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">Anthropic Claude</h3>
                  {val('llm_provider') === 'claude' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Active</span>}
                </div>
                <div className="grid grid-cols-2 gap-x-4">
                  <Field entry={fakeEntry('anthropic_api_key', 'API Key', true)} value={val('anthropic_api_key')} onChange={v => set('anthropic_api_key', v)} placeholder="sk-ant-..." />
                  <Field entry={fakeEntry('claude_model', 'Model')} value={val('claude_model')} onChange={v => set('claude_model', v)}>
                    <select value={val('claude_model')} onChange={e => set('claude_model', e.target.value)} className={inputCls}>
                      <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet (recommended)</option>
                      <option value="claude-3-5-haiku-latest">claude-3-5-haiku (fast)</option>
                      <option value="claude-3-opus-latest">claude-3-opus</option>
                    </select>
                  </Field>
                </div>
              </div>
              {/* Gemini */}
              <div className={clsx('mb-4 p-4 rounded-xl border', val('llm_provider') === 'gemini_flash' ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100')}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">Google Gemini Flash</h3>
                  {val('llm_provider') === 'gemini_flash' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Active</span>}
                </div>
                <div className="grid grid-cols-2 gap-x-4">
                  <Field entry={fakeEntry('gemini_api_key', 'API Key', true)} value={val('gemini_api_key')} onChange={v => set('gemini_api_key', v)} placeholder="AIza..." />
                  <Field entry={fakeEntry('gemini_model', 'Model')} value={val('gemini_model')} onChange={v => set('gemini_model', v)}>
                    <select value={val('gemini_model')} onChange={e => set('gemini_model', e.target.value)} className={inputCls}>
                      <optgroup label="Gemini 2.5 (latest)">
                        <option value="gemini-2.5-flash">gemini-2.5-flash — recommended</option>
                        <option value="gemini-2.5-flash-8b">gemini-2.5-flash-8b — faster / cheaper</option>
                        <option value="gemini-2.5-pro">gemini-2.5-pro — most capable</option>
                      </optgroup>
                      <optgroup label="Gemini 2.0 (stable)">
                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                        <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite — fastest</option>
                      </optgroup>
                    </select>
                  </Field>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <SaveBar saving={saving} saved={saved} onSave={handleSave} />
                <button onClick={() => runTest(() => configApi.testLlm(), setLlmTest)}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">
                  <RefreshCw size={13} /> Test Active Provider
                </button>
              </div>
              <TestBanner status={llmTest} />
            </div>
          )}

          {/* ── Notifications ── */}
          {activeTab === 'notifications' && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Notification Channels</h2>
              <p className="text-sm text-gray-500 mb-5">
                Configure where alerts are delivered when rules fail. All channels are optional and additive.
              </p>

              {/* Email / SMTP */}
              <div className="mb-6 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Mail size={15} className="text-blue-600" />
                    <h3 className="text-sm font-semibold text-gray-800">Email (SMTP)</h3>
                  </div>
                  <button onClick={() => runTest(() => configApi.testNotification('email'), setEmailTest)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                    <RefreshCw size={11} /> Test Email
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4">
                  <Field entry={fakeEntry('smtp_host', 'SMTP Host')} value={val('smtp_host')} onChange={v => set('smtp_host', v)} placeholder="smtp.gmail.com" />
                  <Field entry={fakeEntry('smtp_port', 'Port')} value={val('smtp_port')} onChange={v => set('smtp_port', v)} placeholder="587" />
                  <Field entry={fakeEntry('smtp_user', 'Username')} value={val('smtp_user')} onChange={v => set('smtp_user', v)} placeholder="alerts@yourcompany.com" />
                  <Field entry={fakeEntry('smtp_password', 'Password', true)} value={val('smtp_password')} onChange={v => set('smtp_password', v)} placeholder="••••••••" />
                  <Field entry={fakeEntry('smtp_from_email', 'From Address')} value={val('smtp_from_email')} onChange={v => set('smtp_from_email', v)} placeholder="dq-platform@yourcompany.com" error={fieldError('smtp_from_email')} />
                  <Field entry={fakeEntry('alert_email_recipients', 'Alert Recipients')} value={val('alert_email_recipients')} onChange={v => set('alert_email_recipients', v)} placeholder="team@co.com,manager@co.com" hint="Comma-separated; domain owners are added automatically" error={fieldError('alert_email_recipients')} />
                </div>
                <TestBanner status={emailTest} />
              </div>

              {/* Slack */}
              <div className="mb-6 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Slack size={15} className="text-purple-600" />
                    <h3 className="text-sm font-semibold text-gray-800">Slack</h3>
                  </div>
                  <button onClick={() => runTest(() => configApi.testNotification('slack'), setSlackTest)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                    <RefreshCw size={11} /> Test Slack
                  </button>
                </div>
                <Field entry={fakeEntry('slack_webhook_url', 'Incoming Webhook URL')} value={val('slack_webhook_url')}
                  onChange={v => set('slack_webhook_url', v)} placeholder="https://hooks.slack.com/services/..."
                  hint="Create an Incoming Webhook in your Slack app. Per-domain channels can be set in SLA configs."
                  error={fieldError('slack_webhook_url')} />
                <TestBanner status={slackTest} />
              </div>

              {/* Microsoft Teams */}
              <div className="mb-6 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bell size={15} className="text-blue-700" />
                    <h3 className="text-sm font-semibold text-gray-800">Microsoft Teams</h3>
                  </div>
                  <button onClick={() => runTest(() => configApi.testNotification('teams'), setTeamsTest)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                    <RefreshCw size={11} /> Test Teams
                  </button>
                </div>
                <Field entry={fakeEntry('teams_webhook_url', 'Incoming Webhook URL')} value={val('teams_webhook_url')}
                  onChange={v => set('teams_webhook_url', v)} placeholder="https://outlook.office.com/webhook/..."
                  hint="Create an Incoming Webhook connector in your Teams channel."
                  error={fieldError('teams_webhook_url')} />
                <TestBanner status={teamsTest} />
              </div>

              {/* PagerDuty */}
              <div className="mb-6 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bell size={15} className="text-green-600" />
                    <h3 className="text-sm font-semibold text-gray-800">PagerDuty</h3>
                  </div>
                  <button onClick={() => runTest(() => configApi.testNotification('pagerduty'), setPdTest)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                    <RefreshCw size={11} /> Test PagerDuty
                  </button>
                </div>
                <Field entry={fakeEntry('pagerduty_integration_key', 'Integration Key (Events API v2)', true)}
                  value={val('pagerduty_integration_key')} onChange={v => set('pagerduty_integration_key', v)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  hint="Find this in PagerDuty → Services → Integrations → Events API v2." />
                <TestBanner status={pdTest} />
              </div>

              {/* Generic Webhook */}
              <div className="mb-6 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wifi size={15} className="text-gray-600" />
                    <h3 className="text-sm font-semibold text-gray-800">Custom Webhook</h3>
                  </div>
                  <button onClick={() => runTest(() => configApi.testNotification('webhook'), setWebhookTest)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                    <RefreshCw size={11} /> Test Webhook
                  </button>
                </div>
                <Field entry={fakeEntry('alert_webhook_url', 'Webhook URL (POST JSON)')} value={val('alert_webhook_url')}
                  onChange={v => set('alert_webhook_url', v)} placeholder="https://your-service.com/dq-alert"
                  hint="Receives a JSON body with: event, rule_name, severity, message, domain, table, failure_pct."
                  error={fieldError('alert_webhook_url')} />
                <TestBanner status={webhookTest} />
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 mb-5">
                <p className="font-semibold mb-1">Per-domain routing</p>
                <p>To route alerts for a specific domain to a dedicated Slack channel, configure the Slack webhook in the domain&apos;s <strong>SLA Configuration</strong>. Domain-level config overrides the global webhook for that domain&apos;s rules.</p>
              </div>

              <SaveBar saving={saving} saved={saved} onSave={handleSave} />
            </div>
          )}

          {/* ── Scheduler ── */}
          {activeTab === 'scheduler' && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-5">Scheduler Configuration</h2>

              <Field entry={fakeEntry('scheduler_enabled', 'Background Scheduler')} value={val('scheduler_enabled')} onChange={v => set('scheduler_enabled', v)}>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => set('scheduler_enabled', val('scheduler_enabled') === 'true' ? 'false' : 'true')}
                    className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', val('scheduler_enabled') === 'false' ? 'bg-gray-200' : 'bg-blue-600')}>
                    <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', val('scheduler_enabled') === 'false' ? 'translate-x-1' : 'translate-x-6')} />
                  </button>
                  <span className="text-sm text-gray-600">{val('scheduler_enabled') === 'false' ? 'Disabled — no rules will run automatically' : 'Enabled'}</span>
                </div>
              </Field>

              <Field entry={fakeEntry('default_timezone', 'Default timezone for scheduled runs')} value={val('default_timezone')} onChange={v => set('default_timezone', v)}>
                <select value={val('default_timezone')} onChange={e => set('default_timezone', e.target.value)} className={inputCls}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </Field>

              <Field entry={fakeEntry('global_schedule_frequency', 'Global default frequency')} value={val('global_schedule_frequency')} onChange={v => set('global_schedule_frequency', v)} hint="Applied to rules with no more-specific schedule configured">
                <select value={val('global_schedule_frequency')} onChange={e => set('global_schedule_frequency', e.target.value)} className={inputCls}>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily (recommended)</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="cron">Cron expression</option>
                  <option value="on_demand">On-demand only</option>
                </select>
              </Field>

              {val('global_schedule_frequency') === 'cron' && (
                <Field entry={fakeEntry('global_schedule_cron', 'Cron expression')} value={val('global_schedule_cron')} onChange={v => set('global_schedule_cron', v)}
                  placeholder="0 6 * * *" hint="Format: minute hour day-of-month month day-of-week — e.g. '0 6 * * *' runs at 6 AM daily" />
              )}

              <Field entry={fakeEntry('scheduler_type', 'Scheduler backend')} value={val('scheduler_type')} onChange={v => set('scheduler_type', v)}>
                <select value={val('scheduler_type')} onChange={e => set('scheduler_type', e.target.value)} className={inputCls}>
                  <option value="apscheduler">APScheduler (built-in)</option>
                </select>
              </Field>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-600 mb-5">
                <p className="font-medium text-gray-800 mb-2">Schedule inheritance priority</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Rule-level schedule (most specific — wins)</li>
                  <li>Table-level schedule</li>
                  <li>Subdomain-level schedule</li>
                  <li>Domain-level schedule</li>
                  <li>Global schedule above (least specific)</li>
                </ol>
                <a href="/schedules" className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2">
                  Manage schedules →
                </a>
              </div>
              <SaveBar saving={saving} saved={saved} onSave={handleSave} />
            </div>
          )}

          {/* ── SLA & Quality ── */}
          {activeTab === 'sla' && <SlaQualityTab configApi={configApi} />}

          {/* ── Security ── */}
          {activeTab === 'security' && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-5">Security Settings</h2>

              {/* Authentication */}
              <div className="mb-7">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">Authentication</h3>
                <Field
                  entry={fakeEntry('auth_required', 'Require Login')}
                  value={val('auth_required')}
                  onChange={v => set('auth_required', v)}
                  hint="Set to false for local dev mode — disables all auth checks"
                >
                  <select value={val('auth_required')} onChange={e => set('auth_required', e.target.value)} className={inputCls}>
                    <option value="true">true — login required (production)</option>
                    <option value="false">false — dev mode (no auth)</option>
                  </select>
                </Field>
                <Field
                  entry={fakeEntry('access_token_expire_minutes', 'Access Token Lifetime (minutes)')}
                  value={val('access_token_expire_minutes')}
                  onChange={v => set('access_token_expire_minutes', v)}
                  hint="Default: 30 minutes. Increase for longer sessions."
                >
                  <input
                    type="number" min={1} max={10080}
                    value={val('access_token_expire_minutes') || '30'}
                    onChange={e => set('access_token_expire_minutes', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    JWT Secret Key
                    <span className="ml-2 text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">env only</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="password"
                        disabled
                        value="(set via SECRET_KEY environment variable)"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-400 font-mono cursor-not-allowed"
                      />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
                      <span className="font-mono">openssl rand -hex 32</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Generate with <code className="bg-gray-100 px-1 rounded">openssl rand -hex 32</code> and set as the <code className="bg-gray-100 px-1 rounded">SECRET_KEY</code> environment variable.</p>
                </div>
              </div>

              {/* API Access */}
              <div className="mb-7">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">API Access</h3>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                  <p className="font-semibold mb-1">Service Account API Keys</p>
                  <p className="text-xs mb-2">
                    API keys for service accounts (CI/CD, external integrations) are managed separately.
                  </p>
                  <a href="/admin/users" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2">
                    Go to Admin → Service Accounts →
                  </a>
                </div>
              </div>

              {/* CORS & Rate Limits */}
              <div className="mb-7">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">CORS &amp; Rate Limits</h3>
                <Field
                  entry={fakeEntry('allowed_origins', 'Allowed Origins (CORS)')}
                  value={val('allowed_origins')}
                  onChange={v => set('allowed_origins', v)}
                  hint="Comma-separated allowed origins, e.g. http://localhost:3000,https://dq.yourcompany.com"
                  placeholder="http://localhost:3000,https://dq.yourcompany.com"
                />
                <Field
                  entry={fakeEntry('rate_limit_per_minute', 'Rate Limit (requests per minute)')}
                  value={val('rate_limit_per_minute')}
                  onChange={v => set('rate_limit_per_minute', v)}
                  hint="Applied per IP address. Set to 0 to disable rate limiting."
                >
                  <input
                    type="number" min={0}
                    value={val('rate_limit_per_minute') || '60'}
                    onChange={e => set('rate_limit_per_minute', e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>

              <SaveBar saving={saving} saved={saved} onSave={handleSave} />
            </div>
          )}

          {/* ── OAuth & SSO ── */}
          {activeTab === 'oauth' && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-5">OAuth &amp; SSO Configuration</h2>

              {/* Google OAuth2 */}
              <div className="mb-7">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Google OAuth2 / SSO</h3>
                  <button onClick={() => runTest(() => configApi.testOauth(), setOauthTest)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                    <RefreshCw size={11} /> Test OAuth
                  </button>
                </div>
                <Field entry={fakeEntry('google_client_id', 'Google Client ID')} value={val('google_client_id')} onChange={v => set('google_client_id', v)} placeholder="123456789-abc.apps.googleusercontent.com" />
                <Field entry={fakeEntry('google_client_secret', 'Google Client Secret', true)} value={val('google_client_secret')} onChange={v => set('google_client_secret', v)} placeholder="GOCSPX-..." />
                <Field entry={fakeEntry('oauth_redirect_uri', 'OAuth Redirect URI')} value={val('oauth_redirect_uri')} onChange={v => set('oauth_redirect_uri', v)} placeholder="http://localhost:8000/auth/oauth/google/callback" hint="Must exactly match an Authorized redirect URI in your Google Cloud Console." error={fieldError('oauth_redirect_uri')} />
                <Field entry={fakeEntry('frontend_url', 'Frontend URL')} value={val('frontend_url')} onChange={v => set('frontend_url', v)} placeholder="http://localhost:3000" hint="After SSO login the API redirects back to this URL with the access token." error={fieldError('frontend_url')} />
                <TestBanner status={oauthTest} />
              </div>

              {/* Callout */}
              <div className="mb-7 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <Info size={13} className="shrink-0" /> Google Cloud Console Setup
                </p>
                <p className="text-xs">
                  After saving, add the redirect URI above to your Google Cloud Console → APIs &amp; Services → Credentials → OAuth 2.0 Client → <strong>Authorized redirect URIs</strong>.
                </p>
              </div>

              {/* SSO User Provisioning */}
              <div className="mb-7">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">SSO User Provisioning</h3>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 space-y-2">
                  <p>
                    <span className="font-medium">Default role for new SSO users:</span>{' '}
                    <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded">viewer</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    First-time SSO users are automatically provisioned with the <strong>viewer</strong> role.
                    Admins can promote users to higher roles via User Management.
                  </p>
                  <a href="/admin/users" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2">
                    Admin → User Management →
                  </a>
                </div>
              </div>

              <SaveBar saving={saving} saved={saved} onSave={handleSave} />
            </div>
          )}

          {/* ── Performance ── */}
          {activeTab === 'performance' && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-5">Performance Settings</h2>

              {/* Snowflake Connection Pool */}
              <div className="mb-7">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">Snowflake Connection Pool</h3>
                <div className="grid grid-cols-2 gap-x-5">
                  <Field
                    entry={fakeEntry('snowflake_pool_min_size', 'Pool Min Size')}
                    value={val('snowflake_pool_min_size')}
                    onChange={v => set('snowflake_pool_min_size', v)}
                    hint="Minimum number of persistent Snowflake connections."
                  >
                    <input
                      type="number" min={1} max={50}
                      value={val('snowflake_pool_min_size') || '1'}
                      onChange={e => set('snowflake_pool_min_size', e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field
                    entry={fakeEntry('snowflake_pool_max_size', 'Pool Max Size')}
                    value={val('snowflake_pool_max_size')}
                    onChange={v => set('snowflake_pool_max_size', v)}
                    hint="Increase for large rule batches (20+ rules per table)."
                  >
                    <input
                      type="number" min={1} max={100}
                      value={val('snowflake_pool_max_size') || '5'}
                      onChange={e => set('snowflake_pool_max_size', e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field
                    entry={fakeEntry('snowflake_pool_acquire_timeout', 'Pool Acquire Timeout (seconds)')}
                    value={val('snowflake_pool_acquire_timeout')}
                    onChange={v => set('snowflake_pool_acquire_timeout', v)}
                    hint="Max seconds to wait for a free connection from the pool."
                  >
                    <input
                      type="number" min={5} max={300}
                      value={val('snowflake_pool_acquire_timeout') || '30'}
                      onChange={e => set('snowflake_pool_acquire_timeout', e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field
                    entry={fakeEntry('execution_timeout_seconds', 'Rule Execution Timeout (seconds)')}
                    value={val('execution_timeout_seconds')}
                    onChange={v => set('execution_timeout_seconds', v)}
                    hint="Rules that exceed this duration are aborted and marked as error."
                  >
                    <input
                      type="number" min={10} max={3600}
                      value={val('execution_timeout_seconds') || '300'}
                      onChange={e => set('execution_timeout_seconds', e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>

              {/* Concurrency */}
              <div className="mb-7">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">Concurrency</h3>
                <div className="grid grid-cols-2 gap-x-5">
                  <Field
                    entry={fakeEntry('execution_max_retries', 'Max Execution Retries')}
                    value={val('execution_max_retries')}
                    onChange={v => set('execution_max_retries', v)}
                    hint="Number of times a failed rule execution is retried before marking as error."
                  >
                    <input
                      type="number" min={0} max={10}
                      value={val('execution_max_retries') || '3'}
                      onChange={e => set('execution_max_retries', e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>

              {/* Info callout */}
              <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                <p className="font-semibold mb-1">Throughput tip</p>
                <p>
                  Higher <code className="bg-blue-100 px-1 rounded">pool_max_size</code> = more concurrent Snowflake queries.
                  Set equal to your typical table&apos;s rule count for best throughput.
                  For tables with 20+ rules, a value of <strong>20–25</strong> is recommended.
                </p>
              </div>

              <SaveBar saving={saving} saved={saved} onSave={handleSave} />
            </div>
          )}

          {/* ── Integrations ── */}
          {activeTab === 'integrations' && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-5">Integrations</h2>

              {/* Vault / HashiCorp */}
              <div className="mb-7 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">Vault / HashiCorp</h3>
                  <button onClick={() => runTest(() => configApi.testVault(), setVaultTest)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                    <RefreshCw size={11} /> Test Vault
                  </button>
                </div>
                <Field entry={fakeEntry('vault_addr', 'Vault Address')} value={val('vault_addr')} onChange={v => set('vault_addr', v)} placeholder="https://vault.example.com" error={fieldError('vault_addr')} />
                <Field entry={fakeEntry('vault_token', 'Vault Token', true)} value={val('vault_token')} onChange={v => set('vault_token', v)} placeholder="hvs.CAESIQ..." />
                <Field entry={fakeEntry('vault_secret_path', 'Secret Path')} value={val('vault_secret_path')} onChange={v => set('vault_secret_path', v)} placeholder="secret/data/dq-platform/prod" hint="Vault secrets are loaded at startup and override .env values." />
                <TestBanner status={vaultTest} />
              </div>

              {/* AWS Secrets Manager */}
              <div className="mb-7 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">AWS Secrets Manager</h3>
                  <button onClick={() => runTest(() => configApi.testAwsSecrets(), setAwsTest)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                    <RefreshCw size={11} /> Test AWS
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-5">
                  <Field entry={fakeEntry('aws_secrets_name', 'Secret Name')} value={val('aws_secrets_name')} onChange={v => set('aws_secrets_name', v)} placeholder="prod/dq-platform/secrets" />
                  <Field entry={fakeEntry('aws_region', 'AWS Region')} value={val('aws_region')} onChange={v => set('aws_region', v)} placeholder="us-east-1" />
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 mb-3">
                  Uses IAM role or environment credentials. Requires{' '}
                  <code className="bg-gray-100 px-1 rounded">pip install boto3</code> on the API server.
                </div>
                <TestBanner status={awsTest} />
              </div>

              {/* OpenTelemetry (S5 — conditional fields) */}
              <div className="mb-7 p-4 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">OpenTelemetry (OTEL)</h3>
                  {val('otel_enabled') === 'true' && (
                    <button onClick={() => runTest(() => configApi.testOtel(), setOtelTest)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                      <RefreshCw size={11} /> Test OTEL
                    </button>
                  )}
                </div>
                <Field entry={fakeEntry('otel_enabled', 'Enable OTEL')} value={val('otel_enabled')} onChange={v => set('otel_enabled', v)} hint="Export quality metrics to an OpenTelemetry collector.">
                  <select value={val('otel_enabled')} onChange={e => set('otel_enabled', e.target.value)} className={inputCls}>
                    <option value="false">false — disabled</option>
                    <option value="true">true — enabled</option>
                  </select>
                </Field>
                {val('otel_enabled') === 'true' ? (
                  <>
                    <div className="grid grid-cols-2 gap-x-5">
                      <Field entry={fakeEntry('otel_endpoint', 'Collector Endpoint')} value={val('otel_endpoint')} onChange={v => set('otel_endpoint', v)} placeholder="http://otel-collector:4317" error={fieldError('otel_endpoint')} />
                      <Field entry={fakeEntry('otel_service_name', 'Service Name')} value={val('otel_service_name')} onChange={v => set('otel_service_name', v)} placeholder="dq-governance-platform" />
                    </div>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 mb-3">
                      Exports: <code className="bg-gray-100 px-1 rounded">dq.rule.quality_score</code>, <code className="bg-gray-100 px-1 rounded">dq.rule.failed_rows</code>, <code className="bg-gray-100 px-1 rounded">dq.alert.open_count</code>
                    </div>
                    <TestBanner status={otelTest} />
                  </>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Enable OTEL above to configure the exporter endpoint and service name.</p>
                )}
              </div>

              {/* dbt Integration */}
              <div className="mb-7 p-4 rounded-xl border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">dbt Integration</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>Upload your <code className="bg-gray-100 px-1 rounded text-xs">manifest.json</code> to sync model descriptions, column docs, and <code className="bg-gray-100 px-1 rounded text-xs">ref()</code> lineage.</p>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-xs text-gray-700">
                    POST /integrations/dbt/upload
                  </div>
                  <p className="text-xs text-gray-400">
                    Once uploaded, dbt model metadata is visible in the table browser and can be used to auto-generate rule suggestions.
                  </p>
                </div>
                <div className="mt-3">
                  <a href="/help#dbt" className="text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2">
                    View dbt integration docs →
                  </a>
                </div>
              </div>

              <SaveBar saving={saving} saved={saved} onSave={handleSave} />
            </div>
          )}

          {/* ── Governance Config ── */}
          {activeTab === 'governance_config' && (
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-[var(--text)] mb-5">Governance Configuration</h2>

              {/* ── Column Profiling Job ── */}
              <ColumnProfilingJobPanel />

              {/* Other Nightly Jobs */}
              <NightlyJobPanel
                jobId="nightly_aggregate"
                title="Quality Score Aggregation"
                description="Aggregates rule run results into daily quality score snapshots used by dashboards and trend charts."
                defaultHour={0}
                defaultMinute={5}
                onConfigure={(enabled, hour, minute) =>
                  schedulesApi.qualityAggregationConfigure(enabled, hour, minute).then(() => {})}
                onRunNow={() => schedulesApi.qualityAggregationRunNow().then(() => {})}
              />

              <NightlyJobPanel
                jobId="nightly_policy_evaluation"
                title="Policy Evaluation"
                description="Evaluates all active governance policies against current data quality scores and creates violation records."
                defaultHour={0}
                defaultMinute={15}
                onConfigure={(enabled, hour, minute) =>
                  schedulesApi.policyEvaluationConfigure(enabled, hour, minute).then(() => {})}
                onRunNow={() => schedulesApi.policyEvaluationRunNow().then(() => {})}
              />

              {/* Policy Defaults */}
              <div className="mb-7">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">Policy Defaults</h3>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 space-y-2">
                  <p>
                    Governance policies define organisation-wide rules for data quality thresholds, mandatory checks,
                    and escalation paths.
                  </p>
                  <a href="/governance" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2">
                    Manage Governance Policies →
                  </a>
                </div>
              </div>

              {/* Auto-Certification */}
              <div className="mb-7">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b border-gray-100">Auto-Certification</h3>
                <Field entry={fakeEntry('auto_certify_enabled', 'Enable auto-certification')} value={val('auto_certify_enabled')} onChange={v => set('auto_certify_enabled', v)} hint="Automatically certify tables that meet quality thresholds for a sustained period.">
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => set('auto_certify_enabled', val('auto_certify_enabled') === 'true' ? 'false' : 'true')}
                      className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors', val('auto_certify_enabled') === 'true' ? 'bg-blue-600' : 'bg-gray-200')}>
                      <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', val('auto_certify_enabled') === 'true' ? 'translate-x-6' : 'translate-x-1')} />
                    </button>
                    <span className="text-sm text-gray-600">{val('auto_certify_enabled') === 'true' ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </Field>
                {val('auto_certify_enabled') === 'true' && (
                  <div className="grid grid-cols-3 gap-x-4">
                    <Field entry={fakeEntry('auto_certify_min_score', 'Min quality score (%)')} value={val('auto_certify_min_score')} onChange={v => set('auto_certify_min_score', v)} hint="Score floor required for certification">
                      <input type="number" min={0} max={100} value={val('auto_certify_min_score') || '95'} onChange={e => set('auto_certify_min_score', e.target.value)} className={inputCls} />
                    </Field>
                    <Field entry={fakeEntry('auto_certify_min_rule_count', 'Min active rules')} value={val('auto_certify_min_rule_count')} onChange={v => set('auto_certify_min_rule_count', v)} hint="Minimum passing rules required">
                      <input type="number" min={1} max={100} value={val('auto_certify_min_rule_count') || '3'} onChange={e => set('auto_certify_min_rule_count', e.target.value)} className={inputCls} />
                    </Field>
                    <Field entry={fakeEntry('cert_required_after_days', 'Uncertified flag after (days)')} value={val('cert_required_after_days')} onChange={v => set('cert_required_after_days', v)} hint="Days before new tables are flagged">
                      <input type="number" min={1} max={365} value={val('cert_required_after_days') || '30'} onChange={e => set('cert_required_after_days', e.target.value)} className={inputCls} />
                    </Field>
                  </div>
                )}
              </div>

              {/* Compliance Frameworks */}
              <div className="mb-7">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">Compliance Frameworks</h3>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 space-y-2">
                  <p>
                    Map your data quality rules to compliance frameworks such as SOC 2, GDPR, HIPAA, or custom internal standards.
                    Active framework mappings are shown on the Compliance dashboard.
                  </p>
                  <a href="/compliance" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2">
                    View Compliance Frameworks →
                  </a>
                </div>
              </div>

              <SaveBar saving={saving} saved={saved} onSave={handleSave} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
