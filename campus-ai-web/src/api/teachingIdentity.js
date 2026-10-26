import http from './http'
export const readMyTeachingIdentities = signal => http.get('/api/account/teaching-identities', { signal })
export const applyTeachingIdentity = (input, signal) => http.post('/api/account/teaching-identities', input, { signal })
export const readIdentityApplications = (params, signal) => http.get('/api/admin/teaching-identities', { params, signal })
export const reviewTeachingIdentity = (id, input, signal) => http.post(`/api/admin/teaching-identities/${id}/review`, input, { signal })
