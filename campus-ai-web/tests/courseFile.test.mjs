import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readCourseFile, takeCourseFile } from '../src/utils/courseFile.js'

const options = { timeout: 1000 }
const file = (size = 20, name = '合成课表.csv') => ({ name, size })
const bytes = (text) => new TextEncoder().encode(text).buffer
function harness() {
  const reader = {
    readyState: 0,
    reads: 0,
    aborts: 0,
    result: null,
    readAsArrayBuffer() {
      this.readyState = 1
      this.reads++
    },
    abort() {
      this.readyState = 2
      this.aborts++
      this.onabort?.()
    },
    load(value) {
      this.readyState = 2
      this.result = value
      this.onload?.()
    },
  }
  return { reader, config: { createReader: () => reader } }
}

test('picker captures File and clears native value on success and cancellation', options, () => {
  const value = file(),
    input = { files: [value], value: 'C:\\fakepath\\合成课表.csv' }
  assert.equal(takeCourseFile(input), value)
  assert.equal(input.value, '')
  input.files = []
  input.value = 'old'
  assert.equal(takeCourseFile(input), null)
  assert.equal(input.value, '')
  assert.equal(takeCourseFile(null), null)
})
test(
  'extension, empty size and byte limits reject before allocating a reader',
  options,
  async () => {
    let allocations = 0
    for (const value of [file(0), file(100001), file(-1), file(2.5), file(10, '课表.xlsx')])
      await assert.rejects(
        readCourseFile(value, {
          createReader() {
            allocations++
          },
        }),
        /100KB/,
      )
    assert.equal(allocations, 0)
  },
)
test(
  'UTF8 Chinese, BOM, tabs and emoji are read locally without format guessing',
  options,
  async () => {
    const { reader, config } = harness()
    const text = '\uFEFF课程名称\t星期\n合成实验🙂\t1'
    const pending = readCourseFile(file(bytes(text).byteLength, '合成.TSV'), config)
    reader.load(bytes(text))
    assert.equal(await pending, text.slice(1))
    assert.equal(reader.onload, null)
    assert.equal(reader.onerror, null)
    assert.equal(reader.onabort, null)
  },
)
test(
  'invalid UTF8 rejects with encoding recovery, not a false filesystem error',
  options,
  async () => {
    const { reader, config } = harness()
    const pending = readCourseFile(file(), config)
    reader.load(new Uint8Array([0xff]).buffer)
    await assert.rejects(pending, /另存为CSV UTF-8/)
  },
)
test(
  'actual response size, null result and character limit are checked independently',
  options,
  async () => {
    for (const [value, message] of [
      [null, /100KB/],
      [new ArrayBuffer(0), /100KB/],
      [new ArrayBuffer(100001), /100KB/],
      [bytes('x'.repeat(50001)), /5万字/],
    ]) {
      const { reader, config } = harness(),
        pending = readCourseFile(file(), config)
      reader.load(value)
      await assert.rejects(pending, message)
    }
  },
)
test('exact 100KB / 50000-character boundaries remain supported', options, async () => {
  const text = 'é'.repeat(50000),
    { reader, config } = harness()
  const pending = readCourseFile(file(100000), config)
  reader.load(bytes(text))
  assert.equal((await pending).length, 50000)
})
test(
  'timeout aborts active reader, releases handlers and ignores late completion',
  options,
  async () => {
    const { reader, config } = harness()
    const pending = readCourseFile(file(), { ...config, timeoutMs: 5 })
    const lateLoad = reader.onload
    await assert.rejects(pending, /超时/)
    assert.equal(reader.aborts, 1)
    assert.equal(reader.onload, null)
    reader.result = bytes('late')
    assert.doesNotThrow(() => lateLoad())
  },
)
test('account reset or unmount aborts active reader immediately', options, async () => {
  const { reader, config } = harness(),
    controller = new AbortController()
  const pending = readCourseFile(file(), { ...config, signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(reader.aborts, 1)
  assert.equal(reader.onload, null)
})
test('already cancelled read never creates a reader', options, async () => {
  const controller = new AbortController()
  controller.abort()
  let allocated = false
  await assert.rejects(
    readCourseFile(file(), {
      signal: controller.signal,
      createReader() {
        allocated = true
      },
    }),
    { name: 'AbortError' },
  )
  assert.equal(allocated, false)
})
test(
  'filesystem failure and synchronous reader error report safe recoverable errors',
  options,
  async () => {
    const { reader, config } = harness(),
      pending = readCourseFile(file(), config)
    reader.onerror()
    await assert.rejects(pending, /确认文件可访问/)
    assert.equal(reader.aborts, 1)
    await assert.rejects(
      readCourseFile(file(), {
        createReader() {
          throw new Error('private path')
        },
      }),
      /确认文件可访问/,
    )
  },
)
test('timeout configuration cannot silently disable the deadline', options, async () => {
  for (const timeoutMs of [0, -1, Infinity, 10001])
    await assert.rejects(readCourseFile(file(), { timeoutMs }), /时限无效/)
})
test(
  'component preserves raw until successful read and clears stale work on account/unmount',
  options,
  () => {
    const source = readFileSync(
      new URL('../src/components/CourseSchedulePanel.vue', import.meta.url),
      'utf8',
    )
    const choose = source.slice(
      source.indexOf('async function chooseFile'),
      source.indexOf('async function save'),
    )
    assert.doesNotMatch(choose, /raw\.value = ''/)
    assert.match(choose, /takeCourseFile\(event\.target\)/)
    assert.match(choose, /disposed \|\| unavailable\.value \|\| !store\.principal/)
    assert.match(choose, /const text = await readCourseFile/)
    assert.match(choose, /raw\.value = text/)
    assert.match(choose, /fileError\.value\?\.focus/)
    assert.equal((source.match(/fileRead\?\.abort\(\)/g) || []).length, 3)
    assert.match(source, /aria-describedby="course-file-help"/)
  },
)
