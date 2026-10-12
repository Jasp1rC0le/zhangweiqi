import http from './http'

export async function getCanteens() {
  const response = await http.get('/api/canteens')
  return response.data
}

export async function getCanteenMerchants() {
  const response = await http.get('/api/canteens/merchants')
  return response.data
}

export async function getCanteenMerchantReviews(id) {
  return (await http.get(`/api/canteens/merchants/${id}/reviews`)).data
}

export async function likeCanteenReview(merchantId, reviewId, liked) {
  return (await http.put(`/api/canteens/merchants/${merchantId}/reviews/${reviewId}/like`, { liked })).data
}

export function canteenMerchantPhotoUrl(id, version = '') {
  const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  return `${base}/api/canteens/merchants/${id}/photo${version ? `?v=${version}` : ''}`
}

export async function rateCanteenMerchant(id, score, comment) {
  const response = await http.put(`/api/canteens/merchants/${id}/rating`, { score, comment })
  return response.data
}
