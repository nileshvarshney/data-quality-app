'use client'
import { useState, useEffect, useCallback } from 'react'
import { useTimezone } from '@/contexts/TimezoneContext'
import { rulesApi, domainsApi } from '@/services/apiClient'
import SeverityBadge from '@/components/common/SeverityBadge'
import {
  CheckCircle, XCircle, Loader2, ClipboardList, X,
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function fmt(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingRule {
  rule_id: string
  rule_name: string
  rule_description: string | null
  rule_type: string
  severity: string
  status: string
  created_by: string | null
  created_at: string
  updated_at: string
  domain_id: string
  domain_name: string
  subdomain_id: string
  subdomain_name: string
  asset_id: string
  sf_database_name: string | null
  sf_schema_name: string
  sf_table_name: string
}

interface Domain {
  domain_id: string
  domain_name: string
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={clsx(
            'flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border',
            t.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          )}
        >
          {t.type === 'success'
            ? <CheckCircle size={15} className="shrink-0 text-green-600" />
            : <XCircle size={15} className="shrink-0 text-red-500" />}
          <span>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-1 opacity-60 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Reject Modal ──────────────────────────────────────────────────────────────

interface RejectModalProps {
  rule: PendingRule
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

function RejectModal({ rule, onClose, onConfirm }: RejectModalProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!reason.trim()) return
    setSubmitting(true)
    try {
      await onConfirm(reason.trim())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Reject Rule</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono truncate max-w-[320px]">{rule.rule_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-0.5 mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Rejection Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Explain why this rule is being rejected…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
          {!reason.trim() && reason.length > 0 && (
            <p className="text-xs text-red-500 mt-1">Reason cannot be empty.</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
            {submitting ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ApprovalQueuePage() {
  const { formatTs } = useTimezone()
  const [rules, setRules] = useState<PendingRule[]>([])
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PendingRule | null>(null)

  // Filters
  const [domainFilter, setDomainFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id))

  // Load data
  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      rulesApi.listEnriched({ status: 'pending_review' }),
      domainsApi.list(),
    ])
      .then(([rulesRes, domainsRes]) => {
        const allRules: PendingRule[] = rulesRes.data?.items ?? rulesRes.data ?? []
        // Defensive client-side filter
        setRules(allRules.filter(r => r.status === 'pending_review'))
        const allDomains: Domain[] = domainsRes.data?.items ?? domainsRes.data ?? []
        setDomains(allDomains)
      })
      .catch(() => addToast('Failed to load approval queue.', 'error'))
      .finally(() => setLoading(false))
  }, [addToast])

  useEffect(() => { load() }, [load])

  // Filtered view
  const filtered = rules.filter(r => {
    if (domainFilter && r.domain_id !== domainFilter) return false
    if (severityFilter && r.severity !== severityFilter) return false
    return true
  })

  // Approve
  const handleApprove = async (rule: PendingRule) => {
    setActionBusy(rule.rule_id)
    try {
      await rulesApi.approve(rule.rule_id)
      setRules(prev => prev.filter(r => r.rule_id !== rule.rule_id))
      addToast(`"${rule.rule_name}" approved and activated.`, 'success')
    } catch (e: any) {
      addToast(e.response?.data?.detail || 'Approval failed. Please try again.', 'error')
    } finally {
      setActionBusy(null)
    }
  }

  // Reject
  const handleReject = async (reason: string) => {
    if (!rejectTarget) return
    const rule = rejectTarget
    setActionBusy(rule.rule_id)
    try {
      await rulesApi.reject(rule.rule_id, undefined, reason)
      setRejectTarget(null)
      setRules(prev => prev.filter(r => r.rule_id !== rule.rule_id))
      addToast(`"${rule.rule_name}" rejected.`, 'success')
    } catch (e: any) {
      addToast(e.response?.data?.detail || 'Rejection failed. Please try again.', 'error')
    } finally {
      setActionBusy(null)
    }
  }

  const sel =
    'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 text-gray-600'

  return (
    <div className="min-h-screen bg-gray-50 p-6">

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList size={20} className="text-amber-500" />
            Approval Queue
          </h1>
          {!loading && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
              {rules.length} pending
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          Rules awaiting governance review before going live.
        </p>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={domainFilter}
          onChange={e => setDomainFilter(e.target.value)}
          className={sel}
        >
          <option value="">All Domains</option>
          {domains.map(d => (
            <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          className={sel}
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {(domainFilter || severityFilter) && (
          <button
            onClick={() => { setDomainFilter(''); setSeverityFilter('') }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <X size={11} /> Clear filters
          </button>
        )}
      </div>

      {/* ── Table card ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          /* Loading spinner */
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">Loading approval queue…</p>
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
              <CheckCircle size={28} className="text-green-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700">All caught up!</p>
            <p className="text-xs text-gray-400 mt-1 text-center max-w-xs">
              {domainFilter || severityFilter
                ? 'No rules match the selected filters.'
                : 'No rules are pending approval.'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[28%]">
                  Rule Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[12%]">
                  Type
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[18%]">
                  Domain / Asset
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[8%]">
                  Severity
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[10%]">
                  Submitted
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[12%]">
                  Submitted By
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[12%]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(rule => {
                const busy = actionBusy === rule.rule_id
                return (
                  <tr key={rule.rule_id} className="hover:bg-gray-50/60 transition-colors">

                    {/* Rule Name */}
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <Link
                        href={`/rules/${rule.rule_id}`}
                        className="font-medium text-gray-800 hover:text-blue-600 transition-colors truncate block max-w-[220px]"
                        title={rule.rule_name}
                      >
                        {rule.rule_name}
                      </Link>
                      {rule.rule_description && (
                        <p className="text-xs text-gray-400 truncate max-w-[220px] mt-0.5" title={rule.rule_description}>
                          {rule.rule_description}
                        </p>
                      )}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-mono whitespace-nowrap">
                        {rule.rule_type.replace(/_check$/, '').replace(/_/g, ' ')}
                      </span>
                    </td>

                    {/* Domain / Asset */}
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <p className="font-medium text-gray-700 truncate max-w-[160px]" title={rule.domain_name}>
                        {rule.domain_name}
                      </p>
                      <p className="text-xs text-gray-400 font-mono truncate max-w-[160px] mt-0.5"
                        title={`${rule.sf_schema_name}.${rule.sf_table_name}`}>
                        {rule.sf_schema_name}.{rule.sf_table_name}
                      </p>
                    </td>

                    {/* Severity */}
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <SeverityBadge severity={rule.severity} />
                    </td>

                    {/* Submitted date */}
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <span className="text-xs text-gray-500" title={formatTs(rule.updated_at, { yearAlways: true, withSeconds: true })}>
                        {timeAgo(rule.updated_at)}
                      </span>
                    </td>

                    {/* Submitted by */}
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <span className="text-xs text-gray-600 truncate block max-w-[100px]" title={rule.created_by ?? undefined}>
                        {rule.created_by || '—'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex items-center justify-end gap-2">
                        {/* Approve */}
                        <button
                          onClick={() => handleApprove(rule)}
                          disabled={busy}
                          title="Approve this rule"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          {busy
                            ? <Loader2 size={11} className="animate-spin" />
                            : <CheckCircle size={11} />}
                          Approve
                        </button>

                        {/* Reject */}
                        <button
                          onClick={() => setRejectTarget(rule)}
                          disabled={busy}
                          title="Reject this rule"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-600 text-xs rounded-lg hover:bg-red-50 disabled:opacity-50"
                        >
                          <XCircle size={11} />
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer count ── */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-400 mt-3 px-1">
          Showing {filtered.length} of {rules.length} pending rule{rules.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── Reject modal ── */}
      {rejectTarget && (
        <RejectModal
          rule={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={handleReject}
        />
      )}

      {/* ── Toast notifications ── */}
      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
