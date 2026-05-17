// frontend/src/types/lineage.ts

export interface LineageAsset {
  asset_id: string
  sf_table_name: string
  sf_schema_name: string
  sf_database_name: string | null
  table_type: string | null
  table_description: string | null
  owner_name: string | null
  technical_owner_name: string | null
  column_count: number
  row_count: number | null
  classifications: string[]
  terms: string[]
}

export interface LineageResponse {
  asset: LineageAsset
  upstream: LineageAsset[]
  downstream: LineageAsset[]
}
