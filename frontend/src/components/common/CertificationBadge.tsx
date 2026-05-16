import { BadgeCheck, AlertTriangle, XCircle, Circle } from 'lucide-react'
import clsx from 'clsx'

const CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  certified:   { label: 'Certified',   cls: 'bg-green-100 text-green-800 border-green-200',  icon: <BadgeCheck size={11} /> },
  warning:     { label: 'Warning',     cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: <AlertTriangle size={11} /> },
  failed:      { label: 'Failed',      cls: 'bg-red-100 text-red-800 border-red-200',          icon: <XCircle size={11} /> },
  uncertified: { label: 'Uncertified', cls: 'bg-gray-100 text-gray-500 border-gray-200',       icon: <Circle size={11} /> },
}

export default function CertificationBadge({ status }: { status: string }) {
  const cfg = CONFIG[status] ?? CONFIG.uncertified
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border', cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}
