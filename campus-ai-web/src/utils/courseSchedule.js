import { parseCsv } from './projectDataCheck.js'
import { addDays, chinaDate, dayNumber, mondayOf } from './timetable.js'

export const COURSE_COLUMNS = ['课程名称', '星期', '开始时间', '结束时间', '周次', '教室', '任课教师']
export const PERIOD_COLUMNS = ['课程名称', '星期', '开始节次', '结束节次', '周次', '教室', '任课教师']
const aliases = ['name', 'weekday', 'startTime', 'endTime', 'weeks', 'room', 'teacher']
export const COURSE_TEMPLATE =
  '\uFEFF' + COURSE_COLUMNS.join(',') + '\r\n课程示例（请替换）,1,08:00,09:40,1-16单,教室示例,教师示例（请替换）\r\n'
export const PERIOD_TEMPLATE =
  '\uFEFF' + PERIOD_COLUMNS.join(',') + '\r\n课程示例（请替换）,1,1,2,6,教室示例,教师示例（请替换）\r\n'
export const isPeriodCourse = (course) => Number.isInteger(course?.startPeriod)
export const courseTimeLabel = (course) =>
  isPeriodCourse(course)
    ? `第${course.startPeriod}${course.endPeriod === course.startPeriod ? '' : `—${course.endPeriod}`}节`
    : `${course.startTime}—${course.endTime}`
export function compareCourseTime(a, b) {
  if (isPeriodCourse(a) && isPeriodCourse(b))
    return a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod
  if (!isPeriodCourse(a) && !isPeriodCourse(b)) return a.startTime.localeCompare(b.startTime)
  // Without a verified bell schedule the two coordinate systems cannot be ordered in time.
  return isPeriodCourse(a) ? -1 : 1
}
const textField = (value, label, required = true) => {
  if (
    typeof value !== 'string' ||
    value.length > 100 ||
    // oxlint-disable-next-line no-control-regex -- Imported single-line fields must reject control characters.
    /[\u0000-\u001f\u007f]/.test(value) ||
    (required && !value.trim())
  )
    throw new Error(`${label}须为100字以内的单行文字${required ? '，不能空白' : ''}`)
  return value.trim()
}
export function parseCourseWeeks(value) {
  const text = String(value ?? '')
    .trim()
    .replace(/周/g, '')
  if (!text || text.length > 160) throw new Error('周次请填1-16、1-16单、1-16双或1;3;5，不要留空')
  const weeks = new Set()
  for (const part of text.split(/[;,，；、]/)) {
    const match = /^(\d{1,2})(?:\s*[-~至]\s*(\d{1,2}))?\s*([单双])?$/.exec(part.trim())
    if (!match) throw new Error('周次格式不明，请用1-16、1-16单、1-16双或1;3;5')
    const start = Number(match[1]),
      end = Number(match[2] || match[1])
    if (start < 1 || end > 30 || end < start)
      throw new Error('周次须在1至30之间，结束周不能小于开始周')
    for (let week = start; week <= end; week++) {
      if (!match[3] || (match[3] === '单' ? week % 2 === 1 : week % 2 === 0)) weeks.add(week)
    }
  }
  if (!weeks.size) throw new Error('单双周筛选后没有上课周次，请核对')
  return [...weeks].sort((a, b) => a - b)
}
export function courseKey(course) {
  return JSON.stringify([
    course.name,
    course.weekday,
    isPeriodCourse(course) ? `period:${course.startPeriod}` : course.startTime,
    isPeriodCourse(course) ? `period:${course.endPeriod}` : course.endTime,
    course.weeks,
    course.room,
    course.teacher || '',
  ])
}
export function normalizeCourse(course) {
  const name = textField(course?.name, '课程名称'),
    room = textField(course?.room, '教室', false), teacher = textField(course?.teacher ?? '', '任课教师', false)
  if (!Number.isInteger(course.weekday) || course.weekday < 1 || course.weekday > 7)
    throw new Error('星期须填1至7，周一为1，周日为7')
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  const byPeriod = course.startPeriod != null || course.endPeriod != null
  if (
    byPeriod &&
    (!Number.isInteger(course.startPeriod) ||
      !Number.isInteger(course.endPeriod) ||
      course.startPeriod < 1 ||
      course.endPeriod > 16 ||
      course.startPeriod > course.endPeriod ||
      (course.startTime != null && course.startTime !== '') ||
      (course.endTime != null && course.endTime !== ''))
  )
    throw new Error('节次须为1至16的整数，结束节次不小于开始节次；不能同时填写钟点')
  if (
    !byPeriod &&
    (typeof course.startTime !== 'string' ||
      typeof course.endTime !== 'string' ||
      !time.test(course.startTime) ||
      !time.test(course.endTime) ||
      course.startTime >= course.endTime)
  )
    throw new Error('时间请填HH:mm，结束时间须晚于开始时间；只有第几节时请使用节次表头')
  if (
    !Array.isArray(course.weeks) ||
    !course.weeks.length ||
    course.weeks.length > 30 ||
    course.weeks.some((w) => !Number.isInteger(w) || w < 1 || w > 30)
  )
    throw new Error('上课周次须为1至30的整数列表')
  return {
    name,
    weekday: course.weekday,
    ...(byPeriod
      ? { startPeriod: course.startPeriod, endPeriod: course.endPeriod }
      : { startTime: course.startTime, endTime: course.endTime }),
    weeks: [...new Set(course.weeks)].sort((a, b) => a - b),
    room,
    ...(teacher ? { teacher } : {}),
  }
}
export function normalizeCourses(courses) {
  if (!Array.isArray(courses) || !courses.length || courses.length > 120)
    throw new Error('每份表格须有1至120条课程安排')
  const distinct = new Map()
  for (const course of courses) {
    const value = normalizeCourse(course)
    distinct.set(courseKey(value), value)
  }
  return [...distinct.values()].sort(
    (a, b) =>
      a.weekday - b.weekday || compareCourseTime(a, b) || courseKey(a).localeCompare(courseKey(b)),
  )
}
export function parseCourseTable(input) {
  if (typeof input !== 'string' || input.length > 50000 || input.includes('\0'))
    throw new Error('表格限5万字，文件须为UTF-8文本')
  // Spreadsheet clipboard TSV has no CSV quoting; never reinterpret a quoted comma as a delimiter.
  const trimmed = input.replace(/^\uFEFF/, '')
  const firstLine = trimmed.split(/\r?\n/, 1)[0]
  const parsed = firstLine.includes('\t')
    ? {
        headers: firstLine.split('\t'),
        rows: trimmed
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .slice(1)
          .map((line, i) => ({ cells: line.split('\t'), line: i + 2 }))
          .filter((row) => row.cells.some((cell) => cell.trim())),
      }
    : parseCsv(input)
  if (parsed.error) throw new Error(parsed.error)
  const headers = parsed.headers.map((value) => value.trim())
  const byPeriod = headers.includes('开始节次') || headers.includes('startPeriod')
  const columns = byPeriod ? PERIOD_COLUMNS : COURSE_COLUMNS
  const keys = byPeriod ? ['name', 'weekday', 'startPeriod', 'endPeriod', 'weeks', 'room', 'teacher'] : aliases
  const index = columns.map((label, i) =>
    headers.findIndex((value) => value === label || value === keys[i]),
  )
  if (![6,7].includes(headers.length) || new Set(headers).size !== headers.length || index.slice(0,6).includes(-1) || headers.length === 7 && index[6] < 0)
    throw new Error(
      '表头须为：课程名称、星期、开始时间、结束时间、周次、教室，可加任课教师；也可将时间两列改为开始节次、结束节次。请删除学生姓名、学号等多余列',
    )
  if (!parsed.rows.length || parsed.rows.length > 120)
    throw new Error('每份表格须有1至120条课程安排')
  let courses = parsed.rows.map((row) => {
    try {
      if (row.cells.length !== headers.length) throw new Error(`本行应有${headers.length}列，请检查逗号或制表符`)
      const cell = index.map((i) => i < 0 ? '' : row.cells[i].trim())
      if (!/^[1-7]$/.test(cell[1])) throw new Error('星期须填1至7，周一为1')
      if (byPeriod && !cell.slice(2, 4).every((value) => /^\d{1,2}$/.test(value)))
        throw new Error('节次填1至16的整数，不填钟点或文字')
      return normalizeCourse({
        name: cell[0],
        weekday: Number(cell[1]),
        ...(byPeriod
          ? { startPeriod: Number(cell[2]), endPeriod: Number(cell[3]) }
          : { startTime: cell[2], endTime: cell[3] }),
        weeks: parseCourseWeeks(cell[4]),
        room: cell[5],
        teacher: cell[6],
      })
    } catch (failure) {
      throw new Error(`第${row.line}行：${failure.message}`, { cause: failure })
    }
  })
  const originalCount = courses.length
  courses = normalizeCourses(courses)
  return {
    courses,
    duplicates: originalCount - courses.length,
    conflicts: courseConflicts(courses),
  }
}
export function courseConflicts(courses) {
  const conflicts = []
  for (let i = 0; i < courses.length; i++)
    for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i],
        b = courses[j]
      const sameUnit = isPeriodCourse(a) === isPeriodCourse(b)
      const overlaps = isPeriodCourse(a)
        ? a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod
        : a.startTime < b.endTime && b.startTime < a.endTime
      if (sameUnit && a.weekday === b.weekday && overlaps) {
        const weeks = a.weeks.filter((week) => b.weeks.includes(week))
        if (weeks.length) conflicts.push({ a: i, b: j, weeks })
      }
    }
  return conflicts
}
export function diffCourses(previous = [], next = []) {
  const old = new Map(previous.map((course) => [courseKey(course), course])),
    fresh = new Map(next.map((course) => [courseKey(course), course]))
  return {
    added: [...fresh].filter(([key]) => !old.has(key)).map(([, value]) => value),
    removed: [...old].filter(([key]) => !fresh.has(key)).map(([, value]) => value),
    unchanged: [...fresh.keys()].filter((key) => old.has(key)).length,
  }
}
export function validateCourseMetadata(metadata) {
  textField(metadata.semester, '学期')
  const day = dayNumber(metadata.firstMonday)
  if (
    metadata.firstMonday < '2000-01-01' ||
    metadata.firstMonday > '2100-12-31' ||
    mondayOf(metadata.firstMonday) !== metadata.firstMonday ||
    !Number.isFinite(day)
  )
    throw new Error('第1周周一日期须为2000至2100年的周一，请按校历核对')
  if (!Number.isInteger(metadata.remindDays) || metadata.remindDays < 0 || metadata.remindDays > 30)
    throw new Error('核对提醒须在0至30天之间')
}
export function weekCourses(schedule, week) {
  return (schedule?.courses || []).filter((course) => course.weeks.includes(week))
}
export function nextImportedCourse(schedule, now = new Date()) {
  if (!schedule) return null
  const today = chinaDate(now)
  const hm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  const candidates = []
  for (const course of schedule.courses)
    for (const week of course.weeks) {
      const date = addDays(schedule.firstMonday, (week - 1) * 7 + course.weekday - 1)
      if (date > today || (date === today && (isPeriodCourse(course) || course.endTime > hm)))
        candidates.push({
          ...course,
          date,
          week,
          current: !isPeriodCourse(course) && date === today && course.startTime <= hm,
          ...(isPeriodCourse(course) ? { timeUnknown: true } : {}),
        })
    }
  candidates.sort((a, b) => a.date.localeCompare(b.date) || compareCourseTime(a, b))
  return candidates[0] || null
}
