import type { LineageAsset } from '@/types/lineage'

interface Props {
  asset: LineageAsset | null
  onClose: () => void
}

export function LineageSidePanel({ asset, onClose }: Props) {
  if (!asset) {
    return (
      <div className="w-[300px] border-l border-gray-200 bg-white flex items-center justify-center shrink-0">
        <p className="text-sm text-gray-400 px-4 text-center">Click a node to see details</p>
      </div>
    )
  }

  const isView = asset.table_type?.toUpperCase().includes('VIEW') ?? false
  const owners = [asset.owner_name, asset.technical_owner_name].filter(Boolean) as string[]

  return (
    <div className="w-[300px] border-l border-gray-200 bg-white flex flex-col overflow-y-auto shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 break-words leading-tight">{asset.sf_table_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isView ? '👁 View' : '📋 Table'} · {asset.sf_schema_name}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 mt-0.5"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {/* Row / Column metrics */}
      <div className="p-4 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Overview</p>
        <div className="flex divide-x divide-gray-100">
          <div className="flex-1 text-center px-2">
            <p className="text-lg font-bold text-blue-600">
              {asset.row_count != null ? asset.row_count.toLocaleString() : '—'}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">Rows</p>
          </div>
          <div className="flex-1 text-center px-2">
            <p className="text-lg font-bold text-blue-600">{asset.column_count}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Columns</p>
          </div>
        </div>
      </div>

      {/* Description */}
      {asset.table_description && (
        <div className="p-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Description</p>
          <p className="text-xs text-gray-600 leading-relaxed">{asset.table_description}</p>
        </div>
      )}

      {/* Owners */}
      {owners.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Owners</p>
          <div className="flex flex-wrap gap-1.5">
            {owners.map(name => (
              <span
                key={name}
                className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-2 py-1 text-xs text-gray-600"
              >
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[8px] font-bold flex items-center justify-center shrink-0">
                  {name[0].toUpperCase()}
                </span>
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Classification */}
      {asset.classifications.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Classification</p>
          <div className="flex flex-wrap gap-1.5">
            {asset.classifications.map(c => (
              <span
                key={c}
                className="px-2 py-0.5 text-xs rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-medium"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Terms */}
      {asset.terms.length > 0 && (
        <div className="p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Terms</p>
          <div className="flex flex-wrap gap-1.5">
            {asset.terms.map(t => (
              <span
                key={t}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700 border border-blue-200"
              >
                📄 {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
