import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCourseTable,
  parseCourseWeeks,
  normalizeCourses,
  diffCourses,
  courseConflicts,
  nextImportedCourse,
  weekCourses,
  validateCourseMetadata,
  COURSE_TEMPLATE,
} from '../src/utils/courseSchedule.js'
const header = '课程名称,星期,开始时间,结束时间,周次,教室\n'
const row = '物理实验,1,08:00,09:40,1-16单,H101'
const course = {
  name: '物理实验',
  weekday: 1,
  startTime: '08:00',
  endTime: '09:40',
  weeks: [1, 3, 5],
  room: 'H101',
}
const timeout = { timeout: 2000 }
test('exact ranges, parity and explicit weeks never fill absent weeks', timeout, () => {
  assert.deepEqual(parseCourseWeeks('1-6单'), [1, 3, 5])
  assert.deepEqual(parseCourseWeeks('1-6双'), [2, 4, 6])
  assert.deepEqual(parseCourseWeeks('1;3;5'), [1, 3, 5])
  assert.deepEqual(parseCourseWeeks('1周,3周'), [1, 3])
  for (const value of ['', '待定', '1-31', '0', '3-1', '2单'])
    assert.throws(() => parseCourseWeeks(value))
})
test('UTF8 BOM, quoted commas and tabular paste preserve exact fields', timeout, () => {
  const parsed = parseCourseTable('\uFEFF' + header + '"课程,实验",1,08:00,09:40,"1,3",H101')
  assert.equal(parsed.courses[0].name, '课程,实验')
  assert.deepEqual(parsed.courses[0].weeks, [1, 3])
  assert.equal(
    parseCourseTable(header.replaceAll(',', '\t') + row.replaceAll(',', '\t')).courses[0].weekday,
    1,
  )
  assert.equal(parseCourseTable(COURSE_TEMPLATE).courses[0].name, '课程示例（请替换）')
})
test(
  'unknown identity columns, missing headers, repeated headers and ambiguous cells reject',
  timeout,
  () => {
    for (const input of [
      header.replace('教室', '姓名') + row,
      header.replace('星期', '课程名称') + row,
      header + row.replace(',1,', ',星期一,'),
      header + row.replace('08:00', '第1节'),
      header + row.replace('09:40', '07:00'),
      header + '\0',
      header + 'A,1,08:00,09:00,1',
    ])
      assert.throws(() => parseCourseTable(input))
    assert.throws(() => parseCourseTable(header + row.replace('1-16单', '1-31')), /第2行/)
  },
)
test('duplicate rows collapse; overlapping times report and retain both courses', timeout, () => {
  const parsed = parseCourseTable(
    header + row + '\n' + row + '\n' + '另一门课,1,09:00,10:00,3;5,H102',
  )
  assert.equal(parsed.duplicates, 1)
  assert.equal(parsed.courses.length, 2)
  assert.equal(parsed.conflicts.length, 1)
  assert.deepEqual(parsed.conflicts[0].weeks, [3, 5])
  assert.deepEqual(
    courseConflicts([course, { ...course, startTime: '09:40', endTime: '10:40' }]),
    [],
  )
})
test('changes are honest add/remove sets; reordering is not an edit', timeout, () => {
  const moved = { ...course, room: 'H102' }
  assert.deepEqual(diffCourses([course], [moved]), {
    added: [moved],
    removed: [course],
    unchanged: 0,
  })
  assert.equal(diffCourses([course, moved], [moved, course]).unchanged, 2)
  assert.deepEqual(weekCourses({ courses: [course] }, 2), [])
})
test('row, text and field limits reject before storing', timeout, () => {
  assert.throws(() => parseCourseTable(header + Array(121).fill(row).join('\n')))
  assert.throws(() => parseCourseTable('a'.repeat(50001)))
  assert.throws(() => normalizeCourses([{ ...course, name: 'a'.repeat(101) }]))
  assert.throws(() => normalizeCourses([{ ...course, room: 'A\nB' }]))
})
test('next imported class follows China time, exact weeks and end boundary', timeout, () => {
  const schedule = { firstMonday: '2026-09-07', courses: [course] }
  assert.equal(nextImportedCourse(schedule, new Date('2026-09-07T00:30:00Z')).current, true)
  assert.equal(nextImportedCourse(schedule, new Date('2026-09-07T01:40:00Z')).date, '2026-09-21')
  assert.equal(nextImportedCourse(schedule, new Date('2026-10-05T01:40:00Z')), null)
  assert.equal(nextImportedCourse(schedule, new Date('2026-09-06T17:00:00Z')).date, '2026-09-07')
})
test('metadata requires an explicit valid first-week Monday, not today guessing', timeout, () => {
  assert.doesNotThrow(() =>
    validateCourseMetadata({ semester: '学期', firstMonday: '2026-09-07', remindDays: 7 }),
  )
  for (const date of ['', '2026-09-08', '2026-02-30', '1999-01-04'])
    assert.throws(() =>
      validateCourseMetadata({ semester: '学期', firstMonday: date, remindDays: 7 }),
    )
})
