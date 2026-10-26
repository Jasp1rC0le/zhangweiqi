import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { privateCourseFile, createPrivateCourseExport, privateCourseReadState } from '../src/utils/privateCourseExport.js'
import { unifiedLayoutReadiness } from '../src/utils/unifiedTimetable.js'
import { parseCourseJson } from '../src/utils/courseImport.js'
import { createPrivateCourseSchedule } from '../src/utils/privateCourseSchedule.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'

const snapshot = revision => ({ revision, semester: '模拟学期', firstMonday: '2026-10-12', remindDays: 7,
  importedAt: '2026-10-16T00:00:00Z', checkedAt: '2026-10-17T00:00:00Z',
  courses: [{ name: '钟点课程（模拟）', weekday: 1, startTime: '08:30', endTime: '10:05', weeks: [1, 3, 5], room: 'F2-306' },
    { name: '节次课程（模拟）', weekday: 2, startPeriod: 9, endPeriod: 10, weeks: [2, 4], room: '未核钟点' }] })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const hash = async bytes => Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('')
function fixture(options = {}) {
  let principal = '100:1', time = 1000, active = true, value = snapshot(1)
  const reads = [], files = [], state = { busy: false, preview: null, error: '', notice: '' }
  const resource = createPrivateCourseExport({ owner: () => principal, active: () => active, state,
    read: options.read || (async signal => { reads.push(signal); return { data: { schedule: value } } }), digest: options.digest || hash,
    now: () => time, onFile: (blob, filename) => files.push({ blob, filename }) })
  return { state, resource, files, reads, owner: value => { principal = value }, time: value => { time = value }, active: value => { active = value }, value: next => { value = next } }
}
test('complete private JSON roundtrip preserves mixed times, periods, odd/even weeks and strips all unknown account fields', () => {
  const source = { ...snapshot(3), owner: 100, token: 'never-export', arbitrary: 'future-private-field' }
  const file = privateCourseFile(source), parsed = parseCourseJson(file.text)
  assert.deepEqual(parsed.courses, snapshot(3).courses)
  assert.equal(JSON.parse(file.text).remindDays, 7)
  assert.equal(file.count, 2)
  assert.doesNotMatch(file.text, /never-export|arbitrary|"owner"/)
  assert.throws(() => privateCourseFile(null), /没有已保存/)
  assert.throws(() => privateCourseFile({ ...source, revision: 0 }), /响应不完整/)
  const large = { ...source, courses: Array.from({ length: 120 }, (_, i) => ({ ...source.courses[0], name: '课'.repeat(97) + String(i).padStart(3, '0'), room: '室'.repeat(100), weeks: Array.from({ length: 30 }, (_, n) => n + 1) })) }
  const complete = privateCourseFile(large)
  assert.equal(complete.count, 120)
  assert.equal(parseCourseJson(complete.text).courses.length, 120)
  assert.ok(complete.bytes.byteLength <= 100000)
})
test('preparation rereads, explicit download rereads again and never mutates the source', { timeout: 2000 }, async () => {
  const f = fixture(); assert.equal(await f.resource.prepare(), true); assert.equal(f.reads.length, 1); assert.equal(f.files.length, 0)
  assert.equal(f.state.preview.count, 2); assert.equal(await f.resource.download(), true); assert.equal(f.reads.length, 2)
  assert.equal(f.files[0].filename, '我的课表.json'); assert.equal(parseCourseJson(await f.files[0].blob.text()).courses.length, 2)
  assert.match(f.state.notice, /交给浏览器下载/); assert.equal(f.state.preview, null)
})
test('changed source, expired preview and cancellation never hand out the old file', { timeout: 2000 }, async () => {
  const f = fixture(); await f.resource.prepare(); f.value(snapshot(2)); assert.equal(await f.resource.download(), false); assert.match(f.state.error, /发生变化/)
  await f.resource.prepare(); f.time(301001); assert.equal(await f.resource.download(), false); assert.match(f.state.error, /失效/)
  f.time(1000); await f.resource.prepare(); f.resource.reset(); assert.equal(await f.resource.download(), false); assert.equal(f.files.length, 0)
})
test('cutover cancels both late authenticated reads and late SHA completion', { timeout: 2000 }, async () => {
  const pending = deferred(), f = fixture({ read: () => pending.promise }); const task = f.resource.prepare()
  f.owner('200:1'); f.resource.reset(); pending.resolve({ data: { schedule: snapshot(1) } }); await task
  assert.equal(f.state.preview, null); assert.equal(f.files.length, 0)
  const hashing = deferred(), g = fixture({ digest: () => hashing.promise }), second = g.resource.prepare()
  await Promise.resolve(); g.owner('200:1'); g.resource.reset(); hashing.resolve('a'.repeat(64)); await second
  assert.equal(g.state.preview, null); assert.equal(g.files.length, 0)
})
test('owner cutover while verifying download cannot deliver even successfully read bytes', { timeout: 2000 }, async () => {
  const pending = deferred(); let calls = 0
  const f = fixture({ digest: bytes => ++calls === 1 ? hash(bytes) : pending.promise })
  await f.resource.prepare(); const task = f.resource.download(); await Promise.resolve(); f.owner('200:1'); f.resource.reset(); pending.resolve('a'.repeat(64)); await task
  assert.equal(f.files.length, 0); assert.equal(f.state.preview, null)
})
test('busy, dirty import, no owner and auth failure do not create or silently retry a file', { timeout: 2000 }, async () => {
  const pending = deferred(); let calls = 0
  const f = fixture({ read: () => { calls++; return pending.promise } }); f.active(false); assert.equal(await f.resource.prepare(), false); assert.equal(calls, 0)
  f.active(true); const task = f.resource.prepare(); assert.equal(await f.resource.prepare(), false); assert.equal(calls, 1)
  pending.reject({ response: { status: 403 } }); await task; assert.match(f.state.error, /权限已失效/); assert.equal(f.files.length, 0)
  f.owner(''); assert.equal(await f.resource.prepare(), false); assert.equal(calls, 1)
})
test('checksum failure and expiry during read fail closed without truncated output', { timeout: 2000 }, async () => {
  const f = fixture({ digest: async () => 'bad' }); assert.equal(await f.resource.prepare(), false); assert.match(f.state.error, /校验未完成/)
  const pending = deferred(); let reads = 0
  const g = fixture({ read: async () => ++reads === 1 ? { data: { schedule: snapshot(1) } } : pending.promise }); await g.resource.prepare()
  const task = g.resource.download(); g.time(400000); pending.resolve({ data: { schedule: snapshot(1) } }); await task
  assert.equal(g.files.length, 0); assert.match(g.state.error, /到期/)
})
test('real panel uses the scoped resource rather than serializing a cached store, and chat routes to the literal export tool', async () => {
  const panel = await readFile(new URL('../src/components/CourseSchedulePanel.vue', import.meta.url), 'utf8')
  assert.match(panel, /createPrivateCourseExport/); assert.doesNotMatch(panel, /JSON\.stringify\(store\.schedule/)
  assert.match(panel, /privateExport\.reset\(\)/); assert.match(panel, /read:\s*readCourseSchedule/)
  const view = await readFile(new URL('../src/views/TimetableView.vue', import.meta.url), 'utf8'); assert.match(view, /personal-export/)
})
test('F1 waits for actual range and calendar termination, not early capability availability', () => {
  assert.equal(unifiedLayoutReadiness({ loading: false, week: null }, { loading: true }), 'waiting')
  assert.equal(unifiedLayoutReadiness({ loading: true, week: null }, { loading: false, data: { available: true } }), 'waiting')
  assert.equal(unifiedLayoutReadiness({ loading: false, week: null }, { loading: false, data: { available: true } }), 'waiting')
  assert.equal(unifiedLayoutReadiness({ loading: false, week: {} }, { loading: false }), 'ready')
  assert.equal(unifiedLayoutReadiness({ loading: false, week: null, error: '失败' }, { loading: false }), 'error')
  assert.equal(unifiedLayoutReadiness({ loading: false, unsupported: true }, { loading: false }), 'error')
})
test('F2 snapshot invalidation is separate from the user navigation intent, and old target listeners are released', async () => {
  const source = await readFile(new URL('../src/components/CourseSchedulePanel.vue', import.meta.url), 'utf8')
  assert.match(source, /let exportFocusIntent, navigationFocusIntent/)
  const reset = source.match(/function resetPrivateExport\(\) \{([^}]+)\}/)[1]
  assert.doesNotMatch(reset, /navigationFocusIntent|cancelExportNavigation/)
  assert.match(source, /watch\(\(\) => store\.schedule, resetPrivateExport/)
  assert.match(source, /if \(fromAction !== false\) cancelExportNavigation/)
  assert.match(source, /cancelWorkflowFocus\(target\)/)
  assert.match(source, /props\.exportRequested/)
})
test('F3 only a successfully loaded null is empty; network, permission and service errors remain errors even with cached data', () => {
  assert.equal(privateCourseReadState({ loaded: true, loading: false, error: '', schedule: null }), 'empty')
  assert.equal(privateCourseReadState({ loaded: true, loading: false, error: '', schedule: snapshot(1) }), 'saved')
  for (const status of [401, 403, 503, 'network']) {
    for (const cached of [null, snapshot(1)]) assert.equal(privateCourseReadState({ loaded: true, error: String(status), schedule: cached }), 'error')
  }
  assert.equal(privateCourseReadState({ loaded: false, loading: false, error: '', schedule: null }), 'error')
  assert.equal(privateCourseReadState({ loaded: false, loading: true, error: '', schedule: null }), 'waiting')
})
test('F3 real private read state rejects network/401/403/503 as errors, and an explicit retry recovers the saved snapshot', { timeout: 3000 }, async () => {
  for (const privateReadFailure of ['network', '401', '403', '503']) {
    const fixture = createTeachingFlowFixture({ privateReadFailure }), state = { schedule: null, loaded: false, loading: false, error: '' }
    const resource = createPrivateCourseSchedule({ owner: () => '2:1', state, read: () => fixture.adapter({ url: '/api/timetable/courses', method: 'get' }) })
    await resource.load(); assert.equal(privateCourseReadState(state), 'error'); assert.equal(state.schedule, null); assert.equal(state.loaded, false)
    await resource.load(true); assert.equal(privateCourseReadState(state), 'saved'); assert.equal(state.schedule.courses.length, 2)
  }
})
