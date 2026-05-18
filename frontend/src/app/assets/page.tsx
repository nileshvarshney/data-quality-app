'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { assetsApi, connectionsApi, domainsApi, subdomainsApi } from '@/services/apiClient'
import CertificationBadge from '@/components/common/CertificationBadge'
import {
  Plus, Database, ChevronRight, Search,
  Loader2, CheckCircle, AlertCircle, Cloud, X, Pencil, Trash2, Save,
  Square, CheckSquare, ListChecks, ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnrichedAsset {
  asset_id: string
  connection_id: string | null
  connection_name: string | null
  sf_database_name: string | null
  sf_schema_name: string
  sf_table_name: string
  table_description: string | null
  table_type: string | null
  criticality: string
  certification_status: string
  certified_by: string | null
  owner_name: string | null
  owner_email: string | null
  technical_owner_name: string | null
  technical_owner_email: string | null
  is_active: boolean
  domain_id: string
  domain_name: string
  subdomain_id: string
  subdomain_name: string
  created_at: string
}

// ── Edit asset drawer ─────────────────────────────────────────────────────────

function EditAssetDrawer({
  asset,
  onClose,
  onSaved,
}: {
  asset: EnrichedAsset
  onClose: () => void
  onSaved: (updated: EnrichedAsset) => void
}) {
  const [form, setForm] = useState({
    table_description: asset.table_description || '',
    table_type: asset.table_type || '',
    criticality: asset.criticality,
    certification_status: asset.certification_status || 'uncertified',
    owner_name: asset.owner_name || '',
    owner_email: asset.owner_email || '',
    technical_owner_name: asset.technical_owner_name || '',
    technical_owner_email: asset.technical_owner_email || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await assetsApi.update(asset.asset_id, {
        table_description: form.table_description || undefined,
        table_type: form.table_type || undefined,
        criticality: form.criticality,
        owner_name: form.owner_name || undefined,
        owner_email: form.owner_email || undefined,
        technical_owner_name: form.technical_owner_name || undefined,
        technical_owner_email: form.technical_owner_email || undefined,
      })
      if (form.certification_status !== asset.certification_status) {
        await assetsApi.certify(asset.asset_id, form.certification_status)
      }
      onSaved({ ...asset, ...form })
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[480px] bg-white h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Edit Dataset</h2>
            <p className="text-xs text-gray-400 font-mono">{asset.sf_schema_name}.{asset.sf_table_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea className={inp} rows={2} value={form.table_description}
              onChange={e => set('table_description', e.target.value)}
              placeholder="What data does this table contain?" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Criticality</label>
              <select className={inp} value={form.criticality} onChange={e => set('criticality', e.target.value)}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Certification</label>
              <select className={inp} value={form.certification_status} onChange={e => set('certification_status', e.target.value)}>
                <option value="uncertified">Uncertified</option>
                <option value="certified">Certified</option>
                <option value="warning">Warning</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table Type</label>
            <select className={inp} value={form.table_type} onChange={e => set('table_type', e.target.value)}>
              <option value="">Auto / Unknown</option>
              <option value="BASE TABLE">Table</option>
              <option value="VIEW">View</option>
              <option value="MATERIALIZED VIEW">Materialized View</option>
              <option value="EXTERNAL TABLE">External Table</option>
            </select>
          </div>

          <fieldset className="border border-gray-200 rounded-lg p-4">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Business Owner</legend>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input className={inp} value={form.owner_name} onChange={e => set('owner_name', e.target.value)} placeholder="Billing Team" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input className={inp} type="email" value={form.owner_email} onChange={e => set('owner_email', e.target.value)} placeholder="billing@co.com" />
              </div>
            </div>
          </fieldset>

          <fieldset className="border border-gray-200 rounded-lg p-4">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Technical Owner</legend>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input className={inp} value={form.technical_owner_name} onChange={e => set('technical_owner_name', e.target.value)} placeholder="Data Eng Team" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input className={inp} type="email" value={form.technical_owner_email} onChange={e => set('technical_owner_email', e.target.value)} placeholder="data-eng@co.com" />
              </div>
            </div>
          </fieldset>
        </form>

        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button type="button" onClick={handleSubmit as any} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

const CRIT_CLS: Record<string, string> = {
  critical: 'badge-critical',
  high:     'badge-high',
  medium:   'badge-medium',
  low:      'badge-low',
}

// ── Snowflake schema browser (connection → database → schema → loads table list) ─

interface SFTable { table_name: string; table_type: string; row_count?: number; comment?: string }

interface SFLocation {
  connection_id: string
  database: string
  schema: string
  tables: SFTable[]
}

function SchemaBrowser({ onLoad }: { onLoad: (loc: SFLocation) => void }) {
  const [connections, setConnections]     = useState<any[]>([])
  const [databases, setDatabases]         = useState<any[]>([])
  const [schemas, setSchemas]             = useState<any[]>([])
  const [connectionId, setConnectionId]   = useState('')
  const [selectedDb, setSelectedDb]       = useState('')
  const [selectedSchema, setSelectedSchema] = useState('')
  const [loadingConns, setLoadingConns]   = useState(true)
  const [loadingDbs, setLoadingDbs]       = useState(false)
  const [loadingSchemas, setLoadingSchemas] = useState(false)
  const [loadingTables, setLoadingTables] = useState(false)
  const [error, setError]                 = useState('')

  useEffect(() => {
    connectionsApi.list()
      .then(r => {
        const active = r.data.filter((c: any) => c.is_active)
        setConnections(active)
        if (active.length === 1) changeConnection(active[0].connection_id)
      })
      .catch(() => setError('Could not load connections. Check Settings → Snowflake.'))
      .finally(() => setLoadingConns(false))
  }, [])

  const changeConnection = async (id: string) => {
    setConnectionId(id); setDatabases([]); setSchemas([])
    setSelectedDb(''); setSelectedSchema(''); setError('')
    if (!id) return
    setLoadingDbs(true)
    try {
      const res = await connectionsApi.databases(id)
      if (res.data.error) { setError(res.data.error); return }
      setDatabases(res.data.databases)
    } catch (e: any) { setError(e.message) }
    finally { setLoadingDbs(false) }
  }

  const changeDatabase = async (db: string) => {
    setSelectedDb(db); setSchemas([]); setSelectedSchema(''); setError('')
    if (!db) return
    setLoadingSchemas(true)
    try {
      const res = await connectionsApi.schemas(connectionId, db)
      if (res.data.error) { setError(res.data.error); return }
      setSchemas(res.data.schemas)
    } catch (e: any) { setError(e.message) }
    finally { setLoadingSchemas(false) }
  }

  const changeSchema = async (schema: string) => {
    setSelectedSchema(schema); setError('')
    if (!schema) return
    setLoadingTables(true)
    try {
      const res = await connectionsApi.tables(connectionId, selectedDb, schema)
      if (res.data.error) { setError(res.data.error); return }
      onLoad({ connection_id: connectionId, database: selectedDb, schema, tables: res.data.tables })
    } catch (e: any) { setError(e.message) }
    finally { setLoadingTables(false) }
  }

  const sel = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400'

  if (loadingConns) return (
    <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
      <Loader2 size={16} className="animate-spin" /> Loading connections…
    </div>
  )
  if (connections.length === 0) return (
    <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
      <Cloud size={32} className="mx-auto mb-2 opacity-40" />
      <p className="font-medium">No Snowflake connections configured</p>
      <p className="text-sm mt-1">
        Go to <Link href="/settings" className="text-blue-600 underline">Settings → Snowflake</Link> to add one
      </p>
    </div>
  )

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Connection</label>
          <select value={connectionId} onChange={e => changeConnection(e.target.value)} className={sel}>
            <option value="">— select —</option>
            {connections.map((c: any) => (
              <option key={c.connection_id} value={c.connection_id}>{c.connection_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Database {loadingDbs && <Loader2 size={10} className="inline ml-1 animate-spin text-blue-500" />}
          </label>
          <select value={selectedDb} onChange={e => changeDatabase(e.target.value)}
            disabled={!connectionId || loadingDbs} className={sel}>
            <option value="">{!connectionId ? '— select connection —' : loadingDbs ? 'Loading…' : '— select —'}</option>
            {databases.map((d: any) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Schema {loadingSchemas && <Loader2 size={10} className="inline ml-1 animate-spin text-blue-500" />}
          </label>
          <select value={selectedSchema} onChange={e => changeSchema(e.target.value)}
            disabled={!selectedDb || loadingSchemas} className={sel}>
            <option value="">{!selectedDb ? '— select database —' : loadingSchemas ? 'Loading…' : '— select —'}</option>
            {schemas.map((s: any) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      </div>
      {loadingTables && (
        <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
          <Loader2 size={14} className="animate-spin" /> Loading tables…
        </div>
      )}
    </div>
  )
}

// ── Registration form ─────────────────────────────────────────────────────────

function RegisterForm({
  domains,
  onSuccess,
  onCancel,
}: {
  domains: any[]
  onSuccess: (assets: EnrichedAsset[]) => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<'browse' | 'manual'>('browse')

  // ── Step 1: Classification + Ownership ──────────────────────────────────
  const [domainId,        setDomainId]        = useState('')
  const [subdomainId,     setSubdomainId]     = useState('')
  const [subdomains,      setSubdomains]      = useState<any[]>([])
  const [bizOwnerName,    setBizOwnerName]    = useState('')
  const [bizOwnerEmail,   setBizOwnerEmail]   = useState('')
  const [techOwnerName,   setTechOwnerName]   = useState('')
  const [techOwnerEmail,  setTechOwnerEmail]  = useState('')
  const [criticality,     setCriticality]     = useState('medium')

  // Step 1 gate: domain + subdomain + business owner name & email required
  const step1Complete = !!(domainId && subdomainId && bizOwnerName.trim() && bizOwnerEmail.trim())

  const domainName    = domains.find(d => d.domain_id    === domainId)?.domain_name    ?? ''
  const subdomainName = subdomains.find(s => s.subdomain_id === subdomainId)?.subdomain_name ?? ''

  // ── Browse mode state ────────────────────────────────────────────────────
  const [sfLocation,        setSfLocation]        = useState<SFLocation | null>(null)
  const [selectedTables,    setSelectedTables]    = useState<Set<string>>(new Set())
  const [tableSearch,       setTableSearch]       = useState('')
  const [existingTables,    setExistingTables]    = useState<Set<string>>(new Set())
  const [loadingDuplicates, setLoadingDuplicates] = useState(false)

  // ── Manual mode state ────────────────────────────────────────────────────
  const [manualDb,     setManualDb]     = useState('')
  const [manualSchema, setManualSchema] = useState('')
  const [manualTable,  setManualTable]  = useState('')
  const [manualType,   setManualType]   = useState('')
  const [manualDesc,   setManualDesc]   = useState('')

  // ── Progress / error ─────────────────────────────────────────────────────
  const [registering, setRegistering] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; errors: string[] } | null>(null)
  const [error, setError] = useState('')

  // Load subdomains when domain changes
  useEffect(() => {
    if (!domainId) { setSubdomains([]); setSubdomainId(''); return }
    subdomainsApi.list(domainId).then(r => setSubdomains(r.data.filter((s: any) => s.is_active)))
    setSubdomainId('')
  }, [domainId])

  // Duplicate detection: fetch existing assets for the selected subdomain+schema
  useEffect(() => {
    if (!sfLocation || !subdomainId) { setExistingTables(new Set()); return }
    setLoadingDuplicates(true)
    assetsApi.list({ subdomain_id: subdomainId })
      .then(r => {
        const items: any[] = r.data?.items ?? r.data
        const existing = new Set<string>(
          items
            .filter((a: any) =>
              a.sf_schema_name === sfLocation.schema &&
              (!sfLocation.database || a.sf_database_name === sfLocation.database)
            )
            .map((a: any) => a.sf_table_name as string)
        )
        setExistingTables(existing)
        // Auto-deselect any table that is now a duplicate
        setSelectedTables(prev => {
          const next = new Set(prev)
          existing.forEach(t => next.delete(t))
          return next
        })
      })
      .finally(() => setLoadingDuplicates(false))
  }, [sfLocation, subdomainId])

  // Duplicate detection for manual mode (re-checks when schema/subdomain changes)
  useEffect(() => {
    if (!manualSchema || !subdomainId) { setExistingTables(new Set()); return }
    assetsApi.list({ subdomain_id: subdomainId }).then(r => {
      const items: any[] = r.data?.items ?? r.data
      setExistingTables(new Set<string>(
        items
          .filter((a: any) =>
            a.sf_schema_name === manualSchema &&
            (!manualDb || a.sf_database_name === manualDb)
          )
          .map((a: any) => a.sf_table_name as string)
      ))
    })
  }, [manualSchema, manualDb, subdomainId])

  const handleSchemaLoad = (loc: SFLocation) => {
    setSfLocation(loc); setSelectedTables(new Set()); setTableSearch('')
  }

  const filteredTables   = sfLocation ? sfLocation.tables.filter(t => !tableSearch || t.table_name.toLowerCase().includes(tableSearch.toLowerCase())) : []
  const selectableTables = filteredTables.filter(t => !existingTables.has(t.table_name))
  const allSelectableSelected = selectableTables.length > 0 && selectableTables.every(t => selectedTables.has(t.table_name))
  const someSelected      = selectedTables.size > 0
  const dupCountInSchema  = sfLocation ? sfLocation.tables.filter(t => existingTables.has(t.table_name)).length : 0
  const manualIsDuplicate = !!(manualSchema && manualTable && existingTables.has(manualTable))

  const canBrowseRegister = step1Complete && !!sfLocation && selectedTables.size > 0 &&
    ![...selectedTables].some(t => existingTables.has(t))
  const canManualRegister = step1Complete && !!manualSchema && !!manualTable && !manualIsDuplicate

  const toggleTable = (name: string) => {
    if (existingTables.has(name)) return
    setSelectedTables(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  const toggleAll = () => {
    if (allSelectableSelected) {
      setSelectedTables(prev => { const n = new Set(prev); selectableTables.forEach(t => n.delete(t.table_name)); return n })
    } else {
      setSelectedTables(prev => { const n = new Set(prev); selectableTables.forEach(t => n.add(t.table_name)); return n })
    }
  }

  // ── Register (browse bulk) ────────────────────────────────────────────────
  const handleBrowseRegister = async () => {
    if (!sfLocation) return
    setRegistering(true); setError('')
    const tablesToReg = sfLocation.tables.filter(t => selectedTables.has(t.table_name) && !existingTables.has(t.table_name))
    setProgress({ done: 0, total: tablesToReg.length, errors: [] })
    const errors: string[] = []
    for (const t of tablesToReg) {
      try {
        await assetsApi.create({
          domain_id:             domainId,
          subdomain_id:          subdomainId,
          connection_id:         sfLocation.connection_id || undefined,
          sf_database_name:      sfLocation.database || undefined,
          sf_schema_name:        sfLocation.schema,
          sf_table_name:         t.table_name,
          table_type:            t.table_type || undefined,
          criticality,
          owner_name:            bizOwnerName || undefined,
          owner_email:           bizOwnerEmail || undefined,
          technical_owner_name:  techOwnerName || undefined,
          technical_owner_email: techOwnerEmail || undefined,
        })
      } catch (e: any) {
        errors.push(`${t.table_name}: ${e.response?.data?.detail || e.message}`)
      }
      setProgress(p => p ? { ...p, done: p.done + 1, errors } : null)
    }
    try {
      const enriched = await assetsApi.listEnriched()
      const newAssets = enriched.data.filter((a: EnrichedAsset) =>
        a.sf_schema_name === sfLocation.schema &&
        (!sfLocation.database || a.sf_database_name === sfLocation.database) &&
        selectedTables.has(a.sf_table_name)
      )
      onSuccess(newAssets)
    } catch { onCancel() }
  }

  // ── Register (manual single) ──────────────────────────────────────────────
  const handleManualRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!step1Complete) { setError('Complete Step 1 before registering.'); return }
    if (manualIsDuplicate) {
      setError(`"${manualTable}" is already registered in ${domainName} › ${subdomainName}. Remove it from the selection to proceed.`)
      return
    }
    setRegistering(true); setError('')
    try {
      await assetsApi.create({
        domain_id:             domainId,
        subdomain_id:          subdomainId,
        sf_database_name:      manualDb || undefined,
        sf_schema_name:        manualSchema,
        sf_table_name:         manualTable,
        table_type:            manualType || undefined,
        table_description:     manualDesc || undefined,
        criticality,
        owner_name:            bizOwnerName || undefined,
        owner_email:           bizOwnerEmail || undefined,
        technical_owner_name:  techOwnerName || undefined,
        technical_owner_email: techOwnerEmail || undefined,
      })
      const enriched = await assetsApi.listEnriched()
      const newest = enriched.data.find((a: EnrichedAsset) => a.sf_schema_name === manualSchema && a.sf_table_name === manualTable)
      onSuccess(newest ? [newest] : [])
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to register table')
      setRegistering(false)
    }
  }

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  // ── Progress overlay ──────────────────────────────────────────────────────
  if (progress) {
    const pct  = Math.round((progress.done / progress.total) * 100)
    const done = progress.done >= progress.total
    return (
      <div className="bg-white rounded-xl border border-gray-200 mb-6 p-8 text-center">
        <ListChecks size={36} className="mx-auto mb-3 text-blue-600" />
        <p className="text-lg font-semibold text-gray-900 mb-1">
          {done ? 'Registration complete' : `Registering tables… ${progress.done}/${progress.total}`}
        </p>
        <div className="w-full bg-gray-100 rounded-full h-2 mb-4 mt-3">
          <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        {progress.errors.length > 0 && (
          <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            <p className="text-xs font-semibold text-red-700 mb-1">Errors ({progress.errors.length})</p>
            {progress.errors.map((e, i) => <p key={i} className="text-xs text-red-600 font-mono">{e}</p>)}
          </div>
        )}
        {done && (
          <p className="text-sm text-gray-500">
            {progress.total - progress.errors.length} table{progress.total - progress.errors.length !== 1 ? 's' : ''} registered successfully.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-0">
        <h2 className="text-base font-semibold text-gray-900">Register Tables</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>

      {/* Mode tabs */}
      <div className="flex border-b border-gray-200 mt-4 px-6">
        {(['browse', 'manual'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={clsx('pb-3 px-4 text-sm font-medium border-b-2 transition-colors -mb-px',
              mode === m ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            {m === 'browse' ? '🔍 Browse Snowflake' : '✏️ Enter Manually'}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-5">
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {/* ── Step 1: Classification + Ownership (shared, required gate) ───── */}
        <fieldset className={clsx(
          'border rounded-lg p-4 transition-colors',
          step1Complete ? 'border-green-300 bg-green-50/30' : 'border-gray-200'
        )}>
          <legend className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
            Step 1 — Classification &amp; Ownership
            {step1Complete && <CheckCircle size={12} className="text-green-500" />}
          </legend>

          {/* Domain + Subdomain */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Domain *</label>
              <select className={inp} value={domainId} onChange={e => setDomainId(e.target.value)} required>
                <option value="">Select domain…</option>
                {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subdomain *</label>
              <select className={inp} value={subdomainId} onChange={e => setSubdomainId(e.target.value)}
                required disabled={!domainId}>
                <option value="">{domainId ? 'Select subdomain…' : 'Select domain first'}</option>
                {subdomains.map(s => <option key={s.subdomain_id} value={s.subdomain_id}>{s.subdomain_name}</option>)}
              </select>
            </div>
          </div>

          {/* Business Owner */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">
            Business Owner <span className="text-red-400">*</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input className={inp} value={bizOwnerName}
                onChange={e => setBizOwnerName(e.target.value)}
                placeholder="e.g. Billing Team" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input className={inp} type="email" value={bizOwnerEmail}
                onChange={e => setBizOwnerEmail(e.target.value)}
                placeholder="billing@company.com" required />
            </div>
          </div>

          {/* Technical Owner */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">Technical Owner</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input className={inp} value={techOwnerName}
                onChange={e => setTechOwnerName(e.target.value)}
                placeholder="e.g. Data Engineering" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input className={inp} type="email" value={techOwnerEmail}
                onChange={e => setTechOwnerEmail(e.target.value)}
                placeholder="data-eng@company.com" />
            </div>
          </div>

          {!step1Complete && (
            <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle size={11} />
              Fill Domain, Subdomain, and Business Owner name + email to unlock Step 2
            </p>
          )}
        </fieldset>

        {/* Gate: Step 2+ hidden until Step 1 is complete */}
        {!step1Complete && (
          <div className="flex items-center justify-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-gray-400">Complete Step 1 to continue</p>
          </div>
        )}

        {/* ── Browse mode (Step 2 onward) ───────────────────────────────────── */}
        {step1Complete && mode === 'browse' && (
          <>
            {/* Step 2: Snowflake location */}
            <fieldset className="border border-gray-200 rounded-lg p-4">
              <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                Step 2 — Snowflake Location
              </legend>
              <div className="mt-2">
                <SchemaBrowser onLoad={handleSchemaLoad} />
              </div>
            </fieldset>

            {/* Step 3: Table checklist with duplicate detection */}
            {sfLocation && (
              <fieldset className="border border-gray-200 rounded-lg p-4">
                <legend className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  Step 3 — Select Tables
                  {loadingDuplicates && <Loader2 size={10} className="animate-spin text-blue-500" />}
                </legend>

                {/* Duplicate banner */}
                {dupCountInSchema > 0 && (
                  <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">
                        {dupCountInSchema} table{dupCountInSchema > 1 ? 's are' : ' is'} already registered
                        in <span className="font-bold">{domainName} › {subdomainName}</span>
                      </p>
                      <p className="text-xs mt-1 text-amber-700">
                        These are shown with an "Already registered" badge and cannot be selected.
                        Deselect them or choose a different Domain / Subdomain to proceed.
                      </p>
                    </div>
                  </div>
                )}

                {/* Toolbar */}
                <div className="flex items-center gap-3 mt-3 mb-3">
                  <button type="button" onClick={toggleAll}
                    disabled={selectableTables.length === 0}
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40">
                    {allSelectableSelected
                      ? <><CheckSquare size={13} /> Deselect all</>
                      : <><Square size={13} /> Select all</>}
                    {selectableTables.length > 0 && ` (${selectableTables.length} available)`}
                  </button>
                  {someSelected && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {selectedTables.size} selected
                    </span>
                  )}
                  <div className="relative ml-auto">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Filter tables…" value={tableSearch}
                      onChange={e => setTableSearch(e.target.value)}
                      className="pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
                  </div>
                </div>

                {/* Checklist */}
                <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {filteredTables.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">
                      {tableSearch ? 'No tables match your filter' : 'No tables found in this schema'}
                    </p>
                  ) : filteredTables.map(t => {
                    const isDup     = existingTables.has(t.table_name)
                    const isChecked = selectedTables.has(t.table_name)
                    return (
                      <label key={t.table_name}
                        className={clsx(
                          'flex items-center gap-3 px-3 py-2.5 transition-colors',
                          isDup     ? 'bg-amber-50/60 cursor-not-allowed'
                          : isChecked ? 'bg-blue-50 cursor-pointer'
                          :             'hover:bg-gray-50 cursor-pointer'
                        )}>
                        <input type="checkbox"
                          checked={isChecked}
                          disabled={isDup}
                          onChange={() => toggleTable(t.table_name)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0 disabled:cursor-not-allowed" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={clsx(
                              'text-sm font-medium truncate',
                              isDup     ? 'text-amber-700 line-through decoration-amber-400'
                              : isChecked ? 'text-blue-800'
                              :             'text-gray-800'
                            )}>
                              {t.table_name}
                            </p>
                            {isDup && (
                              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded-full">
                                <AlertCircle size={9} /> Already registered in {domainName} › {subdomainName}
                              </span>
                            )}
                          </div>
                          {(t.table_type && t.table_type !== 'BASE TABLE' || t.row_count != null) && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {t.table_type && t.table_type !== 'BASE TABLE' && (
                                <span className="bg-purple-100 text-purple-600 px-1.5 rounded mr-2">{t.table_type}</span>
                              )}
                              {t.row_count != null && `${Number(t.row_count).toLocaleString()} rows`}
                            </p>
                          )}
                        </div>
                        {isChecked && !isDup && <CheckCircle size={14} className="text-blue-500 shrink-0" />}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}

            {/* Step 4: Criticality */}
            {someSelected && (
              <fieldset className="border border-gray-200 rounded-lg p-4">
                <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                  Step 4 — Common Settings (applied to all selected tables)
                </legend>
                <div className="mt-2 w-48">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Criticality</label>
                  <select className={inp} value={criticality} onChange={e => setCriticality(e.target.value)}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </fieldset>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={handleBrowseRegister}
                disabled={!canBrowseRegister || registering}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {registering ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {registering ? 'Registering…'
                  : `Register ${selectedTables.size || ''} Table${selectedTables.size !== 1 ? 's' : ''}`}
              </button>
              <button type="button" onClick={onCancel}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ── Manual mode ──────────────────────────────────────────────────── */}
        {step1Complete && mode === 'manual' && (
          <form onSubmit={handleManualRegister} className="space-y-5">
            {/* Step 2: Snowflake location */}
            <fieldset className="border border-gray-200 rounded-lg p-4">
              <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
                Step 2 — Snowflake Location
              </legend>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Database</label>
                  <input className={inp} value={manualDb} onChange={e => setManualDb(e.target.value)} placeholder="MY_DATABASE" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Schema *</label>
                  <input className={inp} value={manualSchema} onChange={e => setManualSchema(e.target.value)} placeholder="MY_SCHEMA" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Table / View *</label>
                  <input
                    className={clsx(inp, manualIsDuplicate && 'border-amber-400 bg-amber-50 focus:ring-amber-400')}
                    value={manualTable}
                    onChange={e => setManualTable(e.target.value)}
                    placeholder="MY_TABLE" required />
                </div>
              </div>

              {/* Manual duplicate warning */}
              {manualIsDuplicate && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">
                      "{manualTable}" is already registered in{' '}
                      <span className="font-bold">{domainName} › {subdomainName}</span>
                    </p>
                    <p className="text-xs mt-0.5 text-amber-700">
                      Clear the table name, choose a different Domain / Subdomain, or use a different table to proceed.
                    </p>
                  </div>
                </div>
              )}

              {manualSchema && manualTable && !manualIsDuplicate && (
                <p className="text-xs text-blue-600 mt-2 font-mono">
                  {[manualDb, manualSchema, manualTable].filter(Boolean).join('.')}
                </p>
              )}
            </fieldset>

            {/* Step 3: Settings */}
            <fieldset className="border border-gray-200 rounded-lg p-4">
              <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Step 3 — Settings</legend>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Criticality</label>
                  <select className={inp} value={criticality} onChange={e => setCriticality(e.target.value)}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Table Type</label>
                  <select className={inp} value={manualType} onChange={e => setManualType(e.target.value)}>
                    <option value="">Auto-detected</option>
                    <option value="BASE TABLE">Table</option>
                    <option value="VIEW">View</option>
                    <option value="MATERIALIZED VIEW">Materialized View</option>
                    <option value="EXTERNAL TABLE">External Table</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <input className={inp} value={manualDesc} onChange={e => setManualDesc(e.target.value)} placeholder="What data does this table contain?" />
                </div>
              </div>
            </fieldset>

            <div className="flex gap-3">
              <button type="submit" disabled={!canManualRegister || registering}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {registering ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {registering ? 'Registering…' : 'Register Table'}
              </button>
              <button type="button" onClick={onCancel}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const returnTo     = searchParams.get('returnTo')
  const autoRegister = searchParams.get('register') === '1'

  const [assets, setAssets]           = useState<EnrichedAsset[]>([])
  const [domains, setDomains]         = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(autoRegister)
  const [editingAsset, setEditingAsset] = useState<EnrichedAsset | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [domainFilter, setDomainFilter] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([assetsApi.listEnriched(), domainsApi.list()])
      .then(([a, d]) => { setAssets(a.data?.items ?? a.data); setDomains(d.data?.items ?? d.data) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleAssetSaved = (updated: EnrichedAsset) => {
    setAssets(prev => prev.map(a => a.asset_id === updated.asset_id ? { ...a, ...updated } : a))
    setEditingAsset(null)
  }

  const handleDelete = async (assetId: string, tableName: string) => {
    if (!confirm(`Deactivate "${tableName}"? Rules will stop executing but history is preserved.`)) return
    setDeleting(assetId)
    try {
      await assetsApi.delete(assetId)
      setAssets(prev => prev.filter(a => a.asset_id !== assetId))
    } finally {
      setDeleting(null)
    }
  }

  const filtered = assets.filter(a => {
    const matchSearch = !search ||
      a.sf_table_name.toLowerCase().includes(search.toLowerCase()) ||
      (a.sf_schema_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (a.sf_database_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      a.domain_name.toLowerCase().includes(search.toLowerCase())
    const matchDomain = !domainFilter || a.domain_id === domainFilter
    return matchSearch && matchDomain
  })

  return (
    <div className="p-8">
      {/* Back breadcrumb when navigated from another page */}
      {returnTo && (
        <button
          onClick={() => router.push(returnTo)}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft size={14} /> {returnTo === '/executive' ? 'Back to Cost Impact Dashboard' : 'Back'}
        </button>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Assets</h1>
          <p className="text-gray-500 text-sm mt-1">{filtered.length} of {assets.length} tables registered</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus size={14} /> Register Table
          </button>
        )}
      </div>

      {/* Registration form */}
      {showForm && (
        <RegisterForm
          domains={domains}
          onSuccess={newAssets => {
            setAssets(prev => {
              const newIds = new Set(newAssets.map((a: EnrichedAsset) => a.asset_id))
              return [...prev.filter(a => !newIds.has(a.asset_id)), ...newAssets]
            })
            setShowForm(false)
            // If we came from another page, go back there after registration
            if (returnTo) router.push(returnTo)
          }}
          onCancel={() => {
            setShowForm(false)
            // If user cancels and came from another page, go back there
            if (autoRegister && returnTo) router.push(returnTo)
          }}
        />
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search tables, schemas…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Domains</option>
          {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
        </select>
      </div>

      {/* Asset table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[26%]">Table</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[12%]">Connection</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[14%]">Domain</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[14%]">Owner</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[8%]">Criticality</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[10%]">Certification</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 w-[16%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(asset => (
                <tr key={asset.asset_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <Database size={14} className="text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-900">{asset.sf_table_name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          {[asset.sf_database_name, asset.sf_schema_name].filter(Boolean).join('.')}
                        </p>
                        {asset.table_description && (
                          <p className="text-xs text-gray-500 mt-0.5 italic">{asset.table_description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {asset.connection_name ? (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {asset.connection_name}
                      </span>
                    ) : (
                      <span className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">No connection</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-700">{asset.domain_name}</p>
                    <p className="text-xs text-gray-400">{asset.subdomain_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-700">{asset.owner_name || '—'}</p>
                    {asset.owner_email && <p className="text-xs text-gray-400">{asset.owner_email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={CRIT_CLS[asset.criticality] || 'badge-low'}>{asset.criticality}</span>
                  </td>
                  <td className="px-4 py-3">
                    <CertificationBadge status={asset.certification_status || 'uncertified'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Link href={`/dashboard/tables/${asset.asset_id}`}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 bg-blue-50 rounded hover:bg-blue-100">
                        Dashboard <ChevronRight size={10} />
                      </Link>
                      <button onClick={() => setEditingAsset(asset)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-50 rounded hover:bg-gray-100"
                        title="Edit dataset">
                        <Pencil size={10} /> Edit
                      </button>
                      <button onClick={() => handleDelete(asset.asset_id, asset.sf_table_name)}
                        disabled={deleting === asset.asset_id}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 bg-red-50 rounded hover:bg-red-100 disabled:opacity-40"
                        title="Deactivate dataset">
                        {deleting === asset.asset_id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Database size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No tables registered</p>
            <p className="text-sm mt-1">
              {assets.length > 0 ? 'Try adjusting your filters' : 'Click "Register Table" to add a Snowflake table'}
            </p>
          </div>
        )}
      </div>

      {/* Edit drawer */}
      {editingAsset && (
        <EditAssetDrawer
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSaved={handleAssetSaved}
        />
      )}
    </div>
  )
}
