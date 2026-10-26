import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { planScheduleQuestion, scheduleQuery } from '../src/utils/scheduleIntent.js'
import { validScheduleRefinement, refineScheduleQuery } from '../src/utils/scheduleRefinement.js'
import { readPrivateScheduleQuery, previousScheduleQuery } from '../src/utils/scheduleChat.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { chinaDate } from '../src/utils/timetable.js'

const opts = { timeout: 4000 },
  today = '2026-10-20',
  scope = 'synthetic:scope'
function message() {
  const q = scheduleQuery(today, today, { course: '未识别的课程', detail: 'LOCATION' })
  const display = {
    version: 1,
    state: 'UNRESOLVED',
    summary: '该范围已有2项安排，请核对课程名。',
    entries: [],
    notices: [],
    freeDates: [],
  }
  return {
    localSchedule: true,
    scheduleQuery: { ...q, scope },
    scheduleResult: {
      ...q,
      version: 1,
      count: 0,
      focus: null,
      unknownTimes: 0,
      asOf: `${today}T05:00:00Z`,
      answer: '未识别课程名，不是没有课。',
      display,
      refinement: {
        version: 1,
        courseChoices: ['C++', '合成网络'],
        availableCount: 2,
        choicesComplete: true,
      },
    },
  }
}
test(
  'polite requests and finishing-time grammar compose independently of course names',
  opts,
  () => {
    const ask = (text) => planScheduleQuestion(text, { today })
    for (const prefix of ['我想知道', '告诉我', '请告诉我', '麻烦你跟我说', '我想了解'])
      for (const time of ['今天', '明天'])
        assert.deepEqual(
          ask(`${prefix}${time}上什么课`),
          scheduleQuery(time === '今天' ? today : '2026-10-21'),
        )
    assert.deepEqual(ask('这周的课程怎样安排'), scheduleQuery('2026-10-19', '2026-10-25'))
    assert.deepEqual(ask('我今天上午用去上课吗'), scheduleQuery(today, today, { period: 'AM' }))
    assert.deepEqual(
      ask('今天几点放学'),
      scheduleQuery(today, today, { selection: 'LAST', detail: 'TIME' }),
    )
    assert.deepEqual(
      ask('明天C#在哪上课'),
      scheduleQuery('2026-10-21', '2026-10-21', { course: 'C#', detail: 'LOCATION' }),
    )
    assert.equal(ask('不要查明天的课表'), null)
    assert.equal(ask('告诉我明天的天气'), null)
    const longName = '课程'.repeat(45)
    assert.equal(ask(`明天《${longName}》在哪上`).course, longName)
  },
)
test(
  'candidate replies validate data completeness without weakening the existing display contract',
  opts,
  async () => {
    const m = message(),
      result = m.scheduleResult
    assert.equal(validScheduleRefinement(result.refinement, result), true)
    assert.equal(
      (await readPrivateScheduleQuery(m.scheduleQuery, null, async () => ({ data: result }))).count,
      0,
    )
    const incomplete = {
      ...result.refinement,
      availableCount: 201,
      courseChoices: [],
      choicesComplete: false,
    }
    assert.equal(validScheduleRefinement(incomplete, result), true)
    for (const change of [
      { version: 2 },
      { availableCount: 0 },
      { courseChoices: ['C++', 'C++'] },
      { courseChoices: ['x'.repeat(101)] },
      { choicesComplete: false },
      { userId: 9 },
    ]) {
      const bad = { ...result, refinement: { ...result.refinement, ...change } }
      await assert.rejects(
        readPrivateScheduleQuery(m.scheduleQuery, null, async () => ({ data: bad })),
        /响应异常/,
      )
    }
    assert.equal(
      validScheduleRefinement(result.refinement, { ...result, display: { state: 'UNRESOLVED' } }),
      false,
    )
    const legacy = { ...result }
    delete legacy.refinement
    assert.equal(
      (await readPrivateScheduleQuery(m.scheduleQuery, null, async () => ({ data: legacy })))
        .display.state,
      'UNRESOLVED',
    )
  },
)
test(
  'choosing a saved name or clearing only that filter preserves exact date and detail and owner',
  opts,
  () => {
    const m = message()
    assert.deepEqual(
      refineScheduleQuery(m, 'C++', scope),
      scheduleQuery(today, today, { detail: 'LOCATION', course: 'C++' }),
    )
    assert.deepEqual(
      refineScheduleQuery(m, '', scope),
      scheduleQuery(today, today, { detail: 'LOCATION', course: '' }),
    )
    assert.throws(() => refineScheduleQuery(m, '别人的课程', scope), /候选课程/)
    assert.throws(() => refineScheduleQuery(m, 'C++', 'other-owner'), /归属/)
    assert.throws(
      () =>
        refineScheduleQuery(
          { ...m, scheduleQuery: { ...m.scheduleQuery, from: '2026-10-19' } },
          'C++',
          scope,
        ),
      /归属/,
    )
    assert.equal(m.scheduleQuery.course, '未识别的课程', 'the old reply stays immutable')
  },
)
test(
  'explicit same-course followups use the authorized focused name, never a guessed course or model answer',
  opts,
  () => {
    const previous = {
      ...scheduleQuery(today, '2026-11-02', { selection: 'NEXT' }),
      focus: '2026-10-26T14:00:00',
      focusName: 'C++程序设计',
    }
    const messages = [
      { role: 'user', content: '下一节', localSchedule: true },
      { role: 'assistant', localSchedule: true, scheduleQuery: { ...previous, scope } },
    ]
    const current = previousScheduleQuery(messages, scope)
    assert.equal(current.focusName, previous.focusName)
    assert.equal(previousScheduleQuery(messages, 'another-owner'), null)
    const ask = (text, context = current) =>
      planScheduleQuestion(text, { today, previous: context })
    assert.deepEqual(
      ask('后一天这门在哪上'),
      scheduleQuery('2026-10-27', '2026-10-27', { detail: 'LOCATION', course: 'C++程序设计' }),
    )
    assert.equal(
      ask('明天呢').course,
      undefined,
      'ordinary date followups do not silently add a new course filter',
    )
    const legacy = { ...previous }
    delete legacy.focusName
    assert.ok(ask('明天这门在哪', legacy).clarification)
  },
)
test(
  'DEV candidates and corrected reads use actual owner rows and never mutate the source',
  opts,
  async () => {
    const fixture = createTeachingFlowFixture(),
      date = chinaDate(),
      q = scheduleQuery(date, date, { course: '不匹配的合成名称' })
    const read = (params) =>
      fixture.adapter({ url: '/api/timetable/unified/query', method: 'get', params })
    const before = JSON.stringify(
      (await fixture.adapter({ url: '/api/timetable/courses', method: 'get' })).data,
    )
    const result = await readPrivateScheduleQuery(q, null, read)
    assert.equal(result.display.state, 'UNRESOLVED')
    assert.equal(result.refinement.availableCount, 2)
    assert.equal(result.refinement.courseChoices.length, 2)
    const m = { localSchedule: true, scheduleQuery: { ...q, scope }, scheduleResult: result }
    const selected = refineScheduleQuery(m, result.refinement.courseChoices[0], scope)
    const corrected = await readPrivateScheduleQuery(selected, null, read)
    assert.equal(corrected.count, 1)
    assert.equal(corrected.display.entries[0].name, selected.course)
    assert.equal(
      JSON.stringify(
        (await fixture.adapter({ url: '/api/timetable/courses', method: 'get' })).data,
      ),
      before,
    )
    fixture.setActor(8)
    const other = await readPrivateScheduleQuery(q, null, read)
    assert.equal(other.refinement.availableCount, 1)
    assert.ok(
      other.refinement.courseChoices.every(
        (name) => !result.refinement.courseChoices.includes(name),
      ),
    )
  },
)
test(
  'candidate controls compile as read-only disabled-aware actions and cannot inject markup',
  opts,
  () => {
    const file = 'src/components/ScheduleCourseChoices.vue',
      source = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source)
    assert.deepEqual(errors, [])
    compileScript(descriptor, { id: file })
    assert.deepEqual(
      compileTemplate({ source: descriptor.template.content, filename: file, id: file }).errors,
      [],
    )
    assert.match(source, /:disabled="!active"/)
    assert.match(source, /min-height: 44px/)
    assert.doesNotMatch(
      source,
      /v-html|localStorage|sessionStorage|sendMessage|save|\.post\(|\.put\(/,
    )
  },
)
