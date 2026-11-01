import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parseCourseText } from '../src/utils/courseImport.js'
import { courseConflicts, validateCourseMetadata } from '../src/utils/courseSchedule.js'
const source = readFileSync(new URL('../src/components/CourseSchedulePanel.vue', import.meta.url), 'utf8')
const course = () => ({ name: '合成课程', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], room: '', teacher: '' })

test('pasted JSON sets its exact metadata and automatically saves once without confirmation', async () => {
  const code = source.slice(source.indexOf('async function inspect()'), source.indexOf('async function chooseFile'))
  const form = { semester: '旧学期', firstMonday: '2026-09-07' }
  const preview = { value: null }, error = { value: '' }, calls = []
  const context = { form, preview, error, fileNotice: { value: '' }, store: { schedule: { revision: 5 } }, parseCourseText,
    raw: { value: JSON.stringify({ semester: '合成新学期', firstMonday: '2027-03-01', courses: [course()] }) },
    save: async () => { calls.push({ semester: form.semester, firstMonday: form.firstMonday, revision: preview.value.revision }) },
  }
  await vm.runInNewContext(`${code}; inspect()`, context)
  assert.equal(error.value, '')
  assert.deepEqual(calls, [{ semester: '合成新学期', firstMonday: '2027-03-01', revision: 5 }])
})
function automaticSave({ firstMonday = '2026-09-07', courses = [course()], request } = {}) {
  const calls = [], ref = value => ({ value })
  const state = { form: { semester: '合成学期', firstMonday, remindDays: 7 }, preview: ref({ courses, revision: 2 }), imagePending: ref(false),
    unavailable: ref(false), versionConflict: ref(false), busy: ref(false), error: ref(''), notice: ref(''), editing: ref(true), raw: ref('private'),
    disposed: false, fileGeneration: 1, heading: ref(null), nextTick: async () => {}, courseConflicts, validateCourseMetadata,
    store: { principal: '7:1', loaded: true, error: '', adopt(schedule, owner) { if (owner !== this.principal) return false; this.schedule = schedule; return true } },
    saveCourseSchedule: async payload => { calls.push(payload); return request ? request(payload) : { data: { schedule: { ...payload, revision: 3 } } } },
  }
  const code = source.slice(source.indexOf('async function save()'), source.indexOf('async function reloadForComparison'))
  const context = vm.createContext(state)
  vm.runInContext(`${code}; globalThis.saveImport=save`, context)
  return { state, calls, run: () => vm.runInContext('saveImport()', context) }
}
test('complete file data saves immediately and closes the import panel', async () => {
  const flow = automaticSave(); await flow.run()
  assert.equal(flow.calls.length, 1)
  assert.equal(flow.calls[0].revision, 2)
  assert.equal(flow.state.editing.value, false)
  assert.match(flow.state.notice.value, /已导入1项/)
})
test('missing dates remain editable and save as soon as the explicit Monday is supplied', async () => {
  const flow = automaticSave({ firstMonday: '' }); await flow.run()
  assert.equal(flow.calls.length, 0)
  assert.ok(flow.state.error.value)
  assert.equal(flow.state.versionConflict.value, false)
  flow.state.form.firstMonday = '2026-09-07'; await flow.run()
  assert.equal(flow.calls.length, 1)
  assert.equal(flow.state.editing.value, false)
})
test('conflicting file courses refuse before a write instead of requesting confirmation', async () => {
  const flow = automaticSave({ courses: [course(), { ...course(), name: '冲突合成课程' }] }); await flow.run()
  assert.equal(flow.calls.length, 0)
  assert.match(flow.state.error.value, /时间重叠/)
  assert.equal(flow.state.versionConflict.value, false)
})
test('lost file-save acknowledgement blocks an accidental replay', async () => {
  const flow = automaticSave({ request: async () => { throw new Error('network lost') } }); await flow.run(); await flow.run()
  assert.equal(flow.calls.length, 1)
  assert.equal(flow.state.versionConflict.value, true)
})
test('legacy private screenshot recovery remains available outside the simplified importer', () => {
  const teaser = readFileSync(new URL('../src/components/TimetableTeaser.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(teaser, /timetableStatus|status\.value\.label/)
  assert.match(teaser, /旧原件可取回，请导入数据文件生成课程安排/)
  assert.match(teaser, /courses\.schedule \? '查看课表' : '导入课表'/)
})
