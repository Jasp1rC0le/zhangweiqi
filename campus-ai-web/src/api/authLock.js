// Serialize operations that rotate the shared HttpOnly cookie across tabs.
// No bearer token, account details or credentials are sent through the lock.
export function createAuthLock(locks, waitMs = 35000) {
  return async operation => {
    if (!locks?.request) return operation()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), waitMs)
    try {
      return await locks.request('campthink-auth-cookie-v1', {signal:controller.signal}, async () => {
        clearTimeout(timeout)
        return operation()
      })
    } catch (error) {
      if (controller.signal.aborted) throw new Error('其他页面正在更新登录状态，请稍后重试', {cause:error})
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}
