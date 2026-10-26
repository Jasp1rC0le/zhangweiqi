import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse, compileScript, compileTemplate} from '@vue/compiler-sfc'
import postcss from 'postcss'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('task refinement styles cannot escape authenticated workspace boundaries', () => {
  const css = read('src/styles/workspace-refinement.css')
  const sheet = postcss.parse(css)
  sheet.walkRules(rule => {
    for (const selector of rule.selectors) {
      assert.match(selector, /^html:root body \.workspace\.(calm-workspace|chat-focused)\s/)
    }
  })
  assert.doesNotMatch(css, /!important|transition:\s*all|backdrop-filter|gradient\(/)
  assert.match(css, /\.teaching-heading\s*\{\s*grid-template-columns: minmax\(0, 1fr\) auto;/)
  assert.match(css, /\.timetable-actions\s*\{\s*display: grid;/)
})

test('public refinement only reaches recovery, connection and privacy, never auth or Pro', () => {
  const css = read('src/styles/public-refinement.css')
  const allowed = new Set(['.action-page', '.connection-page', '.privacy-page'])
  postcss.parse(css).walkRules(rule => {
    for (const selector of rule.selectors) {
      const scope = selector.match(/^html:root body (?::is\(([^)]+)\)|(\.[\w-]+))/)
      assert.ok(scope, selector)
      for (const root of (scope[1] || scope[2]).split(',').map(value => value.trim())) {
        assert.ok(allowed.has(root), selector)
      }
    }
  })
  assert.doesNotMatch(css, /\.landing|\.auth-|\.pro-|!important|gradient\(/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /\.action-page input[\s\S]*?font: inherit/)
})

test('learning layout retains all four fields, consent and existing explicit submission', () => {
  const source = read('src/views/StudyView.vue')
  for (const field of ['course', 'task', 'blocker', 'attempt']) {
    assert.equal(source.match(new RegExp(`v-model="form\\.${field}"`, 'g')).length, 1)
  }
  assert.match(source, /class="study-fields"/)
  assert.match(source, /class="study-brief"/)
  assert.match(source, /class="study-reflection"/)
  assert.match(source, /v-model="consent" type="checkbox" required/)
  assert.match(source, /@submit.prevent="help"/)
  assert.match(source, /if\(!consent\.value\)throw new Error/)
  assert.match(source, /<fieldset :disabled="busy \|\| saving">/)
})

test('timetable action grouping retains role checks, disabled guards and destinations', () => {
  const source = read('src/views/TimetableView.vue')
  const start = source.indexOf('<div class="timetable-actions"')
  const actions = source.slice(start, source.indexOf('</div>', start))
  assert.match(actions, /aria-label="课表操作"/)
  assert.equal((actions.match(/@click=/g) || []).length, 3)
  assert.equal((actions.match(/!\['COUNSELOR','SECRETARY'\]\.includes\(scope\)/g) || []).length, 2)
  assert.match(actions, /:disabled="importPanel\?\.dirty\|\|importPanel\?\.unavailable"/)
  assert.match(actions, /@click="openOperations"/)
  assert.match(actions, /@click="openCalendarExport"/)
  assert.match(actions, /:disabled="!calendarExportContext"/)
  assert.match(source, /scheduleExportPanel.value\?\.open\(calendarExportContext.value\)/)
})

test('production and isolated review load public polish, and workspace polish follows Apple', () => {
  assert.match(read('src/main.js'), /import '\.\/styles\/public-refinement\.css'/)
  assert.match(read('design/review.js'), /import '\.\.\/src\/styles\/public-refinement\.css'/)
  const chat = read('src/views/ChatView.vue')
  assert.ok(chat.indexOf("import '@/styles/workspace-refinement.css'") > chat.indexOf("import '@/styles/apple-workspace.css'"))
})

test('changed Vue templates compile without altering their binding contracts', () => {
  for (const path of ['src/views/StudyView.vue', 'src/views/FeedbackView.vue', 'src/views/TimetableView.vue', 'src/views/AccountActionView.vue', 'src/views/ConnectionIssueView.vue', 'src/views/AdminView.vue', 'src/views/ProjectReviewsView.vue', 'src/components/AiBudgetPanel.vue']) {
    const {descriptor, errors} = parse(read(path), {filename: path})
    assert.deepEqual(errors, [], path)
    const script = compileScript(descriptor, {id: path})
    const template = compileTemplate({source: descriptor.template.content, filename: path, id: path, compilerOptions: {bindingMetadata: script.bindings}})
    assert.deepEqual(template.errors, [], path)
  }
})

test('finish repairs preserve action hierarchy, readable labels and a real invitation link', () => {
  const css = read('src/styles/workspace-refinement.css')
  postcss.parse(css).walkRules(rule => {
    if (rule.nodes.some(node => node.prop === 'background' && node.value === 'var(--assistant-accent)')) {
      assert.ok(!rule.selectors.includes('html:root body .workspace.calm-workspace .admin-page .import-form-actions > button'))
      assert.ok(!rule.selectors.some(selector => selector.trim().endsWith('.import-form-actions > button')))
    }
  })
  assert.match(css, /\.import-form-actions > button\[type='submit'\]/)
  assert.match(css, /\.import-form label > span/)
  assert.match(css, /\.usage-estimate-note/)
  const middle = css.slice(css.indexOf('@media (max-width: 1100px)'), css.indexOf('@media (max-width: 760px)'))
  assert.match(middle, /\.account-content \{ display: block;/)
  assert.match(middle, /\.form-pair \{ grid-template-columns: minmax\(0, 1fr\);/)
  assert.match(css, /\.project-meta \.title-field input \{\s*border: 1px solid var\(--assistant-line\)/)
  const reviews = read('src/views/ProjectReviewsView.vue')
  assert.match(reviews, /class="review-entry-action">打开审阅<ArrowRight aria-hidden="true"/)
  assert.doesNotMatch(read('src/views/AdminView.vue').split('.feedback-card blockquote {')[1].split('}')[0], /border-left/)
})
