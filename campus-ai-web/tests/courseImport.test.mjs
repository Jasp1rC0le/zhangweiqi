import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCourseJson,
  parseCourseText,
  parseCourseRows,
  coursesToCsv,
  describeCourseChanges,
} from '../src/utils/courseImport.js'
const course = {
  name: '合成实验',
  weekday: 1,
  startPeriod: 1,
  endPeriod: 2,
  weeks: [1, 3],
  room: '合成A101',
}
const backup = { semester: '合成学期', firstMonday: '2026-09-07', courses: [course] }
const json = (v) => JSON.stringify(v)
test('school JSON and private backup restore exact weeks and only schedule metadata', () => {
  const data = {
    ...backup,
    format: 'campthink-school-timetable',
    version: 1,
    sourceOrigin: 'https://zdjw.tsguas.edu.cn',
    coveredWeeks: [1, 2, 3],
    exportedAt: '2026-10-12T00:00:00Z',
  }
  assert.deepEqual(parseCourseJson(json(data)).courses, [course])
  const result = parseCourseJson(
    json({ ...backup, revision: 7, checkedAt: 'earlier', remindDays: 0 }),
  )
  assert.deepEqual(result.metadata, { semester: backup.semester, firstMonday: backup.firstMonday })
  assert.equal('revision' in result, false)
  assert.deepEqual(parseCourseText(coursesToCsv([course])).courses, [course])
})
test('unknown credentials, identity and broken coverage reject rather than saving', () => {
  for (const data of [
    { ...backup, token: 'synthetic' },
    { ...backup, courses: [{ ...course, studentId: 'synthetic' }] },
    { ...backup, coveredWeeks: [1, 3] },
    { ...backup, coveredWeeks: [1, 2] },
    { ...backup, firstMonday: '2026-09-08' },
    { ...backup, format: 'arbitrary' },
    { ...backup, courses: [] },
  ])
    assert.throws(() => parseCourseJson(json(data)))
  assert.throws(() => parseCourseJson('{broken'))
  assert.throws(() => parseCourseJson('a'.repeat(100001)))
})
test('school detail columns map automatically, reorder and extra fields stay local', () => {
  const rows = [
    ['合成学期'],
    ['姓名', '课程名', '教学周', '上课地点', '周几', '节次'],
    ['仅合成测试', '合成实验', '1-4(单周)', '合成A101', '星期一', '第1-2节'],
  ]
  const result = parseCourseRows(rows)
  assert.deepEqual(result.courses, [course])
  assert.equal(result.warnings.length, 1)
  assert.equal(json(result).includes('仅合成测试'), false)
})
test('Chinese weekday, clock columns and quoted delimiters parse without hand-reformatting', () => {
  const text = '地点,课程名,周几,教学周,开始时间,结束时间\n"合成,A",实验,周日,2;4,09:00,10:00'
  assert.equal(parseCourseText(text).courses[0].weekday, 7)
  assert.deepEqual(parseCourseText(text).courses[0].weeks, [2, 4])
  assert.equal(parseCourseText(text).courses[0].room, '合成,A')
})
test('missing weeks, ambiguous units, bad rows and duplicate headers never disappear silently', () => {
  for (const rows of [
    [
      ['课程名', '星期', '节次'],
      ['实验', '周一', '1-2'],
    ],
    [
      ['课程名', '星期', '周次', '节次'],
      ['实验', '周一', '', '1-2'],
    ],
    [
      ['课程名', '星期', '周次', '节次'],
      ['实验', '周一', '1-4', '1.5'],
    ],
    [
      ['课程名', '星期', '周次', '节次'],
      ['实验', '周一', '1-4', '1-2'],
      ['备注', '异常'],
    ],
    [['课程名', '课程名称', '星期', '周次', '节次']],
  ])
    assert.throws(() => parseCourseRows(rows))
})
test('difference names exact room, weekday, period and week changes', () => {
  const changed = {
    ...course,
    weekday: 2,
    startPeriod: 3,
    endPeriod: 4,
    weeks: [1, 2, 3],
    room: '合成B201',
  }
  const delta = describeCourseChanges([course], [changed])
  assert.equal(delta.modified.length, 1)
  assert.deepEqual(
    delta.modified[0].changes.map((c) => c.label),
    ['星期', '上课时间', '周次', '教室'],
  )
  assert.equal(delta.added.length, 0)
  assert.equal(delta.removed.length, 0)
})
test('ambiguous repeated-name arrangements stay additions and removals', () => {
  const old = [course, { ...course, weekday: 3 }],
    fresh = [
      { ...course, weekday: 2 },
      { ...course, weekday: 4 },
    ]
  const delta = describeCourseChanges(old, fresh)
  assert.equal(delta.modified.length, 0)
  assert.equal(delta.added.length, 2)
  assert.equal(delta.removed.length, 2)
  assert.equal(describeCourseChanges(old, [...old].reverse()).unchanged, 2)
})
