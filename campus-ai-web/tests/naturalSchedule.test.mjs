import test from 'node:test'
import assert from 'node:assert/strict'
import { naturalScheduleContext, readNaturalSchedule, naturalScheduleNotice } from '../src/utils/naturalSchedule.js'
import { previousScheduleQuery } from '../src/utils/scheduleChat.js'
import { scheduleQuery, requestScheduleQuery } from '../src/utils/scheduleIntent.js'
const query = { ...scheduleQuery('2026-10-12', '2026-10-18'), perspective: 'AUTO', course: '' }
const answer = { version: 1, ...query, anchor: null, asOf: '2026-10-24T12:00:00Z', count: 0, unknownTimes: 0, focus: null, answer: '该范围没有已保存课程', queryScope: { version: 1, requested: 'AUTO', resolved: 'STUDENT' } }
const response = () => ({ data: { version: 1, query, result: answer, clarification: null, interpreter: { provider: 'deepseek', model: 'synthetic-intent' } } })

test('colloquial last-week question goes to protected model-backed API unchanged', async () => {
  let request
  const result = await readNaturalSchedule('上周什么课表', null, new AbortController().signal, async body => { request = body; return response() })
  assert.equal(request.question, '上周什么课表'); assert.equal(request.previous, null)
  assert.equal(result.query.from, '2026-10-12'); assert.equal(result.result.answer, answer.answer)
})
test('context whitelists intent and never forwards timetable rows or assistant text', () => {
  const context = naturalScheduleContext({ ...query, scope: 'private-owner', display: { entries: [{ room: 'private-room' }] }, answer: 'private answer', teacher: 'private teacher' })
  assert.deepEqual(context, requestScheduleQuery(query))
  assert.ok(!JSON.stringify(context).includes('private'))
})
test('previous user wording survives model clarification for a follow-up', async () => {
  const scope = '2:1:1:standard:new:true'
  const previous = previousScheduleQuery([{ role: 'user', content: '课表里的体育呢', localSchedule: true, scheduleOwner: scope }, { role: 'assistant', localSchedule: true, scheduleQuery: { scope, awaiting: true, naturalQuestion: '课表里的体育呢' } }], scope)
  let request
  await readNaturalSchedule('明天', previous, new AbortController().signal, async body => { request = body; return response() })
  assert.equal(request.previousQuestion, '课表里的体育呢'); assert.equal(request.previous, null)
})
test('mismatched dates or query scope cannot be shown as a successful model lookup', async () => {
  for (const modified of [{ ...answer, from: '2026-10-19' }, { ...answer, queryScope: { version: 1, requested: 'TEACHER', resolved: 'TEACHER' } }])
    await assert.rejects(readNaturalSchedule('上周课表', null, new AbortController().signal, async () => ({ data: { ...response().data, result: modified } })), /响应异常/)
})
test('permission failure propagates with no alternate query or public model fallback', async () => {
  const failure = { response: { status: 403 } }; let calls = 0
  await assert.rejects(readNaturalSchedule('我教的课', null, new AbortController().signal, async () => { calls++; throw failure }), error => error === failure)
  assert.equal(calls, 1)
})
test('cancelled model request cannot publish a late provider response', async () => {
  const controller = new AbortController()
  await assert.rejects(readNaturalSchedule('上周课表', null, controller.signal, async () => { controller.abort(); return response() }), { name: 'AbortError' })
})
test('clarification requires model provenance and no contradictory data payload', async () => {
  const body = { version: 1, query: null, result: null, clarification: '请补充日期', interpreter: { provider: 'deepseek', model: 'synthetic-intent' } }
  const result = await readNaturalSchedule('课表', null, null, async () => ({ data: body }))
  assert.deepEqual(result.query, { clarification: '请补充日期' })
  await assert.rejects(readNaturalSchedule('课表', null, null, async () => ({ data: { ...body, result: answer } })), /响应异常/)
})
test('database-grounded model prose and exact-fact fallbacks show honest provenance', async () => {
  for (const narration of [{ mode: 'model', provider: 'kimi', model: 'synthetic-writer', reason: '' }, { mode: 'facts', provider: null, model: null, reason: 'unavailable' }, { mode: 'facts', provider: null, model: null, reason: 'updated' }]) {
    const result = await readNaturalSchedule('10.13', null, null, async () => ({ data: { ...response().data, narration } }))
    assert.deepEqual(result.narration, narration)
  }
  assert.match(naturalScheduleNotice({ mode: 'model' }), /AI根据课程记录回答/)
  assert.match(naturalScheduleNotice({ mode: 'facts', reason: 'unavailable' }), /先显示课程记录/)
  assert.match(naturalScheduleNotice({ mode: 'facts', reason: 'updated' }), /最新/)
  for (const narration of [{ mode: 'model', provider: 'unknown', model: 'x', reason: '' }, { mode: 'facts', reason: 1 }, { mode: 'invented', reason: '' }])
    await assert.rejects(readNaturalSchedule('10.13', null, null, async () => ({ data: { ...response().data, narration } })), /来源异常/)
})
