import { createAdminEditorScope } from './adminEditorScope.js'
import { createScopedAdminActions } from './scopedAdminActions.js'

export function createWallModerationState() {
  return {
    entries: [],
    reports: [],
    loading: false,
    busy: false,
    error: '',
    success: '',
    notes: {},
    parents: {},
    needsReload: false,
  }
}

const entryValid = (entry) =>
  entry &&
  typeof entry.id === 'string' &&
  entry.id.length > 0 &&
  Number.isSafeInteger(entry.revision) &&
  entry.revision > 0 &&
  ['PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN'].includes(entry.status) &&
  typeof entry.title === 'string' &&
  typeof entry.body === 'string'
const fingerprint = (entry) =>
  JSON.stringify([entry.id, entry.revision, entry.status, entry.title, entry.body])
const failure = (error, fallback) =>
  error?.response?.data?.detail || error?.response?.data?.message || fallback

// Public moderation data and notes stay in this administrator's mounted panel.
export function createWallModeration({ owner, state, api, confirm }) {
  const reads = createAdminEditorScope(owner, () => null)
  const actions = createScopedAdminActions(
    owner,
    () => !disposed && !state.loading && !state.busy && !state.needsReload,
  )
  let disposed = false,
    sequence = 0
  function reset() {
    sequence++
    reads.invalidate()
    actions.invalidate()
    Object.assign(state, createWallModerationState())
  }
  function dispose() {
    disposed = true
    sequence++
    reads.dispose()
    actions.dispose()
    Object.assign(state, createWallModerationState())
  }
  async function load({ afterWrite = false, current = () => true } = {}) {
    if (disposed || !reads.key() || (!afterWrite && state.busy)) return false
    const ticket = reads.capture({ abortable: true }),
      request = ++sequence
    const active = () => ticket.current() && request === sequence && current()
    state.loading = true
    state.error = ''
    try {
      const [entries, reports] = await Promise.all([
        api.wallQueue({ signal: ticket.signal }),
        api.wallReports({ signal: ticket.signal }),
      ])
      if (!active()) return false
      if (
        !Array.isArray(entries) ||
        entries.length > 100 ||
        !entries.every(entryValid) ||
        !Array.isArray(reports) ||
        reports.length > 300 ||
        !reports.every(
          (report) =>
            report &&
            typeof report.entryId === 'string' &&
            typeof report.reason === 'string' &&
            Number.isSafeInteger(report.count) &&
            report.count >= 0,
        )
      ) {
        throw new Error('Invalid moderation response')
      }
      state.entries = entries
      state.reports = reports
      state.parents = {}
      state.needsReload = false
      return true
    } catch (error) {
      if (active()) {
        state.error = afterWrite
          ? '审核已提交，但队列刷新失败。请刷新队列，不要重复审核。'
          : failure(error, '校园墙审核服务未就绪，请刷新队列重试；保留上次内容。')
        state.needsReload = true
      }
      return false
    } finally {
      if (active()) state.loading = false
      ticket.release()
    }
  }
  async function context(id) {
    if (
      disposed ||
      !reads.key() ||
      state.busy ||
      state.loading ||
      !state.entries.some((entry) => entry.parentId === id)
    )
      return false
    const ticket = reads.capture({ abortable: true })
    state.busy = true
    state.error = ''
    try {
      const parent = await api.wallModerationContext(id, { signal: ticket.signal })
      if (!ticket.current() || !state.entries.some((entry) => entry.parentId === id)) return false
      if (!entryValid(parent) || parent.id !== id) throw new Error('Invalid parent response')
      state.parents[id] = parent
      return true
    } catch (error) {
      if (ticket.current())
        state.error = failure(error, '无法读取关联主题，请重试；不影响原审核说明。')
      return false
    } finally {
      if (ticket.current()) state.busy = false
      ticket.release()
    }
  }
  async function review(entry, status) {
    if (!entryValid(entry) || !['PUBLISHED', 'REJECTED', 'HIDDEN'].includes(status)) return false
    const id = entry.id,
      original = fingerprint(entry),
      note = String(state.notes[id] || '').trim()
    const payload = Object.freeze({ revision: entry.revision, status, note })
    if (note.length > 300) {
      state.error = '审核说明最多300字，请缩短后再提交。'
      return false
    }
    return actions.run({
      confirm: () =>
        confirm(
          status === 'PUBLISHED'
            ? `确认公开或保留“${entry.title || '这条回复'}”？请先核对隐私与来源；同时处理该内容的举报。`
            : `确认${status === 'HIDDEN' ? '隐藏' : '不通过'}“${entry.title || '这条回复'}”？发布者会看到审核结果。`,
          { title: '确认校园墙审核', confirmText: '提交审核', cancelText: '取消，保留说明' },
        ),
      targetCurrent: () =>
        state.entries.some((item) => item.id === id && fingerprint(item) === original) &&
        String(state.notes[id] || '').trim() === note,
      outdated: () => {
        state.error = '内容或审核说明已变化，请重新核对后提交。'
      },
      execute: (signal) => api.reviewWall(id, payload, { signal }),
      committed: () => {
        state.entries = state.entries.filter((item) => item.id !== id)
        state.reports = state.reports.filter((report) => report.entryId !== id)
        if (String(state.notes[id] || '').trim() === note) delete state.notes[id]
        state.parents = {}
        state.success = '审核已提交。'
      },
      refresh: (current) => load({ afterWrite: true, current }),
      failed: (error) => {
        state.error = failure(error, '未能确认审核是否提交，请先刷新队列核对，不要直接重复提交。')
        state.needsReload = true
      },
      refreshFailed: () => {
        state.error = '审核已提交，但页面更新失败。请刷新队列，不要重复审核。'
        state.needsReload = true
      },
      pending: (value) => {
        state.busy = value
        if (value) {
          state.error = ''
          state.success = ''
        }
      },
    })
  }
  return { key: actions.key, reset, dispose, load, context, review }
}
