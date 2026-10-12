import { createAdminEditorScope } from './adminEditorScope.js'
import { createScopedAdminActions } from './scopedAdminActions.js'

export const catalogId = (id) => Number.isSafeInteger(id) && id > 0
export const sameCatalogEntry = (items, snapshot) =>
  items.some((item) => item.id === snapshot.id && JSON.stringify(item) === JSON.stringify(snapshot))
export function validCatalogList(items, validate, maximum = 2000) {
  return (
    Array.isArray(items) &&
    items.length <= maximum &&
    new Set(items.map((item) => item?.id)).size === items.length &&
    items.every((item) => item && catalogId(item.id) && validate(item))
  )
}

export function createAdminCatalogState(collections) {
  return Object.fromEntries([
    ...collections.map((name) => [name, []]),
    ['loading', false],
    ['busy', false],
    ['error', ''],
    ['success', ''],
    ['needsReload', false],
  ])
}

// One mounted administrator owns both the catalog and any in-memory forms.
// Abort is not a rollback: an acknowledged write must never be offered as a retry.
export function createAdminCatalogScope({
  owner,
  state,
  collections,
  read,
  validate,
  onReset = () => {},
}) {
  const reads = createAdminEditorScope(owner, () => null)
  const actions = createScopedAdminActions(
    owner,
    () => !disposed && !state.loading && !state.needsReload,
  )
  let disposed = false,
    sequence = 0,
    operation = null
  const failure = (error, fallback) =>
    error?.response?.data?.detail || error?.response?.data?.message || fallback
  function clear() {
    Object.assign(state, createAdminCatalogState(collections))
    onReset()
  }
  function reset() {
    operation = null
    sequence++
    reads.invalidate()
    actions.invalidate()
    clear()
  }
  function dispose() {
    operation = null
    disposed = true
    sequence++
    reads.dispose()
    actions.dispose()
    clear()
  }
  async function load({ afterWrite = false, current = () => true } = {}) {
    if (disposed || !reads.key() || (!afterWrite && operation)) return false
    reads.invalidate()
    const ticket = reads.capture({ abortable: true }),
      request = ++sequence
    const active = () =>
      ticket.current() && !ticket.signal.aborted && request === sequence && current()
    state.loading = true
    state.error = ''
    try {
      const data = await read({ signal: ticket.signal })
      if (!active()) return false
      if (!validate(data)) throw new Error('Invalid catalog response')
      for (const key of collections) state[key] = data[key]
      state.needsReload = false
      return true
    } catch (error) {
      if (active()) {
        state.needsReload = true
        state.error = afterWrite
          ? '操作已提交，但列表刷新失败。请刷新核对，不要重复提交。'
          : failure(error, '资料暂时无法读取，请重试；原填写和上次列表保留。')
      }
      return false
    } finally {
      if (active()) state.loading = false
      ticket.release()
    }
  }
  async function run({
    confirm = async () => true,
    targetCurrent = () => true,
    execute,
    committed = () => {},
    success = '操作已提交。',
  }) {
    if (disposed || !actions.key() || operation || state.loading || state.needsReload) return false
    const key = actions.key()
    const currentOperation = Symbol('catalog operation')
    operation = currentOperation // Prevent repeats while scoped confirmation owns the UI lock.
    state.error = ''
    state.success = ''
    try {
      return await actions.run({
        confirm,
        targetCurrent,
        outdated: () => {
          state.error = '资料或填写已变化，请重新核对后操作。'
        },
        execute,
        committed: (result) => {
          state.success = typeof success === 'function' ? success(result) : success
          committed(result)
        },
        refresh: (current) => load({ afterWrite: true, current }),
        failed: (error) => {
          state.needsReload = true
          state.error = `${failure(error, '无法确认操作是否已提交。')} 请先刷新核对，原填写保留，不要直接重复提交。`
        },
        refreshFailed: () => {
          state.needsReload = true
          state.error = '操作已提交，但页面更新失败。请刷新核对，不要重复提交。'
        },
        pending: (value) => { state.busy = value },
      })
    } finally {
      if (operation === currentOperation && key === actions.key() && !disposed) {
        operation = null
        state.busy = false
      }
    }
  }
  return { key: actions.key, reset, dispose, load, run }
}
