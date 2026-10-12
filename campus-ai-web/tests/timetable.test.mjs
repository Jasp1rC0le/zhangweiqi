import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import {
  chinaDate,
  dayNumber,
  mondayOf,
  firstMondayFrom,
  defaultSemester,
  timetableStatus,
  prepareTimetableImage,
} from '../src/utils/timetable.js'
import {
  createPrivateTimetable,
  validatedTimetableSnapshot,
} from '../src/utils/privateTimetable.js'
const options = { timeout: 2000 }
const snapshot = {
  revision: 1,
  semester: '测试学期',
  firstMonday: '2026-09-07',
  startWeek: 1,
  endWeek: 18,
  remindDays: 7,
  checkedAt: '2026-10-10T16:00:00Z',
  importedAt: '2026-10-10T15:00:00Z',
  imageSha256: 'a'.repeat(64),
}
const validImage = () =>
  new Blob(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1UAAAAASUVORK5CYII=',
        'base64',
      ),
    ],
    { type: 'image/png' },
  )
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
function fixture(overrides = {}) {
  let principal = '1:school'
  const state = { timetable: null, imageUrl: '', loaded: false, loading: false, error: '' },
    revoked = []
  const resource = createPrivateTimetable({
    owner: () => principal,
    state,
    read: async () => ({ data: { timetable: snapshot } }),
    readImage: async () => ({ data: validImage() }),
    createUrl: () => 'blob:image',
    revokeUrl: (url) => revoked.push(url),
    ...overrides,
  })
  return {
    state,
    resource,
    revoked,
    switchOwner(value) {
      principal = value
      resource.reset()
    },
  }
}
test('dates are school timezone not device timezone', options, () => {
  assert.equal(chinaDate(new Date('2026-10-10T16:01:00Z')), '2026-10-11')
  assert.equal(mondayOf('2026-10-11'), '2026-10-05')
  assert.equal(firstMondayFrom('2026-10-05', 5), '2026-09-07')
  assert.equal(firstMondayFrom('2026-10-05', 1), '2026-10-05')
})
test('rejects rolled invalid date, non-Monday and impossible week', options, () => {
  for (const date of ['2026-02-29', '2026-13-01', 'bad']) assert.throws(() => dayNumber(date))
  assert.throws(() => firstMondayFrom('2026-10-06', 5))
  for (const week of [0, 31, 1.2, NaN]) assert.throws(() => firstMondayFrom('2026-10-05', week))
})
test('semester is only a user-editable default', options, () => {
  assert.equal(defaultSemester('2026-10-11'), '2026—2027学年 第1学期')
  assert.equal(defaultSemester('2026-03-01'), '2025—2026学年 第2学期')
})
test('weekly boundaries do not pretend screenshot covers all semester', options, () => {
  const now = new Date('2026-10-11T10:00:00+08:00')
  assert.equal(timetableStatus(snapshot, now).week, 5)
  assert.equal(timetableStatus({ ...snapshot, startWeek: 4, endWeek: 4 }, now).kind, 'coverage')
  assert.equal(timetableStatus(snapshot, new Date('2026-10-12T00:00:00+08:00')).week, 6)
  assert.equal(timetableStatus(snapshot, new Date('2026-09-06T10:00:00+08:00')).kind, 'future')
})
test('reminder is checking age, not a claim of detected schedule changes', options, () => {
  const now = new Date('2026-10-18T10:00:00+08:00')
  const status = timetableStatus(snapshot, now)
  assert.equal(status.kind, 'check')
  assert.match(status.label, /没有实时教务同步/)
  assert.equal(timetableStatus({ ...snapshot, remindDays: 0 }, now).kind, 'current')
  assert.equal(timetableStatus(null, now).kind, 'empty')
})
test('invalid upload rejected without invoking browser decoder', options, async () => {
  for (const file of [
    null,
    { type: 'image/svg+xml', size: 20 },
    { type: 'image/png', size: 0 },
    { type: 'image/jpeg', size: 9 * 1024 * 1024 },
  ]) {
    await assert.rejects(prepareTimetableImage(file))
  }
})
test('private load uses single snapshot and revokes object URL on sign out', options, async () => {
  const f = fixture()
  await f.resource.load()
  assert.equal(f.state.timetable, snapshot)
  assert.equal(f.state.imageUrl, 'blob:image')
  f.switchOwner('')
  assert.equal(f.state.timetable, null)
  assert.equal(f.state.imageUrl, '')
  assert.deepEqual(f.revoked, ['blob:image'])
})
test('late old-account image can never reach new account', options, async () => {
  const oldImage = deferred()
  const f = fixture({ readImage: () => oldImage.promise })
  const old = f.resource.load()
  await Promise.resolve()
  f.switchOwner('2:school')
  oldImage.resolve({ data: validImage() })
  await old
  assert.equal(f.state.timetable, null)
  assert.equal(f.state.imageUrl, '')
  assert.equal(f.state.error, '')
})
test('old failed request cannot overwrite a newer refresh', options, async () => {
  const first = deferred()
  let reads = 0
  const f = fixture({
    read: () =>
      ++reads === 1 ? first.promise : Promise.resolve({ data: { timetable: snapshot } }),
  })
  const old = f.resource.load()
  await f.resource.load(true)
  first.reject(new Error('old error'))
  await old
  assert.equal(f.state.error, '')
  assert.equal(f.state.imageUrl, 'blob:image')
  assert.equal(f.state.loading, false)
})
test(
  'image mismatch preserves previous same-owner saved data and allows retry',
  options,
  async () => {
    let fail = false
    const f = fixture({
      readImage: async () => {
        if (fail) throw { response: { status: 404 } }
        return { data: validImage() }
      },
    })
    await f.resource.load()
    fail = true
    await f.resource.load(true)
    assert.equal(f.state.timetable, snapshot)
    assert.equal(f.state.imageUrl, 'blob:image')
    assert.match(f.state.error, /其他页面更换/)
    fail = false
    await f.resource.load(true)
    assert.equal(f.state.error, '')
  },
)
test(
  'mutation response is owner guarded and clears replaced image immediately',
  options,
  async () => {
    const f = fixture()
    await f.resource.load()
    assert.equal(
      f.resource.adopt({ ...snapshot, revision: 2, imageSha256: 'b'.repeat(64) }, '1:school'),
      true,
    )
    assert.equal(f.state.imageUrl, '')
    assert.equal(f.state.timetable.revision, 2)
    f.switchOwner('2:school')
    assert.equal(f.resource.adopt(snapshot, '1:school'), false)
    assert.equal(f.state.timetable, null)
  },
)
test('only explicit null is an empty timetable response', options, async () => {
  for (const response of [
    {},
    { data: {} },
    { data: { timetable: undefined } },
    { data: { timetable: false } },
    { data: { timetable: {} } },
  ]) {
    let reads = 0
    const f = fixture({
      read: async () => response,
      readImage: async () => {
        reads++
        return { data: validImage() }
      },
    })
    await f.resource.load()
    assert.equal(f.state.loaded, false)
    assert.match(f.state.error, /暂时无法读取/)
    assert.equal(reads, 0)
  }
  const empty = fixture({ read: async () => ({ data: { timetable: null } }) })
  await empty.resource.load()
  assert.equal(empty.state.loaded, true)
  assert.equal(empty.state.timetable, null)
  assert.equal(empty.state.error, '')
})
test('snapshot rejects invalid revisions, dates, coverage, labels and hashes', options, () => {
  assert.equal(validatedTimetableSnapshot(snapshot), snapshot)
  assert.equal(validatedTimetableSnapshot(null), null)
  const changes = [
    { revision: 0 },
    { revision: 1000001 },
    { revision: '1' },
    { semester: '' },
    { semester: 'x'.repeat(101) },
    { semester: '学期\n姓名' },
    { firstMonday: '2026-10-06' },
    { firstMonday: '2026-02-30' },
    { firstMonday: '1999-12-27' },
    { firstMonday: '2101-01-03' },
    { startWeek: 0 },
    { startWeek: 1.5 },
    { startWeek: 19 },
    { endWeek: 31 },
    { remindDays: 31 },
    { remindDays: -1 },
    { remindDays: '7' },
    { importedAt: undefined },
    { importedAt: 'bad' },
    { checkedAt: 'bad' },
    { imageSha256: 'bad' },
    { imageSha256: 'A'.repeat(64) },
  ]
  for (const change of changes)
    assert.throws(() => validatedTimetableSnapshot({ ...snapshot, ...change }))
})
test('malformed refresh and mutation retain the previous private image', options, async () => {
  let response = snapshot
  const f = fixture({ read: async () => ({ data: { timetable: response } }) })
  await f.resource.load()
  response = { ...snapshot, revision: 2, imageSha256: 'bad' }
  await f.resource.load(true)
  assert.equal(f.state.timetable, snapshot)
  assert.equal(f.state.imageUrl, 'blob:image')
  assert.equal(f.state.loaded, true)
  assert.match(f.state.error, /暂时无法读取/)
  assert.deepEqual(f.revoked, [])
  assert.throws(() => f.resource.adopt(response, '1:school'))
  assert.equal(f.state.timetable, snapshot)
  assert.equal(f.state.imageUrl, 'blob:image')
  assert.deepEqual(f.revoked, [])
})
test('unexpected or oversized image response does not replace saved data', options, async () => {
  let image = validImage()
  const f = fixture({ readImage: async () => ({ data: image }) })
  await f.resource.load()
  for (const bad of [
    undefined,
    'image',
    new Blob([]),
    new Blob(['html'], { type: 'text/html' }),
    new Blob(['not-a-jpeg'], { type: 'image/jpeg' }),
    new Blob(['x'.repeat(2 * 1024 * 1024 + 1)], { type: 'image/jpeg' }),
  ]) {
    image = bad
    await f.resource.load(true)
    assert.equal(f.state.timetable, snapshot)
    assert.equal(f.state.imageUrl, 'blob:image')
    assert.match(f.state.error, /暂时无法读取/)
  }
  assert.deepEqual(f.revoked, [])
})
test('stale metadata is discarded before requesting old account image', options, async () => {
  const metadata = deferred()
  let images = 0
  const f = fixture({
    read: () => metadata.promise,
    readImage: async () => {
      images++
      return { data: validImage() }
    },
  })
  const request = f.resource.load()
  f.switchOwner('2:school')
  metadata.resolve({ data: { timetable: snapshot } })
  await request
  assert.equal(images, 0)
  assert.equal(f.state.timetable, null)
})
test('object URL failure preserves the existing image', options, async () => {
  let broken = false
  const f = fixture({
    createUrl: () => {
      if (broken) throw new Error('object URL unavailable')
      return 'blob:image'
    },
  })
  await f.resource.load()
  broken = true
  await f.resource.load(true)
  assert.equal(f.state.timetable, snapshot)
  assert.equal(f.state.imageUrl, 'blob:image')
  assert.deepEqual(f.revoked, [])
  assert.match(f.state.error, /暂时无法读取/)
})
test(
  'duplicate load shares network, confirmed deletion clears private state',
  options,
  async () => {
    const pending = deferred()
    let reads = 0
    const f = fixture({
      read: () => {
        reads++
        return pending.promise
      },
    })
    const a = f.resource.load(),
      b = f.resource.load()
    assert.equal(reads, 1)
    pending.resolve({ data: { timetable: snapshot } })
    await Promise.all([a, b])
    f.resource.adopt(null, '1:school')
    assert.equal(f.state.imageUrl, '')
    assert.equal(f.state.timetable, null)
  },
)
