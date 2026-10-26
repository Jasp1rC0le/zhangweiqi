import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGovernanceClassSelection } from '../src/utils/governanceClassSelection.js'
import { teachingWorkflowRoute } from '../src/utils/teachingWorkflows.js'
const opts = { timeout: 5000 }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = n => ({ value: id(n), label: `合成班${n}`, description: '合成学院' })
const result = selected => ({ data: { items: [row(1)], selected, page: 0, size: 25, total: 1, totalPages: 1 } })
const preset = { tool: 'evidence', view: 'SECRETARY', from: '2026-10-19', to: '2026-10-25', classId: id(2) }

test('class evidence handoff retains exact explicit leadership view dates and UUID only', opts, () => {
  assert.deepEqual(teachingWorkflowRoute({ ...preset, className: '伪造班名', userId: '99' }), { ...preset, kind: 'ATTENDANCE', expiredOnly: false })
  assert.equal(teachingWorkflowRoute({ ...preset, view: 'COUNSELOR' }).view, 'COUNSELOR')
  assert.deepEqual(teachingWorkflowRoute({ tool: 'evidence' }), { tool: 'evidence', kind: 'ATTENDANCE', expiredOnly: false })
})
test('invalid or incomplete class handoffs fail closed rather than omitting the class', opts, () => {
  for (const patch of [{ classId: '' }, { classId: [id(2)] }, { classId: 'foreign' }, { view: undefined }, { view: 'ADMIN' }, { view: 'STUDENT' }, { view: ['SECRETARY'] }, { from: undefined }, { to: undefined }, { from: '2026-02-30' }]) {
    const value = teachingWorkflowRoute({ ...preset, ...patch })
    assert.ok(value.error, JSON.stringify(patch)); assert.equal(value.classId, undefined)
  }
})
test('selected metadata outside the bounded first page is independently confirmed', opts, async () => {
  const state = {}; let query
  const resource = createGovernanceClassSelection({ scope: () => 'owner', state, read: async q => { query = q; return result(row(2)) } })
  assert.deepEqual(await resource.resolve('SECRETARY', id(2)), row(2))
  assert.deepEqual(query, { kind: 'CLASS', view: 'SECRETARY', page: 0, size: 25, search: '', selected: id(2) })
  assert.equal(state.items.some(option => option.value === id(2)), false)
  resource.dispose()
})
test('missing selected confirmation never falls back to the first item or a matching visible option', opts, async () => {
  const state = {}, resource = createGovernanceClassSelection({ scope: () => 'owner', state, read: async () => result(null) })
  assert.equal(await resource.resolve('SECRETARY', id(1)), null)
  assert.equal(state.selected, null); assert.match(state.error, /明确确认/); resource.dispose()
})
test('mismatched server-selected identity is rejected before any record lookup', opts, async () => {
  const state = {}, resource = createGovernanceClassSelection({ scope: () => 'owner', state, read: async () => result(row(1)) })
  assert.equal(await resource.resolve('SECRETARY', id(2)), null)
  assert.match(state.error, /响应不完整/); assert.equal(state.selected, null); resource.dispose()
})
test('invalid class or perspective never reaches HTTP', opts, async () => {
  let calls = 0
  const state = {}, resource = createGovernanceClassSelection({ scope: () => 'owner', state, read: async () => { calls++; return result(row(2)) } })
  assert.equal(await resource.resolve('SECRETARY', 'foreign'), null)
  assert.equal(await resource.resolve('SQL', id(2)), null); assert.equal(calls, 0); resource.dispose()
})
test('permission not found and transient failures retain an explicit retryable failure without all-scope reads', opts, async () => {
  for (const status of [403, 404, 503]) {
    const state = {}, queries = [], resource = createGovernanceClassSelection({ scope: () => 'owner', state, read: async query => { queries.push(query); throw { response: { status, data: { message: `合成失败${status}` } } } } })
    assert.equal(await resource.resolve('SECRETARY', id(2)), null)
    assert.equal(state.selected, null); assert.equal(state.loading, false); assert.match(state.error, new RegExp(String(status)))
    assert.deepEqual(queries.map(q => q.selected), [id(2)]); resource.dispose()
  }
})
test('retry rechecks the same requested class and can recover after failure', opts, async () => {
  let failed = true
  const state = {}, resource = createGovernanceClassSelection({ scope: () => 'owner', state, read: async () => { if (failed) throw new Error('503'); return result(row(2)) } })
  assert.equal(await resource.resolve('SECRETARY', id(2)), null); failed = false
  assert.deepEqual(await resource.resolve('SECRETARY', id(2)), row(2)); assert.equal(state.error, ''); resource.dispose()
})
test('a changed selection aborts the prior lookup and late response cannot revive it', opts, async () => {
  let finish, signal
  const state = {}, resource = createGovernanceClassSelection({ scope: () => 'owner', state, read: (q, s) => q.selected === id(2) ? (signal = s, new Promise(done => { finish = done })) : Promise.resolve(result(row(3))) })
  const pending = resource.resolve('SECRETARY', id(2))
  assert.deepEqual(await resource.resolve('SECRETARY', id(3)), row(3)); assert.equal(signal.aborted, true)
  finish(result(row(2))); assert.equal(await pending, null); assert.equal(state.selected.value, id(3)); resource.dispose()
})
test('owner reset pause close and disposal abort actual pending lookups without private revival', opts, async () => {
  for (const action of ['owner', 'reset', 'dispose']) {
    let owner = 'a', finish, signal
    const state = {}, resource = createGovernanceClassSelection({ scope: () => owner, state, read: (q, s) => { signal = s; return new Promise(done => { finish = done }) } })
    const pending = resource.resolve('SECRETARY', id(2))
    if (action === 'owner') owner = 'b'
    if (action === 'dispose') resource.dispose(); else resource.reset()
    assert.equal(signal.aborted, true); finish(result(row(2))); assert.equal(await pending, null)
    assert.equal(state.selected, null); assert.equal(state.loading, false); assert.deepEqual(state.items, [])
    resource.dispose()
  }
})
test('calendar target keys include class and view while same-owner pauses preserve the intended filter', opts, () => {
  const calendar = readFileSync(new URL('../src/components/UnifiedWeekCalendar.vue', import.meta.url), 'utf8')
  const teaching = readFileSync(new URL('../src/views/TeachingView.vue', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('../src/components/TeachingGovernancePanel.vue', import.meta.url), 'utf8')
  assert.match(calendar, /tool:\s*'evidence'[^\n]*classId:\s*classId\s*\|\|\s*undefined/)
  assert.match(teaching, /workflow.value\?\.view,workflow.value\?\.classId/)
  const start = panel.indexOf('watch(()=>props.active')
  const pause = panel.slice(start, panel.indexOf('onBeforeUnmount(()=>', start))
  assert.match(pause, /classResource.reset/); assert.doesNotMatch(pause, /classId.value=/)
  assert.match(panel, /classResource.resolve\(snapshot.view,snapshot.classId\)/)
  assert.match(panel, /blockingMessage/); assert.match(panel, /未改查全部班级/)
})
