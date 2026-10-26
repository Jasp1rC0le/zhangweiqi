import http from './http'
export const privateMaterialCapabilities = async (signal) =>
  (await http.get('/api/private-materials/capabilities', { signal })).data
export const listPrivateMaterials = async (page = 0, signal) =>
  (await http.get('/api/private-materials', { params: { page }, signal })).data
export const savePrivateMaterial = async (file, text, requestId, signal) => {
  const body = new FormData()
  body.append('file', file)
  body.append('text', text)
  body.append('requestId', requestId)
  return (await http.post('/api/private-materials', body, { signal, timeout: 45000 })).data
}
export const readPrivateMaterialText = async (id, signal) =>
  (await http.get(`/api/private-materials/${encodeURIComponent(id)}/text`, { signal })).data
export const downloadPrivateMaterial = async (info, signal) => {
  const response = await http.get(
    `/api/private-materials/${encodeURIComponent(info.id)}/download`,
    { responseType: 'blob', signal },
  )
  const buffer = await response.data.arrayBuffer()
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
  if (hash !== info.sha256 || buffer.byteLength !== info.bytes)
    throw new Error('原件下载校验失败，没有保存不完整文件。')
  return response.data
}
