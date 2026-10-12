import test from 'node:test'
import assert from 'node:assert/strict'
import { createLatestRequest } from '../src/utils/latestRequest.js'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes,no)=>{resolve=yes; reject=no})
  return {promise, resolve, reject}
}

test('replaced history read is aborted and its late data never overwrites the selected chat', {timeout:1000}, async () => {
  const old=deferred(), next=deferred(), signals=[], shown=[], busy=[]
  const loader=createLatestRequest({
    load:(id,{signal})=>{signals.push(signal); return id===1 ? old.promise : next.promise},
    onStart:()=>busy.push(true), onSuccess:(data)=>shown.push(data), onFinish:()=>busy.push(false),
  })
  const first=loader.run(1), second=loader.run(2)
  assert.equal(signals[0].aborted,true)
  old.resolve('old messages'); await first
  assert.deepEqual(shown,[])
  assert.equal(busy.at(-1),true)
  next.resolve('selected messages'); await second
  assert.deepEqual(shown,['selected messages'])
  assert.equal(busy.at(-1),false)
})

test('leaving cancels a pending read, unlocks once and ignores late failure', {timeout:1000}, async () => {
  const gate=deferred(); let signal, finished=0, errors=0
  const loader=createLatestRequest({load:options=>{signal=options.signal; return gate.promise},
    onFinish:()=>finished++,onError:()=>errors++})
  const pending=loader.run()
  assert.equal(loader.cancel(),true)
  assert.equal(loader.cancel(),false)
  assert.equal(signal.aborted,true)
  gate.reject(new Error('late old failure')); await pending
  assert.equal(finished,1)
  assert.equal(errors,0)
})

test('returning starts a fresh read even while the cancelled request has not settled', {timeout:1000}, async () => {
  const old=deferred(), next=deferred(); let calls=0
  const shown=[]
  const loader=createLatestRequest({load:()=>++calls===1?old.promise:next.promise,onSuccess:value=>shown.push(value)})
  const first=loader.run(); loader.cancel(); const second=loader.run()
  next.resolve('fresh'); await second
  old.resolve('stale'); await first
  assert.deepEqual(shown,['fresh'])
})

test('unmount prevents late updates and further reads', {timeout:1000}, async () => {
  const gate=deferred(); let calls=0, mutations=0, signal
  const loader=createLatestRequest({load:options=>{calls++; signal=options.signal; return gate.promise},
    onSuccess:()=>mutations++,onError:()=>mutations++,onFinish:()=>mutations++})
  const pending=loader.run(); loader.dispose()
  gate.resolve('private'); await pending; await loader.run()
  assert.equal(signal.aborted,true)
  assert.equal(calls,1)
  assert.equal(mutations,0)
})

test('completed read remains current for scheduled layout work only until navigation or replacement', {timeout:1000}, async () => {
  let ticket
  const loader=createLatestRequest({load:async()=>[],onSuccess:(_result,request)=>{ticket=request}})
  await loader.run()
  assert.equal(ticket.isCurrent(),true)
  assert.equal(loader.cancel(),false)
  assert.equal(ticket.isCurrent(),false)
})

test('a real read failure reports once and permits retry', {timeout:1000}, async () => {
  let calls=0, errors=0, finished=0
  const shown=[]
  const loader=createLatestRequest({load:async()=>{if(++calls===1)throw new Error('offline'); return []},
    onError:()=>errors++,onFinish:()=>finished++,onSuccess:result=>shown.push(result)})
  await loader.run(); await loader.run()
  assert.equal(errors,1)
  assert.equal(finished,2)
  assert.deepEqual(shown,[[]])
})

test('local creation or deletion invalidates an older conversation list snapshot', {timeout:1000}, async () => {
  for (const local of [[{id:2},{id:1}], []]) {
    const gate=deferred()
    let list
    const loader=createLatestRequest({load:()=>gate.promise,onSuccess:value=>{list=value}})
    const pending=loader.run()
    loader.cancel()
    list=local
    gate.resolve([{id:1}]); await pending
    assert.deepEqual(list,local)
  }
})
