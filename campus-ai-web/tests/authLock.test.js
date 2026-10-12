import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthLock } from '../src/api/authLock.js'
import { createSessionClient } from '../src/api/sessionClient.js'

const deferred=()=>{let resolve; const promise=new Promise(r=>{resolve=r}); return {promise,resolve}}
const serialLocks=()=>{
  let tail=Promise.resolve()
  return {request(name, {signal}, callback) {
    assert.equal(name,'campthink-auth-cookie-v1')
    const next=tail.then(()=>{signal.throwIfAborted(); return callback()})
    tail=next.catch(()=>{})
    return next
  }}
}
test('same-origin clients serialize cookie rotation without sharing access tokens', {timeout:1000}, async () => {
  const lock=createAuthLock(serialLocks())
  const gate=deferred(), entered=deferred()
  let cookieVersion=0, running=0, peak=0
  const adapter=async config=>{
    running++; peak=Math.max(peak,running)
    const observed=cookieVersion
    if(observed===0){entered.resolve(); await gate.promise}
    assert.equal(observed,cookieVersion)
    cookieVersion++; running--
    return {config, data:{token:`issued-${cookieVersion}`,user:{id:1,schoolId:1}},status:200,headers:{},statusText:'OK'}
  }
  const tabA=createSessionClient({withAuthLock:lock,adapter})
  const tabB=createSessionClient({withAuthLock:lock,adapter})
  const first=tabA.refreshAccess(), second=tabB.refreshAccess()
  await entered.promise
  gate.resolve()
  assert.deepEqual(await Promise.all([first,second]),['issued-1','issued-2'])
  assert.equal(peak,1)
})
test('unavailable Web Locks use local behavior without token persistence', {timeout:1000}, async () => {
  let calls=0
  assert.equal(await createAuthLock(undefined)(async()=>++calls),1)
})
test('lock wait is bounded and never starts the operation after timeout', {timeout:1000}, async () => {
  let calls=0
  const locks={request:(_name,{signal})=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true})
  })}
  await assert.rejects(createAuthLock(locks,5)(async()=>calls++),/其他页面正在更新登录状态/)
  assert.equal(calls,0)
})
test('operation failure releases lock so another tab can proceed', {timeout:1000}, async () => {
  const lock=createAuthLock(serialLocks())
  const failed=assert.rejects(lock(async()=>{throw new Error('offline')}),/offline/)
  const next=lock(async()=>'next session')
  await failed
  assert.equal(await next,'next session')
})
test('lock permission error is propagated, not bypassed with an unlocked request', {timeout:1000}, async () => {
  let calls=0
  const error=new DOMException('not permitted','SecurityError')
  const lock=createAuthLock({request:async()=>{throw error}})
  await assert.rejects(lock(async()=>calls++),value=>value===error)
  assert.equal(calls,0)
})
