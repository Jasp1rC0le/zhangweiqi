import test from 'node:test'
import assert from 'node:assert/strict'
import { readCourseUpload } from '../src/utils/courseUpload.js'
const options = { timeout: 1000 }
function harness() {
  const worker = {
    stopped: 0,
    sent: 0,
    postMessage() {
      this.sent++
    },
    terminate() {
      this.stopped++
    },
  }
  const file = { name: '合成.json', size: 2, arrayBuffer: async () => new ArrayBuffer(2) }
  return { worker, file, createWorker: () => worker }
}
test(
  'upload accepts structured file, transfers only to a worker and terminates it',
  options,
  async () => {
    const h = harness(),
      pending = readCourseUpload(h.file, h)
    await Promise.resolve()
    assert.equal(h.worker.sent, 1)
    h.worker.onmessage({
      data: { type: 'campthink-course-import', result: { courses: [{ name: '合成' }] } },
    })
    assert.equal((await pending).courses.length, 1)
    assert.equal(h.worker.stopped, 1)
  },
)
test('cancel and late worker replies cannot complete imports', options, async () => {
  const h = harness(),
    controller = new AbortController(),
    pending = readCourseUpload(h.file, { ...h, signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  h.worker.onmessage({ data: { type: 'campthink-course-import', result: { courses: [{}] } } })
  assert.equal(h.worker.stopped, 1)
})
test('timeout stops worker and errors remain recoverable', options, async () => {
  const h = harness()
  await assert.rejects(readCourseUpload(h.file, { ...h, timeoutMs: 5 }), /20秒/)
  assert.equal(h.worker.stopped, 1)
})
test('invalid formats sizes and mismatching actual bytes reject', options, async () => {
  for (const [name, size] of [
    ['x.jpg', 10],
    ['x.pdf', 10],
    ['x.xls', 10],
    ['x.json', 100001],
    ['x.xlsx', 11 * 1024 * 1024],
    ['x.csv', 0],
  ])
    await assert.rejects(readCourseUpload({ name, size }), /请选择/)
  const h = harness()
  h.file.size = 3
  await assert.rejects(readCourseUpload(h.file, h), /大小异常/)
  assert.equal(h.worker.sent, 0)
})
test('parse failure or empty output do not return success', options, async () => {
  for (const data of [{ error: '格式未知' }, { result: { courses: [] } }]) {
    const h = harness(),
      pending = readCourseUpload(h.file, h)
    h.worker.onmessage({ data: { type: 'campthink-course-import', ...data } })
    await assert.rejects(pending)
    assert.equal(h.worker.stopped, 1)
  }
})
