import test from 'node:test'
import assert from 'node:assert/strict'
import { planScheduleQuestion, scheduleQuery } from '../src/utils/scheduleIntent.js'
import { previousScheduleQuery, readPrivateScheduleQuery } from '../src/utils/scheduleChat.js'
import { previousTeachingWorkflow, resolveTeachingWorkflow } from '../src/utils/teachingWorkflows.js'
import { resolveChatAction } from '../src/utils/chatActions.js'

const today = '2026-10-20', scope = 'synthetic-owner:school:session:model:conversation:chat'
const opts = { timeout: 3000 }
const ask = (text, previous = null) => planScheduleQuestion(text, { today, previous, scope })
function dispatch(text, messages = [], owner = scope) {
  const context = { today, scope: owner, previous: previousTeachingWorkflow(messages, owner) }
  const action = resolveChatAction(text), workflow = resolveTeachingWorkflow(text, context)
  if (workflow) return { kind: 'workflow', value: workflow }
  if (action) return { kind: 'action', value: action }
  const value = planScheduleQuestion(text, { today, scope: owner, previous: previousScheduleQuery(messages, owner) })
  return value ? { kind: 'schedule', value } : { kind: 'model' }
}

test('spoken location and teacher clauses never become phantom course filters', opts, () => {
  const days = [['今天', today], ['明天', '2026-10-21'], ['后天', '2026-10-22']]
  const starts = ['', '请问', '帮我看一下']
  const clauses = [
    ['我要去哪上课', 'LOCATION'], ['我需要去哪个教室上课', 'LOCATION'],
    ['在什么地方上课', 'LOCATION'], ['谁给我上课', 'TEACHER'],
    ['谁来给我上课', 'TEACHER'], ['是什么老师上课', 'TEACHER'],
    ['的课什么时候下', 'TIME'],
  ]
  for (const [day, date] of days) for (const start of starts) for (const [clause, detail] of clauses) {
    const text = `${start}${day}${clause}`
    assert.deepEqual(ask(text), scheduleQuery(date, date, { detail }), text)
  }
  assert.deepEqual(ask('我下一节去哪个教室'), scheduleQuery(today, '2026-11-02', { selection: 'NEXT', detail: 'LOCATION' }))
})

test('relative week qualifiers compose with weekday tokens instead of creating two dates', opts, () => {
  for (const qualifier of ['本周', '这周']) for (const weekday of ['星期三', '周三', '礼拜三'])
    assert.deepEqual(ask(`${qualifier}${weekday}有什么课`), scheduleQuery('2026-10-21'))
  assert.deepEqual(ask('下周星期一下午有什么课'), scheduleQuery('2026-10-26', '2026-10-26', { period: 'PM' }))
  assert.ok(ask('今天和明天有什么课')?.clarification, 'separate dates are not silently collapsed')
})

test('literal course names protect date, person, and particle words from slot extraction', opts, () => {
  for (const name of ['今天的中国', '我和我的祖国', '思想道德与法治', '谁的历史', '明日数学']) {
    assert.deepEqual(ask(`明天《${name}》在哪上`),
      scheduleQuery('2026-10-21', '2026-10-21', { detail: 'LOCATION', course: name }))
  }
  assert.ok(ask('明天《网络》和《数学》在哪上')?.clarification)
  assert.equal(ask('帮我讲解《数据结构》的课后习题'), null)
})

test('a schedule followup reaches the protected query, not the generic timetable workflow', opts, async () => {
  const messages = []
  const calls = []
  for (const text of ['今天什么课', '明天呢', '谁来给我上课', '几点下', '后一天呢']) {
    const selected = dispatch(text, messages)
    assert.equal(selected.kind, 'schedule', text)
    assert.ok(!selected.value.clarification, text)
    const q = selected.value
    const response = await readPrivateScheduleQuery(q, null, async received => {
      calls.push(received)
      return { data: { ...received, version: 1, count: 1, unknownTimes: 0, focus: `${received.from}T08:30:00`, asOf: '2026-10-20T01:00:00Z', answer: `${received.from}合成课程；合成教室` } }
    })
    messages.push({ role: 'user', content: text, localSchedule: true },
      { role: 'assistant', content: response.answer, localSchedule: true, scheduleQuery: { ...q, focus: response.focus, scope } })
  }
  assert.equal(calls.length, 5)
  assert.deepEqual(calls.map(q => q.from), [today, '2026-10-21', '2026-10-21', '2026-10-21', '2026-10-22'])
  assert.equal(calls[2].detail, 'TEACHER')
  assert.equal(calls[2].selection, 'AT')
  assert.equal(dispatch('明天呢', messages, 'other-owner').kind, 'model')
  assert.equal(dispatch('图书馆几点关门', messages).kind, 'model')
})

test('explicit navigation and exports retain their real tools, without mutation', opts, () => {
  for (const text of ['打开我的课表', '进入我的课程表', '帮我打开本人课表'])
    assert.equal(dispatch(text).value?.workflow, 'TIMETABLE', text)
  assert.equal(dispatch('新增课程《数据结构》').kind, 'action')
  assert.notEqual(dispatch('导出我的课表').kind, 'model')
  assert.equal(dispatch('修改我导入的课表').kind, 'workflow')
})

test('unresolved temporal and change assertions cannot masquerade as course titles', opts, () => {
  const previous = { ...scheduleQuery('2026-10-21'), focus: '2026-10-21T08:30:00' }
  for (const text of ['今天早八在哪里上', '换个教室了吗'])
    assert.ok(ask(text, previous)?.clarification, text)
  assert.equal(ask('帮我查他的课表'), null)
  assert.equal(ask('明天什么课程适合自学'), null)
})
