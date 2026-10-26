import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { attendanceChart, distributionPercent } from '../src/utils/cockpit.js'
const counts = { onTime: 20, absent: 3, earlyLeave: 2, unknown: 10, late: 1, excused: 4 }
const zeros = () => Object.fromEntries(Object.keys(counts).map(key => [key, 0]))
test('ring sectors cover the complete validated instance distribution without treating unknown as absence', () => {
  const model = attendanceChart(counts)
  assert.equal(model.total, 40); assert.equal(model.recorded, 30)
  assert.equal(model.segments[0].offset, 0)
  for (let i = 1; i < model.segments.length; i++) assert.ok(Math.abs(model.segments[i].offset - model.segments[i - 1].offset - model.segments[i - 1].share) < 1e-10)
  const last = model.segments.at(-1); assert.ok(Math.abs(last.offset + last.share - 100) < 1e-10)
  assert.equal(model.segments.find(row => row.key === 'unknown').share, 25)
  assert.equal(model.segments.find(row => row.key === 'absent').count, 3)
  assert.equal(model.rate, undefined)
})
test('a single category is a complete ring; zero and missing are not colored sectors', () => {
  const single = attendanceChart({ ...zeros(), unknown: 3 })
  assert.equal(single.segments.length, 1); assert.equal(single.segments[0].share, 100)
  assert.equal(single.segments[0].offset, 0)
  assert.deepEqual(attendanceChart(zeros()).segments, [])
  assert.equal(attendanceChart({ ...zeros(), absent: undefined }), null)
  assert.equal(attendanceChart({ ...counts, onTime: Number.MAX_SAFE_INTEGER }), null)
})
test('both components validate the unchanged payload so missing early-leave cannot become zero', () => {
  const incomplete = { ...counts }; delete incomplete.earlyLeave
  assert.equal(attendanceChart(incomplete), null)
  assert.equal(attendanceChart({ ...incomplete, earlyLeave: 0 }).total, 38)
  for (const [name, validator] of [['AttendanceDistribution', 'attendanceChart'], ['AttendanceCockpit', 'attendanceDistribution']]) {
    const source = readFileSync(new URL(`../src/components/${name}.vue`, import.meta.url), 'utf8')
    assert.ok(source.includes(`${validator}(props.counts)`))
    assert.doesNotMatch(source, /earlyLeave:\s*0,\s*\.\.\.props\.counts/)
  }
})
test('percentages retain positive tiny values and reject corrupt shares', () => {
  assert.equal(distributionPercent(0), '0%'); assert.equal(distributionPercent(100), '100%')
  assert.equal(distributionPercent(1 / 3 * 100), '33.3%')
  assert.equal(distributionPercent(0.000001), '<0.1%')
  for (const value of [NaN, Infinity, -1, 101, null, '10']) assert.equal(distributionPercent(value), '未返回')
})
test('the ring is code-native, keyboard-readable, and never reads or writes private data', () => {
  const filename = 'src/components/AttendanceDistribution.vue', source = readFileSync(new URL('../' + filename, import.meta.url), 'utf8')
  const { descriptor } = parse(source); compileScript(descriptor, { id: 'attendance-chart' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: 'attendance-chart' }).errors, [])
  assert.match(source, /pathLength="100"/); assert.match(source, /:aria-pressed="selected === row.key"/)
  assert.match(source, /aria-live="polite"/); assert.match(source, /不是出勤率/)
  assert.match(source, /v-if="!model.total"/); assert.match(source, /min-height: 52px/)
  assert.match(source, /:disabled="!model.total"/); assert.match(source, /暂无占比/)
  assert.doesNotMatch(source, /fetch\(|axios|@\/api|localStorage|canvas|setInterval|requestAnimationFrame/)
})
test('compact chat preserves all task actions, helper names and the existing send boundary', () => {
  const source = readFileSync(new URL('../src/components/ChatStart.vue', import.meta.url), 'utf8')
  assert.match(source, /今天想聊什么？/); assert.doesNotMatch(source, /CampMark|chat-start-arrow/)
  assert.match(source, /今天、下一节、上课地点/); assert.match(source, /item.description/)
  assert.match(source, /clip-path: inset\(50%\)/)
  assert.doesNotMatch(source, /submitPrompt|sendMessage|axios|fetch\(/)
})
test('chat keeps one bottom dock across empty, history, operations and voice states', () => {
  const source = readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /chat-main--fresh/)
  for (const value of ['ChatAttachmentPreview', 'ChatDraftRecovery', 'HoldToTalk', 'aria-label="停止接收回答"', 'aria-label="发送"']) assert.ok(source.includes(value))
  const css = readFileSync(new URL('../src/styles/chat-refinement.css', import.meta.url), 'utf8')
  assert.match(css, /\.message-scroller \{ flex: 1 1 0; min-height: 0; \}/)
  assert.match(css, /\.composer-wrap \{ margin-top: auto;/)
  assert.doesNotMatch(css, /\.landing|\.pro-view|\.login-view|display: none|height[^;]*transition/)
  const teaching = readFileSync(new URL('../src/views/TeachingView.vue', import.meta.url), 'utf8')
  assert.match(teaching, /v-show="!leadership \|\| filtersExpanded"/)
  assert.match(teaching, /aria-controls="teaching-query-filters"/)
  assert.match(teaching, /课程筛选：\{\{ state.lessonQuery.search \}\}/)
})
