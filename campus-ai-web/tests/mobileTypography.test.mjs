import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { parse } from '@vue/compiler-sfc'
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8')
const query = '(max-width: 760px), (max-height: 500px) and (pointer: coarse)'
function mobileRules(css) {
  const rules = []
  postcss.parse(css).walkAtRules('media', media => { if (media.params === query) media.walkRules(rule => rules.push(rule)) })
  return rules
}
const values = rule => Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(({ prop, value }) => [prop, value]))
test('phone task titles use one scalable Medium role without changing desktop declarations', () => {
  const css = read('src/styles/workspace-refinement.css'), rules = mobileRules(css)
  const title = rules.find(rule => rule.selector.includes('.work-heading h1'))
  assert.ok(title)
  assert.deepEqual(values(title), { 'font-size': '1.5rem', 'font-weight': '500', 'line-height': '1.35', 'letter-spacing': '-0.02em', 'overflow-wrap': 'anywhere' })
  for (const selector of ['.timetable-heading h1', '.teaching-heading h1', '.account-intro h1', '.studio-start h2', '.admin-page > main > header h1']) assert.ok(title.selector.includes(selector))
  assert.match(css.split('@media')[0], /font-size: 34px;[\s\S]*?font-weight: 600;/)
  assert.deepEqual(values(rules.find(rule => rule.selector.endsWith('.cockpit-heading h2'))), { 'font-size': '1.25rem', 'font-weight': '500' })
})
test('all empty chat modes share the phone role while existing body and controls keep their size', () => {
  const { descriptor } = parse(read('src/components/ChatStart.vue'))
  const standard = mobileRules(descriptor.styles[0].content).find(rule => rule.selector.includes('.chat-start-title'))
  const other = mobileRules(read('src/styles/chat-refinement.css')).find(rule => rule.selector.includes('.welcome h1'))
  for (const rule of [standard, other]) {
    assert.equal(values(rule)['font-size'], '1.25rem'); assert.equal(values(rule)['font-weight'], '500')
    assert.equal(values(rule)['line-height'], '1.35')
  }
  assert.match(descriptor.styles[0].content, /min-height: 44px/)
  assert.doesNotMatch(descriptor.scriptSetup.content, /setTimeout|fetch\(|localStorage|requestAnimationFrame/)
  assert.match(descriptor.styles[0].content.split('@media')[0], /font-size: 22px; font-weight: 500;/)
})
test('phone typography is scoped, does not lock text size or add animation and font payloads', () => {
  for (const path of ['src/styles/workspace-refinement.css', 'src/styles/chat-refinement.css']) {
    for (const rule of mobileRules(read(path))) {
      assert.match(rule.selector, /^html:root body \.workspace\.(calm-workspace|chat-focused) /)
      assert.doesNotMatch(rule.selector, /\.landing|\.pro-|\.auth-|\.message-content|textarea/)
      assert.doesNotMatch(rule.toString(), /!important|@font-face|animation:|transition:|text-size-adjust|zoom:|scale\(/)
    }
  }
})
