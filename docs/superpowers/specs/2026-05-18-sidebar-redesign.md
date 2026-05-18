# Sidebar Redesign — Enterprise Grade

**Date:** 2026-05-18  
**Status:** Approved  
**File:** `frontend/src/components/layout/Sidebar.tsx`

## Goal

Elevate the left navigation panel to enterprise-grade quality. The current sidebar has inconsistent font sizing, heavy section headers, and lacks visual hierarchy. The new design follows the "Slate Structured" direction: slate body, divider-line section groups, indigo active pill, and clean white footer.

## Approved Design

Direction **C — Slate Structured**, confirmed by user. Light and dark mode both approved.

---

## Changes by Area

### 1. Brand Header

- Background: `#ffffff` (plain white, no gradient)
- Logo mark: `32×32` dark (`#0f172a`) rounded square with white "D" initials
- Wordmark: `13px / font-weight-800`, `Data` in `#0f172a`, `Guardian` in `#f59e0b`
- Subtitle: `9px / font-weight-500`, `#94a3b8`, letter-spacing `.05em`, uppercase: `DATA QUALITY & GOVERNANCE`
- Collapse button: right-aligned, `#94a3b8`, 18×18 hit area
- Quick search bar sits inside the header block, `#f8fafc` background, `1px #e2e8f0` border, `7px` radius
- Version + alert row: `9px`, version `#cbd5e1`, alert badge red `#ef4444` with pulsing dot
- Header bottom border: `1px solid #f1f5f9`

### 2. Section Headers

Each section header is a full-width click target that collapses/expands the section.

- Label: `9.5px / font-weight-700`, `#94a3b8`, `letter-spacing: .08em`, uppercase
- Followed immediately by a full-width `1px` horizontal rule `#e2e8f0`
- Chevron: `▾` expanded / `▸` collapsed, `#cbd5e1`, right-aligned
- Collapsed sections: entire header row at `opacity: 0.6`
- Padding: `10px 14px 3px` top, `3px` bottom

### 3. Nav Items

- Font: `11.5px / font-weight-normal`, color `#64748b` (default), `#3730a3 font-weight-600` (active)
- Icon: fixed `14px` wide slot (`text-align: center`), `12px` icon size — ensures all labels align regardless of icon width
- Active state: `background #e0e7ff`, text `#3730a3 font-weight-600`, `3px wide × 16px tall #4f46e5` right-edge bar
- Hover state: `background #f1f5f9`, text `#0f172a`
- Border radius: `7px` on each item
- Padding per item: `7px 10px`
- Margin between items: `1px`
- Items wrapped in `padding: 2px 8px` container inside section

### 4. Badges

- Red pill: `background #ef4444`, white text, `9px font-weight-700`, `border-radius 10px`, `padding 1px 6px`, `height 16px`
- Right-aligned in item row

### 5. Footer

- Background: `#ffffff`, `border-top: 1px solid #f1f5f9`
- User card: `background #f8fafc`, `border 1px solid #f1f5f9`, `border-radius 8px`, `padding 6px 8px`
  - Avatar: `28×28`, `border-radius 7px`, gradient (user-specific), `10px font-weight-800` initials
  - Name: `11px font-weight-600 #0f172a`
  - Role badge: `9px`, role-specific color (e.g. Admin = `#fef2f2 / #dc2626 / border #fecaca`)
  - Actions: dark/light toggle + logout icon side-by-side, `24×24` hit areas, `#94a3b8`
- Version line: `8.5px #e2e8f0` — very muted, barely visible

### 6. Compact (Icon-only) Mode

No changes to behavior. Visual updates:
- Icon buttons: `36×36`, `border-radius 8px`
- Active icon: `background #e0e7ff`, `color #4f46e5`
- Section separators: thin `1px` horizontal rule between groups

---

## Dark Mode Token Changes

| Element | Light | Dark |
|---|---|---|
| Body bg | `#f8fafc` | `#0f1117` |
| Header bg | `#ffffff` | `#141824` |
| Header border | `#f1f5f9` | `#1e2235` |
| Section label | `#94a3b8` | `#4b5563` |
| Divider line | `#e2e8f0` | `#1e2235` |
| Chevron | `#cbd5e1` | `#374151` |
| Nav item default | `#64748b` | `#9ca3af` |
| Nav item active bg | `#e0e7ff` | `rgba(99,102,241,.2)` + `border rgba(99,102,241,.25)` |
| Nav item active text | `#3730a3` | `#a5b4fc` |
| Active right-bar | `#4f46e5` | `#818cf8` |
| Footer bg | `#ffffff` | `#141824` |
| Footer border | `#f1f5f9` | `#1e2235` |
| User card bg | `#f8fafc` | `rgba(255,255,255,.03)` |
| Username text | `#0f172a` | `#e2e8f0` |
| Footer icons | `#94a3b8` | `#6b7280` |
| Version text | `#e2e8f0` | `#2d3555` |

---

## What Is Not Changing

- NAV structure (sections, items, order) — unchanged
- Collapsible sections — kept, same localStorage persistence
- Compact (icon-only) toggle — kept
- Badge polling logic — unchanged
- Dark mode toggle — kept in footer
- Logout handler — unchanged
- Responsive/mobile behavior — out of scope

---

## Implementation Scope

Single file change: `frontend/src/components/layout/Sidebar.tsx`  
CSS variable changes: `frontend/src/app/globals.css` (dark mode sidebar tokens)  
No new components, no new dependencies.
