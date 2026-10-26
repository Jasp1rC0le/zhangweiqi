import test from 'node:test'
import assert from 'node:assert/strict'
import { planScheduleQuestion, scheduleQuery } from '../src/utils/scheduleIntent.js'
import { previousScheduleQuery } from '../src/utils/scheduleChat.js'

test('one verified course spanning several lessons stays a course reference, not an arbitrary lesson time', { timeout: 3000 }, () => {
  const today = '2026-10-20', scope = 'synthetic-owner'
  const prior = { ...scheduleQuery(today, '2026-10-26'), focus: null, focusName: '合成同名课程' }
  const messages = [{ role: 'user', localSchedule: true }, { role: 'assistant', localSchedule: true, scheduleQuery: { ...prior, scope } }]
  const previous = previousScheduleQuery(messages, scope)
  assert.equal(previous.focusName, prior.focusName)
  const result = planScheduleQuestion('这门谁教', { today, previous })
  assert.deepEqual(result, scheduleQuery(today, '2026-10-26', { detail: 'TEACHER', course: '合成同名课程' }))
  assert.equal(result.anchor, undefined)
  assert.ok(planScheduleQuestion('后一天这门在哪上', { today, previous }).clarification)
})
