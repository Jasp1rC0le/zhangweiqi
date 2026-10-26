import http from './http'
const routes = {
  KNOWLEDGE_SUBMISSION: 'knowledge',
  MERCHANT_DRAFT: 'merchant',
  MERCHANT_APPLICATION: 'merchant-application',
}
export async function materialCapabilities(signal) {
  return (await http.get('/api/material-actions/capabilities', { signal })).data
}
export async function executeMaterialAction(kind, requestId, payload, signal) {
  if (!routes[kind]) throw new Error('未接入的资料操作')
  return (
    await http.post(`/api/material-actions/${routes[kind]}`, { requestId, payload }, { signal })
  ).data
}
export async function readMaterialReceipt(id, signal) {
  return (await http.get(`/api/material-actions/requests/${encodeURIComponent(id)}`, { signal }))
    .data
}
