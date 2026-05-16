'use client'
import { useEffect, useState, useCallback } from 'react'
import { domainsApi, subdomainsApi } from '@/services/apiClient'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Loader2, Check, X, Search, RotateCcw } from 'lucide-react'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Domain {
  domain_id: string
  domain_name: string
  description: string | null
  owner_name: string | null
  owner_email: string | null
  is_active: boolean
}

interface Subdomain {
  subdomain_id: string
  domain_id: string
  subdomain_name: string
  description: string | null
  owner_name: string | null
  owner_email: string | null
  is_active: boolean
}

// ── Inline edit form ──────────────────────────────────────────────────────────

function InlineEditForm({
  initial,
  fields,
  onSave,
  onCancel,
}: {
  initial: Record<string, string>
  fields: { key: string; label: string; required?: boolean }[]
  onSave: (values: Record<string, string>) => Promise<void>
  onCancel: () => void
}) {
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(values) }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      {fields.map(f => (
        <div key={f.key}>
          <label className="text-xs font-medium text-gray-600 block mb-1">{f.label}</label>
          <input
            value={values[f.key] || ''}
            onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 text-sm rounded-lg text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Subdomain row ─────────────────────────────────────────────────────────────

function SubdomainRow({ sub, onUpdate, onDelete }: {
  sub: Subdomain
  onUpdate: (id: string, data: Record<string, string>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Deactivate subdomain "${sub.subdomain_name}"?`)) return
    setDeleting(true)
    try { await onDelete(sub.subdomain_id) }
    finally { setDeleting(false) }
  }

  return (
    <div className="ml-6 mt-2">
      {editing ? (
        <InlineEditForm
          initial={{ subdomain_name: sub.subdomain_name, description: sub.description || '', owner_name: sub.owner_name || '', owner_email: sub.owner_email || '' }}
          fields={[
            { key: 'subdomain_name', label: 'Subdomain Name', required: true },
            { key: 'description', label: 'Description' },
            { key: 'owner_name', label: 'Owner Name' },
            { key: 'owner_email', label: 'Owner Email' },
          ]}
          onSave={async values => { await onUpdate(sub.subdomain_id, values); setEditing(false) }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg border border-gray-200 group">
          <div>
            <p className="text-sm font-medium text-gray-800">{sub.subdomain_name}</p>
            {sub.description && <p className="text-xs text-gray-400">{sub.description}</p>}
            {sub.owner_name && <p className="text-xs text-gray-400">Owner: {sub.owner_name}</p>}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
              <Edit2 size={12} />
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Domain card ───────────────────────────────────────────────────────────────

function DomainCard({ domain, onUpdate, onDelete }: {
  domain: Domain
  onUpdate: (id: string, data: Record<string, string>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [addingSub, setAddingSub] = useState(false)
  const [subdomains, setSubdomains] = useState<Subdomain[]>([])
  const [subLoading, setSubLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadSubdomains = useCallback(async () => {
    setSubLoading(true)
    try {
      const res = await subdomainsApi.list(domain.domain_id)
      setSubdomains(res.data)
    } finally { setSubLoading(false) }
  }, [domain.domain_id])

  const handleExpand = () => {
    if (!expanded) loadSubdomains()
    setExpanded(v => !v)
  }

  const handleSubUpdate = async (id: string, data: Record<string, string>) => {
    await subdomainsApi.update(id, data)
    loadSubdomains()
  }

  const handleSubDelete = async (id: string) => {
    await subdomainsApi.update(id, { is_active: 'false' } as any)
    loadSubdomains()
  }

  const handleAddSub = async (values: Record<string, string>) => {
    await subdomainsApi.create({ domain_id: domain.domain_id, ...values })
    setAddingSub(false)
    loadSubdomains()
  }

  const handleDelete = async () => {
    if (!confirm(`Deactivate domain "${domain.domain_name}"? All subdomains will be affected.`)) return
    setDeleting(true)
    try { await onDelete(domain.domain_id) }
    finally { setDeleting(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {editing ? (
        <div className="p-4">
          <InlineEditForm
            initial={{ domain_name: domain.domain_name, description: domain.description || '', owner_name: domain.owner_name || '', owner_email: domain.owner_email || '' }}
            fields={[
              { key: 'domain_name', label: 'Domain Name', required: true },
              { key: 'description', label: 'Description' },
              { key: 'owner_name', label: 'Owner Name' },
              { key: 'owner_email', label: 'Owner Email' },
            ]}
            onSave={async values => { await onUpdate(domain.domain_id, values); setEditing(false) }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">{domain.domain_name}</h3>
                {!domain.is_active && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactive</span>}
              </div>
              {domain.description && <p className="text-sm text-gray-500 mt-0.5">{domain.description}</p>}
              {domain.owner_name && <p className="text-xs text-gray-400 mt-0.5">Owner: {domain.owner_name} {domain.owner_email && `(${domain.owner_email})`}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(true)}
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                <Edit2 size={14} />
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          </div>

          {/* Expand subdomains */}
          <button
            onClick={handleExpand}
            className="flex items-center gap-1 mt-3 text-xs text-gray-500 hover:text-blue-600 transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Hide' : 'Manage'} Subdomains
          </button>
        </div>
      )}

      {expanded && !editing && (
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          {subLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-2">
              {subdomains.filter(s => s.is_active).map(sub => (
                <SubdomainRow key={sub.subdomain_id} sub={sub}
                  onUpdate={handleSubUpdate} onDelete={handleSubDelete} />
              ))}
              {subdomains.filter(s => s.is_active).length === 0 && (
                <p className="text-xs text-gray-400 ml-6">No active subdomains</p>
              )}
            </div>
          )}

          {addingSub ? (
            <div className="mt-3 ml-6">
              <InlineEditForm
                initial={{ subdomain_name: '', description: '', owner_name: '', owner_email: '' }}
                fields={[
                  { key: 'subdomain_name', label: 'Subdomain Name', required: true },
                  { key: 'description', label: 'Description' },
                  { key: 'owner_name', label: 'Owner Name' },
                  { key: 'owner_email', label: 'Owner Email' },
                ]}
                onSave={handleAddSub}
                onCancel={() => setAddingSub(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingSub(true)}
              className="flex items-center gap-1 mt-3 ml-6 text-xs text-blue-600 hover:underline"
            >
              <Plus size={11} /> Add Subdomain
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDomainsPage() {
  const [domains, setDomains]         = useState<Domain[]>([])
  const [loading, setLoading]         = useState(true)
  const [adding, setAdding]           = useState(false)
  const [q, setQ]                     = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await domainsApi.list()
      setDomains(res.data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (values: Record<string, string>) => {
    await domainsApi.create(values)
    setAdding(false)
    load()
  }

  const handleUpdate = async (id: string, data: Record<string, string>) => {
    await domainsApi.update(id, data)
    load()
  }

  const handleDelete = async (id: string) => {
    await domainsApi.delete(id)
    load()
  }

  const handleRestore = async (id: string) => {
    await domainsApi.update(id, { is_active: 'true' } as any)
    load()
  }

  const filtered = domains
    .filter(d => showInactive || d.is_active)
    .filter(d => !q || d.domain_name.toLowerCase().includes(q.toLowerCase()) || (d.owner_email ?? '').toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="p-8">
      <Breadcrumbs items={[{ label: 'Admin' }, { label: 'Domain Management' }]} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Domain Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            Create and manage business domains and their subdomains. Changes are reflected immediately across the platform.
          </p>
        </div>
        <button onClick={() => setAdding(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus size={14} /> {adding ? 'Cancel' : 'New Domain'}
        </button>
      </div>

      {adding && (
        <div className="mb-6">
          <InlineEditForm
            initial={{ domain_name: '', description: '', owner_name: '', owner_email: '' }}
            fields={[
              { key: 'domain_name', label: 'Domain Name', required: true },
              { key: 'description', label: 'Description' },
              { key: 'owner_name', label: 'Business Owner Name' },
              { key: 'owner_email', label: 'Business Owner Email' },
            ]}
            onSave={handleCreate}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Search + filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search domains…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => setShowInactive(s => !s)}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors',
            showInactive ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
          {showInactive ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(domain => (
            domain.is_active ? (
              <DomainCard key={domain.domain_id} domain={domain} onUpdate={handleUpdate} onDelete={handleDelete} />
            ) : (
              <div key={domain.domain_id} className="bg-white rounded-xl border border-gray-200 p-4 opacity-60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-700">{domain.domain_name}</h3>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Archived</span>
                  </div>
                  {domain.description && <p className="text-sm text-gray-400 mt-0.5">{domain.description}</p>}
                </div>
                <button onClick={() => handleRestore(domain.domain_id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 hover:border-green-300 hover:text-green-700">
                  <RotateCcw size={12} /> Restore
                </button>
              </div>
            )
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg font-medium">{q ? 'No domains match your search' : 'No domains yet'}</p>
              <p className="text-sm mt-1">{q ? 'Try a different search term' : 'Create your first domain to get started'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
