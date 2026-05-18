import Link from 'next/link'
import { Star, Database, BookOpen, Package } from 'lucide-react'
import clsx from 'clsx'
import CertificationBadge from '@/components/common/CertificationBadge'
import type { CatalogItem } from './CatalogResultCard'

const ENTITY_HREF: Record<string, (id: string) => string> = {
  asset:        id => `/dashboard/tables/${id}`,
  glossary:     () => '/glossary',
  data_product: () => '/data-products',
}

const ENTITY_BADGE: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  asset:        { icon: <Database size={10} />, label: 'Table',        cls: 'bg-blue-50 text-blue-700' },
  glossary:     { icon: <BookOpen size={10} />, label: 'Glossary',     cls: 'bg-purple-50 text-purple-700' },
  data_product: { icon: <Package  size={10} />, label: 'Data Product', cls: 'bg-teal-50 text-teal-700' },
}

const QUALITY_COLOR = (s: number | null | undefined) =>
  s == null ? 'text-gray-400' : s >= 95 ? 'text-green-600' : s >= 80 ? 'text-amber-500' : 'text-red-500'

export default function CatalogResultRow({ item }: { item: CatalogItem }) {
  const href   = (ENTITY_HREF[item.entity_type] ?? ENTITY_HREF.asset)(item.id)
  const badge  = ENTITY_BADGE[item.entity_type] ?? ENTITY_BADGE.asset

  return (
    <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
      <td className="py-2.5 px-3">
        <Link href={href} className="font-medium text-xs text-blue-700 hover:underline">
          {item.name}
        </Link>
        {item.description && (
          <p className="text-[11px] text-gray-400 truncate max-w-xs">{item.description}</p>
        )}
      </td>
      <td className="py-2.5 px-3">
        <span className={clsx('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded', badge.cls)}>
          {badge.icon}{badge.label}
        </span>
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-600">{item.domain ?? '—'}</td>
      <td className="py-2.5 px-3 text-xs text-gray-600 truncate max-w-xs">{item.owner ?? '—'}</td>
      <td className={`py-2.5 px-3 text-xs font-semibold ${QUALITY_COLOR(item.quality_score)}`}>
        {item.quality_score != null ? `${item.quality_score.toFixed(1)}%` : '—'}
      </td>
      <td className="py-2.5 px-3">
        {item.certification_status
          ? <CertificationBadge status={item.certification_status} />
          : <span className="text-xs text-gray-400">—</span>}
      </td>
      <td className="py-2.5 px-3 text-xs text-gray-400">
        {item.avg_rating && item.avg_rating > 0 ? (
          <span className="flex items-center gap-0.5 text-amber-500">
            <Star size={11} fill="currentColor" />
            {item.avg_rating.toFixed(1)}
          </span>
        ) : '—'}
      </td>
    </tr>
  )
}
