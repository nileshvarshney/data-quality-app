import clsx from 'clsx'

export default function SeverityBadge({ severity }: { severity: string }) {
  const isCritical = severity === 'critical'
  const cls = ({
    critical: 'badge-critical',
    high:     'badge-high',
    medium:   'badge-medium',
    low:      'badge-low',
  } as Record<string, string>)[severity] ?? 'badge-low'

  return (
    <span className={clsx(cls, 'inline-flex items-center gap-1.5')}>
      {isCritical && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
      )}
      {severity}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const cls = `status-${status}`
  return <span className={cls}>{status.replace('_', ' ')}</span>
}
