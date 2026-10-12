import http from '@/api/http'

export async function getModelOptions() {
  const response = await http.get('/api/models')
  return response.data
}
