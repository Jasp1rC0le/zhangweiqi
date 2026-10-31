import { createHomeAgenda, homeAgendaDestination } from './homeAgenda.js'
import { chinaDate } from './timetable.js'
import { privateCourseDigest } from './privateCourseExport.js'

export const CLASS_REMINDER_MINUTES = Object.freeze([5, 10, 15, 30])
const day = 86400000, maximumAge = 120000
const encoder = new TextEncoder()
export function dueClassReminders(result, minutes, current, receivedAt) {
  if (!CLASS_REMINDER_MINUTES.includes(minutes) || !result?.display || !Number.isFinite(current) || !Number.isFinite(receivedAt)
    || current < receivedAt || current - receivedAt > maximumAge || result.display.state === 'UNRESOLVED') return []
  const serverTime = Date.parse(result.asOf)
  if (!Number.isFinite(serverTime)) return []
  const now = serverTime + current - receivedAt
  return result.display.entries.filter(row => {
    if (!row.startTime || !row.endTime || row.cancelled) return false
    const start = Date.parse(`${row.date}T${row.startTime}+08:00`)
    return Number.isFinite(start) && start > now && start - now <= minutes * 60000
  }).map(row => ({ ...row, minutesUntil: Math.max(1, Math.ceil((Date.parse(`${row.date}T${row.startTime}+08:00`) - now) / 60000)) }))
}

// Persist preferences and opaque delivered-event digests, never course names, rooms or rosters.
export function createClassReminders({ state, owner, preferenceOwner, read, visible = () => true, storage,
  now = Date.now, digest = privateCourseDigest, claim = (_name, work) => work() }) {
  let principal = '', key = '', epoch = 0, receivedAt = 0, attemptedAt = 0, disposed = false, evaluating = false
  let records = [], evaluationTail = Promise.resolve()
  const resource = createHomeAgenda({ owner: () => !disposed && state.enabled && visible() && principal === owner() ? principal : '', state, read,
    today: () => chinaDate(new Date(now())) })
  function saved() {
    if (!key) return null
    try {
      const raw = storage?.getItem(key)
      if (!raw || raw.length > 20000) return null
      const value = JSON.parse(raw)
      if (value.version !== 1 || typeof value.enabled !== 'boolean' || !CLASS_REMINDER_MINUTES.includes(value.minutes) || !Array.isArray(value.delivered)) return null
      return value
    } catch { return null }
  }
  function latestRecords() {
    const all = [...records, ...(saved()?.delivered || [])]
    records = [...new Map(all.filter(row => /^[a-f0-9]{64}$/.test(row?.key) && Number.isFinite(row.at)
      && now() >= row.at && now() - row.at < day).map(row => [row.key, row])).values()].slice(-64)
    return records
  }
  function persist() {
    if (!key || disposed) return
    try {
      if (!storage) throw new Error('unavailable')
      storage.setItem(key, JSON.stringify({ version: 1, enabled: state.enabled, minutes: state.minutes, delivered: records }))
      state.storageUnavailable = false
    } catch { state.storageUnavailable = true }
  }
  function clearLive() { epoch++; resource.reset(); state.banner = null; receivedAt = 0; attemptedAt = 0; evaluating = false }
  function syncOwner() {
    clearLive(); principal = owner(); key = principal && preferenceOwner() ? `campthink.class-reminders.v1.${encodeURIComponent(preferenceOwner())}` : ''
    records = []; const value = key ? saved() : null
    state.enabled = Boolean(value?.enabled); state.minutes = value?.minutes || 10; state.storageUnavailable = false
    latestRecords()
  }
  async function refresh() {
    if (disposed || !state.enabled || !visible() || !principal || principal !== owner() || state.loading) return false
    const generation = ++epoch, currentOwner = principal
    state.banner = null; attemptedAt = now()
    const ok = await resource.load('TODAY')
    if (!ok || disposed || generation !== epoch || currentOwner !== owner()) return false
    receivedAt = now(); state.checkedAt = receivedAt
    await tick()
    return true
  }
  async function tick() {
    if (disposed || !state.enabled || !visible() || principal !== owner() || state.loading || state.error || evaluating) return false
    if (state.banner && now() - state.banner.createdAt >= 45000) state.banner = null
    const generation = epoch, currentOwner = principal
    const rows = dueClassReminders(state.result, state.minutes, now(), receivedAt)
    if (!rows.length) { state.banner = null; return false }
    evaluating = true
    // Serializes this tab's ticks; persistent digests provide a best-effort cross-tab check.
    const operation = evaluationTail.then(async () => {
      const values = await Promise.all(rows.map(async row => ({ row, key: await digest(encoder.encode(`${preferenceOwner()}|${row.id}|${row.date}|${row.startTime}`)) })))
      return claim(key, () => {
        if (disposed || generation !== epoch || currentOwner !== owner() || !state.enabled || !visible()) return false
        const fresh = dueClassReminders(state.result, state.minutes, now(), receivedAt)
        const currentKeys = new Set(fresh.map(row => `${row.id}|${row.date}|${row.startTime}`))
        const seen = new Set(latestRecords().map(row => row.key))
        const eligible = values.filter(value => !seen.has(value.key) && currentKeys.has(`${value.row.id}|${value.row.date}|${value.row.startTime}`))
        if (!eligible.length) return false
        records = [...records, ...eligible.map(value => ({ key: value.key, at: now() }))].slice(-64); persist()
        state.banner = { owner: currentOwner, rows: eligible.map(value => value.row), createdAt: now(),
          destination: homeAgendaDestination({ ...state.result, display: { ...state.result.display, entries: [eligible[0].row] } }) }
        return true
      })
    })
    evaluationTail = operation.catch(() => false)
    try { return await operation } catch {
      if (!disposed && generation === epoch && currentOwner === owner()) state.error = '提醒暂未准备好，请重试；日历文件仍可单独导出'
      return false
    } finally { if (generation === epoch) evaluating = false }
  }
  async function configure(enabled, minutes = state.minutes) {
    if (disposed || !principal || principal !== owner() || typeof enabled !== 'boolean' || !CLASS_REMINDER_MINUTES.includes(minutes)) return false
    clearLive(); state.enabled = enabled; state.minutes = minutes; latestRecords(); persist()
    return enabled ? refresh() : true
  }
  function suspend() { clearLive() }
  function storageChanged(changedKey) {
    if (!key || changedKey !== key || disposed) return false
    const value = saved(), enabled = Boolean(value?.enabled), minutes = value?.minutes || 10
    latestRecords()
    if (enabled === state.enabled && minutes === state.minutes) return false
    clearLive(); state.enabled = enabled; state.minutes = minutes
    return true
  }
  function needsRefresh() {
    if (state.error && now() >= attemptedAt && now() - attemptedAt < 60000) return false
    return !state.result || now() < receivedAt || now() - receivedAt >= 60000 || chinaDate(new Date(now())) !== state.result.from
  }
  return { syncOwner, refresh, tick, configure, suspend, needsRefresh, storageChanged,
    dismiss() { state.banner = null },
    dispose() { disposed = true; clearLive(); resource.dispose(); principal = ''; key = ''; records = [] } }
}
