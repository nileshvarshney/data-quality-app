'use client'
import { useEffect, useState, Fragment } from 'react'
import {
  Plus, Pencil, Trash2, X, Check, Loader2,
  User, Shield, Eye, ClipboardList, RefreshCw, KeyRound,
  Search, ChevronLeft, ChevronRight, RotateCcw, Lock,
} from 'lucide-react'
import clsx from 'clsx'
import { usersApi, domainsApi } from '@/services/apiClient'
import { useTimezone } from '@/contexts/TimezoneContext'

// ── Types ─────────────────────────────────────────────────────────

interface UserRecord {
  user_id: string; email: string; full_name: string
  role: string; domain_id: string | null; is_active: boolean
  last_login?: string | null; created_at: string
}

// ── Config ────────────────────────────────────────────────────────

const ROLES = [
  { value: 'admin',        label: 'Admin',        icon: Shield,       cls: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'domain_owner', label: 'Domain Owner', icon: Shield,       cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'data_owner',   label: 'Data Owner',   icon: User,         cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'viewer',       label: 'Viewer',       icon: Eye,          cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'auditor',      label: 'Auditor',      icon: ClipboardList,cls: 'bg-teal-100 text-teal-800 border-teal-200' },
]

const PAGE_SIZE = 20

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLES.find(r => r.value === role)
  if (!cfg) return <span className="text-xs text-gray-400">{role}</span>
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border', cfg.cls)}>
      <Icon size={10} />{cfg.label}
    </span>
  )
}

// ── Create / Edit modal ───────────────────────────────────────────

interface FormState {
  email: string; full_name: string; role: string
  domain_id: string; password: string; confirm_password: string
}
const EMPTY_FORM: FormState = { email: '', full_name: '', role: 'viewer', domain_id: '', password: '', confirm_password: '' }

function UserModal({ user, domains, onClose, onSaved }: {
  user: UserRecord | null; domains: any[]; onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!user
  const [form, setForm] = useState<FormState>(
    user ? { email: user.email, full_name: user.full_name, role: user.role, domain_id: user.domain_id ?? '', password: '', confirm_password: '' }
          : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }))

  const handleSubmit = async () => {
    setError('')
    if (!form.email.trim() || !form.full_name.trim()) { setError('Email and full name are required.'); return }
    if (!isEdit && !form.password) { setError('Password is required for new users.'); return }
    if (form.password && form.password !== form.confirm_password) { setError('Passwords do not match.'); return }
    setSaving(true)
    try {
      const payload: any = { email: form.email.trim(), full_name: form.full_name.trim(), role: form.role, domain_id: form.domain_id || null }
      if (form.password) payload.password = form.password
      if (isEdit) await usersApi.update(user!.user_id, payload)
      else await usersApi.create(payload)
      onSaved()
    } catch (e: any) { setError(e.response?.data?.detail ?? 'Failed to save user') }
    finally { setSaving(false) }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Edit User' : 'Create User'}</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X size={15} className="text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => patch({ email: e.target.value })} className={inp} placeholder="user@company.com" disabled={isEdit} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
              <input value={form.full_name} onChange={e => patch({ full_name: e.target.value })} className={inp} placeholder="Jane Smith" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role *</label>
              <select value={form.role} onChange={e => patch({ role: e.target.value })} className={inp}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Domain Scope</label>
              <select value={form.domain_id} onChange={e => patch({ domain_id: e.target.value })} className={inp}>
                <option value="">All domains</option>
                {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isEdit ? 'New Password' : 'Password *'}</label>
              <input type="password" value={form.password} onChange={e => patch({ password: e.target.value })} className={inp} placeholder={isEdit ? 'Leave blank to keep current' : '••••••••'} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirm Password</label>
              <input type="password" value={form.confirm_password} onChange={e => patch({ confirm_password: e.target.value })} className={inp} placeholder="••••••••" />
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg text-[11px] text-gray-500 border border-gray-100">
            <strong>Domain scope:</strong> restricts domain_owner and data_owner to a specific domain. Leave blank for platform-wide access.
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-white">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reset Password modal ──────────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const [pw, setPw]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)

  const handleReset = async () => {
    setError('')
    if (!pw) { setError('New password is required.'); return }
    if (pw !== confirm) { setError('Passwords do not match.'); return }
    if (pw.length < 8) { setError('Password must be at least 8 characters.'); return }
    setSaving(true)
    try {
      await usersApi.changePassword(user.user_id, { new_password: pw })
      setSuccess(true)
    } catch (e: any) { setError(e.response?.data?.detail ?? 'Failed to reset password') }
    finally { setSaving(false) }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Reset Password</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X size={15} /></button>
        </div>
        <div className="p-6 space-y-3">
          {success ? (
            <div className="text-center py-4">
              <Check size={32} className="mx-auto mb-2 text-green-500" />
              <p className="text-sm font-semibold text-gray-800">Password reset for {user.email}</p>
              <button onClick={onClose} className="mt-3 px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Close</button>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500">Setting new password for <strong>{user.email}</strong></p>
              {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
                <input type="password" value={pw} onChange={e => setPw(e.target.value)} className={inp} placeholder="Min 8 characters" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirm Password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inp} placeholder="••••••••" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleReset} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                  {saving ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function UsersAdminPage() {
  const { formatTs } = useTimezone()
  const [users,   setUsers]   = useState<UserRecord[]>([])
  const [domains, setDomains] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalUser, setModalUser]       = useState<UserRecord | null | 'new'>(null)
  const [resetUser, setResetUser]       = useState<UserRecord | null>(null)
  const [deactivating, setDeactivating] = useState<string | null>(null)
  // Search + filter
  const [q, setQ]               = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  // Pagination
  const [page, setPage] = useState(0)
  // Bulk selection
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [bulkRole, setBulkRole]   = useState('viewer')
  const [bulkBusy, setBulkBusy]  = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [u, d] = await Promise.all([usersApi.list(), domainsApi.list()])
      setUsers(u.data?.items ?? u.data)
      setDomains(d.data?.items ?? d.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDeactivate = async (userId: string) => {
    if (!confirm('Deactivate this user? They will not be able to log in.')) return
    setDeactivating(userId)
    try { await usersApi.deactivate(userId); await load() }
    catch (e: any) { alert(e.response?.data?.detail ?? 'Failed to deactivate user') }
    finally { setDeactivating(null) }
  }

  const handleReactivate = async (userId: string) => {
    try { await usersApi.update(userId, { is_active: true }); await load() }
    catch (e: any) { alert(e.response?.data?.detail ?? 'Failed to reactivate user') }
  }

  const handleBulkRole = async () => {
    if (!selected.size) return
    setBulkBusy(true)
    try {
      await Promise.all([...selected].map(id => usersApi.update(id, { role: bulkRole })))
      setSelected(new Set())
      await load()
    } catch (e: any) { alert(e.response?.data?.detail ?? 'Bulk update failed') }
    finally { setBulkBusy(false) }
  }

  const handleBulkDeactivate = async () => {
    if (!selected.size || !confirm(`Deactivate ${selected.size} users?`)) return
    setBulkBusy(true)
    try {
      await Promise.all([...selected].map(id => usersApi.deactivate(id)))
      setSelected(new Set())
      await load()
    } catch (e: any) { alert(e.response?.data?.detail ?? 'Bulk deactivate failed') }
    finally { setBulkBusy(false) }
  }

  const fmtDate = (iso: string) => formatTs(iso, { dateOnly: true })

  // Filter
  const filtered = users
    .filter(u => showInactive || u.is_active)
    .filter(u => roleFilter === 'all' || u.role === roleFilter)
    .filter(u => !q || u.email.toLowerCase().includes(q.toLowerCase()) || (u.full_name ?? '').toLowerCase().includes(q.toLowerCase()))

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const toggleSelect = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAll = () => setSelected(new Set(paged.map(u => u.user_id)))
  const clearSel  = () => setSelected(new Set())

  return (
    <div className="p-6 space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage platform access and role assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600">
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={() => setModalUser('new')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus size={13} /> Add User
          </button>
        </div>
      </div>

      {/* Role legend */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-100">
        {ROLES.map(r => {
          const Icon = r.icon
          const count = users.filter(u => u.role === r.value && u.is_active).length
          return (
            <div key={r.value} className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium', r.cls)}>
              <Icon size={10} />{r.label} <span className="opacity-70">({count})</span>
            </div>
          )
        })}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => { setQ(e.target.value); setPage(0) }}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0) }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="all">All roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button onClick={() => setShowInactive(s => !s)}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors',
            showInactive ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
          {showInactive ? 'Hide inactive' : 'Show inactive'}
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
          <span className="font-medium text-blue-700">{selected.size} selected</span>
          <div className="flex items-center gap-1.5">
            <span className="text-blue-600 text-xs">Change role to:</span>
            <select value={bulkRole} onChange={e => setBulkRole(e.target.value)}
              className="px-2 py-1 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button onClick={handleBulkRole} disabled={bulkBusy}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {bulkBusy ? <Loader2 size={11} className="animate-spin inline" /> : 'Apply'}
            </button>
          </div>
          <button onClick={handleBulkDeactivate} disabled={bulkBusy}
            className="ml-1 px-3 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50">
            Deactivate selected
          </button>
          <button onClick={clearSel} className="ml-auto text-xs text-blue-500 hover:text-blue-700">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {Array(5).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(7).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 animate-pulse rounded" style={{ width: j === 0 ? '60%' : j === 6 ? '40%' : '70%' }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <User size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm text-gray-500">{q || roleFilter !== 'all' ? 'No users match your filters' : 'No users found'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={paged.length > 0 && paged.every(u => selected.has(u.user_id))}
                    onChange={e => e.target.checked ? selectAll() : clearSel()}
                    className="rounded border-gray-300" />
                </th>
                {['User', 'Role', 'Domain Scope', 'Status', 'Last Login', 'Created', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paged.map(user => {
                const domain = domains.find(d => d.domain_id === user.domain_id)
                const isSel = selected.has(user.user_id)
                return (
                  <tr key={user.user_id} className={clsx('hover:bg-gray-50 transition-colors', !user.is_active && 'opacity-50', isSel && 'bg-blue-50')}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={isSel} onChange={() => toggleSelect(user.user_id)} className="rounded border-gray-300" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {user.full_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-900">{user.full_name}</p>
                          <p className="text-[11px] text-gray-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{domain?.domain_name ?? <span className="text-gray-300">All domains</span>}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                        user.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200')}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-400">{user.last_login ? fmtDate(user.last_login) : '—'}</td>
                    <td className="px-4 py-3 text-[11px] text-gray-400">{fmtDate(user.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {user.is_active ? (
                          <>
                            <button onClick={() => setModalUser(user)} title="Edit"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => setResetUser(user)} title="Reset password"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50">
                              <Lock size={13} />
                            </button>
                            <button onClick={() => handleDeactivate(user.user_id)} title="Deactivate"
                              disabled={deactivating === user.user_id}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40">
                              {deactivating === user.user_id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </>
                        ) : (
                          <button onClick={() => handleReactivate(user.user_id)} title="Reactivate"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50">
                            <RotateCcw size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{filtered.length} users · Page {page + 1} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {modalUser !== null && (
        <UserModal user={modalUser === 'new' ? null : modalUser} domains={domains}
          onClose={() => setModalUser(null)} onSaved={() => { setModalUser(null); load() }} />
      )}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => { setResetUser(null); load() }} />}
    </div>
  )
}
