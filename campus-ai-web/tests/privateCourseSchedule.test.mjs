import test from 'node:test'
import assert from 'node:assert/strict'
import { createPrivateCourseSchedule } from '../src/utils/privateCourseSchedule.js'
const snapshot = (revision) => ({
  revision,
  semester: '示例',
  firstMonday: '2026-09-07',
  remindDays: 7,
  courses: [
    { name: '课程示例', weekday: 1, startTime: '08:00', endTime: '09:00', weeks: [1], room: '' },
  ],
  importedAt: '2026-10-11T00:00:00Z',
  checkedAt: '2026-10-11T00:00:00Z',
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
function fixture() {
  let principal = '1:1'
  const requests = [],
    state = { schedule: null, loaded: false, loading: false, error: '' }
  const resource = createPrivateCourseSchedule({
    owner: () => principal,
    state,
    read: (signal) => {
      const request = deferred()
      requests.push({ ...request, signal })
      return request.promise
    },
  })
  return {
    state,
    requests,
    resource,
    owner: (value) => {
      principal = value
    },
  }
}
test('late account responses cannot cross logout/switch', { timeout: 2000 }, async () => {
  const f = fixture(),
    task = f.resource.load()
  f.owner('2:1')
  f.resource.reset()
  f.requests[0].resolve({ data: { schedule: { semester: 'old' } } })
  await task
  assert.equal(f.state.schedule, null)
  assert.equal(f.state.loaded, false)
  assert.equal(f.requests[0].signal.aborted, true)
})
test(
  'refresh race keeps the newest schedule and deduplicates concurrent reads',
  { timeout: 2000 },
  async () => {
    const f = fixture(),
      old = f.resource.load(),
      pending = f.resource.load()
    assert.equal(f.requests.length, 1)
    const fresh = f.resource.load(true)
    f.requests[1].resolve({ data: { schedule: snapshot(2) } })
    await fresh
    f.requests[0].resolve({ data: { schedule: snapshot(1) } })
    await Promise.all([old, pending])
    assert.equal(f.state.schedule.revision, 2)
  },
)
test(
  'save adoption cancels earlier reads and ignores another account',
  { timeout: 2000 },
  async () => {
    const f = fixture(),
      old = f.resource.load()
    assert.equal(f.resource.adopt(snapshot(3), '2:1'), false)
    assert.equal(f.resource.adopt(snapshot(3), '1:1'), true)
    f.requests[0].resolve({ data: { schedule: snapshot(1) } })
    await old
    assert.equal(f.state.schedule.revision, 3)
    assert.equal(f.state.loading, false)
  },
)
test(
  'failed refresh retains the saved schedule and supports retry',
  { timeout: 2000 },
  async () => {
    const f = fixture()
    f.resource.adopt(snapshot(1), '1:1')
    const failed = f.resource.load(true)
    f.requests[0].reject(new Error('offline'))
    await failed
    assert.equal(f.state.schedule.revision, 1)
    assert.ok(f.state.error)
    const retry = f.resource.load(true)
    f.requests[1].resolve({ data: { schedule: snapshot(2) } })
    await retry
    assert.equal(f.state.error, '')
    assert.equal(f.state.schedule.revision, 2)
  },
)
test(
  'malformed responses do not masquerade as an empty or usable schedule',
  { timeout: 2000 },
  async () => {
    const f = fixture()
    f.resource.adopt(snapshot(1), '1:1')
    for (const payload of [
      undefined,
      {},
      { ...snapshot(2), courses: [] },
      { ...snapshot(2), courses: [{ ...snapshot(2).courses[0], weeks: [31] }] },
    ]) {
      const task = f.resource.load(true)
      f.requests.at(-1).resolve({ data: { schedule: payload } })
      await task
      assert.equal(f.state.schedule.revision, 1)
      assert.ok(f.state.error)
    }
  },
)
test(
  'logout and same-account re-login still invalidate the old request generation',
  { timeout: 2000 },
  async () => {
    const f = fixture(),
      old = f.resource.load()
    f.owner('')
    f.resource.reset()
    f.owner('1:1')
    const fresh = f.resource.load()
    f.requests[1].resolve({ data: { schedule: snapshot(2) } })
    await fresh
    f.requests[0].resolve({ data: { schedule: snapshot(1) } })
    await old
    assert.equal(f.state.schedule.revision, 2)
  },
)
