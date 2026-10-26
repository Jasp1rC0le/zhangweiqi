// A saved snapshot describes arrangements, not today's lessons or school-wide availability.
export function homeCourseStatus(state) {
  if (state.loading || (!state.loaded && !state.error)) return { kind: 'loading' }
  if (state.error) return { kind: 'error' }
  if (!state.schedule) return { kind: 'empty' }
  const schedule = state.schedule
  const count = schedule.courses.length
  const missingTeachers = schedule.courses.filter(course => !course.teacher?.trim()).length
  return {
    kind: count ? 'saved' : 'confirmed-empty',
    count,
    missingTeachers,
    semester: schedule.semester,
    checkedAt: schedule.checkedAt,
  }
}

export function courseCheckedDate(value) {
  if (!Number.isFinite(Date.parse(value))) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric',
  }).format(new Date(value))
}
