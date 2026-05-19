# Domain Detail Page Redesign

**Date:** 2026-05-19  
**Branch:** worktree-dashboard-compact-redesign  
**Reference:** `/dashboard/global/` — do not modify

## Goal

Redesign `/dashboard/domains/[domainId]/PageClient.tsx` to match the global dashboard's compact, no-scroll design language. The current page uses hardcoded Tailwind `bg-white`/`text-gray-*` classes and a scrollable layout — it must be fully replaced with the CSS-variable-based, `h-screen` layout pattern from the global page.

## What Does Not Change

- `/dashboard/global/page.tsx` — reference page, untouched
- Backend routes other than the two additions listed below
- The `page.tsx` shell files (server components) for the domain route

---

## Layout Structure (5 rows, h-screen, no scroll)

```
┌─────────────────────────────────────────────────────────────┐
│ ROW 0 │ Status bar                                           │
├─────────────────────────────────────────────────────────────┤
│ ROW 1 │ Hero quality score card (1/3) │ 6 KPI chips (2/3)   │
├─────────────────────────────────────────────────────────────┤
│ ROW 2 │ Quality Trend + period picker │ Quality Dimensions   │
├─────────────────────────────────────────────────────────────┤
│ ROW 3 │ Subdomain Health tiles (horizontal)                  │
├─────────────────────────────────────────────────────────────┤
│ ROW 4 │ Recent Failures │ At-Risk Tables │ Top Issues        │
└─────────────────────────────────────────────────────────────┘
```

Root element: `<div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>`

---

## Dark / Light Theme

All colours use CSS variables defined in `globals.css` — the same set used by the global dashboard:

| Variable | Light | Dark |
|---|---|---|
| `--bg` | `#f0f4f8` | `#080d1a` |
| `--surface` | `#ffffff` | `#0d1526` |
| `--surface-sub` | `#f1f5f9` | `#111e33` |
| `--border` | `#dde4ef` | `rgba(99,102,241,0.13)` |
| `--text` | `#0f172a` | `#f1f5f9` |
| `--text-2` | `#334155` | `#cbd5e1` |
| `--text-3` | `#64748b` | `#94a3b8` |
| `--text-4` | `#94a3b8` | `#475569` |

The `card` style object reused across all panels:
```ts
const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
}
```

Quality dimension cards use the existing `dim-completeness`, `dim-freshness`, `dim-consistency`, `dim-accuracy`, `dim-bizrule` CSS classes (already have dark-mode variants in `globals.css`).

---

## Row 0 — Status Bar

Same pattern as global dashboard status bar:

- **Left**: health pill (green "All Systems Normal" / red "Issues Detected" based on `criticalFailures === 0`) + breadcrumb (`Domains › {domain_name}`) + "Updated {formatTime(lastRefreshed)}"
- **Right**: "View Logs" link (`/runs?domain_id={id}`), "Export CSV" anchor (download), "↻ Refresh" button (calls `loadAll(true)`)

---

## Row 1 — Hero Score + 6 KPI Chips

**Hero card (1/3 width):** Gradient green card identical to global. Shows `data.quality_score`. Clicking navigates to `/dashboard/quality-score` (same as global).

**KPI grid (2/3 width, 3×2):**

| Chip | Value | Colour |
|---|---|---|
| Subdomains | `data.subdomains.length` | neutral |
| Active Rules | `data.total_rules` | neutral |
| Passed Today | `data.passed_rules` | green |
| Failed Today | `data.failed_rules` | red |
| Critical | `data.critical_failures` | purple |
| At-Risk Subs | count of `data.subdomains` with `quality_score < 80` | orange |

---

## Row 2 — Quality Trend + Quality Dimensions

**Quality Trend (left panel):**
- Period tabs: 7d / 14d / 30d / 90d (state: `trendDays: 7 | 14 | 30 | 90`)
- On mount and when `trendDays` changes: call `dashboardApi.domainHistory(domainId, trendDays)` — endpoint already exists
- Renders `<QualityTrendChart>` with `area` prop, height 100

**Quality Dimensions (right panel):**
- Calls `dashboardApi.dimensions()` with `domain_id` query param (requires backend addition — see below)
- Renders 5 `dim-*` cards: Completeness / Freshness / Consistency / Accuracy / Business Rule
- Identical markup to global dashboard dimensions section

---

## Row 3 — Subdomain Health

Horizontal tile grid (`repeat(4, 1fr)`) matching the global "Domain Health" row:

- Each tile: `borderLeft: 3px solid {scoreColor(sub.quality_score)}` + name + rule count + score %
- At-risk subdomains (`score < 80`): red background tint + `⚠` suffix on name
- Links to `/dashboard/subdomains/{sub.subdomain_id}`
- "→ All subdomains" link (right side of section header)

---

## Row 4 — Bottom Tray (3 columns, flex-1)

**Column 1 — Recent Failures (1.6fr):**
- Fetched via `executionsApi.listRunsEnriched({ domain_id, status: 'failed', limit: 8 })`
- Same left-border + severity chip rendering as global

**Column 2 — Most At-Risk Tables (1fr):**
- From `data.at_risk_tables` (requires backend addition — see below)
- Progress bar per table, score colour-coded
- "✓ All tables healthy" empty state

**Column 3 — Top Issues (1.2fr):**
- Derived from `data.sla_breaches` (to be added to domain endpoint) and `recentFailures` critical entries
- Same coloured card rendering as global

---

## Backend Changes (2 additions, fully additive)

### 1. `GET /dashboard/dimensions` — add optional `domain_id` query param

```python
@router.get("/dimensions")
async def quality_dimensions(
    domain_id: str | None = Query(None),   # ← add this
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    domain_scope = domain_id or get_domain_filter(user)
    # rest of function unchanged
```

Update `apiClient.ts`:
```ts
dimensions: (params?: { domain_id?: string }) => api.get('/dashboard/dimensions', { params }),
```

### 2. `GET /dashboard/domains/{domain_id}` — add `at_risk_tables` and `sla_breaches` to response

In `domain_dashboard()`, call the existing helpers and include in the return dict:
```python
at_risk_tables = await _get_at_risk_tables(db, domain_scope=domain_id)
sla_breaches   = await _get_sla_breaches(db, domain_scope=domain_id)

return {
    ...existing fields...,
    "at_risk_tables": at_risk_tables,
    "sla_breaches":   sla_breaches,
}
```

---

## Data Loading

```ts
const loadAll = useCallback(async (isRefresh = false) => {
  // Promise.allSettled of:
  // 1. dashboardApi.domain(domainId)         → setData
  // 2. executionsApi.listRunsEnriched(...)   → setRecentFailures
  // 3. dashboardApi.dimensions({ domain_id }) → setDimensions  ← new
}, [domainId])

const loadTrend = useCallback(async () => {
  // dashboardApi.domainHistory(domainId, trendDays) → setTrendData
}, [domainId, trendDays])
```

Auto-refresh every 5 minutes (same as global).

---

## Loading / Error States

- Loading skeleton: same `animate-pulse` bars with `var(--surface)` background as global
- Error: red tinted box using `rgba(239,68,68,0.08)` border/background with CSS variable colours (not hardcoded `bg-red-50`)

---

## Scope

Only `PageClient.tsx` (domain detail) is changed. The subdomain page, tables page, and all other pages are out of scope for this task.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/app/dashboard/domains/[domainId]/PageClient.tsx` | Full rewrite |
| `app/api/dashboard.py` | Add `domain_id` param to `/dimensions`; add `at_risk_tables` + `sla_breaches` to domain endpoint |
| `frontend/src/services/apiClient.ts` | Update `dimensions()` to accept optional `{ domain_id }` param |
