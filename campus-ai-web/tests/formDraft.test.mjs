import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { captureDraftFields, hasDraftFieldChanges } from '../src/utils/formDraft.js'

const fields = ['semester', 'firstMonday', 'remindDays']
const original = () => ({ semester: '2026 第1学期', firstMonday: '2026-09-07', remindDays: 7 })
const options = { timeout: 1000 }

test('prefilled editor starts clean with no table text', options, () => {
  const form = original(),
    baseline = captureDraftFields(form, fields)
  assert.equal(hasDraftFieldChanges(form, baseline), false)
})
test('semester-only edits count before a course or image is selected', options, () => {
  const form = original(),
    baseline = captureDraftFields(form, fields)
  form.semester = '合成学期 ✨'
  assert.equal(hasDraftFieldChanges(form, baseline), true)
})
test('date-only edits count, including clearing a required date', options, () => {
  const form = original(),
    baseline = captureDraftFields(form, fields)
  form.firstMonday = '2026-09-14'
  assert.equal(hasDraftFieldChanges(form, baseline), true)
  form.firstMonday = ''
  assert.equal(hasDraftFieldChanges(form, baseline), true)
})
test('reminder-only edits count, but equivalent select value types do not', options, () => {
  const form = original(),
    baseline = captureDraftFields(form, fields)
  form.remindDays = '7'
  assert.equal(hasDraftFieldChanges(form, baseline), false)
  form.remindDays = 0
  assert.equal(hasDraftFieldChanges(form, baseline), true)
})
test('returning every field to its original value clears dirty state', options, () => {
  const form = original(),
    baseline = captureDraftFields(form, fields)
  form.semester = '临时'
  form.firstMonday = ''
  form.remindDays = 14
  assert.equal(hasDraftFieldChanges(form, baseline), true)
  Object.assign(form, original())
  assert.equal(hasDraftFieldChanges(form, baseline), false)
})
test('the baseline is a frozen snapshot, not a live source object', options, () => {
  const source = original(),
    form = { ...source },
    baseline = captureDraftFields(source, fields)
  source.firstMonday = '2026-09-14'
  assert.equal(hasDraftFieldChanges(form, baseline), false)
  assert.equal(baseline.firstMonday, '2026-09-07')
  assert.throws(() => {
    baseline.semester = 'late response'
  }, TypeError)
})
test('untracked fields do not leak into the baseline or dirty decision', options, () => {
  const form = { ...original(), privateIdentity: 'not captured' }
  const baseline = captureDraftFields(form, fields)
  assert.deepEqual(Object.keys(baseline), fields)
  form.privateIdentity = 'changed'
  assert.equal(hasDraftFieldChanges(form, baseline), false)
})
test('new editor or account reset establishes its own clean baseline', options, () => {
  const form = original(),
    old = captureDraftFields(form, fields)
  Object.assign(form, { semester: '新学期', firstMonday: '', remindDays: 3 })
  assert.equal(hasDraftFieldChanges(form, old), true)
  const next = captureDraftFields(form, fields)
  assert.equal(hasDraftFieldChanges(form, next), false)
})
test('image draft tracks mode, coverage and date independently of the image', options, () => {
  const keys = ['semester', 'weekMonday', 'startWeek', 'endWeek', 'mode', 'remindDays']
  const form = {
    semester: '合成',
    weekMonday: '2026-10-05',
    startWeek: '',
    endWeek: '',
    mode: 'week',
    remindDays: 7,
  }
  for (const [key, changed] of [
    ['mode', 'range'],
    ['startWeek', '5'],
    ['endWeek', '10'],
    ['weekMonday', '2026-10-12'],
  ]) {
    const baseline = captureDraftFields(form, keys),
      saved = form[key]
    form[key] = changed
    assert.equal(hasDraftFieldChanges(form, baseline), true)
    form[key] = saved
    assert.equal(hasDraftFieldChanges(form, baseline), false)
  }
})
test(
  'course editor wires all fields and resets only on editor/account initialization',
  options,
  () => {
    const source = readFileSync(
      new URL('../src/components/CourseSchedulePanel.vue', import.meta.url),
      'utf8',
    )
    assert.match(
      source,
      /editing\.value && \(!!raw\.value\.trim\(\) \|\| imagePending\.value \|\| hasDraftFieldChanges\(form, draftBaseline\.value\)\)/,
    )
    assert.equal((source.match(/draftBaseline\.value = captureDraftFields/g) || []).length, 2)
    assert.match(source, /未保存的表格、学期、日期和提醒设置会被放弃/)
  },
)
test('one structured course surface replaces image modes without deleting legacy originals', options, () => {
  const source = readFileSync(new URL('../src/views/TimetableView.vue', import.meta.url), 'utf8')
  assert.match(source, /<UnifiedWeekCalendar /)
  assert.match(source, /<CourseSchedulePanel[^>]*:manage-only="unifiedAvailable" \/>/)
  assert.equal((source.match(/<CourseSchedulePanel\b/g) || []).length, 1)
  assert.doesNotMatch(source, /viewMode|switchMode|<img|deleteTimetable|saveTimetable/)
  assert.match(source, /download="我的旧课表原件.jpg"/)
  assert.match(source, /@toggle="loadLegacy"/)
})
test('shared confirmations load overlay styles and keep mobile actions reachable', options, () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/styles/confirmation.css', import.meta.url), 'utf8')
  assert.match(main, /element-plus\/es\/components\/message-box\/style\/css/)
  assert.match(main, /styles\/confirmation\.css/)
  assert.match(css, /max-width: calc\(100vw - 32px\)/)
  assert.match(css, /width: var\(--el-messagebox-width\)/)
  assert.match(css, /\.el-message-box__btns\s*\{\s*flex-wrap: wrap/)
  assert.match(css, /\.el-message-box__btns \.el-button\s*\{[\s\S]*min-height: 44px/)
  assert.match(css, /\.el-message-box__headerbtn\s*\{\s*width: 44px;\s*height: 44px/)
})
