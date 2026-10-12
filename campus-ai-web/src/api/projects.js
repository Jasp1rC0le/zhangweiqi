import http from './http'

export const listProjects = async () => (await http.get('/api/projects')).data
export const getProject = async (id) => (await http.get(`/api/projects/${id}`)).data
// Refuse writes to an older backend instead of silently dropping new private fields.
async function requireDataSupport(content) {
  if (!content.dataSheet && !content.reviewFeedback?.length) return
  try {
    const { data } = await http.get('/api/projects/capabilities')
    if ((!content.dataSheet || data.dataSheetVersion >= 1) && (!content.reviewFeedback?.length || data.reviewFeedbackVersion >= 1) && (!content.dataSheet?.calculation || data.calculationVersion >= 1)) return
  } catch (error) {
    if (error.response?.status !== 404) throw error
  }
  throw { response: { data: { message: '后端尚未加载当前项目能力版本，请在原运行环境重启后端再保存。当前草稿未提交，可先导出备份' } } }
}
export async function createProject(id, content) {
  await requireDataSupport(content)
  return (await http.post('/api/projects', { id, content })).data
}
export async function saveProject(id, revision, content, archived) {
  await requireDataSupport(content)
  return (await http.put(`/api/projects/${id}`, { revision, content, archived })).data
}
export const listVersions = async (id) => (await http.get(`/api/projects/${id}/versions`)).data
export const getVersion = async (id, revision) => (await http.get(`/api/projects/${id}/versions/${revision}`)).data
export const removeProject = async (id, revision) => http.delete(`/api/projects/${id}`, { params: { revision } })
