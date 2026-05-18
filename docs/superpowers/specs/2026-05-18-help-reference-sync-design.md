# Help & Reference Page — Sync to Application

**Date:** 2026-05-18  
**Approach:** In-place edits to `frontend/src/app/help/page.tsx` (Approach A)  
**Scope:** Full audit — fix nav overview, add missing sections, update Catalog with recent features

---

## Problem

The Help & Reference page (`/help`) has drifted from the running application. Specific gaps:

1. **Navigation overview table** lists 9 individual pages with outdated names — does not match the actual 9 sidebar groups or their contents.
2. **Cost Impact Dashboard** (`/executive`) exists in the sidebar but has zero help coverage.
3. **Audit Logs** (`/audit`) exists in the sidebar but has zero help coverage.
4. **Administration section** (Domain Management, User Management, Data Cleanup, Settings) has no dedicated coverage.
5. **Approval Queue** (`/rules/approval-queue`) appears only in a FAQ answer — no section or subsection.
6. **Catalog** section is missing recent features: facets panel, popular assets, entity-type filter, sort options, and type badges.

---

## Approach

**Approach A — In-place targeted edits.** All changes made directly inside the existing `help/page.tsx` file. No new files created. No structural refactor. The established pattern (inline data + JSX sections) is preserved throughout.

File size grows from ~1083 to ~1250 lines. Still navigable.

---

## Changes

### 1. NAV array (sidebar nav)

Add two new entries at the specified positions:

- **`audit-logs`** — insert after the `alerts` entry (keeps it grouped with Operations):
  ```ts
  { id: 'audit-logs', label: 'Audit Logs', icon: <ClipboardList size={14}/> }
  ```
  `ClipboardList` is already imported.

- **`admin`** — insert after the `faq` entry (at the end of the NAV array):
  ```ts
  { id: 'admin', label: 'Administration', icon: <Settings size={14}/> }
  ```
  `Settings` is **not** currently imported in `help/page.tsx` — add it to the lucide-react import line.

---

### 2. Getting Started — Navigation Overview table

**Rewrite** the existing 9-row table (currently titled "Navigation Overview — 9 Sidebar Sections") to match the actual sidebar groups.

New rows:

| Sidebar Group | What you find here |
|---|---|
| Overview | Global quality dashboard and Cost Impact (bad data cost vs. cost averted). |
| Data Quality | Rules, Approval Queue, Data Assets, Schedules, Execution Logs. |
| Operations | Alerts and Audit Logs. |
| Data Catalog | Catalog search, Business Glossary, Data Products. |
| Governance | Governance Hub, Data Contracts, Incidents, Rule Marketplace. |
| Privacy & Compliance | Compliance frameworks, PII exposure, masking policies. |
| AI Intelligence | AI Copilot (floating widget) and full AI Assistant chat. |
| Support | This Help & Reference page. |
| Administration | Domain Management, User Management, Data Cleanup, Settings. |

---

### 3. Dashboard Metrics — Cost Impact Dashboard subsection

Add `<SubTitle>Cost Impact Dashboard</SubTitle>` at the end of the existing Dashboard Metrics section.

Content:
- **4 KPI cards:** Total Cost of Bad Data, Cost Averted by DQ Rules, Total Failed Rows, Open Critical Incidents
- **Period filter:** 7 / 30 / 90-day windows
- **Cost formula:** `Total cost = failed rows × cost_per_failed_row`. Cost averted = passed rule runs × heuristic incident cost.
- **Drill-down flow:** Global → domain cards → subdomain rows → asset table. Table search filters by name, schema, or subdomain.
- **Configuration note:** Cost-per-failed-row must be set per asset via the configuration panel at the bottom of the page. Assets without a cost config are tracked for row counts but excluded from dollar totals.
- **Access:** `/executive` in the sidebar under Overview → Cost Impact Dashboard.

---

### 4. Rule Lifecycle — Approval Queue subsection

Add `<SubTitle>Approval Queue</SubTitle>` at the end of the existing Rule Lifecycle section (after the Version History infobox).

Content:
- **Location:** Rules → Approval Queue in the sidebar.
- **Who sees what:** Admin sees all pending rules across all domains. `domain_owner` sees only their domain's rules.
- **Actions:** Approve (moves rule to `approved`), Reject with a required comment (moves rule to `draft`). Bulk approve/reject is supported for multiple rules at once.
- **Live badge:** The sidebar Approval Queue entry shows a live count of rules currently in `pending_review`.

---

### 5. Catalog section — New subsections

Add three new `<SubTitle>` subsections inside the existing Data Catalog & Glossary section:

**Facets Panel**
- Left-side filter panel visible on the Catalog page.
- Facet groups: Domain, Sensitivity Classification, Certification Status, Tags.
- Multiple selections within a facet are OR'd; selections across different facets are AND'd.
- Facets update dynamically based on the current search query.

**Popular Assets**
- Shown below the search bar when no query is active.
- Displays up to 6 assets ranked by usage count. Falls back to "Featured Assets" label if no usage data is available.
- Click any card to open the asset detail directly.

**Sort Options & Entity-Type Filter**
- **Sort:** Relevance (default, semantic search ranking), A→Z, Z→A by table name. Changing sort resets to page 1.
- **Entity-type filter:** Narrows results to a specific type (table, view, etc.). Each result card shows a type badge (e.g. `TABLE`, `VIEW`).

---

### 6. New section: Audit Logs

New `<section>` with sidebar nav entry `id="audit-logs"`.

Content:
- **What's logged:** Every write action on rules, assets, contracts, policies, users, incidents. Logged entity types include rules, assets, contracts, incidents, users, and masking policies.
- **Action types table:**

| Action | Meaning |
|---|---|
| CREATE | A new record was created. |
| UPDATE | Fields on an existing record were changed. |
| DELETE | A record was permanently deleted. |
| DEACTIVATE | A rule or user was deactivated without deletion. |
| APPROVE | A rule was approved by an admin or domain_owner. |
| REJECT | A rule was rejected with a comment. |
| STATUS_CHANGE | Rule lifecycle status changed (e.g. active → disabled). |
| BULK_STATUS_CHANGE | Multiple rules changed status in one operation. |
| CERTIFY | An asset or contract was certified. |
| ROLLBACK | A rule was rolled back to a prior version. |

- **Diff view:** UPDATE log entries expand to show a field-level before/after comparison. Old values shown in red (strikethrough), new values in green.
- **Filters:** Action type, entity type, user. Keyword search across payloads.
- **Access:** admin, domain_owner, data_owner, and auditor roles can read audit logs. viewer cannot.
- **Immutability:** Logs cannot be deleted or edited via the UI.

---

### 7. New section: Administration

New `<section>` with sidebar nav entry `id="admin"`.

Content: a single overview table (same `<TableGrid>` component pattern as Getting Started).

| Page | What you do here |
|---|---|
| Domain Management | Create and edit business domains and subdomains; assign domain owners; configure domain-level schedule inheritance. |
| User Management | Create, deactivate, and assign roles to users; manage Google SSO configuration. |
| Data Cleanup | Remove orphaned rules, stale asset registrations, and old run records to keep the platform lean. |
| Settings | Configure Snowflake connection credentials, LLM provider, notification channels (Slack, Teams, Email, PagerDuty, Webhook), service accounts, and timezone. |

Follow-up note for Settings (InfoBox): Only `admin` role can access the Administration section. Changes to Snowflake credentials and LLM provider take effect immediately without restart.

---

## File Impact

| File | Change type |
|---|---|
| `frontend/src/app/help/page.tsx` | Edit only — no new files |

Estimated line delta: +165 lines (1083 → ~1250).

---

## Out of Scope

- Refactoring the file into sub-components
- Extracting section data into typed const arrays
- Adding a new backend endpoint or API for the help page
- Updating any FAQ entries (existing FAQs remain unchanged)
