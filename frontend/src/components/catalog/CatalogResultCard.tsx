import Link from 'next/link'
import { Globe, Star, Database, BookOpen, Package } from 'lucide-react'
import clsx from 'clsx'
import ScoreRing from '@/components/common/ScoreRing'
import CertificationBadge from '@/components/common/CertificationBadge'

const CLASSIFICATION_COLORS: Record<string, string> = {
  PII:          'bg-red-100 text-red-700',
  SENSITIVE:    'bg-orange-100 text-orange-700',
  CONFIDENTIAL: 'bg-yellow-100 text-yellow-700',
  RESTRICTED:   'bg-purple-100 text-purple-700',
  PUBLIC:       'bg-green-100 text-green-700',
}

const ENTITY_BADGE: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  asset:        { icon: <Database size={11} />, label: 'Table',        cls: 'bg-blue-50 text-blue-700 border-blue-100' },
  glossary:     { icon: <BookOpen size={11} />, label: 'Glossary',     cls: 'bg-purple-50 text-purple-700 border-purple-100' },
  data_product: { icon: <Package  size={11} />, label: 'Data Product', cls: 'bg-teal-50 text-teal-700 border-teal-100' },
}

const ENTITY_HREF: Record<string, (id: string) => string> = {
  asset:        id => `/dashboard/tables/${id}`,
  glossary:     () => '/glossary',
  data_product: () => '/data-products',
}

export interface CatalogItem {
  id: string
  entity_type: string
  name: string
  description?: string | null
  domain?: string | null
  owner?: string | null
  certification_status?: string | null
  quality_score?: number | null
  trust_score?: number | null
  avg_rating?: number | null
  classification_tags?: string[]
  tag_names?: string[]
}

export default function CatalogResultCard({ item }: { item: CatalogItem }) {
  const href  = (ENTITY_HREF[item.entity_type] ?? ENTITY_HREF.asset)(item.id)
  const badge = ENTITY_BADGE[item.entity_type] ?? ENTITY_BADGE.asset

  return (
    <Link
      href={href}
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-blue-300 transition-all"
    >
      <div className="flex items-start gap-3">
        {item.quality_score != null && (
          <div className="shrink-0 mt-0.5">
            <ScoreRing score={item.quality_score} size={40} strokeWidth={4} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 truncate">{item.name}</span>
            {item.certification_status && (
              <CertificationBadge status={item.certification_status} />
            )}
            <span className={clsx(
              'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ml-auto shrink-0',
              badge.cls
            )}>
              {badge.icon}{badge.label}
            </span>
          </div>

          {item.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
          )}

          {item.classification_tags && item.classification_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.classification_tags.map(c => (
                <span key={c} className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', CLASSIFICATION_COLORS[c] ?? 'bg-gray-100 text-gray-600')}>
                  {c}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
            {item.domain && (
              <span className="flex items-center gap-1"><Globe size={11} />{item.domain}</span>
            )}
            {item.owner && <span>Owner: {item.owner}</span>}
            {item.avg_rating != null && item.avg_rating > 0 && (
              <span className="flex items-center gap-0.5 text-amber-500">
                <Star size={11} fill="currentColor" />
                {item.avg_rating.toFixed(1)}
              </span>
            )}
            {item.trust_score != null && (
              <span className="text-gray-300">Trust {item.trust_score.toFixed(0)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
