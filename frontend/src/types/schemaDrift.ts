export interface SchemaBaselineColumn {
  column_name: string
  data_type: string | null
  is_nullable: boolean | null
  ordinal_position: number | null
}

export interface SchemaBaseline {
  baseline_id: string
  asset_id: string
  status: 'active' | 'superseded'
  columns_snapshot: SchemaBaselineColumn[] | null
  approved_by: string | null
  approved_at: string | null
  created_at: string | null
}

export interface SchemaDriftEvent {
  event_id: string
  asset_id: string
  baseline_id: string
  detected_at: string | null
  change_type: 'column_added' | 'column_deleted' | 'type_changed' | 'nullability_changed'
  column_name: string
  old_value: string | null
  new_value: string | null
  status: 'open' | 'accepted'
  resolved_at: string | null
  resolved_by: string | null
}

export interface SchemaDriftResponse {
  baseline: SchemaBaseline | null
  open_events: SchemaDriftEvent[]
}

export interface SchemaDriftHistoryResponse {
  events: SchemaDriftEvent[]
}

export interface ApproveBaselineResponse {
  new_baseline: SchemaBaseline
  accepted_count: number
}
