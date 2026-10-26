import http from './http'
export const readPersonalEditReceipt = async (id,signal) => (await http.get(`/api/timetable/personal-editing/requests/${encodeURIComponent(id)}`,{signal})).data
export const readPersonalTerms = async (signal) =>
  (await http.get('/api/timetable/personal-editing', { signal })).data
export const readPersonalHistory = async (page = 0, signal) =>
  (await http.get('/api/timetable/personal-editing/history', { params: { page }, signal })).data
export const readPersonalRevision = async (revision, signal) =>
  (await http.get(`/api/timetable/personal-editing/history/${revision}`, { signal })).data
export const savePersonalEdits = async (requestId, payload, signal) =>
  (await http.post('/api/timetable/personal-editing', { requestId, payload }, { signal })).data
