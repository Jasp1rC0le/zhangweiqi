import http from './http'
export const listWall = async (params) => (await http.get('/api/wall', { params })).data
export const getWall = async (id) => (await http.get(`/api/wall/${id}`)).data
export const postWall = async (body) => (await http.post('/api/wall', body)).data
export const listComments = async (id, offset=0) => (await http.get(`/api/wall/${id}/comments`, { params:{offset} })).data
export const postComment = async (id, body) => (await http.post(`/api/wall/${id}/comments`, body)).data
export const likeWall = (id, liked) => http.put(`/api/wall/${id}/like`, { liked })
export const deleteWall = (id) => http.delete(`/api/wall/${id}`)
export const reportWall = (id, reason) => http.post(`/api/wall/${id}/report`, { reason })
export const wallQueue = async (options={}) => (await http.get('/api/admin/wall',options)).data
export const wallReports = async (options={}) => (await http.get('/api/admin/wall/reports',options)).data
export const wallModerationContext = async (id, options={}) => (await http.get(`/api/admin/wall/${id}`,options)).data
export const reviewWall = (id, body, options={}) => http.put(`/api/admin/wall/${id}`,body,options)
