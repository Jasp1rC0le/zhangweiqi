import test from 'node:test'
import assert from 'node:assert/strict'
import axios from 'axios'
import { createSessionSync, SESSION_REVISION_KEY } from '../src/api/sessionSync.js'
import { createSessionClient } from '../src/api/sessionClient.js'

function environment() {
  const values = new Map(), peers = [], messages = []
  let serial = 0
  const storage = {getItem:key=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,value)}
  return {
    storage, messages,
    tab(changed, options = {}) {
      const events = new EventTarget(), channel = new EventTarget()
      channel.close = () => { const index=peers.indexOf(channel); if(index>=0) peers.splice(index,1) }
      channel.postMessage = data => {
        messages.push(data)
        for (const peer of peers) if (peer !== channel) peer.dispatchEvent(new MessageEvent('message', {data}))
      }
      peers.push(channel)
      const sync = createSessionSync({storage, events, channel, changed, nonce:()=>`revision-${++serial}`, ...options})
      return {sync, events, channel}
    },
  }
}

test('a change invalidates peers once and carries no account or token', () => {
  const env=environment()
  let a=0,b=0
  const first=env.tab(()=>a++), second=env.tab(()=>b++)
  first.sync.publish()
  second.events.dispatchEvent(new Event('focus'))
  assert.equal(a,0)
  assert.equal(b,1)
  assert.deepEqual(env.messages,[{type:'session-changed',revision:'revision-1',persisted:true}])
  first.sync.close(); second.sync.close()
})

test('missed events are detected on pageshow and before a suspended tab writes', async () => {
  const env=environment()
  let expired=0, writes=0, oldSync
  const old=createSessionClient({checkExternal:()=>oldSync.check(),onExpired:()=>expired++,adapter:async config=>{
    writes++; return {config,data:{},status:200,headers:{},statusText:'OK'}
  }})
  const peer=env.tab(old.expire,{channel:undefined})
  oldSync=peer.sync
  old.setToken('private-old',{id:1,schoolId:1})
  const next=env.tab(()=>{})
  next.sync.publish()
  await assert.rejects(old.http.post('/api/projects',{private:'old draft'}),axios.isCancel)
  await assert.rejects(old.refreshAccess(),axios.isCancel)
  assert.equal(writes,0)
  assert.equal(expired,1)
  peer.events.dispatchEvent(new Event('pageshow'))
  assert.equal(expired,1)
  peer.sync.close(); next.sync.close()
})

test('delayed old notifications cannot invalidate the latest local login', () => {
  const env=environment(); let changes=0
  const tab=env.tab(()=>changes++)
  tab.sync.publish()
  const old=env.messages[0]
  tab.sync.publish()
  tab.channel.dispatchEvent(new MessageEvent('message',{data:old}))
  assert.equal(changes,0)
  tab.sync.close()
})

test('malformed channel data is ignored and cannot assign privileges', () => {
  const env=environment(); let changes=0
  const tab=env.tab(()=>changes++)
  for(const data of [null, {type:'login',token:'fake',role:'ADMIN'}, {type:'session-changed',revision:{}}, {type:'session-changed',revision:'x'.repeat(101)}]) {
    tab.channel.dispatchEvent(new MessageEvent('message',{data}))
  }
  assert.equal(changes,0)
  tab.sync.close()
})

test('channel works when storage is blocked, without persisting credentials', () => {
  const env=environment(); let changes=0
  const storage={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}}
  const first=env.tab(()=>{},{storage}), second=env.tab(()=>changes++,{storage})
  first.sync.publish()
  assert.equal(changes,1)
  second.events.dispatchEvent(new Event('focus'))
  assert.equal(changes,1)
  first.sync.close(); second.sync.close()
})

test('storage-only fallback catches removal, ignores unrelated keys, and cleans listeners', () => {
  const env=environment(); let changes=0
  const tab=env.tab(()=>changes++,{channel:undefined})
  env.storage.setItem(SESSION_REVISION_KEY,'next')
  const event=new Event('storage'); event.key='unrelated'
  tab.events.dispatchEvent(event)
  assert.equal(changes,0)
  event.key=SESSION_REVISION_KEY
  tab.events.dispatchEvent(event)
  assert.equal(changes,1)
  env.storage.setItem(SESSION_REVISION_KEY,null)
  tab.events.dispatchEvent(event)
  assert.equal(changes,2)
  tab.sync.close()
  env.storage.setItem(SESSION_REVISION_KEY,'later')
  tab.events.dispatchEvent(new Event('focus'))
  assert.equal(changes,2)
})

test('readable but full storage falls back to channel without logging out the sender', () => {
  const env=environment(); let firstChanges=0,secondChanges=0
  const storage={getItem:()=>null,setItem(){throw new Error('quota exceeded')}}
  const first=env.tab(()=>firstChanges++,{storage}), second=env.tab(()=>secondChanges++,{storage})
  first.sync.publish()
  first.events.dispatchEvent(new Event('focus'))
  second.events.dispatchEvent(new Event('focus'))
  assert.equal(firstChanges,0)
  assert.equal(secondChanges,1)
  assert.equal(env.messages[0].persisted,false)
  first.sync.close(); second.sync.close()
})

test('cross-tab change aborts an in-flight ordinary request without replay', {timeout:1000}, async () => {
  const env=environment(); let sync, calls=0, started
  const entered=new Promise(resolve=>{started=resolve})
  const session=createSessionClient({checkExternal:()=>sync.check(),adapter:config=>new Promise((_,reject)=>{
    calls++
    config.signal.addEventListener('abort',()=>reject(new axios.CanceledError('cancelled',config)),{once:true})
    started()
  })})
  const local=env.tab(session.expire); sync=local.sync
  session.setToken('old',{id:1,schoolId:1})
  const rejection=assert.rejects(session.http.post('/api/private',{draft:'private'}),axios.isCancel)
  await entered
  const other=env.tab(()=>{}); other.sync.publish()
  await rejection
  assert.equal(calls,1)
  assert.equal(session.getToken(),'')
  local.sync.close(); other.sync.close()
})

test('a late ordinary response is rejected after an unobserved external change', {timeout:1000}, async () => {
  const env=environment(); let sync, finish, started
  const entered=new Promise(resolve=>{started=resolve})
  const session=createSessionClient({checkExternal:()=>sync.check(),adapter:config=>new Promise(resolve=>{
    finish=()=>resolve({config,data:{private:'old'},status:200,headers:{},statusText:'OK'}); started()
  })})
  const local=env.tab(session.expire,{channel:undefined}); sync=local.sync
  session.setToken('old',{id:1,schoolId:1})
  const rejected=assert.rejects(session.http.get('/api/private'),axios.isCancel)
  await entered
  const other=env.tab(()=>{}); other.sync.publish(); finish()
  await rejected
  local.sync.close(); other.sync.close()
})
