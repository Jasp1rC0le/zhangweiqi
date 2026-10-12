import test from 'node:test'
import assert from 'node:assert/strict'
import { createLeaveGuard } from '../src/utils/leaveGuard.js'

test('clean navigation does not ask and active saves cannot leave', async () => {
  let busy = false, calls = 0
  const leave = createLeaveGuard(() => false, () => busy, () => { calls++; return true })
  assert.equal(await leave(), true)
  busy = true
  assert.equal(await leave(), false)
  assert.equal(calls, 0)
})
test('cancel or dismissed dialog retains input and can be asked again', async () => {
  let calls = 0
  const leave = createLeaveGuard(() => true, () => false, () => {
    if (++calls === 1) throw new Error('cancel')
    return true
  })
  assert.equal(await leave(), false)
  assert.equal(await leave(), true)
  assert.equal(calls, 2)
})
test('concurrent navigation requests share one visible confirmation', async () => {
  let calls = 0, decide
  const leave = createLeaveGuard(() => true, () => false, () => {
    calls++
    return new Promise(resolve => { decide = resolve })
  })
  const first = leave(), second = leave()
  await Promise.resolve()
  assert.equal(calls, 1)
  decide(true)
  assert.deepEqual(await Promise.all([first, second]), [true, true])
})
test('a save starting during confirmation prevents leaving', async () => {
  let busy = false, decide
  const leave = createLeaveGuard(() => true, () => busy, () => new Promise(resolve => { decide = resolve }))
  const pending = leave()
  await Promise.resolve()
  busy = true
  decide(true)
  assert.equal(await pending, false)
})
test('only an explicit true decision allows discarding unsaved input', async () => {
  for (const answer of [false, undefined, null, 'confirm']) {
    assert.equal(await createLeaveGuard(() => true, () => false, () => answer)(), false)
  }
})
