# YouTube-Style Navigation Redesign

**Date:** 2026-05-18  
**Status:** Approved

---

## Context

The current layout has a single left sidebar (260px) that contains the logo, navigation sections, and a user profile footer — with no top bar. The goal is to redesign navigation to match YouTube's layout pattern: a fixed top bar across the full width, a compact 64px icon-only sidebar, and per-section flyout panels that open next to the sidebar when an icon is clicked.

---

## Final Design

### Top Bar (fixed, 52px tall)

A new full-width `TopBar` component, fixed at the top of every page.

| Zone | Content |
|---|---|
| Left | Hamburger icon (`Menu` from lucide-react) → DataGuardian shield logo → "DataGuardian" wordmark |
| Center | Pill-shaped search bar with search icon + `⌘K` badge (opens existing CommandPalette) |
| Right | Notification bell (with red dot badge for open alerts) → Settings gear icon → User avatar circle (with dropdown for theme toggle + logout) |

The hamburger in the top bar opens/closes the last-used flyout panel (or the first section's flyout if none was previously open).

---

### Icon Sidebar (64px, fixed left, below top bar)

A 64px wide vertical strip replacing the current full sidebar.

- **Buttons:** 48×48px, `border-radius: 12px` — YouTube mini-guide style, icons only, no labels
- **Active state:** Highlighted button background, no border bar
- **One icon per section group** (8 total):

| Icon | Section |
|---|---|
| Globe | Overview |
| Shield | Data Quality |
| Bell | Operations |
| Search | Data Catalog |
| FileText | Governance |
| Lock | Privacy & Compliance |
| Monitor | AI Intelligence |
| Settings | Administration |
| HelpCircle | Support |

- Support is a standalone icon at the bottom of the sidebar (pinned with `margin-top: auto`), same 48×48px button style
- Admin section only visible to admin-role users (existing RBAC logic unchanged)

**Theme tokens:**

| Token | Dark | Light |
|---|---|---|
| Sidebar bg | `#0f1117` | `#f8fafc` |
| Sidebar border | `#1e293b` | `#e2e8f0` |
| Active button bg | `rgba(99,102,241,0.20)` | `#e0e7ff` |
| Active icon color | `#a5b4fc` | `#3730a3` |
| Inactive icon color | `#334155` | `#cbd5e1` |

---

### Section Flyout Panel (180px, inline, no scrollbar)

When a sidebar icon is clicked, a 180px flyout panel appears **immediately to the right of the sidebar as an overlay** (`position: absolute`, `left: 64px`, `z-index: 15`). The main content area is never pushed — `margin-left` stays at `64px` always.

- **Header:** Section name + section icon
- **Items:** All sub-pages for that section as rows — icon + label + optional badge count
- **Active item bg:** `rgba(99,102,241,0.20)` (dark) / `#e0e7ff` (light), `border-radius: 10px`
- **No scrollbar:** All items must fit without overflow (max ~10 items per section — confirmed by current nav inventory)
- **Dismiss:** Click same icon again, click any nav item (auto-closes after navigation), or click outside the panel area

**Flyout token:**

| Token | Dark | Light |
|---|---|---|
| Panel bg | `#141824` | `#ffffff` |
| Panel border | `#1e293b` | `#e2e8f0` |
| Header border | `#1e293b` | `#e2e8f0` |

---

### Layout Grid

```
┌─────────────────────────────────────────────────────┐
│  TopBar (fixed, h=52px, full width, z-index: 30)    │
├──────┬──────────┬──────────────────────────────────┐
│  64px│  180px   │  main content                    │
│ icon │  flyout  │  (margin-left adjusts with CSS   │
│ side │  panel   │   transition)                    │
│ bar  │ (when    │                                  │
│      │  open)   │                                  │
└──────┴──────────┴──────────────────────────────────┘
```

- Main content `padding-top: 52px` to clear the fixed top bar
- Main content `margin-left: 64px` — **fixed always**, never changes when flyout opens/closes
- Flyout panel: `position: absolute`, `top: 0`, `left: 64px`, `z-index: 15`, `height: 100%`

---

## Files to Create / Modify

| File | Change |
|---|---|
| `frontend/src/components/layout/TopBar.tsx` | **Create** — new top bar component |
| `frontend/src/components/layout/Sidebar.tsx` | **Rewrite** — replace current sidebar with 64px icon strip + flyout panel |
| `frontend/src/components/layout/ClientLayout.tsx` | **Update** — add TopBar, update margin-left logic for flyout state |
| `frontend/src/app/globals.css` | **Update** — new CSS variables and layout rules for top bar + flyout |

---

## Reused Patterns

- `CommandPalette` — search bar in top bar triggers existing `⌘K` palette (`components/layout/CommandPalette.tsx`)
- `AIChatBot` — stays unchanged, still rendered in `ClientLayout`
- Badge polling logic (alerts, rules, incidents) — move from `Sidebar.tsx` to `TopBar.tsx` (notification bell) and flyout items
- `dq-theme` localStorage — unchanged, theme toggle moves from sidebar footer to TopBar user menu
- `dg-sidebar-compact` localStorage key — repurpose to store the last-opened section ID (string | null); `null` means flyout is closed

---

## Behaviour Rules

1. Click icon → flyout for that section opens; previously open flyout closes
2. Click same icon → flyout closes
3. Navigate to any page (click a flyout item) → flyout closes immediately
4. **Mouse leaves the sidebar + flyout area (`mouseleave` on the combined zone) → flyout closes** — this is the primary dismiss mechanism; no need to click elsewhere
5. Click outside sidebar + flyout → flyout closes
6. Active section icon always highlighted (based on current route)
7. Active nav item in flyout highlighted (based on current route)
8. Badge counts (alerts=red, pending rules=indigo) shown on flyout items and notification bell
9. Hamburger in top bar: opens flyout for active section (or Overview if none active)

> **Implementation note for rule 4:** Wrap the sidebar + flyout in a single container div and attach `onMouseLeave` to that container. Add a short delay (~150ms) before closing so the flyout does not flicker when the cursor briefly passes between the sidebar and the panel.

---

## Verification

1. `npm run type-check` — no TypeScript errors
2. `npm run dev` — open http://localhost:3000
3. Verify top bar renders in both dark and light themes
4. Click each section icon — confirm flyout opens with correct items and no scrollbar
5. Navigate to a page — confirm flyout closes
6. Click outside — confirm flyout closes
7. Check notification badge updates every 90s
8. Verify admin section only visible to admin users
9. Confirm `⌘K` search opens CommandPalette from top bar
