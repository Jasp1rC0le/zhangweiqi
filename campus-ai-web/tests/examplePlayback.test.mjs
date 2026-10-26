import test from 'node:test'
import assert from 'node:assert/strict'
import { createExamplePlayback } from '../src/utils/examplePlayback.js'
function fixture() {
  let id = 0, allowed = true, advances = 0
  const tasks = new Map(), changes = [], delays = []
  const player = createExamplePlayback({ onStep: () => advances++, onPlayingChange: state => changes.push(state), canPlay: () => allowed,
    schedule: (fn, ms) => { delays.push(ms); tasks.set(++id, fn); return id }, cancel: key => tasks.delete(key) })
  return { player, tasks, changes, delays, get advances() { return advances }, set allowed(value) { allowed = value }, tick() { const [key, fn] = tasks.entries().next().value; tasks.delete(key); fn() } }
}
test('preview is opt-in and stops after exactly one three-step cycle', () => {
  const s = fixture(); assert.equal(s.tasks.size, 0); assert.equal(s.player.playing, false)
  s.player.start(); for (let n = 0; n < 3; n++) s.tick()
  assert.equal(s.advances, 3); assert.equal(s.tasks.size, 0); assert.equal(s.player.playing, false)
  assert.deepEqual(s.changes, [true, false]); assert.deepEqual(s.delays, [4500,4500,4500])
})
test('hidden or motion-restricted preview cannot start or advance', () => {
  const s = fixture(); s.allowed = false; assert.equal(s.player.start(), false); assert.equal(s.tasks.size, 0)
  s.allowed = true; s.player.start(); s.allowed = false; s.tick()
  assert.equal(s.advances, 0); assert.equal(s.player.playing, false); assert.equal(s.tasks.size, 0)
})
test('manual selection or unmount can stop idempotently without a late advance', () => {
  const s = fixture(); s.player.start(); const late = [...s.tasks.values()][0]
  s.player.stop(); s.player.stop(); late()
  assert.equal(s.advances, 0); assert.equal(s.tasks.size, 0); assert.deepEqual(s.changes, [true,false])
})
test('rapid restart invalidates the old callback and owns only one timer', () => {
  const s = fixture(); s.player.toggle(); const old = [...s.tasks.values()][0]
  s.player.toggle(); s.player.toggle(); old()
  assert.equal(s.advances, 0); assert.equal(s.tasks.size, 1); s.tick(); assert.equal(s.advances, 1)
  s.player.stop()
})
