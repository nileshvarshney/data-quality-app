# Sidebar Enterprise Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the left sidebar to match the approved "Slate Structured" enterprise design — plain white header, divider-line section groups, indigo active pill with right-edge bar, merged footer card, and fixed dark-mode contrast.

**Architecture:** Two files only — `globals.css` for new CSS tokens, `Sidebar.tsx` for JSX/className changes. Zero logic changes: collapse, compact, badges, auth, and dark-mode toggle are untouched.

**Tech Stack:** Next.js 15, Tailwind CSS v3, CSS custom properties, `clsx`

---

### Task 1: Add new CSS variables and fix dark-mode tokens

**Files:**
- Modify: `frontend/src/app/globals.css:21-54`

- [ ] **Replace light-mode sidebar block (lines 21–29) with:**

```css
  /* Sidebar – light mode */
  --sidebar-bg:            #f8fafc;
  --sidebar-border:        #e2e8f0;
  --sidebar-header-bg:     #ffffff;
  --sidebar-header-border: #f1f5f9;
  --sidebar-divider:       #e2e8f0;
  --sidebar-footer-bg:     #ffffff;
  --sidebar-card-bg:       #f8fafc;
  --sidebar-card-border:   #f1f5f9;
  --sidebar-text:          #0f172a;
  --sidebar-muted:         #64748b;
  --sidebar-subtle:        #94a3b8;
  --sidebar-hover:         #f1f5f9;
  --sidebar-active-bg:     #e0e7ff;
  --sidebar-active-text:   #3730a3;
  --sidebar-active-bar:    #4f46e5;
```

- [ ] **Replace dark-mode sidebar block (lines 46–54) with:**

```css
  /* Sidebar – dark mode */
  --sidebar-bg:            #0f1117;
  --sidebar-border:        #1e2235;
  --sidebar-header-bg:     #141824;
  --sidebar-header-border: #1e2235;
  --sidebar-divider:       #1e2235;
  --sidebar-footer-bg:     #141824;
  --sidebar-card-bg:       rgba(255, 255, 255, 0.03);
  --sidebar-card-border:   #1e2235;
  --sidebar-text:          #e2e8f0;
  --sidebar-muted:         #9ca3af;
  --sidebar-subtle:        #4b5563;
  --sidebar-hover:         rgba(255, 255, 255, 0.04);
  --sidebar-active-bg:     rgba(99, 102, 241, 0.20);
  --sidebar-active-text:   #a5b4fc;
  --sidebar-active-bar:    #818cf8;
```

- [ ] **Verify:** run `grep -n "sidebar-active-bar\|sidebar-card\|sidebar-header\|sidebar-divider\|sidebar-footer" frontend/src/app/globals.css` — should list all 6 new variables in both `:root` and `html.dark` blocks.

- [ ] **Commit:**
```bash
git add frontend/src/app/globals.css
git commit -m "style: add enterprise sidebar CSS tokens and fix dark-mode contrast"
```

---

### Task 2: Redesign brand header (expanded state)

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx:274-358`

The expanded header currently has: gradient stripe, `pt-5 pb-4` padding, `w-10 h-10` logo, `text-[15px]` wordmark, alert pill row, then search bar. Replace the entire `<aside>` header `<div>` (the `shrink-0 relative overflow-hidden` block) with the code below.

- [ ] **Replace the entire brand header block** — from the comment `{/* ── Brand header ── */}` through the closing `</div>` that wraps both compact and expanded states — with:

```tsx
{/* ── Brand header ── */}
<div
  className="shrink-0"
  style={{ background: 'var(--sidebar-header-bg)', borderBottom: '1px solid var(--sidebar-header-border)' }}
>
  {compact ? (
    /* ── Compact: centred logo + expand button ── */
    <div className="flex flex-col items-center gap-2 py-4">
      <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#0f172a]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon.svg" alt="DG" width={32} height={32} className="w-full h-full" />
      </div>
      <button
        onClick={toggleCompact}
        title="Expand sidebar"
        className="p-1.5 rounded-lg transition-colors [color:var(--sidebar-subtle)] hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]"
      >
        <PanelLeftOpen size={14} />
      </button>
    </div>
  ) : (
    /* ── Expanded: full brand block ── */
    <div className="px-3.5 pt-3.5 pb-3">

      {/* Row 1: logo + wordmark + collapse */}
      <div className="flex items-center gap-2.5">
        <Link href="/dashboard/global" className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="shrink-0 w-8 h-8 rounded-lg overflow-hidden bg-[#0f172a] flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-icon.svg"
              alt="DataGuardian"
              width={32} height={32}
              className="w-full h-full"
              style={{ imageRendering: 'crisp-edges' }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-extrabold leading-tight tracking-[-0.3px] whitespace-nowrap">
              <span style={{ color: 'var(--sidebar-text)' }}>Data</span>
              <span style={{ color: '#F59E0B' }}>Guardian</span>
            </p>
            <p className="text-[9px] font-medium mt-0.5 tracking-[.05em] uppercase truncate"
               style={{ color: 'var(--sidebar-subtle)' }}>
              Data Quality &amp; Governance
            </p>
          </div>
        </Link>
        <button
          onClick={toggleCompact}
          title="Collapse sidebar"
          className="shrink-0 p-1 rounded-md transition-colors [color:var(--sidebar-subtle)] hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]"
        >
          <PanelLeftClose size={13} />
        </button>
      </div>

      {/* Row 2: quick search */}
      <button
        onClick={() => window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
        )}
        className="mt-2.5 w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10.5px] transition-colors border [background-color:var(--sidebar-hover)] [border-color:var(--sidebar-divider)] [color:var(--sidebar-subtle)] hover:[color:var(--sidebar-text)]"
      >
        <Search size={11} />
        <span className="flex-1 text-left">Quick search…</span>
        <kbd className="text-[9px] font-mono border px-1 py-0.5 rounded opacity-50 [background-color:var(--sidebar-header-bg)] [border-color:var(--sidebar-divider)]">⌘K</kbd>
      </button>

      {/* Row 3: version + live alert dot */}
      <div className="flex items-center mt-2 px-0.5">
        <span className="text-[9px] opacity-50" style={{ color: 'var(--sidebar-subtle)' }}>v0.1</span>
        {totalBadges > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[9px] font-bold text-red-500">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            {totalBadges} active
          </span>
        )}
      </div>

    </div>
  )}
</div>
```

- [ ] **Type-check:** `cd frontend && npm run type-check` — expect no errors.

- [ ] **Commit:**
```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "style: redesign sidebar brand header — plain white, smaller logo, search in header"
```

---

### Task 3: Redesign section headers

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx` — the `{!compact ? (<button …>) : (…)}` section header block (currently around line 381–403)

The current section header is a `button` with a section icon, uppercase label, chevron. Replace with: label text + flex-1 horizontal rule + chevron. Remove the `SectionIcon` entirely from the header button. The `isCollapsed` state drives `opacity-60` on the whole row.

- [ ] **Replace the `{!compact ? (` section header block** with:

```tsx
{!compact ? (
  <button
    onClick={() => toggleSection(section.id)}
    className={clsx(
      'w-full flex items-center gap-2 px-3.5 pt-2.5 pb-1 transition-opacity',
      isCollapsed && 'opacity-60'
    )}
  >
    <span
      className="text-[9.5px] font-bold tracking-[.08em] uppercase shrink-0"
      style={{ color: 'var(--sidebar-subtle)' }}
    >
      {section.label}
    </span>
    <span className="flex-1 h-px" style={{ background: 'var(--sidebar-divider)' }} />
    {sectionBadge > 0 && (
      <span className="text-[9px] font-bold px-1.5 h-4 flex items-center rounded-full bg-red-500 text-white ml-1">
        {sectionBadge}
      </span>
    )}
    <ChevronDown
      size={10}
      className={clsx('shrink-0 ml-0.5 transition-transform duration-200', isCollapsed && '-rotate-90')}
      style={{ color: 'var(--sidebar-subtle)', opacity: 0.5 }}
    />
  </button>
) : (
  /* Compact: thin divider between sections */
  <div className="my-1 mx-2 h-px" style={{ backgroundColor: 'var(--sidebar-border)' }} />
)}
```

- [ ] Also update the `mb-0.5` wrapper `<div>` that wraps each section — change it to `mb-0` (sections now use their own top-padding for spacing):

```tsx
<div key={section.id} className={clsx(compact && 'px-1')}>
```

- [ ] **Type-check:** `npm run type-check` — no errors.

- [ ] **Commit:**
```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "style: sidebar section headers — divider-line style, opacity on collapse"
```

---

### Task 4: Redesign nav items

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx` — the `itemCls` / `inner` block (currently around lines 413–444)

Changes: `text-[13px]` → `text-[11.5px]`, icon in fixed 14px slot, `rounded-[7px]`, active state gets right-edge bar instead of left glow, remove `ChevronRight` on active.

- [ ] **Replace the `const itemCls` and `const inner` definitions** with:

```tsx
const itemCls = clsx(
  'flex items-center gap-2 rounded-[7px] text-[11.5px] transition-all cursor-pointer',
  compact ? 'justify-center p-2 mx-auto' : 'px-2.5 py-1.5 mx-1',
  active
    ? '[background-color:var(--sidebar-active-bg)] [color:var(--sidebar-active-text)] font-semibold'
    : '[color:var(--sidebar-muted)] hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]'
)

const inner = (
  <>
    {/* Fixed-width icon slot — keeps all labels left-aligned */}
    <span className="w-[14px] flex items-center justify-center shrink-0">
      <Icon size={13} />
    </span>
    {!compact && (
      <>
        <span className="flex-1 truncate">{label}</span>
        {badgeCount > 0 && (
          <span className="text-[9px] font-bold min-w-[16px] h-[16px] flex items-center justify-center rounded-full px-1 bg-red-500 text-white">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
        {active && (
          <span
            className="w-[3px] h-4 rounded-full shrink-0"
            style={{ background: 'var(--sidebar-active-bar)' }}
          />
        )}
      </>
    )}
    {compact && badgeCount > 0 && (
      <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500" />
    )}
  </>
)
```

- [ ] **Tighten item spacing** — find `'space-y-0.5'` in the items container and change to `'space-y-px'`:

```tsx
<div className={clsx('space-y-px', !compact && 'mt-0.5')}>
```

- [ ] **Type-check:** `npm run type-check` — no errors.

- [ ] **Commit:**
```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "style: sidebar nav items — 11.5px font, fixed icon slot, indigo right-bar active state"
```

---

### Task 5: Redesign footer

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx:474-550` — the entire `{/* ── Footer ── */}` block

The dark/light toggle row is removed as a standalone row. Instead it's merged into the user card as a small icon button alongside logout. The user card gains a visible border. Version line shrinks to `8.5px` and fades to near-invisible.

- [ ] **Replace the entire footer `<div>` block** (from `{/* ── Footer ── */}` to the closing `</div>` before `</aside>`) with:

```tsx
{/* ── Footer ── */}
<div
  className="shrink-0 px-2 pb-2.5 pt-2 space-y-1.5"
  style={{ borderTop: '1px solid var(--sidebar-header-border)', background: 'var(--sidebar-footer-bg)' }}
>
  {/* User profile card with actions */}
  {user && (
    <div className={clsx(
      'rounded-lg transition-colors border',
      '[background-color:var(--sidebar-card-bg)] [border-color:var(--sidebar-card-border)]',
      compact ? 'flex justify-center p-2' : 'flex items-center gap-2 p-1.5'
    )}>
      {/* Avatar */}
      <div className={clsx(
        `bg-gradient-to-br ${avatarGradient}`,
        'rounded-[7px] flex items-center justify-center text-white font-bold shrink-0 w-7 h-7 text-[10px]'
      )}>
        {initials}
      </div>

      {!compact && (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold truncate leading-tight"
               style={{ color: 'var(--sidebar-text)' }}>
              {user.full_name}
            </p>
            {roleConfig && (
              <span className={clsx(
                'inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-[3px] mt-0.5',
                roleConfig.color
              )}>
                {roleConfig.label}
              </span>
            )}
          </div>

          {/* Theme toggle + logout grouped */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={toggle}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              className="w-6 h-6 flex items-center justify-center rounded-md transition-colors [color:var(--sidebar-subtle)] hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]"
            >
              {theme === 'light'
                ? <Moon size={13} className="text-indigo-400" />
                : <Sun  size={13} className="text-yellow-400" />}
            </button>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="w-6 h-6 flex items-center justify-center rounded-md transition-colors [color:var(--sidebar-subtle)] hover:text-red-500 hover:[background-color:var(--sidebar-hover)]"
            >
              <LogOut size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  )}

  {/* Compact: standalone theme toggle */}
  {compact && (
    <button
      onClick={toggle}
      title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      className="w-full flex justify-center p-2 rounded-lg transition-colors [color:var(--sidebar-subtle)] hover:[background-color:var(--sidebar-hover)] hover:[color:var(--sidebar-text)]"
    >
      {theme === 'light'
        ? <Moon size={14} className="text-indigo-400" />
        : <Sun  size={14} className="text-yellow-400" />}
    </button>
  )}

  {/* Version line — very muted */}
  {!compact && (
    <p
      className="text-[8.5px] px-1 flex items-center gap-1.5"
      style={{ color: 'var(--sidebar-subtle)', opacity: 0.55 }}
    >
      <Zap size={8} />
      DataGuardian v0.1
      <span className="ml-auto">Decision Minds © 2026</span>
    </p>
  )}
</div>
```

- [ ] **Type-check:** `npm run type-check` — no errors.

- [ ] **Commit:**
```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "style: sidebar footer — merged theme toggle into user card, muted version line"
```

---

### Task 6: Visual verification in browser

- [ ] Confirm dev server is running on port 3000 (`lsof -i :3000`); if not, run `cd frontend && npm run dev`.

- [ ] Open `http://localhost:3000/dashboard/global` — check light mode:
  - Header: plain white, dark logo box, `13px` wordmark, search bar in header
  - Section headers: small uppercase label + horizontal rule, chevron
  - Active item: indigo tinted background + 3px right bar, no left glow
  - Footer: user card with border, moon + logout icons side-by-side

- [ ] Toggle dark mode (moon icon in footer) — verify:
  - Nav items readable (`#9ca3af` on `#0f1117` — strong contrast)
  - Section labels visible (`#4b5563`)
  - Active item indigo glow variant

- [ ] Click a section header — verify it collapses (opacity drops, chevron rotates).

- [ ] Click the collapse button — verify compact mode: icons only, 56px wide.

- [ ] **Final commit:**
```bash
git add frontend/src/components/layout/Sidebar.tsx frontend/src/app/globals.css
git commit -m "style: enterprise sidebar redesign — slate structured, verified light+dark+compact"
```
