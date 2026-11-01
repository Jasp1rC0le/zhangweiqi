import { passwordIssue } from './accountCredentials.js'

export function scrubAccountActionHistory(state, pathname, origin) {
  const clean = value => {
    if (typeof value !== 'string') return value
    try {
      const url = new URL(value, origin)
      return url.origin === origin && ['/reset-password', '/verify-email'].includes(url.pathname)
        ? url.pathname : value
    } catch { return value }
  }
  const next = { ...state }
  for (const key of ['back', 'current', 'forward']) next[key] = clean(next[key])
  next.current = pathname
  return next
}

export function createAccountActionFlow({ mode, state, form, request }) {
  let generation = 0, controller = new AbortController(), disposed = false
  const current = (epoch, kind) => !disposed && generation === epoch && mode() === kind
  function clear() { for (const key of ['username', 'email', 'password', 'confirm']) form[key] = '' }
  async function initialize(token = '') {
    if (disposed) return
    generation++; controller.abort(); controller = new AbortController(); clear()
    Object.assign(state, { token: typeof token === 'string' && token.length <= 128 ? token : '', busy: false, done: false, errorText: '' })
    const epoch = generation, kind = mode()
    if (disposed || kind !== 'verify-email') return
    if (!state.token) { state.errorText = '验证链接不完整，请重新申请'; return }
    state.busy = true
    try {
      await request('/api/auth/email/verify', { token: state.token }, { signal: controller.signal })
      if (current(epoch, kind)) { state.done = true; state.token = '' }
    } catch (error) { if (current(epoch, kind)) state.errorText = error.response?.data?.message || '验证链接无效或已过期' }
    finally { if (current(epoch, kind)) state.busy = false }
  }
  async function submit() {
    if (disposed || state.busy || state.done) return
    const epoch = generation, kind = mode()
    state.errorText = ''
    if (!['forgot-password', 'reset-password'].includes(kind)) return
    if (kind === 'reset-password') {
      if (!state.token) { state.errorText = '重置链接不完整，请重新申请'; return }
      const issue = passwordIssue(form.password, form.confirm)
      if (issue) { state.errorText = issue; return }
    } else if (!form.username.trim() || !form.email.trim()) { state.errorText = '请填写登录账号和已验证邮箱'; return }
    state.busy = true
    try {
      await request(kind === 'forgot-password' ? '/api/auth/password-reset/request' : '/api/auth/password-reset/confirm',
        kind === 'forgot-password' ? { username: form.username.trim(), email: form.email.trim() } : { token: state.token, password: form.password },
        { signal: controller.signal })
      if (!current(epoch, kind)) return
      state.done = true; form.password = ''; form.confirm = ''
      if (kind === 'reset-password') state.token = ''
    } catch (error) { if (current(epoch, kind)) state.errorText = error.response?.data?.message || '操作未确认，请稍后核对再重试' }
    finally { if (current(epoch, kind)) state.busy = false }
  }
  return { initialize, submit,
    edit() { if (!disposed && mode() === 'forgot-password' && !state.busy) { state.done = false; state.errorText = '' } },
    dispose() { disposed = true; generation++; controller.abort(); clear(); state.token = ''; state.busy = false; state.done = false; state.errorText = '' },
  }
}
