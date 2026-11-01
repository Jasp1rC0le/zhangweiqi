import test from 'node:test'
import assert from 'node:assert/strict'
import { captureMerchantPosition } from '../src/utils/merchantPosition.js'

function fixture({ documentScroll = false } = {}) {
  let top = 160, attached = true
  const events = new EventTarget(), controller = new AbortController()
  const scroller = { scrollTop: 900, scrollHeight: 2400, clientHeight: 800, style: { scrollBehavior: 'smooth' }, parentElement: null }
  const card = { dataset: { merchantId: '7' }, parentElement: scroller, getBoundingClientRect: () => ({ top }) }
  const doc = { scrollingElement: scroller, hidden: false }
  const root = { querySelectorAll: () => [card], contains: element => attached && element === card, ownerDocument: doc }
  const host = {
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    getComputedStyle: () => ({ overflowY: documentScroll ? 'visible' : 'auto' }),
  }
  return { root, host, scroller, doc, controller, top: value => { top = value }, detach: () => { attached = false },
    input: type => events.dispatchEvent(new Event(type)), capture: () => captureMerchantPosition(root, 7, host, controller.signal) }
}
test('write completion compensates layout shifts in the actual scrolling panel without smooth scrolling', () => {
  const f = fixture(), position = f.capture()
  f.top(110); position.restore()
  assert.equal(f.scroller.scrollTop, 850)
  assert.equal(f.scroller.style.scrollBehavior, 'smooth')
  f.top(40); position.restore()
  assert.equal(f.scroller.scrollTop, 850)
})
test('document scrolling receives the same correction when no inner scroller exists', () => {
  const f = fixture({ documentScroll: true }), position = f.capture()
  f.top(200); position.restore(); assert.equal(f.scroller.scrollTop, 940)
})
test('the reader keeps control after touching, scrolling or typing while a write is pending', () => {
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    const f = fixture(), position = f.capture()
    f.input(type); f.top(-400); position.restore(); assert.equal(f.scroller.scrollTop, 900, type)
  }
})
test('account abort, removed cards, hidden pages and disposed operations never restore an old position', () => {
  for (const change of [f => f.controller.abort(), f => f.detach(), f => { f.doc.hidden = true }]) {
    const f = fixture(), position = f.capture()
    change(f); f.top(-200); position.restore(); assert.equal(f.scroller.scrollTop, 900)
  }
  const f = fixture(), position = f.capture(); position.dispose(); f.top(10); position.restore()
  assert.equal(f.scroller.scrollTop, 900)
  assert.doesNotThrow(() => captureMerchantPosition(null, 7, f.host).restore())
})
