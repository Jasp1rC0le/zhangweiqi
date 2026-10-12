import test from 'node:test'
import assert from 'node:assert/strict'
import { scanKnowledgeDocuments } from '../src/api/knowledgeScan.js'

const rows = count => Array.from({length:count}, (_, i) => ({id:count-i}))
test('loads all records beyond 100 without duplicate IDs', async () => {
  const source = rows(237), cursors = []
  const result = await scanKnowledgeDocuments(async before => {
    cursors.push(before)
    return source.filter(row => before === undefined || row.id < before).slice(0,100)
  })
  assert.equal(result.length, 237)
  assert.equal(new Set(result.map(row=>row.id)).size, 237)
  assert.deepEqual(cursors, [undefined,138,38])
})
test('checks next page after an exact page boundary', async () => {
  let calls=0
  assert.equal((await scanKnowledgeDocuments(async () => ++calls===1?rows(100):[])).length,100)
  assert.equal(calls,2)
})
test('empty inventory is valid', async () => assert.deepEqual(await scanKnowledgeDocuments(async()=>[]),[]))
test('rejects repeated cursor, malformed and oversized pages', async () => {
  for (const page of [[{id:2},{id:2}], [{id:-1}], [{id:'1'}], {}, rows(101)]) {
    await assert.rejects(scanKnowledgeDocuments(async()=>page), /分页/)
  }
})
test('second-page failure never returns partial results', async () => {
  let calls=0
  await assert.rejects(scanKnowledgeDocuments(async()=> {
    if (++calls===1) return rows(200).slice(0,100)
    throw new Error('network failed')
  }), /network failed/)
})
test('bounded timeout also stops a non-cooperative fetch', async () => {
  let pageSignal
  await assert.rejects(scanKnowledgeDocuments(async (_,signal)=> {
    pageSignal=signal
    return new Promise(()=>{})
  }, {timeoutMs:10}), /超时/)
  assert.equal(pageSignal.aborted,true)
})
test('honors caller abort before fetching', async () => {
  const controller=new AbortController(); controller.abort(new Error('cancelled'))
  await assert.rejects(scanKnowledgeDocuments(async()=>assert.fail('must not fetch'),{signal:controller.signal}),/cancelled/)
})
test('enforces a total page cap with an explicit failure', async () => {
  await assert.rejects(scanKnowledgeDocuments(async()=>rows(100),{maxPages:1}),/上限/)
})
