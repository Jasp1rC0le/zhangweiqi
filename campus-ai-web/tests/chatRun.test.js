import test from 'node:test'
import assert from 'node:assert/strict'
import { createChatRun } from '../src/utils/chatRun.js'

test('leaving a view invalidates callbacks and aborts its request', () => {
  const runs = createChatRun(), run = runs.start({content:'draft'})
  assert.equal(run.isCurrent(), true)
  assert.equal(runs.cancel().content, 'draft')
  assert.equal(run.signal.aborted, true)
  assert.equal(run.isCurrent(), false)
  assert.equal(runs.cancel(), null)
})

test('late cleanup from an old answer cannot finish a newer run', () => {
  const runs = createChatRun(), old = runs.start(), next = runs.start()
  assert.equal(old.signal.aborted, true)
  old.finish()
  assert.equal(next.isCurrent(), true)
  next.finish()
  assert.equal(next.isCurrent(), false)
  assert.equal(next.signal.aborted, false)
})
