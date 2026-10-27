import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse, compileTemplate } from '@vue/compiler-sfc'
import { parse as parseJavaScript } from '@babel/parser'
import postcss from 'postcss'

const view = readFileSync(new URL('../src/views/LoginView.vue', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles/landing-apple.css', import.meta.url), 'utf8')
const motion = readFileSync(new URL('../src/styles/landing-polish.css', import.meta.url), 'utf8')
const descriptor = parse(view).descriptor
const ast = parseJavaScript(descriptor.scriptSetup.content, { sourceType: 'module' })
const rules = postcss.parse(css)

function actualFunction(name, context) {
  const node = ast.program.body.find(item => item.type === 'FunctionDeclaration' && item.id.name === name)
  assert.ok(node)
  return vm.runInNewContext(`(${descriptor.scriptSetup.content.slice(node.start, node.end)})`, context)
}

test('public landing remains a valid Vue template with isolated Apple root', () => {
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'LoginView.vue', id: 'landing' }).errors, [])
  assert.match(descriptor.template.content, /class="landing apple-home"/)
  assert.match(descriptor.scriptSetup.content, /import '@\/styles\/landing-apple\.css'/)
})

test('new presentation rules cannot target dialogs, workspace, account or administrator UI', () => {
  rules.walkRules(rule => {
    if (rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') { assert.equal(rule.parent.params, 'home-demo-step'); return }
    for (const selector of rule.selectors) assert.match(selector, /^html:root body \.(?:landing\.)?apple-home(?:[\s.:]|$)/)
  })
  assert.doesNotMatch(css, /\.auth-dialog|\.campus-overlay|\.workspace(?![-\w])|\.admin-page|\.pro-suite|@import/)
})

test('actual model-entry handler preserves mode selection and normal sign-in entry', () => {
  for (const key of ['standard', 'kimi', 'glm']) {
    const entryMode = { value: 'standard' }
    const calls = []
    const event = { currentTarget: {} }
    actualFunction('openWorkspace', { entryMode, openLogin: (...args) => calls.push(args) })(key, event)
    assert.equal(entryMode.value, key)
    assert.deepEqual(calls, [['login', event]])
  }
})

test('actual close handler still rejects closing a pending authentication write', () => {
  for (const busy of [true, false]) {
    const loginVisible = { value: true }
    const close = actualFunction('closeLogin', { loading: { value: busy }, registerLoading: { value: false }, loginVisible })
    close()
    assert.equal(loginVisible.value, busy)
  }
})

test('example modes remain interactive and non-live explanations stay accessible', () => {
  assert.match(view, /role="group" aria-label="选择使用示例"/)
  assert.match(view, /:aria-pressed="entryMode === item.key" @click="selectExample\(item.key\)"/)
  assert.doesNotMatch(view, /select v-model="entryMode"/)
  assert.match(view, /使用示例 · 非实时回答/)
  assert.match(view, /:aria-live="demoPlaying \? 'off' : 'polite'" aria-atomic="true"/)
  for (const route of ['/study', '/projects', '/wall', '/canteens']) assert.ok(view.includes(route))
})

test('existing intro, live orb, chapter tracking and dialog transition remain in source', () => {
  for (const name of ['preparePage', 'goToPage', 'measureChapters', 'finishLoginClose']) assert.ok(ast.program.body.some(node => node.type === 'FunctionDeclaration' && node.id.name === name))
  assert.match(view, /<Transition name="intro">/)
  assert.match(view, /<Transition name="campus-modal" :duration="modalDuration"/)
  assert.match(motion, /animation:auth-orb-current 16s linear infinite/)
  assert.match(motion, /\.landing\.motion-paused \.intelligence-orb::before/)
  assert.doesNotMatch(css, /intelligence-orb::before/)
})

test('mobile layout keeps actions usable without a nested split demonstration', () => {
  assert.match(css, /@media \(max-width: 760px\)/)
  assert.match(css, /\.hero \{ grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(css, /\.hero-example-modes button \{[^}]*min-height: 44px/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.doesNotMatch(css, /transition:\s*all/)
})

test('user-identified centered reference keeps the orb intact and avoids a chat canvas', () => {
  const home = descriptor.template.content.split('<Teleport to="body">')[0]
  assert.doesNotMatch(home, /hero-demo-top|hero-demo-more|hero-entry-tools|hero-demo-question/)
  assert.match(home, /name="hero-example"/)
  assert.match(css, /\.hero-visual \{[\s\S]*?overflow: visible/)
  assert.match(view, /aria-label="介绍页面"/); assert.match(css, /\.page-index button \{[^}]*background: transparent/)
})

test('public scroll cues reuse SVG icons and the closing omits decorative eyebrows', () => {
  const home = descriptor.template.content.split('<Teleport to="body">')[0]
  assert.doesNotMatch(home, /↓/)
  assert.match(home, /class="explore-cue-arrow"[^>]*><ArrowRight/)
  assert.match(css, /\.closing::before \{ display: none; \}/)
  assert.match(descriptor.template.content.split('<Teleport to="body">')[1], /A little clarity\. Every day\./)
})

test('public text palette has sufficient contrast on the selected light ground', () => {
  const values = Object.fromEntries([...css.matchAll(/--(home-[\w-]+):\s*(#[\da-f]{6});/g)].map(match => [match[1], match[2]]))
  const luminance = hex => {
    const channels = hex.slice(1).match(/../g).map(part => Number.parseInt(part, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
  }
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
  for (const text of ['home-ink', 'home-muted', 'home-accent-hover']) assert.ok(contrast(values[text], values['home-paper']) >= 4.5)
  assert.ok(contrast(values['home-surface'], values['home-accent']) >= 4.5)
})

// A short last chapter can never reach the usual35% trigger at maximum scroll.
test('actual chapter tracker activates the visible last chapter at the real bottom, and restores earlier chapters on scroll-up', () => {
  const pages = [{id:'top'},{id:'experience'},{id:'canteen'},{id:'closing'}]
  const activePage = {value:-1}
  const scroller = {scrollTop:2261,scrollHeight:3277,clientHeight:1016}
  const tops = {top:-2261,experience:-1393,canteen:-362.5,closing:356.6875}
  const context = {pages,activePage,pageScrollFrame:null,innerHeight:1016,requestAnimationFrame:fn=>{fn();return 1},document:{scrollingElement:scroller,documentElement:scroller,getElementById:id=>({getBoundingClientRect:()=>({top:tops[id.replace('chapter-','')]})})}}
  actualFunction('trackChapter',context)()
  assert.equal(activePage.value,3)
  context.pageScrollFrame=null;scroller.clientHeight=1185;scroller.scrollTop=2092;tops.closing=525.6875
  actualFunction('trackChapter',context)()
  assert.equal(activePage.value,3)
  context.pageScrollFrame=null;scroller.scrollTop=1800;tops.top=-1800;tops.experience=-932;tops.canteen=98.5;tops.closing=817.6875
  actualFunction('trackChapter',context)()
  assert.equal(activePage.value,2)
})
