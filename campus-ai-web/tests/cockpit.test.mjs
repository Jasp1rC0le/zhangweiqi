import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { attendanceDistribution, cockpitCount, cockpitComparison } from '../src/utils/cockpit.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
const counts = { onTime: 20, absent: 3, earlyLeave: 2, unknown: 10, late: 1, excused: 4 }
test('cockpit keeps attendance instances, pending and historical states distinct', () => {
  const result = attendanceDistribution(counts)
  assert.equal(result.total, 40); assert.equal(result.recorded, 30)
  assert.equal(result.rows.find(row => row.key === 'absent').count, 3)
  assert.equal(result.rows.find(row => row.key === 'unknown').count, 10)
  assert.equal(result.rows.reduce((sum, row) => sum + row.share, 0), 100)
  assert.equal(Object.hasOwn(result, 'rate'), false)
  assert.deepEqual(counts, { onTime: 20, absent: 3, earlyLeave: 2, unknown: 10, late: 1, excused: 4 })
})
test('missing invalid and overflowed counts cannot turn into an all-clear or a zero', () => {
  for (const value of [undefined, null, -1, '0', NaN, Infinity]) assert.equal(cockpitCount(value), '未返回')
  assert.equal(cockpitCount(0), '0'); assert.equal(cockpitCount(12345), '12,345')
  for (const change of [{ absent: undefined }, { unknown: -1 }, { late: '1' }, { onTime: Number.MAX_SAFE_INTEGER }]) assert.equal(attendanceDistribution({ ...counts, ...change }), null)
})
test('empty distribution has finite zero widths without inventing a rate', () => {
  const result = attendanceDistribution(Object.fromEntries(Object.keys(counts).map(key => [key, 0])))
  assert.equal(result.total, 0); assert.equal(result.recorded, 0)
  assert.equal(result.rows.length, 4); assert.ok(result.rows.every(row => row.share === 0))
})
test('large authorized summary is invariant across pages, and class selection narrows it', async () => {
  const fixture = createTeachingFlowFixture({ largeScope: true }); fixture.setActor(6)
  const api = async params => (await fixture.adapter({ url: '/api/timetable/unified/page', method: 'get', params: { size: 50, ...params } })).data
  const first = await api({}), second = await api({ page: 1 })
  assert.equal(first.week.entries.length, 50)
  assert.equal(attendanceDistribution(first.week.summary.attendance).total, 396)
  assert.deepEqual(attendanceDistribution(first.week.summary.attendance), attendanceDistribution(second.week.summary.attendance))
  const selected = await api({ classId: first.week.entries[0].classId || '10000000-0000-4000-8000-000000000010' })
  assert.equal(selected.week.summary.attendance.unknown, 3)
  fixture.setActor(2)
  await assert.rejects(() => api({ view: 'SECRETARY' }), error => error.response.status === 403)
})
test('presentational cockpit components compile and never fetch, write, infer names or call models', () => {
  for (const path of ['AttendanceCockpit.vue', 'OperationsCockpit.vue']) {
    const source = readFileSync(new URL('../src/components/' + path, import.meta.url), 'utf8')
    const { descriptor } = parse(source); compileScript(descriptor, { id: 'cockpit' })
    assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: path, id: 'cockpit' }).errors, [])
    assert.doesNotMatch(descriptor.scriptSetup.content, /fetch\(|axios|@\/api|setInterval|requestAnimationFrame/)
  }
})
test('both authorized leadership entrances use whole-scope fields and source snapshot dates', () => {
  const calendar = readFileSync(new URL('../src/components/UnifiedWeekCalendar.vue', import.meta.url), 'utf8')
  const teaching = readFileSync(new URL('../src/views/TeachingView.vue', import.meta.url), 'utf8')
  assert.match(calendar, /\['COUNSELOR', 'SECRETARY'\].includes\(state.week\?\.view\)/)
  assert.match(calendar, /:counts="state.week.summary.attendance"/)
  assert.match(calendar, /:absent-students="state.week.summary.absentStudents"/)
  assert.match(calendar, /:from="state.week.monday" :to="state.week.sunday" :stale="state.stale"/)
  assert.match(teaching, /:from="state.lessonQuery.from" :to="state.lessonQuery.to"/)
  assert.match(teaching, /:absent-students="state.lessonPage\?\.summary.absentStudents"/)
  assert.match(teaching, /Object.hasOwn\(TEACHING_VIEWS, route.query.view\)/)
})
test('admin queue is rendered once and unknown usage is explicitly unknown', () => {
  const view = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  assert.equal((view.match(/<OperationsCockpit\b/g) || []).length, 1)
  assert.doesNotMatch(view, /class="overview-metric /)
  const component = readFileSync(new URL('../src/components/OperationsCockpit.vue', import.meta.url), 'utf8')
  assert.equal((component.match(/v-for="item in tasks"/g) || []).length, 1)
  assert.match(component, /cockpitCount\(overview.recentModelTokens\)/)
  assert.doesNotMatch(component, /索引任务运行正常|实时统计|环比|同比/)
  assert.match(component, /failedDetailsAvailable \? ' · 在下方核对' : ' · 明细暂不可用，请刷新核对'/)
  assert.match(view, /:failed-details-available="!sectionErrors.jobs && failedBackgroundJobs.length > 0"/)
  assert.doesNotMatch(view, /RETRY QUEUE|刷新数据 ↻/)
  assert.match(view, /\.failed-jobs \.overview-section-heading \{ flex-direction: column; align-items: flex-start; gap: 8px; \}/)
})

test('comparison ranks counts without mutating input or implying shares of a sum', () => {
  const items = [{ id: 'small', count: 3 }, { id: 'large', count: 12 }, { id: 'tie', count: 3 }, { id: 'zero', count: 0 }]
  const snapshot = structuredClone(items), result = cockpitComparison(items)
  assert.deepEqual(items, snapshot)
  assert.deepEqual(result.map(item => item.id), ['large', 'small', 'tie', 'zero'])
  assert.deepEqual(result.map(item => item.barPercent), [100, 25, 25, 0])
})
test('missing comparison counts remain prominent and distinct from explicit zero', () => {
  for (const missing of [undefined, null, -1, '0', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const result = cockpitComparison([{ count: 0 }, { count: missing }, { count: 4 }])
    assert.equal(result[0].barPercent, null)
    assert.equal(result[1].barPercent, 100)
    assert.equal(result[2].barPercent, 0)
  }
})
test('model comparison accepts a separate key, zero and safe large counts', () => {
  assert.deepEqual(cockpitComparison([]), [])
  assert.equal(cockpitComparison([{ requestCount: 0 }], 'requestCount')[0].barPercent, 0)
  const result = cockpitComparison([{ requestCount: Number.MAX_SAFE_INTEGER }, { requestCount: 1 }], 'requestCount')
  assert.equal(result[0].barPercent, 100)
  assert.ok(result[1].barPercent > 0 && Number.isFinite(result[1].barPercent))
})
