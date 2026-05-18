'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { rulesApi, executionsApi } from '@/services/apiClient'
import SeverityBadge from '@/components/common/SeverityBadge'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import {
  Play, CheckCircle, XCircle, History, RotateCcw, Loader2, ThumbsUp, ThumbsDown,
  Clock, User, Copy, AlertTriangle, Tag, Send,
} from 'lucide-react'
import clsx from 'clsx'
import { useTimezone } from '@/contexts/TimezoneContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RuleDetail {
  rule_id: string
  rule_name: string
  rule_description: string | null
  rule_type: string
  rule_category: string | null
  target_column: string | null
  rule_sql: string | null
  rule_config: Record<string, unknown> | null
  severity: string
  status: string
  version: number
  is_active: boolean
  created_by: string | null
  approved_by: string | null
  rejected_by: string | null
  rejection_reason: string | null
  business_owner_name: string | null
  business_owner_email: string | null
  domain_id: string
  subdomain_id: string
  asset_id: string
  created_at: string
  updated_at: string
}

interface RuleVersion {
  version_id: string
  version: number
  rule_name: string
  rule_description: string | null
  rule_type: string
  target_column: string | null
  rule_sql: string | null
  rule_config: Record<string, unknown> | null
  severity: string
  status: string
  changed_by: string | null
  change_reason: string | null
  created_at: string
}

interface RunEntry {
  run_id: string
  status: string
  quality_score: number | null
  failed_rows_count: number | null
  total_rows_scanned: number | null
  execution_start_time: string | null
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  active:         { label: 'Active',         cls: 'bg-green-100 text-green-800' },
  draft:          { label: 'Draft',          cls: 'bg-gray-100 text-gray-600' },
  pending_review: { label: 'Pending Review', cls: 'bg-yellow-100 text-yellow-800' },
  approved:       { label: 'Approved',       cls: 'bg-blue-100 text-blue-700' },
  disabled:       { label: 'Disabled',       cls: 'bg-orange-100 text-orange-700' },
  archived:       { label: 'Archived',       cls: 'bg-red-100 text-red-700' },
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full', cfg.cls)}>{cfg.label}</span>
}


function serialise(val: unknown): string {
  if (val == null || val === '') return ''
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

const DIFF_KEYS = [
  'rule_name', 'rule_description', 'rule_type',
  'target_column', 'severity', 'rule_sql', 'rule_config',
] as const
type DiffKey = typeof DIFF_KEYS[number]

function getChangedSet(ver: RuleVersion, cur: RuleDetail): Set<DiffKey> {
  const s = new Set<DiffKey>()
  for (const k of DIFF_KEYS) {
    if (serialise(ver[k]) !== serialise(cur[k as keyof RuleDetail])) s.add(k)
  }
  return s
}

// ── Small shared UI pieces ────────────────────────────────────────────────────

function ChangedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
      <AlertTriangle size={10} /> changed
    </span>
  )
}

function DiffField({
  label,
  value,
  currentValue,
  changed,
  mono = false,
}: {
  label: string
  value: string | null | undefined
  currentValue: string | null | undefined
  changed: boolean
  mono?: boolean
}) {
  return (
    <div className={clsx(
      'rounded-lg border p-3',
      changed ? 'border-amber-300 bg-amber-50' : 'border-gray-100 bg-gray-50',
    )}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        {changed && <ChangedBadge />}
      </div>
      <p className={clsx(
        'text-sm break-all',
        mono ? 'font-mono text-blue-700' : 'text-gray-900',
        !value && 'text-gray-400 italic text-xs',
      )}>
        {value || '(none)'}
      </p>
      {changed && (
        <p className="text-xs text-gray-400 mt-1.5 border-t border-amber-200 pt-1.5">
          Current: <span className="text-gray-600 font-medium">{currentValue || '(none)'}</span>
        </p>
      )}
    </div>
  )
}

// ── Restore Confirm Modal (lean — full diff already visible in pane) ───────────

function RestoreConfirmModal({
  version,
  changedCount,
  onConfirm,
  onCancel,
  busy,
}: {
  version: RuleVersion
  changedCount: number
  onConfirm: () => void
  onCancel: () => void
  busy: boolean
}) {
  const { formatTs } = useTimezone()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <RotateCcw size={18} className="text-orange-500" />
          <h2 className="text-base font-semibold text-gray-900">Restore to v{version.version}?</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-medium">Rule will need re-approval after restore.</p>
              <p className="text-amber-700">
                Status will be set to <strong>Pending Review</strong>. The rule will not run until
                an admin or domain owner approves it.
              </p>
            </div>
          </div>
          {changedCount > 0 ? (
            <p className="text-sm text-gray-600">
              <strong>{changedCount} field{changedCount > 1 ? 's' : ''}</strong> will change from
              the current version. Review the diff on the left before confirming.
            </p>
          ) : (
            <p className="text-sm text-gray-500">No field differences — only the status will change.</p>
          )}
          {version.changed_by && (
            <p className="text-xs text-gray-400">
              Snapshot by <span className="text-gray-600">{version.changed_by}</span>
              {version.change_reason && <> · {version.change_reason}</>}
              {' · '}{formatTs(version.created_at, { yearAlways: true })}
            </p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Yes, restore to v{version.version}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Version History Pane ──────────────────────────────────────────────────────

function VersionHistoryPane({
  versions,
  currentRule,
  onRestore,
}: {
  versions: RuleVersion[]
  currentRule: RuleDetail
  onRestore: (ver: RuleVersion) => void
}) {
  const { formatTs } = useTimezone()
  const [selectedId, setSelectedId] = useState(versions[0]?.version_id ?? '')
  const selected = versions.find(v => v.version_id === selectedId) ?? versions[0]

  if (!selected) {
    return (
      <div className="text-center py-16 text-gray-400">
        <RotateCcw size={32} className="mx-auto mb-3 opacity-30" />
        <p>No version history yet</p>
        <p className="text-xs mt-1">Versions are saved whenever a rule is edited or approved.</p>
      </div>
    )
  }

  const isCurrent = selected.version === currentRule.version
  const changed = getChangedSet(selected, currentRule)

  return (
    <div className="flex border border-gray-200 rounded-xl overflow-hidden min-h-[560px]">

      {/* ── Left: version timeline ── */}
      <div className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto">
        {versions.map(ver => {
          const isCur = ver.version === currentRule.version
          const isSelected = ver.version_id === selectedId
          const diffCount = isCur ? 0 : getChangedSet(ver, currentRule).size
          return (
            <button
              key={ver.version_id}
              onClick={() => setSelectedId(ver.version_id)}
              className={clsx(
                'w-full text-left px-4 py-3.5 border-b border-gray-200 transition-colors',
                'border-l-[3px]',
                isSelected
                  ? 'bg-white border-l-blue-500'
                  : 'hover:bg-white/70 border-l-transparent',
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={clsx(
                  'text-sm font-mono font-bold',
                  isSelected ? 'text-blue-700' : 'text-gray-700',
                )}>
                  v{ver.version}
                </span>
                {isCur && (
                  <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded-full leading-none">
                    CURRENT
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1 mb-1.5">
                <StatusPill status={ver.status} />
              </div>

              {!isCur && (
                <div className={clsx(
                  'text-xs font-medium mt-1',
                  diffCount > 0 ? 'text-amber-600' : 'text-gray-400',
                )}>
                  {diffCount > 0
                    ? `${diffCount} field${diffCount > 1 ? 's' : ''} changed`
                    : 'no field changes'}
                </div>
              )}

              {ver.changed_by && (
                <p className="text-xs text-gray-400 mt-1 truncate">{ver.changed_by}</p>
              )}
              <p className="text-xs text-gray-400">{formatTs(ver.created_at, { dateOnly: true })}</p>
            </button>
          )
        })}
      </div>

      {/* ── Right: version detail ── */}
      <div className="flex-1 overflow-y-auto bg-white">

        {/* Detail header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-base font-bold text-gray-900">Version {selected.version}</span>
            <StatusPill status={selected.status} />
            <SeverityBadge severity={selected.severity} />
            {isCurrent && (
              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 font-semibold px-2 py-1 rounded-full">
                <CheckCircle size={11} /> Current Version
              </span>
            )}
          </div>
          {!isCurrent && (
            <button
              onClick={() => onRestore(selected)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 shrink-0"
            >
              <RotateCcw size={14} />
              Restore to this version
            </button>
          )}
        </div>

        {/* Meta strip */}
        <div className="flex items-center flex-wrap gap-x-5 gap-y-1 px-6 py-2.5 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
          {selected.changed_by && (
            <span className="flex items-center gap-1">
              <User size={11} /> {selected.changed_by}
            </span>
          )}
          {selected.change_reason && (
            <span className="flex items-center gap-1">
              <Tag size={11} /> {selected.change_reason}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={11} /> {formatTs(selected.created_at, { yearAlways: true })}
          </span>
          {!isCurrent && (
            <span className={clsx(
              'ml-auto flex items-center gap-1 font-medium',
              changed.size > 0 ? 'text-amber-600' : 'text-gray-400',
            )}>
              {changed.size > 0
                ? <><AlertTriangle size={11} /> {changed.size} field{changed.size > 1 ? 's' : ''} differ from current</>
                : 'No field differences from current version'
              }
            </span>
          )}
        </div>

        {/* Fields */}
        <div className="p-6 space-y-4">

          {/* Name */}
          <DiffField
            label="Rule Name"
            value={selected.rule_name}
            currentValue={currentRule.rule_name}
            changed={!isCurrent && changed.has('rule_name')}
          />

          {/* Description */}
          {(selected.rule_description || changed.has('rule_description')) && (
            <DiffField
              label="Description"
              value={selected.rule_description}
              currentValue={currentRule.rule_description}
              changed={!isCurrent && changed.has('rule_description')}
            />
          )}

          {/* Rule type + target column */}
          <div className="grid grid-cols-2 gap-4">
            <DiffField
              label="Rule Type"
              value={selected.rule_type.replace(/_/g, ' ')}
              currentValue={currentRule.rule_type.replace(/_/g, ' ')}
              changed={!isCurrent && changed.has('rule_type')}
            />
            <DiffField
              label="Target Column"
              value={selected.target_column}
              currentValue={currentRule.target_column}
              changed={!isCurrent && changed.has('target_column')}
              mono
            />
          </div>

          {/* Severity + Status */}
          <div className="grid grid-cols-2 gap-4">
            <DiffField
              label="Severity"
              value={selected.severity}
              currentValue={currentRule.severity}
              changed={!isCurrent && changed.has('severity')}
            />
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Status at snapshot</span>
              <StatusPill status={selected.status} />
            </div>
          </div>

          {/* SQL */}
          <div className={clsx(
            'rounded-xl border p-4',
            !isCurrent && changed.has('rule_sql') ? 'border-amber-300 bg-amber-50' : 'border-gray-200',
          )}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">SQL</span>
              {!isCurrent && changed.has('rule_sql') && <ChangedBadge />}
            </div>
            {selected.rule_sql ? (
              <pre className="text-xs text-green-300 bg-gray-900 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {selected.rule_sql}
              </pre>
            ) : (
              <p className="text-xs text-gray-400 italic">No SQL for this version</p>
            )}
            {!isCurrent && changed.has('rule_sql') && currentRule.rule_sql && (
              <div className="mt-3 pt-3 border-t border-amber-200">
                <p className="text-xs text-gray-500 font-medium mb-2">Current SQL:</p>
                <pre className="text-xs text-gray-500 bg-gray-100 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {currentRule.rule_sql}
                </pre>
              </div>
            )}
          </div>

          {/* Config */}
          {(selected.rule_config || changed.has('rule_config')) && (
            <div className={clsx(
              'rounded-xl border p-4',
              !isCurrent && changed.has('rule_config') ? 'border-amber-300 bg-amber-50' : 'border-gray-200',
            )}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Config</span>
                {!isCurrent && changed.has('rule_config') && <ChangedBadge />}
              </div>
              <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-x-auto">
                {selected.rule_config
                  ? JSON.stringify(selected.rule_config, null, 2)
                  : '(none)'}
              </pre>
              {!isCurrent && changed.has('rule_config') && (
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <p className="text-xs text-gray-500 font-medium mb-2">Current config:</p>
                  <pre className="text-xs text-gray-500 bg-gray-100 p-3 rounded-lg overflow-x-auto">
                    {currentRule.rule_config
                      ? JSON.stringify(currentRule.rule_config, null, 2)
                      : '(none)'}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Restore CTA at the bottom for non-current versions */}
          {!isCurrent && (
            <div className="pt-2">
              <button
                onClick={() => onRestore(selected)}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600"
              >
                <RotateCcw size={14} />
                Restore rule to this version
              </button>
              <p className="text-xs text-gray-400 mt-2">
                The rule will be set to <strong>Pending Review</strong> and must be re-approved before running.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Approval panel ────────────────────────────────────────────────────────────

function ApprovalPanel({ rule, onUpdate }: { rule: RuleDetail; onUpdate: () => void }) {
  const [busy, setBusy] = useState<'submit' | 'approve' | 'reject' | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  if (!['pending_review', 'draft'].includes(rule.status)) return null

  const handleSubmit = async () => {
    setBusy('submit')
    try { await rulesApi.submit(rule.rule_id); onUpdate() }
    finally { setBusy(null) }
  }

  const handleApprove = async () => {
    setBusy('approve')
    try { await rulesApi.approve(rule.rule_id); onUpdate() }
    finally { setBusy(null) }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) return
    setBusy('reject')
    try {
      await rulesApi.reject(rule.rule_id, undefined, rejectReason)
      setShowRejectForm(false)
      setRejectReason('')
      onUpdate()
    } finally { setBusy(null) }
  }

  if (rule.status === 'draft') {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-1">This rule is a draft</p>
        <p className="text-xs text-gray-500 mb-3">Submit for review when it&apos;s ready for an approver to evaluate.</p>
        {rule.rejection_reason && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <span className="font-medium">Rejected: </span>{rule.rejection_reason}
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={!!busy}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {busy === 'submit' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Submit for Review
        </button>
      </div>
    )
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
      <p className="text-sm font-semibold text-yellow-800 mb-3">This rule is awaiting review</p>
      <div className="flex items-center gap-3">
        <button
          onClick={handleApprove}
          disabled={!!busy}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {busy === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
          Approve
        </button>
        <button
          onClick={() => setShowRejectForm(v => !v)}
          disabled={!!busy}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
          <ThumbsDown size={14} />
          Reject
        </button>
      </div>
      {showRejectForm && (
        <div className="mt-3 flex gap-2">
          <input
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Rejection reason..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          <button
            onClick={handleReject}
            disabled={!rejectReason.trim() || !!busy}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {busy === 'reject' ? <Loader2 size={14} className="animate-spin" /> : 'Submit'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATIC_SEGMENTS = new Set(['rules', 'approval-queue', 'create'])

export default function RuleDetailPage() {
  const { ruleId: _ruleId } = useParams<{ ruleId: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const segments = pathname.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1] ?? ''
  const ruleId = (_ruleId && _ruleId !== '__placeholder__')
    ? _ruleId
    : lastSegment
  const { formatTs } = useTimezone()
  const [rule, setRule] = useState<RuleDetail | null>(null)
  const [versions, setVersions] = useState<RuleVersion[]>([])
  const [runs, setRuns] = useState<RunEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<{ status: string; score: number | null; error: string | null } | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'versions'>('details')
  const [restoreTarget, setRestoreTarget] = useState<RuleVersion | null>(null)
  const [rollingBack, setRollingBack] = useState(false)

  // Guard: if placeholder was served for a static route (e.g. /rules/ or /rules/approval-queue/),
  // self-correct by navigating to the right page.
  useEffect(() => {
    if (STATIC_SEGMENTS.has(lastSegment) || !UUID_RE.test(ruleId)) {
      if (pathname.includes('approval-queue')) {
        router.replace('/rules/approval-queue')
      } else if (pathname.includes('create')) {
        router.replace('/rules/create')
      } else {
        router.replace('/rules')
      }
    }
  }, [lastSegment, ruleId, pathname, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ruleRes, versionsRes, runsRes] = await Promise.all([
        rulesApi.get(ruleId),
        rulesApi.getVersions(ruleId),
        rulesApi.getRuns(ruleId, { limit: 20 }),
      ])
      setRule(ruleRes.data)
      setVersions(versionsRes.data)
      setRuns(runsRes.data.runs || [])
    } finally {
      setLoading(false)
    }
  }, [ruleId])

  useEffect(() => { if (UUID_RE.test(ruleId)) load() }, [load, ruleId])

  const handleRun = async () => {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await executionsApi.runRuleSync(ruleId)
      setRunResult({ status: res.data.status, score: res.data.quality_score, error: res.data.error_message })
      load()
    } catch (e: any) {
      setRunResult({ status: 'error', score: null, error: e.response?.data?.detail || e.message })
    } finally {
      setRunning(false)
    }
  }

  const handleRollbackConfirm = async () => {
    if (!restoreTarget) return
    setRollingBack(true)
    try {
      await rulesApi.rollback(ruleId, restoreTarget.version)
      setRestoreTarget(null)
      load()
    } finally {
      setRollingBack(false)
    }
  }

  const handleClone = async () => {
    try {
      const res = await rulesApi.clone(ruleId)
      window.location.href = `/rules/${res.data.rule_id}`
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Clone failed')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )
  if (!rule) return <div className="p-8 text-gray-500">Rule not found</div>

  const tabs = [
    { key: 'details',  label: 'Details' },
    { key: 'history',  label: `Run History (${runs.length})` },
    { key: 'versions', label: `Version History (${versions.length})` },
  ] as const

  const restoreChangedCount = restoreTarget
    ? getChangedSet(restoreTarget, rule).size
    : 0

  return (
    <div className="p-8 max-w-6xl">

      {/* Restore confirm modal */}
      {restoreTarget && (
        <RestoreConfirmModal
          version={restoreTarget}
          changedCount={restoreChangedCount}
          onConfirm={handleRollbackConfirm}
          onCancel={() => setRestoreTarget(null)}
          busy={rollingBack}
        />
      )}

      <Breadcrumbs items={[
        { label: 'Rules', href: '/rules' },
        { label: rule.rule_name },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{rule.rule_name}</h1>
            <StatusPill status={rule.status} />
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">v{rule.version}</span>
          </div>
          {rule.rule_description && (
            <p className="text-gray-500 text-sm">{rule.rule_description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClone}
            title="Duplicate this rule as a draft"
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
          >
            <Copy size={14} /> Clone
          </button>
          <button
            onClick={handleRun}
            disabled={running || rule.status !== 'active'}
            title={rule.status !== 'active' ? 'Activate rule to run' : 'Run now'}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? 'Running…' : 'Run Now'}
          </button>
        </div>
      </div>

      {/* Run result toast */}
      {runResult && (
        <div className={clsx('flex items-center gap-2 px-4 py-3 rounded-xl text-sm mb-4',
          runResult.status === 'passed' ? 'bg-green-50 text-green-800 border border-green-200'
          : runResult.status === 'error' ? 'bg-orange-50 text-orange-800 border border-orange-200'
          : 'bg-red-50 text-red-800 border border-red-200')}>
          {runResult.status === 'passed' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          <span className="font-medium capitalize">{runResult.status}</span>
          {runResult.score != null && <span>— Quality score: {runResult.score}%</span>}
          {runResult.error && <span className="text-xs">{runResult.error}</span>}
        </div>
      )}

      {/* Approval panel */}
      <ApprovalPanel rule={rule} onUpdate={load} />

      {/* Rejection banner */}
      {rule.status === 'draft' && rule.rejection_reason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-red-800">Rule was rejected</p>
          <p className="text-sm text-red-600 mt-1">Reason: {rule.rejection_reason}</p>
          {rule.rejected_by && <p className="text-xs text-red-400 mt-1">by {rule.rejected_by}</p>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Details Tab ── */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Rule Info</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Type</dt>
                  <dd className="text-gray-900">{rule.rule_type.replace(/_/g, ' ')}</dd>
                </div>
                {rule.rule_category && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Category</dt>
                    <dd className="text-gray-900">{rule.rule_category}</dd>
                  </div>
                )}
                {rule.target_column && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Target Column</dt>
                    <dd className="font-mono text-blue-600">{rule.target_column}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500">Severity</dt>
                  <dd><SeverityBadge severity={rule.severity} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Version</dt>
                  <dd className="text-gray-900">v{rule.version}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Ownership</h2>
              <dl className="space-y-2 text-sm">
                {rule.created_by && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500 flex items-center gap-1"><User size={11} /> Created by</dt>
                    <dd className="text-gray-900">{rule.created_by}</dd>
                  </div>
                )}
                {rule.approved_by && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500 flex items-center gap-1"><CheckCircle size={11} className="text-green-500" /> Approved by</dt>
                    <dd className="text-gray-900">{rule.approved_by}</dd>
                  </div>
                )}
                {rule.business_owner_name && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Business Owner</dt>
                    <dd className="text-gray-900">{rule.business_owner_name}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500 flex items-center gap-1"><Clock size={11} /> Created</dt>
                  <dd className="text-gray-900">{formatTs(rule.created_at, { yearAlways: true })}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 flex items-center gap-1"><Clock size={11} /> Updated</dt>
                  <dd className="text-gray-900">{formatTs(rule.updated_at, { yearAlways: true })}</dd>
                </div>
              </dl>
            </div>

            {rule.rule_config && Object.keys(rule.rule_config).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Config</h2>
                <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-x-auto">
                  {JSON.stringify(rule.rule_config, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-full">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Generated SQL</h2>
                <span className="text-xs text-gray-400">Read-only</span>
              </div>
              {rule.rule_sql ? (
                <pre className="text-xs text-green-300 bg-gray-900 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {rule.rule_sql}
                </pre>
              ) : (
                <p className="text-sm text-gray-400">No SQL generated</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Run History Tab ── */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {runs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <History size={32} className="mx-auto mb-3 opacity-30" />
              <p>No runs yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Rows Scanned</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Failed Rows</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Run At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map(run => (
                  <tr key={run.run_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                        run.status === 'passed' ? 'bg-green-100 text-green-700'
                        : run.status === 'failed' ? 'bg-red-100 text-red-700'
                        : 'bg-orange-100 text-orange-700')}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">{run.quality_score != null ? `${run.quality_score}%` : '—'}</td>
                    <td className="px-4 py-3">{run.total_rows_scanned?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-3">{run.failed_rows_count?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatTs(run.created_at, { withSeconds: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Version History Tab ── */}
      {activeTab === 'versions' && (
        <VersionHistoryPane
          versions={versions}
          currentRule={rule}
          onRestore={setRestoreTarget}
        />
      )}
    </div>
  )
}
