import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse } from '@babel/parser'
import { createSelectionIndicator } from '../src/utils/selectionIndicator.js'
import { merchantPhotoShape, rememberMerchantPhotoShape } from '../src/utils/merchantPhotoShape.js'

function indicatorScenario() {
  let selected = { offsetLeft: 116, offsetTop: 4, offsetWidth: 88, offsetHeight: 44 }
  const frames = new Map(), measures = [], scrolls = [], listeners = new Map()
  let next = 0, disconnects = 0
  const container = { querySelector: () => selected, scrollWidth: 480, clientWidth: 240, scrollLeft: 0,
    scrollTo: value => scrolls.push(value) }
  const environment = { requestAnimationFrame: fn => { frames.set(++next, fn); return next }, cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() { disconnects++ } },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    matchMedia: () => ({ matches: false }) }
  const controller = createSelectionIndicator(container, value => measures.push(value), { environment })
  return { controller, container, measures, scrolls, frames, listeners, environment,
    select: value => { selected = value }, flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()) },
    disconnects: () => disconnects }
}
test('selection geometry follows in-flow controls without moving focus or changing selection', () => {
  const s = indicatorScenario(); s.flush()
  assert.deepEqual(s.measures[0], { x: 116, y: 4, width: 88, height: 44 })
  s.select({ offsetLeft: 212, offsetTop: 4, offsetWidth: 104, offsetHeight: 44 })
  s.controller.update(true); s.controller.update(true)
  assert.equal(s.frames.size, 1)
  s.flush()
  assert.deepEqual(s.scrolls, [{ left: 76, behavior: 'smooth' }])
  assert.equal(s.measures.length, 2)
})
test('missing selection hides the marker and restored layout can measure it again', () => {
  const s = indicatorScenario(); s.select(null); s.flush(); assert.equal(s.measures[0], null)
  s.select({ offsetLeft: 0, offsetTop: 60, offsetWidth: 244, offsetHeight: 56 })
  s.listeners.get('resize')(); s.flush(); assert.equal(s.measures[1].y, 60)
})
test('reduced motion keeps selected items visible without animated scrolling', () => {
  const s = indicatorScenario(); s.environment.matchMedia = () => ({ matches: true })
  s.select({ offsetLeft: 300, offsetTop: 4, offsetWidth: 80, offsetHeight: 44 })
  s.controller.update(true); s.flush()
  assert.equal(s.scrolls[0].behavior, 'instant')
})
test('unmount cancels queued geometry reads, observers and listeners', () => {
  const s = indicatorScenario(); const pending = [...s.frames.values()][0]
  s.controller.stop(); pending(); s.controller.update()
  assert.equal(s.frames.size, 0); assert.equal(s.measures.length, 0)
  assert.equal(s.listeners.size, 0); assert.equal(s.disconnects(), 1)
})
test('new menu slots reserve a wide layout and measurements survive route remounts without local storage', () => {
  assert.equal(merchantPhotoShape('/new-menu'), 'wide')
  assert.equal(rememberMerchantPhotoShape('/square-menu', 900, 1000), 'square')
  assert.equal(merchantPhotoShape('/square-menu'), 'square')
  assert.equal(rememberMerchantPhotoShape('/square-menu', 0, 0), null)
  assert.equal(merchantPhotoShape('/square-menu'), 'square')
  assert.equal(rememberMerchantPhotoShape('/square-menu', 1200, 400), 'wide')
  assert.equal(merchantPhotoShape('/square-menu'), 'wide')
})

const script = parseSfc(fs.readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')).descriptor.scriptSetup.content
const ast = parse(script, { sourceType: 'module' })
const routeWatch = ast.program.body.find(n => n.expression?.callee?.name === 'watch'
  && n.expression.arguments[0]?.body?.object?.name === 'route'
  && n.expression.arguments[0]?.body?.property?.name === 'name').expression.arguments[1]
function routeScenario({ phone = true, drawer = true, chat = false } = {}) {
  const effects = [], ticks = []
  const context = { mobileLayout: { value: phone }, mobileSidebarOpen: { value: drawer },
    isChatRoute: { value: chat }, closeChatTools() {}, chatAttachment: { value: { reset() {} } },
    routeReadSequence: 0, disposed: false, cancelAnswer() {}, historyRequests: { cancel: () => false },
    historyNeedsReload: { value: false }, profileMenuOpen: { value: false },
    nextTick: () => new Promise(resolve => ticks.push(resolve)),
    animateContentChange: (...args) => effects.push(args), workspaceScene: { value: 'chat-scene' }, workspaceContent: { value: 'work-content' }, window: {},
    resizeComposer() {}, loadConversationList: async () => {}, activeConversationId: { value: null } }
  const change = vm.runInNewContext(script.slice(routeWatch.start, routeWatch.end), context)
  return { context, effects, change, flush: () => ticks.splice(0).forEach(resolve => resolve()) }
}
test('phone route handoff closes the drawer and bridges into real destination content', async () => {
  for (const chat of [false, true]) {
    const s = routeScenario({ chat }); const done = s.change()
    assert.equal(s.context.mobileSidebarOpen.value, false)
    s.flush(); await done
    assert.equal(s.effects.length, 1)
    assert.equal(s.effects[0][0], chat ? 'chat-scene' : 'work-content')
    assert.equal(s.effects[0][2].delay, 80)
  }
})
test('rapid navigation discards old pending motion, and disposal prevents late effects', async () => {
  const s = routeScenario(); const old = s.change(), current = s.change()
  s.flush(); await Promise.all([old, current]); assert.equal(s.effects.length, 1)
  const later = s.change(); s.context.disposed = true; s.flush(); await later
  assert.equal(s.effects.length, 1)
})
test('desktop routes retain their existing transition and do not run mobile pane effects', async () => {
  const s = routeScenario({ phone: false }); const done = s.change(); s.flush(); await done
  assert.equal(s.effects.length, 0)
})
