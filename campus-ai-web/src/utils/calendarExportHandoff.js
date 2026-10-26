import { addDays, dayNumber, mondayOf } from './timetable.js'
import { isEnrollmentId } from './teachingIds.js'
import { TEACHING_VIEWS } from './teaching.js'

const day = value => {
  try { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0,4) >= '2000' && value.slice(0,4) <= '2100' && Number.isFinite(dayNumber(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value } catch { return false }
}
export function calendarExportIntent(value, owner) {
  if (!owner || value?.owner !== owner || !Object.hasOwn(TEACHING_VIEWS, value?.view) || !day(value.from) || !day(value.to) || mondayOf(value.from) !== value.from || addDays(value.from,6) !== value.to || typeof value.classId !== 'string' || value.classId && !isEnrollmentId(value.classId))
    throw new Error('当前课表范围尚未核对，请重新读取后导出；没有改用本周或其他身份。')
  const teaching = !!value.classId || ['COUNSELOR','SECRETARY'].includes(value.view)
  return Object.freeze({ owner, source: teaching ? 'TEACHING' : 'MY', view: value.view, from: value.from, to: value.to, classId: value.classId })
}
export function calendarExportScopeKey(value) {
  return JSON.stringify(['source','view','from','to','classId'].map(key => value?.[key] ?? ''))
}
export function checkedCalendarExportContext({ owner, week, loading, stale, error, scopeLoading, scopeError, noticeBusy, confirmed, view, monday, classId }) {
  if (!confirmed || !week || loading || stale || error || scopeLoading || scopeError || noticeBusy || week.view !== view || week.monday !== monday) return null
  try {
    const value = { owner, view, from: week.monday, to: week.sunday, classId }
    calendarExportIntent(value, owner)
    return value
  } catch { return null }
}
export function requireCalendarExportAccess(access, intent) {
  const views = intent.source === 'TEACHING' ? access?.teachingViews : access?.personalViews
  if (!access?.sources?.includes(intent.source) || !views?.includes(intent.view))
    throw new Error('当前账号没有带入的导出来源或身份，请重新核对；没有改用其他身份或全部班级。')
  return intent
}
