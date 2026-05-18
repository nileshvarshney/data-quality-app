'use client'
import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import {
  Shield, Globe, Database, Calendar, User, Layers,
  Plus, Pencil, Trash2, CheckCircle, XCircle, RefreshCw,
  RotateCcw, Award, MinusCircle, AlertCircle, Search, X,
  ChevronDown, ChevronRight, Filter, Clock, Loader2,
  Activity, FileText, Download,
} from 'lucide-react'
import clsx from 'clsx'
import { auditApi } from '@/services/apiClient'
import { useTimezone } from '@/contexts/TimezoneContext'

// ── Types ─────────────────────────────────────────────────────────

interface AuditLog {
  audit_id: string
  user_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_value: Record<string, any> | null
  new_value: Record<string, any> | null
  created_at: string
}

// ── Config ────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { cls: string; label: string; icon: React.ElementType }> = {
  CREATE:             { cls: 'bg-green-100 text-green-800 border-green-200',   label: 'Create',       icon: Plus },
  UPDATE:             { cls: 'bg-blue-100 text-blue-800 border-blue-200',      label: 'Update',       icon: Pencil },
  DELETE:             { cls: 'bg-red-100 text-red-800 border-red-200',         label: 'Delete',       icon: Trash2 },
  DEACTIVATE:         { cls: 'bg-orange-100 text-orange-800 border-orange-200',label: 'Deactivate',   icon: MinusCircle },
  APPROVE:            { cls: 'bg-purple-100 text-purple-800 border-purple-200',label: 'Approve',      icon: CheckCircle },
  REJECT:             { cls: 'bg-red-100 text-red-800 border-red-200',         label: 'Reject',       icon: XCircle },
  STATUS_CHANGE:      { cls: 'bg-indigo-100 text-indigo-800 border-indigo-200',label: 'Status',       icon: RefreshCw },
  BULK_STATUS_CHANGE: { cls: 'bg-indigo-100 text-indigo-800 border-indigo-200',label: 'Bulk Status',  icon: Layers },
  CERTIFY:            { cls: 'bg-teal-100 text-teal-800 border-teal-200',      label: 'Certify',      icon: Award },
  ROLLBACK:           { cls: 'bg-amber-100 text-amber-800 border-amber-200',   label: 'Rollback',     icon: RotateCcw },
}
const ACTION_FALLBACK = { cls: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Action', icon: AlertCircle }

const ENTITY_CONFIG: Record<string, { cls: string; icon: React.ElementType }> = {
  rule:      { cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Shield },
  domain:    { cls: 'bg-blue-50 text-blue-700 border-blue-200',       icon: Globe },
  subdomain: { cls: 'bg-cyan-50 text-cyan-700 border-cyan-200',       icon: Layers },
  asset:     { cls: 'bg-purple-50 text-purple-700 border-purple-200', icon: Database },
  user:      { cls: 'bg-pink-50 text-pink-700 border-pink-200',       icon: User },
  schedule:  { cls: 'bg-amber-50 text-amber-700 border-amber-200',    icon: Calendar },
}
const ENTITY_FALLBACK = { cls: 'bg-gray-50 text-gray-600 border-gray-200', icon: FileText }

const PAGE_SIZES = [10, 25, 50, 100]

// ── Helpers ───────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Extract a human-readable entity name from new_value or old_value */
function entityName(log: AuditLog): string {
  const v = log.new_value || log.old_value
  if (!v) return '—'
  switch (log.entity_type) {
    case 'rule':      return v.rule_name || v.rule_description || '—'
    case 'domain':    return v.domain_name || '—'
    case 'subdomain': return v.subdomain_name || '—'
    case 'asset':     return v.sf_table_name ? `${v.sf_schema_name ? v.sf_schema_name + '.' : ''}${v.sf_table_name}` : '—'
    case 'user':      return v.full_name || v.email || '—'
    case 'schedule':  return v.frequency || '—'
    default:          return v.name || v.title || '—'
  }
}

/** Build a plain-English summary of what happened */
function describeSummary(log: AuditLog): string {
  const name = entityName(log)
  const et   = log.entity_type
  const nv   = log.new_value || {}
  switch (log.action) {
    case 'CREATE':             return `Created ${et} "${name}"`
    case 'UPDATE':             return `Updated ${et} "${name}"`
    case 'DELETE':             return `Deleted ${et} "${name}"`
    case 'DEACTIVATE':         return `Deactivated ${et} "${name}"`
    case 'APPROVE':            return `Approved ${et} "${name}"`
    case 'REJECT':             return `Rejected ${et} "${name}"${nv.rejection_reason ? ` — ${nv.rejection_reason}` : ''}`
    case 'STATUS_CHANGE':      return `Status of "${name}" changed to ${nv.status || nv.new_status || '—'}`
    case 'BULK_STATUS_CHANGE': return `Bulk status change on ${nv.rule_ids?.length ?? '?'} rules`
    case 'CERTIFY':            return `Certified "${name}" as ${nv.certification_status || '—'}`
    case 'ROLLBACK':           return `Rolled back "${name}" to version ${nv.version ?? '—'}`
    default:                   return `${log.action} on ${et} "${name}"`
  }
}

/** Compute changed fields for UPDATE diffs */
function diffFields(oldV: Record<string, any> | null, newV: Record<string, any> | null) {
  if (!oldV || !newV) return []
  const SKIP = new Set(['updated_at', 'created_at'])
  return Object.keys(newV)
    .filter(k => !SKIP.has(k) && JSON.stringify(oldV[k]) !== JSON.stringify(newV[k]))
    .map(k => ({ key: k, old: oldV[k], new: newV[k] }))
}

function userInitials(email: string | null): string {
  if (!email) return 'S'
  return email[0].toUpperCase()
}
function userColor(email: string | null): string {
  if (!email) return 'bg-gray-400'
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500', 'bg-orange-500']
  let h = 0
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return colors[h % colors.length]
}

// ── Action badge ──────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action] ?? ACTION_FALLBACK
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border', cfg.cls)}>
      <Icon size={10} />{cfg.label}
    </span>
  )
}

// ── Entity badge ──────────────────────────────────────────────────

function EntityBadge({ type }: { type: string }) {
  const cfg = ENTITY_CONFIG[type] ?? ENTITY_FALLBACK
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border', cfg.cls)}>
      <Icon size={9} />{type}
    </span>
  )
}

// ── User cell ─────────────────────────────────────────────────────

function UserCell({ email }: { email: string | null }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0', userColor(email))}>
        {userInitials(email)}
      </div>
      <span className="text-xs text-gray-700 truncate max-w-[140px]" title={email || 'system'}>
        {email || <span className="text-gray-400 italic">system</span>}
      </span>
    </div>
  )
}

// ── Expanded detail ───────────────────────────────────────────────

function LogDetail({ log }: { log: AuditLog }) {
  const { formatTs } = useTimezone()
  const diffs = diffFields(log.old_value, log.new_value)
  const isUpdate = log.action === 'UPDATE' && diffs.length > 0

  const renderValue = (v: any) => {
    if (v === null || v === undefined) return <span className="text-gray-400 italic">null</span>
    if (typeof v === 'boolean') return <span className={v ? 'text-green-600' : 'text-red-500'}>{String(v)}</span>
    if (typeof v === 'object') return <span className="font-mono text-[10px] text-gray-500">{JSON.stringify(v)}</span>
    return <span>{String(v)}</span>
  }

  const fmtKey = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <tr>
      <td colSpan={6} className="px-5 py-0 bg-slate-50 border-b border-gray-100">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden my-3 shadow-sm">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <FileText size={12} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-600">Audit Detail</span>
            <span className="text-[10px] text-gray-400">— {formatTs(log.created_at, { withSeconds: true, yearAlways: true })}</span>
            {log.entity_id && (
              <span className="ml-auto text-[10px] text-gray-400 font-mono">ID: {log.entity_id}</span>
            )}
          </div>
          <div className="p-4 space-y-4">
            {/* Summary */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-800">{describeSummary(log)}</p>
            </div>

            {/* Changed fields for UPDATE */}
            {isUpdate && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Changed Fields</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-1/4">Field</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-red-400 uppercase tracking-wide w-[37.5%]">Before</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-green-600 uppercase tracking-wide w-[37.5%]">After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {diffs.map(({ key, old: o, new: n }) => (
                        <tr key={key}>
                          <td className="px-3 py-2 font-medium text-gray-600">{fmtKey(key)}</td>
                          <td className="px-3 py-2 text-red-600 bg-red-50/40 line-through">{renderValue(o)}</td>
                          <td className="px-3 py-2 text-green-700 bg-green-50/40">{renderValue(n)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Full payload for CREATE / other actions */}
            {!isUpdate && (log.new_value || log.old_value) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {log.old_value && (
                  <div>
                    <p className="text-[10px] font-semibold text-red-500 uppercase tracking-widest mb-2">Before</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(log.old_value).map(([k, v]) => (
                        <div key={k} className="bg-red-50/40 rounded-lg px-2.5 py-1.5 border border-red-100/60">
                          <p className="text-[9px] text-gray-400 uppercase tracking-wide">{fmtKey(k)}</p>
                          <p className="text-[11px] text-gray-800 font-medium mt-0.5 truncate">{renderValue(v)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {log.new_value && (
                  <div>
                    <p className="text-[10px] font-semibold text-green-600 uppercase tracking-widest mb-2">Values</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(log.new_value).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
                        <div key={k} className="bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
                          <p className="text-[9px] text-gray-400 uppercase tracking-wide">{fmtKey(k)}</p>
                          <p className="text-[11px] text-gray-800 font-medium mt-0.5 truncate">{renderValue(v)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ── Filter chip ───────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[11px] font-medium">
      {label}
      <button onClick={onRemove} className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"><X size={10} /></button>
    </span>
  )
}

// ── Pagination ────────────────────────────────────────────────────

function Pagination({ page, pageSize, total, onChange, onSizeChange }: {
  page: number; pageSize: number; total: number
  onChange: (p: number) => void; onSizeChange: (s: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = Math.min((page - 1) * pageSize + 1, total)
  const end   = Math.min(page * pageSize, total)

  const pages: (number | '…')[] = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4)              return [1, 2, 3, 4, 5, '…', totalPages]
    if (page >= totalPages - 3) return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '…', page - 1, page, page + 1, '…', totalPages]
  })()

  const btn = 'min-w-[30px] h-7 px-2 text-xs rounded border transition-colors'
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
      <div className="flex items-center gap-3">
        <p className="text-xs text-gray-500">
          Showing <span className="font-semibold text-gray-700">{start}–{end}</span> of{' '}
          <span className="font-semibold text-gray-700">{total}</span> events
        </p>
        <select value={pageSize} onChange={e => { onSizeChange(Number(e.target.value)); onChange(1) }}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400">
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s} per page</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button disabled={page === 1} onClick={() => onChange(page - 1)}
          className={clsx(btn, 'border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed')}>
          ← Prev
        </button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} className="text-xs text-gray-400 px-1">…</span>
            : <button key={p} onClick={() => onChange(p as number)}
                className={clsx(btn, page === p ? 'bg-blue-600 text-white border-blue-600 font-semibold' : 'border-gray-200 text-gray-600 hover:bg-white')}>
                {p}
              </button>
        )}
        <button disabled={page === totalPages} onClick={() => onChange(page + 1)}
          className={clsx(btn, 'border-gray-200 text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed')}>
          Next →
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

const SEL = 'text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors'

export default function AuditPage() {
  const { formatTs, abbr, formatTime } = useTimezone()
  const [logs,     setLogs]     = useState<AuditLog[]>([])
  const [summary,  setSummary]  = useState<{ action: string; count: number }[]>([])
  const [loading,  setLoading]  = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

  // Filters
  const [search,      setSearch]      = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [userFilter,   setUserFilter]   = useState('')

  // Pagination
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const [logsRes, summaryRes] = await Promise.allSettled([
        auditApi.list({ limit: 500 }),
        auditApi.summary(),
      ])
      if (logsRes.status === 'fulfilled') {
        const d = logsRes.value.data
        setLogs(Array.isArray(d) ? d : (d.logs ?? []))
      }
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data)
      setLastRefreshed(new Date())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { setPage(1) }, [search, actionFilter, entityFilter, userFilter])

  // Client-side filtering
  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (actionFilter && l.action !== actionFilter) return false
      if (entityFilter && l.entity_type !== entityFilter) return false
      if (userFilter && !(l.user_email || '').toLowerCase().includes(userFilter.toLowerCase())) return false
      if (search) {
        const s = search.toLowerCase()
        const name = entityName(l).toLowerCase()
        const email = (l.user_email || '').toLowerCase()
        const desc = describeSummary(l).toLowerCase()
        if (!name.includes(s) && !email.includes(s) && !desc.includes(s)) return false
      }
      return true
    })
  }, [logs, actionFilter, entityFilter, userFilter, search])

  const paginated = useMemo(() =>
    filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  )

  // Derived lists for filter selects
  const uniqueActions = useMemo(() => [...new Set(logs.map(l => l.action))].sort(), [logs])
  const uniqueEntities = useMemo(() => [...new Set(logs.map(l => l.entity_type))].sort(), [logs])
  const uniqueUsers    = useMemo(() => [...new Set(logs.map(l => l.user_email).filter(Boolean))].sort() as string[], [logs])

  // Active filter chips
  const chips = [
    search       && { key: 'search', label: `"${search}"`,                 onRemove: () => setSearch('') },
    actionFilter && { key: 'action', label: `Action: ${actionFilter}`,     onRemove: () => setActionFilter('') },
    entityFilter && { key: 'entity', label: `Entity: ${entityFilter}`,     onRemove: () => setEntityFilter('') },
    userFilter   && { key: 'user',   label: `User: ${userFilter}`,         onRemove: () => setUserFilter('') },
  ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[]

  const clearAll = () => { setSearch(''); setActionFilter(''); setEntityFilter(''); setUserFilter('') }

  // KPI strip data
  const countFor = (action: string) => summary.find(s => s.action === action)?.count ?? 0
  const totalEvents   = logs.length
  const uniqueUserCnt = uniqueUsers.length
  const creates = countFor('CREATE')
  const updates = countFor('UPDATE') + countFor('STATUS_CHANGE') + countFor('BULK_STATUS_CHANGE')
  const deletes = countFor('DELETE') + countFor('DEACTIVATE')
  const approvals = countFor('APPROVE') + countFor('REJECT') + countFor('CERTIFY')

  const refreshAt = formatTime(lastRefreshed)

  return (
    <div className="p-6 space-y-5 max-w-[1600px]">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">System and user activity history · governance trail</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={12} />Updated {refreshAt}
          </div>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/audit/export?days=30`}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-green-400 hover:text-green-600 transition-all"
          >
            <Download size={12} />
            Export CSV
          </a>
          <button onClick={() => loadAll(true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-40">
            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Refresh
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total Events',    value: totalEvents,   icon: Activity,      bg: 'bg-blue-50',   iconCls: 'text-blue-600' },
            { label: 'Creates',         value: creates,       icon: Plus,          bg: 'bg-green-50',  iconCls: 'text-green-600' },
            { label: 'Updates',         value: updates,       icon: Pencil,        bg: 'bg-blue-50',   iconCls: 'text-blue-600' },
            { label: 'Deletes',         value: deletes,       icon: Trash2,        bg: 'bg-red-50',    iconCls: 'text-red-500' },
            { label: 'Active Users',    value: uniqueUserCnt, icon: User,          bg: 'bg-purple-50', iconCls: 'text-purple-600' },
          ].map(({ label, value, icon: Icon, bg, iconCls }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
              <div className={clsx('p-2 rounded-lg shrink-0', bg)}>
                <Icon size={15} className={iconCls} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 leading-tight tabular-nums">{value}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity log section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Section header + filters */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Activity Log</h2>
              {!loading && (
                <span className="text-[11px] text-gray-400">
                  {filtered.length !== logs.length
                    ? `${filtered.length} of ${logs.length} events`
                    : `${logs.length} events`}
                </span>
              )}
            </div>
            <span className="flex items-center gap-1 text-[11px] text-gray-400">
              <Filter size={11} />Filters
            </span>
          </div>

          {/* Filter controls */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Search name, user, action…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="pl-7 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 w-48 placeholder-gray-400"
              />
            </div>

            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className={SEL}>
              <option value="">All Actions</option>
              {uniqueActions.map(a => (
                <option key={a} value={a}>{ACTION_CONFIG[a]?.label ?? a}</option>
              ))}
            </select>

            <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} className={SEL}>
              <option value="">All Entity Types</option>
              {uniqueEntities.map(e => (
                <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
              ))}
            </select>

            <select value={userFilter} onChange={e => setUserFilter(e.target.value)} className={SEL}>
              <option value="">All Users</option>
              <option value="system">System</option>
              {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>

            {chips.length > 0 && (
              <button onClick={clearAll}
                className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-2.5 py-1.5 rounded-lg transition-colors">
                Clear all
              </button>
            )}
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {chips.map(c => <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />)}
            </div>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <Loader2 size={20} className="animate-spin text-blue-500" />
            <span className="text-sm">Loading audit logs…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 px-6">
            <Activity size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-medium text-gray-600">
              {logs.length === 0 ? 'No audit events recorded yet' : 'No events match the current filters'}
            </p>
            {chips.length > 0 && (
              <button onClick={clearAll} className="mt-3 text-xs text-blue-600 hover:underline">Clear all filters</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="w-9 px-3 py-3" />
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[18%]">Timestamp ({abbr})</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[18%]">User</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[10%]">Action</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest w-[10%]">Entity</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">What Changed</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(log => {
                  const isOpen = expanded === log.audit_id
                  return (
                    <Fragment key={log.audit_id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : log.audit_id)}
                        className={clsx(
                          'cursor-pointer border-b border-gray-100 transition-colors group',
                          isOpen ? 'bg-blue-50/30' : 'hover:bg-gray-50/60'
                        )}
                      >
                        <td className="px-3 py-3.5 text-gray-400">
                          {isOpen
                            ? <ChevronDown size={14} className="text-blue-500" />
                            : <ChevronRight size={14} className="group-hover:text-blue-400 transition-colors" />}
                        </td>

                        {/* Timestamp */}
                        <td className="px-4 py-3.5">
                          <p className="text-xs text-gray-700">{formatTs(log.created_at, { withSeconds: true, yearAlways: true })}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{relTime(log.created_at)}</p>
                        </td>

                        {/* User */}
                        <td className="px-4 py-3.5">
                          <UserCell email={log.user_email} />
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3.5">
                          <ActionBadge action={log.action} />
                        </td>

                        {/* Entity type + name */}
                        <td className="px-4 py-3.5">
                          <EntityBadge type={log.entity_type} />
                          <p className="text-xs font-medium text-gray-800 mt-1 truncate max-w-[120px]" title={entityName(log)}>
                            {entityName(log)}
                          </p>
                        </td>

                        {/* Human-readable description */}
                        <td className="px-4 py-3.5">
                          <p className="text-xs text-gray-700 leading-snug">{describeSummary(log)}</p>
                          {log.action === 'UPDATE' && (() => {
                            const diffs = diffFields(log.old_value, log.new_value)
                            return diffs.length > 0 ? (
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {diffs.length} field{diffs.length > 1 ? 's' : ''} changed: {diffs.slice(0, 3).map(d => d.key.replace(/_/g, ' ')).join(', ')}{diffs.length > 3 ? '…' : ''}
                              </p>
                            ) : null
                          })()}
                        </td>
                      </tr>
                      {isOpen && <LogDetail log={log} />}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <Pagination
            page={page} pageSize={pageSize} total={filtered.length}
            onChange={p => { setPage(p); setExpanded(null) }}
            onSizeChange={setPageSize}
          />
        )}
      </div>
    </div>
  )
}
