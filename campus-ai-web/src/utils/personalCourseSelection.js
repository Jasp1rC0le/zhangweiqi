import { courseKey } from './courseSchedule.js'
import { dayNumber } from './timetable.js'

export function personalCourseMatches(courses, query = '', missingTeacherOnly = false) {
  const search = query.trim()
  return (courses || []).filter(course => (!missingTeacherOnly || !course.teacher?.trim()) && `${course.name} ${course.room} ${course.teacher || ''}`.includes(search))
}
export function personalCourseSelection(matches, keys) {
  const visible = new Set(matches.map(courseKey)), selected = [...new Set(keys)]
  return { selected, hidden: selected.filter(key => !visible.has(key)), inside: selected.filter(key => visible.has(key)) }
}
// The list is already read through the current account's protected endpoint.
// A handoff date is intent, not authority and not permission to pick another term.
export function requiredPersonalTerm(terms, firstMonday) {
  if (typeof firstMonday !== 'string') throw new Error('带入的保存学期无效，请重新打开补录入口')
  dayNumber(firstMonday)
  const found = terms.filter(term => term.firstMonday === firstMonday)
  if (found.length !== 1) throw new Error('带入的保存学期已变化或无法明确确认；没有改用其他学期，请重试核对或手动选择')
  return found[0].firstMonday
}
