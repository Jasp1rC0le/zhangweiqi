import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { homeCourseStatus, courseCheckedDate } from '../src/utils/homeCourseStatus.js'
import { productUpdates } from '../src/utils/productUpdates.js'
import { workspaceTools, primaryNavigation } from '../src/utils/workspaceNavigation.js'

const saved = { semester: '2026秋', courses: [{ teacher: '张老师' }, { teacher: '' }], checkedAt: '2026-10-11T17:09:45Z' }
test('home readiness waits for the current read and does not expose retained facts on failure', () => {
  assert.deepEqual(homeCourseStatus({ loading: true, loaded: true, schedule: saved }), { kind: 'loading' })
  assert.deepEqual(homeCourseStatus({ loaded: true, error: 'offline', schedule: saved }), { kind: 'error' })
  assert.deepEqual(homeCourseStatus({ loaded: false, schedule: saved }), { kind: 'loading' })
})
test('first use and an explicitly confirmed empty timetable remain distinct', () => {
  assert.deepEqual(homeCourseStatus({ loaded: true, schedule: null }), { kind: 'empty' })
  const result = homeCourseStatus({ loaded: true, schedule: { ...saved, courses: [], emptyConfirmed: true } })
  assert.equal(result.kind, 'confirmed-empty')
  assert.equal(result.count, 0)
})
test('home counts saved arrangements and missing names without inventing account binding or lessons', () => {
  assert.deepEqual(homeCourseStatus({ loaded: true, schedule: saved }), { kind: 'saved', count: 2, missingTeachers: 1, semester: '2026秋', checkedAt: saved.checkedAt })
  assert.equal(homeCourseStatus({ loaded: true, schedule: { ...saved, courses: [{ teacher: '  ' }, {}, { teacher: '王老师' }] } }).missingTeachers, 2)
})
test('checked date uses the school timezone and includes the year; invalid time is not fabricated', () => {
  assert.equal(courseCheckedDate(saved.checkedAt), '2026/10/12')
  assert.equal(courseCheckedDate('not-a-date'), '')
})
test('the dated update log is factual, immutable and links only to existing product destinations', () => {
  assert.deepEqual(productUpdates.map(group => group.date), ['2026-10-25', '2026-10-24'])
  assert.ok(Object.isFrozen(productUpdates))
  const allowed = new Set(['/chat', '/timetable', '/canteens', '/projects'])
  for (const group of productUpdates) for (const item of group.items) {
    assert.ok(Object.isFrozen(item) && item.title && item.text && item.action)
    assert.ok(allowed.has(item.route.split('?')[0]))
    assert.doesNotMatch(item.route, /prompt|send|token|username|userId/)
  }
  assert.equal(primaryNavigation.length, 4)
  assert.equal(workspaceTools.find(item => item.label === '产品更新').path, '/account#product-updates')
})
test('home readiness and updates compile with native disclosure, disabled actions and no model or writes', () => {
  for (const name of ['HomeCourseCue', 'ProductUpdates']) {
    const filename = `src/components/${name}.vue`
    const source = readFileSync(new URL('../' + filename, import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source)
    assert.deepEqual(errors, [])
    compileScript(descriptor, { id: filename })
    assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: filename }).errors, [])
    assert.deepEqual(compileStyle({ source: descriptor.styles[0].content, filename, id: filename, scoped: true }).errors, [])
    assert.match(source, /:disabled="disabled"/)
    assert.doesNotMatch(source, /localStorage|http\.(?:post|put|delete)|recognizeCourseImage|askTimetable|setInterval|setTimeout/)
  }
  const cue = readFileSync(new URL('../src/components/HomeCourseCue.vue', import.meta.url), 'utf8')
  assert.match(cue, /course\.principal/)
  assert.match(cue, /course\.load\(true\)/)
  assert.match(cue, /\(\) => props\.active/)
  assert.match(cue, /principal && active/)
  assert.match(cue, /aria-live="polite"/)
  const updates = readFileSync(new URL('../src/components/ProductUpdates.vue', import.meta.url), 'utf8')
  assert.match(updates, /<details/)
  assert.match(updates, /<summary>/)
  assert.doesNotMatch(updates, /<dialog|v-html/)
  assert.match(readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8'), /:active="isChatRoute"/)
})
test('account update arrival keeps the existing identity workflow and routes through guarded navigation', () => {
  const source = readFileSync(new URL('../src/views/AccountView.vue', import.meta.url), 'utf8')
  assert.match(source, /\['#teaching-identity','#product-updates'\]/)
  assert.match(source, /focusWorkflowElement\(target\.value\?\.\$el/)
  assert.match(source, /owner===principal\(\)&&route\.hash===hash/)
  assert.match(source, /await router\.push\(item\.route\)/)
  assert.match(source, /<ProductUpdates id="product-updates"/)
})
