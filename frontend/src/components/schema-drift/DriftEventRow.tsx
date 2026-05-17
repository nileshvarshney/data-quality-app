import type { SchemaDriftEvent } from '@/types/schemaDrift'

const CHANGE_BADGE: Record<SchemaDriftEvent['change_type'], { label: string; cls: string }> = {
  column_deleted:      { label: 'COLUMN DELETED',      cls: 'bg-red-100 text-red-700' },
  type_changed:        { label: 'TYPE CHANGED',         cls: 'bg-orange-100 text-orange-700' },
  column_added:        { label: 'COLUMN ADDED',         cls: 'bg-blue-100 text-blue-700' },
  nullability_changed: { label: 'NULLABILITY CHANGED',  cls: 'bg-yellow-100 text-yellow-700' },
}

export function DriftEventRow({ event }: { event: SchemaDriftEvent }) {
  const badge = CHANGE_BADGE[event.change_type]
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-2.5 text-sm font-mono text-gray-800">{event.column_name}</td>
      <td className="px-4 py-2.5">
        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
          {badge.label}
        </span>
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-500 font-mono">
        {event.old_value ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-800 font-mono">
        {event.new_value ?? <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}
