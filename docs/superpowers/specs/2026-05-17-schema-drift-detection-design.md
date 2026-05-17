# Schema Drift Detection Design

## Problem
The platform profiles Snowflake tables nightly but has no record of *structural* changes —
column additions, deletions, type changes, nullability shifts. When a column is renamed or
dropped, there is no alert and no history.

## Solution
Two new models pin an approved schema baseline and log each detected change.
A nightly job (04:00 UTC, after the 02:00 column profile) compares current `ColumnMetadata`
against the active baseline and raises multi-channel alerts via the existing pipeline.
Users review and accept changes via a new tab on the asset detail page.

## Data Models

### SchemaBaseline
Stores the approved schema snapshot for an asset.
One row per asset per baseline epoch; `status='active'` identifies the current reference.

### SchemaDriftEvent
One row per detected structural change.
`status='open'` until the user accepts all changes (advancing the baseline).

### DQAlert updates
`run_id` and `rule_id` made nullable to support non-rule alerts.
`alert_type` column added (`rule_failure` default | `schema_drift`).
`drift_asset_id` FK added for asset-level anchor on schema drift alerts.

## Change Detection Rules
| Change type | Condition |
|---|---|
| `column_added` | column in current ColumnMetadata but not in baseline snapshot |
| `column_deleted` | column in baseline snapshot but not in current ColumnMetadata |
| `type_changed` | column in both; `data_type` values differ |
| `nullability_changed` | column in both; `is_nullable` values differ |

## Severity Logic
`high` if any `column_deleted` or `type_changed` (potentially breaking).
`medium` if only `column_added` or `nullability_changed`.

## Baseline Approval
"Accept All Changes" button calls `POST /assets/{id}/schema-drift/approve`.
Marks current baseline as `superseded`, creates new baseline from current `ColumnMetadata`,
marks all open events as `accepted`.

## Dedup Guards
1. If open `SchemaDriftEvent` rows already exist for the asset → skip detection (already flagged).
2. If an open `DQAlert` with `alert_type='schema_drift'` exists for the asset → skip new alert.
