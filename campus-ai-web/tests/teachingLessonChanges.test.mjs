import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import {
  createLessonChangeResource,
  lessonChangeQuery,
  lessonChangeInput,
} from '../src/utils/teachingLessonChanges.js'
import { chinaDate, addDays } from '../src/utils/timetable.js'
const opts = { timeout: 12000 },
  today = chinaDate(),
  root = '/api/admin/teaching/lesson-changes',
  query = { from: today, to: addDays(today, 6), page: 0, size: 25, search: '' }
function setup(overrides = {}, fixtureOptions = {}) {
  const f = createTeachingFlowFixture(fixtureOptions)
  f.setActor(1)
  const state = {},
    calls = []
  let owner = 'admin-1'
  const call = (url, method, data, signal, params) =>
      f.adapter({ url: root + url, method, data, signal, params }),
    api = {
      readAccess: (s) => call('/access', 'get', undefined, s),
      readPage: (q, s) => call('/page', 'get', undefined, s, q),
      readTarget: (id, s) => call('/target/' + id, 'get', undefined, s),
      preview: (p, s) => call('/preview', 'post', p, s),
      save: (p, s) => {
        calls.push(structuredClone(p))
        return call('', 'post', p, s)
      },
      readReceipt: (id, s) => call('/requests/' + id, 'get', undefined, s),
      ...overrides,
    },
    resource = createLessonChangeResource({ owner: () => owner, actorId: () => 1, state, ...api })
  return {
    f,
    state,
    resource,
    calls,
    api,
    call,
    cutover: () => {
      owner = 'student-2'
      resource.reset()
    },
  }
}
async function selected(s) {
  assert.equal(await s.resource.access(), true, s.state.error)
  assert.equal(await s.resource.list(query), true, s.state.error)
  assert.ok(s.state.page.items.length)
  assert.equal(await s.resource.select(s.state.page.items[0].lessonId), true, s.state.error)
}
const form = (s) => ({
  action: 'RESCHEDULE',
  date: today,
  startTime: '15:50',
  endTime: '17:25',
  teacherId: String(s.state.target.teacherId),
  room: 'F2-306（调课模拟）',
  reason: '模拟教学安排调整',
})
test(
  'real in-memory move saves exactly once, original lesson remains cancelled and students/teacher see the replacement',
  opts,
  async () => {
    const s = setup()
    await selected(s)
    const old = structuredClone(s.state.target),
      id = crypto.randomUUID()
    assert.equal(await s.resource.prepare(form(s), id), true, s.state.error)
    assert.equal(s.calls.length, 0)
    assert.equal(await s.resource.execute(), true, s.state.error)
    const receipt = s.state.receipt
    assert.equal(receipt.original.lessonId, old.lessonId)
    assert.equal(receipt.revision, old.revision + 1)
    assert.notEqual(receipt.replacementLessonId, old.lessonId)
    assert.equal(s.state.phase, 'saved')
    assert.deepEqual((await s.api.readReceipt(id)).data, receipt)
    s.f.setActor(4)
    const rows = (
      await s.f.adapter({
        url: '/api/teaching/lessons/page',
        method: 'get',
        params: { view: 'TEACHER', from: today, to: today, page: 0, size: 50, search: '' },
      })
    ).data.items
    assert.equal(rows.find((r) => r.id === old.lessonId).cancelled, true)
    assert.equal(rows.find((r) => r.id === receipt.replacementLessonId).room, 'F2-306（调课模拟）')
    s.f.setActor(2)
    const day = await s.f.adapter({
      url: '/api/timetable/unified/page',
      method: 'get',
      params: { view: 'STUDENT', monday: s.state.target.firstMonday, page: 0, size: 50 },
    })
    assert.ok(
      day?.data.week.entries.some(
        (e) => e.lessonId === receipt.replacementLessonId && !e.cancelled,
      ),
    )
    assert.ok(day.data.week.entries.some((e) => e.lessonId === old.lessonId && e.cancelled))
    s.resource.dispose()
  },
)
test(
  'cancel sends no replacement fields, preserves rows, and normal student cannot enter the admin API',
  opts,
  async () => {
    const s = setup()
    await selected(s)
    const original = s.state.target
    assert.equal(
      await s.resource.prepare({ ...form(s), action: 'CANCEL' }, crypto.randomUUID()),
      true,
      s.state.error,
    )
    assert.equal(s.state.preview.proposed, null)
    assert.equal(await s.resource.execute(), true, s.state.error)
    assert.equal(s.calls[0].teacherId, null)
    assert.equal(s.state.receipt.replacementLessonId, null)
    assert.equal((await s.api.readTarget(original.lessonId)).data.members, original.members)
    s.f.setActor(2)
    await assert.rejects(
      () => s.call('/access', 'get'),
      (e) => e.response.status === 403,
    )
    s.resource.dispose()
  },
)
test(
  'bad source responses wrong scope and invalid dates cannot turn into a confirmed request',
  opts,
  async () => {
    for (const q of [
      { ...query, to: '2026-02-30' },
      { ...query, to: addDays(today, 31) },
      { ...query, search: '\u0085' },
    ])
      assert.throws(() => lessonChangeQuery(q))
    const s = setup({ readTarget: async () => ({ data: { lessonId: crypto.randomUUID() } }) })
    await s.resource.access()
    assert.equal(await s.resource.select(crypto.randomUUID()), false)
    assert.equal(s.state.target, undefined)
    assert.equal(s.calls.length, 0)
    s.resource.dispose()
    const t = setup()
    await selected(t)
    assert.throws(() =>
      lessonChangeInput(
        t.state.target,
        { ...form(t), teacherId: 'not-an-account' },
        crypto.randomUUID(),
      ),
    )
    assert.equal(await t.resource.prepare({ ...form(t), reason: '' }, crypto.randomUUID()), false)
    assert.equal(t.calls.length, 0)
    t.resource.dispose()
  },
)
test(
  'lost ACK is reconciled from the original request without another write; unknown retry keeps the exact body and id',
  opts,
  async () => {
    const s = setup()
    await selected(s)
    const original = s.api.save
    let writes = 0
    const r = createLessonChangeResource({
      owner: () => 'admin',
      actorId: () => 1,
      state: s.state,
      ...s.api,
      save: async (p, signal) => {
        writes++
        await original(p, signal)
        throw new Error('模拟回执丢失')
      },
    })
    assert.equal(await r.prepare(form(s), crypto.randomUUID()), true)
    assert.equal(await r.execute(), false)
    assert.equal(s.state.phase, 'uncertain')
    assert.equal(await r.list(query), false)
    assert.equal(await r.reconcile(), true, s.state.error)
    assert.equal(writes, 1)
    r.dispose()
    s.resource.dispose()
    const t = setup()
    await selected(t)
    let fail = true
    const sent = [],
      r2 = createLessonChangeResource({
        owner: () => 'admin',
        actorId: () => 1,
        state: t.state,
        ...t.api,
        save: async (p, signal) => {
          sent.push(structuredClone(p))
          if (fail) throw new Error('模拟断网')
          return t.api.save(p, signal)
        },
      })
    await r2.prepare(form(t), crypto.randomUUID())
    await r2.execute()
    await r2.reconcile()
    assert.equal(t.state.canRetry, true)
    fail = false
    assert.equal(await r2.retry(), true, t.state.error)
    assert.deepEqual(sent[0], sent[1])
    r2.dispose()
    t.resource.dispose()
  },
)
test(
  'expiry edit and account cutover invalidate old previews and never deliver a late result',
  opts,
  async () => {
    const s = setup()
    await selected(s)
    await s.resource.prepare(form(s), crypto.randomUUID())
    s.resource.invalidate()
    assert.equal(await s.resource.execute(), false)
    assert.equal(s.calls.length, 0)
    s.resource.dispose()
    const t = setup()
    await selected(t)
    let now = 0
    const r = createLessonChangeResource({
      owner: () => 'admin',
      actorId: () => 1,
      state: t.state,
      ...t.api,
      now: () => now,
    })
    await r.prepare(form(t), crypto.randomUUID())
    now = 300001
    assert.equal(await r.execute(), false)
    assert.equal(t.state.phase, 'editing')
    assert.equal(t.state.preview, null)
    assert.equal(t.calls.length, 0)
    r.dispose()
    t.resource.dispose()
    let finish
    const late = setup({
      readTarget: () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    })
    await late.resource.access()
    const id = crypto.randomUUID(),
      p = late.resource.select(id)
    late.cutover()
    finish({ data: { lessonId: id } })
    await p
    assert.equal(late.state.target, null)
    assert.equal(late.state.error, '')
    late.resource.dispose()
  },
)
test(
  'full list paging search and clear are real, keep complete counts and never stop at the first page',
  opts,
  async () => {
    const s = setup({}, { largeScope: true })
    await s.resource.access()
    assert.equal(await s.resource.list(query), true, s.state.error)
    const total = s.state.page.total,
      seen = new Set()
    assert.ok(total > 100)
    for (let page = 0; page < Math.ceil(total / 25); page++) {
      assert.equal(await s.resource.list({ ...query, page }), true, s.state.error)
      assert.equal(s.state.page.total, total)
      for (const row of s.state.page.items) {
        assert.equal(seen.has(row.lessonId), false)
        seen.add(row.lessonId)
      }
    }
    assert.equal(seen.size, total)
    assert.equal(await s.resource.list({ ...query, search: '分页课程130' }), true)
    assert.equal(s.state.page.total, 1)
    assert.equal(await s.resource.list(query), true)
    assert.equal(s.state.page.total, total)
    s.resource.dispose()
  },
)
test(
  'actual panel compiles with explicit selected target reason confirmation and unknown-result recovery, without a model or durable private drafts',
  opts,
  () => {
    const source = readFileSync(
        new URL('../src/components/TeachingLessonChangesPanel.vue', import.meta.url),
        'utf8',
      ),
      { descriptor } = parse(source)
    compileScript(descriptor, { id: 'change' })
    assert.deepEqual(
      compileTemplate({
        source: descriptor.template.content,
        id: 'change',
        filename: 'TeachingLessonChangesPanel.vue',
      }).errors,
      [],
    )
    assert.match(source, /核对变更并预览/)
    assert.match(source, /确认调课或代课/)
    assert.match(source, /核对原请求回执/)
    assert.match(source, /min-height:\s*44px/)
    assert.match(source, /font-size:\s*16px/)
    assert.doesNotMatch(source, /localStorage|sessionStorage|sendMessageStream/)
  },
)
test(
  'rescheduling keeps whole-class semantics and never silently reclassifies unresolved historical sources',
  opts,
  async () => {
    const s = setup()
    await selected(s)
    assert.equal(s.state.target.enrollmentMode, 'ADMIN_CLASS')
    await s.resource.prepare(form(s), crypto.randomUUID())
    assert.equal(await s.resource.execute(), true, s.state.error)
    const id = s.state.receipt.replacementCourseId
    const mode = (
      await s.f.adapter({ url: `/api/admin/teaching/courses/${id}/enrollment-mode`, method: 'get' })
    ).data
    assert.equal(mode.mode, 'ADMIN_CLASS')
    s.resource.dispose()
    const t = setup({}, { legacyCourse: true })
    await selected(t)
    assert.equal(t.state.target.enrollmentMode, 'LEGACY')
    assert.equal(await t.resource.prepare(form(t), crypto.randomUUID()), false)
    assert.match(t.state.error, /先核定/)
    assert.equal(t.calls.length, 0)
    t.resource.dispose()
  },
)
test('approved substitute teacher is the same actual account in lesson roster and source metadata, and old teacher cannot mark it',opts,async()=>{
  const s=setup();s.f.setActor(10);const application=(await s.f.adapter({url:'/api/account/teaching-identities',method:'get'})).data.items[0];s.f.setActor(1);await s.f.adapter({url:`/api/admin/teaching-identities/${application.id}/review`,method:'post',data:{revision:application.revision,decision:'APPROVE',reason:'模拟代课审核'}});await selected(s);await s.resource.prepare({...form(s),teacherId:'10'},crypto.randomUUID());assert.equal(await s.resource.execute(),true,s.state.error);const receipt=s.state.receipt,name=s.f.actors().find(a=>a.id===10).nickname;
  assert.equal((await s.f.adapter({url:`/api/admin/teaching/courses/${receipt.replacementCourseId}/enrollment-mode`,method:'get'})).data.target.teacher,name);assert.equal((await s.f.adapter({url:`/api/admin/teaching/courses/${receipt.replacementCourseId}/roster`,method:'get'})).data.target.teacher,name);s.f.setActor(10);const rows=(await s.f.adapter({url:'/api/teaching/lessons/page',method:'get',params:{view:'TEACHER',from:today,to:today,page:0,size:50,search:''}})).data.items;assert.equal(rows.find(r=>r.id===receipt.replacementLessonId).teacher,name);s.f.setActor(4);await assert.rejects(()=>s.f.adapter({url:`/api/teaching/lessons/${receipt.replacementLessonId}/page`,method:'get',params:{view:'TEACHER',page:0,size:50,search:''}}),e=>[403,404].includes(e.response.status));s.resource.dispose()
})
