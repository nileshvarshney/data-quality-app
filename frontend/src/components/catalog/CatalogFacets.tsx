'use client'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

interface FacetItem { id?: string; name?: string; value?: string; count: number }
interface Facets {
  domains: FacetItem[]
  classifications: FacetItem[]
  certifications: FacetItem[]
  tags: FacetItem[]
}
interface Filters {
  domain_id?: string
  classification?: string
  certification?: string
  tag?: string
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  PII:          'bg-red-100 text-red-700',
  SENSITIVE:    'bg-orange-100 text-orange-700',
  CONFIDENTIAL: 'bg-yellow-100 text-yellow-700',
  RESTRICTED:   'bg-purple-100 text-purple-700',
  PUBLIC:       'bg-green-100 text-green-700',
}

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 pb-3 mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2"
      >
        {title}
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && <div className="space-y-1">{children}</div>}
    </div>
  )
}

function EmptyFacet({ label }: { label: string }) {
  return (
    <p className="text-[11px] text-gray-400 px-2 py-1 italic">
      No {label.toLowerCase()} data
    </p>
  )
}

export default function CatalogFacets({
  facets, filters, onChange,
}: { facets: Facets; filters: Filters; onChange: (key: keyof Filters, value: string | undefined) => void }) {
  const hasAnySidebar =
    facets.domains.length > 0 ||
    facets.classifications.length > 0 ||
    facets.certifications.length > 0 ||
    facets.tags.length > 0

  if (!hasAnySidebar) return null

  return (
    <aside className="w-52 shrink-0 pr-4">
      {facets.domains.length > 0 && (
        <Section title="Domain">
          {facets.domains.map(d => (
            <button
              key={d.id}
              onClick={() => onChange('domain_id', filters.domain_id === d.id ? undefined : d.id)}
              className={clsx(
                'flex items-center justify-between w-full text-xs px-2 py-1 rounded-lg transition-colors',
                filters.domain_id === d.id
                  ? 'bg-blue-100 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <span className="truncate">{d.name}</span>
              <span className="ml-1 text-gray-400 shrink-0">{d.count}</span>
            </button>
          ))}
        </Section>
      )}

      <Section title="Classification">
        {facets.classifications.length > 0 ? (
          facets.classifications.map(c => (
            <button
              key={c.value}
              onClick={() => onChange('classification', filters.classification === c.value ? undefined : c.value)}
              className={clsx(
                'flex items-center justify-between w-full text-xs px-2 py-1 rounded-lg transition-colors',
                filters.classification === c.value
                  ? 'ring-2 ring-inset ring-blue-400 font-semibold'
                  : 'hover:bg-gray-100'
              )}
            >
              <span className={clsx('px-1.5 py-0.5 rounded text-xs', CLASSIFICATION_COLORS[c.value!] ?? 'bg-gray-100 text-gray-600')}>
                {c.value}
              </span>
              <span className="ml-1 text-gray-400 shrink-0">{c.count}</span>
            </button>
          ))
        ) : (
          <EmptyFacet label="Classification" />
        )}
      </Section>

      <Section title="Certification">
        {facets.certifications.length > 0 ? (
          facets.certifications.map(c => (
            <button
              key={c.value}
              onClick={() => onChange('certification', filters.certification === c.value ? undefined : c.value)}
              className={clsx(
                'flex items-center justify-between w-full text-xs px-2 py-1 rounded-lg transition-colors capitalize',
                filters.certification === c.value
                  ? 'bg-blue-100 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <span>{c.value}</span>
              <span className="ml-1 text-gray-400 shrink-0">{c.count}</span>
            </button>
          ))
        ) : (
          <EmptyFacet label="Certification" />
        )}
      </Section>

      {facets.tags.length > 0 && (
        <Section title="Tags" defaultOpen={false}>
          {facets.tags.map(t => (
            <button
              key={t.name}
              onClick={() => onChange('tag', filters.tag === t.name ? undefined : t.name)}
              className={clsx(
                'flex items-center justify-between w-full text-xs px-2 py-1 rounded-lg transition-colors',
                filters.tag === t.name
                  ? 'bg-blue-100 text-blue-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <span>#{t.name}</span>
              <span className="ml-1 text-gray-400 shrink-0">{t.count}</span>
            </button>
          ))}
        </Section>
      )}
    </aside>
  )
}
