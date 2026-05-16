export interface GraphColumn {
  column_name: string
  data_type?: string
  is_primary_key?: boolean
  is_foreign_key?: boolean
  references_table?: string
  is_nullable?: boolean
  ordinal_position?: number
}

export interface GraphNode {
  lineage_id?: string
  asset_id?: string
  sf_table_name: string
  sf_schema_name: string
  sf_database_name: string
  quality_score?: number
  columns: GraphColumn[]
  source: 'data_lineage' | 'fk_detection'
  fk_column?: string
  is_critical?: boolean
  lineage_type?: string
  downstream_name?: string
  downstream_type?: string
}

export interface LineageGraphData {
  current: {
    asset_id: string
    sf_table_name: string
    sf_schema_name: string
    sf_database_name: string
    quality_score?: number
    columns: GraphColumn[]
  }
  upstream: GraphNode[]
  downstream: GraphNode[]
}

// Props passed from ReactFlow into each custom node's `data` field
export interface TableNodeData {
  node: GraphNode | LineageGraphData['current']
  isCurrent: boolean
  direction: 'upstream' | 'current' | 'downstream'
  showAllColumns: boolean   // true when there are no lineage connections
  label: string
}
