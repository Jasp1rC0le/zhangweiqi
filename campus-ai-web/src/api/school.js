import http from '@/api/http'

export async function getSchools() {
  const response = await http.get('/api/schools')
  return response.data
}
