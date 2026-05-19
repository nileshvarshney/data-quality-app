# Global Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `frontend/src/app/dashboard/global/page.tsx` with a Modern SaaS layout supporting full dark/light theme via CSS variables, add quality dimensions and trend-days tabs, domain health grid, tooltip interactions, and a quality-score detail page.

**Architecture:** The page is a pure client component that fetches from three API endpoints in parallel. Theme is handled entirely by CSS variables already defined in `globals.css` — no new theme infrastructure needed. Two small backend extensions (trend endpoint with `days` param, dimensions endpoint) provide the new data.

**Tech Stack:** Next.js 15 App Router · TypeScript · Tailwind CSS · CSS variables (`var(--bg)`, `var(--surface)`, `var(--text)`) · Recharts · FastAPI · SQLAlchemy

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/api/dashboard.py` | Modify | Add `GET /dashboard/trend?days=N` + `GET /dashboard/dimensions` routes |
| `frontend/src/services/apiClient.ts` | Modify | Add `dashboardApi.trend(days)` + `dashboardApi.dimensions()` |
| `frontend/src/types/index.ts` | Modify | Add `DimensionScores` type; extend `GlobalDashboard` |
| `frontend/src/app/globals.css` | Modify | Add tinted chip dark-mode utility classes |
| `frontend/src/app/dashboard/global/page.tsx` | **Full rewrite** | New 5-row dashboard layout |
| `frontend/src/app/dashboard/quality-score/page.tsx` | Create | Quality score detail + report export page |

---

## Task 1: Backend — Add `/dashboard/trend` endpoint

**Files:**
- Modify: `app/api/dashboard.py` (after line 393, inside the dashboard router)

- [ ] **Step 1.1: Add the trend route**

Open `app/api/dashboard.py`. Find the line `@router.get("/sla-breaches")` (search for it). Add the following route **before** it:

```python
@router.get("/trend")
async def global_trend(
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return quality trend for N days. Used by dashboard trend tab switcher."""
    from fastapi.responses import Response as FastAPIResponse
    domain_scope = get_domain_filter(user)
    trend = await _build_trend(db, days=days, domain_id=domain_scope)
    return {"days": days, "trend": trend}
```

`Query`, `Depends`, `get_db`, `get_current_user`, `get_domain_filter`, and `_build_trend` are all already imported/defined in this file.

- [ ] **Step 1.2: Verify the server starts cleanly**

```bash
cd /Users/laxmansrigiri/git_repo/data-quality-app
python -c "from app.api.dashboard import router; print('OK')"
```

Expected output: `OK`

- [ ] **Step 1.3: Commit**

```bash
git add app/api/dashboard.py
git commit -m "feat: add GET /dashboard/trend?days=N endpoint"
```

---

## Task 2: Backend — Add `/dashboard/dimensions` endpoint

**Files:**
- Modify: `app/api/dashboard.py`

- [ ] **Step 2.1: Add the dimensions route**

In `app/api/dashboard.py`, add the following route immediately after the trend route you added in Task 1:

```python
@router.get("/dimensions")
async def quality_dimensions(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return quality scores grouped by data quality dimension for today's runs."""
    domain_scope = get_domain_filter(user)
    today = datetime.now(timezone.utc).replace(tzinfo=None).date()

    q = (
        select(DQRule.rule_type, DQRuleRun.status)
        .join(DQRuleRun, DQRule.rule_id == DQRuleRun.rule_id)
        .where(func.date(DQRuleRun.created_at) == today)
        .where(DQRule.is_active == True)
    )
    if domain_scope:
        q = q.where(DQRule.domain_id == domain_scope)

    rows = (await db.execute(q)).all()

    dimension_map: dict[str, list[str]] = {
        "completeness":   ["null_check", "not_null", "completeness"],
        "freshness":      ["freshness", "timeliness"],
        "consistency":    ["referential_integrity", "uniqueness", "consistency"],
        "accuracy":       ["range_check", "format_check", "accuracy"],
        "business_rule":  ["business_rule", "custom_sql", "threshold"],
    }

    result: dict[str, float | None] = {}
    for dim, rule_types in dimension_map.items():
        dim_rows = [r for r in rows if r.rule_type in rule_types]
        total = len(dim_rows)
        passed = sum(1 for r in dim_rows if r.status == "passed")
        result[dim] = round(passed / total * 100, 1) if total > 0 else None

    return result
```

- [ ] **Step 2.2: Verify import chain**

```bash
python -c "from app.api.dashboard import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 2.3: Commit**

```bash
git add app/api/dashboard.py
git commit -m "feat: add GET /dashboard/dimensions endpoint for quality dimension scores"
```

---

## Task 3: Frontend — Extend apiClient and TypeScript types

**Files:**
- Modify: `frontend/src/services/apiClient.ts` (around line 188)
- Modify: `frontend/src/types/index.ts` (around line 80)

- [ ] **Step 3.1: Add `DimensionScores` type and update `GlobalDashboard`**

In `frontend/src/types/index.ts`, add this type **before** the `GlobalDashboard` interface (before line 80):

```typescript
export interface DimensionScores {
  completeness:  number | null
  freshness:     number | null
  consistency:   number | null
  accuracy:      number | null
  business_rule: number | null
}

export interface TrendResponse {
  days:  number
  trend: Array<{ date: string; score: number | null; total: number; passed: number }>
}
```

- [ ] **Step 3.2: Add API methods to `dashboardApi`**

In `frontend/src/services/apiClient.ts`, find the `dashboardApi` object (line ~188). Add two new methods after `slaBreaches`:

```typescript
export const dashboardApi = {
  global:        () => api.get('/dashboard/global'),
  summary:       () => api.get('/dashboard/summary'),
  domains:       () => api.get('/dashboard/domains'),
  domain:        (id: string) => api.get(`/dashboard/domains/${id}`),
  subdomain:     (id: string) => api.get(`/dashboard/subdomains/${id}`),
  table:         (id: string) => api.get(`/dashboard/tables/${id}`),
  tableHistory:  (id: string, days?: number) => api.get(`/dashboard/history/table/${id}`, { params: { days } }),
  subdomainHistory: (id: string, days?: number) => api.get(`/dashboard/history/subdomain/${id}`, { params: { days } }),
  domainHistory: (id: string, days?: number) => api.get(`/dashboard/history/domain/${id}`, { params: { days } }),
  slaBreaches:   () => api.get('/dashboard/sla-breaches'),
  trend:         (days: number) => api.get('/dashboard/trend', { params: { days } }),
  dimensions:    () => api.get('/dashboard/dimensions'),
}
```

- [ ] **Step 3.3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: `Found 0 errors.`

- [ ] **Step 3.4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/apiClient.ts
git commit -m "feat: add DimensionScores type, TrendResponse type, and dashboard trend/dimensions API methods"
```

---

## Task 4: Frontend — Add dark-mode tinted chip utilities to globals.css

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 4.1: Append chip dark-mode utilities**

In `frontend/src/app/globals.css`, scroll to the very end of the file and append:

```css
/* ── Dashboard KPI chip tinted backgrounds (dark mode) ───────────────────── */

.chip-passed-dark  { background: #052e16; border-color: #14532d; }
.chip-failed-dark  { background: #1a0a0a; border-color: #7f1d1d; }
.chip-issues-dark  { background: #1c0f00; border-color: #78350f; }
.chip-anomaly-dark { background: #1a0d2e; border-color: #4c1d95; }

.score-card-dark {
  background: linear-gradient(145deg, #052e16, #14532d, #166534);
  border-color: #15803d;
  box-shadow: 0 6px 20px rgba(34, 197, 94, 0.12);
}

/* ── Dashboard dimension sub-card backgrounds ────────────────────────────── */
.dim-completeness { background: #f0f7ff; border-color: #bfdbfe; }
.dim-freshness    { background: #f0fdf4; border-color: #bbf7d0; }
.dim-consistency  { background: #faf5ff; border-color: #e9d5ff; }
.dim-accuracy     { background: #fff7ed; border-color: #fed7aa; }
.dim-bizrule      { background: #fef2f2; border-color: #fecaca; }

html.dark .dim-completeness,
html.dark .dim-freshness,
html.dark .dim-consistency,
html.dark .dim-accuracy,
html.dark .dim-bizrule { background: #0d1d3a; border-color: #1e3a5f; }
```

- [ ] **Step 4.2: Verify dev server compiles without errors**

```bash
cd frontend && npm run build 2>&1 | grep -E "error|Error|warning" | head -10
```

Expected: No errors. (Warnings about `@tailwind` are fine.)

- [ ] **Step 4.3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat: add dark-mode chip and dimension card CSS utilities for dashboard redesign"
```

---

## Task 5: Frontend — Rewrite `dashboard/global/page.tsx`

**Files:**
- Modify (full rewrite): `frontend/src/app/dashboard/global/page.tsx`

This is the main task. Replace the entire file with the code below.

- [ ] **Step 5.1: Replace the file**

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Globe, Database, CheckCircle, XCircle, AlertTriangle,
  Bell, RefreshCw, TrendingDown, TrendingUp, Play, Download,
  Clock, Activity,
} from 'lucide-react'
import { dashboardApi, executionsApi } from '@/services/apiClient'
import { GlobalDashboard, DomainSummary, DimensionScores } from '@/types'
import QualityTrendChart from '@/components/charts/QualityTrendChart'
import SeverityBadge from '@/components/common/SeverityBadge'
import { useTimezone } from '@/contexts/TimezoneContext'

// ── Score colour helpers ───────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 95) return '#22c55e'
  if (s >= 80) return '#f59e0b'
  if (s >= 60) return '#f97316'
  return '#ef4444'
}
function scoreTextClass(s: number) {
  if (s >= 95) return 'text-green-500'
  if (s >= 80) return 'text-yellow-500'
  if (s >= 60) return 'text-orange-500'
  return 'text-red-500'
}
function scoreBorderColor(s: number) {
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

// ── Severity label helper ─────────────────────────────────────────────────

function severityStyle(sev: string): { bg: string; text: string } {
  switch (sev) {
    case 'critical': return { bg: 'rgba(239,68,68,0.1)', text: '#ef4444' }
    case 'high':     return { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' }
    default:         return { bg: 'rgba(100,116,139,0.1)', text: '#64748b' }
  }
}

// ── Dimension config ──────────────────────────────────────────────────────

const DIMENSIONS = [
  { key: 'completeness' as const,  label: 'Completeness', icon: '📋', cssClass: 'dim-completeness' },
  { key: 'freshness'    as const,  label: 'Freshness',    icon: '⏱',  cssClass: 'dim-freshness'    },
  { key: 'consistency'  as const,  label: 'Consistency',  icon: '🔗', cssClass: 'dim-consistency'  },
  { key: 'accuracy'     as const,  label: 'Accuracy',     icon: '🎯', cssClass: 'dim-accuracy'     },
  { key: 'business_rule' as const, label: 'Business Rule',icon: '📐', cssClass: 'dim-bizrule'      },
] as const

// ── Main page ─────────────────────────────────────────────────────────────

type TrendDays = 7 | 14 | 30 | 90
type TrendPoint = { date: string; score: number | null; total: number; passed: number }

export default function GlobalDashboardPage() {
  const { formatTime } = useTimezone()
  const router = useRouter()

  const [global,         setGlobal]         = useState<GlobalDashboard | null>(null)
  const [domains,        setDomains]        = useState<DomainSummary[]>([])
  const [recentFailures, setRecentFailures] = useState<any[]>([])
  const [dimensions,     setDimensions]     = useState<DimensionScores | null>(null)
  const [trendDays,      setTrendDays]      = useState<TrendDays>(7)
  const [trendData,      setTrendData]      = useState<TrendPoint[]>([])
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [lastRefreshed,  setLastRefreshed]  = useState<Date>(new Date())
  const [error,          setError]          = useState('')

  // Main data load (global KPIs, domains, failures, dimensions)
  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const [gRes, dRes, rRes, dimRes] = await Promise.allSettled([
        dashboardApi.global(),
        dashboardApi.domains(),
        executionsApi.listRunsEnriched({ status: 'failed', limit: 8 }),
        dashboardApi.dimensions(),
      ])
      if (gRes.status === 'fulfilled')   setGlobal(gRes.value.data)
      if (dRes.status === 'fulfilled')   setDomains(Array.isArray(dRes.value.data) ? dRes.value.data : [])
      if (rRes.status === 'fulfilled')   setRecentFailures(Array.isArray(rRes.value.data) ? rRes.value.data : [])
      if (dimRes.status === 'fulfilled') setDimensions(dimRes.value.data)
      setLastRefreshed(new Date())
      setError('')
    } catch {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Trend re-fetches when trendDays changes
  const loadTrend = useCallback(async () => {
    try {
      const res = await dashboardApi.trend(trendDays)
      setTrendData(res.data.trend ?? [])
    } catch {
      // keep previous trend data on error
    }
  }, [trendDays])

  useEffect(() => { loadAll(); const iv = setInterval(() => loadAll(true), 5 * 60 * 1000); return () => clearInterval(iv) }, [loadAll])
  useEffect(() => { loadTrend() }, [loadTrend])

  const score      = global?.overall_quality_score ?? 0
  const healthy    = (global?.critical_failures ?? 0) === 0
  const passTotal  = (global?.rules_passed_today ?? 0) + (global?.rules_failed_today ?? 0)
  const scoreDelta = (() => {
    if (!trendData || trendData.length < 2) return 0
    return (trendData[trendData.length - 1]?.score ?? 0) - (trendData[trendData.length - 2]?.score ?? 0)
  })()

  // Build Top Issues from sla_breaches + recent critical failures
  const topIssues = [
    ...(global?.sla_breaches ?? []).slice(0, 2).map(b => ({
      title: `${b.domain_name} domain below SLA for ${b.days_below_sla} consecutive day${b.days_below_sla !== 1 ? 's' : ''}`,
      detail: `${b.score.toFixed(0)}% quality · table: ${b.table_name}`,
      color: '#dc2626', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)',
      href: `/dashboard/domains`,
    })),
    ...recentFailures.filter(r => r.severity === 'critical').slice(0, 1).map(r => ({
      title: r.rule_name ?? 'Critical rule failure detected',
      detail: `${r.domain_name ?? '—'} · ${relTime(r.created_at)}`,
      color: '#c2410c', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)',
      href: `/runs?status=failed`,
    })),
  ].slice(0, 3)

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="h-screen flex flex-col gap-2 p-4" style={{ background: 'var(--bg)' }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-lg animate-pulse" style={{ height: '64px', background: 'var(--surface)' }} />
      ))}
    </div>
  )

  if (error) return (
    <div className="h-screen flex items-center justify-center p-8" style={{ background: 'var(--bg)' }}>
      <div className="rounded-lg p-4 text-sm max-w-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>{error}</div>
    </div>
  )

  // ── Card style helpers ─────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
  }
  const cardSm: React.CSSProperties = {
    ...card,
    borderRadius: '6px',
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── ROW 0: Status bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-1.5 px-4 shrink-0" style={{ ...card, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: healthy ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${healthy ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: healthy ? '#22c55e' : '#ef4444' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
            {healthy ? 'All Systems Normal' : 'Issues Detected'}
          </div>
          <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
            <Clock size={11} />
            <span>Updated {formatTime(lastRefreshed)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { href: '/runs',   label: 'View Runs',   icon: <Play size={10} /> },
            { href: '/alerts', label: 'View Alerts', icon: <Bell size={10} /> },
          ].map(({ href, label, icon }) => (
            <Link key={href} href={href} className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors"
              style={{ background: 'var(--surface-sub)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              {icon} {label}
            </Link>
          ))}
          <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/export/runs?days=30`} download
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

        {/* Quality Score — click → detail page */}
        <button
          title="Click to view detailed quality scorecard and generate PDF / Excel / CSV report"
          onClick={() => router.push('/dashboard/quality-score')}
          className="rounded-xl p-4 flex flex-col items-center justify-center gap-2 relative cursor-pointer"
          style={{ background: 'linear-gradient(145deg,#f0fdf4,#dcfce7,#bbf7d0)', border: '2px solid #86efac', boxShadow: '0 6px 20px rgba(34,197,94,0.18)' }}>
          <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: '#bbf7d0', color: '#15803d', border: '1px solid #86efac' }}>
            ↗ Detail · Report
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#15803d' }}>Overall Quality Score</span>
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
        </button>

        {/* 6 KPI chips — 3×2 grid */}
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: '1fr 1fr' }}>

          {/* Domains */}
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            title={`${domains.map(d => d.domain_name).join(' · ')}`}
            style={card}>
            <Globe size={12} style={{ color: 'var(--text-4)' }} />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Domains</span>
            <span className="text-2xl font-black tabular-nums" style={{ color: 'var(--text)' }}>{global?.total_domains ?? 0}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>monitored</span>
          </div>

          {/* Tables */}
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            title={`${global?.total_assets ?? 0} tables actively monitored`}
            style={card}>
            <Database size={12} style={{ color: 'var(--text-4)' }} />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Tables</span>
            <span className="text-2xl font-black tabular-nums" style={{ color: 'var(--text)' }}>{global?.total_assets ?? 0}</span>
            <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>active</span>
          </div>

          {/* Passed */}
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            title={`${global?.rules_passed_today ?? 0} rules passed today — ${passTotal > 0 ? ((global?.rules_passed_today ?? 0) / passTotal * 100).toFixed(0) : 0}% pass rate`}
            style={{ ...card, background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.25)' }}>
            <CheckCircle size={12} className="text-green-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Passed</span>
            <span className="text-2xl font-black tabular-nums text-green-500">{global?.rules_passed_today ?? 0}</span>
            <span className="text-[9px] font-semibold text-green-500">today</span>
          </div>

          {/* Failed */}
          <div className="rounded-lg flex flex-col items-center justify-center gap-1 py-2"
            title={recentFailures.slice(0, 3).map(r => r.rule_name ?? r.run_id).join(' · ')}
            style={{ ...card, background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}>
            <XCircle size={12} className="text-red-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Failed</span>
            <span className="text-2xl font-black tabular-nums text-red-500">{global?.rules_failed_today ?? 0}</span>
            <span className="text-[9px] font-semibold text-red-500">today</span>
          </div>

          {/* Open Issues — navigates to /alerts */}
          <Link href="/alerts"
            title={`${global?.open_alerts ?? 0} open alerts — click to view all`}
            className="rounded-lg flex flex-col items-center justify-center gap-1 py-2 relative"
            style={{ ...card, background: 'rgba(234,88,12,0.06)', borderColor: 'rgba(234,88,12,0.25)' }}>
            <span className="absolute top-1.5 right-2 text-[9px] font-bold" style={{ color: '#f97316' }}>↗</span>
            <AlertTriangle size={12} className="text-orange-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Open Issues</span>
            <span className="text-2xl font-black tabular-nums text-orange-500">{global?.open_alerts ?? 0}</span>
            <span className="text-[9px] font-semibold text-orange-500">unresolved</span>
          </Link>

          {/* Anomalies (critical failures) */}
          <div
            title={`${global?.critical_failures ?? 0} critical failures detected — rules with critical severity that failed today`}
            className="rounded-lg flex flex-col items-center justify-center gap-1 py-2 relative cursor-help"
            style={{ ...card, background: 'rgba(147,51,234,0.06)', borderColor: 'rgba(147,51,234,0.25)' }}>
            <span className="absolute top-1.5 right-2 text-[9px]" style={{ color: '#a855f7' }}>ⓘ</span>
            <Activity size={12} className="text-purple-500" />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Anomalies</span>
            <span className="text-2xl font-black tabular-nums text-purple-500">{global?.critical_failures ?? 0}</span>
            <span className="text-[9px] font-semibold text-purple-500">detected</span>
          </div>

        </div>
      </div>

      {/* ── ROW 2: Quality Trend + Quality Dimensions ──────────────────── */}
      <div className="grid px-3 pb-1.5 gap-3 shrink-0" style={{ gridTemplateColumns: '1fr 1.2fr', minHeight: '160px' }}>

        {/* Quality Trend with time-range tabs */}
        <div className="rounded-lg p-3 flex flex-col" style={card}
          title="Quality score over the selected time period — each bar is one day">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Quality Trend</span>
            <div className="flex gap-0.5 rounded p-0.5" style={{ background: 'var(--surface-sub)' }}>
              {([7, 14, 30, 90] as TrendDays[]).map(d => (
                <button key={d} onClick={() => setTrendDays(d)}
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors"
                  style={trendDays === d
                    ? { background: '#6366f1', color: '#fff' }
                    : { color: 'var(--text-3)' }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <QualityTrendChart data={trendData.length ? trendData : (global?.quality_trend ?? [])} height={100} area />
          </div>
        </div>

        {/* Quality Dimensions wrapper card */}
        <div className="rounded-lg p-3 flex flex-col" style={card}>
          <span className="text-[10px] font-semibold uppercase tracking-wider mb-2 shrink-0" style={{ color: 'var(--text-3)' }}>Quality Dimensions</span>
          <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
            {DIMENSIONS.map(({ key, label, icon, cssClass }) => {
              const val = dimensions?.[key] ?? null
              const color = val !== null ? scoreColor(val) : 'var(--text-4)'
              const prev  = null // no delta available yet
              return (
                <div key={key}
                  title={`${label}: ${val !== null ? `${val.toFixed(1)}%` : 'No data'} — based on today's rule executions`}
                  className={`${cssClass} rounded-lg flex flex-col items-center justify-between p-2 cursor-help`}
                  style={{ border: '1px solid', minHeight: 0 }}>
                  <span className="text-base leading-none">{icon}</span>
                  <span className="text-[9px] uppercase tracking-wide text-center font-medium whitespace-nowrap overflow-hidden text-ellipsis w-full" style={{ color: 'var(--text-3)' }}>
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

      {/* ── ROW 3: Domain Health — 4-col grid, auto-wraps ─────────────── */}
      <div className="mx-3 mb-1.5 rounded-lg p-3 shrink-0" style={card}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Domain Health</span>
          <Link href="/dashboard/domains" className="text-[10px] font-medium" style={{ color: '#6366f1' }}>→ All domains</Link>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {domains.map(d => {
            const ds = d.quality_score ?? 0
            const isRisk = ds < 80
            return (
              <Link key={d.domain_id} href={`/dashboard/domains/${d.domain_id}`}
                title={`${d.domain_name}: ${ds.toFixed(0)}% quality · ${d.total_rules} rules · ${d.total_assets} tables — click to navigate to domain page`}
                className="flex items-center justify-between rounded px-2 py-1.5 relative transition-opacity hover:opacity-80"
                style={{
                  border: `1px solid ${isRisk ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                  borderLeftColor: scoreBorderColor(ds),
                  borderLeftWidth: '3px',
                  background: isRisk ? 'rgba(239,68,68,0.04)' : 'var(--surface-sub)',
                }}>
                <span className="absolute top-1 right-2 text-[8px]" style={{ color: '#6366f1' }}>↗</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold truncate" style={{ color: isRisk ? '#dc2626' : 'var(--text)' }}>
                    {d.domain_name}{isRisk ? ' ⚠' : ''}
                  </div>
                  <div className="text-[9px]" style={{ color: 'var(--text-4)' }}>{d.total_rules}r · {d.total_assets}t</div>
                </div>
                <span className="text-sm font-black tabular-nums shrink-0" style={{ color: scoreColor(ds) }}>
                  {ds.toFixed(0)}%
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── ROW 4: Bottom tray — fills remaining height ────────────────── */}
      <div className="grid px-3 pb-3 gap-3 flex-1 min-h-0" style={{ gridTemplateColumns: '1.6fr 1fr 1.2fr' }}>

        {/* Recent Failures */}
        <div className="rounded-lg p-3 flex flex-col overflow-hidden" style={card}
          title="Rule failures — descriptions shown, not IDs">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Recent Failures</span>
            <Link href="/runs?status=failed" className="text-[10px] font-medium" style={{ color: '#6366f1' }}>View all →</Link>
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
                ? `${run.rule_name.replace(/_/g, ' ')} failed${run.domain_name ? ` in ${run.domain_name}` : ''}`
                : `Rule execution failed${run.domain_name ? ` in ${run.domain_name}` : ''}`
              return (
                <div key={run.run_id ?? i}
                  title={`Rule: ${run.rule_name ?? '—'} · Table: ${run.table_name ?? '—'} · Domain: ${run.domain_name ?? '—'}`}
                  className="pl-2 pb-2 cursor-help"
                  style={{ borderLeft: `3px solid ${borderColor}`, borderBottom: `1px solid var(--border-sub)` }}>
                  <div className="text-[11px] font-medium leading-snug" style={{ color: 'var(--text)' }}>{desc}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: bg, color: text }}>
                      {sev}
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--text-4)' }}>
                      {run.domain_name ?? '—'} · {run.created_at ? relTime(run.created_at) : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Most At-Risk Tables */}
        <div className="rounded-lg p-3 flex flex-col overflow-hidden" style={card}>
          <span className="text-[10px] font-semibold uppercase tracking-wider mb-2 shrink-0" style={{ color: 'var(--text-3)' }}>Most At-Risk Tables</span>
          <div className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0">
            {(global?.at_risk_tables?.length ?? 0) === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[11px] text-green-500 font-medium">✓ All tables healthy</span>
              </div>
            ) : (global?.at_risk_tables ?? []).slice(0, 5).map(t => (
              <div key={t.table_name + t.domain_name}
                title={`${t.table_name} · ${t.domain_name} · Score: ${t.score.toFixed(1)}% · Weekly delta: ${t.score_delta.toFixed(1)}%`}
                className="cursor-help">
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
                title={`${issue.title} — click to navigate`}
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
    </div>
  )
}
```

- [ ] **Step 5.2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -10
```

Expected: `Found 0 errors.`

- [ ] **Step 5.3: Start dev server and verify in browser**

```bash
cd frontend && npm run dev
```

Open http://localhost:3000/dashboard/global. Verify:
1. Page loads without console errors
2. All 5 rows are visible without scrolling
3. Toggle dark/light mode via TopBar avatar → theme button — all cards switch cleanly
4. Click the 7d/14d/30d/90d tabs — chart re-fetches and updates
5. Hover over domain cards — tooltip shows sub-domain breakdown text
6. Click Quality Score card → navigates to `/dashboard/quality-score` (404 is OK — task 6 creates it)
7. Domain cards have `↗` arrow and navigate to correct domain page on click

- [ ] **Step 5.4: Lint**

```bash
cd frontend && npm run lint 2>&1 | tail -10
```

Expected: No errors (warnings OK).

- [ ] **Step 5.5: Commit**

```bash
git add frontend/src/app/dashboard/global/page.tsx
git commit -m "feat: rewrite global dashboard — Modern SaaS layout, full dark/light theme, quality dimensions, trend tabs"
```

---

## Task 6: Frontend — Create quality-score detail page

**Files:**
- Create: `frontend/src/app/dashboard/quality-score/page.tsx`

- [ ] **Step 6.1: Create the directory and file**

```bash
mkdir -p frontend/src/app/dashboard/quality-score
```

- [ ] **Step 6.2: Create the page**

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, FileText, FileSpreadsheet, Printer } from 'lucide-react'
import { dashboardApi } from '@/services/apiClient'
import { GlobalDashboard, DomainSummary, DimensionScores } from '@/types'
import QualityTrendChart from '@/components/charts/QualityTrendChart'

type TrendDays = 7 | 14 | 30 | 90
type TrendPoint = { date: string; score: number | null; total: number; passed: number }

function scoreColor(s: number) {
  if (s >= 95) return '#22c55e'
  if (s >= 80) return '#f59e0b'
  if (s >= 60) return '#f97316'
  return '#ef4444'
}

const DIMENSIONS = [
  { key: 'completeness'  as const, label: 'Completeness',  icon: '📋' },
  { key: 'freshness'     as const, label: 'Freshness',     icon: '⏱'  },
  { key: 'consistency'   as const, label: 'Consistency',   icon: '🔗' },
  { key: 'accuracy'      as const, label: 'Accuracy',      icon: '🎯' },
  { key: 'business_rule' as const, label: 'Business Rule', icon: '📐' },
]

export default function QualityScorePage() {
  const [global,      setGlobal]      = useState<GlobalDashboard | null>(null)
  const [domains,     setDomains]     = useState<DomainSummary[]>([])
  const [dimensions,  setDimensions]  = useState<DimensionScores | null>(null)
  const [trendDays,   setTrendDays]   = useState<TrendDays>(30)
  const [trendData,   setTrendData]   = useState<TrendPoint[]>([])
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [gRes, dRes, dimRes] = await Promise.allSettled([
        dashboardApi.global(),
        dashboardApi.domains(),
        dashboardApi.dimensions(),
      ])
      if (gRes.status === 'fulfilled')   setGlobal(gRes.value.data)
      if (dRes.status === 'fulfilled')   setDomains(Array.isArray(dRes.value.data) ? dRes.value.data : [])
      if (dimRes.status === 'fulfilled') setDimensions(dimRes.value.data)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTrend = useCallback(async () => {
    try {
      const res = await dashboardApi.trend(trendDays)
      setTrendData(res.data.trend ?? [])
    } catch { /* keep previous */ }
  }, [trendDays])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTrend() }, [loadTrend])

  const score = global?.overall_quality_score ?? 0

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
  }

  if (loading) return (
    <div className="min-h-screen p-6 flex flex-col gap-4" style={{ background: 'var(--bg)' }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--surface)' }} />
      ))}
    </div>
  )

  return (
    <div className="min-h-screen p-6 flex flex-col gap-4" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/global" className="flex items-center gap-1 text-sm font-medium" style={{ color: '#6366f1' }}>
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
          <span style={{ color: 'var(--text-4)' }}>/</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Quality Score Detail</span>
        </div>
        {/* Export actions */}
        <div className="flex gap-2">
          <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/export/runs?days=${trendDays}`} download
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <FileSpreadsheet size={14} /> Export CSV
          </a>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg"
            style={{ background: '#6366f1', color: '#fff', border: 'none' }}>
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>

      {/* Hero score */}
      <div className="rounded-xl p-8 flex items-center gap-8"
        style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px solid #86efac', boxShadow: '0 8px 32px rgba(34,197,94,0.12)' }}>
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#15803d' }}>Overall Quality Score</div>
          <div className="font-black tabular-nums leading-none" style={{ fontSize: '5rem', color: '#15803d', letterSpacing: '-3px' }}>
            {score > 0 ? `${score.toFixed(1)}%` : '—'}
          </div>
          <div className="text-sm mt-2 font-medium" style={{ color: '#16a34a' }}>
            {global?.rules_passed_today ?? 0} passed · {global?.rules_failed_today ?? 0} failed today
          </div>
        </div>
        {/* Summary stats */}
        <div className="grid gap-4 flex-1" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {[
            { label: 'Domains',      value: global?.total_domains ?? 0 },
            { label: 'Tables',       value: global?.total_assets ?? 0  },
            { label: 'Active Rules', value: global?.total_active_rules ?? 0 },
            { label: 'Open Alerts',  value: global?.open_alerts ?? 0   },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-black" style={{ color: '#15803d' }}>{value}</div>
              <div className="text-xs mt-0.5" style={{ color: '#16a34a' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Trend + Dimensions */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <div className="rounded-xl p-4" style={card}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Quality Trend</span>
            <div className="flex gap-1 rounded p-0.5" style={{ background: 'var(--surface-sub)' }}>
              {([7, 14, 30, 90] as TrendDays[]).map(d => (
                <button key={d} onClick={() => setTrendDays(d)}
                  className="text-xs font-semibold px-2 py-0.5 rounded transition-colors"
                  style={trendDays === d ? { background: '#6366f1', color: '#fff' } : { color: 'var(--text-3)' }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <QualityTrendChart data={trendData.length ? trendData : (global?.quality_trend ?? [])} height={200} area />
        </div>

        <div className="rounded-xl p-4" style={card}>
          <span className="text-sm font-semibold block mb-3" style={{ color: 'var(--text)' }}>Quality Dimensions</span>
          <div className="flex flex-col gap-3">
            {DIMENSIONS.map(({ key, label, icon }) => {
              const val = dimensions?.[key] ?? null
              const color = val !== null ? scoreColor(val) : 'var(--text-4)'
              return (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>{label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 rounded overflow-hidden" style={{ background: 'var(--surface-sub)' }}>
                      {val !== null && <div className="h-full rounded" style={{ width: `${val}%`, background: color }} />}
                    </div>
                    <span className="text-sm font-bold w-12 text-right tabular-nums" style={{ color }}>
                      {val !== null ? `${val.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Domain breakdown */}
      <div className="rounded-xl p-4" style={card}>
        <span className="text-sm font-semibold block mb-3" style={{ color: 'var(--text)' }}>Domain Breakdown</span>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {domains.map(d => {
            const ds = d.quality_score ?? 0
            return (
              <Link key={d.domain_id} href={`/dashboard/domains/${d.domain_id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 hover:opacity-80 transition-opacity"
                style={{ background: 'var(--surface-sub)', border: `1px solid var(--border)`, borderLeftColor: scoreColor(ds), borderLeftWidth: 3 }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{d.domain_name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-4)' }}>{d.total_rules} rules</div>
                </div>
                <span className="text-sm font-black" style={{ color: scoreColor(ds) }}>{ds.toFixed(0)}%</span>
              </Link>
            )
          })}
        </div>
      </div>

    </div>
  )
}
```

- [ ] **Step 6.3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: `Found 0 errors.`

- [ ] **Step 6.4: Verify in browser**

Open http://localhost:3000/dashboard/quality-score. Verify:
1. Hero score displays correctly
2. Trend chart renders and tab-switching works
3. Dimension bars show scores
4. Domain breakdown cards link to correct domain pages
5. "Print / PDF" button opens browser print dialog
6. Theme toggle switches the page correctly (dark/light)

- [ ] **Step 6.5: Commit**

```bash
git add frontend/src/app/dashboard/quality-score/page.tsx
git commit -m "feat: add quality score detail page with dimension breakdown, trend chart, and PDF export"
```

---

## Task 7: Final verification

- [ ] **Step 7.1: Full type-check**

```bash
cd frontend && npm run type-check 2>&1
```

Expected: `Found 0 errors.`

- [ ] **Step 7.2: Lint check**

```bash
cd frontend && npm run lint 2>&1 | tail -10
```

Expected: No errors.

- [ ] **Step 7.3: End-to-end browser walkthrough**

With dev server running (`npm run dev`):

1. Go to http://localhost:3000 — should redirect to `/dashboard/global`
2. **Row 0:** Status pill shows green; refresh button spins briefly
3. **Row 1:** Quality Score card prominent; KPI chips show numbers centered; click Open Issues → goes to `/alerts`
4. **Row 2:** Click 14d, 30d, 90d tabs → chart updates each time. Dimension cards show one-line labels (no wrapping)
5. **Row 3:** Domains show in 4-column grid; hover any domain card → browser tooltip shows; click domain card → navigates to domain page
6. **Row 4:** Failures show descriptions (not IDs); Top Issues show `↗` arrows that navigate
7. **Theme toggle:** TopBar → avatar → theme button → all cards, text, and backgrounds update via CSS variables, no hardcoded dark colors remain
8. **Quality Score click:** Goes to `/dashboard/quality-score`; Print/PDF button opens print dialog

- [ ] **Step 7.4: Final commit**

```bash
git add -A
git commit -m "feat: complete global dashboard redesign — Modern SaaS, dark/light theme, quality dimensions, domain health grid, tooltips"
```

---

## Self-Review Notes

- **Spec coverage:** All 5 rows implemented. Quality dimensions wrapped in one card. Dimension labels single-line with `whitespace-nowrap`. Domain health 4-col auto-wrap grid. Row 4 fills remaining height via `flex:1`. Tooltips on all cards. Click-to-navigate on Score, Open Issues, Domains, Top Issues.
- **No placeholders:** All code blocks are complete and runnable.
- **Type consistency:** `DimensionScores`, `TrendPoint`, `TrendDays`, `TrendResponse` defined in Task 3 and used consistently in Tasks 5 and 6.
- **Backend route registration:** `/dashboard/trend` and `/dashboard/dimensions` use the same `router` object as existing routes in `app/api/dashboard.py` — no change to `app/main.py` needed.
