import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { setImmediate } from 'node:timers'
import { createClassReminders, dueClassReminders } from '../src/utils/classReminders.js'
import { scheduleExportFilter, scheduleExportKey } from '../src/utils/scheduleExport.js'

const start = Date.parse('2026-11-01T07:51:00+08:00')
const course = (date = '2026-11-01') => ({ id: 'private-synthetic', date, name: '合成课程', room: '合成教室', teacher: '合成教师', startTime: '08:00', endTime: '09:00', startPeriod: 1, endPeriod: 2, timeLabel: '08:00—09:00', conflict: false, sources: ['PERSONAL'] })
function answer(query, current, rows = [course(query.from)]) {
  return { ...query, version: 1, asOf: new Date(current).toISOString(), count: rows.length, unknownTimes: rows.filter(row => !row.startTime).length,
    focus: null, answer: '合成本人已保存课程', queryScope: { version: 1, requested: 'AUTO', resolved: 'STUDENT' },
    display: { version: 1, state: rows.length ? 'READY' : 'EMPTY', summary: '已核对', entries: rows, notices: [], freeDates: [] } }
}
const digest = async bytes => createHash('sha256').update(bytes).digest('hex')
function setup(options = {}) {
  let current = start, principal = '1:1:STUDENT:session-a', visible = true, reads = 0
  const values = options.values || new Map(), state = {}, requests = []
  const storage = options.storage || { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  const controller = createClassReminders({ state, owner: () => principal, preferenceOwner: () => principal.split(':').slice(0, 2).join(':'),
    visible: () => visible, now: () => current, storage, digest: options.digest || digest, claim: options.claim,
    read: async (query, signal) => { reads++; requests.push({ query, signal }); return options.read ? options.read(query, signal, current) : { data: answer(query, current, options.rows?.(query.from)) } } })
  controller.syncOwner()
  return { controller, state, values, requests, reads: () => reads,
    time: value => { current = value }, owner: value => { principal = value }, visibility: value => { visible = value } }
}
test('reminders default to thirty minutes and reads use the actual private own-schedule query without a supplied user id', async () => {
  const s = setup(); assert.equal(s.state.enabled, true); assert.equal(s.state.minutes,30); assert.equal(s.reads(), 0)
  assert.equal(await s.controller.configure(true, 10), true); assert.equal(s.reads(), 1)
  assert.deepEqual(s.requests[0].query, { from: '2026-11-01', to: '2026-11-01', period: 'ALL', selection: 'ALL', detail: 'SUMMARY', perspective: 'AUTO' })
  assert.equal(s.state.banner.rows[0].name, '合成课程')
  assert.deepEqual(s.state.banner.destination, { path: '/timetable', query: { queryView: 'STUDENT', queryDate: '2026-11-01' } })
  const persisted = [...s.values.values()].join('')
  assert.doesNotMatch(persisted, /合成课程|合成教室|合成教师|private-synthetic|password|token/)
  s.controller.dispose()
})
test('the same class is not repeated on ticks, refresh, lead changes or a new controller in the same browser', async () => {
  const s = setup(); await s.controller.configure(true, 10)
  s.controller.dismiss(); assert.equal(await s.controller.tick(), false)
  await s.controller.refresh(); assert.equal(s.state.banner, null)
  await s.controller.configure(true, 15); assert.equal(s.state.banner, null)
  const next = setup({ values: s.values }); assert.equal(next.state.enabled, true)
  await next.controller.refresh(); assert.equal(next.state.banner, null)
  s.controller.dispose(); next.controller.dispose()
})
test('past, unknown and stale entries cannot produce reminders; server time rather than a guessed device offset owns the window', () => {
  const query = { from: '2026-11-01' }, data = answer(query, start)
  assert.equal(dueClassReminders(data, 5, start, start).length, 0)
  assert.equal(dueClassReminders(data, 10, start, start).length, 1)
  assert.equal(dueClassReminders(data, 10, start + 9 * 60000, start).length, 0)
  assert.equal(dueClassReminders(data, 10, start - 1, start).length, 0)
  const wrongDeviceTime = start + 3600000
  assert.equal(dueClassReminders(data, 10, wrongDeviceTime, wrongDeviceTime).length, 1)
  assert.equal(dueClassReminders(answer(query, start, [{ ...course(), startTime: null, endTime: null }]), 10, start, start).length, 0)
})
test('hidden pages suspend and abort pending reads; returning after class starts never floods missed alerts', async () => {
  let resolve
  const s = setup({ read: query => new Promise(done => { resolve = () => done({ data: answer(query, start) }) }) })
  const enabled = s.controller.configure(true, 10); s.visibility(false); s.controller.suspend()
  assert.equal(s.requests[0].signal.aborted, true); resolve(); await enabled
  assert.equal(s.state.banner, null); assert.equal(s.state.result, null)
  s.controller.dispose()
  const late = setup(); await late.controller.configure(true, 5)
  late.visibility(false); late.controller.suspend(); late.time(start + 20 * 60000); late.visibility(true)
  await late.controller.refresh(); assert.equal(late.state.banner, null); late.controller.dispose()
})
test('logout and disposal while event hashing is pending cannot deliver old-account content or write a new account preference', async () => {
  let finish
  const s = setup({ digest: bytes => new Promise(resolve => { finish = () => digest(bytes).then(resolve) }) })
  const pending = s.controller.configure(true, 10)
  while (!finish) await new Promise(resolve => setImmediate(resolve))
  s.owner('2:1:STUDENT:session-b'); s.controller.syncOwner(); finish(); await pending
  assert.equal(s.state.banner, null); assert.equal(s.state.result, null); assert.equal(s.state.enabled, true)
  assert.ok([...s.values.keys()].every(key => key.endsWith('1%3A1')))
  s.controller.dispose()
})
test('blocked storage keeps live reminders explicit and cannot silently imply persistence', async () => {
  const s = setup({ storage: { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } } })
  await s.controller.configure(true, 10); assert.equal(s.state.storageUnavailable, true); assert.ok(s.state.banner)
  s.controller.dispose()
})
test('schedule changes refresh current facts and cancelled/removed classes do not remain in the banner', async () => {
  let rows = [course()]
  const s = setup({ rows: () => rows }); await s.controller.configure(true, 10); assert.ok(s.state.banner)
  rows = []; await s.controller.refresh(); assert.equal(s.state.banner, null)
  rows = [{ ...course(), startTime: '08:05', endTime: '09:05' }]; await s.controller.configure(true, 15)
  assert.equal(s.state.banner.rows[0].startTime, '08:05'); s.controller.dispose()
})
test('persistent digests coordinate two tabs under a shared lock and off-state changes propagate', async () => {
  const values = new Map(); let lock = Promise.resolve()
  const claim = (_name, work) => { const current = lock.then(work); lock = current.catch(() => false); return current }
  const a = setup({ values, claim }), b = setup({ values, claim })
  await a.controller.configure(true, 5); b.controller.syncOwner()
  await Promise.all([a.controller.configure(true, 10), b.controller.configure(true, 10)])
  assert.equal(Number(Boolean(a.state.banner)) + Number(Boolean(b.state.banner)), 1)
  await a.controller.configure(false, 10)
  assert.equal(b.controller.storageChanged([...values.keys()][0]), true); assert.equal(b.state.enabled, false); assert.equal(b.state.banner, null)
  a.controller.dispose(); b.controller.dispose()
})
test('day rollover and stale snapshots require a fresh protected read, not a persistent old timer', async () => {
  const s = setup(); await s.controller.configure(true, 5)
  s.time(start + 24 * 3600000); assert.equal(s.controller.needsRefresh(), true)
  await s.controller.configure(true, 10); assert.equal(s.state.banner.rows[0].date, '2026-11-02')
  s.controller.dispose()
})
test('foreign/organizational responses fail closed, and disabling clears any active banner immediately', async () => {
  const s = setup({ read: (query, _signal, current) => ({ data: { ...answer(query, current), queryScope: { version: 1, requested: 'AUTO', resolved: 'SECRETARY' } } }) })
  assert.equal(await s.controller.configure(true, 10), false); assert.ok(s.state.error); assert.equal(s.state.banner, null)
  await s.controller.configure(false); assert.equal(s.state.error, ''); assert.equal(s.state.result, null); s.controller.dispose()
})
test('calendar reminder time is part of preview identity and unrelated formats preserve the existing payload', () => {
  const f = { source: 'MY', view: 'STUDENT', from: '2026-11-01', to: '2026-11-28', classId: '', period: 'ALL', format: 'ICS', search: '', includeCancelled: false }
  assert.notEqual(scheduleExportKey({ ...f, reminderMinutes: 10 }), scheduleExportKey({ ...f, reminderMinutes: 15 }))
  assert.equal(scheduleExportFilter({ ...f, reminderMinutes: 10 }).reminderMinutes, 10)
  assert.equal(scheduleExportFilter({ ...f, format: 'PDF', reminderMinutes: 10 }).reminderMinutes, undefined)
  for (const reminderMinutes of [-1, 1, 60, '10']) assert.throws(() => scheduleExportFilter({ ...f, reminderMinutes }))
})

test('new account defaults to thirty minutes and legacy default ten migrates without reenabling an explicit opt-out', async()=>{
 const fresh=setup();assert.equal(fresh.state.enabled,true);assert.equal(fresh.state.minutes,30);fresh.controller.dispose()
 const values=new Map([['campthink.class-reminders.v1.1%3A1',JSON.stringify({version:1,enabled:false,minutes:10,delivered:[]})]])
 const old=setup({values});assert.equal(old.state.minutes,30);assert.equal(old.state.enabled,false);old.controller.dispose()
})
test('a newly chosen ten-minute preference is preserved as a custom value',async()=>{
 const first=setup();await first.controller.configure(false,10);const next=setup({values:first.values});assert.equal(next.state.minutes,10);assert.equal(next.state.enabled,false);first.controller.dispose();next.controller.dispose()
})
test('the thirty-minute default admits a class twenty minutes away while a ten-minute choice does not',()=>{
 const now=Date.parse('2026-11-01T07:40:00+08:00'),data=answer({from:'2026-11-01'},now)
 assert.equal(dueClassReminders(data,30,now,now).length,1);assert.equal(dueClassReminders(data,10,now,now).length,0)
})
