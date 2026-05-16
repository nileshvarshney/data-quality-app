import clsx from 'clsx'

interface QuickFilter {
  id: string
  label: string
  filterKey: string
  filterValue: string
}

const QUICK_FILTERS: QuickFilter[] = [
  { id: 'my',          label: 'My assets',      filterKey: 'owner',          filterValue: '__me__' },
  { id: 'pii',         label: 'PII tables',      filterKey: 'classification', filterValue: 'PII' },
  { id: 'uncertified', label: 'Uncertified',     filterKey: 'certification',  filterValue: 'uncertified' },
  { id: 'lowquality',  label: 'Low quality',     filterKey: 'sort',           filterValue: 'quality' },
  { id: 'recent',      label: 'Recently added',  filterKey: 'sort',           filterValue: 'updated' },
]

interface Props {
  activeFilters: Record<string, string | undefined>
  userEmail: string
  onChange: (key: string, value: string | undefined) => void
}

export default function QuickFilters({ activeFilters, userEmail, onChange }: Props) {
  const isActive = (f: QuickFilter) => {
    const val = f.filterValue === '__me__' ? userEmail : f.filterValue
    return activeFilters[f.filterKey] === val
  }

  const handleClick = (f: QuickFilter) => {
    const resolvedValue = f.filterValue === '__me__' ? userEmail : f.filterValue
    if (isActive(f)) {
      onChange(f.filterKey, undefined)
    } else {
      onChange(f.filterKey, resolvedValue)
    }
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {QUICK_FILTERS.map(f => (
        <button
          key={f.id}
          onClick={() => handleClick(f)}
          className={clsx(
            'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
            isActive(f)
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
