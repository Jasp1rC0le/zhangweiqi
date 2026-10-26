import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import {
  createUnifiedTimetable,
  createUnifiedNoticeReader,
  validatedUnifiedWeek,
} from '../src/utils/unifiedTimetable.js'
const opts = { timeout: 3000 }
const response = async () =>
  (
    await createTeachingFlowFixture().adapter({
      url: '/api/timetable/unified',
      method: 'get',
      params: {},
    })
  ).data
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
test('private schedule revision matches the existing million-version server contract',opts,async()=>{
  const value=await response()
  for(const revision of [0,150001,1000000]){value.summary.personalRevision=revision;assert.equal(validatedUnifiedWeek(value).summary.personalRevision,revision)}
  for(const revision of [-1,1000001,0.5,'1000000']){value.summary.personalRevision=revision;assert.throws(()=>validatedUnifiedWeek(value))}
})
test(
  'same-query refresh retains readable data but marks it stale until success',
  opts,
  async () => {
    const data = await response(),
      state = {},
      d = deferred()
    let reads = 0
    const r = createUnifiedTimetable({
      owner: () => '2:1:1',
      state,
      read: () => (++reads === 1 ? Promise.resolve({ data }) : d.promise),
    })
    await r.load(data.monday, 'STUDENT', '')
    const original = state.week,
      p = r.load(data.monday, 'STUDENT', '')
    assert.equal(state.week, original)
    assert.equal(state.stale, true)
    assert.equal(state.loading, true)
    d.resolve({ data })
    await p
    assert.equal(state.stale, false)
    assert.equal(state.loading, false)
  },
)
test('failed transient refresh keeps stale data; privilege rejection clears it', opts, async () => {
  const data = await response(),
    state = {}
  let status = 0
  const r = createUnifiedTimetable({
    owner: () => '2:1:1',
    state,
    read: async () => {
      if (status) throw { response: { status } }
      return { data }
    },
  })
  await r.load(data.monday, 'STUDENT')
  status = 503
  await r.load(data.monday, 'STUDENT')
  assert.ok(state.week)
  assert.equal(state.stale, true)
  status = 403
  await r.load(data.monday, 'STUDENT')
  assert.equal(state.week, null)
  assert.equal(state.stale, false)
})
test(
  'scope switch clears old rows and late old response cannot replace newer scope',
  opts,
  async () => {
    const data = await response(),
      state = {},
      old = deferred()
    let calls = 0
    const r = createUnifiedTimetable({
      owner: () => '4:1:1',
      state,
      read: () =>
        ++calls === 1
          ? Promise.resolve({ data })
          : calls === 2
            ? old.promise
            : Promise.reject({ response: { status: 403 } }),
    })
    await r.load(data.monday, 'STUDENT')
    const slow = r.load(data.monday, 'STUDENT')
    const changed = r.load(data.monday, 'SECRETARY')
    assert.equal(state.week, null)
    await changed
    old.resolve({ data })
    await slow
    assert.equal(state.week, null)
    assert.match(state.error, /读取失败|重试/)
  },
)
test('account/epoch change and dispose abort discard pending response', opts, async () => {
  const data = await response(),
    state = {},
    d = deferred()
  let owner = '2:1:1',
    signal
  const r = createUnifiedTimetable({
    owner: () => owner,
    state,
    read: (a, b, c, s) => {
      signal = s
      return d.promise
    },
  })
  const p = r.load(data.monday, 'STUDENT')
  owner = '2:1:2'
  r.reset()
  assert.equal(signal.aborted, true)
  d.resolve({ data })
  await p
  assert.equal(state.week, null)
})
test('wrong queried week or role cannot be accepted', opts, async () => {
  const data = await response(),
    state = {}
  const r = createUnifiedTimetable({ owner: () => '2:1:1', state, read: async () => ({ data }) })
  await r.load('2026-01-05', 'STUDENT')
  assert.equal(state.week, null)
  assert.match(state.error, /范围/)
  await r.load(data.monday, 'TEACHER')
  assert.equal(state.week, null)
  assert.match(state.error, /范围/)
})
test(
  'malformed dates clocks notices counts and focus targets reject before rendering',
  opts,
  async () => {
    const original = await response()
    for (const mutate of [
      (v) => (v.entries[0].date = '2026-02-30'),
      (v) => (v.entries[0].startTime = '25:00'),
      (v) => (v.entries[0].counts = { unknown: -1 }),
      (v) => (v.notices[0].lessonId = 'not-an-id'),
      (v) => (v.bells[0].period = 2),
      (v) => (v.next = { id: '10000000-0000-4000-8000-000000999999' }),
    ]) {
      const value = structuredClone(original)
      mutate(value)
      assert.throws(() => validatedUnifiedWeek(value))
    }
    original.next = { ...original.next, name: 'not authoritative' }
    const parsed = validatedUnifiedWeek(original)
    assert.notEqual(parsed.next.name, 'not authoritative')
  },
)
test(
  'UI delegates joining to backend and guards stale operations; importer remains a secondary task',
  opts,
  () => {
    const calendar = readFileSync(
      new URL('../src/components/UnifiedWeekCalendar.vue', import.meta.url),
      'utf8',
    )
    assert.match(calendar, /state\.week\.gridSafe/)
    assert.match(calendar, /:disabled="unavailable"/)
    assert.match(calendar, /state\.week\.focusLabel/)
  assert.match(calendar, /state\.week\.summary\.attendance\.unknown/)
  assert.match(calendar, /已记录旷课/)
  assert.match(calendar, /已记录迟到/)
    const chat = readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')
    assert.match(chat, /import \{ queryOwnTimetable, askOwnTimetable \} from '@\/api\/unifiedTimetable'/)
    const page = readFileSync(new URL('../src/views/TimetableView.vue', import.meta.url), 'utf8')
    assert.match(page, /<CourseSchedulePanel[^>]*:manage-only="unifiedAvailable"/)
    assert.equal((page.match(/<CourseSchedulePanel\b/g) || []).length, 1, 'scope bootstrap must not remount and discard an import draft')
  },
)
test(
  'light notice polling cannot apply a late reply to another account or scope',
  opts,
  async () => {
    const data = await response(),
      d = deferred()
    let owner = '2:1:1',
      week = data,
      applied = 0,
      error = 0,
      signal
    const r = createUnifiedNoticeReader({
      owner: () => owner,
      week: () => week,
      read: (s) => {
        signal = s
        return d.promise
      },
      apply: () => applied++,
      onError: () => error++,
    })
    const p = r.load()
    owner = '4:1:1'
    week = { ...data, view: 'TEACHER' }
    r.reset()
    assert.equal(signal.aborted, true)
    d.resolve({ data: data.notices })
    await p
    assert.equal(applied, 0)
    assert.equal(error, 0)
  },
)
test(
  'light notice polling validates payload, skips leadership and retains honest failures',
  opts,
  async () => {
    const data = await response()
    let week = data,
      calls = 0,
      applied = 0,
      error = 0,
      payload = data.notices
    const r = createUnifiedNoticeReader({
      owner: () => '2:1:1',
      week: () => week,
      read: async () => {
        calls++
        return { data: payload }
      },
      apply: () => applied++,
      onError: () => error++,
    })
    await r.load()
    assert.equal(applied, 1)
    payload = [...payload, ...payload]
    await r.load()
    assert.equal(error, 1)
    assert.equal(applied, 1)
    week = { ...data, view: 'SECRETARY' }
    await r.load()
    assert.equal(calls, 2)
  },
)
