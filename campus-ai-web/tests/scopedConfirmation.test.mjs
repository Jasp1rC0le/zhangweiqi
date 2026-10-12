import test from 'node:test'
import assert from 'node:assert/strict'
import { createScopedConfirmation } from '../src/utils/scopedConfirmation.js'

function fixture() {
  let current = '1:1:0',
    alive = true,
    answer,
    calls = 0
  const states = []
  const confirm = createScopedConfirmation({
    scope: () => current,
    active: () => alive,
    pending: (value) => states.push(value),
    ask: () => {
      calls++
      return new Promise((resolve, reject) => {
        answer = { resolve, reject }
      })
    },
  })
  return {
    confirm,
    states,
    scope: (value) => {
      current = value
    },
    unmount: () => {
      alive = false
    },
    reply: (value) => answer.resolve(value),
    cancel: () => answer.reject(new Error('cancel')),
    calls: () => calls,
  }
}

test('only an explicit current-scope confirmation can proceed', { timeout: 2000 }, async () => {
  const f = fixture(),
    task = f.confirm('confirm')
  f.reply(true)
  assert.equal(await task, true)
  assert.deepEqual(f.states, [true, false])
})
test('cancel or dismiss keeps data and permits a later decision', { timeout: 2000 }, async () => {
  const f = fixture(),
    first = f.confirm('cancel')
  f.cancel()
  assert.equal(await first, false)
  const second = f.confirm('retry')
  f.reply(true)
  assert.equal(await second, true)
})
test(
  'account switching while a dialog is open invalidates its answer',
  { timeout: 2000 },
  async () => {
    const f = fixture(),
      task = f.confirm('confirm')
    f.scope('2:1:1')
    f.reply(true)
    assert.equal(await task, false)
  },
)
test(
  'same-account re-login or new draft cannot reuse an earlier answer',
  { timeout: 2000 },
  async () => {
    const f = fixture(),
      task = f.confirm('confirm')
    f.scope('')
    f.scope('1:1:2')
    f.reply(true)
    assert.equal(await task, false)
  },
)
test('unmounted views do not execute a later confirmed action', { timeout: 2000 }, async () => {
  const f = fixture(),
    task = f.confirm('confirm')
  f.unmount()
  f.reply(true)
  assert.equal(await task, false)
})
test('double-click never opens a second or mismatched decision', { timeout: 2000 }, async () => {
  const f = fixture(),
    first = f.confirm('first')
  assert.equal(await f.confirm('second'), false)
  assert.equal(f.calls(), 1)
  f.reply(true)
  assert.equal(await first, true)
})
test(
  'missing scope and non-boolean replies never authorize actions',
  { timeout: 2000 },
  async () => {
    const f = fixture()
    f.scope(null)
    assert.equal(await f.confirm('missing'), false)
    assert.equal(f.calls(), 0)
    f.scope('1:1:3')
    const task = f.confirm('explicit')
    f.reply('confirm')
    assert.equal(await task, false)
  },
)
