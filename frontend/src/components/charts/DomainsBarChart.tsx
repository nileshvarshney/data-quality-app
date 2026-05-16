'use client'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'

interface Props {
  data: Array<{ domain_name: string; quality_score: number }>
  height?: number
}

function barColor(score: number) {
  if (score >= 95) return '#22c55e'
  if (score >= 80) return '#f59e0b'
  if (score >= 60) return '#f97316'
  return '#ef4444'
}

export default function DomainsBarChart({ data, height = 220 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="domain_name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => [`${v?.toFixed(1)}%`, 'Quality Score']} />
        <Bar dataKey="quality_score" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={barColor(entry.quality_score)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
