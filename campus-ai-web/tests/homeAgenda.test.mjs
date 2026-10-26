import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { homeAgendaQuery, homeAgendaDestination, homeAgendaNeedsRefresh, createHomeAgenda } from '../src/utils/homeAgenda.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
const opts = { timeout: 5000 }, date = '2026-10-25'
const row = (id = 'qa-course') => ({ id, date, name: '合成课程', room: '合成A101', teacher: '合成教师', startTime: '14:00', endTime: '15:35', startPeriod: 5, endPeriod: 6, timeLabel: '14:00—15:35', conflict: false, sources: ['PERSONAL'] })
function answer(query, entries = [row()]) { return { ...query, version: 1, asOf: date + 'T00:10:00Z', count: entries.length, unknownTimes: entries.filter(e => !e.startTime).length, focus: query.selection === 'NEXT' && entries.length ? entries[0].date + 'T14:00:00' : null, answer: '合成本人已保存安排', queryScope: { version: 1, requested: 'AUTO', resolved: 'STUDENT' }, display: { version: 1, state: entries.length ? 'READY' : 'EMPTY', summary: entries.length ? '有已保存安排' : '没有匹配的已保存安排', entries, notices: [], freeDates: [] } } }
function make(read, owner = () => '1:1:session', today = () => date) { const state = {}, resource = createHomeAgenda({ owner, state, today, read }); return { state, resource } }
test('home agenda sends only closed personal deterministic today or 14-day next queries', opts, () => {
  assert.deepEqual(homeAgendaQuery('TODAY', date), { from: date, to: date, period: 'ALL', selection: 'ALL', detail: 'SUMMARY', perspective: 'AUTO' })
  assert.deepEqual(homeAgendaQuery('NEXT', date), { from: date, to: '2026-11-07', period: 'ALL', selection: 'NEXT', detail: 'SUMMARY', perspective: 'AUTO' })
  for (const [mode, day] of [['SQL', date], ['TODAY', '2026-02-30'], ['NEXT', 'foreign'], ['TODAY', '1999-12-31']]) assert.throws(() => homeAgendaQuery(mode, day))
})
test('home agenda accepts whole checked course facts including missing fields, overlap and true empty', opts, async () => {
  let empty = false
  const { state, resource } = make(async query => ({ data: answer(query, empty ? [] : [{ ...row(), teacher: '', room: '', conflict: true }]) }))
  assert.equal(await resource.load('TODAY'), true); assert.equal(state.result.count, 1); assert.equal(state.result.display.entries[0].teacher, ''); assert.equal(state.result.display.entries[0].conflict, true)
  empty = true; assert.equal(await resource.load('TODAY'), true); assert.equal(state.result.display.state, 'EMPTY'); assert.equal(state.error, ''); resource.dispose()
})
test('unknown-time unresolved state is not converted into no classes or guessed next lesson', opts, async () => {
  const { state, resource } = make(async query => { const data = answer(query, []); data.display.state = 'UNRESOLVED'; data.display.summary = '钟点待核对'; data.unknownTimes = 2; return { data } })
  assert.equal(await resource.load('NEXT'), true); assert.equal(state.result.display.state, 'UNRESOLVED'); assert.equal(state.result.unknownTimes, 2); resource.dispose()
})
test('a next answer must explicitly identify all concurrent alternatives at the same clock point', opts, async () => {
  const { state, resource } = make(async query => ({ data: answer(query, [row('one'), { ...row('two'), conflict: true }]) }))
  assert.equal(await resource.load('NEXT'), true); assert.equal(state.result.count, 2); resource.dispose()
  for (const change of [data => { data.focus = null }, data => { data.display.entries[1].startTime = '15:00' }]) {
    const invalid = make(async query => { const data = answer(query, [row('one'), row('two')]); change(data); return { data } })
    assert.equal(await invalid.resource.load('NEXT'), false); assert.equal(invalid.state.result, null); assert.match(invalid.state.error, /定位不完整/); invalid.resource.dispose()
  }
})
test('legacy unstructured or unscoped success cannot become home course cards', opts, async () => {
  for (const field of ['display', 'queryScope']) {
    const { state, resource } = make(async query => { const data = answer(query); delete data[field]; return { data } })
    assert.equal(await resource.load('TODAY'), false); assert.match(state.error, /来源未明确/); assert.equal(state.result, null); resource.dispose()
  }
})
test('wrong day, fake scope and malformed course response cannot render', opts, async () => {
  for (const change of [data => { data.from = '2026-10-24' }, data => { data.queryScope.resolved = 'SECRETARY' }, data => { data.display.entries[0].sources = ['ROSTER'] }]) {
    const { state, resource } = make(async query => { const data = answer(query); change(data); return { data } })
    assert.equal(await resource.load('TODAY'), false); assert.equal(state.result, null); assert.ok(state.error); resource.dispose()
  }
})
test('server/local day mismatch is explicit, never labelled as today', opts, async () => {
  const { state, resource } = make(async query => { const data = answer(query); data.asOf = '2026-10-24T00:00:00Z'; return { data } })
  assert.equal(await resource.load('TODAY'), false); assert.match(state.error, /服务器核对日不一致/); assert.equal(state.result, null); resource.dispose()
})
test('navigation uses verified personal perspective and actual future course day, never organization-wide role', opts, () => {
  const data = answer(homeAgendaQuery('NEXT', date), [{ ...row(), date: '2026-11-02' }])
  assert.deepEqual(homeAgendaDestination(data), { path: '/timetable', query: { queryView: 'STUDENT', queryDate: '2026-11-02' } })
  data.queryScope.resolved = 'TEACHER'; assert.equal(homeAgendaDestination(data).query.queryView, 'TEACHER')
  data.display.entries = []; assert.equal(homeAgendaDestination(data).query.queryDate, date)
})
test('date rollover and passed next-course time request a fresh read without inventing a countdown', opts, () => {
  const data = answer(homeAgendaQuery('NEXT', date))
  assert.equal(homeAgendaNeedsRefresh(data, 'NEXT', new Date(date + 'T05:59:00Z')), false)
  assert.equal(homeAgendaNeedsRefresh(data, 'NEXT', new Date(date + 'T06:01:00Z')), true)
  assert.equal(homeAgendaNeedsRefresh(data, 'TODAY', new Date(date + 'T06:01:00Z')), false)
  assert.equal(homeAgendaNeedsRefresh(data, 'TODAY', new Date(date + 'T16:01:00Z')), true)
  assert.equal(homeAgendaNeedsRefresh(null, 'NEXT', new Date()), false)
})
test('switching mode aborts actual pending work and old response cannot overwrite newer day selection', opts, async () => {
  let finish, signal
  const { state, resource } = make((query, s) => query.selection === 'ALL' ? (signal = s, new Promise(done => { finish = () => done({ data: answer(query) }) })) : Promise.resolve({ data: answer(query) }))
  const pending = resource.load('TODAY'); assert.equal(await resource.load('NEXT'), true); assert.equal(signal.aborted, true)
  finish(); assert.equal(await pending, false); assert.equal(state.result.selection, 'NEXT'); resource.dispose()
})
test('same-day account/session invalidation, hide, close and disposal reject late personal data', opts, async () => {
  for (const action of ['session', 'reset', 'dispose']) {
    let owner = '1:1:a', finish, signal
    const { state, resource } = make((query, s) => { signal = s; return new Promise(done => { finish = () => done({ data: answer(query) }) }) }, () => owner)
    const pending = resource.load('TODAY'); if (action === 'session') owner = '1:1:b'; if (action === 'dispose') resource.dispose(); else resource.reset()
    assert.equal(signal.aborted, true); finish(); assert.equal(await pending, false); assert.equal(state.result, null); assert.equal(state.loading, false); resource.dispose()
  }
})
test('date change while HTTP is pending cannot reuse previous-day facts', opts, async () => {
  let today = date, finish
  const { state, resource } = make(query => new Promise(done => { finish = () => done({ data: answer(query) }) }), () => 'owner', () => today)
  const pending = resource.load('TODAY'); today = '2026-10-26'; finish(); assert.equal(await pending, false); assert.equal(state.result, null); assert.equal(state.loading, false); resource.dispose()
})
test('refresh failures drop old cards and explicit retry restores the same requested mode', opts, async () => {
  let failed = false; const queries = []
  const { state, resource } = make(async query => { queries.push(query); if (failed) throw { response: { status: 503, data: { message: '合成日程暂时不可用' } } }; return { data: answer(query) } })
  assert.equal(await resource.load('NEXT'), true); failed = true; assert.equal(await resource.load('NEXT'), false); assert.equal(state.result, null); assert.match(state.error, /暂时不可用/)
  failed = false; assert.equal(await resource.load('NEXT'), true); assert.equal(state.error, ''); assert.ok(queries.every(q => q.selection === 'NEXT')); resource.dispose()
})
test('existing authenticated query fixture returns own student or teacher scope, not leader statistics', opts, async () => {
  const fixture = createTeachingFlowFixture()
  for (const actor of [2, 4, 6]) {
    fixture.setActor(actor); const today = fixture.clock().slice(0, 10)
    const { state, resource } = make((params, signal) => fixture.adapter({ url: '/api/timetable/unified/query', method: 'get', params, signal }), () => String(actor), () => today)
    assert.equal(await resource.load('TODAY'), true); assert.ok(['STUDENT','TEACHER'].includes(state.result.queryScope.resolved)); resource.dispose()
  }
})
test('home extension compiles with bounded preview, native pressed controls and lifecycle/draft-preserving joins', opts, () => {
  const path = '../src/components/HomeAgenda.vue', source = readFileSync(new URL(path, import.meta.url), 'utf8'), { descriptor, errors } = parse(source)
  assert.deepEqual(errors, []); compileScript(descriptor, { id: 'home-agenda' }); assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'HomeAgenda.vue', id: 'home-agenda' }).errors, [])
  assert.match(source, /entries.slice\(0, 2\)/); assert.match(source, /先显示/); assert.match(source, /aria-pressed/); assert.match(source, /document.visibilityState === 'visible'/); assert.match(source, /userSessionGeneration.value/)
  assert.match(source, /resource.dispose/); assert.match(source, /removeEventListener/); assert.match(source, /min-height:44px/); assert.match(source, /font-size:16px/)
  assert.doesNotMatch(source, /askOwnTimetable|sendMessage|v-html|localStorage|sessionStorage|setInterval/)
  const start = readFileSync(new URL('../src/components/ChatStart.vue', import.meta.url), 'utf8'); assert.match(start, /<HomeAgenda :disabled="disabled" :active="active" @activate="emit\('activate', \$event\)"/)
  assert.ok(start.indexOf('<HomeAgenda') < start.indexOf('<HomeCourseCue'))
})
