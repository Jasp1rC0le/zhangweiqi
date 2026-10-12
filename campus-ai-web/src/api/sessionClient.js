import axios from 'axios'

export const isSessionExpired = error => error?.response?.status === 401

const publicPosts = new Set([
  '/api/auth/login', '/api/users', '/api/auth/password-reset/request',
  '/api/auth/password-reset/confirm', '/api/auth/email/verify',
])
// Exact method/path pairs, not an auth-path prefix. This is client recovery
// behavior only; the server remains responsible for authorization and throttling.
const isPublicRequest = config => (config.method === 'post' && publicPosts.has(config.url))
  || (config.method === 'get' && config.url === '/api/schools')

function principalKey(user) {
  const id = String(user?.id ?? '')
  const school = String(user?.schoolId ?? '')
  if (!/^[1-9]\d*$/.test(id) || !/^[1-9]\d*$/.test(school)) {
    throw new Error('登录身份响应异常，请稍后重试')
  }
  return `${id}:${school}`
}

// Explicit login/logout changes identity; renewal does not. Never replay an old
// request under a different account, or allow a late refresh to undo logout.
export function createSessionClient({ baseURL, onExpired = () => {}, adapter, withAuthLock = operation => operation(), checkExternal = () => {} } = {}) {
  const options = { baseURL, timeout: 30000, withCredentials: true, ...(adapter ? { adapter } : {}) }
  const http = axios.create(options)
  const refreshHttp = axios.create(options)
  let token = '', principal = null, generation = 0, refresh = null, notified = false, blocked = false
  const activeStreams = new Set()
  const activeRequests = new Set()
  const stale = () => new axios.CanceledError('登录状态已变化，请重新操作')
  const setToken = (value, user) => {
    const nextPrincipal = value && user !== undefined ? principalKey(user) : null
    principal = nextPrincipal
    token = value || ''; generation++; refresh = null; notified = false; blocked = false
    for (const controller of activeStreams) controller.abort(stale())
    activeStreams.clear()
    for (const request of activeRequests) { request.controller.abort(stale()); request.release() }
  }
  const expire = () => {
    if (notified) return
    setToken('')
    notified = true
    blocked = true
    onExpired()
  }
  function refreshAccess() {
    checkExternal()
    if (blocked) return Promise.reject(stale())
    if (refresh) return refresh
    const started = generation
    const pending = Promise.resolve().then(() => withAuthLock(async () => {
      checkExternal()
      if (started !== generation) throw stale()
      const { data } = await refreshHttp.post('/api/auth/refresh')
      checkExternal()
      if (started !== generation) throw stale()
      if (typeof data?.token !== 'string' || !data.token) throw new Error('登录续期响应异常，请稍后重试')
      const renewedPrincipal = principalKey(data.user)
      if (principal !== null && principal !== renewedPrincipal) {
        // A shared cookie may have changed in another tab. Never replay this
        // tab's private request under the new account or school.
        expire()
        throw stale()
      }
      principal = renewedPrincipal
      token = data.token
      return token
    })).catch(error => {
      if (started !== generation) throw stale()
      throw error
    }).finally(() => { if (refresh === pending) refresh = null })
    refresh = pending
    return pending
  }
  http.interceptors.request.use(config => {
    checkExternal()
    if (blocked && !isPublicRequest(config)) throw stale()
    if (config._sessionGeneration !== undefined && config._sessionGeneration !== generation) throw stale()
    config._sessionGeneration = generation
    // Retrying a 401 must keep the original caller's signal, not the released
    // controller composed for the previous attempt.
    const controller = new AbortController()
    const caller = Object.hasOwn(config, '_callerSignal') ? config._callerSignal : config.signal
    config._callerSignal = caller || null
    const cancel = () => controller.abort(caller.reason)
    const request = { controller, release() {
      caller?.removeEventListener('abort', cancel)
      activeRequests.delete(request)
    } }
    if (caller?.aborted) cancel()
    else caller?.addEventListener('abort', cancel, {once:true})
    config.signal = controller.signal
    config._releaseSessionRequest = request.release
    activeRequests.add(request)
    if (token && !isPublicRequest(config)) config.headers.Authorization = `Bearer ${token}`
    else delete config.headers.Authorization
    return config
  })
  http.interceptors.response.use(response => {
    response.config._releaseSessionRequest?.()
    checkExternal()
    if (response.config._sessionGeneration !== generation) throw stale()
    return response
  }, async error => {
    const config = error.config
    config?._releaseSessionRequest?.()
    checkExternal()
    if (config && config._sessionGeneration !== generation) throw stale()
    if (!isSessionExpired(error) || !config) throw error
    if (isPublicRequest(config) || ['/api/auth/logout', '/api/auth/refresh'].includes(config.url)) throw error
    if (config._retried) { expire(); throw error }
    config._retried = true
    try {
      if (config._callerSignal?.aborted) throw new axios.CanceledError('请求已取消')
      const renewal = refreshAccess(), caller = config._callerSignal
      // Renewal is shared. Cancel this wait without cancelling another view's
      // renewal, and do not leave a cancelled write waiting for a replay.
      await new Promise((resolve, reject) => {
        const cleanup = () => caller?.removeEventListener('abort', cancel)
        const cancel = () => { cleanup(); reject(new axios.CanceledError('请求已取消')) }
        caller?.addEventListener('abort', cancel, {once:true})
        renewal.then(value => { cleanup(); resolve(value) }, reason => { cleanup(); reject(reason) })
        if (caller?.aborted) cancel()
      })
    }
    catch (refreshError) {
      if (isSessionExpired(refreshError)) expire()
      throw refreshError
    }
    return http(config)
  })
  async function requestWithSession(request, consume, { signal, timeoutMs = 0 } = {}) {
    checkExternal()
    if (blocked) throw stale()
    const started = generation
    const controller = new AbortController()
    const cancel = () => controller.abort(new axios.CanceledError('请求已取消'))
    if (signal?.aborted) cancel()
    else signal?.addEventListener('abort', cancel, { once: true })
    const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(
      new axios.AxiosError('回答等待超时，请查看历史记录后重试', 'ECONNABORTED'),
    ), timeoutMs) : null
    activeStreams.add(controller)
    const checkIdentity = () => {
      checkExternal()
      if (started !== generation) throw stale()
      controller.signal.throwIfAborted()
    }
    // Refresh is shared by other requests; stop waiting without cancelling it.
    const waitForRefresh = () => new Promise((resolve, reject) => {
      checkIdentity()
      const interrupted = () => { cleanup(); reject(controller.signal.reason) }
      const cleanup = () => controller.signal.removeEventListener('abort', interrupted)
      controller.signal.addEventListener('abort', interrupted, { once: true })
      refreshAccess().then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
      if (controller.signal.aborted) interrupted()
    })
    try {
      checkIdentity()
      let response = await request(token, controller.signal)
      checkIdentity()
      if (response.status === 401) {
        // Release the rejected response before the single authorized retry.
        await response.body?.cancel().catch(() => {})
        try { await waitForRefresh() }
        catch (error) {
          checkIdentity()
          if (isSessionExpired(error)) expire()
          throw error
        }
        checkIdentity()
        response = await request(token, controller.signal)
        checkIdentity()
        if (response.status === 401) {
          expire()
          if (!consume) return response
          throw new axios.AxiosError('登录已失效，请重新登录', undefined, undefined, undefined, response)
        }
      }
      if (!consume) return response
      const result = await consume(response, { signal: controller.signal, assertActive: checkIdentity })
      checkIdentity()
      return result
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', cancel)
      activeStreams.delete(controller)
    }
  }
  return { http, getToken: () => token, setToken, refreshAccess, expire, requestWithSession }
}
