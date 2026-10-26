import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { createIdentityResource, validatedIdentityRead } from '../src/utils/teachingIdentity.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
const options = { timeout: 3000 }
const id = '20000000-0000-4000-8000-000000000001'
const item = (changes = {}) => ({ id, userId: 4, username: 'synthetic-4', nickname: '合成教师', requestedRole: 'TEACHER', status: 'PENDING', revision: 1, reason: '', requestedAt: '2026-10-15T03:00:00+08:00', reviewedAt: null, ...changes })
const mine = (items = [item()]) => ({ enabled: true, items })
const page = (items = [item()]) => ({ items, page: 0, size: 25, total: items.length, totalPages: items.length ? 1 : 0 })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function setup({ admin = false, read, apply, review } = {}) {
  let owner = 'user-4', uid = 4
  const state = { busy: false, loaded: false, enabled: false, items: [], error: '', notice: '' }
  const resource = createIdentityResource({ state, owner: () => owner, userId: () => uid, admin, read: read || (async () => ({ data: admin ? page() : mine() })), apply: apply || (async () => ({ data: item() })), review: review || (async () => ({ data: item({ status: 'APPROVED', revision: 2 }) })) })
  return { state, resource, switch: () => { owner = 'user-5'; uid = 5; resource.reset() } }
}
test('identity responses validate ownership, role, status, revisions, counts and unique targets', options, () => {
  assert.equal(validatedIdentityRead(mine(), false, 4).items.length, 1)
  for (const data of [mine([item({ userId: 5 })]), mine([item({ requestedRole: 'ADMIN' })]), mine([item({ status: '__proto__' })]), mine([item(), item()]), { enabled: false, items: [item()] }]) assert.throws(() => validatedIdentityRead(data, false, 4))
  assert.throws(() => validatedIdentityRead({ ...page(), totalPages: 12 }, true, 1))
  assert.throws(() => validatedIdentityRead(mine([item({ revision: 0 })]), false, 4))
})
test('late read and late approval receipts never repopulate a switched account', options, async () => {
  const delayed = deferred(), first = setup({ read: () => delayed.promise })
  const loading = first.resource.load(); first.switch(); delayed.resolve({ data: mine() }); assert.equal(await loading, false); assert.equal(first.state.items.length, 0)
  const saved = deferred(), second = setup({ admin: true, review: () => saved.promise }); await second.resource.load()
  const saving = second.resource.save({ item: item(), input: { revision: 1, decision: 'APPROVE', reason: '' } }); second.switch(); saved.resolve({ data: item({ status: 'APPROVED', revision: 2 }) })
  assert.equal(await saving, false); assert.equal(second.state.items.length, 0); assert.equal(second.state.notice, '')
})
test('pending confirmation blocks competing actions, canceled or expired scope makes no write', options, async () => {
  let writes = 0; const confirmation = deferred(), a = setup({ admin: true, review: async () => { writes++; return { data: item() } } }); await a.resource.load()
  const saving = a.resource.save({ item: item(), input: {}, confirm: () => confirmation.promise })
  assert.equal(await a.resource.save({ item: item(), input: {} }), false); a.switch(); confirmation.resolve(true); assert.equal(await saving, false); assert.equal(writes, 0)
  const b = setup({ admin: true, review: async () => { writes++ } }); await b.resource.load()
  assert.equal(await b.resource.save({ item: item(), input: {}, confirm: async () => false }), false); assert.equal(writes, 0); assert.equal(b.state.busy, false)
})
test('a committed approval with refresh failure is not reported as a failed write or sent again', options, async () => {
  let reads = 0, writes = 0
  const a = setup({ admin: true, read: async () => { if (++reads > 1) throw new Error('模拟列表离线'); return { data: page() } }, review: async () => { writes++; return { data: item({ status: 'APPROVED', revision: 2 }) } } })
  await a.resource.load(); assert.equal(await a.resource.save({ item: item(), input: { revision: 1 } }), false)
  assert.equal(a.state.items[0].revision, 2); assert.match(a.state.error, /已保存.*不要重复提交/); assert.match(a.state.notice, /审核已保存/)
  assert.equal(await a.resource.save({ item: item(), input: { revision: 1 } }), false); assert.equal(writes, 1)
})
test('disabled service stays unavailable and rejected errors preserve an actionable current state', options, async () => {
  let writes = 0; const a = setup({ read: async () => ({ data: { enabled: false, items: [] } }), apply: async () => { writes++ } }); await a.resource.load()
  assert.equal(await a.resource.save({ input: { role: 'TEACHER', revision: 0 } }), false); assert.equal(writes, 0)
  const b = setup({ admin: true, review: async () => { throw { response: { status: 409, data: { message: '版本已变化，请刷新' } } } } }); await b.resource.load()
  assert.equal(await b.resource.save({ item: item(), input: {} }), false); assert.match(b.state.error, /版本已变化/); assert.equal(b.state.items[0].revision, 1)
})
test('a malformed acknowledgement never claims verified success or replaces the intended applicant', options, async () => {
  const a = setup({ admin: true, review: async () => ({ data: item({ id: '20000000-0000-4000-8000-000000000002' }) }) }); await a.resource.load()
  assert.equal(await a.resource.save({ item: item(), input: { revision: 1 } }), false)
  assert.match(a.state.error, /回执未能核对/); assert.doesNotMatch(a.state.error, /操作已保存/); assert.equal(a.state.items[0].id, id); assert.equal(a.state.notice, '')
})
test('DEV identities require separate approval from teaching scopes and withdraw private views on revoke', options, async () => {
  const fixture = createTeachingFlowFixture(), request = (url, method = 'get', data, params) => fixture.adapter({ url, method, data, params })
  fixture.setActor(10); const pending = (await request('/api/account/teaching-identities')).data.items[0]
  assert.deepEqual((await request('/api/teaching/access')).data.views, [])
  await assert.rejects(() => request('/api/admin/teaching-identities'), e => e.response.status === 403)
  fixture.setActor(1); await request(`/api/admin/teaching-identities/${pending.id}/review`, 'post', { revision: 1, decision: 'APPROVE', reason: '' })
  fixture.setActor(10); assert.equal((await request('/api/account/teaching-identities')).data.items[0].status, 'APPROVED'); assert.deepEqual((await request('/api/teaching/access')).data.views, [])
  fixture.setActor(4); const teacher = (await request('/api/account/teaching-identities')).data.items[0]; assert.deepEqual((await request('/api/teaching/access')).data.views, ['TEACHER'])
  fixture.advanceTo('13:55'); assert.equal((await request('/api/teaching/notices')).data.length, 1)
  fixture.setActor(1); await request(`/api/admin/teaching-identities/${teacher.id}/review`, 'post', { revision: 2, decision: 'REVOKE', reason: '模拟离岗' })
  fixture.setActor(4); assert.deepEqual((await request('/api/teaching/access')).data.views, []); assert.equal((await request('/api/teaching/notices')).data.length, 0)
  assert.equal(fixture.identityAudit().length, 2)
})
test('registration and review surfaces compile without changing auth privileges or removing protected animations', options, () => {
  for (const file of ['components/TeachingIdentityPanel.vue', 'views/LoginView.vue', 'views/AccountView.vue', 'views/AdminView.vue']) {
    const source = fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), { descriptor, errors } = parse(source)
    assert.deepEqual(errors, []); compileScript(descriptor, { id: 'identity-test' }); assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: 'identity-test' }).errors, [])
  }
  const login = fs.readFileSync(new URL('../src/views/LoginView.vue', import.meta.url), 'utf8'); assert.match(login, /registerForm.teachingIdentity/); assert.match(login, /prefers-reduced-motion/); assert.match(login, /modalDuration/)
  assert.match(login, /\.auth-dialog.is-register \{ overflow:hidden; \}/); assert.match(login, /\.auth-dialog.is-register \.auth-body \{[^}]*overflow-y:auto/)
  const auth = fs.readFileSync(new URL('../src/stores/auth.js', import.meta.url), 'utf8'); assert.match(auth, /teachingIdentity = 'STUDENT'/); assert.doesNotMatch(auth, /role:\s*teachingIdentity/)
  const panel = fs.readFileSync(new URL('../src/components/TeachingIdentityPanel.vue', import.meta.url), 'utf8'); assert.match(panel, /useScopedConfirmation/); assert.match(panel, /useUnsavedChanges/); assert.match(panel, /prefers-reduced-motion/)
  assert.doesNotMatch(panel, /class="identity-actions"/)
})
