'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { assetsApi, connectionsApi } from '@/services/apiClient'
import Link from 'next/link'
import {
  ScanSearch, ChevronRight, ChevronDown, Loader2, CheckCircle,
  AlertCircle, SkipForward, Database, Layers, ArrowLeft, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscoverySelection {
  database: string
  schema: string
}

interface DiscoveryTableResult {
  database: string
  schema: string
  table_name: string
  status: 'imported' | 'skipped' | 'error'
  reason?: string
  asset_id?: string
  domain_name?: string
  subdomain_name?: string
}

interface DiscoveryJob {
  job_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  total: number
  completed: number
  failed: number
  results: DiscoveryTableResult[]
  started_at?: string
  finished_at?: string
  error?: string
  meta?: { connection_id?: string; triggered_by?: string }
}

interface Connection {
  connection_id: string
  connection_name: string
  account: string
  is_active: boolean
}

interface DatabaseEntry {
  name: string
  schemas: string[]
  schemasLoaded: boolean
  schemasLoading: boolean
  expanded: boolean
}

type Phase = 'select' | 'progress' | 'summary'
type ResultFilter = 'all' | 'imported' | 'skipped' | 'error'

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DiscoveryTableResult['status'] }) {
  if (status === 'imported') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
        <CheckCircle className="w-3 h-3" /> Imported
      </span>
    )
  }
  if (status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        <SkipForward className="w-3 h-3" /> Skipped
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
      <AlertCircle className="w-3 h-3" /> Error
    </span>
  )
}

// ── Phase 1: Connection + Schema selector ─────────────────────────────────────

function ConnectionSchemaSelector({
  onStart,
}: {
  onStart: (connectionId: string, selections: DiscoverySelection[], opts: { criticality: string; ownerName: string; ownerEmail: string }) => void
}) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [selectedConn, setSelectedConn] = useState('')
  const [databases, setDatabases] = useState<DatabaseEntry[]>([])
  const [dbsLoading, setDbsLoading] = useState(false)
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(new Set())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [criticality, setCriticality] = useState('medium')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    connectionsApi.list().then(r => {
      setConnections((r.data as Connection[]).filter(c => c.is_active))
    }).catch(() => {})
  }, [])

  const loadDatabases = async (connId: string) => {
    setDatabases([])
    setSelectedSchemas(new Set())
    setDbsLoading(true)
    try {
      const r = await connectionsApi.databases(connId)
      setDatabases(
        (r.data.databases as { name: string }[]).map(d => ({
          name: d.name,
          schemas: [],
          schemasLoaded: false,
          schemasLoading: false,
          expanded: false,
        }))
      )
    } catch {
      setError('Failed to load databases.')
    } finally {
      setDbsLoading(false)
    }
  }

  const toggleDatabase = async (dbName: string) => {
    setDatabases(prev =>
      prev.map(d => {
        if (d.name !== dbName) return d
        const nowExpanded = !d.expanded
        if (nowExpanded && !d.schemasLoaded) {
          loadSchemas(dbName)
        }
        return { ...d, expanded: nowExpanded }
      })
    )
  }

  const loadSchemas = async (dbName: string) => {
    setDatabases(prev =>
      prev.map(d => d.name === dbName ? { ...d, schemasLoading: true } : d)
    )
    try {
      const r = await connectionsApi.schemas(selectedConn, dbName)
      const schemaNames = (r.data.schemas as { name: string }[]).map(s => s.name)
      setDatabases(prev =>
        prev.map(d =>
          d.name === dbName
            ? { ...d, schemas: schemaNames, schemasLoaded: true, schemasLoading: false }
            : d
        )
      )
    } catch {
      setDatabases(prev =>
        prev.map(d => d.name === dbName ? { ...d, schemasLoading: false } : d)
      )
    }
  }

  const schemaKey = (db: string, schema: string) => `${db}::${schema}`

  const toggleSchema = (db: string, schema: string) => {
    const key = schemaKey(db, schema)
    setSelectedSchemas(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selections: DiscoverySelection[] = Array.from(selectedSchemas).map(key => {
    const [database, schema] = key.split('::')
    return { database, schema }
  })

  const handleStart = async () => {
    if (!selectedConn || selections.length === 0) return
    setStarting(true)
    setError('')
    try {
      onStart(selectedConn, selections, { criticality, ownerName, ownerEmail })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start discovery')
      setStarting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-200">
        Select a Snowflake connection, then choose one or more schemas to scan. Tables will be automatically
        classified by domain and subdomain using AI.
      </div>

      {/* Connection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Snowflake Connection
        </label>
        <select
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
          value={selectedConn}
          onChange={e => {
            setSelectedConn(e.target.value)
            if (e.target.value) loadDatabases(e.target.value)
          }}
        >
          <option value="">— Select connection —</option>
          {connections.map(c => (
            <option key={c.connection_id} value={c.connection_id}>
              {c.connection_name} ({c.account})
            </option>
          ))}
        </select>
      </div>

      {/* Databases + Schemas */}
      {selectedConn && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Databases & Schemas
          </label>

          {dbsLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading databases…
            </div>
          ) : databases.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No databases found.</p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
              {databases.map(db => {
                const dbSchemaKeys = db.schemas.map(s => schemaKey(db.name, s))
                const allSelected = db.schemas.length > 0 && dbSchemaKeys.every(k => selectedSchemas.has(k))
                const someSelected = dbSchemaKeys.some(k => selectedSchemas.has(k))

                return (
                  <div key={db.name}>
                    {/* Database row */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => toggleDatabase(db.name)}
                    >
                      {db.expanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                      <Database className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">{db.name}</span>
                      {someSelected && (
                        <span className="text-xs text-blue-600 dark:text-blue-400">
                          {dbSchemaKeys.filter(k => selectedSchemas.has(k)).length} selected
                        </span>
                      )}
                    </div>

                    {/* Schemas */}
                    {db.expanded && (
                      <div className="pl-8 py-1 space-y-0.5 bg-white dark:bg-gray-900">
                        {db.schemasLoading ? (
                          <div className="flex items-center gap-2 text-xs text-gray-400 py-2 px-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Loading schemas…
                          </div>
                        ) : db.schemas.length === 0 ? (
                          <p className="text-xs text-gray-400 py-2 px-2">No schemas found.</p>
                        ) : (
                          <>
                            {/* Select all for this DB */}
                            <label className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-gray-500">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() => {
                                  setSelectedSchemas(prev => {
                                    const next = new Set(prev)
                                    if (allSelected) {
                                      dbSchemaKeys.forEach(k => next.delete(k))
                                    } else {
                                      dbSchemaKeys.forEach(k => next.add(k))
                                    }
                                    return next
                                  })
                                }}
                                className="rounded"
                              />
                              Select all schemas in {db.name}
                            </label>
                            <div className="h-px bg-gray-100 dark:bg-gray-700 mx-2 my-0.5" />
                            {db.schemas.map(schema => {
                              const key = schemaKey(db.name, schema)
                              return (
                                <label
                                  key={schema}
                                  className={clsx(
                                    'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm',
                                    selectedSchemas.has(key)
                                      ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                                      : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedSchemas.has(key)}
                                    onChange={() => toggleSchema(db.name, schema)}
                                    className="rounded"
                                  />
                                  <Layers className="w-3.5 h-3.5 text-gray-400" />
                                  {schema}
                                </label>
                              )
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Advanced options */}
      {selectedConn && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            onClick={() => setShowAdvanced(v => !v)}
          >
            {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Advanced options (criticality, ownership)
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Criticality</label>
                <select
                  className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                  value={criticality}
                  onChange={e => setCriticality(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Owner Name</label>
                  <input
                    className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Jane Smith"
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Owner Email</label>
                  <input
                    type="email"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                    placeholder="jane@company.com"
                    value={ownerEmail}
                    onChange={e => setOwnerEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        onClick={handleStart}
        disabled={!selectedConn || selections.length === 0 || starting}
        className={clsx(
          'w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors',
          !selectedConn || selections.length === 0
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        )}
      >
        {starting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
        ) : (
          <><ScanSearch className="w-4 h-4" /> Discover & Import ({selections.length} schema{selections.length !== 1 ? 's' : ''} selected)</>
        )}
      </button>
    </div>
  )
}

// ── Phase 2: Progress polling ─────────────────────────────────────────────────

function DiscoveryProgress({
  jobId,
  onComplete,
}: {
  jobId: string
  onComplete: (job: DiscoveryJob) => void
}) {
  const [job, setJob] = useState<DiscoveryJob | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    try {
      const r = await assetsApi.getDiscoveryJob(jobId)
      const data = r.data as DiscoveryJob
      setJob(data)
      if (data.status === 'completed' || data.status === 'failed') {
        if (intervalRef.current) clearInterval(intervalRef.current)
        onComplete(data)
      }
    } catch {
      // network hiccup — keep polling
    }
  }, [jobId, onComplete])

  useEffect(() => {
    poll()
    intervalRef.current = setInterval(poll, 2000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [poll])

  const total = job?.results.length ?? 0
  const imported = job?.results.filter(r => r.status === 'imported').length ?? 0
  const skipped = job?.results.filter(r => r.status === 'skipped').length ?? 0
  const errors = job?.results.filter(r => r.status === 'error').length ?? 0
  const recent = [...(job?.results ?? [])].reverse().slice(0, 20)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="font-medium">Discovering tables…</span>
        </div>
        <p className="text-sm text-gray-500">{total} tables processed so far</p>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="text-2xl font-bold text-green-700 dark:text-green-300">{imported}</div>
          <div className="text-xs text-green-600 dark:text-green-400">Imported</div>
        </div>
        <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{skipped}</div>
          <div className="text-xs text-amber-600 dark:text-amber-400">Already existed</div>
        </div>
        <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="text-2xl font-bold text-red-700 dark:text-red-300">{errors}</div>
          <div className="text-xs text-red-600 dark:text-red-400">Errors</div>
        </div>
      </div>

      {/* Rolling live log */}
      {recent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Live feed</p>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {recent.map((r, i) => (
                  <tr key={i} className="px-3 py-1.5">
                    <td className="px-3 py-1.5 text-gray-500 font-mono">{r.database}.{r.schema}.{r.table_name}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-1.5 text-gray-400 truncate max-w-xs">
                      {r.domain_name && r.subdomain_name
                        ? `${r.domain_name} › ${r.subdomain_name}`
                        : r.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Phase 3: Summary ──────────────────────────────────────────────────────────

function DiscoverySummary({
  job,
  onRunAgain,
}: {
  job: DiscoveryJob
  onRunAgain: () => void
}) {
  const [filter, setFilter] = useState<ResultFilter>('all')

  const imported = job.results.filter(r => r.status === 'imported')
  const skipped = job.results.filter(r => r.status === 'skipped')
  const errors = job.results.filter(r => r.status === 'error')

  const filtered = filter === 'all' ? job.results
    : filter === 'imported' ? imported
    : filter === 'skipped' ? skipped
    : errors

  const tabs: { key: ResultFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: job.results.length },
    { key: 'imported', label: 'Imported', count: imported.length },
    { key: 'skipped', label: 'Skipped', count: skipped.length },
    { key: 'error', label: 'Errors', count: errors.length },
  ]

  return (
    <div className="space-y-6">
      {/* Header banner */}
      {job.status === 'failed' ? (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Discovery failed</p>
          {job.error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{job.error}</p>}
        </div>
      ) : (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">Discovery complete</p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
            {imported.length} tables imported, {skipped.length} already existed, {errors.length} errors
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{job.results.length}</div>
          <div className="text-xs text-gray-500">Discovered</div>
        </div>
        <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="text-2xl font-bold text-green-700 dark:text-green-300">{imported.length}</div>
          <div className="text-xs text-green-600 dark:text-green-400">Imported</div>
        </div>
        <div className="text-center p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{skipped.length}</div>
          <div className="text-xs text-amber-600 dark:text-amber-400">Already existed</div>
        </div>
        <div className="text-center p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="text-2xl font-bold text-red-700 dark:text-red-300">{errors.length}</div>
          <div className="text-xs text-red-600 dark:text-red-400">Errors</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 -mb-px">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                filter === tab.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-gray-400">({tab.count})</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Results table */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Table</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Database.Schema</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Domain</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Subdomain</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-sm">No results.</td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">{r.table_name}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.database}.{r.schema}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">{r.domain_name || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">{r.subdomain_name || '—'}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                      {r.status === 'error' && r.reason && (
                        <p className="text-xs text-red-500 mt-0.5 max-w-xs truncate" title={r.reason}>{r.reason}</p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onRunAgain}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Discover More
        </button>
        <Link
          href="/assets"
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          View in Assets <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AutoDiscoveryPage() {
  const [phase, setPhase] = useState<Phase>('select')
  const [jobId, setJobId] = useState<string | null>(null)
  const [completedJob, setCompletedJob] = useState<DiscoveryJob | null>(null)
  const [startError, setStartError] = useState('')

  const handleStart = async (
    connectionId: string,
    selections: DiscoverySelection[],
    opts: { criticality: string; ownerName: string; ownerEmail: string }
  ) => {
    try {
      const res = await assetsApi.discover({
        connection_id: connectionId,
        selections,
        criticality: opts.criticality,
        owner_name: opts.ownerName || undefined,
        owner_email: opts.ownerEmail || undefined,
      })
      setJobId(res.data.job_id)
      setPhase('progress')
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : 'Failed to start discovery')
      throw e
    }
  }

  const handleComplete = useCallback((job: DiscoveryJob) => {
    setCompletedJob(job)
    setPhase('summary')
  }, [])

  const handleRunAgain = () => {
    setPhase('select')
    setJobId(null)
    setCompletedJob(null)
    setStartError('')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
          <Link href="/assets" className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200">
            <ArrowLeft className="w-3.5 h-3.5" /> Data Assets
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span>Auto Discovery</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <ScanSearch className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Auto Discovery</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Scan Snowflake schemas and automatically classify tables by domain using AI
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 mt-6">
          {(['select', 'progress', 'summary'] as Phase[]).map((p, i) => {
            const labels = { select: 'Select Schemas', progress: 'Discovering', summary: 'Summary' }
            const idx = ['select', 'progress', 'summary'].indexOf(phase)
            const current = p === phase
            const done = i < idx
            return (
              <div key={p} className="flex items-center gap-2">
                {i > 0 && <div className={clsx('h-px w-8', done || current ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700')} />}
                <div className="flex items-center gap-1.5">
                  <div className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                    current ? 'bg-blue-600 text-white' :
                    done ? 'bg-green-500 text-white' :
                    'bg-gray-200 dark:bg-gray-700 text-gray-500'
                  )}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={clsx(
                    'text-sm',
                    current ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-400'
                  )}>{labels[p]}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {phase === 'select' && (
        <ConnectionSchemaSelector onStart={handleStart} />
      )}
      {phase === 'progress' && jobId && (
        <DiscoveryProgress jobId={jobId} onComplete={handleComplete} />
      )}
      {phase === 'summary' && completedJob && (
        <DiscoverySummary job={completedJob} onRunAgain={handleRunAgain} />
      )}

      {startError && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400 text-center">{startError}</p>
      )}
    </div>
  )
}
