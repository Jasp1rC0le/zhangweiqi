import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftRecovery, DRAFT_RECOVERY_KEY, DRAFT_TTL_MS } from '../src/utils/draftRecovery.js'
import { createWorkspaceDrafts } from '../src/utils/workspaceDrafts.js'

const user = {id:11, schoolId:3}
const slot = {model:'standard', conversationId:null}
const draft = {...slot, text:'实验数据还没写完 🧪'}
function harness() {
  const values = new Map()
  let time = 1000000, revision = 'login-a', failWrite = false
  const storage = {
    getItem:key => values.get(key) ?? null,
    setItem:(key, value) => { if (failWrite) throw new Error('quota'); values.set(key,value) },
    removeItem:key => values.delete(key),
  }
  const create = () => createDraftRecovery({storage, revision:() => revision, now:() => time})
  const recovery = create()
  const enable = () => { recovery.bind(user); assert.equal(recovery.setEnabled(true, [draft], slot), true) }
  return {values, storage, recovery, create, enable,
    advance:value => { time += value }, revision:value => { revision = value }, failWrite:() => { failWrite = true }}
}

test('no text is persisted without both verified identity and explicit opt-in', () => {
  const h = harness()
  assert.equal(h.recovery.setEnabled(true,[draft],slot),false)
  assert.equal(h.recovery.save([draft],slot),false)
  h.recovery.bind(user)
  assert.equal(h.recovery.save([draft],slot),false)
  assert.equal(h.values.size,0)
})
test('same-tab reload offers the correct account drafts only after authentication', () => {
  const h = harness(); h.enable()
  const reload = h.create()
  assert.equal(reload.snapshot(),null)
  reload.bind(user)
  assert.deepEqual(reload.snapshot().entries,[draft])
  const snapshot = reload.snapshot()
  snapshot.entries[0].text = 'modified caller copy'
  assert.equal(reload.snapshot().entries[0].text,draft.text)
})
test('expiry suspends reads and queued writes, same-account reauthentication restores', () => {
  const h = harness(); h.enable()
  h.recovery.suspend()
  assert.equal(h.recovery.snapshot(),null)
  assert.equal(h.recovery.save([{...draft,text:'late component cleanup'}],slot),false)
  h.recovery.bind(user)
  h.revision('login-b')
  h.recovery.rebindRevision()
  assert.deepEqual(h.recovery.snapshot().entries,[draft])
  const reload = h.create(); reload.bind(user)
  assert.deepEqual(reload.snapshot().entries,[draft])
})
test('different account or school clears recovery instead of leaking it', () => {
  for (const next of [{...user,id:12},{...user,schoolId:4}]) {
    const h = harness(); h.enable()
    h.recovery.suspend(); h.recovery.bind(next)
    assert.equal(h.recovery.snapshot(),null)
    assert.equal(h.values.size,0)
    assert.equal(h.recovery.status().enabled,false)
  }
})
test('explicit logout and external identity changes clear storage and reject late writes', () => {
  const h = harness(); h.enable()
  h.recovery.reset()
  assert.equal(h.recovery.save([draft],slot),false)
  h.recovery.bind(user)
  assert.equal(h.recovery.snapshot(),null)
  assert.equal(h.values.size,0)
})
test('a sleeping tab with a changed revision cannot restore or renew an old snapshot', () => {
  for (const operation of ['reload','save']) {
    const h = harness(); h.enable(); h.revision('logged-out-elsewhere')
    if (operation === 'reload') { const reload=h.create(); reload.bind(user); assert.equal(reload.snapshot(),null) }
    else assert.equal(h.recovery.save([draft],slot),false)
    assert.equal(h.values.size,0)
  }
})
test('drafts expire at exactly 30 minutes and fail closed if the clock moves back', () => {
  for (const change of [DRAFT_TTL_MS,-1]) {
    const h = harness(); h.enable(); h.advance(change)
    const reload=h.create(); reload.bind(user)
    assert.equal(reload.snapshot(),null)
    assert.equal(h.values.size,0)
  }
})
test('late restore rechecks expiration even if the choice was displayed earlier', () => {
  const h = harness(); h.enable()
  assert.equal(h.recovery.snapshot().entries.length,1)
  h.advance(DRAFT_TTL_MS)
  assert.equal(h.recovery.snapshot(),null)
  assert.equal(h.recovery.status().enabled,false)
})
test('reauthentication does not extend the original 30-minute retention window', () => {
  const h = harness(); h.enable()
  h.advance(DRAFT_TTL_MS-1)
  h.recovery.suspend(); h.recovery.bind(user)
  h.revision('renewed-login'); h.recovery.rebindRevision()
  h.advance(1)
  assert.equal(h.recovery.snapshot(),null)
  assert.equal(h.values.size,0)
})
test('turning off recovery removes the local copy without mutating current editor input', () => {
  const h = harness(); h.enable()
  const input = {...draft}
  assert.equal(h.recovery.setEnabled(false),true)
  assert.deepEqual(input,draft)
  assert.equal(h.values.size,0)
  assert.equal(h.recovery.save([input],slot),false)
})
test('write quota failure removes obsolete snapshots and reports not saved', () => {
  const h = harness(); h.enable(); h.failWrite()
  const edited = {...draft,text:'new edit that failed to save'}
  assert.equal(h.recovery.save([edited],slot),false)
  assert.equal(h.values.size,0)
  assert.equal(h.recovery.status().enabled,false)
  assert.match(h.recovery.status().error,/未能暂存/)
  assert.equal(edited.text,'new edit that failed to save')
})
test('unavailable session storage or revision storage never silently falls back', () => {
  for (const options of [
    {storage:undefined, revision:() => null},
    {storage:{getItem:() => { throw new Error('disabled') }}, revision:() => null},
    {storage:harness().storage, revision:() => { throw new Error('disabled') }},
  ]) {
    const r = createDraftRecovery(options)
    r.bind(user)
    assert.equal(r.setEnabled(true,[draft],slot),false)
    assert.equal(r.status().enabled,false)
    assert.ok(r.status().error)
  }
})
test('cleanup failures are disclosed, never reported as erased', () => {
  const r = createDraftRecovery({storage:{removeItem:() => { throw new Error('denied') }}, revision:() => null})
  r.reset()
  assert.match(r.status().error,/未允许清理/)
})
test('invalid identity cannot unlock stored drafts', () => {
  for (const identity of [null,{id:11},{id:0,schoolId:3},{id:11,schoolId:-1},{id:'eleven',schoolId:3}]) {
    const h = harness(); h.enable()
    h.recovery.bind(identity)
    assert.equal(h.recovery.snapshot(),null)
    assert.equal(h.values.size,0)
  }
})
test('malformed, oversized, unknown-model and duplicate-slot snapshots are discarded', () => {
  const mutations = [
    () => 'not json',
    () => 'x'.repeat(260001),
    value => JSON.stringify({...value,version:99}),
    value => JSON.stringify({...value,entries:[{...draft,model:'arbitrary'}]}),
    value => JSON.stringify({...value,entries:[draft,draft]}),
    value => JSON.stringify({...value,entries:[{...draft,conversationId:'1'}]}),
    value => JSON.stringify({...value,entries:[{...draft,text:'x'.repeat(10001)}]}),
  ]
  for (const mutate of mutations) {
    const h = harness(); h.enable()
    h.values.set(DRAFT_RECOVERY_KEY,mutate(JSON.parse(h.values.get(DRAFT_RECOVERY_KEY))))
    const r=h.create(); r.bind(user)
    assert.equal(r.snapshot(),null)
    assert.equal(h.values.size,0)
  }
})
test('only permitted text fields enter storage, not credentials or attachment metadata', () => {
  const h = harness(); h.recovery.bind({...user,password:'do-not-store',token:'do-not-store'})
  h.recovery.setEnabled(true,[{...draft,password:'do-not-store',attachment:{content:'do-not-store'}}],slot)
  const encoded = h.values.get(DRAFT_RECOVERY_KEY)
  assert.equal(encoded.includes('do-not-store'),false)
  assert.deepEqual(h.recovery.snapshot().entries,[draft])
})
test('oversize writes do not truncate silently or leave an obsolete valid-looking snapshot', () => {
  const cases = [
    [{...draft,text:'x'.repeat(10001)}],
    Array.from({length:21},(_,i) => ({...draft,conversationId:i+1})),
    Array.from({length:5},(_,i) => ({model:'kimi',conversationId:i+1,text:'x'.repeat(50000)})),
  ]
  for (const entries of cases) {
    const h=harness(); h.enable()
    assert.equal(h.recovery.save(entries,slot),false)
    assert.equal(h.values.size,0)
    assert.ok(h.recovery.status().error)
  }
})
test('sent and deleted drafts stay removed after reload without erasing another workspace', () => {
  const h=harness(), memory=createWorkspaceDrafts()
  memory.save('standard',null,'new question')
  memory.save('standard',7,'follow-up to send')
  memory.save('kimi',9,'paper')
  h.recovery.bind(user); h.recovery.setEnabled(true,memory.entries(),slot)
  memory.clear('standard',7)
  h.recovery.save(memory.entries(),{model:'standard',conversationId:7})
  memory.forgetConversation(9)
  h.recovery.save(memory.entries(),slot)
  const reload=h.create(); reload.bind(user)
  assert.deepEqual(reload.snapshot().entries,[{...slot,text:'new question'}])
})
test('an empty sent draft stays empty after reload, opt-in can remain enabled', () => {
  const h=harness(); h.enable()
  h.recovery.save([],slot)
  const reload=h.create(); reload.bind(user)
  assert.deepEqual(reload.snapshot().entries,[])
  assert.equal(reload.status().enabled,true)
})
