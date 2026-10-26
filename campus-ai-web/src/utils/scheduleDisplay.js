import { dayNumber } from './timetable.js'

const rowFields = new Set([
  'id',
  'date',
  'name',
  'room',
  'teacher',
  'startTime',
  'endTime',
  'startPeriod',
  'endPeriod',
  'timeLabel',
  'conflict',
  'sources',
])
const displayFields = new Set(['version', 'state', 'summary', 'entries', 'notices', 'freeDates'])
const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
const text = (value, max, required = false) =>
  typeof value === 'string' && value.length <= max && (!required || !!value.trim())
const day = (value) => {
  try {
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(dayNumber(value))
    )
  } catch {
    return false
  }
}
const time = (value) =>
  typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
const period = (value) => Number.isInteger(value) && value >= 1 && value <= 100

// Optional, versioned extension to the existing answer contract. No arbitrary
// Entry/roster fields, markup interpretation, identity switching, or write action.
export function validScheduleDisplay(display, answer) {
  if (
    !object(display) ||
    Object.keys(display).some((key) => !displayFields.has(key)) ||
    display.version !== 1 ||
    !['READY', 'EMPTY', 'UNRESOLVED'].includes(display.state) ||
    !text(display.summary, 2000, true) ||
    !Array.isArray(display.entries) ||
    display.entries.length !== answer.count ||
    display.entries.length > 200 ||
    (display.state === 'READY') !== display.entries.length > 0 ||
    !Array.isArray(display.notices) ||
    display.notices.length > 6 ||
    !display.notices.every((value) => text(value, 1000, true)) ||
    !Array.isArray(display.freeDates) ||
    display.freeDates.length > 14 ||
    new Set(display.freeDates).size !== display.freeDates.length ||
    !display.freeDates.every((date) => day(date) && date >= answer.from && date <= answer.to) ||
    (answer.detail !== 'FREE' && display.freeDates.length)
  )
    return false
  const ids = new Set()
  for (const row of display.entries) {
    if (
      !object(row) ||
      Object.keys(row).some((key) => !rowFields.has(key)) ||
      !text(row.id, 150, true) ||
      ids.has(row.id) ||
      !day(row.date) ||
      row.date < answer.from ||
      row.date > answer.to ||
      !text(row.name, 200, true) ||
      !text(row.room, 200) ||
      !text(row.teacher, 200) ||
      !text(row.timeLabel, 200, true) ||
      typeof row.conflict !== 'boolean' ||
      !(
        (row.startTime === null && row.endTime === null) ||
        (time(row.startTime) && time(row.endTime))
      ) ||
      !(
        (row.startPeriod === null && row.endPeriod === null) ||
        (period(row.startPeriod) && period(row.endPeriod) && row.startPeriod <= row.endPeriod)
      ) ||
      !Array.isArray(row.sources) ||
      row.sources.length < 1 ||
      row.sources.length > 2 ||
      new Set(row.sources).size !== row.sources.length ||
      !row.sources.every((source) => ['PERSONAL', 'TEACHING'].includes(source))
    )
      return false
    ids.add(row.id)
  }
  if (answer.focus) {
    const full = (value) => (value.length === 5 ? `${value}:00` : value)
    if (
      !display.entries.some(
        (row) =>
          row.startTime &&
          `${row.date}T${full(row.startTime)}` ===
            `${answer.focus}${answer.focus.length === 16 ? ':00' : ''}`,
      )
    )
      return false
  }
  return true
}

export function scheduleDateLabel(date, includeWeekday = true) {
  if (!day(date)) return ''
  const weekday = '日一二三四五六'[new Date(`${date}T12:00:00Z`).getUTCDay()]
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日${includeWeekday ? ` 周${weekday}` : ''}`
}
export function scheduleAnswerHeading(answer) {
  const timing={WAIT_START:'距计划开始',WAIT_END:'距计划结束',DURATION:'计划起止时长'}[answer.detail]
  if(timing)return timing
  const selection = {
    NEXT: '下一节课',
    PREVIOUS: answer.anchor ? '所选课程的上一节' : '最近已结束的课',
    CURRENT: '正在上的课',
    REMAINING: '接下来的安排',
    FIRST: '第一节课',
    LAST: '最后一节课',
    AT: '这节课',
  }[answer.selection]
  if (selection) return selection
  if (answer.detail === 'FREE') return '未匹配到安排的日期'
  if (['COUNT', 'COURSES', 'PERIODS'].includes(answer.detail)) return '课程数量'
  return (
    { LOCATION: '上课地点', TEACHER: '任课教师', TIME: '上课时间' }[answer.detail] || '课程安排'
  )
}

// Informational context is separate from amber conflict/unknown-source notices.
// Format only the server's asOf value; never compute a countdown from Date.now().
export function scheduleTimingNote(answer) {
  if(answer.detail==='DURATION')return '按起止钟点计算；如有课间一并计入，不等于有效授课分钟或课时。'
  if(!['WAIT_START','WAIT_END'].includes(answer.detail))return ''
  const timestamp=Date.parse(answer.asOf)
  if(!Number.isFinite(timestamp))return ''
  const china=new Date(timestamp+8*3600000).toISOString().slice(0,19).replace('T',' ')
  return `按${china}（北京时间）核算；不会自动刷新。`
}
