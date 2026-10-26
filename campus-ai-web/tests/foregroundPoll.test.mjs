import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createForegroundPoll } from '../src/utils/foregroundPoll.js'
const options = { timeout: 3000 }
function fixture(run = async () => {}, random = () => 0.5) {
  const queued = new Map(), delays = [], canceled = []
  let next = 0, visible = true
  const poll = createForegroundPoll({ interval: 60000, run, random, visible: () => visible, schedule: (callback, delay) => { delays.push(delay); queued.set(++next, callback); return next }, cancel: id => { canceled.push(id); queued.delete(id) } })
  return { poll, queued, delays, canceled, hide: () => { visible = false }, show: () => { visible = true }, tick: async () => { const [id, callback] = queued.entries().next().value; queued.delete(id); await callback() } }
}
test('poll cycles are jittered, serial and canceled on disposal without an immediate duplicate read', options, async () => {
  let calls = 0, index = 0; const samples = [0, 1, 0.5]
  const f = fixture(async () => { calls++ }, () => samples[index++ % samples.length]); f.poll.start(); f.poll.start()
  assert.deepEqual(f.delays, [48000]); assert.equal(calls, 0); await f.tick(); assert.equal(calls, 1); assert.equal(f.delays[1], 72000)
  f.poll.stop(); assert.equal(f.queued.size, 0)
})
test('hidden pages make no requests; a slow request cannot overlap and stops without restarting its timer', options, async () => {
  let calls = 0, release; const f = fixture(() => { calls++; return new Promise(r => { release = r }) }); f.poll.start(); f.hide(); await f.tick(); assert.equal(calls, 0)
  f.show(); const pending = f.tick(); assert.equal(calls, 1); assert.equal(f.queued.size, 0); f.poll.stop(); release(); await pending; assert.equal(f.queued.size, 0)
})
test('old callbacks cannot revive a replaced timer generation, failure can schedule a later retry', options, async () => {
  let calls = 0; const f = fixture(async () => { calls++ }); f.poll.start(); const old = [...f.queued.values()][0]; f.poll.stop(); f.poll.start(); await old(); assert.equal(calls, 0); assert.equal(f.queued.size, 1)
  let error = ''; const callbacks = []; const poll = createForegroundPoll({ interval: 1000, run: async () => { throw new Error('合成错误') }, visible: () => true, schedule: fn => { callbacks.push(fn); return callbacks.length }, cancel: () => {}, onError: e => { error = e.message } }); poll.start(); await callbacks[0](); assert.equal(error, '合成错误'); assert.equal(callbacks.length, 2); poll.stop()
})
test('ten thousand simultaneous page visits spread the first poll across a bounded time window', options, () => {
  const bins = new Map()
  for (let i = 0; i < 10000; i++) createForegroundPoll({ interval: 60000, random: () => i / 9999, visible: () => true, run: async () => {}, schedule: (_, delay) => { const second = Math.floor(delay / 1000); bins.set(second, (bins.get(second) || 0) + 1); return i }, cancel: () => {} }).start()
  assert.equal([...bins.values()].reduce((a,b) => a+b), 10000); assert.ok(bins.size >= 24); assert.ok(Math.max(...bins.values()) < 420)
})
test('both real calendar surfaces use the shared foreground poll and release it on unmount', options, () => {
  for (const path of ['components/UnifiedWeekCalendar.vue', 'views/TeachingView.vue']) {
    const source = fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8'); assert.match(source, /createForegroundPoll/); assert.match(source, /timer\?\.stop\(\)/); assert.doesNotMatch(source, /setInterval\(/)
  }
  assert.throws(() => createForegroundPoll({ interval: 0, run: async () => {} }))
})
