# Global Dashboard Redesign — Design Spec

**Date:** 2026-05-19  
**Branch:** worktree-dashboard-compact-redesign  
**Status:** Approved

---

## Context

The current global dashboard (`frontend/src/app/dashboard/global/page.tsx`) is hardcoded with dark-only Tailwind classes (`bg-gray-950`, `bg-gray-900`, `text-gray-100`, etc.). It does not use the CSS variable system defined in `globals.css` and `ThemeProvider.tsx`, so it ignores the user's light/dark theme preference and looks disconnected from the sidebar.

This redesign replaces the entire page with a Modern SaaS layout that:
- Fully supports both light and dark themes using existing CSS variables
- Introduces richer KPI coverage (quality dimensions, open issues, anomalies)
- Matches the sidebar's visual language (indigo accents, surface variables, rounded cards)
- Navigates to detail pages on card click where appropriate
- Shows drill-down tooltips on all cards

---

## Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Theme system | CSS variables (`var(--bg)`, `var(--surface)`, `var(--text)`) | Sidebar already uses this — zero new infrastructure |
| Dark mode toggle | Existing `ThemeProvider` + `html.dark` class | Already works for sidebar and TopBar |
| Layout | Hero Score + Grid (no scroll) | Best balance of density and visual hierarchy |
| Style | Modern SaaS — white cards, soft shadows, rounded corners | Chosen over Enterprise Compact and Monitoring Console |
| Scrolling | `h-screen overflow-hidden`, `flex:1` for bottom row | Everything visible at a glance |

---

## Layout — 5 Rows (no scroll)

```
┌─────────────────────────────────────────────────────────┐  Row 0
│  Status pill · Updated timestamp          Quick actions  │  (shrink-0)
├──────────────┬──────────────────────────────────────────┤  Row 1
│              │  Domains  Tables   Passed               │  (shrink-0)
│ Quality Score│─────────────────────────────────────────│
│  (1/3 width) │  Failed  OpenIssues  Anomalies          │
├──────────────┴──────────────────────────────────────────┤
│              │  ┌─────────────────────────────────────┐│  Row 2
│ Quality Trend│  │ Quality Dimensions (wrapper card)   ││  (shrink-0,
│  [7d 14d 30d │  │  Complete  Fresh  Consist  Acc  Biz ││  min-height)
│   90d tabs]  │  └─────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤  Row 3
│  Domain Health  (4-col grid, auto-wraps at 5th, 9th…)  │  (shrink-0)
├──────────────────┬──────────────┬───────────────────────┤  Row 4
│ Recent Failures  │ At-Risk      │ Top Issues            │  (flex:1,
│ (descriptions)   │ Tables       │ (descriptions)        │  fills rest)
└──────────────────┴──────────────┴───────────────────────┘
```

---

## Row-by-Row Specification

### Row 0 — Status Bar
- **Left:** Live status pill (green `●` All Systems Normal / red `●` Issues Detected) + "Updated N min ago" timestamp
- **Right:** View Runs · Alerts · Export CSV · ↻ Refresh buttons
- **Height:** Auto / shrink-0

### Row 1 — Hero Score + KPI Chips
- **Grid:** `1fr 2fr` (score = 1/3, chips = 2/3)
- **Quality Score card:**
  - Green gradient background (`linear-gradient` using green palette)
  - Large score number (`text-5xl font-black`)
  - Delta badge (↑/↓ vs yesterday)
  - "↗ Detail · Report" badge in top-right corner
  - **Click:** Navigates to `/dashboard/quality-score` detail page with report generation (PDF, Excel, CSV)
  - **Tooltip:** "Click to view detailed quality scorecard and generate report"
- **6 KPI chips** (3-col × 2-row grid inside the 2/3):
  | Chip | Color | Tooltip | Navigate |
  |---|---|---|---|
  | Domains | Neutral | List of domain names | No |
  | Tables | Neutral | Count per domain | No |
  | Passed | Green tint | Pass rate % | No |
  | Failed | Red tint | Rule names that failed | No |
  | Open Issues | Orange tint + ↗ | Breakdown by type | Yes → `/alerts` |
  | Anomalies | Purple tint + ⓘ | ML-detected anomaly summaries | No (tooltip only) |
  - All chips: number centered, large (`text-2xl font-black`), sub-label below
  - Dark mode: tinted backgrounds using dark palette equivalents

### Row 2 — Quality Trend + Quality Dimensions
- **Grid:** `1fr 1.2fr`; `min-height: ~130px`
- **Quality Trend card:**
  - Time range tab strip: **7d · 14d · 30d · 90d** (active tab = indigo, inactive = muted)
  - Bar chart using `QualityTrendChart` component (already exists in codebase)
  - Fetches fresh data when tab changes (pass `days` param to API)
  - **Tooltip:** Hover bars shows exact score for that day
- **Quality Dimensions wrapper card:**
  - Single card with title "Quality Dimensions"
  - Contains 5 equal-height sub-cards in a `5-col` inner grid:
    | Dimension | Icon | Score source |
    |---|---|---|
    | Completeness | 📋 | % fields with non-null values |
    | Freshness | ⏱ | % tables updated within SLA |
    | Consistency | 🔗 | % passing referential integrity checks |
    | Accuracy | 🎯 | % passing range/format checks |
    | Business Rule | 📐 | % passing business rule checks |
  - Each sub-card: icon, label (single line, `white-space:nowrap`), score, delta
  - **Tooltip:** Rich drill-down text (worst table, affected row count)
  - Score color: green ≥95%, yellow ≥80%, orange ≥60%, red <60%
  - **Data:** Computed from existing rule execution results grouped by rule type

### Row 3 — Domain Health
- **Wrapper:** Single white card with title + "→ All domains" link
- **Inner grid:** `repeat(4, 1fr)` — auto-wraps (4 per row, 8 = 2 rows, 9 = new row starts)
- **Each domain card:**
  - Color-coded left border (green/yellow/orange/red by score)
  - Domain name + sub-domain count + rule count
  - Score on right (`text-sm font-black`, score-colored)
  - `↗` nav arrow in top-right corner
  - **Click:** Navigates to `/dashboard/domains/:domain_id`
  - **Tooltip:** Lists all sub-domains with their individual scores, flags SLA breaches
  - At-risk domains (score < 80% or SLA breach): red border + red background tint + `⚠` in name
- **Data source:** `dashboardApi.domains()` — already available

### Row 4 — Bottom Tray (flex:1, fills remaining height)
- **Grid:** `1.6fr 1fr 1.2fr`; `flex:1; min-height:0`; all cards use `overflow:hidden`

#### Recent Failures (`1.6fr`)
- **Header:** "Recent Failures" + "View all →" link to `/runs?status=failed`
- **Items:** Each failure shows:
  - Colored left border (red=critical, amber=high, slate=medium/low)
  - **Description in plain English** (not rule ID) — e.g. "3% of customer_id values are null in Finance transactions table"
  - Severity badge + domain + relative time ("5m ago")
  - **Tooltip:** Rule name, table name, affected row count, assignee
- **Data source:** `executionsApi.listRunsEnriched({ status: 'failed', limit: 8 })` — already exists

#### Most At-Risk Tables (`1fr`)
- **Items:** Table name, score, delta arrow, progress bar, domain + weekly trend
- **Bar color:** score-colored (red/amber/orange)
- **Tooltip:** Failing rule names, trend delta, domain context
- **Data source:** `global.at_risk_tables` from `dashboardApi.global()`

#### Top Issues (`1.2fr`)
- **Items:** 3 priority issues as colored alert cards (red/amber/purple)
- **Content:** Plain-English title + detail line (no IDs)
- **`↗` arrow:** Click navigates to relevant page (domain detail, alert, or anomaly)
- **Tooltip:** Full issue context before clicking
- **Data source:** Composed client-side from three existing API fields:
  1. `global.sla_breaches` → SLA breach issues (red)
  2. `recentFailures` (critical/high severity) → failure issues (amber)
  3. `global.critical_failures > 0` or anomaly count → anomaly issues (purple)
  - Prioritised: SLA breaches first, then critical failures, then anomalies — top 3 shown

---

## Theme Implementation

**No new theme infrastructure needed.** Use existing CSS variables throughout:

| Element | Light (`var(...)`) | Dark (`html.dark var(...)`) |
|---|---|---|
| Page background | `--bg` (#f0f4f8) | `--bg` (#080d1a) |
| Card background | `--surface` (#ffffff) | `--surface` (#0d1526) |
| Card sub-background | `--surface-sub` (#f1f5f9) | `--surface-sub` (#111e33) |
| Primary text | `--text` (#0f172a) | `--text` (#f1f5f9) |
| Secondary text | `--text-2` (#334155) | `--text-2` (#cbd5e1) |
| Muted text | `--text-3` (#64748b) | `--text-3` (#94a3b8) |
| Card border | `#e2e8f0` (Tailwind `border-slate-200`) | `#1e293b` (Tailwind `dark:border-slate-800`) |
| Indigo accent | `#6366f1` / `--sidebar-active-text` | `#818cf8` |

Status/score colors remain semantic and don't need variables (green/amber/orange/red are consistent across themes).

**Dark mode score card backgrounds:** Use dark tinted equivalents:
- Green score card: `#052e16` bg, `#15803d` border
- Red chip: `#1a0a0a` bg, `#7f1d1d` border
- Orange chip: `#1c0f00` bg, `#78350f` border
- Purple chip: `#1a0d2e` bg, `#4c1d95` border

---

## Interactions & Navigation

| Card / Element | Hover | Click |
|---|---|---|
| Quality Score | Tooltip: "Click to view scorecard + generate report" | `/dashboard/quality-score` (new page — detail + PDF/Excel/CSV export) |
| Open Issues chip | Tooltip: breakdown by type | `/alerts` |
| Anomalies chip | Tooltip: ML anomaly summaries | — |
| Quality Trend bars | Tooltip: exact score for that day | — |
| Dimension sub-cards | Tooltip: worst table + affected count | — |
| Domain Health cards | Tooltip: all sub-domains + scores | `/dashboard/domains/:id` |
| Recent Failure items | Tooltip: rule name, table, row count | — |
| At-Risk table items | Tooltip: failing rules, trend | — |
| Top Issue cards | Tooltip: full context | Relevant page (domain / alert / anomaly) |

---

## Files to Modify / Create

| File | Action |
|---|---|
| `frontend/src/app/dashboard/global/page.tsx` | **Full rewrite** — replace hardcoded dark classes with CSS variables + new layout |
| `frontend/src/app/globals.css` | **Possibly extend** — add any missing CSS variables for tinted chip backgrounds |
| `frontend/src/components/charts/QualityTrendChart.tsx` | **Extend** — accept `days: 7 | 14 | 30 | 90` prop; fetch data on tab change |
| `frontend/src/app/dashboard/quality-score/page.tsx` | **Create** — new detail page (quality score breakdown + report generation) |
| `frontend/src/services/apiClient.ts` | **Extend if needed** — add `days` query param to quality trend endpoint |

---

## Quality Dimensions — Data Strategy

The 5 dimensions are derived from existing rule execution data grouped by rule type:

| Dimension | Rule types to aggregate |
|---|---|
| Completeness | `null_check`, `not_null`, `completeness` |
| Freshness | `freshness`, `timeliness` |
| Consistency | `referential_integrity`, `uniqueness`, `consistency` |
| Accuracy | `range_check`, `format_check`, `accuracy` |
| Business Rule | `business_rule`, `custom_sql`, `threshold` |

Score = `passed / total` for rules of each type across all domains.  
Backend endpoint: either extend `/dashboard/global` response or add `/dashboard/dimensions` route.

---

## Verification

1. **Theme switching:** Toggle dark/light via TopBar → all cards, text, borders, and backgrounds switch using CSS variables with zero hardcoded overrides
2. **No scroll:** At 1080p (and larger), no vertical scrollbar appears — Row 4 fills remaining space via `flex:1`
3. **Domain auto-wrap:** Add a 9th domain in test data → it appears on a new row without layout breakage
4. **Time range tabs:** Clicking 7d/14d/30d/90d on Quality Trend re-fetches and re-renders chart data
5. **Tooltips:** Hover each card type to confirm tooltip text appears with correct drill-down data
6. **Navigation:** Click Quality Score → lands on `/dashboard/quality-score`; click any domain card → lands on correct domain detail page; click Top Issue `↗` → lands on correct page
7. **Type check:** `npm run type-check` passes with zero errors
8. **Responsive:** Verify at 1280px, 1440px, 1920px widths — layout should hold without overflow
