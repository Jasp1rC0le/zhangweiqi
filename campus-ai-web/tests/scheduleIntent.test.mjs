import test from 'node:test'
import assert from 'node:assert/strict'
import { planScheduleQuestion as plan, scheduleQuery as query, validScheduleQuery } from '../src/utils/scheduleIntent.js'
import { readPrivateScheduleQuery, previousScheduleQuery, scopeScheduleHistory } from '../src/utils/scheduleChat.js'
const today = '2026-10-15', opts = { timeout: 3000 }
const ask = (text, previous = null) => plan(text, { today, previous })
test('calendar slots recognize short course nouns and day-of-month across natural word order',opts,()=>{
  const dates=[['昨天','2026-10-14'],['前天','2026-10-13'],['13号','2026-10-13'],['十三号','2026-10-13'],['本月十三日','2026-10-13'],['10月13','2026-10-13'],['十月十三号','2026-10-13'],['2026/10/13','2026-10-13'],['下个月3号','2026-11-03']]
  const templates=['$的课','我$的课','帮我查一下我$的课','看看$有什么课','请问$上啥课','查一下$课程安排','我的$课表','帮我看一下$上什么课']
  for(const [time,date] of dates)for(const template of templates)assert.deepEqual(ask(template.replace('$',time)),query(date),template.replace('$',time))
  assert.deepEqual(ask('昨天的课',query(today,today,{period:'PM'})),query('2026-10-14'),'a dated new request resets an old afternoon restriction')
  assert.deepEqual(ask('13号呢',query('2026-09-20')),query('2026-09-13'),'bare day retains the explicitly selected conversation month')
  assert.deepEqual(ask('本月13号呢',query('2026-09-20')),query('2026-10-13'))
  for(const text of ['32号的课','二月三十号的课','2026年13月1号的课'])assert.ok(ask(text)?.clarification,text)
  for(const text of ['昨天的课程政策','13号选课流程','课程考试规定','明天的课件'])assert.equal(ask(text),null,text)
})
test('orthogonal time period operator and detail slots compose across word orders', opts, () => {
  for (const prefix of ['今天', '我今天', '请问今天', '今天我']) for (const part of ['上午', '早上', '早晨'])
    assert.deepEqual(ask(`${prefix}${part}什么课`), query(today, today, { period: 'AM' }))
  assert.deepEqual(ask('明天下午在哪个教室上课'), query('2026-10-16', '2026-10-16', { period: 'PM', detail: 'LOCATION' }))
  assert.deepEqual(ask('明早什么课'), query('2026-10-16', '2026-10-16', { period: 'AM' }))
  assert.deepEqual(ask('现在下一节在哪上'), query(today, '2026-10-28', { selection: 'NEXT', detail: 'LOCATION' }))
  assert.deepEqual(ask('我现在上什么课'), query(today, today, { selection: 'CURRENT' }))
  assert.deepEqual(ask('今天还有什么课'), query(today, today, { selection: 'REMAINING' }))
  assert.deepEqual(ask('这周多少节课'),query('2026-10-12','2026-10-18',{detail:'PERIODS'}))
  assert.deepEqual(ask('这周几门课'),query('2026-10-12','2026-10-18',{detail:'COURSES'}))
})
test('whole weeks weekends workdays and bounded continuous ranges are real query plans', opts, () => {
  for (const text of ['这周有什么课', '本周课程安排', '这星期上什么课', '本礼拜什么课'])
    assert.deepEqual(ask(text), query('2026-10-12', '2026-10-18'), text)
  assert.deepEqual(ask('下周上午有什么课'), query('2026-10-19', '2026-10-25', { period: 'AM' }))
  assert.deepEqual(ask('下个星期有什么课'),query('2026-10-19','2026-10-25'))
  assert.deepEqual(ask('上个礼拜三有什么课'),query('2026-10-07'))
  assert.deepEqual(ask('下周末有课吗'), query('2026-10-24', '2026-10-25'))
  assert.deepEqual(ask('工作日有什么课'), query('2026-10-12', '2026-10-16'))
  assert.deepEqual(ask('今天到周五有什么课'), query(today, '2026-10-16'))
  assert.deepEqual(ask('下周二到周五有什么课'), query('2026-10-20', '2026-10-23'))
  assert.deepEqual(ask('我星期几有课'), query('2026-10-12', '2026-10-18'))
})
test('elliptical followups replace only specified time slots and pin a selected lesson', opts, () => {
  const morning = ask('今天上午什么课')
  assert.deepEqual(ask('下午呢', morning), query(today, today, { period: 'PM' }))
  assert.deepEqual(ask('明天呢', morning), query('2026-10-16', '2026-10-16', { period: 'AM' }))
  assert.deepEqual(ask('明天什么课', morning), query('2026-10-16'), 'a new explicit question resets implicit period')
  const week = ask('下周有什么课')
  assert.deepEqual(ask('周五呢', week), query('2026-10-23'))
  const next = { ...ask('下一节在哪上'), focus: '2026-10-16T08:30:00' }
  assert.deepEqual(ask('老师是谁', next), query(next.from, next.to, { selection: 'AT', detail: 'TEACHER', anchor: next.focus }))
  const pinned = { ...ask('老师是谁', next), focus: next.focus }
  assert.deepEqual(ask('几点开始', pinned), query(next.from, next.to, { selection: 'AT', detail: 'TIME', anchor: next.focus }))
  assert.deepEqual(ask('再下一节呢', pinned), query('2026-10-16', '2026-10-29', { selection: 'NEXT', anchor: next.focus }))
  assert.deepEqual(ask('下一节在哪上',{...query(today),focus:'2026-10-15T08:30:00'}),query(today,'2026-10-28',{selection:'NEXT',detail:'LOCATION'}),'a normal daily answer does not advance from an earlier course instead of now')
  assert.deepEqual(ask('下一节在哪上',{...query(today,today,{period:'PM'}),focus:'2026-10-15T14:00:00'}),query(today,'2026-10-28',{selection:'NEXT',detail:'LOCATION'}),'a new next-class lookup resets the previous afternoon filter')
  assert.deepEqual(ask('下一节在哪上',{...query(today,today,{course:'物理实验'}),focus:'2026-10-15T14:00:00'}),query(today,'2026-10-28',{selection:'NEXT',detail:'LOCATION'}),'a new next-class lookup does not silently retain an unrelated course filter')
})
test('ambiguity and unsupported calendar scopes clarify instead of guessing or leaking', opts, () => {
  for (const text of ['第七周什么课', '明天上午下午什么课', '2026-02-30有什么课', '今天和明天上什么课', '2026-10-20到2026-10-15课表', '2026-10-01到2026-10-31课表', '这门谁教'])
    assert.ok(ask(text)?.clarification, text)
  for (const text of ['明天呢', '下午呢', '老师是谁', '明天会下雨吗', '现在日期是几号', '现在几点', '还有什么好吃的', '怎么导入课表', '帮我查他的课表'])
    assert.equal(ask(text), null, text)
  assert.equal(ask('明天会下雨吗', query(today)), null)
  assert.equal(ask('水卡丢了怎么办', query(today)), null)
})
test('course entity is a slot resolved against saved data, not a hardcoded alias list', opts, () => {
  const physics=ask('今天物理实验在哪上课')
  assert.deepEqual(physics,query(today,today,{detail:'LOCATION',course:'物理实验'}))
  assert.deepEqual(ask('明天呢',physics),query('2026-10-16','2026-10-16',{course:'物理实验'}))
  assert.deepEqual(ask('今天计网在哪上'),query(today,today,{detail:'LOCATION',course:'计网'}))
  assert.deepEqual(ask('这周所有课程'),query('2026-10-12','2026-10-18'))
})
test('clarification retains schedule topic without inventing the missing date', opts, () => {
  assert.deepEqual(ask('明天呢',{awaiting:true}),query('2026-10-16'))
  assert.ok(ask('上午呢',{awaiting:true})?.clarification)
  const scope='owner-1'
  const messages=scopeScheduleHistory([
    {role:'user',content:'今天上午什么课'},{role:'assistant',content:'旧的错误拒答'},
    {role:'user',content:'明天呢'},{role:'assistant',content:'另一个旧拒答'},
  ],scope,today)
  assert.deepEqual(previousScheduleQuery(messages,scope),query('2026-10-16','2026-10-16',{period:'AM'}))
  assert.equal(previousScheduleQuery(messages,'other-owner'),null)
})
test('range responses are tied to semantic slots and reject malformed focus or incomplete answers', opts, async () => {
  const q = ask('这周有什么课'), base = { ...q, version: 1, count: 2, unknownTimes: 0, focus: null, answer: '合成周课程', asOf: '2026-10-15T02:00:00Z' }
  assert.equal((await readPrivateScheduleQuery(q, null, async () => ({ data: base }))).answer, base.answer)
  for (const change of [{ to: today }, { period: 'AM' }, { selection: 'NEXT' }, { count: -1 }, { count: 201 }, { answer: '' }, { focus: '2026-10-21T08:30:00' }, { focus: '2026-10-15T25:30:00' }])
    await assert.rejects(readPrivateScheduleQuery(q, null, async () => ({ data: { ...base, ...change } })), /响应异常/)
  assert.equal(validScheduleQuery({ ...q, selection: 'AT' }), false)
  assert.equal(validScheduleQuery({ ...q, anchor: '2026-10-15T08:30:00' }), false)
  const failure = { response: { status: 503 } }
  await assert.rejects(readPrivateScheduleQuery(q, null, async () => { throw failure }), error => error === failure)
})
