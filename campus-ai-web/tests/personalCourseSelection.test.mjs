import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { personalCourseMatches, personalCourseSelection, requiredPersonalTerm } from '../src/utils/personalCourseSelection.js'
import { courseKey } from '../src/utils/courseSchedule.js'
import { planPersonalOperation } from '../src/utils/personalScheduleOperations.js'
import { captureDraftFields, hasDraftFieldChanges } from '../src/utils/formDraft.js'
const opts = { timeout: 5000 }
const courses = [
  { name: '合成设计', weekday: 1, startTime: '08:30', endTime: '10:05', weeks: [1,2], room: '合成A101', teacher: '合成已填教师' },
  { name: '合成设计', weekday: 1, startTime: '08:30', endTime: '10:05', weeks: [1,2], room: '合成A101', teacher: '' },
  { name: '合成实验', weekday: 2, startTime: '10:20', endTime: '11:55', weeks: [1,2], room: '合成B202', teacher: '' },
]
const term = { revision: 3, semester: '当前合成学期', firstMonday: '2026-10-19', remindDays: 7, courses, importedAt: '2026-10-25T00:00:00Z', checkedAt: '2026-10-25T00:00:00Z' }
test('missing-teacher filter composes with existing course/place/teacher search and preserves order', opts, () => {
  assert.deepEqual(personalCourseMatches(courses, '', true), courses.slice(1))
  assert.deepEqual(personalCourseMatches(courses, '合成A101', true), [courses[1]])
  assert.deepEqual(personalCourseMatches(courses, '合成已填教师', false), [courses[0]])
  assert.deepEqual(personalCourseMatches(courses, '合成已填教师', true), [])
  assert.deepEqual(personalCourseMatches(courses, ' 合成设计 ', false), courses.slice(0,2))
})
test('legacy absent and whitespace names are missing without guessing a teacher from a matching title', opts, () => {
  const values = [{ ...courses[1], teacher: undefined }, { ...courses[2], teacher: '  ' }, courses[0]]
  assert.deepEqual(personalCourseMatches(values, '', true), values.slice(0,2))
  assert.equal(values[0].teacher, undefined); assert.notEqual(courseKey(courses[0]), courseKey(courses[1]))
})
test('empty data and no-match query do not mutate or delete the owned course array', opts, () => {
  const before = JSON.stringify(courses)
  assert.deepEqual(personalCourseMatches(undefined), []); assert.deepEqual(personalCourseMatches(courses, '不存在'), [])
  assert.equal(JSON.stringify(courses), before)
})
test('selection scope compares the full filter, not just the first25 rows', opts, () => {
  const all = Array.from({ length: 31 }, (_, i) => ({ ...courses[1], name: '合成分页' + i }))
  const keys = [courseKey(all[0]), courseKey(all[30])], state = personalCourseSelection(all, keys)
  assert.deepEqual(state.hidden, []); assert.deepEqual(state.inside, keys)
  assert.equal(all.slice(0,25).some(c => courseKey(c) === keys[1]), false)
})
test('hidden selection is explicit and clearing it keeps only exact current-filter targets', opts, () => {
  const keys = courses.map(courseKey), matches = personalCourseMatches(courses, '', true), state = personalCourseSelection(matches, keys)
  assert.deepEqual(state.hidden, [keys[0]]); assert.deepEqual(state.inside, keys.slice(1)); assert.deepEqual(keys, courses.map(courseKey))
  assert.deepEqual(personalCourseSelection(matches, [keys[1],keys[1], 'stale-key']).selected, [keys[1], 'stale-key'])
  assert.deepEqual(personalCourseSelection(matches, ['stale-key']).inside, [])
})
test('cleared hidden teacher targets cannot overwrite an already filled same-name course', opts, () => {
  const matches = personalCourseMatches(courses, '', true), allowed = personalCourseSelection(matches, courses.map(courseKey)).inside
  const plan = planPersonalOperation(term, [allowed[0]], { operation: 'BATCH', weeks: '', room: '', teacher: '本人核对教师', startTime: '', endTime: '', weekday: '', reason: '合成教师补录' })
  const values = plan.payload.terms[0].courses
  assert.ok(values.some(c => c.name === '合成设计' && c.teacher === '合成已填教师'))
  assert.ok(values.some(c => c.name === '合成设计' && c.teacher === '本人核对教师'))
  assert.ok(values.some(c => c.name === '合成实验' && !(c.teacher || '').trim()))
  assert.equal(courses[1].teacher, ''); assert.match(plan.lines.join('\n'), /修改所选1项/)
})
test('teacher handoff selects the exact requested saved term, not previous or first sorted term', opts, () => {
  const values = [{ ...term, firstMonday: '2026-10-26' }, term, { ...term, firstMonday: '2026-10-12' }]
  assert.equal(requiredPersonalTerm(values, '2026-10-19'), '2026-10-19')
  assert.equal(values[0].firstMonday, '2026-10-26')
})
test('absent duplicate malformed or nonstring term intent fails without a replacement', opts, () => {
  for (const value of ['2026-02-30', 'foreign', ['2026-10-19'], undefined]) assert.throws(() => requiredPersonalTerm([term], value))
  assert.throws(() => requiredPersonalTerm([term], '2026-10-12'), /没有改用其他学期/)
  assert.throws(() => requiredPersonalTerm([term, term], term.firstMonday), /无法明确确认/)
  assert.equal(requiredPersonalTerm([term], term.firstMonday), term.firstMonday)
})
test('filtered and historical arrays retain distinct identities even when names/teacher labels match', opts, () => {
  const earlier = { ...term, firstMonday: '2026-10-12', courses: [{ ...courses[2], teacher: '早期教师' }] }
  assert.equal(personalCourseMatches(term.courses, '', true).length, 2)
  assert.equal(personalCourseMatches(earlier.courses, '', true).length, 0)
  assert.equal(term.courses[2].teacher, '')
})
test('SFC source binds target date, explicit missing filter, hidden-preview fence and cancellation', opts, () => {
  for (const file of ['PersonalScheduleOperations.vue','CourseSchedulePanel.vue']) {
    const source = readFileSync(new URL('../src/components/' + file, import.meta.url), 'utf8'), { descriptor, errors } = parse(source)
    assert.deepEqual(errors, []); compileScript(descriptor, { id: file }); assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: file }).errors, [])
  }
  const parent = readFileSync(new URL('../src/components/CourseSchedulePanel.vue', import.meta.url), 'utf8')
  assert.match(parent, /missingTeachersOnly:true,firstMonday:store.schedule\?\.firstMonday/)
  const source = readFileSync(new URL('../src/components/PersonalScheduleOperations.vue', import.meta.url), 'utf8')
  assert.match(source, /requiredPersonalTerm\(terms.value, requested.firstMonday\)/); assert.match(source, /sourceIntent.value \? '' : terms.value\[0\]/)
  assert.match(source, /if \(selection.value.hidden.length\).*return/); assert.match(source, /:disabled="locked \|\| !keys.length \|\| !!selection.hidden.length"/)
  assert.match(source, /sourceIntent.value = null/); assert.match(source, /controller\?\.abort/); assert.match(source, /intent.current\(\)/)
  assert.match(source, /不会自动勾选/); assert.match(source, /重试当前学期核对/); assert.match(source, /将同一教师姓名用于所选/)
  assert.match(source, /courseList.value.scrollTop = 0/); assert.match(source, /v-if="!enabled && !busy && !error"/)
})
test('field-only operation drafts remain dirty when choices are cleared, without treating default task mode as input', opts, () => {
  const fields = ['fromDate','toDate','room','teacher','startTime','endTime','weekday','weeks','semester','firstMonday','targetWeeks','reason']
  const empty = Object.fromEntries(fields.map(key => [key, ''])), baseline = captureDraftFields(empty, fields)
  for (const key of fields) {
    const form = { ...empty, operation: 'BATCH', destination: 'new', [key]: '旧任务字段' }
    assert.equal(hasDraftFieldChanges(form, baseline), true, key)
    Object.assign(form, empty); assert.equal(hasDraftFieldChanges(form, baseline), false)
  }
  assert.equal(hasDraftFieldChanges({ ...empty, operation: 'BATCH', destination: 'existing-term' }, baseline), false)
})
test('new completion cannot change source before a field-only draft is discarded and settled saves clear their fields', opts, () => {
  const source = readFileSync(new URL('../src/components/PersonalScheduleOperations.vue', import.meta.url), 'utf8')
  assert.match(source, /const fieldsDirty = computed\(\(\) => hasDraftFieldChanges\(form, fieldBaseline\)\)/)
  assert.match(source, /const dirty = computed\(\(\) => fieldsDirty.value \|\| keys.value.length/)
  assert.match(source, /Object.keys\(defaultForm\).filter\(key => !\['operation', 'destination'\].includes\(key\)\)/)
  assert.match(source, /async function openPanel[\s\S]*?disposed \|\| dirty.value\) return[\s\S]*?resetForm\(\)[\s\S]*?sourceIntent.value = \{/)
  assert.match(source, /sourceIntent.value = null\s+resetForm\(\)\s+open.value = false/)
  assert.equal((source.match(/keys.value = \[\]\s+resetForm\(\)\s+notice.value/g) || []).length, 2)
  assert.match(source, /清除选择不会放弃字段/)
})
