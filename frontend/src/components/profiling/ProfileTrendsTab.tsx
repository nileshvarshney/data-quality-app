'use client'
import { useEffect, useState, useCallback } from 'react'
import { Loader2, TrendingUp } from 'lucide-react'
import { profilingApi, ProfileHistoryPoint, ProfileSummary } from '@/services/profilingApi'
import ColumnTrendCard from './ColumnTrendCard'

type Metric = 'null_pct' | 'cardinality_pct' | 'top_values'
type DayRange = 30 | 90

interface Props {
  assetId: string
}

const METRIC_LABELS: Record<Metric, string> = {
  null_pct:       'Null %',
  cardinality_pct: 'Cardinality %',
  top_values:     'Top Values',
}

export default function ProfileTrendsTab({ assetId }: Props) {
  const [metric, setMetric]   = useState<Metric>('null_pct')
  const [days, setDays]       = useState<DayRange>(90)
  const [summary, setSummary] = useState<ProfileSummary[]>([])
  const [history, setHistory] = useState<ProfileHistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = useCallback(async (d: DayRange) => {
    setLoading(true)
    setError('')
    try {
      const [sum, hist] = await Promise.all([
        profilingApi.getSummary(assetId),
        profilingApi.getHistory(assetId, d),
      ])
      setSummary(sum)
      setHistory(hist)
    } catch {
      setError('Failed to load profile history.')
    } finally {
      setLoading(false)
    }
  }, [assetId])

  useEffect(() => { load(days) }, [load, days])

  const sorted = [...summary].sort((a, b) => {
    if (a.drift_detected !== b.drift_detected) return a.drift_detected ? -1 : 1
    const aDelta = Math.abs(a.null_pct_delta ?? 0)
    const bDelta = Math.abs(b.null_pct_delta ?? 0)
    if (aDelta !== bDelta) return bDelta - aDelta
    return a.column_name.localeCompare(b.column_name)
  })

  const driftCount = summary.filter(s => s.drift_detected).length

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          {(Object.keys(METRIC_LABELS) as Metric[]).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                metric === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-[var(--border)] text-gray-600 dark:text-[var(--text-2)] hover:border-indigo-300'
              }`}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {([30, 90] as DayRange[]).map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                days === d
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-[var(--surface)] border border-gray-200 dark:border-[var(--border)] text-gray-600 dark:text-[var(--text-2)] hover:border-indigo-300'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Drift summary banner */}
      {!loading && driftCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-xs text-red-700 dark:text-red-400">
          <TrendingUp size={13} />
          <span><strong>{driftCount} column{driftCount !== 1 ? 's' : ''}</strong> show significant drift since the last profile run.</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-gray-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading profile history…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-12 text-sm text-red-500">{error}</div>
      )}

      {/* No history */}
      {!loading && !error && summary.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp size={32} className="text-gray-200 dark:text-[var(--text-4)] mb-3" />
          <p className="text-sm font-semibold text-gray-600 dark:text-[var(--text-2)]">No profile history yet</p>
          <p className="text-xs text-gray-400 dark:text-[var(--text-4)] mt-1 max-w-xs">
            Run a column profile from the Schema tab to start capturing history. History builds with each profile run.
          </p>
        </div>
      )}

      {/* Column cards */}
      {!loading && !error && sorted.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {sorted.map(s => (
            <ColumnTrendCard
              key={s.column_name}
              summary={s}
              history={history}
              metric={metric}
            />
          ))}
        </div>
      )}
    </div>
  )
}
