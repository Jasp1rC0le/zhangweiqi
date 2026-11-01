import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../src/utils/timetable.js'
import { createLatestRequest } from '../src/utils/latestRequest.js'
import { checkedWebsiteStatistics, websiteGrowthBuckets, createWebsiteStatisticsReader } from '../src/utils/websiteStatistics.js'

function payload(days = 7) {
  const from = days === 7 ? '2026-10-26' : '2026-10-03'
  return { days, from, to: '2026-11-01', asOf: '2026-11-01T06:00:00Z', timeZone: 'Asia/Shanghai', coverage: 'SAVED_RECORDS',
    totalAccounts: 10, newAccounts: 4, participatingAccounts: 3,
    features: [{ code: 'QUESTION', participants: 2 }, { code: 'CANTEEN', participants: 2 }, { code: 'TIMETABLE', participants: 0 }, { code: 'WALL', participants: 1 }, { code: 'PROJECT', participants: 1 }],
    daily: Array.from({ length: days }, (_, i) => ({ date: addDays(from, i), newAccounts: i >= days - 2 ? 2 : 0 })), unhelpfulFeedback: 1, openContacts: 2 }
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
test('current-school saved-record counts keep their grain and discard unrelated payload fields', () => {
  const body = payload(); body.privatePayload = 'must not be rendered'
  const data = checkedWebsiteStatistics(body, 7)
  assert.equal(data.participatingAccounts, 3)
  assert.equal(data.features.reduce((sum, row) => sum + row.participants, 0), 6)
  assert.deepEqual(data.features.map(row => row.code), ['QUESTION', 'CANTEEN', 'WALL', 'PROJECT', 'TIMETABLE'])
  assert.equal(data.privatePayload, undefined)
  assert.equal(data.features.find(row => row.code === 'CANTEEN').path, '/canteens')
})
test('incomplete unknown negative or incomparable measurements fail instead of becoming zero', () => {
  for (const change of [
    body => { delete body.totalAccounts }, body => { body.features[0].participants = '2' },
    body => { body.features[0].participants = -1 }, body => { body.features[0].code = 'UNKNOWN' },
    body => { body.participatingAccounts = 1 }, body => { body.participatingAccounts = 9 },
    body => { body.newAccounts = 11 }, body => { body.daily[0].newAccounts = 2 },
    body => { body.daily[0].date = body.daily[1].date }, body => { body.asOf = '2026-11-01T16:00:00Z' },
    body => { body.coverage = 'PAGE_VIEWS' }, body => { body.from = '2026-02-30' },
  ]) {
    const body = payload(); change(body); assert.throws(() => checkedWebsiteStatistics(body, 7), /统计数据不完整/)
  }
  assert.throws(() => checkedWebsiteStatistics(payload(30), 7))
})
test('real observed zeros remain distinct from unavailable data', () => {
  const body = payload(); body.totalAccounts = 0; body.newAccounts = 0; body.participatingAccounts = 0
  for (const row of body.daily) row.newAccounts = 0
  for (const row of body.features) row.participants = 0
  const data = checkedWebsiteStatistics(body, 7)
  assert.equal(data.newAccounts, 0); assert.equal(data.participatingAccounts, 0)
  assert.throws(() => checkedWebsiteStatistics(null, 7))
})
test('seven daily and thirty-day grouped chart values preserve dates totals and the short final bucket', () => {
  const week = websiteGrowthBuckets(payload().daily, 7), month = websiteGrowthBuckets(payload(30).daily, 30)
  assert.equal(week.length, 7); assert.equal(month.length, 5)
  assert.deepEqual(month.at(-1), { from: '2026-10-31', to: '2026-11-01', newAccounts: 4 })
  assert.equal(month[0].from, '2026-10-03'); assert.equal(month[0].to, '2026-10-09')
  assert.equal(month.reduce((sum, row) => sum + row.newAccounts, 0), 4)
})
function readerFixture() {
  let principal = 'admin1:school1:session1', period = 7
  const state = {}, calls = []
  const reader = createWebsiteStatisticsReader({ owner: () => principal, days: () => period, state, requestFactory: createLatestRequest,
    read(days, options) { const next = deferred(); calls.push({ days, signal: options.signal, ...next }); return next.promise } })
  return { reader, state, calls, owner: value => { principal = value }, days: value => { period = value } }
}
test('late seven-day responses cannot overwrite a selected thirty-day window', async () => {
  const f = readerFixture(), first = f.reader.refresh()
  f.days(30); const second = f.reader.refresh()
  assert.equal(f.calls[0].signal.aborted, true); assert.equal(f.state.loading, true)
  f.calls[0].resolve(payload()); await first; assert.equal(f.state.data, null)
  f.calls[1].resolve(payload(30)); await second; assert.equal(f.state.data.days, 30); assert.equal(f.state.loading, false)
})
test('switching administrators clears old aggregates before any later response', async () => {
  const f = readerFixture(), first = f.reader.refresh(); f.calls[0].resolve(payload()); await first
  f.owner('admin2:school2:session2'); const second = f.reader.refresh(); assert.equal(f.state.data, null)
  const fresh = payload(); fresh.totalAccounts = 20; f.calls[1].resolve(fresh); await second; assert.equal(f.state.data.totalAccounts, 20)
  const third = f.reader.refresh(); f.owner(''); await f.reader.refresh(); f.calls[2].resolve(payload()); await third
  assert.equal(f.state.data, null); assert.equal(f.state.error, '')
})
test('server failures and invalid contracts show retry states without fabricated charts', async () => {
  const f = readerFixture(), first = f.reader.refresh()
  f.calls[0].reject({ response: { data: { message: '统计暂未能读取，请重试' } } }); await first
  assert.equal(f.state.data, null); assert.equal(f.state.error, '统计暂未能读取，请重试'); assert.equal(f.state.loading, false)
  const second = f.reader.refresh(); const bad = payload(); delete bad.features; f.calls[1].resolve(bad); await second
  assert.equal(f.state.data, null); assert.match(f.state.error, /统计数据不完整/)
})
test('unmounted or unauthenticated statistics never publish a pending response or start a new read', async () => {
  const f = readerFixture(), first = f.reader.refresh(); f.reader.dispose()
  assert.equal(f.calls[0].signal.aborted, true); f.calls[0].resolve(payload()); await first; await f.reader.refresh()
  assert.equal(f.calls.length, 1); assert.equal(f.state.data, null)
  const anonymous = readerFixture(); anonymous.owner(''); await anonymous.reader.refresh(); assert.equal(anonymous.calls.length, 0)
})
