import test from 'node:test'
import assert from 'node:assert/strict'
import { startAttachmentImport } from '../src/utils/attachmentImport.js'

test('worker internal messages cannot complete an attachment import', async () => {
  const previous = globalThis.Worker
  let worker
  globalThis.Worker = class {
    constructor() { worker = this }
    postMessage() {}
    terminate() { this.terminated = true }
  }
  try {
    const task = startAttachmentImport({name:'test.pdf',size:20,arrayBuffer:async()=>new ArrayBuffer(20)},'brief')
    worker.onmessage({data:{action:'ready'}})
    assert.equal(worker.terminated,undefined)
    const result = {choices:[{text:'verified text'}]}
    worker.onmessage({data:{type:'campthink-attachment-result',result}})
    assert.deepEqual(await task.promise,result)
    assert.equal(worker.terminated,true)
  } finally { globalThis.Worker = previous }
})

test('cancelling terminates the worker and malformed results fail explicitly', async () => {
  const previous = globalThis.Worker
  let worker
  globalThis.Worker = class {
    constructor() { worker = this }
    postMessage() {}
    terminate() { this.terminated = true }
  }
  try {
    const file = {name:'test.pdf',size:20,arrayBuffer:async()=>new ArrayBuffer(20)}
    const task = startAttachmentImport(file,'brief')
    task.cancel()
    await assert.rejects(task.promise,/已取消/)
    assert.equal(worker.terminated,true)
    const invalid = startAttachmentImport(file,'brief')
    worker.onmessage({data:{type:'campthink-attachment-result'}})
    await assert.rejects(invalid.promise,/未能提取/)
  } finally { globalThis.Worker = previous }
})
