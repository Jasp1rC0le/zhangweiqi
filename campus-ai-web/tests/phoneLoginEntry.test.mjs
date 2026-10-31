import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import postcss from 'postcss'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse } from '@babel/parser'

test('the phone curtain exists only during entry and never owns form layout', () => {
  const css = postcss.parse(readFileSync(new URL('../src/styles/auth-fullscreen.css', import.meta.url), 'utf8'))
  let initial = false, running = false, reduced = false, defaultHidden = false
  css.walkRules(rule => {
    if (!rule.selector.includes('.auth-entry-curtain')) return
    const values = Object.fromEntries(rule.nodes.filter(x => x.type === 'decl').map(x => [x.prop, x.value]))
    let parent = rule.parent, phone = false, reduce = false
    while (parent) {
      if (parent.type === 'atrule' && parent.name === 'media') {
        phone ||= parent.params.includes('max-width: 760px')
        reduce ||= parent.params.includes('prefers-reduced-motion: reduce')
      }
      parent = parent.parent
    }
    if (rule.selector === '.auth-entry-curtain') defaultHidden = values.display === 'none'
    if (rule.selector.includes('campus-modal-enter-from')) {
      initial ||= values.transform === 'translate3d(0,0,0)'
      assert.ok(phone)
    }
    if (values.display === 'block') {
      running = values.position === 'absolute' && values.transform === 'translate3d(0,-100%,0)'
      assert.ok(phone)
      assert.ok(rule.selector.includes('campus-modal-enter-active'))
    }
    if (reduce && values.display === 'none') reduced = true
  })
  assert.ok(initial && running && reduced && defaultHidden)
})

test('phone login pauses hidden introduction measurement but desktop still measures its content', () => {
  const source = readFileSync(new URL('../src/views/LoginView.vue', import.meta.url), 'utf8')
  const script = parseSfc(source).descriptor.scriptSetup.content
  const node = parse(script, { sourceType: 'module' }).program.body.find(x => x.type === 'FunctionDeclaration' && x.id.name === 'measureChapters')
  let measurements = 0
  const context = { disposed: false, mobileAuth: { value: true }, loginPresent: { value: true },
    tallPages: { value: [] }, innerHeight: 800, trackChapter() {},
    document: { querySelectorAll: () => { measurements++; return [{ offsetHeight: 1000, id: 'test' }] } } }
  const measure = vm.runInNewContext(script.slice(node.start,node.end) + '\nmeasureChapters', context)
  measure(); assert.equal(measurements, 0)
  context.mobileAuth.value = false
  measure(); assert.equal(measurements, 1)
})
