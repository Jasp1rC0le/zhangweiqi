import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parseCourseText } from '../src/utils/courseImport.js'

test('pasted JSON updates semester and first Monday before producing the save preview', { timeout: 2000 }, () => {
  const source = readFileSync(new URL('../src/components/CourseSchedulePanel.vue', import.meta.url), 'utf8')
  const code = source.slice(source.indexOf('function inspect()'), source.indexOf('async function chooseFile'))
  const form = { semester: '旧学期', firstMonday: '2026-09-07' }
  const preview = { value: null }, error = { value: '' }
  const context = {
    form, preview, error, confirmed: { value: true }, fileNotice: { value: '' },
    store: { schedule: { revision: 5 } }, parseCourseText,
    raw: { value: JSON.stringify({ semester: '合成新学期', firstMonday: '2027-03-01', courses: [
      { name: '合成课程', weekday: 1, startPeriod: 1, endPeriod: 2, weeks: [1], room: '' },
    ] }) },
  }
  vm.runInNewContext(`${code}; inspect()`, context)
  assert.equal(error.value, '')
  assert.equal(form.semester, '合成新学期')
  assert.equal(form.firstMonday, '2027-03-01')
  assert.equal(preview.value.revision, 5)
  assert.equal(context.confirmed.value, false)
  assert.match(context.fileNotice.value, /尚未保存/)
})
test('file feedback remains adjacent to chooser and legacy teaser no longer presents image coverage', { timeout: 2000 }, () => {
  const panel = readFileSync(new URL('../src/components/CourseSchedulePanel.vue', import.meta.url), 'utf8')
  assert.match(panel, /fileLabel\.value = file\.name/)
  assert.match(panel, /class="course-file-status" role="status"/)
  assert.match(panel, /此文件未能解析，未生成新预览/)
  const teaser = readFileSync(new URL('../src/components/TimetableTeaser.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(teaser, /timetableStatus|status\.value\.label/)
  assert.match(teaser, /旧原件可取回，请导入数据文件生成课程安排/)
  assert.match(teaser, /courses\.schedule \? '查看课表' : '导入课表'/)
})
