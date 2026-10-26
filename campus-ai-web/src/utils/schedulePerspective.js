import { dayNumber, mondayOf } from './timetable.js'

const perspectives = ['AUTO', 'STUDENT', 'TEACHER']
export const validSchedulePerspective = (value) => value == null || perspectives.includes(value)

// This is only the requested read meaning, never a role grant. The API must echo
// its checked scope; a backend that ignores the new field cannot silently pass.
export function validScheduleScope(value, query, result) {
  const requested = query.perspective || 'AUTO'
  if (!value) return requested === 'AUTO'
  if (typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['version', 'requested', 'resolved'].includes(key)) ||
      value.version !== 1 || value.requested !== requested || !perspectives.includes(value.requested) ||
      !['STUDENT', 'TEACHER'].includes(value.resolved) ||
      requested !== 'AUTO' && value.resolved !== requested) return false
  return requested !== 'TEACHER' || !result.display ||
    Array.isArray(result.display.entries) && result.display.entries.every(entry => Array.isArray(entry.sources) && entry.sources.includes('TEACHING'))
}

export function scheduleScopeLabel(value) {
  if (value?.requested === 'TEACHER') return '我的授课 · 仅已授权任课安排'
  if (value?.requested === 'STUDENT') return '我的上课安排 · 个人导入与本人选课'
  return value?.resolved === 'TEACHER' ? '本人默认课表 · 个人导入与授课' : '本人课表 · 个人导入与本人选课'
}
// Navigation carries a requested view/date only. It never carries an owner or an
// authorization claim; the destination first reads its protected scopes endpoint.
export function ownScheduleDestination(result) {
  const view=result?.queryScope?.resolved
  return ['STUDENT','TEACHER'].includes(view)
    ? { path:'/timetable', query:{queryView:view,queryDate:result.from} }
    : '/timetable'
}
export function calendarSchedulePreset(query={}) {
  if(query.queryView==null && query.queryDate==null)return null
  try{
    if(!['STUDENT','TEACHER'].includes(query.queryView) || typeof query.queryDate!=='string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(query.queryDate) || query.queryDate<'2000-01-01' || query.queryDate>'2100-12-31')throw new Error()
    dayNumber(query.queryDate)
    return { view:query.queryView, date:query.queryDate, monday:mondayOf(query.queryDate) }
  }catch{return {error:'课表链接的日期或本人查看范围无效，请从侧栏重新打开课表。没有切换到其他身份。'}}
}
