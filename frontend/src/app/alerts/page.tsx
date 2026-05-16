'use client'
import { useEffect, useState, useCallback } from 'react'
import { alertsApi } from '@/services/apiClient'
import { useTimezone } from '@/contexts/TimezoneContext'
import {
  Bell, CheckCircle, XCircle, AlertTriangle, AlertCircle,
  RefreshCw, Loader2, Database, Eye, EyeOff
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnrichedAlert {
  alert_id: string
  run_id: string
  rule_id: string
  domain_id: string
  subdomain_id: string
  asset_id: string
  severity: string
  alert_status: string
  alert_message: string | null
  notification_channel: string | null
  created_at: string
  resolved_at: string | null
  rule_name: string
  rule_description: string | null
  rule_type: string
  sf_database_name: string | null
  sf_schema_name: string
  sf_table_name: string
  domain_name: string
  subdomain_name: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { cls: string; icon: React.ReactNode; border: string; bg: string }> = {
  critical: { cls: 'bg-red-100 text-red-800',    icon: <XCircle      size={14} />, border: 'border-l-red-500',    bg: 'bg-red-50/30' },
  high:     { cls: 'bg-orange-100 text-orange-800', icon: <AlertCircle  size={14} />, border: 'border-l-orange-400', bg: 'bg-orange-50/20' },
  medium:   { cls: 'bg-yellow-100 text-yellow-800', icon: <AlertTriangle size={14} />, border: 'border-l-yellow-400', bg: 'bg-yellow-50/20' },
  low:      { cls: 'bg-gray-100 text-gray-600',  icon: <Bell         size={14} />, border: 'border-l-gray-300',   bg: '' },
}

const STATUS_TABS = [
  { value: '',             label: 'All' },
  { value: 'open',         label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved',     label: 'Resolved' },
  { value: 'ignored',      label: 'Ignored' },
]

function toPlainEnglish(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bId\b/g, 'ID')
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return null // fall back to absolute
}

// ── Alert card ────────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onAction,
}: {
  alert: EnrichedAlert
  onAction: (id: string, action: 'acknowledge' | 'resolve' | 'ignore') => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const { formatTs } = useTimezone()
  const sev = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.low
  const isOpen = alert.alert_status === 'open'
  const isAck = alert.alert_status === 'acknowledged'
  const fmtTime = (iso: string) => relTime(iso) ?? formatTs(iso)

  const act = async (action: 'acknowledge' | 'resolve' | 'ignore') => {
    setBusy(action)
    try { await onAction(alert.alert_id, action) }
    finally { setBusy(null) }
  }

  return (
    <div className={clsx(
      'bg-white rounded-xl border border-gray-200 border-l-4 overflow-hidden',
      sev.border, sev.bg,
      !isOpen && !isAck && 'opacity-70'
    )}>
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Severity icon */}
            <span className={clsx('flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full shrink-0 mt-0.5', sev.cls)}>
              {sev.icon}
              {alert.severity.toUpperCase()}
            </span>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm leading-snug">
                {alert.rule_description || toPlainEnglish(alert.rule_name)}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                {alert.alert_message}
              </p>
            </div>
          </div>

          {/* Status + timestamp */}
          <div className="text-right shrink-0">
            <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full', {
              'bg-red-100 text-red-700':    alert.alert_status === 'open',
              'bg-blue-100 text-blue-700':  alert.alert_status === 'acknowledged',
              'bg-green-100 text-green-700':alert.alert_status === 'resolved',
              'bg-gray-100 text-gray-500':  alert.alert_status === 'ignored',
            })}>
              {alert.alert_status}
            </span>
            <p className="text-xs text-gray-400 mt-1">{fmtTime(alert.created_at)}</p>
          </div>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Database size={11} />
            {[alert.sf_database_name, alert.sf_schema_name, alert.sf_table_name].filter(Boolean).join('.')}
          </span>
          <span className="text-gray-300">•</span>
          <span>{alert.domain_name} › {alert.subdomain_name}</span>
          <span className="text-gray-300">•</span>
          <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
            {alert.rule_type.replace(/_/g, ' ')}
          </span>
          {alert.resolved_at && (
            <>
              <span className="text-gray-300">•</span>
              <span className="text-green-600">Resolved {fmtTime(alert.resolved_at)}</span>
            </>
          )}
        </div>

        {/* Action buttons */}
        {(isOpen || isAck) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <Link
              href={`/dashboard/tables/${alert.asset_id}`}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Database size={11} />
              Table
            </Link>
            <Link
              href={`/rules/${alert.rule_id}`}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Rule
            </Link>
            <Link
              href={`/runs?rule_id=${alert.rule_id}`}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50"
            >
              View Logs
            </Link>

            {isOpen && (
              <button
                onClick={() => act('acknowledge')}
                disabled={!!busy}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50"
              >
                {busy === 'acknowledge' ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
                Acknowledge
              </button>
            )}

            <button
              onClick={() => act('resolve')}
              disabled={!!busy}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-green-700 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-50"
            >
              {busy === 'resolve' ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              Resolve
            </button>

            {isOpen && (
              <button
                onClick={() => act('ignore')}
                disabled={!!busy}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {busy === 'ignore' ? <Loader2 size={11} className="animate-spin" /> : <EyeOff size={11} />}
                Ignore
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [alerts, setAlerts]       = useState<EnrichedAlert[]>([])
  const [summary, setSummary]     = useState<Record<string, number>>({})
  const [loading, setLoading]     = useState(true)
  const [statusTab, setStatusTab] = useState('open')
  const [severity, setSeverity]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (statusTab) params.status   = statusTab
      if (severity)  params.severity = severity
      const [alertsRes, summaryRes] = await Promise.all([
        alertsApi.listEnriched(params),
        alertsApi.summary(),
      ])
      setAlerts(alertsRes.data)
      setSummary(summaryRes.data)
    } finally {
      setLoading(false)
    }
  }, [statusTab, severity])

  useEffect(() => { load() }, [load])

  const handleAction = async (id: string, action: 'acknowledge' | 'resolve' | 'ignore') => {
    await alertsApi[action](id)
    setAlerts(prev => prev.filter(a => a.alert_id !== id))
    setSummary(prev => {
      const alert = alerts.find(a => a.alert_id === id)
      if (!alert) return prev
      const next = { ...prev }
      next[alert.alert_status] = Math.max(0, (next[alert.alert_status] || 1) - 1)
      next[action === 'acknowledge' ? 'acknowledged' : action === 'resolve' ? 'resolved' : 'ignored'] =
        (next[action === 'acknowledge' ? 'acknowledged' : action === 'resolve' ? 'resolved' : 'ignored'] || 0) + 1
      return next
    })
  }

  const totalOpen = summary.open || 0

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-500 text-sm mt-1">
            {totalOpen > 0
              ? <span className="text-red-600 font-medium">{totalOpen} open alert{totalOpen !== 1 ? 's' : ''} require attention</span>
              : 'No open alerts'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Status tabs with counts */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {STATUS_TABS.map(tab => {
          const count = tab.value ? (summary[tab.value] || 0) : Object.values(summary).reduce((a, b) => a + b, 0)
          return (
            <button
              key={tab.value}
              onClick={() => setStatusTab(tab.value)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                statusTab === tab.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-semibold',
                  statusTab === tab.value
                    ? (tab.value === 'open' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')
                    : 'bg-gray-200 text-gray-600'
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Alert list */}
      {loading ? (
        /* Skeleton cards */
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-xl border-l-4 border-l-gray-200 border border-gray-100 p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-200 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-200 rounded w-2/3" />
                  <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                  <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                </div>
                <div className="h-6 bg-gray-200 rounded w-20 shrink-0" />
              </div>
            </div>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6">
          <div className="w-20 h-20 rounded-2xl bg-green-50 flex items-center justify-center mb-5">
            <CheckCircle size={36} className="text-green-400" />
          </div>
          <p className="text-base font-semibold text-gray-800">
            {statusTab === 'open' ? 'All clear — no open alerts' : `No ${statusTab || ''} alerts`}
          </p>
          <p className="text-sm text-gray-400 mt-2 text-center max-w-sm">
            {statusTab === 'open'
              ? 'Alerts are generated automatically when critical, high, or medium severity rules fail. Your data looks healthy!'
              : 'No alerts match the current filter.'}
          </p>
          {statusTab === 'open' && (
            <p className="mt-4 text-xs text-gray-300">
              Run rules from the <span className="text-blue-500 font-medium">Rules</span> page to check your data quality.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Group by severity */}
          {['critical', 'high', 'medium', 'low'].map(sev => {
            const group = alerts.filter(a => a.severity === sev)
            if (group.length === 0) return null
            return (
              <div key={sev}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4 first:mt-0">
                  {sev} — {group.length} alert{group.length !== 1 ? 's' : ''}
                </p>
                <div className="space-y-2">
                  {group.map(alert => (
                    <AlertCard key={alert.alert_id} alert={alert} onAction={handleAction} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
