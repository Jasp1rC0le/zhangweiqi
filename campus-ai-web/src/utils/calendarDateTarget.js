import { addDays, dayNumber, mondayOf } from './timetable.js'
export const CALENDAR_DATE_MIN = '2000-01-03'
export const CALENDAR_DATE_MAX = '2100-12-26'
// Date intent only. Existing protected calendar reads still resolve the view and class.
export function calendarDateTarget(value) {
  try {
    if (typeof value !== 'string' || value < CALENDAR_DATE_MIN || value > CALENDAR_DATE_MAX) throw new Error()
    dayNumber(value)
    const monday = mondayOf(value), sunday = addDays(monday, 6)
    if (monday < '2000-01-01' || sunday > '2100-12-31') throw new Error()
    return Object.freeze({ date: value, monday })
  } catch { throw new Error('请填写2000年1月3日至2100年12月26日内的完整有效日期；没有切换课表。') }
}
