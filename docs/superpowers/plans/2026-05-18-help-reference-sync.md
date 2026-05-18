# Help & Reference Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync `frontend/src/app/help/page.tsx` with the running application by fixing the navigation overview, adding missing sections (Audit Logs, Administration), and updating existing sections (Dashboard Metrics, Catalog, Rule Lifecycle) with features that exist in the app but have no help coverage.

**Architecture:** All changes are in-place edits to a single file — `frontend/src/app/help/page.tsx`. No new files, no structural refactor. The existing pattern (inline data arrays + JSX sections) is preserved throughout.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, lucide-react icons. Type-check: `cd frontend && npm run type-check`. Build: `cd frontend && npm run build`.

---

## File Map

| File | What changes |
|---|---|
| `frontend/src/app/help/page.tsx` | All 7 changes below — imports, NAV array, 5 content edits |

---

## Task 1: Add `Settings` icon to imports and update NAV array

**Files:**
- Modify: `frontend/src/app/help/page.tsx:3-46`

- [ ] **Step 1: Baseline type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors (establishes clean baseline before edits).

- [ ] **Step 2: Add `Settings` to the lucide-react import**

  In `frontend/src/app/help/page.tsx`, find line 10:
  ```ts
  // current line 10
  Cpu, MapPin, Tag, Sparkles, Radio,
  ```
  Replace with:
  ```ts
  Cpu, MapPin, Tag, Sparkles, Radio, Settings,
  ```

- [ ] **Step 3: Insert `audit-logs` entry after `alerts` in the NAV array**

  Find (line 41):
  ```ts
    { id: 'alerts',          label: 'Alerts',                   icon: <Bell size={14}/> },
  ```
  Replace with:
  ```ts
    { id: 'alerts',          label: 'Alerts',                   icon: <Bell size={14}/> },
    { id: 'audit-logs',      label: 'Audit Logs',               icon: <ClipboardList size={14}/> },
  ```

- [ ] **Step 4: Insert `admin` entry after `faq` in the NAV array**

  Find (line 45):
  ```ts
    { id: 'faq',             label: 'FAQ',                      icon: <HelpCircle size={14}/> },
  ```
  Replace with:
  ```ts
    { id: 'faq',             label: 'FAQ',                      icon: <HelpCircle size={14}/> },
    { id: 'admin',           label: 'Administration',           icon: <Settings size={14}/> },
  ```

- [ ] **Step 5: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/app/help/page.tsx
  git commit -m "feat(help): add Audit Logs and Administration entries to sidebar nav"
  ```

---

## Task 2: Rewrite the Getting Started navigation overview table

**Files:**
- Modify: `frontend/src/app/help/page.tsx:269-283`

The current table at line 269 is titled "Navigation Overview — 9 Sidebar Sections" and lists outdated individual page names. Replace the entire subtitle + `<TableGrid>` block with one that matches the actual sidebar groups.

- [ ] **Step 1: Replace the subtitle and table rows**

  Find (lines 269-284):
  ```tsx
            <SubTitle>Navigation Overview — 9 Sidebar Sections</SubTitle>
            <TableGrid
              headers={['Section', 'What you find here']}
              rows={[
                ['Dashboard', 'Global, domain, subdomain, and table quality scores with charts and trend lines.'],
                ['Rules', 'Create, edit, approve, and manage all data quality rules. Includes AI rule wizard.'],
                ['Assets', 'Register Snowflake tables and map them to domains and subdomains.'],
                ['Schedules', 'Configure when rules run — at global, domain, subdomain, table, or rule level.'],
                ['Alerts', 'View, acknowledge, and resolve quality alerts across all domains.'],
                ['Governance', 'Scorecards, policy engine, data contracts, compliance frameworks, and audit logs.'],
                ['Catalog', 'Business glossary, sensitivity classifications, column profiling, and data products.'],
                ['Incidents', 'Incident management, on-call schedules, runbooks, and MTTD / MTTR tracking.'],
                ['AI Assistant', 'Full-page AI chat for deep queries about your rules, runs, schemas, and quality trends.'],
              ]}
            />
  ```
  Replace with:
  ```tsx
            <SubTitle>Navigation Overview — 9 Sidebar Groups</SubTitle>
            <TableGrid
              headers={['Sidebar Group', 'What you find here']}
              rows={[
                ['Overview',             'Global quality dashboard and Cost Impact (bad data cost vs. cost averted).'],
                ['Data Quality',         'Rules, Approval Queue, Data Assets, Schedules, Execution Logs.'],
                ['Operations',           'Alerts and Audit Logs.'],
                ['Data Catalog',         'Catalog search, Business Glossary, Data Products.'],
                ['Governance',           'Governance Hub, Data Contracts, Incidents, Rule Marketplace.'],
                ['Privacy & Compliance', 'Compliance frameworks, PII exposure, masking policies.'],
                ['AI Intelligence',      'AI Copilot (floating widget) and full AI Assistant chat.'],
                ['Support',              'This Help & Reference page.'],
                ['Administration',       'Domain Management, User Management, Data Cleanup, Settings.'],
              ]}
            />
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/app/help/page.tsx
  git commit -m "feat(help): update navigation overview to match current sidebar groups"
  ```

---

## Task 3: Dashboard Metrics — add Cost Impact Dashboard subsection

**Files:**
- Modify: `frontend/src/app/help/page.tsx:416-417`

Insert a new `<SubTitle>` block immediately before the closing `</section>` tag of the Dashboard Metrics section (currently line 417).

- [ ] **Step 1: Insert Cost Impact subsection before `</section>` at line 417**

  Find (lines 415-417):
  ```tsx
              <MetricRow label="Duration" desc="Wall-clock time for the Snowflake SQL to return results. High durations may indicate warehouse contention or unoptimized SQL." />
            </div>
          </section>
  ```
  Replace with:
  ```tsx
              <MetricRow label="Duration" desc="Wall-clock time for the Snowflake SQL to return results. High durations may indicate warehouse contention or unoptimized SQL." />
            </div>

            <SubTitle>Cost Impact Dashboard</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              Found at <strong>Overview → Cost Impact Dashboard</strong> in the sidebar. Shows the dollar value
              of bad data across monitored assets and estimates costs averted by passing DQ rules.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: 'Total Cost of Bad Data',   desc: 'Sum of failed_rows × cost_per_failed_row across all configured assets for the selected period.' },
                { label: 'Cost Averted by DQ Rules', desc: 'Estimated savings from passing rule runs, using a heuristic incident cost per rule type.' },
                { label: 'Total Failed Rows',        desc: 'Raw count of row-level failures across all monitored assets, regardless of cost config.' },
                { label: 'Open Critical Incidents',  desc: 'Count of open incidents with severity critical across all domains.' },
              ].map(m => (
                <div key={m.label} className="border border-gray-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-800 mb-1">{m.label}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{m.desc}</p>
                </div>
              ))}
            </div>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mb-3">
              {[
                { period: '7 days',  desc: 'Short window — good for spotting recent spikes.' },
                { period: '30 days', desc: 'Default view — monthly cost summary.' },
                { period: '90 days', desc: 'Quarterly trend — useful for exec reporting.' },
              ].map(p => (
                <div key={p.period} className="flex items-center gap-4 px-4 py-3">
                  <code className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded w-16 shrink-0">{p.period}</code>
                  <p className="text-sm text-gray-600">{p.desc}</p>
                </div>
              ))}
            </div>
            <InfoBox color="yellow">
              <strong>Configuration required:</strong> Cost-per-failed-row must be set per asset in the
              configuration panel at the bottom of the Cost Impact page. Assets without a cost config are
              tracked for failed-row counts but excluded from dollar totals.
            </InfoBox>
          </section>
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/app/help/page.tsx
  git commit -m "feat(help): document Cost Impact Dashboard in Dashboard Metrics section"
  ```

---

## Task 4: Rule Lifecycle — add Approval Queue subsection

**Files:**
- Modify: `frontend/src/app/help/page.tsx:858-859`

Insert an Approval Queue subsection after the Version History `<InfoBox>` at line 858 and before `</section>` at line 859.

- [ ] **Step 1: Insert Approval Queue subsection**

  Find (lines 853-859):
  ```tsx
            <InfoBox color="gray">
              <strong>Version history &amp; rollback:</strong> Every change to a rule — edit, approve, reject, rollback — creates an
              immutable snapshot in the Version History tab. Click <strong>Restore</strong> on any version to roll back to that
              state. After rollback, the rule moves to <code className="text-xs bg-gray-200 px-1 rounded">pending_review</code> and
              must be approved again before execution.
            </InfoBox>
          </section>
  ```
  Replace with:
  ```tsx
            <InfoBox color="gray">
              <strong>Version history &amp; rollback:</strong> Every change to a rule — edit, approve, reject, rollback — creates an
              immutable snapshot in the Version History tab. Click <strong>Restore</strong> on any version to roll back to that
              state. After rollback, the rule moves to <code className="text-xs bg-gray-200 px-1 rounded">pending_review</code> and
              must be approved again before execution.
            </InfoBox>

            <SubTitle>Approval Queue</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Found at <strong>Rules → Approval Queue</strong> in the sidebar. All rules in{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">pending_review</code> status land here,
              waiting for a human decision before they can execute.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {[
                { actor: 'admin',        sees: 'All pending rules across every domain.' },
                { actor: 'domain_owner', sees: 'Only pending rules in their assigned domain(s).' },
              ].map(r => (
                <div key={r.actor} className="border border-gray-200 rounded-xl p-3 flex items-start gap-3">
                  <code className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded shrink-0 mt-0.5">{r.actor}</code>
                  <p className="text-xs text-gray-600 leading-relaxed">{r.sees}</p>
                </div>
              ))}
            </div>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mb-3">
              {[
                { action: 'Approve',      result: 'Rule moves to approved status and becomes available for activation.' },
                { action: 'Reject',       result: 'Rule moves back to draft. A comment is required explaining the rejection.' },
                { action: 'Bulk approve', result: 'Select multiple rules and approve in one action.' },
                { action: 'Bulk reject',  result: 'Select multiple rules and reject with a single shared comment.' },
              ].map(a => (
                <div key={a.action} className="flex items-start gap-4 px-4 py-3">
                  <span className="text-xs font-semibold text-gray-800 w-24 shrink-0">{a.action}</span>
                  <p className="text-sm text-gray-600">{a.result}</p>
                </div>
              ))}
            </div>
            <InfoBox color="blue">
              The sidebar shows a live badge with the count of rules currently in{' '}
              <code className="text-xs bg-blue-100 px-1 rounded">pending_review</code>.
              AI-generated rules always start as <code className="text-xs bg-blue-100 px-1 rounded">pending_review</code> — they are never auto-activated.
            </InfoBox>
          </section>
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/app/help/page.tsx
  git commit -m "feat(help): add Approval Queue subsection to Rule Lifecycle"
  ```

---

## Task 5: Catalog section — add Facets, Popular Assets, Sort & Entity-type subsections

**Files:**
- Modify: `frontend/src/app/help/page.tsx:490-491`

Insert three new subsections after the Data Products paragraph at line 490 and before `</section>` at line 491.

- [ ] **Step 1: Insert three subsections**

  Find (lines 484-491):
  ```tsx
            <SubTitle>Data Products</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed">
              A Data Product is a curated collection of assets and glossary terms that represents a publishable unit
              for consumers (e.g. "Revenue Analytics Product", "HR Workforce Snapshot"). To create a data product:
              go to <strong>Catalog → Data Products → New</strong>. Add assets, set an SLA, assign an owner, and
              publish. Published data products appear in the product directory and can have data contracts attached.
            </p>
          </section>
  ```
  Replace with:
  ```tsx
            <SubTitle>Data Products</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed">
              A Data Product is a curated collection of assets and glossary terms that represents a publishable unit
              for consumers (e.g. "Revenue Analytics Product", "HR Workforce Snapshot"). To create a data product:
              go to <strong>Catalog → Data Products → New</strong>. Add assets, set an SLA, assign an owner, and
              publish. Published data products appear in the product directory and can have data contracts attached.
            </p>

            <SubTitle>Facets Panel</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              The facets panel on the left side of the Catalog page filters results by structured metadata.
              Multiple selections within a facet are OR&apos;d; selections across different facets are AND&apos;d.
              Facets update dynamically based on the current search query.
            </p>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mb-3">
              {[
                { facet: 'Domain',                   desc: 'Filter to assets belonging to one or more business domains.' },
                { facet: 'Sensitivity Classification', desc: 'Filter to assets or columns with specific labels: PII, SENSITIVE, CONFIDENTIAL, RESTRICTED, PUBLIC.' },
                { facet: 'Certification Status',     desc: 'Show only certified assets, or narrow to uncertified.' },
                { facet: 'Tags',                     desc: 'Filter by any custom tags applied to assets in the Catalog.' },
              ].map(f => (
                <div key={f.facet} className="flex items-start gap-4 px-4 py-3">
                  <span className="text-xs font-semibold text-gray-800 w-44 shrink-0">{f.facet}</span>
                  <p className="text-sm text-gray-600">{f.desc}</p>
                </div>
              ))}
            </div>

            <SubTitle>Popular Assets</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed">
              When the search bar is empty, up to 6 high-usage assets are shown as <strong>Popular Assets</strong>{' '}
              (or &quot;Featured Assets&quot; if no usage count data is available). Assets are ranked by usage count
              recorded in catalog metadata. Click any card to go directly to the asset detail page.
            </p>

            <SubTitle>Sort Options &amp; Entity-Type Filter</SubTitle>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mb-3">
              {[
                { label: 'Relevance', desc: 'Default. Results ranked by semantic similarity to your search query.' },
                { label: 'A → Z',     desc: 'Alphabetical ascending by table name.' },
                { label: 'Z → A',     desc: 'Alphabetical descending by table name.' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-4 px-4 py-3">
                  <code className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded w-20 shrink-0">{s.label}</code>
                  <p className="text-sm text-gray-600">{s.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              The <strong>entity-type filter</strong> narrows results to a specific type
              (e.g. <code className="text-xs bg-gray-100 px-1 rounded">TABLE</code>,{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">VIEW</code>). Each result card shows a type badge.
              Changing sort or entity-type resets to page 1.
            </p>
          </section>
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/app/help/page.tsx
  git commit -m "feat(help): add Facets, Popular Assets, and Sort/Entity-type subsections to Catalog"
  ```

---

## Task 6: Add new Audit Logs section

**Files:**
- Modify: `frontend/src/app/help/page.tsx:883-884`

Insert a full new `<section>` after the Alerts section closing tag at line 883 and before the Roles & Access section comment at line 884.

- [ ] **Step 1: Insert Audit Logs section**

  Find (lines 883-885):
  ```tsx
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 15: Roles & Access
  ```
  Replace with:
  ```tsx
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION: Audit Logs
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="audit-logs" icon={<ClipboardList size={18}/>}>Audit Logs</SectionTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              Found at <strong>Operations → Audit Logs</strong> in the sidebar. Every write action taken by
              any user is recorded as an immutable audit log entry. Logs cannot be edited or deleted via the UI.
            </p>

            <SubTitle>Logged Actions</SubTitle>
            <TableGrid
              headers={['Action', 'What it records']}
              rows={[
                ['CREATE',             'A new record was created (rule, asset, contract, user, etc.).'],
                ['UPDATE',             'One or more fields on an existing record were changed.'],
                ['DELETE',             'A record was permanently deleted.'],
                ['DEACTIVATE',         'A rule or user was deactivated without deletion.'],
                ['APPROVE',            'A rule was approved by an admin or domain_owner.'],
                ['REJECT',             'A rule was rejected with a required comment.'],
                ['STATUS_CHANGE',      "A rule's lifecycle status changed (e.g. active → disabled)."],
                ['BULK_STATUS_CHANGE', 'Multiple rules changed status in a single operation.'],
                ['CERTIFY',            'An asset or data contract was certified.'],
                ['ROLLBACK',           'A rule was restored to a prior version snapshot.'],
              ]}
            />

            <SubTitle>Diff View</SubTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Expanding an <code className="text-xs bg-gray-100 px-1 rounded">UPDATE</code> entry shows a
              field-level before/after comparison table. Old values appear in red with strikethrough; new values
              appear in green. This makes it easy to audit exactly what changed, who changed it, and when.
            </p>

            <SubTitle>Filters &amp; Search</SubTitle>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 mb-4">
              {[
                { filter: 'Action type', desc: 'Filter to a specific action (CREATE, UPDATE, APPROVE, etc.).' },
                { filter: 'Entity type', desc: 'Filter to a specific entity — rules, assets, contracts, incidents, users, policies.' },
                { filter: 'User',        desc: 'Show only logs created by a specific user.' },
                { filter: 'Search',      desc: 'Keyword search across log payloads (table names, field values, comments).' },
              ].map(f => (
                <div key={f.filter} className="flex items-start gap-4 px-4 py-3">
                  <span className="text-xs font-semibold text-gray-800 w-28 shrink-0">{f.filter}</span>
                  <p className="text-sm text-gray-600">{f.desc}</p>
                </div>
              ))}
            </div>

            <InfoBox color="gray">
              <strong>Access:</strong> The <code className="text-xs bg-gray-200 px-1 rounded">admin</code>,{' '}
              <code className="text-xs bg-gray-200 px-1 rounded">domain_owner</code>,{' '}
              <code className="text-xs bg-gray-200 px-1 rounded">data_owner</code>, and{' '}
              <code className="text-xs bg-gray-200 px-1 rounded">auditor</code> roles can read audit logs.
              The <code className="text-xs bg-gray-200 px-1 rounded">viewer</code> role cannot.
            </InfoBox>
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION 15: Roles & Access
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/app/help/page.tsx
  git commit -m "feat(help): add Audit Logs section"
  ```

---

## Task 7: Add new Administration section

**Files:**
- Modify: `frontend/src/app/help/page.tsx:1077-1078`

Insert a full new `<section>` after the FAQ section closing tag at line 1077 and before the outer `</div>` at line 1079.

- [ ] **Step 1: Insert Administration section**

  Find (lines 1077-1079):
  ```tsx
          </section>

        </div>
  ```
  Replace with:
  ```tsx
          </section>

          {/* ══════════════════════════════════════════════════
              SECTION: Administration
          ══════════════════════════════════════════════════ */}
          <section>
            <SectionTitle id="admin" icon={<Settings size={18}/>}>Administration</SectionTitle>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              The Administration section is accessible from the bottom of the sidebar. Only users with the{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">admin</code> role can access these pages.
            </p>

            <TableGrid
              headers={['Page', 'What you do here']}
              rows={[
                ['Domain Management', 'Create and edit business domains and subdomains. Assign domain owners and configure domain-level schedule inheritance.'],
                ['User Management',   'Create, deactivate, and assign roles to users. Manage Google SSO configuration.'],
                ['Data Cleanup',      'Remove orphaned rules, stale asset registrations, and old run records to keep the platform lean.'],
                ['Settings',          'Configure Snowflake connection credentials, LLM provider, notification channels (Slack, Teams, Email, PagerDuty, Webhook), service accounts, and timezone.'],
              ]}
            />

            <InfoBox color="yellow">
              Changes to <strong>Snowflake credentials</strong> and <strong>LLM provider</strong> in Settings
              take effect immediately — no restart required. Notification channel changes (Slack webhook URL,
              PagerDuty key) also take effect on the next event.
            </InfoBox>
          </section>

        </div>
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/app/help/page.tsx
  git commit -m "feat(help): add Administration section"
  ```

---

## Task 8: Final build verification

- [ ] **Step 1: Full type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: zero TypeScript errors.

- [ ] **Step 2: Production build**

  ```bash
  cd frontend && npm run build
  ```
  Expected: build succeeds with no errors. The `/help` route appears in the output page list.

- [ ] **Step 3: Visual check (dev server)**

  ```bash
  cd frontend && npm run dev
  ```
  Open `http://localhost:3000/help` and verify:
  - Sidebar shows 20 nav items (was 18) — new entries: **Audit Logs** and **Administration**
  - Getting Started table shows 9 sidebar group rows with updated labels
  - Dashboard Metrics section ends with **Cost Impact Dashboard** subsection
  - Rule Lifecycle section ends with **Approval Queue** subsection and InfoBox
  - Catalog section includes **Facets Panel**, **Popular Assets**, **Sort Options & Entity-Type Filter** subsections
  - New **Audit Logs** section renders with action table, diff view description, filters list, and access InfoBox
  - New **Administration** section renders with overview table and InfoBox

- [ ] **Step 4: Final commit (if any lint fixes needed)**

  ```bash
  git add frontend/src/app/help/page.tsx
  git commit -m "fix(help): lint fixes from build verification"
  ```
  Skip this step if there are no remaining changes.
