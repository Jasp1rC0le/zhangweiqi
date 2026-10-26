import { addDays, chinaDate } from './timetable.js'
import { scheduleQuery, validScheduleQuery } from './scheduleIntent.js'
import { readPrivateScheduleQuery } from './scheduleChat.js'
import { ownScheduleDestination } from './schedulePerspective.js'

export function homeAgendaQuery(mode, date) {
  if (!['TODAY', 'NEXT'].includes(mode)) throw new Error('日程查看方式无效')
  const query = scheduleQuery(date, mode === 'NEXT' ? addDays(date, 13) : date, { selection: mode === 'NEXT' ? 'NEXT' : 'ALL', perspective: 'AUTO' })
  if (!validScheduleQuery(query)) throw new Error('设备日期无效，请核对系统时间后重试')
  return query
}
export function homeAgendaDestination(result) {
  return ownScheduleDestination({ ...result, from: result.display.entries[0]?.date || result.from })
}
export function homeAgendaNeedsRefresh(result, mode, now) {
  if (!result || !Number.isFinite(now?.valueOf())) return false
  if (chinaDate(now) !== result.from) return true
  const next = result.display.entries[0]
  if (mode !== 'NEXT' || !next?.startTime) return false
  const local = new Date(now.valueOf() + 8 * 3600000).toISOString().slice(0, 19)
  return `${next.date}T${next.startTime.length === 5 ? next.startTime + ':00' : next.startTime}` < local
}
// This is an automatic protected read, not a natural-language/model request.
export function createHomeAgenda({ owner, state, read, today = () => chinaDate() }) {
  let generation = 0, controller, disposed = false
  function reset() { generation++; controller?.abort(); Object.assign(state, { result: null, loading: false, error: '' }) }
  async function load(mode) {
    reset()
    const principal = owner(), epoch = generation
    if (disposed || !principal) return false
    controller = new AbortController()
    const signal = controller.signal, current = () => !disposed && principal === owner() && generation === epoch && !signal.aborted
    state.loading = true
    try {
      const query = homeAgendaQuery(mode, today())
      const data = await readPrivateScheduleQuery(query, signal, read)
      if (!current()) return false
      if (today() !== query.from) { reset(); return false }
      if (!data.display || !data.queryScope || data.queryScope.requested !== 'AUTO') throw new Error('日程来源未明确，请在完整课表核对后重试')
      if (chinaDate(new Date(data.asOf)) !== query.from) throw new Error('设备日期与服务器核对日不一致，请检查系统时间后重试')
      if (mode === 'NEXT' && data.count && (!data.focus || data.display.entries.some(row => !row.startTime || `${row.date}T${row.startTime.length === 5 ? row.startTime + ':00' : row.startTime}` !== `${data.focus}${data.focus.length === 16 ? ':00' : ''}`))) throw new Error('下一节定位不完整，请在完整课表核对钟点')
      state.result = data
      return true
    } catch (error) {
      if (current()) state.error = error.response?.data?.message || error.message || '本人日程暂时无法读取，请重试'
      return false
    } finally { if (current()) state.loading = false }
  }
  return { load, reset, dispose() { disposed = true; reset() } }
}
