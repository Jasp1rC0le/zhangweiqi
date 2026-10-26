import test from 'node:test'
import assert from 'node:assert/strict'
import { planScheduleQuestion as plan, scheduleQuery, validScheduleQuery } from '../src/utils/scheduleIntent.js'

const today = '2026-10-25'
const publishedQuestion = '只按本地资料，不联网：2024版《新工科建设方案》中到2027年的数字，能当作已完成成果或个人申报资格吗？请说明原文日期并给出来源。'
for (const previous of [null, scheduleQuery('2026-10-13'), { awaiting: true }]) {
  test(`quoted public planning question is not a course lookup with ${previous ? previous.awaiting ? 'pending' : 'resolved' : 'no'} schedule context`, () => {
    assert.equal(plan(publishedQuestion, { today, previous }), null)
  })
}

test('quoted policy publication, goals and application questions keep the public knowledge route', () => {
  for (const text of [
    '《人才培养规划》的原文和发布日是什么？',
    '《教学建设方案》的目标已经完成了吗？',
    '“奖学金申请办法”的申报资格和来源是什么？',
    '请对比《建设规划》和《实施细则》的原文要求。',
  ]) assert.equal(plan(text, { today }), null, text)
})

test('document-like course names still allow explicit timetable reads', () => {
  for (const [text, course] of [
    ['明天《城市规划》谁教', '城市规划'],
    ['《政策分析》明天在哪上', '政策分析'],
    ['明天《施工方案》几点上课', '施工方案'],
  ]) {
    const result = plan(text, { today })
    assert.ok(validScheduleQuery(result), text)
    assert.equal(result.course, course)
    assert.equal(result.from, '2026-10-26')
  }
})

test('bare numeric date followups and protected saved-source routing stay unchanged', () => {
  assert.deepEqual(plan('10.13', { today, previous: scheduleQuery(today) }), scheduleQuery('2026-10-13'))
  assert.ok(plan('我的课表原始文件在哪', { today })?.clarification)
})
