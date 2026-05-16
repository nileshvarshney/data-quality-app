'use client'
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'

interface TrendPoint {
  date: string
  score: number | null
}

interface Props {
  data: TrendPoint[]
  height?: number
  area?: boolean
  mini?: boolean
}

const fmt = (date: string) => {
  const d = new Date(date)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function QualityTrendChart({ data, height = 200, area = false, mini = false }: Props) {
  if (mini) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id="miniGradientIndigo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="score"
            stroke="#6366f1"
            strokeWidth={1.5}
            fill="url(#miniGradientIndigo)"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  if (area) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="qualityGradientIndigo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v: number) => [`${v?.toFixed(1) ?? '—'}%`, 'Quality Score']}
            labelFormatter={fmt}
            contentStyle={{ fontSize: 12 }}
          />
          <ReferenceLine y={95} stroke="#22c55e" strokeDasharray="4 4" label={{ value: 'SLA 95%', fontSize: 10, fill: '#22c55e', position: 'insideTopRight' }} />
          <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Warn 80%', fontSize: 10, fill: '#f59e0b', position: 'insideTopRight' }} />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#6366f1"
            strokeWidth={2.5}
            fill="url(#qualityGradientIndigo)"
            dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#6366f1', strokeWidth: 2, stroke: '#a5b4fc' }}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: number) => [`${v?.toFixed(1) ?? '—'}%`, 'Quality Score']}
          labelFormatter={fmt}
        />
        <ReferenceLine y={95} stroke="#22c55e" strokeDasharray="4 4" />
        <ReferenceLine y={80} stroke="#f59e0b" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#6366f1', strokeWidth: 2, stroke: '#a5b4fc' }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
