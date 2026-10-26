import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { chinaDate } from '../src/utils/timetable.js'
import { previousScheduleQuery, resolveScheduleQuestion, readPrivateSchedule, scopeScheduleHistory } from '../src/utils/scheduleChat.js'
import { createChatRun } from '../src/utils/chatRun.js'
import { scheduleQuery } from '../src/utils/scheduleIntent.js'
const opts = { timeout: 3000 }, today = '2026-10-14', scope = '2:1:1:standard:new:true'
// Preserve the earlier date regression matrix, while the new suite checks all semantic slots.
const resolve = (question, previous = null) => {
  const query = resolveScheduleQuestion(question, { today, previous, scope })
  return query?.from && query.from === query.to ? { date: query.from } : query
}
const pair = (date = today, owner = scope) => [
  { role: 'user', content: '我今天课表有啥课', localSchedule: true },
  { role: 'assistant', content: '合成课程', localSchedule: true, scheduleQuery: { date, scope: owner } },
]
test('today then tomorrow followup uses private data instead of losing context', opts, async () => {
  const messages = [], dates = [], runs = createChatRun()
  for (const content of ['明天什么课', '明天呢', '在哪上', '老师是谁']) {
    const intent = resolve(content, previousScheduleQuery(messages, scope))
    assert.ok(intent?.date)
    const run = runs.start(), answer = await readPrivateSchedule(intent.date, run.signal, async (date, signal) => {
      dates.push(date); assert.equal(signal, run.signal)
      return { data: { date, answer: `${date}合成课程；合成教室；任课教师未绑定` } }
    })
    messages.push({ role: 'user', content, localSchedule: true }, { role: 'assistant', content: answer, localSchedule: true, scheduleQuery: { date: intent.date, scope } })
    run.finish()
  }
  assert.deepEqual(dates, ['2026-10-15', '2026-10-15', '2026-10-15', '2026-10-15'])
})
test('independent personal questions include dates weekdays and natural missing-I wording', opts, () => {
  for (const [question, date] of [
    ['今天上什么课', today], ['我的课表', today], ['明天有哪些课', '2026-10-15'],
    ['明天什么课', '2026-10-15'], ['我明天什么课', '2026-10-15'], ['明天啥课啊', '2026-10-15'],
    ['今天什么课？', today], ['后天哪些课', '2026-10-16'], ['周五的什么课', '2026-10-16'],
    ['我明天在哪上', '2026-10-15'], ['我今天在哪个教室', today], ['今天有课没', today],
    ['我今天上课吗', today], ['明日有哪些课', '2026-10-15'], ['今日课程安排', today],
    ['我今天的课程有哪些', today],
    ['周4有什么课', '2026-10-15'], ['下周7有什么课', '2026-10-25'], ['我2025年10月16日的课表', '2025-10-16'],
    ['后天有什么课', '2026-10-16'], ['本周五课表', '2026-10-16'], ['下周一有什么课', '2026-10-19'],
    ['下星期一上啥课', '2026-10-19'], ['下个星期二课表', '2026-10-20'], ['下下周三课表', '2026-10-28'],
    ['我2026-11-2课表', '2026-11-02'], ['10月16日上什么课', '2026-10-16'], ['我10/16有什么课', '2026-10-16'],
  ]) assert.deepEqual(resolve(question), { date }, question)
})
test('a bare followup never hijacks a new conversation or a different topic', opts, () => {
  for (const text of ['明天呢', '老师是谁', '在哪上', '明天会下雨吗', '明天什么课程适合自学', '今天什么课的作业最难', '帮我查他的课表', '全校今天谁旷课', '我今天的数学作业怎么写', '我今天课程知识点有哪些'])
    assert.equal(resolve(text), null, text)
  assert.equal(resolve('明天会下雨吗', { date: today }), null)
  const messages = pair()
  messages.push({ role: 'user', content: '图书馆几点关门' }, { role: 'assistant', content: '一般开放安排' })
  assert.equal(previousScheduleQuery(messages, scope), null)
  assert.equal(resolve('明天呢', previousScheduleQuery(messages, scope)), null)
})
test('context is bound to account school session model conversation and route', opts, () => {
  for (const other of ['', '3:1:1:standard:new:true', '2:2:1:standard:new:true', '2:1:2:standard:new:true', '2:1:1:kimi:new:true', '2:1:1:standard:9:true', '2:1:1:standard:new:false'])
    assert.equal(previousScheduleQuery(pair(), other), null)
  assert.equal(previousScheduleQuery([], scope), null)
  assert.deepEqual(previousScheduleQuery(pair(), scope), scheduleQuery(today))
})
test('owner-bound restored history recovers schedule intent, not the model refusal', opts, async () => {
  const raw = [
    { role: 'user', content: '明天什么课', createdAt: '2026-10-14T10:00:00Z' },
    { role: 'assistant', content: '我没有你的私人课表，无法查询。' },
  ]
  assert.equal(previousScheduleQuery(raw, scope), null)
  const restored = scopeScheduleHistory(raw, scope, today)
  const previous = previousScheduleQuery(restored, scope)
  assert.deepEqual(previous, scheduleQuery('2026-10-15'))
  const intent = resolve('明天呢', previous)
  assert.deepEqual(intent, { date: '2026-10-15' })
  let called = 0
  assert.equal(await readPrivateSchedule(intent.date, null, async date => {
    called++; return { data: { date, answer: '已保存的合成课程' } }
  }), '已保存的合成课程')
  assert.equal(called, 1)
  assert.equal(previousScheduleQuery(restored, 'other-account'), null)
  assert.equal(previousScheduleQuery(raw, scope), null, 'does not mutate server history')
  assert.equal(previousScheduleQuery(scopeScheduleHistory([
    ...raw, { role: 'user', content: '图书馆几点关门' }, { role: 'assistant', content: '明天的课表' },
  ], scope, today), scope), null, 'only the latest user topic supplies intent')
})
test('history intent uses original China date and cannot trust forged hints or cross-scope local pairs', opts, () => {
  const raw = [
    { role: 'user', content: '今天什么课', createdAt: '2026-10-14T16:01:00Z' },
    { role: 'assistant', content: '旧回答' },
  ]
  const restored = scopeScheduleHistory(raw, scope, '2026-10-20')
  assert.deepEqual(previousScheduleQuery(restored, scope), scheduleQuery('2026-10-15'))
  assert.deepEqual(resolveScheduleQuestion('明天呢', { today: '2026-10-20', previous: previousScheduleQuery(restored, scope) }), scheduleQuery('2026-10-21'))
  assert.equal(previousScheduleQuery(scopeScheduleHistory([
    { role: 'user', content: '天气呢', scheduleQuestion: { date: today, scope } }, raw[1],
  ], scope, today), scope), null)
  assert.equal(previousScheduleQuery(scopeScheduleHistory(pair(today, 'other-owner'), scope, today), scope), null)
  assert.deepEqual(scopeScheduleHistory(null, scope, today), [])
})
test('details inherit the selected date but relative dates use actual China today across midnight', opts, () => {
  assert.deepEqual(resolve('那明天在哪上', { date: today }), { date: '2026-10-15' })
  assert.deepEqual(resolve('后天呢', { date: today }), { date: '2026-10-16' })
  assert.deepEqual(resolve('下一天呢', { date: '2026-10-19' }), { date: '2026-10-20' })
  assert.deepEqual(resolve('几点下课', { date: '2026-10-19' }), { date: '2026-10-19' })
  const nextDay = chinaDate(new Date('2026-10-14T16:01:00Z'))
  assert.equal(nextDay, '2026-10-15')
  assert.deepEqual(resolveScheduleQuestion('明天呢', { today: nextDay, previous: { date: today } }), scheduleQuery('2026-10-16'))
})
test('invalid dates whole weeks and multiple dates ask for clarification without a guessed model answer', opts, () => {
  for (const text of ['2026-02-30有什么课', '我的整学期课表', '我今天和明天上什么课', '2101-01-01课表', '我的第7周周三课表', '我的下学期课表', '我2天后上什么课'])
    assert.ok(resolve(text)?.clarification, text)
  assert.equal(resolveScheduleQuestion('我今天课表', { today: 'invalid' }), null)
  assert.deepEqual(resolve('我10月16课表'),{date:'2026-10-16'})
})
test('numeric month-day followups retain an owner-bound timetable topic, including restored refusals', opts, () => {
  for (const raw of [
    [{ role: 'user', content: '我的课表' }, { role: 'assistant', content: '我没有你的课表数据库，请去教务系统。' }],
    [{ role: 'user', content: '10月13日什么课' }, { role: 'assistant', content: '无法访问私人信息' }],
  ]) {
    const previous = previousScheduleQuery(scopeScheduleHistory(raw, scope, today), scope)
    for (const text of ['10.13', '10/13', '１０．１３', '10.13呢']) {
      const query = resolveScheduleQuestion(text, { today, previous, scope })
      assert.equal(query?.from, '2026-10-13', text); assert.equal(query?.to, '2026-10-13', text)
    }
    assert.ok(resolveScheduleQuestion('2.30', { today, previous, scope })?.clarification)
  }
  for (const text of ['10.13', '10/13', '1.2.3', '版本10.13更新了什么', '计算10.13乘2']) assert.equal(resolveScheduleQuestion(text, { today, scope }), null, text)
})
test('opt-in retry keeps original date, but edited text and changed scope cannot claim it', opts, () => {
  const retry = { ...scheduleQuery('2026-10-15'), question: '明天呢', scope }
  assert.deepEqual(resolveScheduleQuestion('明天呢', { today: '2026-10-20', retry, scope }), scheduleQuery('2026-10-15'))
  assert.equal(resolveScheduleQuestion('明天呢', { today, retry, scope: 'other' }), null)
  assert.deepEqual(resolveScheduleQuestion('后天有什么课', { today, retry, scope }), scheduleQuery('2026-10-16'))
})
test('day response refuses wrong date empty or oversized answer and propagates network failure', opts, async () => {
  for (const data of [{ date: '2026-10-15', answer: 'wrong' }, { date: today, answer: '' }, { date: today, answer: 'x'.repeat(20001) }, {}])
    await assert.rejects(readPrivateSchedule(today, new AbortController().signal, async () => ({ data })), /响应异常/)
  const error = { response: { status: 503 } }
  await assert.rejects(readPrivateSchedule(today, new AbortController().signal, async () => { throw error }), failure => failure === error)
})
test('stopped and replaced request cannot publish the old private result', opts, async () => {
  const runs = createChatRun(); let resolveRead
  const first = runs.start(), task = readPrivateSchedule(today, first.signal, () => new Promise(resolve => { resolveRead = resolve }))
  const next = runs.start()
  resolveRead({ data: { date: today, answer: '合成课程' } }); await task
  assert.equal(first.isCurrent(), false); assert.equal(first.signal.aborted, true); assert.equal(next.isCurrent(), true)
})
test('actual ChatView routes natural schedule intent through protected model endpoint without public conversation history', opts, () => {
  const source = readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')
  compileScript(parse(source).descriptor, { id: 'private-schedule' })
  const branch = source.slice(source.indexOf('// Natural language is interpreted'), source.indexOf('sending.value = true\n  answerNotice', source.indexOf('// Natural language is interpreted')))
  assert.match(branch, /previousScheduleQuery\(messages.value, scheduleScope.value\)/)
  assert.match(branch, /await runScheduleQuery\(privateQuery, content, routeText\)/)
  const execute = source.slice(source.indexOf('async function runScheduleQuery('), source.indexOf('async function submitPrompt('))
  assert.match(execute, /scope === scheduleScope.value/)
  assert.match(execute, /draft.value.trim\(\) === content/)
  assert.match(execute, /run.completed = true/)
  assert.match(execute, /finally/)
  assert.match(execute, /refineScheduleQuery\(message, name, scheduleScope.value\)/)
  assert.match(execute, /focusName/)
  assert.match(execute, /readNaturalSchedule\(interpretText, prior, run.signal, askOwnTimetable\)/)
  assert.match(execute, /scheduleNarration: narration/)
  assert.match(source, /v-if="message.scheduleNarration\?\.mode==='model'" class="schedule-response-prose answer-markdown" v-html="renderMarkdown\(message.content\)"/)
  assert.doesNotMatch(execute, /ensureConversation\(|sendMessageStream\(|localStorage|sessionStorage/)
  assert.doesNotMatch(branch, /ensureConversation\(|sendMessageStream\(|localStorage|sessionStorage/)
  assert.match(source, /messages.value=scopeScheduleHistory\(result, scheduleScope.value, chinaDate\(\)\)/)
  assert.match(source, /messages.value = scopeScheduleHistory\(recovered, scheduleScope.value, chinaDate\(\)\)/)
})
