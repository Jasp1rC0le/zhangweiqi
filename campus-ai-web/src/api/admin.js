import { adminHttp as http } from './http'
import { scanKnowledgeDocuments } from './knowledgeScan.js'

export async function getAiDailyCosts(from, until, options = {}) {
  return (await http.get('/api/admin/ai-budget/daily', { ...options, params: { from, until } })).data
}

export async function getAdminCanteens(options = {}) {
  return (await http.get('/api/admin/canteens', options)).data
}

export async function getAdminCanteenMerchants(options = {}) {
  return (await http.get('/api/admin/canteens/merchants', options)).data
}

export async function saveAdminCanteen(payload, id = null, options = {}) {
  return (await (id
    ? http.put(`/api/admin/canteens/${id}`, payload, options)
    : http.post('/api/admin/canteens', payload, options))).data
}

export async function saveAdminCanteenMerchant(payload, id = null, options = {}) {
  return (await (id
    ? http.put(`/api/admin/canteens/merchants/${id}`, payload, options)
    : http.post('/api/admin/canteens/merchants', payload, options))).data
}

export async function setAdminCanteenPublished(id, published, options = {}) {
  return (await http.put(`/api/admin/canteens/${id}/status`, { published }, options)).data
}

export async function setAdminMerchantPublished(id, published, options = {}) {
  return (await http.put(`/api/admin/canteens/merchants/${id}/status`, { published }, options)).data
}

export async function setAdminMerchantOperatingStatus(id, status, options = {}) {
  return (await http.put(`/api/admin/canteens/merchants/${id}/operating-status`, { status }, options)).data
}

export async function uploadAdminMerchantPhoto(id, file, options = {}) {
  const body = new FormData()
  body.append('file', file)
  return (await http.post(`/api/admin/canteens/merchants/${id}/photo`, body, options)).data
}

export async function getAdminMerchantReviews(options = {}) {
  return (await http.get('/api/admin/canteens/reviews', options)).data
}

export async function setAdminMerchantReviewStatus(id, status, expectedComment, options = {}) {
  return (await http.put(`/api/admin/canteens/reviews/${id}/status`, { status, expectedComment }, options)).data
}

export async function getAdminOverview() {
  const response = await http.get('/api/admin/overview')
  return response.data
}

export async function getFailedBackgroundJobs() {
  const response = await http.get('/api/admin/background-jobs', { params: { status: 'FAILED' } })
  return response.data
}

export async function retryBackgroundJob(id, options = {}) {
  await http.post(`/api/admin/background-jobs/${id}/retry`, undefined, options)
}

export async function getPendingKnowledgeSubmissions() {
  const response = await http.get('/api/admin/knowledge-submissions')
  return response.data
}

export async function approveKnowledgeSubmission(submissionId, options = {}) {
  const response = await http.post(`/api/admin/knowledge-submissions/${submissionId}/approve`, undefined, options)
  return response.data
}

export async function rejectKnowledgeSubmission(submissionId, reviewNote, options = {}) {
  const response = await http.post(`/api/admin/knowledge-submissions/${submissionId}/reject`, {
    reviewNote,
  }, options)
  return response.data
}

export async function mergeKnowledgeSubmission(submissionId, documentId, payload, options = {}) {
  const response = await http.post(`/api/admin/knowledge-submissions/${submissionId}/merge/${documentId}`, payload, options)
  return response.data
}

export async function getContactMessages() {
  const response = await http.get('/api/admin/contact-messages')
  return response.data
}

export async function markContactMessageHandled(messageId, options = {}) {
  const response = await http.post(`/api/admin/contact-messages/${messageId}/handled`, undefined, options)
  return response.data
}

export async function getMessageFeedback() {
  const response = await http.get('/api/admin/message-feedback')
  return response.data
}

export async function resolveMessageFeedback(id, note, documentId, options = {}) {
  const response = await http.post(`/api/admin/message-feedback/${id}/resolve`, {
    note, documentId: documentId ? Number(documentId) : null,
  }, options)
  return response.data
}

export async function getModelUsage() {
  const response = await http.get('/api/admin/model-usage')
  return response.data
}

export async function getAiBudget(options = {}) {
  return (await http.get('/api/admin/ai-budget', options)).data
}

export async function importKnowledgeDocument(payload, options = {}) {
  const response = await http.post('/api/admin/knowledge/documents', payload, options)
  return response.data
}

export async function previewKnowledgeUrl(url, options = {}) {
  const response = await http.post('/api/admin/knowledge/preview-url', { url }, options)
  return response.data
}

export async function previewKnowledgeSite(payload) {
  const response = await http.post('/api/admin/knowledge/preview-site', payload)
  return response.data
}

export async function previewKnowledgeFile(file, options = {}) {
  const results = await previewKnowledgeFiles([file], options)
  return results[0]
}

export async function previewKnowledgeFiles(files, options = {}) {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  const response = await http.post('/api/admin/knowledge/preview-files', form, options)
  return response.data
}

export async function importKnowledgeBatch(payloads) {
  const response = await http.post('/api/admin/knowledge/documents/batch', payloads)
  return response.data
}

export async function reviseKnowledgeBatch(revisions) {
  const response = await http.post('/api/admin/knowledge/documents/revisions/batch', revisions)
  return response.data
}

export async function getKnowledgeUpdateCandidates() {
  const response = await http.get('/api/admin/knowledge/update-candidates')
  return response.data
}

export async function checkKnowledgeDocumentUpdate(id, options = {}) {
  await http.post(`/api/admin/knowledge/documents/${id}/check-update`, undefined, options)
}

export async function applyKnowledgeUpdate(id, options = {}) {
  const response = await http.post(`/api/admin/knowledge/update-candidates/${id}/apply`, undefined, options)
  return response.data
}

export async function dismissKnowledgeUpdate(id, options = {}) {
  await http.post(`/api/admin/knowledge/update-candidates/${id}/dismiss`, undefined, options)
}

export async function getCareerEmployers(options = {}) {
  const response = await http.get('/api/admin/career/employers', options)
  return response.data
}

export async function getEmployerCandidates(status = 'PENDING', options = {}) {
  const response = await http.get('/api/admin/career/employer-candidates', { ...options, params: { status } })
  return response.data
}

export async function discoverEmployerCandidates(keyword = '', options = {}) {
  const response = await http.post('/api/admin/career/employer-candidates/discover', { keyword }, options)
  return response.data
}

export async function importEmployerCandidate(id, payload, options = {}) {
  const response = await http.post(`/api/admin/career/employer-candidates/${id}/import`, payload, options)
  return response.data
}

export async function rejectEmployerCandidate(id, options = {}) {
  const response = await http.post(`/api/admin/career/employer-candidates/${id}/reject`, undefined, options)
  return response.data
}

export async function saveCareerEmployer(payload, id = null, options = {}) {
  const response = id
    ? await http.put(`/api/admin/career/employers/${id}`, payload, options)
    : await http.post('/api/admin/career/employers', payload, options)
  return response.data
}

export async function setCareerEmployerPublished(id, published, options = {}) {
  const response = await http.put(`/api/admin/career/employers/${id}/status`, { published }, options)
  return response.data
}

export async function getCareerJobs(options = {}) {
  const response = await http.get('/api/admin/career/jobs', options)
  return response.data
}

export async function saveCareerJob(payload, id = null, options = {}) {
  const response = id
    ? await http.put(`/api/admin/career/jobs/${id}`, payload, options)
    : await http.post('/api/admin/career/jobs', payload, options)
  return response.data
}

export async function setCareerJobPublished(id, published, options = {}) {
  const response = await http.put(`/api/admin/career/jobs/${id}/status`, { published }, options)
  return response.data
}

export async function getKnowledgeDocuments() {
  let generation
  return scanKnowledgeDocuments(async (beforeId, signal) => {
    const response = await http.get('/api/admin/knowledge/documents/scan', {
      params: { beforeId }, signal, _sessionGeneration: generation,
    })
    // Pin every page to the session that returned the first page.
    generation = response.config._sessionGeneration
    return response.data
  })
}

export async function getKnowledgeDocument(id, options = {}) {
  const response = await http.get(`/api/admin/knowledge/documents/${id}`, options)
  return response.data
}

export async function getKnowledgeDocumentVersions(id, options = {}) {
  const response = await http.get(`/api/admin/knowledge/documents/${id}/versions`, options)
  return response.data
}

export async function reviseKnowledgeDocument(id, payload, options = {}) {
  const response = await http.post(`/api/admin/knowledge/documents/${id}/revisions`, payload, options)
  return response.data
}

export async function changeKnowledgeStatus(id, published, note, options = {}) {
  const response = await http.put(`/api/admin/knowledge/documents/${id}/status`, { published, note }, options)
  return response.data
}

export async function getKnowledgeEvaluationCases() {
  const response = await http.get('/api/admin/knowledge/evaluation-cases')
  return response.data
}

export async function addKnowledgeEvaluationCase(question, expectedDocumentId, options = {}) {
  const response = await http.post('/api/admin/knowledge/evaluation-cases', {
    question, expectedDocumentId,
  }, options)
  return response.data
}

export async function deleteKnowledgeEvaluationCase(id, options = {}) {
  await http.delete(`/api/admin/knowledge/evaluation-cases/${id}`, options)
}

export async function runKnowledgeEvaluation(options = {}) {
  const response = await http.post('/api/admin/knowledge/evaluate', undefined, options)
  return response.data
}

export async function indexNextKnowledgeBatch(options = {}) {
  const response = await http.post('/api/admin/knowledge/semantic-index/next', undefined, options)
  return response.data
}
