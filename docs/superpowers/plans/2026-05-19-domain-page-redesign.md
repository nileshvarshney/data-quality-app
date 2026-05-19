# Domain Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/dashboard/domains/[domainId]/PageClient.tsx` to match the global dashboard's compact no-scroll layout with full dark/light theme support.

**Architecture:** Full rewrite of the domain `PageClient.tsx` using the same 5-row `h-screen flex flex-col overflow-hidden` structure as the global dashboard. Two additive backend changes expose domain-scoped dimensions and at-risk tables. All colours use CSS variables so dark/light themes work automatically.

**Tech Stack:** Next.js 15, TypeScript, Tailwind (CSS variables), FastAPI, SQLAlchemy, Recharts

**Spec:** `docs/superpowers/specs/2026-05-19-domain-page-redesign.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `app/api/dashboard.py` | Modify | Add `domain_id` param to `/dimensions`; add `at_risk_tables` + `sla_breaches` to domain endpoint |
| `frontend/src/services/apiClient.ts` | Modify | `dimensions()` accepts optional `{ domain_id?: string }` |
| `frontend/src/types/index.ts` | Modify | Add `DomainDashboard` interface |
| `frontend/src/app/dashboard/domains/[domainId]/PageClient.tsx` | Rewrite | Full layout rewrite |

---

## Task 1: Backend — add `domain_id` filter to `/dashboard/dimensions`

**Files:**
- Modify: `app/api/dashboard.py:716-751`

- [ ] **Step 1: Open `app/api/dashboard.py` and locate the `quality_dimensions` function at line 716**

- [ ] **Step 2: Add the `domain_id` query parameter**

Replace the current function signature and first line:

```python
# BEFORE (line 717-722)
async def quality_dimensions(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return quality scores grouped by data quality dimension for today's runs."""
    domain_scope = get_domain_filter(user)

# AFTER
async def quality_dimensions(
    domain_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return quality scores grouped by data quality dimension for today's runs."""
    domain_scope = domain_id or get_domain_filter(user)
```

The rest of the function is unchanged. `Query` is already imported at the top of the file.

- [ ] **Step 3: Verify the change manually**

```bash
cd /path/to/repo && grep -n "domain_id\|domain_scope" app/api/dashboard.py | grep -A2 -B2 "quality_dimensions"
```

Expected: lines 716-725 show `domain_id: str | None = Query(None)` and `domain_scope = domain_id or get_domain_filter(user)`.

- [ ] **Step 4: Run existing tests to confirm nothing broke**

```bash
pytest tests/ -x -q 2>&1 | tail -10
```

Expected: all tests pass (or same failures as before this change).

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard.py
git commit -m "feat(api): add optional domain_id filter to /dashboard/dimensions"
```

---

## Task 2: Backend — add `at_risk_tables` and `sla_breaches` to domain endpoint

**Files:**
- Modify: `app/api/dashboard.py:517-528`

- [ ] **Step 1: Locate the `domain_dashboard` function return statement (around line 517)**

The current return dict ends at line 528. Add two calls before it.

- [ ] **Step 2: Add the helper calls and fields to the return dict**

```python
# BEFORE (lines ~499-528)
    trend = await _build_trend(db, days=14, domain_id=domain_id)

    failed_runs = sorted(...)
    top_failing = [...]

    subdomain_data = []
    for sub in subs:
        ...

    return {
        "domain_id": domain.domain_id,
        "domain_name": domain.domain_name,
        "quality_score": score,
        "total_rules": len(all_rules),
        "passed_rules": sum(1 for r in today_runs if r.status == "passed"),
        "failed_rules": sum(1 for r in today_runs if r.status in ("failed", "error")),
        "critical_failures": sum(1 for r in today_runs if r.status == "failed"),
        "subdomains": subdomain_data,
        "quality_trend": trend,
        "top_failing_rules": top_failing,
    }

# AFTER — insert two lines before return, and add two keys
    trend = await _build_trend(db, days=14, domain_id=domain_id)
    at_risk_tables = await _get_at_risk_tables(db, domain_scope=domain_id)
    sla_breaches   = await _get_sla_breaches(db, domain_scope=domain_id)

    failed_runs = sorted(...)
    top_failing = [...]

    subdomain_data = []
    for sub in subs:
        ...

    return {
        "domain_id": domain.domain_id,
        "domain_name": domain.domain_name,
        "quality_score": score,
        "total_rules": len(all_rules),
        "passed_rules": sum(1 for r in today_runs if r.status == "passed"),
        "failed_rules": sum(1 for r in today_runs if r.status in ("failed", "error")),
        "critical_failures": sum(1 for r in today_runs if r.status == "failed"),
        "subdomains": subdomain_data,
        "quality_trend": trend,
        "top_failing_rules": top_failing,
        "at_risk_tables": at_risk_tables,
        "sla_breaches": sla_breaches,
    }
```

- [ ] **Step 3: Run existing tests**

```bash
pytest tests/ -x -q 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/dashboard.py
git commit -m "feat(api): add at_risk_tables and sla_breaches to domain endpoint"
```

---

## Task 3: Frontend — update `apiClient.ts` and TypeScript types

**Files:**
- Modify: `frontend/src/services/apiClient.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Update `dimensions` in `apiClient.ts`**

Find the current line (~line 200):
```ts
dimensions:       () => api.get('/dashboard/dimensions'),
```

Replace with:
```ts
dimensions:       (params?: { domain_id?: string }) => api.get('/dashboard/dimensions', { params }),
```

- [ ] **Step 2: Add `DomainDashboard` interface to `frontend/src/types/index.ts`**

Add after the existing `DomainSummary` interface (around line 116):

```ts
export interface DomainDashboard {
  domain_id:         string
  domain_name:       string
  quality_score:     number
  total_rules:       number
  passed_rules:      number
  failed_rules:      number
  critical_failures: number
  subdomains: {
    subdomain_id:   string
    subdomain_name: string
    quality_score:  number
    total_rules:    number
  }[]
  quality_trend: Array<{ date: string; score: number | null; total: number; passed: number }>
  top_failing_rules: { run_id: string; rule_id: string; status: string; failed_rows: number }[]
  at_risk_tables: { table_name: string; schema_name: string; domain_name: string; score: number; score_delta: number }[]
  sla_breaches: { table_name: string; schema_name: string; domain_name: string; score: number; days_below_sla: number }[]
}
```

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/apiClient.ts frontend/src/types/index.ts
git commit -m "feat(types): add DomainDashboard type and domain_id param to dimensions call"
```

---

## Task 4: Rewrite `PageClient.tsx` — scaffolding, state, and data loading

**Files:**
- Rewrite: `frontend/src/app/dashboard/domains/[domainId]/PageClient.tsx`

This task replaces the entire file. Later tasks fill in the render rows.

- [ ] **Step 1: Replace the file with the new scaffold**

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Globe, Shield, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, TrendingDown, TrendingUp, Clock, Activity, Download,
} from 'lucide-react'
import { dashboardApi, executionsApi } from '@/services/apiClient'
import { DomainDashboard, DimensionScores } from '@/types'
import QualityTrendChart from '@/components/charts/QualityTrendChart'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { useTimezone } from '@/contexts/TimezoneContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 95) return '#22c55e'
  if (s >= 80) return '#f59e0b'
  if (s >= 60) return '#f97316'
  return '#ef4444'
}

function scoreBorderColor(s: number): string {
  if (s >= 95) return '#22c55e'
  if (s >= 80) return '#f59e0b'
  if (s >= 60) return '#f97316'
  return '#ef4444'
}

function relTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function severityStyle(sev: string): { bg: string; text: string } {
  switch (sev) {
    case 'critical': return { bg: 'rgba(239,68,68,0.1)',    text: '#ef4444' }
    case 'high':     return { bg: 'rgba(245,158,11,0.1)',   text: '#f59e0b' }
    default:         return { bg: 'rgba(100,116,139,0.1)',  text: '#64748b' }
  }
}

// ── Dimension config ──────────────────────────────────────────────────────────

const DIMENSIONS = [
  { key: 'completeness'  as const, label: 'Completeness',  icon: '📋', cssClass: 'dim-completeness' },
  { key: 'freshness'     as const, label: 'Freshness',     icon: '⏱',  cssClass: 'dim-freshness'    },
  { key: 'consistency'   as const, label: 'Consistency',   icon: '🔗', cssClass: 'dim-consistency'  },
  { key: 'accuracy'      as const, label: 'Accuracy',      icon: '🎯', cssClass: 'dim-accuracy'     },
  { key: 'business_rule' as const, label: 'Business Rule', icon: '📐', cssClass: 'dim-bizrule'      },
] as const

type TrendDays = 7 | 14 | 30 | 90
type TrendPoint = { date: string; score: number | null; total: number; passed: number }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DomainDetailPage() {
  const { domainId: _domainId } = useParams<{ domainId: string }>()
  const pathname = usePathname()
  const domainId = (_domainId && _domainId !== '__placeholder__')
    ? _domainId
    : pathname.split('/').filter(Boolean).pop() ?? ''

  const { formatTime } = useTimezone()

  const [data,           setData]           = useState<DomainDashboard | null>(null)
  const [recentFailures, setRecentFailures] = useState<any[]>([])
  const [dimensions,     setDimensions]     = useState<DimensionScores | null>(null)
  const [trendDays,      setTrendDays]      = useState<TrendDays>(7)
  const [trendData,      setTrendData]      = useState<TrendPoint[]>([])
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [lastRefreshed,  setLastRefreshed]  = useState<Date>(new Date())
  const [error,          setError]          = useState('')

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const [dRes, rRes, dimRes] = await Promise.allSettled([
        dashboardApi.domain(domainId),
        executionsApi.listRunsEnriched({ domain_id: domainId, status: 'failed', limit: 8 }),
        dashboardApi.dimensions({ domain_id: domainId }),
      ])
      if (dRes.status   === 'fulfilled') setData(dRes.value.data)
      else setError('Failed to load domain data')
      if (rRes.status   === 'fulfilled') setRecentFailures(Array.isArray(rRes.value.data) ? rRes.value.data : [])
      if (dimRes.status === 'fulfilled') setDimensions(dimRes.value.data)
      setLastRefreshed(new Date())
      setError('')
    } catch {
      setError('Failed to load domain data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [domainId])

  const loadTrend = useCallback(async () => {
    try {
      const res = await dashboardApi.domainHistory(domainId, trendDays)
      setTrendData(res.data.trend ?? [])
    } catch {
      // keep previous trend data on error
    }
  }, [domainId, trendDays])

  useEffect(() => {
    loadAll()
    const iv = setInterval(() => loadAll(true), 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [loadAll])

  useEffect(() => { loadTrend() }, [loadTrend])

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="h-screen flex flex-col gap-2 p-4" style={{ background: 'var(--bg)' }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-lg animate-pulse" style={{ height: '64px', background: 'var(--surface)' }} />
      ))}
    </div>
  )

  if (error || !data) return (
    <div className="h-screen flex items-center justify-center p-8" style={{ background: 'var(--bg)' }}>
      <div className="rounded-lg p-4 text-sm max-w-lg"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
        {error || 'Domain not found'}
      </div>
    </div>
  )

  // ── Derived values ─────────────────────────────────────────────────────────

  const score           = data.quality_score ?? 0
  const healthy         = (data.critical_failures ?? 0) === 0
  const subdomains      = data.subdomains ?? []
  const atRiskSubs      = subdomains.filter(s => s.quality_score < 80).length
  const atRiskTables    = data.at_risk_tables ?? []
  const slaBreaches     = data.sla_breaches ?? []
  const passTotal       = (data.passed_rules ?? 0) + (data.failed_rules ?? 0)
  const scoreDelta = (() => {
    if (!trendData || trendData.length < 2) return 0
    return (trendData[trendData.length - 1]?.score ?? 0) - (trendData[trendData.length - 2]?.score ?? 0)
  })()

  const topIssues = [
    ...slaBreaches.slice(0, 2).map(b => ({
      title: `${b.domain_name} domain below SLA for ${b.days_below_sla} consecutive day${b.days_below_sla !== 1 ? 's' : ''}`,
      detail: `${b.score.toFixed(0)}% quality · table: ${b.table_name}`,
      color: '#dc2626', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)',
      href: `/dashboard/domains/${domainId}`,
    })),
    ...recentFailures.filter(r => r.severity === 'critical').slice(0, 1).map(r => ({
      title: r.rule_name ?? 'Critical rule failure detected',
      detail: `${r.subdomain_name ?? '—'} · ${relTime(r.created_at)}`,
      color: '#c2410c', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)',
      href: `/runs?domain_id=${domainId}&status=failed`,
    })),
  ].slice(0, 3)

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Rows rendered in Tasks 5–8 */}
    </div>
  )
}
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors (the render returns an empty div for now).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/domains/\[domainId\]/PageClient.tsx
git commit -m "feat(domain): scaffold new PageClient with state, helpers, and data loading"
```

---

## Task 5: Row 0 (status bar) + Row 1 (hero score + KPI chips)

**Files:**
- Modify: `frontend/src/app/dashboard/domains/[domainId]/PageClient.tsx`

- [ ] **Step 1: Replace the empty `return` body with Row 0 and Row 1**

Replace the `return (` block's inner `<div>` content (the `{/* Rows rendered... */}` comment) with:

```tsx
      {/* ── ROW 0: Status bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-1.5 px-4 shrink-0"
        style={{ ...card, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: healthy ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${healthy ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: healthy ? '#22c55e' : '#ef4444' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            {healthy ? 'All Systems Normal' : 'Issues Detected'}
          </div>
          <Breadcrumbs items={[
            { label: 'Global',  href: '/dashboard/global' },
            { label: 'Domains', href: '/dashboard/domains' },
            { label: data.domain_name },
          ]} />
          <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
            <Clock size={11} />
            <span>Updated {formatTime(lastRefreshed)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={`/runs?domain_id=${domainId}`}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors"
            style={{ background: 'var(--surface-sub)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            View Logs
          </Link>
          <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/export/runs?domain_id=${domainId}&days=30`}
            download
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors"
            style={{ background: 'var(--surface-sub)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <Download size={10} /> Export CSV
          </a>
          <button onClick={() => loadAll(true)} disabled={refreshing}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors disabled:opacity-40"
            style={{ background: 'var(--surface-sub)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── ROW 1: Hero score (1/3) + 6 KPI chips (2/3) ──────────────── */}
      <div className="grid px-3 pt-3 pb-1.5 gap-3 shrink-0" style={{ gridTemplateColumns: '1fr 2fr' }}>

        <div className="rounded-xl p-4 flex flex-col items-center justify-center gap-2 relative"
          style={{ background: 'linear-gradient(145deg,#f0fdf4,#dcfce7,#bbf7d0)', border: '2px solid #86efac', boxShadow: '0 6px 20px rgba(34,197,94,0.18)' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#15803d' }}>Domain Quality Score</span>
          <span className="font-black leading-none tabular-nums" style={{ fontSize: '3rem', color: '#15803d', letterSpacing: '-2px' }}>
            {score > 0 ? `${score.toFixed(1)}%` : '—'}
          </span>
          {Math.abs(scoreDelta) >= 0.05 && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: '#bbf7d0', color: '#15803d', border: '1px solid #86efac' }}>
              {scoreDelta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {scoreDelta > 0 ? '+' : ''}{scoreDelta.toFixed(1)}% vs yesterday
            </span>
          )}
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: '1fr 1fr' }}>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2" style={card}>
            <Globe size={12} style={{ color: 'var(--text-4)' }} />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Subdomains</span>
            <span className="text-2xl font-black tabular-nums" style={{ color: 'var(--text)' }}>{subdomains.length}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>monitored</span>
          </div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2" style={card}>
            <Shield size={12} style={{ color: 'var(--text-4)' }} />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Active Rules</span>
            <span className="text-2xl font-black tabular-nums" style={{ color: 'var(--text)' }}>{data.total_rules ?? 0}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>configured</span>
          </div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            style={{ ...card, background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.25)' }}>
            <CheckCircle size={12} className="text-green-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Passed</span>
            <span className="text-2xl font-black tabular-nums text-green-500">{data.passed_rules ?? 0}</span>
            <span className="text-[9px] font-semibold text-green-500">today</span>
          </div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            style={{ ...card, background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}>
            <XCircle size={12} className="text-red-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Failed</span>
            <span className="text-2xl font-black tabular-nums text-red-500">{data.failed_rules ?? 0}</span>
            <span className="text-[9px] font-semibold text-red-500">today</span>
          </div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            style={{ ...card, background: 'rgba(147,51,234,0.06)', borderColor: 'rgba(147,51,234,0.25)' }}>
            <Activity size={12} className="text-purple-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Critical</span>
            <span className="text-2xl font-black tabular-nums text-purple-500">{data.critical_failures ?? 0}</span>
            <span className="text-[9px] font-semibold text-purple-500">detected</span>
          </div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            style={{ ...card, background: 'rgba(234,88,12,0.06)', borderColor: 'rgba(234,88,12,0.25)' }}>
            <AlertTriangle size={12} className="text-orange-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>At-Risk Subs</span>
            <span className="text-2xl font-black tabular-nums text-orange-500">{atRiskSubs}</span>
            <span className="text-[9px] font-semibold text-orange-500">score &lt; 80%</span>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/domains/\[domainId\]/PageClient.tsx
git commit -m "feat(domain): add status bar and hero score + KPI chips (rows 0–1)"
```

---

## Task 6: Row 2 — Quality Trend + Quality Dimensions

**Files:**
- Modify: `frontend/src/app/dashboard/domains/[domainId]/PageClient.tsx`

- [ ] **Step 1: Add Row 2 after the Row 1 closing `</div>`**

```tsx
      {/* ── ROW 2: Quality Trend + Quality Dimensions ──────────────────── */}
      <div className="grid px-3 pb-1.5 gap-3 shrink-0" style={{ gridTemplateColumns: '1fr 1.2fr', minHeight: '160px' }}>

        <div className="rounded-lg p-3 flex flex-col" style={card}>
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Quality Trend</span>
            <div className="flex gap-0.5 rounded p-0.5" style={{ background: 'var(--surface-sub)' }}>
              {([7, 14, 30, 90] as TrendDays[]).map(d => (
                <button key={d} onClick={() => setTrendDays(d)}
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors"
                  style={trendDays === d ? { background: '#6366f1', color: '#fff' } : { color: 'var(--text-3)' }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <QualityTrendChart data={trendData.length ? trendData : (data.quality_trend ?? [])} height={100} area />
          </div>
        </div>

        <div className="rounded-lg p-3 flex flex-col" style={card}>
          <span className="text-[10px] font-semibold uppercase tracking-wider mb-2 shrink-0" style={{ color: 'var(--text-3)' }}>Quality Dimensions</span>
          <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
            {DIMENSIONS.map(({ key, label, icon, cssClass }) => {
              const val = dimensions?.[key] ?? null
              const color = val !== null ? scoreColor(val) : 'var(--text-4)'
              return (
                <div key={key}
                  title={`${label}: ${val !== null ? `${val.toFixed(1)}%` : 'No data'} — based on today's rule executions`}
                  className={`${cssClass} rounded-lg flex flex-col items-center justify-between p-2 cursor-help`}
                  style={{ borderWidth: '1px', borderStyle: 'solid', minHeight: 0 }}>
                  <span className="text-base leading-none">{icon}</span>
                  <span className="text-[9px] uppercase tracking-wide text-center font-medium whitespace-nowrap overflow-hidden text-ellipsis w-full"
                    style={{ color: 'var(--text-3)' }}>
                    {label}
                  </span>
                  <span className="text-lg font-black leading-none tabular-nums" style={{ color }}>
                    {val !== null ? `${val.toFixed(0)}%` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/domains/\[domainId\]/PageClient.tsx
git commit -m "feat(domain): add quality trend and dimensions section (row 2)"
```

---

## Task 7: Row 3 — Subdomain Health tiles

**Files:**
- Modify: `frontend/src/app/dashboard/domains/[domainId]/PageClient.tsx`

- [ ] **Step 1: Add Row 3 after the Row 2 closing `</div>`**

```tsx
      {/* ── ROW 3: Subdomain Health ────────────────────────────────────── */}
      <div className="mx-3 mb-1.5 rounded-lg p-3 shrink-0" style={card}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Subdomain Health</span>
          <Link href={`/dashboard/domains/${domainId}`} className="text-[10px] font-medium" style={{ color: '#6366f1' }}>
            → All subdomains
          </Link>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {subdomains.map(sub => {
            const ss = sub.quality_score ?? 0
            const isRisk = ss < 80
            return (
              <Link key={sub.subdomain_id} href={`/dashboard/subdomains/${sub.subdomain_id}`}
                title={`${sub.subdomain_name}: ${ss.toFixed(0)}% quality · ${sub.total_rules} rules — click to navigate`}
                className="flex items-center justify-between rounded px-2 py-1.5 relative transition-opacity hover:opacity-80"
                style={{
                  border: `1px solid ${isRisk ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                  borderLeftColor: scoreBorderColor(ss),
                  borderLeftWidth: '3px',
                  background: isRisk ? 'rgba(239,68,68,0.04)' : 'var(--surface-sub)',
                }}>
                <span className="absolute top-1 right-2 text-[8px]" style={{ color: '#6366f1' }}>↗</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold truncate" style={{ color: isRisk ? '#dc2626' : 'var(--text)' }}>
                    {sub.subdomain_name}{isRisk ? ' ⚠' : ''}
                  </div>
                  <div className="text-[9px]" style={{ color: 'var(--text-4)' }}>{sub.total_rules}r</div>
                </div>
                <span className="text-sm font-black tabular-nums shrink-0" style={{ color: scoreColor(ss) }}>
                  {ss.toFixed(0)}%
                </span>
              </Link>
            )
          })}
        </div>
      </div>
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/domains/\[domainId\]/PageClient.tsx
git commit -m "feat(domain): add subdomain health tiles (row 3)"
```

---

## Task 8: Row 4 — Bottom tray (Recent Failures / At-Risk Tables / Top Issues)

**Files:**
- Modify: `frontend/src/app/dashboard/domains/[domainId]/PageClient.tsx`

- [ ] **Step 1: Add Row 4 after the Row 3 closing `</div>`**

```tsx
      {/* ── ROW 4: Bottom tray ────────────────────────────────────────── */}
      <div className="grid px-3 pb-3 gap-3 flex-1 min-h-0" style={{ gridTemplateColumns: '1.6fr 1fr 1.2fr' }}>

        {/* Recent Failures */}
        <div className="rounded-lg p-3 flex flex-col overflow-hidden" style={card}>
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Recent Failures</span>
            <Link href={`/runs?domain_id=${domainId}&status=failed`} className="text-[10px] font-medium" style={{ color: '#6366f1' }}>View all →</Link>
          </div>
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
            {recentFailures.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[11px] text-green-500 font-medium">✓ No recent failures</span>
              </div>
            ) : recentFailures.slice(0, 6).map((run: any, i: number) => {
              const sev = run.severity ?? 'low'
              const { bg, text } = severityStyle(sev)
              const borderColor = sev === 'critical' ? '#ef4444' : sev === 'high' ? '#f59e0b' : 'var(--border)'
              const desc = run.rule_name
                ? `${run.rule_name.replace(/_/g, ' ')} failed${run.subdomain_name ? ` in ${run.subdomain_name}` : ''}`
                : `Rule execution failed${run.subdomain_name ? ` in ${run.subdomain_name}` : ''}`
              return (
                <div key={run.run_id ?? i}
                  className="pl-2 pb-2 cursor-help"
                  style={{ borderLeft: `3px solid ${borderColor}`, borderBottom: `1px solid var(--border-sub)` }}>
                  <div className="text-[11px] font-medium leading-snug" style={{ color: 'var(--text)' }}>{desc}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: bg, color: text }}>{sev}</span>
                    <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>
                      {run.subdomain_name ?? '—'} · {run.created_at ? relTime(run.created_at) : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* At-Risk Tables */}
        <div className="rounded-lg p-3 flex flex-col overflow-hidden" style={card}>
          <span className="text-[10px] font-semibold uppercase tracking-wider mb-2 shrink-0" style={{ color: 'var(--text-3)' }}>Most At-Risk Tables</span>
          <div className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0">
            {atRiskTables.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[11px] text-green-500 font-medium">✓ All tables healthy</span>
              </div>
            ) : atRiskTables.slice(0, 5).map(t => (
              <div key={t.table_name + t.domain_name} className="cursor-help">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium truncate flex-1 mr-2" style={{ color: 'var(--text)' }}>{t.table_name}</span>
                  <span className="text-[11px] font-bold shrink-0" style={{ color: scoreColor(t.score) }}>
                    {t.score.toFixed(0)}%{t.score_delta < -0.05 ? ' ↓' : ''}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded overflow-hidden" style={{ background: 'var(--surface-sub)' }}>
                  <div className="h-full rounded transition-all" style={{ width: `${t.score}%`, background: scoreColor(t.score) }} />
                </div>
                <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-4)' }}>
                  {t.domain_name}{t.score_delta < -0.05 ? ` · ${t.score_delta.toFixed(1)}% this week` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Issues */}
        <div className="rounded-lg p-3 flex flex-col overflow-hidden" style={card}>
          <span className="text-[10px] font-semibold uppercase tracking-wider mb-2 shrink-0" style={{ color: 'var(--text-3)' }}>Top Issues</span>
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
            {topIssues.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[11px] text-green-500 font-medium">✓ No active issues</span>
              </div>
            ) : topIssues.map((issue, i) => (
              <Link key={i} href={issue.href}
                className="rounded-lg p-2 block relative hover:opacity-90 transition-opacity"
                style={{ background: issue.bg, border: `1px solid ${issue.border}` }}>
                <span className="absolute top-2 right-2 text-[9px] font-bold" style={{ color: issue.color }}>↗</span>
                <div className="text-[11px] font-semibold leading-snug pr-4" style={{ color: issue.color }}>{issue.title}</div>
                <div className="text-[9px] mt-0.5" style={{ color: issue.color, opacity: 0.8 }}>{issue.detail}</div>
              </Link>
            ))}
          </div>
        </div>

      </div>
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/domains/\[domainId\]/PageClient.tsx
git commit -m "feat(domain): add bottom tray — failures, at-risk tables, top issues (row 4)"
```

---

## Task 9: Verify in browser (both themes)

**Files:** None — verification only

- [ ] **Step 1: Start the dev server if not already running**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Open the domain page in the browser**

Navigate to: `http://localhost:3000/dashboard/domains/<any-domain-id>`

Check:
- Layout fills the viewport with no vertical scroll
- Status bar shows health pill + breadcrumb + timestamp
- Hero score card renders green gradient
- 6 KPI chips visible in 3×2 grid
- Quality Trend chart shows with period buttons (7d/14d/30d/90d)
- Quality Dimensions shows 5 dimension cards
- Subdomain Health tiles render with colour-coded left borders
- Bottom tray: 3 columns fill remaining height

- [ ] **Step 3: Switch to light theme**

Use the theme toggle (⚙ settings in the nav). Confirm:
- All backgrounds switch to light surface colours (`#f0f4f8`, `#ffffff`)
- Text colours are readable (dark on light)
- Hero card stays green gradient (hardcoded — correct)
- Dimension cards use their CSS-variable-based `dim-*` classes (defined in `globals.css` for both themes)

- [ ] **Step 4: Switch to dark theme**

Confirm:
- All backgrounds use dark CSS variables
- No hardcoded `bg-white` or `text-gray-*` classes visible

- [ ] **Step 5: Run type-check and lint**

```bash
cd frontend && npm run type-check && npm run lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(domain): redesign domain detail page — global dashboard style with dark/light theme"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `h-screen flex flex-col overflow-hidden` root | Task 4 |
| All CSS variables (`var(--bg)`, `var(--surface)`, etc.) | Tasks 4–8 |
| Row 0: status bar with health pill + breadcrumb + buttons | Task 5 |
| Row 1: hero score card (gradient green) + 6 KPI chips | Task 5 |
| Row 2: trend chart with period picker (domainHistory) | Task 6 |
| Row 2: quality dimensions (5 `dim-*` cards, domain-filtered) | Task 6 |
| Row 3: subdomain health horizontal tiles | Task 7 |
| Row 4: recent failures column | Task 8 |
| Row 4: at-risk tables column | Task 8 |
| Row 4: top issues column | Task 8 |
| Backend: `domain_id` param on `/dimensions` | Task 1 |
| Backend: `at_risk_tables` + `sla_breaches` on domain endpoint | Task 2 |
| `apiClient.ts` dimensions signature update | Task 3 |
| `DomainDashboard` TypeScript type | Task 3 |
| Dark/light theme verification | Task 9 |

All requirements covered. No gaps found.
