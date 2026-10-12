export const isAdministrator = user => user?.role === 'ADMIN'

// 身份由服务器返回，不读取本地缓存中自报的角色。
export async function adminDestination(loadCurrentUser) {
  try {
    const user = await loadCurrentUser()
    return isAdministrator(user) ? null : '/chat'
  } catch (error) {
    if (error?.response?.status === 401) return '/login'
    throw error
  }
}
