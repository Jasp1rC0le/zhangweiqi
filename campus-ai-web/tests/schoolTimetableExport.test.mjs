import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {
  exportSchoolTimetable,
  schoolTimetableBookmark,
} from '../src/utils/schoolTimetableExport.js'
import { parseCourseJson } from '../src/utils/courseImport.js'
const options = { timeout: 3000 }
function harness() {
  const captured = { alerts: [], requests: [], files: [], clicks: 0 }
  const root = { isConnected: true, getClientRects: () => [{}] }
  const rows = [
    {
      course_name: '合成实验',
      date: '2026-09-07',
      start_unit: '1',
      end_unit: '2',
      rooms: [{ building: '合成楼', name: 'A101' }],
      ignored_personal_field: '不得导出',
    },
  ]
  const component = {
    commonPageService: {
      selectedSemesterId: 1,
      selectedBizTypeId: 2,
      semesterMap: new Map([[1, { text: '合成学期', weekStartDay: 1 }]]),
    },
    semesterWeekMap: new Map([
      [
        1,
        {
          weekArray: [
            { startDate: '2026-09-07', endDate: '2026-09-13' },
            { startDate: '2026-09-14', endDate: '2026-09-20' },
          ],
        },
      ],
    ]),
    courseTablePageService: {
      getCourseTables: async (...args) => {
        captured.requests.push(args)
        return rows.map((r) => ({ ...r, date: args[3] }))
      },
    },
  }
  const elements = []
  const createElement = (tag) => {
    const e = {
      tag,
      style: {},
      setAttribute() {},
      append() {},
      remove() {
        e.removed = true
      },
      click() {
        captured.clicks++
      },
    }
    elements.push(e)
    return e
  }
  const env = {
    location: { origin: 'https://zdjw.tsguas.edu.cn', pathname: '/app-web/' },
    document: {
      getElementById: () => null,
      querySelectorAll: () => [root],
      createElement,
      body: { append() {} },
    },
    ng: { probe: () => ({ componentInstance: component }) },
    alert: (t) => captured.alerts.push(t),
    confirm: () => true,
    URL: {
      createObjectURL: (blob) => {
        captured.files.push(blob)
        return 'blob:synthetic'
      },
      revokeObjectURL() {},
    },
  }
  return { env, component, captured, elements, root }
}
test(
  'export reads all weeks via current page service, downloads only whitelisted courses',
  options,
  async () => {
    const { env, captured } = harness()
    await exportSchoolTimetable(env)
    assert.equal(captured.requests.length, 2)
    assert.deepEqual(captured.requests[0], [1, 2, 1, '2026-09-07', '2026-09-13'])
    assert.equal(captured.files.length, 1)
    const text = await captured.files[0].text(),
      data = JSON.parse(text)
    assert.deepEqual(data.courses[0].weeks, [1, 2])
    assert.deepEqual(data.coveredWeeks, [1, 2])
    assert.equal(text.includes('不得导出'), false)
    assert.equal(parseCourseJson(text).courses.length, 1)
  },
)
test('wrong origin or absent school component does not query anything', options, async () => {
  const h = harness()
  h.env.location.origin = 'https://example.org'
  await exportSchoolTimetable(h.env)
  assert.equal(h.captured.requests.length, 0)
  h.env.location.origin = 'https://zdjw.tsguas.edu.cn'
  h.env.ng = {}
  await exportSchoolTimetable(h.env)
  assert.equal(h.captured.files.length, 0)
})
test('explicit course teacher text is retained across weekly grouping without exporting an identity object', options, async () => {
  const h=harness(),original=h.component.courseTablePageService.getCourseTables
  h.component.courseTablePageService.getCourseTables=async(...args)=>(await original(...args)).map(row=>({...row,teacher_name:'合成教师甲',teacher_id:'不能带出的编号'}))
  await exportSchoolTimetable(h.env);assert.equal(h.captured.files.length,1);const text=await h.captured.files[0].text();assert.equal(parseCourseJson(text).courses[0].teacher,'合成教师甲');assert.doesNotMatch(text,/不能带出的编号|teacher_id/)
})
test('partial failure and changed semester never download incomplete data', options, async () => {
  const h = harness()
  h.component.courseTablePageService.getCourseTables = async () => {
    throw new Error('合成错误')
  }
  await exportSchoolTimetable(h.env)
  assert.equal(h.captured.files.length, 0)
  const other = harness()
  other.component.courseTablePageService.getCourseTables = async () => {
    other.component.commonPageService.selectedSemesterId = 5
    return []
  }
  await exportSchoolTimetable(other.env)
  assert.equal(other.captured.files.length, 0)
})
test(
  'bad dates and non-array response stop safely without throwing or empty export',
  options,
  async () => {
    const h = harness()
    h.component.semesterWeekMap.get(1).weekArray[0].startDate = 'invalid'
    await exportSchoolTimetable(h.env)
    assert.equal(h.captured.files.length, 0)
    const other = harness()
    other.component.courseTablePageService.getCourseTables = async () => ({
      error: 'not logged in',
    })
    await exportSchoolTimetable(other.env)
    assert.equal(other.captured.files.length, 0)
  },
)
test(
  'cancel and cross-tab invalidation discard pending results without reading event values',
  options,
  async () => {
    for (const action of ['cancel', 'storage']) {
      const h = harness(),
        listeners = new Map()
      h.env.addEventListener = (type, callback) => listeners.set(type, callback)
      h.env.removeEventListener = (type) => listeners.delete(type)
      let resolve
      h.component.courseTablePageService.getCourseTables = () =>
        new Promise((r) => {
          resolve = r
        })
      const pending = exportSchoolTimetable(h.env)
      if (action === 'cancel') h.elements.find((e) => e.tag === 'button').onclick()
      else
        listeners.get('storage')(
          new Proxy(
            {},
            {
              get() {
                throw new Error('must not inspect storage')
              },
            },
          ),
        )
      resolve([])
      await pending
      assert.equal(h.captured.files.length, 0)
      assert.equal(listeners.size, 0)
    }
  },
)
test(
  'query deadline stops a hung school request and does not produce a file',
  options,
  async () => {
    const h = harness()
    h.component.courseTablePageService.getCourseTables = () => new Promise(() => {})
    const execute = vm.runInNewContext(`(${exportSchoolTimetable.toString()})`, {
      setTimeout: (callback) => setTimeout(callback, 1),
      clearTimeout,
      Blob,
    })
    await execute(h.env)
    assert.equal(h.captured.files.length, 0)
    assert.match(h.elements.find((e) => e.tag === 'p').textContent, /超过12秒/)
  },
)
test('bookmark is self-contained code without auth extraction or direct network calls', () => {
  const code = decodeURIComponent(new URL(schoolTimetableBookmark).href.slice('javascript:'.length))
  assert.doesNotThrow(() => new vm.Script(code))
  assert.doesNotMatch(
    code,
    /localStorage|sessionStorage|document\.cookie|dynamicSecret|currentUser|fetch\(|XMLHttpRequest|\.token|postMessage/,
  )
  assert.match(code, /getCourseTables/)
})
test('browser-normalized bookmark executes without outside helpers and exports synthetic weeks', options, async () => {
  const h = harness()
  const code = decodeURIComponent(new URL(schoolTimetableBookmark).href.slice('javascript:'.length))
  vm.runInNewContext(code, { window: h.env, Blob, setTimeout: (callback, delay) => setTimeout(callback, delay === 12000 ? 1000 : 0), clearTimeout })
  for (let attempt = 0; attempt < 20 && !h.captured.files.length; attempt++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(h.captured.files.length, 1)
  const result = parseCourseJson(await h.captured.files[0].text())
  assert.deepEqual(result.courses[0].weeks, [1, 2])
})
