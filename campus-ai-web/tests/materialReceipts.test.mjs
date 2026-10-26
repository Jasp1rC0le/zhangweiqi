import test from 'node:test'
import assert from 'node:assert/strict'
import { createMaterialResource } from '../src/utils/materialIntake.js'
import { createMaterialReceiptStore } from '../src/utils/materialReceiptStore.js'
import { createMaterialIntakeFixture } from '../design/materialIntakeFixture.js'
const key = '12345678-1234-4234-8234-123456789abc'
const user = { id: 7, schoolId: 1, role: 'STUDENT' }
const form = { mode: 'knowledge', question: '合成资料', content: '合成正文', publicConsent: true }
function setup() {
  const map = new Map(),
    storage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) }
  const journal = createMaterialReceiptStore(storage)
  let principal = user
  const backend = createMaterialIntakeFixture({ principal: () => principal })
  const request = async (url, method = 'get', data) =>
    (await backend.adapter({ url, method, data })).data
  const api = {
    capabilities: () => request('/api/material-actions/capabilities'),
    mine: () => request('/api/knowledge-submissions/mine'),
    execute: async (kind, requestId, payload) =>
      request('/api/material-actions/knowledge', 'post', { requestId, payload }),
    receipt: (id) => request(`/api/material-actions/requests/${id}`),
  }
  const create = () => {
    const state = {},
      resource = createMaterialResource({
        state,
        owner: () => 'scope',
        receiptOwner: () => `${principal.schoolId}:${principal.id}`,
        journal,
        api,
        uuid: () => key,
      })
    resource.reset()
    return { state, resource }
  }
  return {
    create,
    api,
    journal,
    map,
    switchUser: (u) => {
      principal = u
    },
  }
}
test('a committed write with lost ACK is recovered after a new resource without a second POST', async () => {
  const f = setup(),
    send = f.api.execute
  let posts = 0
  f.api.execute = async (...args) => {
    posts++
    await send(...args)
    throw new Error('network lost')
  }
  const a = f.create()
  assert.equal(await a.resource.prepare(form, user), true)
  await a.resource.execute(form, user)
  assert.equal(a.state.phase, 'uncertain')
  assert.equal(f.journal.list('1:7').length, 1)
  assert.doesNotMatch([...f.map.values()].join(''), /合成正文|password|token/)
  a.resource.dispose()
  const b = f.create()
  assert.equal(await b.resource.resume(), true)
  assert.equal(b.state.verified, true)
  assert.equal(posts, 1)
  assert.equal(f.journal.list('1:7').length, 0)
})
test('missing receipt stays uncertain and cannot silently become a new write', async () => {
  const f = setup()
  f.journal.save({ owner: '1:7', id: key, kind: 'KNOWLEDGE_SUBMISSION', at: 0 })
  const a = f.create()
  assert.equal(await a.resource.resume(), false)
  assert.equal(a.state.phase, 'uncertain')
  assert.equal(await a.resource.prepare(form, user), false)
})
test('pending metadata is owner isolated and no content is read after switching account', async () => {
  const f = setup()
  f.journal.save({ owner: '1:7', id: key, kind: 'KNOWLEDGE_SUBMISSION', at: 0 })
  f.switchUser({ ...user, id: 8 })
  let reads = 0
  f.api.receipt = () => {
    reads++
    throw new Error('should not read')
  }
  assert.equal(await f.create().resource.resume(), false)
  assert.equal(reads, 0)
})
test('a server without durable support blocks preview instead of falling back to untracked POST', async () => {
  const f = setup()
  f.api.capabilities = async () => ({ durableReceipts: false })
  const a = f.create()
  assert.equal(await a.resource.prepare(form, user), false)
  assert.match(a.state.error, /尚未启用/)
})
test('a pre-delivery network loss can be retried after refresh only with the exact same content and request id', async () => {
  const f = setup(),
    send = f.api.execute,
    seen = []
  f.api.execute = async (kind, id) => {
    seen.push(id)
    throw new Error('network before delivery')
  }
  const a = f.create()
  await a.resource.prepare(form, user)
  await a.resource.execute(form, user)
  a.resource.dispose()
  const b = f.create()
  await b.resource.resume()
  assert.equal(b.state.phase, 'editing')
  assert.equal(await b.resource.prepare({ ...form, content: 'different' }, user), false)
  assert.match(b.state.error, /完全一致/)
  assert.equal(await b.resource.prepare(form, user), true)
  f.api.execute = async (...args) => {
    seen.push(args[1])
    return send(...args)
  }
  assert.equal(await b.resource.execute(form, user), true)
  assert.deepEqual(seen, [key, key])
  assert.equal((await f.api.mine()).length, 1)
})
