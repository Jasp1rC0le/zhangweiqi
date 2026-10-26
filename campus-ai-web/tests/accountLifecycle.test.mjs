import test from 'node:test'
import assert from 'node:assert/strict'
import { createAccountLifecycle } from '../src/utils/accountLifecycle.js'

test('account work is current only within its captured owner', () => {
  let owner = '2:1:0'
  const lifecycle = createAccountLifecycle(() => owner), ticket = lifecycle.capture()
  assert.equal(ticket.current(), true)
  owner = '3:1:1'
  assert.equal(ticket.current(), false)
})
test('reset aborts pending work and prevents same-owner ABA reuse', () => {
  const lifecycle = createAccountLifecycle(() => '2:1:0'), old = lifecycle.capture()
  lifecycle.reset()
  assert.equal(old.current(), false); assert.equal(old.signal.aborted, true)
  const next = lifecycle.capture()
  assert.equal(next.current(), true); assert.equal(next.signal.aborted, false)
})
test('unmount invalidates confirmations and effects even when identity stays the same', () => {
  const lifecycle = createAccountLifecycle(() => '2:1:0'), ticket = lifecycle.capture()
  lifecycle.dispose()
  assert.equal(ticket.current(), false); assert.equal(ticket.signal.aborted, true)
  assert.equal(lifecycle.key(), null)
})
test('a lifecycle cannot be revived after disposal', () => {
  const lifecycle = createAccountLifecycle(() => '2:1:0')
  lifecycle.dispose(); lifecycle.reset()
  assert.equal(lifecycle.capture().current(), false); assert.equal(lifecycle.key(), null)
})
test('missing account never receives a live operation ticket', () => {
  const lifecycle = createAccountLifecycle(() => '')
  assert.equal(lifecycle.capture().current(), false)
})
test('late async results are ignored after cancellation', async () => {
  const lifecycle = createAccountLifecycle(() => '2:1:0'), ticket = lifecycle.capture()
  let done, effects = 0
  const pending = new Promise(resolve => { done = resolve }).then(() => { if (ticket.current()) effects++ })
  lifecycle.reset(); done(); await pending
  assert.equal(effects, 0)
})
