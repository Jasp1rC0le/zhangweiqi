import test from 'node:test'
import assert from 'node:assert/strict'
import axios from 'axios'
import { readChatStream, MAX_EVENT_CHARS, MAX_STREAM_BYTES } from '../src/api/chatStream.js'
import { MAX_ANSWER_CHARS } from '../src/api/chatResponse.js'
import { createSessionClient } from '../src/api/sessionClient.js'

const encoder = new TextEncoder()
const completion = (content = '完整') => ({
  userMessage:{id:1,conversationId:3,role:'user',content:'问题',createdAt:'2026-10-07T13:00:00',tokenCount:2},
  assistantMessage:{id:2,conversationId:3,role:'assistant',content,createdAt:'2026-10-07T13:00:01',tokenCount:4},
  sources:[],webSources:[],
})
const event = (name, payload, separator = '\n') => `event: ${name}${separator}data: ${JSON.stringify(payload)}${separator}${separator}`
const responseFor = (text, close = true) => {
  let cancelled = false, source
  const response = new Response(new ReadableStream({
    start(controller) { source = controller; if (text) controller.enqueue(encoder.encode(text)); if (close) controller.close() },
    cancel() { cancelled = true },
  }))
  return {response, source, wasCancelled:() => cancelled}
}

test('fragmented UTF-8 and CRLF events preserve Chinese text and finish once', {timeout:1000}, async () => {
  const raw = encoder.encode(event('delta', {content:'校园你好'}, '\r\n') + event('done', completion(), '\r\n'))
  const response = new Response(new ReadableStream({start(controller) {
    for (const byte of raw) controller.enqueue(Uint8Array.of(byte))
    controller.close()
  }}))
  const displayed = [], completed = []
  assert.deepEqual(await readChatStream(response, {onDelta:v=>displayed.push(v), onDone:v=>completed.push(v)}, {expectedConversationId:3}), completion())
  assert.deepEqual(displayed, ['校园你好'])
  assert.deepEqual(completed, [completion()])
  assert.equal(response.body.locked, false)
})

test('done event finishes without waiting for network close and ignores trailing events', {timeout:1000}, async () => {
  const fixture = responseFor(event('done', completion('finished')) + event('delta', {content:'late'}), false)
  const deltas = []
  assert.deepEqual(await readChatStream(fixture.response, {onDelta:v=>deltas.push(v)}), completion('finished'))
  assert.deepEqual(deltas, [])
  assert.equal(fixture.wasCancelled(), true)
  assert.equal(fixture.response.body.locked, false)
})

test('comments and unknown events are ignored, including final event without blank line', {timeout:1000}, async () => {
  const {response} = responseFor(': heartbeat\n\nevent: ping\ndata: alive\n\n' + event('done', completion()).trimEnd())
  assert.deepEqual(await readChatStream(response), completion())
})

test('missing completion is an interruption, not a successful answer', {timeout:1000}, async () => {
  const {response} = responseFor(event('delta', {content:'unfinished'}))
  await assert.rejects(readChatStream(response), error => error.response.status===502 && /意外中断/.test(error.message))
  assert.equal(response.body.locked, false)
})

test('malformed events fail without exposing raw content and release the reader', {timeout:1000}, async () => {
  for (const data of ['PRIVATE_BROKEN_JSON', 'null', '[]', '{"content":{}}']) {
    const fixture = responseFor(`event: delta\ndata: ${data}\n\n`, false)
    await assert.rejects(readChatStream(fixture.response), error => error.response.status===502 && !error.message.includes(data))
    assert.equal(fixture.wasCancelled(), true)
    assert.equal(fixture.response.body.locked, false)
  }
})

test('server rejection preserves status and closes unfinished reader', {timeout:1000}, async () => {
  const fixture = responseFor(event('error', {status:429, message:'额度不足'}), false)
  await assert.rejects(readChatStream(fixture.response), error=>error.response.status===429)
  assert.equal(fixture.wasCancelled(), true)
  await assert.rejects(readChatStream(new Response('{"message":"服务暂不可用"}', {status:503})), error=>error.response.status===503)
})

test('logout cancels a pending body read without delivering another delta', {timeout:1000}, async () => {
  const session = createSessionClient()
  session.setToken('account-a')
  const fixture = responseFor(event('delta', {content:'before'}), false)
  let seenFirst
  const first = new Promise(resolve=>{seenFirst=resolve})
  const displayed = []
  const pending = session.requestWithSession(async ()=>fixture.response,
    (response, lease)=>readChatStream(response, {onDelta:delta=>{displayed.push(delta); seenFirst()}}, lease))
  const rejected = assert.rejects(pending, axios.isCancel)
  await first
  session.setToken('')
  await rejected
  assert.deepEqual(displayed, ['before'])
  assert.equal(fixture.wasCancelled(), true)
  assert.equal(fixture.response.body.locked, false)
})

test('identity change inside a delta callback blocks the next event in the same chunk', {timeout:1000}, async () => {
  const session = createSessionClient()
  session.setToken('account-a')
  const fixture = responseFor(event('delta', {content:'first'}) + event('delta', {content:'private late answer'}) + event('done', {ok:true}))
  const displayed = [], finished = []
  await assert.rejects(session.requestWithSession(async ()=>fixture.response,
    (response, lease)=>readChatStream(response, {
      onDelta:delta=>{displayed.push(delta); session.setToken('account-b')},
      onDone:done=>finished.push(done),
    }, lease)), axios.isCancel)
  assert.deepEqual(displayed, ['first'])
  assert.deepEqual(finished, [])
  assert.equal(session.getToken(), 'account-b')
})

test('expired response retries once, cancelling its body before consuming a valid stream', {timeout:1000}, async () => {
  let requests=0, renewal=0
  const rejected = responseFor('', false)
  const session = createSessionClient({adapter:async config=>{
    renewal++
    return {config, data:{token:'renewed', user:{id:1,schoolId:1}}, status:200, headers:{}, statusText:'OK'}
  }})
  session.setToken('expired')
  const answer = await session.requestWithSession(async token=>{
    requests++
    return token==='renewed' ? responseFor(event('done', completion())).response : {status:401, body:rejected.response.body}
  }, (response, lease)=>readChatStream(response, {}, lease))
  assert.deepEqual(answer, completion())
  assert.equal(requests, 2)
  assert.equal(renewal, 1)
  assert.equal(rejected.wasCancelled(), true)
})

test('idle stream times out, releases the reader, and never claims completion', {timeout:1000}, async () => {
  const fixture = responseFor(event('delta', {content:'partial'}), false)
  let completed = false
  await assert.rejects(readChatStream(fixture.response, {onDone:()=>{completed=true}}, {idleTimeoutMs:10}),
    error=>error.response.status===408)
  assert.equal(completed, false)
  assert.equal(fixture.wasCancelled(), true)
  assert.equal(fixture.response.body.locked, false)
})

test('transport heartbeats cannot extend first-answer or meaningful-content deadlines forever', {timeout:1000}, async () => {
  for(const partial of [false,true]) {
    let timer, cancelled=false
    const response=new Response(new ReadableStream({
      start(controller){if(partial)controller.enqueue(encoder.encode(event('delta',{content:'部分'})));timer=setInterval(()=>controller.enqueue(encoder.encode(': heartbeat\n\n')),3)},
      cancel(){cancelled=true;clearInterval(timer)},
    }))
    await assert.rejects(readChatStream(response,{}, {idleTimeoutMs:20,firstAnswerTimeoutMs:20}),error=>error.response.status===408)
    assert.equal(cancelled,true)
  }
})
test('JSON error responses can trigger one session renewal; an in-stream 401 is never automatically replayed', {timeout:1000}, async () => {
  let requests=0,renewals=0
  const session=createSessionClient({adapter:async config=>{renewals++;return {config,data:{token:'renewed',user:{id:1,schoolId:1}},status:200,headers:{},statusText:'OK'}}})
  session.setToken('expired')
  await session.requestWithSession(async token=>{requests++;return token==='renewed'?responseFor(event('done',completion())).response:new Response('{"status":401}',{status:401,headers:{'Content-Type':'application/json'}})},(response,lease)=>readChatStream(response,{},lease))
  assert.equal(requests,2);assert.equal(renewals,1)
  requests=0
  await assert.rejects(session.requestWithSession(async()=>{requests++;return responseFor(event('error',{status:401})).response},(response,lease)=>readChatStream(response,{},lease)),error=>error.response.status===401)
  assert.equal(requests,1);assert.equal(renewals,1)
})
test('a proxy JSON or HTML success body is rejected before waiting for nonexistent SSE events', {timeout:1000}, async () => {
  for(const type of ['application/json','text/html']) {
    const fixture=responseFor('',false)
    fixture.response.headers.set('Content-Type',type)
    await assert.rejects(readChatStream(fixture.response),error=>error.response.status===502)
    assert.equal(fixture.wasCancelled(),true)
  }
})

test('view cancellation aborts a held reader without changing the login session', {timeout:1000}, async () => {
  const session = createSessionClient(), controller = new AbortController()
  session.setToken('current-account')
  const fixture = responseFor(event('delta', {content:'first'}), false)
  const displayed = []
  await assert.rejects(session.requestWithSession(async ()=>fixture.response, (response, lease)=>readChatStream(response, {
    onDelta:delta=>{displayed.push(delta); controller.abort()},
  }, lease), {signal:controller.signal}), axios.isCancel)
  assert.deepEqual(displayed, ['first'])
  assert.equal(session.getToken(), 'current-account')
  assert.equal(fixture.wasCancelled(), true)
})

test('malformed completion cannot replace partial messages or invoke onDone', {timeout:1000}, async () => {
  const mutations = [
    () => ({}), p=>({...p,userMessage:null}), p=>({...p,assistantMessage:{...p.assistantMessage,content:{}}}),
    p=>({...p,assistantMessage:{...p.assistantMessage,role:'user'}}),
    p=>({...p,assistantMessage:{...p.assistantMessage,conversationId:9}}),
    p=>({...p,assistantMessage:{...p.assistantMessage,id:1}}),
    p=>({...p,assistantMessage:{...p.assistantMessage,id:Number.MAX_SAFE_INTEGER+1}}),
    p=>({...p,assistantMessage:{...p.assistantMessage,createdAt:'not-a-date'}}),
    p=>({...p,assistantMessage:{...p.assistantMessage,tokenCount:-1}}),
    p=>({...p,sources:{}}), p=>({...p,webSources:[null]}),
    p=>({...p,sources:[{title:{}}]}), p=>({...p,webSources:Array(101).fill({title:'x',url:null})}),
  ]
  for (const mutate of mutations) {
    const fixture=responseFor(event('delta',{content:'partial'}) + event('done',mutate(completion())),false)
    const shown=[]; let done=0
    await assert.rejects(readChatStream(fixture.response,{onDelta:v=>shown.push(v),onDone:()=>done++}),
      error=>error.response.status===502)
    assert.deepEqual(shown,['partial'])
    assert.equal(done,0)
    assert.equal(fixture.wasCancelled(),true)
    assert.equal(fixture.response.body.locked,false)
  }
})

test('completion must match the requested conversation', {timeout:1000}, async () => {
  await assert.rejects(readChatStream(responseFor(event('done',completion())).response,{}, {expectedConversationId:4}),
    error=>error.response.status===502)
  assert.deepEqual(await readChatStream(responseFor(event('done',completion())).response,{}, {expectedConversationId:'3'}),completion())
})

test('empty recognized events and excessive event buffers are rejected promptly', {timeout:1000}, async () => {
  for (const raw of ['event: done\ndata:\n\n', 'event: delta\ndata: '+ 'x'.repeat(MAX_EVENT_CHARS + 1)]) {
    const fixture=responseFor(raw,false)
    await assert.rejects(readChatStream(fixture.response),error=>[413,502].includes(error.response.status))
    assert.equal(fixture.wasCancelled(),true)
    assert.equal(fixture.response.body.locked,false)
  }
})

test('cumulative answer limit rejects the overflow before displaying it', {timeout:1000}, async () => {
  const displayed=[]
  const fixture=responseFor(event('delta',{content:'a'.repeat(MAX_ANSWER_CHARS)})+event('delta',{content:'overflow'}),false)
  await assert.rejects(readChatStream(fixture.response,{onDelta:v=>displayed.push(v)}),error=>error.response.status===413)
  assert.equal(displayed.join('').length,MAX_ANSWER_CHARS)
  assert.equal(fixture.wasCancelled(),true)
})

test('wire budget includes ignored events and releases the stream', {timeout:1000}, async () => {
  const fixture=responseFor((': ping\n\n').repeat(Math.ceil(MAX_STREAM_BYTES/8)+1),false)
  await assert.rejects(readChatStream(fixture.response),error=>error.response.status===413)
  assert.equal(fixture.wasCancelled(),true)
})

test('server errors do not disclose raw response data and HTTP errors are not consumed', {timeout:1000}, async () => {
  for (const status of [400,401,403,404,429,500,503,'not-a-status']) {
    const fixture=responseFor(event('error',{status,message:'PRIVATE_INTERNAL_EXCEPTION',detail:'SECRET'}),false)
    await assert.rejects(readChatStream(fixture.response),error=>
      !JSON.stringify({message:error.message,...error.response}).includes('PRIVATE')
      && !JSON.stringify(error.response).includes('SECRET'))
    assert.equal(fixture.wasCancelled(),true)
  }
  let cancelled=false
  const body=new ReadableStream({cancel(){cancelled=true}})
  const response=new Response(body,{status:503})
  response.json=()=>{throw new Error('must not parse error body')}
  await assert.rejects(readChatStream(response),error=>error.response.status===503)
  assert.equal(cancelled,true)
})
