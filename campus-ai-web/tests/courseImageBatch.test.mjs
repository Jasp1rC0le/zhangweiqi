import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { File } from 'node:buffer'
import { courseImageFilesIssue, buildCourseImageBatch, courseImageImportFeedback } from '../src/utils/courseImageRecognition.js'
import { takeCourseFiles } from '../src/utils/courseFile.js'
const file = (name = 'private.png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
const source = readFileSync(new URL('../src/components/CourseImageImport.vue', import.meta.url), 'utf8')
const code = source.slice(source.indexOf('async function recognize()'), source.indexOf('watch(()=>props.scope'))
const response = () => ({ data: { schedule: { courses: [{ weeks: [9, 10] }] }, importedRows: 2, week: 9, weeks: [9, 10], recognized: [], warnings: [] } })
function setup(request = async () => response()) {
  const events = [], requests = []
  const state = { props: { scope: '7:1', revision: 3, disabled: false }, files: { value: [file(), file('second.png')] }, capability: { value: { available: true } },
    busy: { value: false }, uncertain: { value: false }, error: { value: '' }, notice: { value: '' }, disposed: false, generation: 0, controller: null,
    AbortController, Set, courseImageImportFeedback, emit: (...args) => events.push(args),
    importCourseImages: (...args) => { requests.push(args); return request(...args) },
  }
  const context = vm.createContext(state)
  vm.runInContext(`${cancelCode}
${code}; globalThis.runImport = recognize; globalThis.cancelImport = cancel`, context)
  return { state, context, events, requests, run: () => vm.runInContext('runImport()', context) }
}
// cancel is outside the extracted recognition function; use the actual production handler.
const cancelCode = source.slice(source.indexOf('function cancel()'), source.indexOf('async function recognize()'))

test('multiple files are captured before the native picker resets', () => {
  const original = [file(), file('b.png')]
  const input = { files: original, set value(value) { assert.equal(value, ''); original.length = 0 } }
  const selected = takeCourseFiles(input)
  assert.equal(selected.length, 2)
  assert.equal(original.length, 0)
})
test('batch admission bounds the count, each image and combined bytes before upload', () => {
  const small = { type: 'image/png', size: 100 }
  assert.equal(courseImageFilesIssue(Array(20).fill(small)), '')
  for (const files of [[], Array(21).fill(small), [{ type: 'image/gif', size: 1 }], [{ type: 'image/png', size: 2097153 }], Array(17).fill({ type: 'image/png', size: 2097152 })]) assert.ok(courseImageFilesIssue(files))
  assert.equal(courseImageFilesIssue(Array(16).fill({ type: 'image/png', size: 2097152 })), '')
})
test('multipart preserves original bytes and does not disclose local filenames', async () => {
  const first = file('my-private-name.png'), second = new File(['jpeg'], 'private.jpg', { type: 'image/jpeg' })
  const entries = buildCourseImageBatch([first, second]).getAll('images')
  assert.deepEqual(entries.map(value => value.name), ['course-1.png', 'course-2.jpg'])
  assert.deepEqual(new Uint8Array(await entries[0].arrayBuffer()), new Uint8Array(await first.arrayBuffer()))
  assert.throws(() => buildCourseImageBatch([]))
})
test('one selection makes one batch request and one adopt event without a confirmation', async () => {
  const flow = setup()
  vm.runInContext(cancelCode, flow.context)
  await flow.run()
  assert.equal(flow.requests.length, 1)
  assert.equal(flow.requests[0][0].length, 2)
  assert.equal(flow.requests[0][1], 3)
  assert.equal(flow.events.length, 1)
  assert.equal(flow.events[0][0], 'imported')
  assert.equal(flow.events[0][1].owner, '7:1')
  assert.match(flow.state.notice.value, /已导入2项.*2周/)
  assert.equal(flow.state.busy.value, false)
})
test('an account change while recognition runs cannot adopt the old account result', async () => {
  let resolve
  const flow = setup(() => new Promise(done => { resolve = done }))
  const pending = flow.run()
  flow.state.props.scope = '8:1'
  resolve(response()); await pending
  assert.equal(flow.events.length, 0)
})
test('lost acknowledgement locks replay until a read, without auto retry', async () => {
  const flow = setup(async () => { throw new Error('network unavailable') })
  await flow.run(); await flow.run()
  assert.equal(flow.requests.length, 1)
  assert.equal(flow.state.uncertain.value, true)
  assert.equal(flow.events.length, 0)
})
test('known whole-batch validation failure never emits a partial success', async () => {
  const flow = setup(async () => { throw { response: { status: 422, data: { message: '第2张周次未读清，整批未保存' } } } })
  await flow.run()
  assert.equal(flow.requests.length, 1)
  assert.equal(flow.events.length, 0)
  assert.equal(flow.state.uncertain.value, false)
  assert.match(flow.state.error.value, /整批未保存/)
})
test('canceling the wait suppresses a late successful response and prevents replay', async () => {
  let resolve
  const flow = setup(() => new Promise(done => { resolve = done }))
  vm.runInContext(cancelCode, flow.context)
  const pending = flow.run()
  vm.runInContext('cancelImport()', flow.context)
  assert.equal(flow.requests[0][2].aborted, true)
  resolve(response()); await pending; await flow.run()
  assert.equal(flow.requests.length, 1)
  assert.equal(flow.events.length, 0)
  assert.equal(flow.state.uncertain.value, true)
})
