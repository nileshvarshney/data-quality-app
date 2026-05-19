import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Handle response errors
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    // Network error or timeout — caller's catch block will handle it
    if (!err.response) {
      return Promise.reject(err)
    }

    const status: number = err.response.status
    const original = err.config

    // Silently attempt token refresh on 401, then replay the original request once
    if (status === 401 && !original._retry && typeof window !== 'undefined') {
      original._retry = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const resp = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken })
          const newToken = resp.data.access_token
          localStorage.setItem('access_token', newToken)
          original.headers.Authorization = `Bearer ${newToken}`
          return api(original)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
        }
      }
    }

    // Only surface unexpected server errors to the console — 4xx are
    // application-level outcomes that each call-site's catch block handles.
    if (status >= 500) {
      console.error(`API ${status} error on ${original?.url ?? 'unknown'}:`, err.response.data)
    }

    return Promise.reject(err)
  }
)

// Domains
export const domainsApi = {
  list: () => api.get('/domains'),
  get: (id: string) => api.get(`/domains/${id}`),
  create: (data: object) => api.post('/domains', data),
  update: (id: string, data: object) => api.put(`/domains/${id}`, data),
  delete: (id: string) => api.delete(`/domains/${id}`),
}

// Subdomains
export const subdomainsApi = {
  list: (domainId?: string) => api.get('/subdomains', { params: { domain_id: domainId } }),
  get: (id: string) => api.get(`/subdomains/${id}`),
  create: (data: object) => api.post('/subdomains', data),
  update: (id: string, data: object) => api.put(`/subdomains/${id}`, data),
}

// Assets
export const assetsApi = {
  list: (params?: object) => api.get('/assets', { params }),
  listEnriched: (params?: object) => api.get('/assets/enriched', { params }),
  get: (id: string) => api.get(`/assets/${id}`),
  create: (data: object) => api.post('/assets', data),
  update: (id: string, data: object) => api.put(`/assets/${id}`, data),
  delete: (id: string) => api.delete(`/assets/${id}`),
  columns:          (id: string) => api.get(`/assets/${id}/columns`),
  updateColumn:     (id: string, col: string, data: object) => api.put(`/assets/${id}/columns/${col}`, data),
  profileColumns:   (id: string) => api.post(`/assets/${id}/columns/profile`),
  getProfileStatus: (id: string, jobId: string) => api.get(`/assets/${id}/columns/profile/status`, { params: { job_id: jobId } }),
  certify: (id: string, certificationStatus: string, certifiedBy?: string) =>
    api.post(`/assets/${id}/certify`, { certification_status: certificationStatus, certified_by: certifiedBy }),
  discover: (data: object) => api.post('/assets/discovery', data),
  getDiscoveryJob: (jobId: string) => api.get(`/assets/discovery/jobs/${jobId}`),
}

// Snowflake Connections
export const connectionsApi = {
  list: () => api.get('/connections'),
  get: (id: string) => api.get(`/connections/${id}`),
  create: (data: object) => api.post('/connections', data),
  update: (id: string, data: object) => api.put(`/connections/${id}`, data),
  delete: (id: string) => api.delete(`/connections/${id}`),
  test: (id: string) => api.post(`/connections/${id}/test`),
  testCredentials: (data: object) => api.post('/connections/test-credentials', data),
  databases: (id: string) => api.get(`/connections/${id}/databases`),
  schemas: (id: string, database: string) => api.get(`/connections/${id}/schemas`, { params: { database } }),
  tables: (id: string, database: string, schema: string) => api.get(`/connections/${id}/tables`, { params: { database, schema } }),
  columns: (id: string, database: string, schema: string, table: string) =>
    api.get(`/connections/${id}/columns`, { params: { database, schema, table } }),
  getPrimaryTarget: () => api.get('/connections/primary-target'),
  setPrimaryTarget: (id: string) => api.put(`/connections/${id}/set-primary-target`),
}

// Rules
export const rulesApi = {
  list: (params?: object) => api.get('/rules', { params }),
  listEnriched: (params?: object) => api.get('/rules/enriched', { params }),
  get: (id: string) => api.get(`/rules/${id}`),
  create: (data: object) => api.post('/rules', data),
  previewSql: (data: object) => api.post('/rules/preview-sql', data),
  update: (id: string, data: object) => api.put(`/rules/${id}`, data),
  setStatus: (id: string, status: string) => api.patch(`/rules/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/rules/${id}`),
  import: (data: object) => api.post('/rules/import', data),
  export: (domainId?: string) => api.get('/rules/export', { params: { domain_id: domainId } }),
  bulkStatus: (ruleIds: string[], status: string) => api.patch('/rules/bulk/status', { rule_ids: ruleIds, status }),
  bulkExecute: (ruleIds: string[]) => api.post('/rules/bulk/execute', { rule_ids: ruleIds }),
  getRuns: (id: string, params?: object) => api.get(`/rules/${id}/runs`, { params }),
  getTags: (id: string) => api.get(`/rules/${id}/tags`),
  addTag: (id: string, tagName: string) => api.post(`/rules/${id}/tags`, { tag_name: tagName }),
  removeTag: (id: string, tagName: string) => api.delete(`/rules/${id}/tags/${tagName}`),
  // Approval workflow
  approve: (id: string, approvedBy?: string) => api.post(`/rules/${id}/approve`, { approved_by: approvedBy }),
  submit: (id: string) => api.post(`/rules/${id}/submit`),
  reject: (id: string, rejectedBy: string | undefined, rejectionReason: string) =>
    api.post(`/rules/${id}/reject`, { rejected_by: rejectedBy, rejection_reason: rejectionReason }),
  // Version history
  getVersions: (id: string) => api.get(`/rules/${id}/versions`),
  rollback: (id: string, version: number) => api.post(`/rules/${id}/rollback/${version}`),
  // Clone
  clone: (id: string) => api.post(`/rules/${id}/clone`),
}

// Schedules
export const schedulesApi = {
  list: (params?: object) => api.get('/schedules', { params }),
  listEnriched: () => api.get('/schedules/enriched'),
  jobs: () => api.get('/schedules/jobs'),
  columnProfileRunNow: () => api.post('/schedules/column-profile/run-now'),
  columnProfileConfigure: (enabled: boolean, hour: number, minute: number) =>
    api.post('/schedules/column-profile/configure', null, { params: { enabled, hour, minute } }),
  qualityAggregationRunNow: () => api.post('/schedules/quality-aggregation/run-now'),
  qualityAggregationConfigure: (enabled: boolean, hour: number, minute: number) =>
    api.post('/schedules/quality-aggregation/configure', null, { params: { enabled, hour, minute } }),
  policyEvaluationRunNow: () => api.post('/schedules/policy-evaluation/run-now'),
  policyEvaluationConfigure: (enabled: boolean, hour: number, minute: number) =>
    api.post('/schedules/policy-evaluation/configure', null, { params: { enabled, hour, minute } }),
  rulesStatus: (params?: { asset_id?: string; subdomain_id?: string; domain_id?: string }) =>
    api.get('/schedules/rules-status', { params }),
  create: (data: object) => api.post('/schedules', data),
  update: (id: string, data: object) => api.put(`/schedules/${id}`, data),
  pause: (id: string) => api.patch(`/schedules/${id}/pause`),
  resume: (id: string) => api.patch(`/schedules/${id}/resume`),
  runNow: (id: string) => api.post(`/schedules/${id}/run-now`),
  delete: (id: string) => api.delete(`/schedules/${id}`),
}

// Executions
export const executionsApi = {
  // Test a rule definition without saving anything to the database
  testRule: (data: object) => api.post('/execute/test-rule', data, { timeout: 120000 }),
  // Sync — waits for result, returns the run
  runRuleSync: (ruleId: string) => api.post(`/execute/rule/${ruleId}/sync`),
  runTableSync: (assetId: string) => api.post(`/execute/table/${assetId}/sync`),
  runDomainSync: (domainId: string) => api.post(`/execute/domain/${domainId}/sync`),
  runSubdomainSync: (subdomainId: string) => api.post(`/execute/subdomain/${subdomainId}/sync`),
  // Async — queues in background (used by scheduler)
  runRule: (ruleId: string) => api.post(`/execute/rule/${ruleId}`),
  runTable: (assetId: string) => api.post(`/execute/table/${assetId}`),
  runDomain: (domainId: string) => api.post(`/execute/domain/${domainId}`),
  // Runs log
  listRunsEnriched: (params?: object) => api.get('/runs/enriched', { params }),
  listRuns: (params?: object) => api.get('/runs', { params }),
  getRun: (id: string) => api.get(`/runs/${id}`),
  getRunSamples: (id: string) => api.get(`/runs/${id}/samples`),
}

// Dashboard
export const dashboardApi = {
  global:           () => api.get('/dashboard/global'),
  summary:          () => api.get('/dashboard/summary'),
  domains:          () => api.get('/dashboard/domains'),
  domain:           (id: string) => api.get(`/dashboard/domains/${id}`),
  subdomain:        (id: string) => api.get(`/dashboard/subdomains/${id}`),
  table:            (id: string) => api.get(`/dashboard/tables/${id}`),
  tableHistory:     (id: string, days?: number) => api.get(`/dashboard/history/table/${id}`, { params: { days } }),
  subdomainHistory: (id: string, days?: number) => api.get(`/dashboard/history/subdomain/${id}`, { params: { days } }),
  domainHistory:    (id: string, days?: number) => api.get(`/dashboard/history/domain/${id}`, { params: { days } }),
  slaBreaches:      () => api.get('/dashboard/sla-breaches'),
  trend:            (days: number) => api.get('/dashboard/trend', { params: { days } }),
  dimensions:       (params?: { domain_id?: string }) => api.get('/dashboard/dimensions', { params }),
}

// AI
export const aiApi = {
  checkModels: () => api.get('/ai/models'),
  generateRules: (data: object) => api.post('/ai/generate-rules', data),
  explainFailure: (data: object) => api.post('/ai/explain-failure', data),
  generateSql: (data: object) => api.post('/ai/generate-sql', data),
  classifyTable: (data: object) => api.post('/ai/classify-table', data),
  chat: (data: object) => api.post('/ai/chat', data),
  rulesFromNL: (data: object) => api.post('/ai/rules/from-natural-language', data),
  generateDescription: (assetId: string) => api.post(`/ai/assets/${assetId}/generate-description`, {}),
  generateColumnDocs: (assetId: string) => api.post(`/ai/assets/${assetId}/generate-column-docs`, {}),
  remediationPlan: (assetId: string) => api.post(`/ai/assets/${assetId}/remediation-plan`, {}),
  governanceReviewQueue: () => api.get('/ai/governance/review-queue'),
  suggestViolationResolution: (violationId: string) => api.post(`/ai/governance/violations/${violationId}/suggest-resolution`, {}),
  governanceChat: (data: object) => api.post('/ai/chat/governance', data),
}

// Alerts
export const alertsApi = {
  list: (params?: object) => api.get('/alerts', { params }),
  listEnriched: (params?: object) => api.get('/alerts/enriched', { params }),
  summary: () => api.get('/alerts/summary'),
  acknowledge: (id: string) => api.put(`/alerts/${id}/acknowledge`),
  resolve: (id: string) => api.put(`/alerts/${id}/resolve`),
  ignore: (id: string) => api.put(`/alerts/${id}/ignore`),
}

// Audit
export const auditApi = {
  list: (params?: object) => api.get('/audit', { params }),
  summary: () => api.get('/audit/summary'),
}

// Users & Auth
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refresh_token: refreshToken }),
  me: () => api.get('/auth/me'),
}

export const usersApi = {
  list: () => api.get('/users'),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: object) => api.post('/users', data),
  update: (id: string, data: object) => api.put(`/users/${id}`, data),
  deactivate: (id: string) => api.delete(`/users/${id}`),
  changePassword: (id: string, data: object) => api.post(`/users/${id}/change-password`, data),
}

// SLA Configs
export const slaApi = {
  list: () => api.get('/sla-configs'),
  create: (data: object) => api.post('/sla-configs', data),
  update: (id: string, data: object) => api.put(`/sla-configs/${id}`, data),
  delete: (id: string) => api.delete(`/sla-configs/${id}`),
}

// Config
export const configApi = {
  getAll: (category?: string) => api.get('/config', { params: category ? { category } : {} }),
  getKey: (key: string) => api.get(`/config/${key}`),
  updateKey: (key: string, value: string) => api.put(`/config/${key}`, { value }),
  bulkUpdate: (updates: Record<string, string>) => api.post('/config/bulk-update', { updates }),
  testDatabase: () => api.post('/config/test/database'),
  testPlatformConnection: (creds?: { account?: string; user?: string; password?: string; warehouse?: string; role?: string }) => api.post('/config/test/platform-connection', creds ?? {}),
  testLlm: () => api.post('/config/test/llm'),
  testNotification: (channel: string) => api.post(`/config/test/notification/${channel}`),
  testVault: () => api.post('/config/test/vault'),
  testAwsSecrets: () => api.post('/config/test/aws-secrets'),
  testOtel: () => api.post('/config/test/otel'),
  testOauth: () => api.post('/config/test/oauth'),
}

export const usersApiExt = {
  reactivate: (id: string) => api.put(`/users/${id}`, { is_active: true }),
}

// Glossary
export const glossaryApi = {
  list: (params?: object) => api.get('/glossary/terms', { params }),
  get: (id: string) => api.get(`/glossary/terms/${id}`),
  create: (data: object) => api.post('/glossary/terms', data),
  update: (id: string, data: object) => api.put(`/glossary/terms/${id}`, data),
  delete: (id: string) => api.delete(`/glossary/terms/${id}`),
  linkAsset: (id: string, data: object) => api.post(`/glossary/terms/${id}/link-asset`, data),
  unlinkAsset: (termId: string, linkId: string) => api.delete(`/glossary/terms/${termId}/link-asset/${linkId}`),
  listByAsset: (assetId: string) => api.get(`/assets/${assetId}/glossary`),
}

// Catalog
export const catalogApi = {
  search: (params: object) => api.get('/catalog/search', { params }),
  facets: (params?: object) => api.get('/catalog/facets', { params }),
  popular: () => api.get('/catalog/popular'),
  recent: () => api.get('/catalog/recent'),
  domainAssets: (domainId: string) => api.get(`/catalog/domains/${domainId}/assets`),
  assetDetail: (assetId: string) => api.get(`/catalog/assets/${assetId}`),
  savedSearches: {
    list: () => api.get('/catalog/saved-searches'),
    save: (payload: { name: string; query?: string; filters?: object }) =>
      api.post('/catalog/saved-searches', payload),
    delete: (searchId: string) => api.delete(`/catalog/saved-searches/${searchId}`),
  },
}

// Data Products
export const dataProductsApi = {
  list: (params?: object) => api.get('/data-products', { params }),
  get: (id: string) => api.get(`/data-products/${id}`),
  create: (data: object) => api.post('/data-products', data),
  update: (id: string, data: object) => api.put(`/data-products/${id}`, data),
  delete: (id: string) => api.delete(`/data-products/${id}`),
  quality: (id: string) => api.get(`/data-products/${id}/quality`),
  addAsset: (productId: string, assetId: string, role: string) =>
    api.post(`/data-products/${productId}/assets`, { asset_id: assetId, role }),
  removeAsset: (productId: string, linkId: string) =>
    api.delete(`/data-products/${productId}/assets/${linkId}`),
}

// Governance
export const governanceApi = {
  policies: () => api.get('/governance/policies'),
  createPolicy: (data: object) => api.post('/governance/policies', data),
  evaluate: () => api.post('/governance/policies/evaluate'),
  violations: (params?: object) => api.get('/governance/violations', { params }),
  resolveViolation: (id: string) => api.post(`/governance/violations/${id}/resolve`),
  scorecards: () => api.get('/governance/scorecards'),
  scorecard: (domainId: string) => api.get(`/governance/scorecards/${domainId}`),
  subdomainScorecards: (domainId: string) => api.get(`/governance/scorecards/${domainId}/subdomains`),
}

// Data Contracts
export const contractsApi = {
  list: (params?: object) => api.get('/contracts', { params }),
  get: (id: string) => api.get(`/contracts/${id}`),
  create: (data: object) => api.post('/contracts', data),
  update: (id: string, data: object) => api.put(`/contracts/${id}`, data),
  delete: (id: string) => api.delete(`/contracts/${id}`),
  validate: (id: string) => api.post(`/contracts/${id}/validate`),
  byAsset: (assetId: string) => api.get(`/contracts/assets/${assetId}/contracts`),
}

// Rule Marketplace
export const marketplaceApi = {
  list:     (params?: object) => api.get('/marketplace/templates', { params }),
  popular:  ()                => api.get('/marketplace/templates/popular'),
  featured: ()                => api.get('/marketplace/templates/featured'),
  import:   (id: string, data: object) => api.post(`/marketplace/templates/${id}/import`, data),
  rate:     (id: string, rating: number) => api.post(`/marketplace/templates/${id}/rate`, { rating }),
  create:   (data: object)    => api.post('/marketplace/templates', data),
  seed:     ()                => api.post('/marketplace/seed'),
}

// Incidents
export const incidentsApi = {
  list: (params?: object) => api.get('/incidents', { params }),
  get: (id: string) => api.get(`/incidents/${id}`),
  create: (data: object) => api.post('/incidents', data),
  update: (id: string, data: object) => api.put(`/incidents/${id}`, data),
  investigate: (id: string) => api.post(`/incidents/${id}/investigate`),
  resolve: (id: string) => api.post(`/incidents/${id}/resolve`),
  stats: () => api.get('/incidents/stats'),
}

// Cost
export const costApi = {
  overview:     (params?: object) => api.get('/cost/overview', { params }),
  summary:      (params?: object) => api.get('/cost/summary', { params }),
  byDomain:     (params?: object) => api.get('/cost/by-domain', { params }),
  bySubdomain:  (params?: object) => api.get('/cost/by-subdomain', { params }),
  byAsset:      (params?: object) => api.get('/cost/by-asset', { params }),
  byTable:      (assetId: string, params?: object) => api.get(`/cost/by-table/${assetId}`, { params }),
  topTables:    (params?: object) => api.get('/cost/top-tables', { params }),
  updateConfig: (assetId: string, data: object) => api.put(`/cost/configs/${assetId}`, data),
  deleteConfig: (assetId: string) => api.delete(`/cost/configs/${assetId}`),
  listConfigs:  () => api.get('/cost/configs'),
}


// Observability
export const observabilityApi = {
  freshnessBoard: () => api.get('/observability/freshness-board'),
  slaBreachTimeline: () => api.get('/observability/sla-breach-timeline'),
  qualityHeatmap: () => api.get('/observability/quality-heatmap'),
}

// Compliance
export const complianceApi = {
  frameworks: () => api.get('/compliance/frameworks'),
  requirements: (frameworkId: string) => api.get(`/compliance/frameworks/${frameworkId}/requirements`),
  assess: (frameworkId: string, assetId: string) =>
    api.post(`/compliance/frameworks/${frameworkId}/assess/${assetId}`),
  report: (frameworkId: string) => api.get(`/compliance/report/${frameworkId}`),
  gaps: () => api.get('/compliance/gaps'),
  createMapping: (data: object) => api.post('/compliance/mappings', data),
  evidence: (mappingId: string) => api.get(`/compliance/evidence/${mappingId}`),
}

// Admin Utilities
export const adminApi = {
  listDomainsWithStats: () => api.get('/admin/domains'),
  cleanDomainData:      (domainId: string) => api.delete(`/admin/domains/${domainId}/data`),
  deleteDomain:         (domainId: string) => api.delete(`/admin/domains/${domainId}`),
}

// Lineage
export const lineageApi = {
  get: (assetId: string) => api.get(`/lineage/${assetId}`),
}
