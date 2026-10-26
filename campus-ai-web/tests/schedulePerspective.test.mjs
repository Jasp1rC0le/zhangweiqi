import test from 'node:test'
import assert from 'node:assert/strict'
import { planScheduleQuestion, scheduleQuery, requestScheduleQuery, validScheduleQuery } from '../src/utils/scheduleIntent.js'
import { readPrivateScheduleQuery, previousScheduleQuery } from '../src/utils/scheduleChat.js'
import { resolveTeachingWorkflow, previousTeachingWorkflow } from '../src/utils/teachingWorkflows.js'
import { resolveChatAction } from '../src/utils/chatActions.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { chinaDate } from '../src/utils/timetable.js'
import { refineScheduleQuery } from '../src/utils/scheduleRefinement.js'
import { calendarSchedulePreset, ownScheduleDestination } from '../src/utils/schedulePerspective.js'

const today = '2026-10-20', scope = 'synthetic-dual-owner', opts = { timeout: 3000 }
const ask = (text, previous = null) => planScheduleQuestion(text, { today, previous, scope })

test('explicit own teaching and learning are separate query slots, not asserted authorization', opts, () => {
  for (const text of ['我今天教什么课', '我今天要教哪些课', '今天我的授课安排', '我作为老师今天有什么课', '请查我今天讲的课'])
    assert.deepEqual(ask(text), scheduleQuery(today, today, { perspective: 'TEACHER' }), text)
  for (const text of ['我今天上的课', '我作为学生今天有什么课', '今天我选的课'])
    assert.deepEqual(ask(text), scheduleQuery(today, today, { perspective: 'STUDENT' }), text)
  assert.deepEqual(ask('今天谁给我上课'), scheduleQuery(today, today, { detail: 'TEACHER' }))
  assert.deepEqual(ask('今天《我教的课》在哪上'), scheduleQuery(today, today, { detail: 'LOCATION', course: '我教的课' }))
  assert.ok(ask('我今天教的课和我今天上的课')?.clarification)
})

test('role followups preserve dates but changing perspective drops the old course and lesson anchor', opts, () => {
  const prior = { ...scheduleQuery('2026-10-21', '2026-10-21', { perspective: 'TEACHER', course: '已定位的授课', selection: 'AT', anchor: '2026-10-21T14:00:00' }), focus: '2026-10-21T14:00:00', focusName: '已定位的授课' }
  const changed = ask('那我作为学生呢', prior)
  assert.deepEqual(changed, scheduleQuery('2026-10-21', '2026-10-21', { perspective: 'STUDENT' }))
  const next = ask('明天呢', { ...scheduleQuery(today, today, { perspective: 'TEACHER' }) })
  assert.equal(next.perspective, 'TEACHER')
  const messages = [{ role: 'user', content: '我今天教什么课', localSchedule: true }, { role: 'assistant', localSchedule: true, scheduleQuery: { ...prior, scope } }]
  assert.equal(previousScheduleQuery(messages, scope).perspective, 'TEACHER')
  assert.equal(previousScheduleQuery(messages, 'other-owner'), null)
  assert.equal(resolveTeachingWorkflow('明天呢', { today, scope, previous: previousTeachingWorkflow(messages, scope) }), null)
  assert.equal(resolveChatAction('我今天教什么课'), null)
})

test('query transport retains perspective and rejects ignored, wrong, or overbroad server scope', opts, async () => {
  const query = scheduleQuery(today, today, { perspective: 'TEACHER' })
  assert.equal(requestScheduleQuery(query).perspective, 'TEACHER')
  assert.equal(validScheduleQuery({ ...query, perspective: 'SECRETARY' }), false)
  const data = { version: 1, from: today, to: today, period: 'ALL', selection: 'ALL', detail: 'SUMMARY', count: 0, unknownTimes: 0, focus: null, asOf: '2026-10-20T01:00:00Z', answer: '合成空范围' }
  await assert.rejects(readPrivateScheduleQuery(query, null, async () => ({ data })), /范围|响应/)
  for (const queryScope of [
    { version: 1, requested: 'STUDENT', resolved: 'STUDENT' },
    { version: 1, requested: 'TEACHER', resolved: 'SECRETARY' },
    { version: 1, requested: 'TEACHER', resolved: 'STUDENT' },
  ]) await assert.rejects(readPrivateScheduleQuery(query, null, async () => ({ data: { ...data, queryScope } })), /范围|响应/)
  const good = { ...data, queryScope: { version: 1, requested: 'TEACHER', resolved: 'TEACHER' } }
  assert.deepEqual(await readPrivateScheduleQuery(query, null, async () => ({ data: good })), good)
  assert.deepEqual(await readPrivateScheduleQuery(scheduleQuery(today), null, async () => ({ data })), data, 'old default read remains compatible')
})

test('DEV dual role reads distinct real fixture assignments and candidate refinement keeps the chosen role', opts, async () => {
  const fixture = createTeachingFlowFixture({ dualRoleDemo: true }), day = chinaDate()
  const read = query => fixture.adapter({ method: 'get', url: '/api/timetable/unified/query', params: query })
  const teaching = scheduleQuery(day, day, { perspective: 'TEACHER' })
  const teach = await readPrivateScheduleQuery(teaching, null, read)
  assert.equal(teach.count, 1)
  assert.match(teach.display.entries[0].name, /微处理器/)
  assert.deepEqual(teach.display.entries[0].sources, ['TEACHING'])
  const study = await readPrivateScheduleQuery(scheduleQuery(day, day, { perspective: 'STUDENT' }), null, read)
  assert.equal(study.count, 2)
  assert.ok(study.display.entries.some(row => /网络/.test(row.name)))
  assert.ok(study.display.entries.some(row => /体育/.test(row.name)))
  assert.ok(!study.display.entries.some(row => /微处理器/.test(row.name)))
  const query = { ...teaching, course: '不存在的合成名称' }, result = await readPrivateScheduleQuery(query, null, read)
  const message = { localSchedule: true, scheduleQuery: { ...query, scope }, scheduleResult: result }
  const corrected = refineScheduleQuery(message, result.refinement.courseChoices[0], scope)
  assert.equal(corrected.perspective, 'TEACHER')
  assert.equal((await readPrivateScheduleQuery(corrected, null, read)).count, 1)
  assert.throws(() => refineScheduleQuery({ ...message, scheduleQuery: { ...message.scheduleQuery, perspective: 'STUDENT' } }, '', scope), /归属|变化/)
  fixture.setActor(8)
  await assert.rejects(readPrivateScheduleQuery(teaching, null, read), error => error.response.status === 403)
  const own = await readPrivateScheduleQuery(scheduleQuery(day), null, read)
  assert.equal(own.count, 1)
  assert.match(own.display.entries[0].name, /设计/)
})

test('answer links retain the checked own view and date without carrying owner credentials or leadership scope', opts, () => {
  const target=ownScheduleDestination({from:'2026-10-21',queryScope:{version:1,requested:'TEACHER',resolved:'TEACHER'}})
  assert.deepEqual(target,{path:'/timetable',query:{queryView:'TEACHER',queryDate:'2026-10-21'}})
  assert.deepEqual(calendarSchedulePreset({...target.query,userId:8}),{view:'TEACHER',date:'2026-10-21',monday:'2026-10-19'})
  assert.equal(calendarSchedulePreset({}),null)
  for(const bad of [{queryView:'SECRETARY',queryDate:today},{queryView:'TEACHER'},{queryView:['STUDENT','TEACHER'],queryDate:today},{queryView:'STUDENT',queryDate:'2026-02-30'}])
    assert.ok(calendarSchedulePreset(bad).error)
})
