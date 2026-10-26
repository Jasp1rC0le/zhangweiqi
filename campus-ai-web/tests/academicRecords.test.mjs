import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAcademicRecords,
  academicSummary,
  resolveAcademicIntent,
  ACADEMIC_TEMPLATE,
} from '../src/utils/academicRecords.js'
test('explicit credits and grade points compute weighted GPA without inventing a grade mapping', () => {
  const records = parseAcademicRecords(
    ACADEMIC_TEMPLATE +
      '示例学期,DEMO102,另一合成课,3,90,4,是\n示例学期,DEMO103,不计入,1,合格,,否\n',
  )
  assert.deepEqual(academicSummary(records), { records: 3, credits: 5, missing: 0, gpa: 3.8 })
  const incomplete = records.map((r) => (r.code === 'DEMO102' ? { ...r, points: null } : r))
  assert.equal(academicSummary(incomplete).gpa, null)
  assert.equal(academicSummary(incomplete).missing, 1)
})
test('quoted CSV is parsed but unknown mapping, duplicate courses and invalid values are rejected', () => {
  assert.equal(
    parseAcademicRecords(ACADEMIC_TEMPLATE.replace('合成课程', '"合成,课程"'))[0].name,
    '合成,课程',
  )
  assert.throws(
    () => parseAcademicRecords(ACADEMIC_TEMPLATE + '示例学期,DEMO101,重复,2,80,3,是'),
    /重复/,
  )
  assert.throws(() => parseAcademicRecords(ACADEMIC_TEMPLATE.replace(',3.5,', ',NaN,')), /无效/)
  assert.throws(() => parseAcademicRecords('课程,分数\n数学,90'), /七列/)
})
test('own academic queries stay local and named other people never become the current user', () => {
  for (const text of ['我的绩点多少', '查我的GPA', '绩点呢'])
    assert.equal(resolveAcademicIntent(text).kind, 'GPA')
  assert.equal(resolveAcademicIntent('我的学号是多少').kind, 'NUMBER')
  assert.equal(resolveAcademicIntent('看看我的成绩').kind, 'GRADES')
  assert.equal(resolveAcademicIntent('帮我查李明的成绩').kind, 'DENIED')
  assert.equal(resolveAcademicIntent('怎么计算绩点'), null)
  assert.equal(resolveAcademicIntent('写一个我的成绩分析算法'),null)
  assert.equal(resolveAcademicIntent('帮我修改我的成绩').kind,'READ_ONLY')
  assert.equal(resolveAcademicIntent('新增我的课表课程《成绩分析》'),null)
})
