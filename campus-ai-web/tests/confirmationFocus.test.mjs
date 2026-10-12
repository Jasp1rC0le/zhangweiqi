import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { captureConfirmationFocus } from '../src/utils/confirmationFocus.js'

function fixture() {
  const document = { body: {}, documentElement: {}, activeElement: null }
  const state = { allowed: true, disabled: false, hidden: false, rects: [{}], style: {}, calls: [] }
  document.defaultView = { getComputedStyle: () => state.style }
  const target = {
    ownerDocument: document,
    isConnected: true,
    matches: () => state.disabled,
    closest: () => state.hidden,
    getClientRects: () => state.rects,
    focus: (options) => {
      state.calls.push(options)
      document.activeElement = target
    },
  }
  document.activeElement = target
  const restore = captureConfirmationFocus(document, () => state.allowed)
  document.activeElement = document.body
  return { document, target, state, restore }
}

test('dismiss restores the original trigger without scrolling', { timeout: 1000 }, () => {
  const f = fixture()
  assert.equal(f.restore(), true)
  assert.equal(f.document.activeElement, f.target)
  assert.deepEqual(f.state.calls, [{ preventScroll: true }])
  assert.equal(f.restore(), false)
  assert.equal(f.state.calls.length, 1)
})
test(
  'capture survives temporary disable and waits for the enabled render',
  { timeout: 1000 },
  () => {
    const f = fixture()
    f.state.disabled = true
    f.state.disabled = false
    assert.equal(f.restore(), true)
  },
)
test(
  'old account, draft generation and unmounted scopes cannot restore focus',
  { timeout: 1000 },
  () => {
    const f = fixture()
    f.state.allowed = false
    assert.equal(f.restore(), false)
    f.state.allowed = true
    assert.equal(f.restore(), false)
    assert.equal(f.state.calls.length, 0)
  },
)
test('removed or foreign-document triggers never receive focus', { timeout: 1000 }, () => {
  for (const update of [
    (f) => {
      f.target.isConnected = false
    },
    (f) => {
      f.target.ownerDocument = {}
    },
  ]) {
    const f = fixture()
    update(f)
    assert.equal(f.restore(), false)
  }
})
test('disabled fieldset controls remain unfocused', { timeout: 1000 }, () => {
  const f = fixture()
  f.state.disabled = true
  assert.equal(f.restore(), false)
})
test('hidden, inert or confirmation-dialog descendants are not restored', { timeout: 1000 }, () => {
  const f = fixture()
  f.state.hidden = true
  assert.equal(f.restore(), false)
})
test('non-rendered and invisible controls are not restored', { timeout: 1000 }, () => {
  for (const update of [
    (f) => {
      f.state.rects = []
    },
    (f) => {
      f.state.style.visibility = 'hidden'
    },
    (f) => {
      f.state.style.visibility = 'collapse'
    },
    (f) => {
      f.state.style.display = 'none'
    },
  ]) {
    const f = fixture()
    update(f)
    assert.equal(f.restore(), false)
  }
})
test('another deliberate focus or new dialog takes priority', { timeout: 1000 }, () => {
  const f = fixture()
  const other = {}
  f.document.activeElement = other
  assert.equal(f.restore(), false)
  assert.equal(f.document.activeElement, other)
})
test(
  'own released dialog may relinquish stranded focus to its original trigger',
  { timeout: 1000 },
  () => {
    const f = fixture(),
      oldButton = {},
      released = { contains: (node) => node === oldButton }
    f.document.activeElement = f.target
    const restore = captureConfirmationFocus(
      f.document,
      () => true,
      () => released,
    )
    f.document.activeElement = oldButton
    assert.equal(restore(), true)
    assert.equal(f.document.activeElement, f.target)
  },
)
test(
  'released dialog cannot authorize stealing a different dialog or user focus',
  { timeout: 1000 },
  () => {
    const f = fixture(),
      oldButton = {},
      newButton = {},
      released = { contains: (node) => node === oldButton }
    f.document.activeElement = f.target
    const restore = captureConfirmationFocus(
      f.document,
      () => true,
      () => released,
    )
    f.document.activeElement = newButton
    assert.equal(restore(), false)
    assert.equal(f.document.activeElement, newButton)
  },
)
test('already restored trigger is safe and focus failure is reported', { timeout: 1000 }, () => {
  const f = fixture()
  f.document.activeElement = f.target
  assert.equal(f.restore(), true)
  const g = fixture()
  g.target.focus = () => {}
  assert.equal(g.restore(), false)
})
test('missing document and body focus never invent a target', { timeout: 1000 }, () => {
  assert.equal(captureConfirmationFocus(undefined)(), false)
  const f = fixture()
  f.document.activeElement = f.document.body
  assert.equal(captureConfirmationFocus(f.document)(), false)
  f.document.activeElement = f.document.documentElement
  assert.equal(captureConfirmationFocus(f.document)(), false)
})
test(
  'focus capture precedes locking and only dismissal restores after Vue render',
  { timeout: 1000 },
  () => {
    const source = readFileSync(
      new URL('../src/utils/useScopedConfirmation.js', import.meta.url),
      'utf8',
    )
    assert.ok(
      source.indexOf('const restore = captureConfirmationFocus') < source.indexOf('await decide('),
    )
    assert.match(source, /if \(!accepted\)\s*\{[\s\S]*await nextTick\(\)\s+restore\(\)/)
    assert.match(source, /active\(\) && owner === scope\(\)/)
    assert.doesNotMatch(source, /setTimeout|localStorage|sessionStorage/)
  },
)
