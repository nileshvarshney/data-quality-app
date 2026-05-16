import clsx from 'clsx'

interface Props {
  score: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
}

export function scoreColor(score: number | null | undefined) {
  if (score == null) return 'text-gray-400'
  if (score >= 95) return 'text-green-600'
  if (score >= 80) return 'text-yellow-600'
  if (score >= 60) return 'text-orange-500'
  return 'text-red-600'
}

export function scoreBg(score: number | null | undefined) {
  if (score == null) return 'bg-gray-100'
  if (score >= 95) return 'bg-green-50 border-green-200'
  if (score >= 80) return 'bg-yellow-50 border-yellow-200'
  if (score >= 60) return 'bg-orange-50 border-orange-200'
  return 'bg-red-50 border-red-200'
}

export default function ScoreBadge({ score, size = 'md' }: Props) {
  const sizeClass = { sm: 'text-sm font-semibold', md: 'text-2xl font-bold', lg: 'text-4xl font-bold' }[size]
  return (
    <span className={clsx(sizeClass, scoreColor(score))}>
      {score != null ? `${score}%` : '—'}
    </span>
  )
}
