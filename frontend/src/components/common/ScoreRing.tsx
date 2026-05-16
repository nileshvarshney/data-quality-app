interface Props {
  score: number
  size?: number
  strokeWidth?: number
  trackColor?: string
}

export default function ScoreRing({ score, size = 72, strokeWidth = 7, trackColor = '#e2e8f0' }: Props) {
  const r = (size - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, score))
  const progress = (clamped / 100) * circ
  const gap = circ - progress
  const color = score >= 95 ? '#22c55e' : score >= 80 ? '#f59e0b' : score >= 60 ? '#f97316' : '#ef4444'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${progress} ${gap}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
    </svg>
  )
}
