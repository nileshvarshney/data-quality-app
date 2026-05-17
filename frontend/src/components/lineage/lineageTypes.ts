export type ObjectType = 'TABLE' | 'VIEW' | 'MATERIALIZED_VIEW'

export type RelationshipType =
  | 'READS_FROM'
  | 'TRANSFORMS'
  | 'JOINS_WITH'
  | 'AGGREGATES_FROM'
  | 'FILTERS_FROM'
  | 'DERIVED_FROM'

export interface DataObjectColumn {
  column_id: string
  column_name: string
  data_type?: string
  ordinal_position?: number
  is_nullable?: boolean
}

export interface DataObjectNode {
  object_id: string
  object_name: string
  object_type: ObjectType
  database_name: string
  schema_name: string
  domain?: string
  sub_domain?: string
  owner?: string
  quality_score?: number
  status?: string
  certification_status?: string
  tags?: string[]
  last_refreshed_at?: string
  columns?: DataObjectColumn[]
}

export interface DataObjectEdge {
  relationship_id: string
  source_object_id: string
  target_object_id: string
  relationship_type: RelationshipType
  transformation_logic?: string
  confidence_score?: number
}

export interface LineageGraphResponse {
  focal_node: DataObjectNode
  nodes: DataObjectNode[]
  edges: DataObjectEdge[]
}

export interface ImpactResponse {
  impacted_views: DataObjectNode[]
  impacted_materialized_views: DataObjectNode[]
  connected_tables: DataObjectNode[]
  total_impacted: number
}

export interface SearchResponse {
  results: DataObjectNode[]
  total: number
}

/**
 * Returns the correct label for source/target direction based on object type.
 * TABLE objects never use "upstream"/"downstream" — use "Source objects" / "Connected objects".
 * VIEW and MATERIALIZED_VIEW may use "Upstream" / "Downstream".
 */
export function getDirectionLabel(objectType: ObjectType, direction: 'source' | 'target'): string {
  if (objectType === 'TABLE') {
    return direction === 'source' ? 'Source objects' : 'Connected objects'
  }
  return direction === 'source' ? 'Upstream' : 'Downstream'
}

/**
 * Returns the impact section header label based on object type.
 * TABLE: "Impacted connected objects"
 * VIEW / MATERIALIZED_VIEW: "Downstream impact"
 */
export function getImpactLabel(objectType: ObjectType): string {
  return objectType === 'TABLE' ? 'Impacted connected objects' : 'Downstream impact'
}

/** Badge color class by object type (Tailwind) */
export function getObjectTypeBadgeClass(objectType: ObjectType): string {
  switch (objectType) {
    case 'TABLE': return 'bg-blue-100 text-blue-800'
    case 'VIEW': return 'bg-purple-100 text-purple-800'
    case 'MATERIALIZED_VIEW': return 'bg-green-100 text-green-800'
  }
}

/** Short display label for MATERIALIZED_VIEW → MV */
export function getObjectTypeLabel(objectType: ObjectType): string {
  switch (objectType) {
    case 'TABLE': return 'TABLE'
    case 'VIEW': return 'VIEW'
    case 'MATERIALIZED_VIEW': return 'MV'
  }
}
