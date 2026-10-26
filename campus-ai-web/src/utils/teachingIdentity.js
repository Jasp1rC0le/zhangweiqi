export const IDENTITY_ROLES = Object.freeze({ STUDENT: '学生', TEACHER: '教师', COUNSELOR: '辅导员', SECRETARY: '书记' })
export const IDENTITY_STATES = Object.freeze({ PENDING: '待审核', APPROVED: '身份已通过', REJECTED: '未通过', REVOKED: '已撤销' })
const staff = new Set(['TEACHER', 'COUNSELOR', 'SECRETARY'])
const states = new Set(Object.keys(IDENTITY_STATES))
const uuid = /^[a-f0-9-]{36}$/i
export function validatedIdentity(item) {
  if (!item || !uuid.test(item.id) || !Number.isSafeInteger(item.userId) || item.userId < 1 || !staff.has(item.requestedRole) || !states.has(item.status) || !Number.isSafeInteger(item.revision) || item.revision < 1 ||
    typeof item.username !== 'string' || item.username.length > 100 || typeof item.nickname !== 'string' || item.nickname.length > 100 || typeof item.reason !== 'string' || item.reason.length > 200 || !Number.isFinite(Date.parse(item.requestedAt)) || (item.reviewedAt !== null && !Number.isFinite(Date.parse(item.reviewedAt)))) throw new Error('身份申请响应异常，请重新读取')
  return { ...item }
}
export function validatedIdentityRead(data, admin, userId) {
  if (!data || !Array.isArray(data.items) || data.items.length > (admin ? 100 : 3)) throw new Error('身份列表响应异常')
  const items = data.items.map(validatedIdentity)
  if (new Set(items.map(i => i.id)).size !== items.length || (!admin && items.some(i => i.userId !== userId))) throw new Error('身份列表归属异常')
  if (!admin) {
    if (typeof data.enabled !== 'boolean' || (!data.enabled && items.length)) throw new Error('身份申请状态异常')
    return { enabled: data.enabled, items, page: 0, total: items.length, totalPages: 1 }
  }
  if (![data.page, data.size, data.total, data.totalPages].every(Number.isSafeInteger) || data.page < 0 || data.size < 1 || data.size > 100 || data.total < items.length || data.totalPages !== Math.ceil(data.total / data.size) || items.length > data.size) throw new Error('审核分页响应异常')
  return { ...data, enabled: true, items }
}
// An owner epoch fences reads, confirmations, writes and their refresh independently of tokens.
export function createIdentityResource({ state, owner, userId, admin, read, apply, review }) {
  let epoch = 0, controller, disposed = false
  function reset() {
    epoch++; controller?.abort()
    Object.assign(state, { busy: false, loaded: false, enabled: false, items: [], page: 0, total: 0, totalPages: 0, error: '', notice: '' })
  }
  function begin() {
    const key = owner(), turn = ++epoch
    controller?.abort(); controller = new AbortController()
    const signal = controller.signal
    state.busy = true; state.error = ''
    return { signal, current: () => !disposed && !!key && key === owner() && turn === epoch && !signal.aborted }
  }
  const message = e => e.response?.data?.message || e.message || '未确认成功，请重新读取状态后再试'
  async function load(query) {
    if (!owner() || state.busy || disposed) return false
    const op = begin()
    try {
      const { data } = await read(query, op.signal)
      if (!op.current()) return false
      Object.assign(state, validatedIdentityRead(data, admin, userId()), { loaded: true })
      return true
    } catch (e) { if (op.current()) state.error = message(e); return false }
    finally { if (op.current()) state.busy = false }
  }
  async function save({ item, input, query, confirm = async () => true }) {
    if (!owner() || state.busy || !state.loaded || !state.enabled || disposed) return false
    if (admin && !state.items.some(i => i.id === item?.id && i.revision === item.revision)) return false
    const op = begin()
    let acknowledged = false, committed = false
    state.notice = ''
    try {
      if (!(await confirm()) || !op.current()) return false
      const { data } = await (admin ? review(item.id, input, op.signal) : apply(input, op.signal))
      if (!op.current()) return false
      acknowledged = true
      const saved = validatedIdentity(data)
      if ((admin && saved.id !== item.id) || (!admin && saved.userId !== userId())) throw new Error('保存回执归属异常')
      committed = true
      state.items = [...state.items.filter(i => i.id !== saved.id), saved]
      state.notice = admin ? '审核已保存。教学范围仍需单独配置。' : '申请已提交；审核期间可继续使用学生基础功能。'
      const refreshed = await read(query, op.signal)
      if (!op.current()) return false
      Object.assign(state, validatedIdentityRead(refreshed.data, admin, userId()), { loaded: true })
      return true
    } catch (e) {
      if (op.current()) state.error = committed ? `操作已保存，但状态未刷新。请重新读取，不要重复提交。${message(e)}` : acknowledged ? `提交已收到响应，但回执未能核对。请刷新身份状态确认，不要重复提交。${message(e)}` : message(e)
      return false
    } finally { if (op.current()) state.busy = false }
  }
  return { load, save, reset, dispose() { disposed = true; reset() } }
}
