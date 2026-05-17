import { api } from './apiClient'
import type {
  SchemaDriftResponse,
  ApproveBaselineResponse,
  SchemaDriftHistoryResponse,
} from '@/types/schemaDrift'

export const schemaDriftApi = {
  get: (assetId: string): Promise<SchemaDriftResponse> =>
    api.get<SchemaDriftResponse>(`/api/v1/assets/${assetId}/schema-drift`)
      .then(r => r.data),

  approve: (assetId: string): Promise<ApproveBaselineResponse> =>
    api.post<ApproveBaselineResponse>(`/api/v1/assets/${assetId}/schema-drift/approve`, {})
      .then(r => r.data),

  history: (assetId: string, limit = 30): Promise<SchemaDriftHistoryResponse> =>
    api.get<SchemaDriftHistoryResponse>(
      `/api/v1/assets/${assetId}/schema-drift/history`,
      { params: { limit } }
    ).then(r => r.data),
}
