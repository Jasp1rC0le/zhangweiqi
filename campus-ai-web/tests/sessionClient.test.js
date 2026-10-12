import test from 'node:test'
import assert from 'node:assert/strict'
import axios from 'axios'
import { setImmediate } from 'node:timers'
import { createSessionClient } from '../src/api/sessionClient.js'

const ok = (config, data = {}) => ({ config, data, status: 200, headers: {}, statusText: 'OK' })
const fail = (config, status) => { throw new axios.AxiosError('request failed', undefined, config, {}, status ? { status, data: {} } : undefined) }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const accountA = {id:1, schoolId:1}
const accountB = {id:2, schoolId:1}

test('pinned multi-page reads cannot continue under a changed account', async () => {
  let calls=0
  const session=createSessionClient({adapter:async config=>{calls++;return ok(config,[])}})
  session.setToken('test-a',accountA)
  const first=await session.http.get('/api/admin/knowledge/documents/scan')
  session.setToken('test-b',accountB)
  await assert.rejects(session.http.get('/api/admin/knowledge/documents/scan',{
    _sessionGeneration:first.config._sessionGeneration,params:{beforeId:10},
  }),axios.isCancel)
  assert.equal(calls,1)
})

test('expired session allows only exact public recovery and registration operations', async () => {
  const seen = []
  const session = createSessionClient({adapter:async config=>{seen.push(config); return ok(config)}})
  session.setToken('old-private-token', accountA)
  session.expire()
  const publicPosts = ['/api/auth/login', '/api/users', '/api/auth/password-reset/request',
    '/api/auth/password-reset/confirm', '/api/auth/email/verify']
  for (const path of publicPosts) await session.http.post(path, {})
  await session.http.get('/api/schools')
  assert.equal(seen.length, publicPosts.length + 1)
  assert.ok(seen.every(config=>!config.headers.Authorization))
  for (const path of ['/api/users', '/api/users/1', '/api/schools/1', '/api/auth/login/extra', '/api/projects']) {
    await assert.rejects(session.http.get(path), axios.isCancel)
  }
  await assert.rejects(session.http.post('/api/schools'), axios.isCancel)
  await assert.rejects(session.refreshAccess(), axios.isCancel)
  assert.equal(seen.length, publicPosts.length + 1)
})

test('public recovery never carries bearer credentials or renews on rejection', async () => {
  const calls = []
  const session = createSessionClient({adapter:async config=>{calls.push(config); return fail(config,401)}})
  session.setToken('private-token', accountA)
  await assert.rejects(session.http.post('/api/auth/password-reset/confirm', {token:'test-only'},
    {headers:{Authorization:'Bearer should-not-forward'}}), error=>error.response?.status===401)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers.Authorization, undefined)
  assert.equal(session.getToken(), 'private-token')
})

test('already cancelled view never sends its prompt', {timeout:1000}, async () => {
  const session = createSessionClient(), controller = new AbortController()
  controller.abort()
  let requests = 0
  await assert.rejects(session.requestWithSession(async ()=>{requests++; return {status:200}}, undefined,
    {signal:controller.signal}), axios.isCancel)
  assert.equal(requests, 0)
})

test('request deadline aborts pending headers without expiring login', {timeout:1000}, async () => {
  const session = createSessionClient()
  session.setToken('existing')
  await assert.rejects(session.requestWithSession((_token, signal)=>new Promise((_, reject)=>{
    signal.addEventListener('abort', ()=>reject(signal.reason), {once:true})
  }), undefined, {timeoutMs:10}), error=>error.code==='ECONNABORTED' && !axios.isCancel(error))
  assert.equal(session.getToken(), 'existing')
})

test('cancel while awaiting shared renewal does not replay a prompt', {timeout:1000}, async () => {
  const gate = deferred(), controller = new AbortController()
  const session = createSessionClient({adapter:async config=>{
    controller.abort()
    await gate.promise
    return ok(config, {token:'renewed', user:accountA})
  }})
  let requests = 0
  const pending = session.requestWithSession(async ()=>{requests++; return {status:401}}, undefined, {signal:controller.signal})
  const rejected = assert.rejects(pending, axios.isCancel)
  await new Promise(resolve=>setImmediate(resolve))
  gate.resolve()
  await rejected
  assert.equal(requests, 1)
})

test('cancelled HTTP write stops waiting for shared renewal and cannot be replayed', {timeout:1000}, async () => {
  const gate = deferred(), started = deferred(), caller = new AbortController()
  let writes = 0, renewals = 0, successfulReads = 0
  const session = createSessionClient({adapter:async config => {
    if (config.url === '/api/auth/refresh') {
      renewals++; started.resolve(); await gate.promise
      return ok(config, {token:'renewed', user:accountA})
    }
    if (config.url === '/api/private/write') writes++
    if (config.headers.Authorization !== 'Bearer renewed') return fail(config, 401)
    if (config.url === '/api/private/read') successfulReads++
    return ok(config)
  }})
  session.setToken('old', accountA)
  const write = session.http.post('/api/private/write', {}, {signal:caller.signal})
  const rejection = assert.rejects(write, axios.isCancel)
  const read = session.http.get('/api/private/read')
  let deadline
  try {
    await started.promise
    caller.abort()
    // Cancellation must settle without cancelling the renewal shared by read.
    await Promise.race([rejection, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('cancel waited for renewal')), 100)
      deadline.unref()
    })])
  } finally {
    clearTimeout(deadline)
    gate.resolve()
    await Promise.allSettled([write, read, rejection])
  }
  assert.equal(writes, 1)
  assert.equal(renewals, 1)
  assert.equal(successfulReads, 1)
  assert.equal(session.getToken(), 'renewed')
})

test('HTTP replay remains bound to caller cancellation after successful renewal', {timeout:1000}, async () => {
  const caller = new AbortController(), replayStarted = deferred()
  let calls = 0, replaySignal
  const session = createSessionClient({adapter:async config => {
    if (config.url === '/api/auth/refresh') return ok(config, {token:'renewed', user:accountA})
    calls++
    if (calls === 1) return fail(config, 401)
    replaySignal = config.signal
    replayStarted.resolve()
    return new Promise((_, reject) => {
      config.signal.addEventListener('abort', () => reject(new axios.CanceledError('test cancelled', config)), {once:true})
    })
  }})
  session.setToken('old', accountA)
  const request = session.http.post('/api/private/write', {}, {signal:caller.signal})
  const rejection = assert.rejects(request, axios.isCancel)
  await replayStarted.promise
  caller.abort()
  try { await rejection }
  finally { if (!replaySignal.aborted) session.expire() }
  assert.equal(replaySignal.aborted, true)
  assert.equal(calls, 2)
  assert.equal(session.getToken(), 'renewed')
})

test('completed request releases its caller abort listener', {timeout:1000}, async () => {
  const session = createSessionClient(), caller = new AbortController()
  let captured
  await session.requestWithSession(async (_token, signal)=>{captured=signal; return {status:200}}, undefined, {signal:caller.signal,timeoutMs:100})
  caller.abort()
  assert.equal(captured.aborted, false)
})

test('deadline stops waiting for shared renewal before that renewal settles', {timeout:1000}, async () => {
  const gate = deferred()
  const session = createSessionClient({adapter:async config=>{
    await gate.promise
    return ok(config, {token:'renewed', user:accountA})
  }})
  let requests = 0
  try {
    await assert.rejects(session.requestWithSession(async ()=>{requests++; return {status:401}}, undefined, {timeoutMs:10}),
      error=>error.code==='ECONNABORTED')
    assert.equal(requests, 1)
  } finally { gate.resolve() }
})

test('refresh cookie for another account cannot replay private writes', {timeout:1000}, async () => {
  let writes = 0, expired = 0
  const session = createSessionClient({onExpired:()=>expired++, adapter:async config=>{
    if (config.url==='/api/auth/refresh') return ok(config, {token:'account-b', user:accountB})
    writes++
    return config.headers.Authorization==='Bearer account-b' ? ok(config) : fail(config,401)
  }})
  session.setToken('account-a', accountA)
  await assert.rejects(session.http.post('/api/private', {draft:'private draft from A'}), axios.isCancel)
  assert.equal(writes, 1)
  assert.equal(expired, 1)
  assert.equal(session.getToken(), '')
})

for (const status of [undefined, 403, 429, 503]) {
  test('refresh failure preserves session: ' + (status || 'offline'), async () => {
    let expired = 0
    const session = createSessionClient({ onExpired: () => expired++, adapter: async config => fail(config, config.url === '/api/auth/refresh' ? status : 401) })
    session.setToken('existing')
    await assert.rejects(session.http.get('/api/private'), error => error.response?.status === status)
    assert.equal(session.getToken(), 'existing')
    assert.equal(expired, 0)
  })
}
test('confirmed refresh expiry clears session and notifies once', async () => {
  let expired = 0
  const session = createSessionClient({ onExpired: () => expired++, adapter: async config => fail(config, 401) })
  session.setToken('existing')
  await Promise.allSettled([session.http.get('/api/a'), session.http.get('/api/b')])
  assert.equal(session.getToken(), '')
  assert.equal(expired, 1)
})
test('concurrent 401 responses share a single renewal and replay with new bearer', async () => {
  let renewals = 0, successes = 0
  const gate = deferred()
  const session = createSessionClient({ adapter: async config => {
    if (config.url === '/api/auth/refresh') { renewals++; await gate.promise; return ok(config, {token:'new', user:accountA}) }
    if (config.headers.Authorization !== 'Bearer new') return fail(config, 401)
    successes++; return ok(config)
  } })
  session.setToken('old')
  const pending = Promise.all([session.http.get('/api/a'), session.http.get('/api/b')])
  await new Promise(resolve => setImmediate(resolve))
  gate.resolve()
  await pending
  assert.equal(renewals, 1)
  assert.equal(successes, 2)
})
test('late refresh cannot restore token after logout or overwrite a new login', async () => {
  for (const nextToken of ['', 'another-account']) {
    const gate = deferred()
    const session = createSessionClient({adapter: async config => { await gate.promise; return ok(config, {token:'stale', user:accountA}) }})
    const pending = session.refreshAccess()
    session.setToken(nextToken)
    gate.resolve()
    await assert.rejects(pending, axios.isCancel)
    assert.equal(session.getToken(), nextToken)
  }
})
test('old account request cannot replay after a different account logs in', async () => {
  const gate = deferred()
  let renewals = 0
  const session = createSessionClient({ adapter: async config => {
    if (config.url === '/api/auth/refresh') renewals++
    await gate.promise
    return fail(config, 401)
  } })
  session.setToken('a')
  const pending = session.http.post('/api/private', {message:'private draft'})
  await new Promise(resolve => setImmediate(resolve))
  session.setToken('b')
  gate.resolve()
  await assert.rejects(pending, axios.isCancel)
  assert.equal(renewals, 0)
  assert.equal(session.getToken(), 'b')
})
test('login and logout rejection do not renew or pretend success', async () => {
  let calls = 0, expired = 0
  const session = createSessionClient({ onExpired: () => expired++, adapter: async config => { calls++; return fail(config, 401) } })
  session.setToken('existing')
  await assert.rejects(session.http.post('/api/auth/logout'))
  await assert.rejects(session.http.post('/api/auth/login'))
  assert.equal(calls, 2)
  assert.equal(expired, 0)
  assert.equal(session.getToken(), 'existing')
})
test('malformed renewal is recoverable and a later retry can succeed', async () => {
  let attempt = 0
  const session = createSessionClient({ adapter: async config => ok(config, ++attempt === 1 ? {} : {token:'valid', user:accountA}) })
  session.setToken('existing')
  await assert.rejects(session.refreshAccess(), /响应异常/)
  assert.equal(session.getToken(), 'existing')
  assert.equal(await session.refreshAccess(), 'valid')
})
test('stream renewal failure keeps session and propagates actual service error', async () => {
  let expired = 0
  const session = createSessionClient({ onExpired: () => expired++, adapter: async config => fail(config, 503) })
  session.setToken('existing')
  await assert.rejects(session.requestWithSession(async () => ({status:401})), error => error.response.status === 503)
  assert.equal(expired, 0)
  assert.equal(session.getToken(), 'existing')
})
test('stream retries once with renewed token; confirmed expiry invalidates session', async () => {
  let expired = 0
  const session = createSessionClient({ onExpired: () => expired++, adapter: async config => ok(config,{token:'new', user:accountA}) })
  const used = []
  session.setToken('old')
  const result = await session.requestWithSession(async token => { used.push(token); return {status:token === 'new' ? 200 : 401} })
  assert.equal(result.status, 200)
  assert.deepEqual(used, ['old','new'])
  await session.requestWithSession(async () => ({status:401}))
  assert.equal(expired, 1)
  assert.equal(session.getToken(), '')
})
test('stale stream 401 cannot invalidate a new login', async () => {
  let expired = 0
  const gate = deferred()
  const session = createSessionClient({ onExpired: () => expired++ })
  session.setToken('old')
  const pending = session.requestWithSession(async () => { await gate.promise; return {status:401} })
  session.setToken('new-account')
  gate.resolve()
  await assert.rejects(pending, axios.isCancel)
  assert.equal(expired, 0)
  assert.equal(session.getToken(), 'new-account')
})

test('stream identity stays guarded after response headers arrive', {timeout:1000}, async () => {
  for (const nextToken of ['', 'new-account']) {
    const headers = deferred(), chunk = deferred()
    const session = createSessionClient()
    session.setToken('old-account')
    const displayed = []
    let streamSignal
    const pending = session.requestWithSession(async (_token, signal) => {
      streamSignal = signal
      return {status:200}
    }, async (_response, {assertActive}) => {
      headers.resolve()
      await chunk.promise
      assertActive()
      displayed.push('old private answer')
    })
    const rejected = assert.rejects(pending, axios.isCancel)
    await headers.promise
    session.setToken(nextToken)
    assert.equal(streamSignal.aborted, true)
    chunk.resolve()
    await rejected
    assert.deepEqual(displayed, [])
    assert.equal(session.getToken(), nextToken)
  }
})

test('ordinary token renewal does not interrupt an active stream', {timeout:1000}, async () => {
  const session = createSessionClient({adapter: async config => ok(config, {token:'renewed', user:accountA})})
  session.setToken('existing')
  const result = await session.requestWithSession(async () => ({status:200}), async (_response, {signal, assertActive}) => {
    await session.refreshAccess()
    assertActive()
    assert.equal(signal.aborted, false)
    return 'finished answer'
  })
  assert.equal(result, 'finished answer')
  assert.equal(session.getToken(), 'renewed')
})

test('completed stream is released from identity-change cancellation', {timeout:1000}, async () => {
  const session = createSessionClient()
  let completedSignal
  await session.requestWithSession(async (_token, signal) => {
    completedSignal = signal
    return {status:200}
  })
  session.setToken('another-account')
  assert.equal(completedSignal.aborted, false)
})

test('first restoration binds account identity for subsequent renewals', {timeout:1000}, async () => {
  let count=0, expired=0
  const session=createSessionClient({onExpired:()=>expired++, adapter:async config=>ok(config, {token:'renewed', user:++count===1?accountA:accountB})})
  assert.equal(await session.refreshAccess(), 'renewed')
  await assert.rejects(session.refreshAccess(), axios.isCancel)
  assert.equal(session.getToken(), '')
  assert.equal(expired, 1)
})

test('school change cannot carry an old request into a different school', {timeout:1000}, async () => {
  const session=createSessionClient({adapter:async config=>ok(config, {token:'new-school', user:{...accountA, schoolId:2}})})
  session.setToken('old-school', accountA)
  await assert.rejects(session.refreshAccess(), axios.isCancel)
  assert.equal(session.getToken(), '')
})

test('same server identity accepts numeric strings without treating renewal as login', {timeout:1000}, async () => {
  const session=createSessionClient({adapter:async config=>ok(config, {token:'renewed', user:{id:'1',schoolId:'1'}})})
  session.setToken('old', accountA)
  assert.equal(await session.refreshAccess(), 'renewed')
})

test('malformed renewal identity does not overwrite current session', {timeout:1000}, async () => {
  for (const user of [undefined, {}, {id:0,schoolId:1}, {id:1,schoolId:null}, {id:true,schoolId:1}]) {
    let expired=0
    const session=createSessionClient({onExpired:()=>expired++, adapter:async config=>ok(config, {token:'new',user})})
    session.setToken('existing', accountA)
    await assert.rejects(session.refreshAccess(), /身份响应异常/)
    assert.equal(session.getToken(), 'existing')
    assert.equal(expired, 0)
  }
})

test('identity change while awaiting an auth lock prevents a stale network request', {timeout:1000}, async () => {
  const gate=deferred(), entered=deferred()
  let calls=0
  const session=createSessionClient({
    withAuthLock:async operation=>{entered.resolve(); await gate.promise; return operation()},
    adapter:async config=>{calls++; return ok(config,{token:'stale',user:accountA})},
  })
  session.setToken('old',accountA)
  const rejected=assert.rejects(session.refreshAccess(), axios.isCancel)
  await entered.promise
  session.setToken('new',accountB)
  gate.resolve()
  await rejected
  assert.equal(calls,0)
  assert.equal(session.getToken(),'new')
})

test('stream cannot retry under a cookie belonging to another account', {timeout:1000}, async () => {
  let attempts=0
  const session=createSessionClient({adapter:async config=>ok(config,{token:'b',user:accountB})})
  session.setToken('a',accountA)
  await assert.rejects(session.requestWithSession(async ()=>{attempts++; return {status:401}}),axios.isCancel)
  assert.equal(attempts,1)
})
