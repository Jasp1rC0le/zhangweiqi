import http from '@/api/http'

export async function createKnowledgeSubmission(payload, { signal } = {}) {
  const response = await http.post('/api/knowledge-submissions', payload, { signal })
  return response.data
}

export async function getMyKnowledgeSubmissions({ signal } = {}) {
  const response = await http.get('/api/knowledge-submissions/mine', { signal })
  return response.data
}
