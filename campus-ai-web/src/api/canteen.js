import http from './http'

export async function getCanteens(options = {}) {
  const response = await http.get('/api/canteens', options)
  return response.data
}

export async function getCanteenMerchants(options = {}) {
  const response = await http.get('/api/canteens/merchants', options)
  return response.data
}

export async function getCanteenMerchantReviews(id, options = {}) {
  return (await http.get(`/api/canteens/merchants/${id}/reviews`, options)).data
}

export async function likeCanteenReview(merchantId, reviewId, liked, options = {}) {
  return (await http.put(`/api/canteens/merchants/${merchantId}/reviews/${reviewId}/like`, { liked }, options)).data
}

export async function reportCanteenReview(merchantId, reviewId, reason, options = {}) {
  await http.post(`/api/canteens/merchants/${merchantId}/reviews/${reviewId}/report`, { reason }, options)
}

export function canteenMerchantPhotoUrl(id, version = '', preview = false) {
  const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const query = new URLSearchParams()
  if (version) query.set('v', version)
  if (preview) query.set('preview', 'true')
  return `${base}/api/canteens/merchants/${id}/photo${query.size ? `?${query}` : ''}`
}

export function canteenGalleryPhotoUrl(id, photoId) {
  if (photoId === 0) return canteenMerchantPhotoUrl(id)
  const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  return `${base}/api/canteens/merchants/${id}/photos/${photoId}`
}

export async function getMerchantPhotos(id, options = {}) {
  return (await http.get(`/api/canteens/merchants/${id}/photos`, options)).data
}

export async function rateCanteenMerchant(id, score, comment, options = {}) {
  const response = await http.put(`/api/canteens/merchants/${id}/rating`, { score, comment }, options)
  return response.data
}
