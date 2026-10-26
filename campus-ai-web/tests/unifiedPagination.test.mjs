import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { createUnifiedScopes, createUnifiedTimetable, validatedScopePage, validatedUnifiedPage } from '../src/utils/unifiedTimetable.js'
const opts = { timeout: 3000 }
const fixture = async (url, params = {}) => {
  const f = createTeachingFlowFixture(); f.setActor(6)
  return (await f.adapter({ url, method: 'get', params })).data
}
test('detail pages retain complete-scope summary and never advertise a partial grid as whole week', opts, async () => {
  const a = validatedUnifiedPage(await fixture('/api/timetable/unified/page', { page: 0, size: 1 })), b = validatedUnifiedPage(await fixture('/api/timetable/unified/page', { page: 1, size: 1 }))
  assert.equal(a.total, 2); assert.equal(a.totalPages, 2); assert.equal(a.week.entries.length, 1)
  assert.deepEqual(a.week.summary, b.week.summary); assert.equal(a.week.gridSafe, false)
  assert.notEqual(a.week.entries[0].id, b.week.entries[0].id)
})
test('class pages are backend-filtered bounded and distinct from timetable data', opts, async () => {
  const a = validatedScopePage(await fixture('/api/timetable/unified/scopes/page', { page: 0, size: 1 })), b = validatedScopePage(await fixture('/api/timetable/unified/scopes/page', { page: 1, size: 1 }))
  assert.equal(a.total, 2); assert.notEqual(a.scopes.classes[0].id, b.scopes.classes[0].id)
  assert.equal(a.scopes.entries, undefined); assert.equal(a.scopes.summary, undefined)
  const empty = validatedScopePage(await fixture('/api/timetable/unified/scopes/page', { search: '不存在的合成班' })); assert.equal(empty.total, 0)
})
test('large-scope preview actually changes pages and class filtering without changing full statistics', opts, async () => {
  const f = createTeachingFlowFixture({ largeScope: true });f.setActor(6)
  const api = async (url, params) => (await f.adapter({ url, method: 'get', params })).data
  const classes = validatedScopePage(await api('/api/timetable/unified/scopes/page', { size: 50 }))
  assert.equal(classes.total, 132);assert.equal(classes.totalPages, 3);assert.equal(classes.scopes.classes.length, 50)
  const a = validatedUnifiedPage(await api('/api/timetable/unified/page', { size: 50 })), b = validatedUnifiedPage(await api('/api/timetable/unified/page', { size: 50, page: 1 }))
  assert.equal(a.total, 132);assert.equal(a.week.entries.length, 50);assert.equal(a.week.summary.attendance.unknown, 396)
  assert.deepEqual(a.week.summary, b.week.summary)
  assert.equal(new Set([...a.week.entries, ...b.week.entries].map(e => e.id)).size, 100)
  const selected = await api('/api/timetable/unified/page', { size: 50, classId: classes.scopes.classes[0].id });assert.equal(selected.total, 1);assert.equal(selected.week.summary.attendance.unknown, 3)
})
test('invalid page counts missing rows wrong size repeated IDs or partial grid are rejected', opts, async () => {
  const page = await fixture('/api/timetable/unified/page', { size: 1 })
  for (const invalid of [{ ...page, page: -1 }, { ...page, totalPages: 3 }, { ...page, total: 0 }, { ...page, size: 101 }, { ...page, week: { ...page.week, entries: [] } }, { ...page, week: { ...page.week, gridSafe: true } }]) assert.throws(() => validatedUnifiedPage(invalid))
  const classes = await fixture('/api/timetable/unified/scopes/page')
  assert.throws(() => validatedScopePage({ ...classes, scopes: { ...classes.scopes, classes: [classes.scopes.classes[0], classes.scopes.classes[0]] } }))
})
test('first-load metadata survives an independent course-page failure, and another owner cannot adopt it', opts, async () => {
  let owner = '6:1:1', release
  const scopeState = {}, courseState = {}, original = await fixture('/api/timetable/unified/scopes/page')
  const scopes = createUnifiedScopes({ owner: () => owner, state: scopeState, read: async () => ({ data: original }) })
  await scopes.load('SECRETARY', 0, '')
  const courses = createUnifiedTimetable({ owner: () => owner, state: courseState, read: async () => { throw { response: { status: 400, data: { message: '范围过大（合成失败）' } } } } })
  await courses.load('2026-10-12', 'SECRETARY', '', 0)
  assert.equal(scopeState.data.scopes.classes.length, 2); assert.equal(courseState.week, null); assert.match(courseState.error, /范围过大/)
  const delayed = createUnifiedScopes({ owner: () => owner, state: scopeState, read: () => new Promise(resolve => { release = resolve }) })
  const pending = delayed.load('SECRETARY'); owner = '2:1:2'; delayed.reset(); release({ data: original }); await pending
  assert.equal(scopeState.data, null)
})
test('course navigation sends the requested page, validates it and keeps totals larger than one page', opts, async () => {
  const data = await fixture('/api/timetable/unified/page', { page: 1, size: 1 }), state = {}
  const resource = createUnifiedTimetable({ owner: () => '6:1:1', state, read: async (monday, view, classId, signal, page) => {
    assert.equal(page, 1); assert.equal(signal.aborted, false); return { data }
  } })
  await resource.load(data.week.monday, 'SECRETARY', '', 1)
  assert.equal(state.pagination.page, 1); assert.equal(state.pagination.total, 2); assert.equal(state.week.entries.length, 1)
  resource.reset(); assert.equal(state.pagination, null)
})
test('whole-scope attendance instances are not incorrectly capped at 150k users', opts, async () => {
  const data = await fixture('/api/timetable/unified/page')
  data.week.summary.attendance.unknown = 400000
  assert.equal(validatedUnifiedPage(data).week.summary.attendance.unknown, 400000)
})
test('calendar first-load controls are outside the week success branch and real import opener compiles', opts, () => {
  for (const path of ['components/UnifiedWeekCalendar.vue', 'components/CourseSchedulePanel.vue', 'views/TimetableView.vue']) {
    const source = readFileSync(new URL('../src/' + path, import.meta.url), 'utf8'), { descriptor } = parse(source)
    compileScript(descriptor, { id: 'pagination' }); assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: path, id: 'pagination' }).errors, [])
    if (path.includes('UnifiedWeek')) {
      assert.ok(source.indexOf('<template v-if="scopeState.data">') < source.indexOf('<template v-if="state.week">'))
      assert.match(source, /readUnifiedScopesPage/); assert.match(source, /readUnifiedTimetablePage/); assert.match(source, /课程明细分页/)
      assert.match(source, /<form v-if="classFinderVisible"/)
      assert.doesNotMatch(source, /<form v-if="[^"]*\|\| classSearch"/)
      assert.match(source, /v-else-if="\['STUDENT','TEACHER'\].includes\(state.week.view\) && \(!state.pagination \|\| state.pagination.totalPages <= 1\)" class="calendar-no-next"/)
    }
    if (path.includes('TimetableView')) { assert.match(source, /@click="openImport"/); assert.equal((source.match(/<CourseSchedulePanel\b/g) || []).length, 1) }
  }
})
test('semantic foregrounds and primary action meet AA contrast against their actual solid surfaces', opts, () => {
  const css = readFileSync(new URL('../src/styles/apple-workspace.css', import.meta.url), 'utf8')
  const color = name => css.match(new RegExp(`--assistant-${name}: (#[a-f0-9]{6});`))[1]
  const luminance = hex => {
    const values = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
  }
  for (const [fg, bg] of [[color('accent'), '#ffffff'], ...['success', 'warning', 'danger'].map(name => [color(name), color(name + '-soft')])]) {
    const a = luminance(fg), b = luminance(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio}`)
  }
})
