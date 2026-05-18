'use client'
import { useEffect, useState } from 'react'
import { CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { useTimezone } from '@/contexts/TimezoneContext'
import { schemaDriftApi } from '@/services/schemaDriftApi'
import type { SchemaDriftResponse, SchemaDriftEvent } from '@/types/schemaDrift'
import { DriftEventRow } from './DriftEventRow'

export function SchemaDriftTab({ assetId }: { assetId: string }) {
  const { formatTs } = useTimezone()
  const [data, setData]           = useState<SchemaDriftResponse | null>(null)
  const [history, setHistory]     = useState<SchemaDriftEvent[]>([])
  const [loading, setLoading]     = useState(true)
  const [approving, setApproving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [drift, hist] = await Promise.all([
        schemaDriftApi.get(assetId),
        schemaDriftApi.history(assetId),
      ])
      setData(drift)
      setHistory(hist.events)
    } catch {
      setError('Failed to load schema drift data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [assetId])

  const handleApprove = async () => {
    setApproving(true)
    try {
      await schemaDriftApi.approve(assetId)
      await load()
    } catch {
      setError('Failed to approve baseline.')
    } finally {
      setApproving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 p-8 text-gray-400">
      <Loader2 size={16} className="animate-spin" /> Loading schema drift…
    </div>
  )

  if (error) return (
    <div className="p-8 text-red-500 text-sm">{error}</div>
  )

  if (!data?.baseline) return (
    <div className="p-8 text-center text-gray-500 text-sm">
      No baseline established yet — run a column profile to initialize schema drift tracking.
    </div>
  )

  const { baseline, open_events } = data
  const approvedLabel = baseline.approved_by
    ? `approved by ${baseline.approved_by} on ${formatTs(baseline.approved_at ?? baseline.created_at, { dateOnly: true })}`
    : `initialized on ${formatTs(baseline.created_at, { dateOnly: true })}`

  return (
    <div className="space-y-4">
      {/* Baseline header */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 text-sm text-gray-500">
        Baseline: <span className="text-gray-800 font-medium">{approvedLabel}</span>
      </div>

      {/* Drift events */}
      {open_events.length === 0 ? (
        <div className="bg-white border border-green-200 rounded-xl p-6 flex items-center gap-3 text-green-700">
          <CheckCircle size={18} />
          <span className="font-medium">Schema matches baseline — no drift detected.</span>
        </div>
      ) : (
        <div className="bg-white border border-orange-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2 text-orange-700 text-sm font-medium">
            <AlertTriangle size={15} />
            {open_events.length} change{open_events.length > 1 ? 's' : ''} detected since last approved baseline
          </div>
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Column</th>
                <th className="px-4 py-2">Change</th>
                <th className="px-4 py-2">Old</th>
                <th className="px-4 py-2">New</th>
              </tr>
            </thead>
            <tbody>
              {open_events.map(ev => <DriftEventRow key={ev.event_id} event={ev} />)}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {approving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              {approving ? 'Accepting…' : 'Accept All Changes'}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className="w-full flex items-center gap-2 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {historyOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Drift History (last {history.length} events)
          </button>
          {historyOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {history.map(ev => (
                <div key={ev.event_id} className="px-5 py-2.5 text-sm text-gray-600 flex items-center justify-between">
                  <span>
                    <span className="font-mono text-gray-800">{ev.column_name}</span>
                    {' · '}
                    <span className="capitalize">{ev.change_type.replace(/_/g, ' ')}</span>
                  </span>
                  <span className="text-gray-400 text-xs">
                    {ev.status === 'accepted'
                      ? `accepted${ev.resolved_by ? ` by ${ev.resolved_by}` : ''} · ${formatTs(ev.resolved_at, { dateOnly: true })}`
                      : `detected ${formatTs(ev.detected_at, { dateOnly: true })}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
