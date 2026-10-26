import { calendarDateTarget } from './calendarDateTarget.js'
import { isEnrollmentId } from './teachingIds.js'
import { TEACHING_VIEWS } from './teaching.js'
const fields = ['back', 'backDate', 'backView', 'backClass', 'backPage']
const failure = '返回课表的日期、身份、班级或页码不完整，请重新选择课表范围；没有改查全部班级或其他身份。'

// Only navigation intent. Neither a URL nor a previously readable lesson grants calendar access.
export function calendarBackPreset(query = {}) {
  if (!fields.some(key => query[key] != null)) return null
  try {
    if (query.back !== '1' || typeof query.backView !== 'string' || !Object.hasOwn(TEACHING_VIEWS, query.backView) ||
        typeof query.backClass !== 'string' || query.backClass && !isEnrollmentId(query.backClass) ||
        typeof query.backPage !== 'string' || !/^(?:0|[1-9]\d{0,4})$/.test(query.backPage) || Number(query.backPage) > 10000) throw new Error()
    const target = calendarDateTarget(query.backDate)
    return Object.freeze({ ...target, view: query.backView, classId: query.backClass, page: Number(query.backPage) })
  } catch { return { error: failure } }
}
export function calendarBackQuery(value) {
  if (!Number.isSafeInteger(value?.page) || value.page < 0 || value.page > 10000) throw new Error(failure)
  const query = { back: '1', backDate: value.date, backView: value.view, backClass: value.classId, backPage: String(value.page) }
  if (calendarBackPreset(query)?.error) throw new Error(failure)
  return Object.freeze(query)
}
export function calendarBackDestination(query) {
  const target = calendarBackPreset(query)
  if (target?.error) return target
  return { to: target ? { path: '/timetable', query: calendarBackQuery(target) } : '/timetable', date: target?.date || '' }
}
