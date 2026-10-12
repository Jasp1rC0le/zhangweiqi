import http from '@/api/http'

export async function createKnowledgeSubmission(payload) {
  const response = await http.post('/api/knowledge-submissions', payload)
  return response.data
}

export async function getMyKnowledgeSubmissions() {
  const response = await http.get('/api/knowledge-submissions/mine')
  return response.data
}
