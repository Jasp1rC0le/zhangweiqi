import {
  normalizeCourses,
  parseCourseTable,
  parseCourseWeeks,
  courseConflicts,
  isPeriodCourse,
  courseTimeLabel,
  diffCourses,
} from './courseSchedule.js'
import { parseCsv } from './projectDataCheck.js'
import { mondayOf } from './timetable.js'

const allowedCourseKeys = new Set([
  'name',
  'weekday',
  'startTime',
  'endTime',
  'startPeriod',
  'endPeriod',
  'weeks',
  'room',
  'teacher',
])
export function parseCourseJson(text) {
  if (typeof text !== 'string' || text.length > 100000 || text.includes('\0'))
    throw new Error('课表JSON限10万字')
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('JSON文件损坏，请重新导出')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('不是支持的课表数据文件')
  const allowed = new Set([
    'format',
    'version',
    'sourceOrigin',
    'semester',
    'firstMonday',
    'coveredWeeks',
    'exportedAt',
    'courses',
    'revision',
    'importedAt',
    'checkedAt',
    'remindDays',
  ])
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error('课表含不支持的字段，请用课表导出工具，不要上传账号资料或接口抓包')
  if (
    value.format != null &&
    (value.format !== 'campthink-school-timetable' ||
      value.version !== 1 ||
      value.sourceOrigin !== 'https://zdjw.tsguas.edu.cn')
  )
    throw new Error('课表导出版本或来源不支持')
  if (
    typeof value.semester !== 'string' ||
    !value.semester.trim() ||
    value.semester.length > 100 ||
    // oxlint-disable-next-line no-control-regex -- Imported semester labels must reject control characters.
    /[\u0000-\u001f\u007f]/.test(value.semester)
  )
    throw new Error('文件缺少有效学期')
  if (
    mondayOf(value.firstMonday) !== value.firstMonday ||
    value.firstMonday < '2000-01-01' ||
    value.firstMonday > '2100-12-31'
  )
    throw new Error('文件中的第1周日期无效')
  if (
    !Array.isArray(value.courses) ||
    value.courses.some(
      (c) =>
        !c ||
        typeof c !== 'object' ||
        Array.isArray(c) ||
        Object.keys(c).some((key) => !allowedCourseKeys.has(key)),
    )
  )
    throw new Error('课程字段异常，不读取额外个人信息')
  const courses = normalizeCourses(value.courses)
  if (
    value.coveredWeeks != null &&
    (!Array.isArray(value.coveredWeeks) ||
      !value.coveredWeeks.length ||
      value.coveredWeeks.length > 30 ||
      value.coveredWeeks.some((w, i) => w !== i + 1) ||
      courses.some((c) => c.weeks.some((w) => !value.coveredWeeks.includes(w))))
  )
    throw new Error('文件周次覆盖不完整或与课程不一致，请重新导出')
  return {
    courses,
    metadata: { semester: value.semester.trim(), firstMonday: value.firstMonday },
    warnings: [],
    source: value.format ? '教务导出数据' : 'Campthink课表备份',
    duplicates: value.courses.length - courses.length,
    conflicts: courseConflicts(courses),
  }
}

export function coursesToCsv(courses) {
  // JSON is used for mixed clock/period imports; a table has one time coordinate system.
  const period = isPeriodCourse(courses[0])
  if (courses.some((c) => isPeriodCourse(c) !== period)) return ''
  const cell = (v) => `"${String(v).replaceAll('"', '""')}"`
  return [
    [
      '课程名称',
      '星期',
      period ? '开始节次' : '开始时间',
      period ? '结束节次' : '结束时间',
      '周次',
      '教室',
      '任课教师',
    ],
    ...courses.map((c) => [
      c.name,
      c.weekday,
      period ? c.startPeriod : c.startTime,
      period ? c.endPeriod : c.endTime,
      c.weeks.join(';'),
      c.room,
      c.teacher || '',
    ]),
  ]
    .map((row) => row.map(cell).join(','))
    .join('\n')
}

const columnNames = {
  name: ['课程名称', '课程名', '课程', 'name'],
  weekday: ['星期', '星期几', '周几', 'weekday'],
  weeks: ['周次', '上课周次', '教学周', 'weeks'],
  room: ['教室', '上课地点', '教学地点', '地点', 'room'],
  teacher: ['任课教师', '授课教师', '任课老师', '教师', '教师姓名', 'teacher'],
  period: ['节次', '上课节次', 'period'],
  startPeriod: ['开始节次', '起始节次', 'startPeriod'],
  endPeriod: ['结束节次', 'endPeriod'],
  startTime: ['开始时间', 'startTime'],
  endTime: ['结束时间', 'endTime'],
}
const weekday = (text) => {
  const s = String(text)
    .trim()
    .replace(/^(星期|周)/, '')
  return /^[1-7]$/.test(s)
    ? Number(s)
    : { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }[s]
}
export function parseCourseRows(rows) {
  if (
    !Array.isArray(rows) ||
    rows.length > 2001 ||
    rows.some((r) => !Array.isArray(r) || r.length > 30)
  )
    throw new Error('课表行列超出范围')
  for (let h = 0; h < Math.min(rows.length, 20); h++) {
    const headers = rows[h].map((c) => String(c).trim()),
      cols = {}
    for (const [key, names] of Object.entries(columnNames)) {
      const matches = headers.map((c, i) => (names.includes(c) ? i : -1)).filter((i) => i >= 0)
      if (matches.length > 1) throw new Error(`发现重复的${names[0]}列，请核对原文件`)
      cols[key] = matches[0] ?? -1
    }
    if (cols.name < 0 || cols.weekday < 0 || cols.weeks < 0) continue
    const period = cols.period >= 0 || (cols.startPeriod >= 0 && cols.endPeriod >= 0)
    if (!period && !(cols.startTime >= 0 && cols.endTime >= 0))
      throw new Error('缺少节次或开始、结束时间，不能可靠生成课表')
    const courses = []
    for (let i = h + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row.some((c) => String(c).trim())) continue
      const get = (k) => String(row[cols[k]] ?? '').trim()
      try {
        let time
        if (period) {
          const p =
            cols.period >= 0
              ? /^(?:第)?(\d{1,2})(?:\s*[-—~～至]\s*(\d{1,2}))?节?$/.exec(get('period'))
              : null
          if (cols.period >= 0 && !p) throw new Error('节次无法识别')
          const start = p ? p[1] : get('startPeriod'),
            end = p ? p[2] || p[1] : get('endPeriod')
          if (!/^\d{1,2}$/.test(start) || !/^\d{1,2}$/.test(end)) throw new Error('节次应为整数')
          time = { startPeriod: Number(start), endPeriod: Number(end) }
        } else time = { startTime: get('startTime'), endTime: get('endTime') }
        courses.push(
          ...normalizeCourses([
            {
              name: get('name'),
              weekday: weekday(get('weekday')),
              weeks: parseCourseWeeks(
                get('weeks')
                  .replace(/[（）()]/g, '')
                  .replace(/[—～]/g, '-'),
              ),
              room: cols.room >= 0 ? get('room') : '',
              teacher: cols.teacher >= 0 ? get('teacher') : '',
              ...time,
            },
          ]),
        )
      } catch {
        throw new Error(`第${i + 1}行课程、星期、周次或节次无法识别；没有跳过此行，请核对原文件`)
      }
    }
    const normalized = normalizeCourses(courses)
    return {
      courses: normalized,
      metadata: {},
      source: '课程明细表',
      warnings: headers.some((_, i) => !Object.values(cols).includes(i))
        ? ['额外列已在本机忽略，只保留课程、任课教师、周次、时间和教室']
        : [],
      duplicates: courses.length - normalized.length,
      conflicts: courseConflicts(normalized),
    }
  }
  throw new Error('暂未识别这份课表的列结构。请优先使用本站教务导出工具；不要求你手动重排六列')
}
export function parseCourseText(text) {
  if (typeof text !== 'string' || text.length > 50000 || text.includes('\0'))
    throw new Error('课表文本限5万字')
  if (text.trimStart().startsWith('{')) return parseCourseJson(text)
  try {
    return { ...parseCourseTable(text), metadata: {}, source: '课程明细表', warnings: [] }
  } catch {
    /* Try labeled school detail columns, never infer unlabeled fields. */
  }
  if (text.split(/\r?\n/, 1)[0].includes('\t'))
    return parseCourseRows(
      text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((r) => r.split('\t')),
    )
  const parsed = parseCsv(text)
  if (parsed.error) throw new Error(parsed.error)
  return parseCourseRows([parsed.headers, ...parsed.rows.map((r) => r.cells)])
}
export function describeCourseChanges(previous, next) {
  const diff = diffCourses(previous, next),
    modified = []
  const usedOld = new Set(),
    usedNew = new Set()
  // Pair only unambiguous names. Multiple arrangements remain explicit additions/removals.
  for (const old of diff.removed) {
    const before = diff.removed.filter((c) => c.name === old.name),
      after = diff.added.filter((c) => c.name === old.name)
    if (before.length !== 1 || after.length !== 1) continue
    const fresh = after[0],
      changes = []
    if (old.weekday !== fresh.weekday)
      changes.push({
        label: '星期',
        before: `周${'一二三四五六日'[old.weekday - 1]}`,
        after: `周${'一二三四五六日'[fresh.weekday - 1]}`,
      })
    if (courseTimeLabel(old) !== courseTimeLabel(fresh))
      changes.push({
        label: '上课时间',
        before: courseTimeLabel(old),
        after: courseTimeLabel(fresh),
      })
    if (JSON.stringify(old.weeks) !== JSON.stringify(fresh.weeks))
      changes.push({ label: '周次', before: old.weeks.join('、'), after: fresh.weeks.join('、') })
    if (old.room !== fresh.room)
      changes.push({ label: '教室', before: old.room || '未填', after: fresh.room || '未填' })
    if ((old.teacher || '') !== (fresh.teacher || ''))
      changes.push({ label: '任课教师', before: old.teacher || '未录入', after: fresh.teacher || '未录入' })
    modified.push({ before: old, after: fresh, changes })
    usedOld.add(old)
    usedNew.add(fresh)
  }
  return {
    modified,
    added: diff.added.filter((c) => !usedNew.has(c)),
    removed: diff.removed.filter((c) => !usedOld.has(c)),
    unchanged: diff.unchanged,
  }
}
