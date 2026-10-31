import test from 'node:test'
import assert from 'node:assert/strict'
import { createHoldToTalk } from '../src/utils/holdToTalk.js'

function fixture() {
  let clock = 0, scope = '1:1:session:chat', allowed = true, state = {}, afterSubmit
  const instances = [], sent = [], timers = new Map()
  let sequence = 0
  class Recognition {
    constructor() { this.starts = this.stops = this.aborts = 0; instances.push(this) }
    start() { this.starts++; if (this.throwStart) throw new Error('synthetic start failure') }
    stop() { this.stops++ }
    abort() { this.aborts++ }
  }
  const talk = createHoldToTalk({ engine: () => Recognition, owner: () => allowed ? scope : '',
    update: value => { state = value }, submit: (text, owner) => { sent.push({ text, owner }); afterSubmit?.() },
    now: () => clock, timer: (fn, ms) => { const id = ++sequence; timers.set(id, { fn, ms }); return id }, clear: id => timers.delete(id) })
  const current = () => instances.at(-1)
  const result = (text, final = true) => current().onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: final })] })
  const finish = text => { current().onstart?.(); clock += 500; result(text); talk.release(); current().onend?.() }
  return { talk, instances, current, sent, timers, result, finish, state: () => state,
    time: value => { clock = value }, scope: value => { scope = value }, allowed: value => { allowed = value }, afterSubmit: fn => { afterSubmit = fn } }
}

test('normal completed recognition reuses one ended engine without another abort or automatic start', () => {
  const f = fixture()
  assert.equal(f.instances.length, 0)
  f.talk.start(); f.finish('第一句')
  assert.equal(f.current().aborts, 0)
  assert.equal(f.current().onresult, null)
  assert.equal(f.current().starts, 1)
  assert.equal(f.talk.start(), true); f.finish('第二句')
  assert.equal(f.instances.length, 1)
  assert.equal(f.current().starts, 2)
  assert.equal(f.current().aborts, 0)
  assert.deepEqual(f.sent.map(row => row.text), ['第一句', '第二句'])
  assert.equal(f.timers.size, 0)
  f.talk.dispose()
})

test('release before microphone start completes permission handshake, drops late text and never sends', () => {
  const f = fixture(); f.talk.start(); f.time(800); f.talk.release()
  assert.equal(f.current().stops, 0)
  assert.equal(f.current().aborts, 0)
  f.result('权限框期间的文字'); f.current().onstart(); f.result('迟到定稿'); f.current().onend()
  assert.equal(f.current().stops, 1)
  assert.equal(f.current().aborts, 0)
  assert.equal(f.sent.length, 0)
  assert.equal(f.state().phase, 'idle')
  assert.equal(f.state().text, '')
  assert.equal(f.talk.start(), true); f.finish('重新明确按住后说话')
  assert.equal(f.instances.length, 1)
  assert.deepEqual(f.sent.map(row => row.text), ['重新明确按住后说话'])
  f.talk.dispose()
})

test('visible permission blur interrupt consumes the gesture even if pointerup never arrives', () => {
  const f = fixture(); f.talk.start()
  assert.equal(f.talk.interruptPending(), true)
  assert.equal(f.talk.start(), false)
  f.current().onstart(); f.result('失去按住手势后不得发送'); f.current().onend()
  assert.equal(f.sent.length, 0)
  assert.equal(f.current().starts, 1)
  assert.equal(f.current().stops, 1)
  f.talk.dispose()
})

test('temporary busy keeps only an ended engine; it cannot start while disabled', () => {
  const f = fixture()
  f.afterSubmit(() => { f.allowed(false); f.talk.cancel({ retainEngine: true }) })
  f.talk.start(); f.finish('问题')
  assert.equal(f.talk.start(), false)
  assert.equal(f.current().aborts, 0)
  f.allowed(true); assert.equal(f.talk.start(), true)
  assert.equal(f.instances.length, 1)
  f.talk.cancel({ retainEngine: true })
  assert.equal(f.current().aborts, 1, 'a live run is still aborted when disabled')
  f.talk.dispose()
})

test('real scope changes and explicit cancellation discard the idle engine without carrying text', () => {
  const f = fixture(); f.talk.start(); f.finish('旧范围')
  f.scope('2:1:new-session:chat'); f.talk.cancel()
  assert.equal(f.current().aborts, 1)
  f.talk.start(); assert.equal(f.instances.length, 2)
  assert.equal(f.state().text, '')
  const lateStart = f.current().onstart
  f.talk.dispose(); lateStart()
  assert.notEqual(f.state().phase, 'listening')
  assert.equal(f.sent.length, 1)
})

test('a callback from the previous run cannot append text to a reused engine session', () => {
  const f = fixture(); f.talk.start(); const oldResult = f.current().onresult; f.finish('已发送')
  f.talk.start(); oldResult({ results: [Object.assign([{ transcript: '旧回调' }], { isFinal: true })] })
  assert.equal(f.state().text, '')
  f.finish('新一句'); assert.deepEqual(f.sent.map(row => row.text), ['已发送', '新一句'])
  f.talk.dispose()
})

test('cached engine start failure is reported once without silently constructing or retrying', () => {
  const f = fixture(); f.talk.start(); f.finish('已完成')
  f.current().throwStart = true
  assert.equal(f.talk.start(), false)
  assert.equal(f.instances.length, 1)
  assert.equal(f.current().starts, 2)
  assert.equal(f.state().phase, 'error')
  assert.equal(f.talk.start(), true)
  assert.equal(f.instances.length, 2)
  f.talk.dispose()
})

test('permission wait and finish timers remain bounded and cannot submit on timeout', () => {
  const f = fixture(); f.talk.start()
  assert.equal([...f.timers.values()][0].ms, 60000)
  f.talk.interruptPending(); f.current().onstart()
  const timeout = [...f.timers.values()].find(value => value.ms === 5000)
  assert.ok(timeout); timeout.fn()
  assert.equal(f.sent.length, 0)
  assert.equal(f.state().phase, 'error')
  assert.equal(f.timers.size, 0)
  f.talk.dispose()
})
