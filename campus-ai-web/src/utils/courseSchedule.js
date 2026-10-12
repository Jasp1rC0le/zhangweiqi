import { parseCsv } from './projectDataCheck.js'
import { addDays, chinaDate, dayNumber, mondayOf } from './timetable.js'

export const COURSE_COLUMNS = ['课程名称', '星期', '开始时间', '结束时间', '周次', '教室']
const aliases = ['name', 'weekday', 'startTime', 'endTime', 'weeks', 'room']
export const COURSE_TEMPLATE =
  '\uFEFF' + COURSE_COLUMNS.join(',') + '\r\n课程示例（请替换）,1,08:00,09:40,1-16单,教室示例\r\n'
const textField = (value, label, required = true) => {
  if (
    typeof value !== 'string' ||
    value.length > 100 ||
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
    course.startTime,
    course.endTime,
    course.weeks,
    course.room,
  ])
}
export function normalizeCourse(course) {
  const name = textField(course?.name, '课程名称'),
    room = textField(course?.room, '教室', false)
  if (!Number.isInteger(course.weekday) || course.weekday < 1 || course.weekday > 7)
    throw new Error('星期须填1至7，周一为1，周日为7')
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  if (
    typeof course.startTime !== 'string' ||
    typeof course.endTime !== 'string' ||
    !time.test(course.startTime) ||
    !time.test(course.endTime) ||
    course.startTime >= course.endTime
  )
    throw new Error('时间请填HH:mm，结束时间须晚于开始时间；不自动换算第几节课')
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
    startTime: course.startTime,
    endTime: course.endTime,
    weeks: [...new Set(course.weeks)].sort((a, b) => a - b),
    room,
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
      a.weekday - b.weekday ||
      a.startTime.localeCompare(b.startTime) ||
      courseKey(a).localeCompare(courseKey(b)),
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
  const index = COURSE_COLUMNS.map((label, i) =>
    headers.findIndex((value) => value === label || value === aliases[i]),
  )
  if (headers.length !== 6 || new Set(headers).size !== 6 || index.includes(-1))
    throw new Error(
      '表头须为：课程名称、星期、开始时间、结束时间、周次、教室。请删除学号、姓名等多余列',
    )
  if (!parsed.rows.length || parsed.rows.length > 120)
    throw new Error('每份表格须有1至120条课程安排')
  let courses = parsed.rows.map((row) => {
    try {
      if (row.cells.length !== 6) throw new Error('本行应有6列，请检查逗号或制表符')
      const cell = index.map((i) => row.cells[i].trim())
      if (!/^[1-7]$/.test(cell[1])) throw new Error('星期须填1至7，周一为1')
      return normalizeCourse({
        name: cell[0],
        weekday: Number(cell[1]),
        startTime: cell[2],
        endTime: cell[3],
        weeks: parseCourseWeeks(cell[4]),
        room: cell[5],
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
      if (a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime) {
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
      if (date > today || (date === today && course.endTime > hm))
        candidates.push({
          ...course,
          date,
          week,
          current: date === today && course.startTime <= hm,
        })
    }
  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  return candidates[0] || null
}
