import clsx from 'clsx'
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface Props {
  title: string
  value: string | number
  icon: LucideIcon
  iconColor?: string
  subtitle?: string
  delta?: string
  deltaPositive?: boolean
  accentTop?: boolean
}

export default function StatCard({
  title, value, icon: Icon,
  iconColor = 'text-indigo-500',
  subtitle, delta, deltaPositive, accentTop = true,
}: Props) {
  return (
    <div className={clsx(
      'bg-white dark:bg-[var(--surface)] rounded-xl border border-gray-200 dark:border-[var(--border)] p-5 flex items-start gap-4',
      accentTop && 'card-accent-top'
    )}>
      <div className={clsx('p-2.5 rounded-lg bg-gray-50 dark:bg-indigo-500/10', iconColor)}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 dark:text-[var(--text-3)] truncate">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-[var(--text)] mt-0.5 tracking-tight">{value}</p>
        {delta && (
          <p className={clsx(
            'text-xs font-medium mt-1 flex items-center gap-1',
            deltaPositive === true  && 'text-green-600 dark:text-green-400',
            deltaPositive === false && 'text-red-500 dark:text-red-400',
            deltaPositive === undefined && 'text-gray-400 dark:text-[var(--text-4)]',
          )}>
            {deltaPositive === true  && <TrendingUp  size={11} />}
            {deltaPositive === false && <TrendingDown size={11} />}
            {deltaPositive === undefined && <Minus size={11} />}
            {delta}
          </p>
        )}
        {subtitle && !delta && (
          <p className="text-xs text-gray-400 dark:text-[var(--text-4)] mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
