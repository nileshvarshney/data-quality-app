'use client'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import type { ProfileHistoryPoint, ProfileSummary } from '@/services/profilingApi'

type Metric = 'null_pct' | 'cardinality_pct' | 'top_values'

interface Props {
  summary: ProfileSummary
  history: ProfileHistoryPoint[]
  metric: Metric
}

const fmt = (d: string) => {
  const dt = new Date(d)
  return `${dt.getMonth() + 1}/${dt.getDate()}`
}

function borderColor(s: ProfileSummary): string {
  if (!s.drift_detected) return 'border-l-green-400'
  const delta = Math.abs(s.null_pct_delta ?? 0)
  return delta > 10 ? 'border-l-red-500' : 'border-l-yellow-400'
}

function driftLabel(s: ProfileSummary): string | null {
  if (!s.drift_detected) return null
  const parts: string[] = []
  if (s.null_pct_delta !== null && Math.abs(s.null_pct_delta) > 5) {
    parts.push(`null ${s.null_pct_delta > 0 ? '+' : ''}${s.null_pct_delta.toFixed(1)}pp`)
  }
  if (s.cardinality_delta !== null && Math.abs(s.cardinality_delta) > 10) {
    parts.push(`cardinality ${s.cardinality_delta > 0 ? '+' : ''}${s.cardinality_delta.toFixed(1)}pp`)
  }
  return parts.join(', ') || null
}

function metricValue(s: ProfileSummary, metric: Metric): string {
  if (metric === 'null_pct') return s.latest_null_pct != null ? `${s.latest_null_pct.toFixed(1)}% null` : '—'
  if (metric === 'cardinality_pct') return s.latest_cardinality_pct != null ? `${s.latest_cardinality_pct.toFixed(1)}% unique` : '—'
  return ''
}

function TopValuesChart({ history }: { history: ProfileHistoryPoint[] }) {
  const topKeys = Array.from(
    new Set(history.flatMap(p => p.top_values.slice(0, 3).map(v => v.value)))
  ).slice(0, 3)

  const chartData = history.map(p => {
    const total = p.top_values.reduce((s, v) => s + v.count, 0) || 1
    const entry: Record<string, any> = { date: p.profile_date }
    topKeys.forEach(k => {
      const found = p.top_values.find(v => v.value === k)
      entry[k] = found ? Math.round((found.count / total) * 100) : 0
    })
    return entry
  })

  const COLORS = ['#6366f1', '#0ea5e9', '#f59e0b']
  if (chartData.length === 0 || topKeys.length === 0) {
    return <p className="text-xs text-gray-400 italic py-4 text-center">No top-value history</p>
  }

  return (
    <ResponsiveContainer width="100%" height={64}>
      <BarChart data={chartData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
        <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 9 }} />
        <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
        <Tooltip
          formatter={(v: number, name: string) => [`${v}%`, name]}
          labelFormatter={fmt}
          contentStyle={{ fontSize: 11 }}
        />
        {topKeys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === topKeys.length - 1 ? [2, 2, 0, 0] : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function ColumnTrendCard({ summary, history, metric }: Props) {
  const colHistory = history.filter(h => h.column_name === summary.column_name)
  const drift = driftLabel(summary)

  const chartData = colHistory.map(p => ({
    date: p.profile_date,
    value: metric === 'null_pct' ? p.null_pct : p.cardinality_pct,
  }))

  const gradientId = `grad-${summary.column_name.replace(/\W/g, '_')}`

  return (
    <div className={`bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-[var(--border)] border-l-4 ${borderColor(summary)} p-4`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-xs font-semibold text-gray-900 dark:text-[var(--text)] font-mono">{summary.column_name}</span>
          {drift && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertTriangle size={9} /> {drift}
            </span>
          )}
        </div>
        <span className="text-[11px] text-gray-400 dark:text-[var(--text-4)] shrink-0">{metricValue(summary, metric)}</span>
      </div>

      {colHistory.length < 2 ? (
        <p className="text-xs text-gray-400 italic py-3 text-center">Not enough profile history — run profiling at least twice to see trends</p>
      ) : metric === 'top_values' ? (
        <TopValuesChart history={colHistory} />
      ) : (
        <ResponsiveContainer width="100%" height={64}>
          <AreaChart data={chartData} margin={{ top: 2, right: 2, left: -32, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e2e8f0)" />
            <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
            <Tooltip
              formatter={(v: any) => [v != null ? `${(v as number).toFixed(1)}%` : '—', metric === 'null_pct' ? 'Null %' : 'Cardinality %']}
              labelFormatter={fmt}
              contentStyle={{ fontSize: 11 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#6366f1"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
