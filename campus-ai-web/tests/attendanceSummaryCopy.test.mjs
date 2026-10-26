import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { attendanceSummaryText, createAttendanceSummaryCopy } from '../src/utils/attendanceSummaryCopy.js'
const counts = { onTime: 20, absent: 3, earlyLeave: 2, unknown: 10, late: 1, excused: 4 }
const sample = () => ({ counts, planned: 8, absentStudents: 2, view: 'COUNSELOR', from: '2026-10-12', to: '2026-10-18', scopeLabel: '合成学院 · 合成一班', summaryScope: '完整授权筛选范围；不是当前页小计' })
test('summary keeps instance, unique-person and scheduled-arrangement units distinct', () => {
  const text = attendanceSummaryText(sample())
  for (const expected of ['总考勤人次：40 人次', '旷课：3 人次', '早退：2 人次', '待点名：10 人次', '涉及旷课学生：2 人（去重）', '已配置安排：8 项', '30 / 40 人次已填写，不是出勤率', '完整授权筛选范围；不是当前页小计']) assert.ok(text.includes(expected), expected)
})
test('missing optional counts stay explicitly missing and complete zero counts remain zero', () => {
  const incomplete = attendanceSummaryText({ ...sample(), planned: undefined, absentStudents: null })
  assert.match(incomplete, /已配置安排：未返回/); assert.match(incomplete, /涉及旷课学生：未返回/)
  const zero = attendanceSummaryText({ ...sample(), counts: Object.fromEntries(Object.keys(counts).map(key => [key, 0])), planned: 0, absentStudents: 0 })
  assert.match(zero, /0 \/ 0 人次已填写，不是出勤率/); assert.match(zero, /涉及旷课学生：0 人/)
})
test('incomplete distribution, unsafe ranges, unsupported roles and injected multiline scope cannot be copied', () => {
  for (const value of [null, { ...sample(), counts: { ...counts, earlyLeave: undefined } }, { ...sample(), counts: { ...counts, absent: -1 } }, { ...sample(), view: 'ADMIN' }, { ...sample(), view: 'STUDENT' }, { ...sample(), from: '2026-02-30' }, { ...sample(), from: '2026-11-01' }, { ...sample(), to: '2026-11-30' }, { ...sample(), scopeLabel: '班级\n伪造总计' }]) assert.equal(attendanceSummaryText(value), null)
})
test('copy text is a strict aggregate allowlist, not a page/roster or credential serialization', () => {
  const text = attendanceSummaryText({ ...sample(), studentName: 'PRIVATE_STUDENT_NEVER', studentNumber: 'PRIVATE_NUMBER_NEVER', owner: 'PRIVATE_OWNER_NEVER', entries: [{ name: 'PRIVATE_ROSTER_NEVER' }], token: 'PRIVATE_TOKEN_NEVER' })
  assert.doesNotMatch(text, /PRIVATE_/)
  assert.match(text, /当前授权范围的读取快照，不是实时教务同步/)
})
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function fixture(write) {
  let key = 'owner:role:range', available = true
  const state = { busy: false, notice: '', manualText: '' }, payload = attendanceSummaryText(sample())
  const resource = createAttendanceSummaryCopy({ key: () => key, available: () => available, text: () => payload, state, write })
  return { state, resource, payload, switchKey: value => { key = value }, available: value => { available = value } }
}
test('copy is explicit and duplicate clicks never issue duplicate clipboard handoffs', async () => {
  const pending = deferred(), writes = [], f = fixture(text => { writes.push(text); return pending.promise })
  assert.equal(writes.length, 0)
  const first = f.resource.copy(); assert.equal(await f.resource.copy(), false); assert.equal(writes.length, 1)
  pending.resolve(); assert.equal(await first, true); assert.equal(f.state.busy, false); assert.match(f.state.notice, /浏览器剪贴板/); assert.equal(writes[0], f.payload)
})
test('denied clipboard uses the same bounded text and reset clears manual contents', async () => {
  const f = fixture(async () => { throw new Error('opaque provider exception is never displayed') })
  assert.equal(await f.resource.copy(), false); assert.equal(f.state.manualText, f.payload); assert.match(f.state.notice, /手动复制/); assert.doesNotMatch(f.state.notice, /opaque/)
  f.resource.reset(); assert.deepEqual(f.state, { busy: false, notice: '', manualText: '' })
})
test('scope change or unmount rejects late feedback without claiming to undo an issued clipboard handoff', async () => {
  for (const failure of [false, true]) {
    const pending = deferred(), f = fixture(() => pending.promise), task = f.resource.copy()
    f.switchKey('new-owner:new-range'); f.resource.reset()
    if (failure) pending.reject(new Error('late')); else pending.resolve()
    assert.equal(await task, false); assert.deepEqual(f.state, { busy: false, notice: '', manualText: '' })
  }
  let writes = 0; const f = fixture(async () => { writes++ }); f.available(false); assert.equal(await f.resource.copy(), false); f.resource.dispose(); f.available(true); assert.equal(await f.resource.copy(), false); assert.equal(writes, 0)
})
test('summary control compiles with a labelled readonly fallback and no business/model/network API', () => {
  const filename = 'src/components/AttendanceSummaryCopy.vue', source = readFileSync(new URL('../' + filename, import.meta.url), 'utf8'), { descriptor, errors } = parse(source)
  assert.deepEqual(errors, []); compileScript(descriptor, { id: filename }); assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: filename }).errors, []); assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename, id: filename, scoped: true }).errors, [])
  assert.match(source, /readonly rows="8"/); assert.match(source, /role="status"/); assert.match(source, /font-size: 16px/); assert.match(source, /resource\.dispose/)
  assert.doesNotMatch(source, /@\/api|localStorage|execCommand|fetch\(|axios|setInterval|setTimeout/)
})
test('callers use full paged aggregates and applied filters, never visible records or half-edited search', () => {
  const calendar = readFileSync(new URL('../src/components/UnifiedWeekCalendar.vue', import.meta.url), 'utf8'), teaching = readFileSync(new URL('../src/views/TeachingView.vue', import.meta.url), 'utf8')
  const context = teaching.slice(teaching.indexOf('const summaryContext ='), teaching.indexOf('const filtersExpanded'))
  assert.match(context, /state\.lessonQuery/); assert.match(context, /state\.lessonPage/); assert.match(context, /query\.search/); assert.doesNotMatch(context, /search\.value|filtered\.value|state\.lessons/)
  const calendarContext = calendar.slice(calendar.indexOf('const summaryContext ='), calendar.indexOf('const noticeError'))
  assert.match(calendarContext, /state\.pagination\.summaryScope/); assert.match(calendarContext, /!selected/); assert.doesNotMatch(calendarContext, /displayed\.value|entries\.length|classSearch\.value/)
})
