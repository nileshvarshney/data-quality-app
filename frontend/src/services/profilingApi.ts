import { api } from './apiClient'

export interface ProfileHistoryPoint {
  column_name: string
  profile_date: string
  null_pct: number | null
  cardinality_pct: number | null
  row_count: number
  top_values: { value: string; count: number }[]
}

export interface ProfileSummary {
  column_name: string
  snapshots_count: number
  latest_null_pct: number | null
  prev_null_pct: number | null
  null_pct_delta: number | null
  latest_cardinality_pct: number | null
  prev_cardinality_pct: number | null
  cardinality_delta: number | null
  drift_detected: boolean
}

export const profilingApi = {
  getHistory: (assetId: string, days = 90, column?: string) =>
    api.get<ProfileHistoryPoint[]>(`/assets/${assetId}/columns/profile-history`, {
      params: { days, ...(column ? { column } : {}) },
    }).then(r => r.data),

  getSummary: (assetId: string) =>
    api.get<ProfileSummary[]>(`/assets/${assetId}/columns/profile-history/summary`)
      .then(r => r.data),
}
