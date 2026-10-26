import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import {
  scheduleQuery,
  planScheduleQuestion,
  validScheduleQuery,
} from '../src/utils/scheduleIntent.js'
import { readPrivateScheduleQuery } from '../src/utils/scheduleChat.js'
import {
  validScheduleDisplay,
  scheduleAnswerHeading,
  scheduleDateLabel,
} from '../src/utils/scheduleDisplay.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { chinaDate } from '../src/utils/timetable.js'

const opts = { timeout: 5000 },
  day = '2026-10-20'
const row = () => ({
  id: 'synthetic-1',
  date: day,
  name: '合成网络',
  room: '合成教室',
  teacher: '合成教师',
  startTime: '14:00',
  endTime: '15:35',
  startPeriod: 5,
  endPeriod: 6,
  timeLabel: '14:00—15:35',
  conflict: false,
  sources: ['PERSONAL', 'TEACHING'],
})
function answer() {
  return {
    ...scheduleQuery(day),
    version: 1,
    count: 1,
    unknownTimes: 0,
    focus: `${day}T14:00:00`,
    asOf: `${day}T05:00:00Z`,
    answer: '原始纯文字答案',
    display: {
      version: 1,
      state: 'READY',
      summary: '共1项安排。',
      entries: [row()],
      notices: [],
      freeDates: [],
    },
  }
}
test(
  'structured answers preserve the legacy text contract and require exact range and fields',
  opts,
  async () => {
    const data = answer()
    assert.equal(validScheduleDisplay(data.display, data), true)
    assert.equal(
      (await readPrivateScheduleQuery(scheduleQuery(day), null, async () => ({ data }))).display
        .entries[0].name,
      '合成网络',
    )
    const legacy = { ...data }
    delete legacy.display
    assert.equal(
      (await readPrivateScheduleQuery(scheduleQuery(day), null, async () => ({ data: legacy })))
        .answer,
      '原始纯文字答案',
    )
    for (const change of [
      { version: 2 },
      { entries: [] },
      { state: 'EMPTY' },
      { freeDates: [day] },
      { unverified: true },
    ]) {
      const bad = { ...data, display: { ...data.display, ...change } }
      await assert.rejects(
        readPrivateScheduleQuery(scheduleQuery(day), null, async () => ({ data: bad })),
        /响应异常/,
      )
    }
  },
)
test(
  'no roster fields, invalid clocks, duplicate ids or out-of-range rows reach the structured UI',
  opts,
  () => {
    const data = answer()
    for (const change of [
      { studentId: 'private-other-person' },
      { counts: { absent: 1 } },
      { attendance: 'ABSENT' },
      { date: '2026-10-21' },
      { date: '2026-02-30' },
      { startTime: '25:00' },
      { endTime: undefined },
      { startPeriod: 0 },
      { sources: ['PERSONAL', 'PERSONAL'] },
      { sources: ['ADMIN'] },
      { name: '' },
    ])
      assert.equal(
        validScheduleDisplay({ ...data.display, entries: [{ ...row(), ...change }] }, data),
        false,
        JSON.stringify(change),
      )
    assert.equal(
      validScheduleDisplay({ ...data.display, entries: [row(), row()] }, { ...data, count: 2 }),
      false,
    )
    assert.equal(validScheduleDisplay(data.display, { ...data, focus: `${day}T15:00:00` }), false)
  },
)
test(
  'empty and unresolved results have zero rows, while free dates are bounded and explicit',
  opts,
  () => {
    const data = { ...answer(), count: 0, focus: null }
    for (const state of ['EMPTY', 'UNRESOLVED'])
      assert.equal(validScheduleDisplay({ ...data.display, state, entries: [] }, data), true)
    const free = { ...data, detail: 'FREE' },
      display = { ...data.display, state: 'EMPTY', entries: [], freeDates: [day] }
    assert.equal(validScheduleDisplay(display, free), true)
    assert.equal(validScheduleDisplay({ ...display, freeDates: [day, day] }, free), false)
    assert.equal(validScheduleDisplay({ ...display, freeDates: ['2026-10-21'] }, free), false)
  },
)
test(
  'previous queries travel backward from now or a selected lesson and continue without losing the anchor',
  opts,
  () => {
    const ask = (text, previous) => planScheduleQuestion(text, { today: day, previous })
    const previous = ask('上一节在哪上')
    assert.deepEqual(
      previous,
      scheduleQuery('2026-10-07', day, { selection: 'PREVIOUS', detail: 'LOCATION' }),
    )
    const focused = {
      ...scheduleQuery('2026-10-21', '2026-10-21', { selection: 'NEXT' }),
      focus: '2026-10-21T14:00:00',
    }
    const anchored = ask('上一节呢', focused)
    assert.deepEqual(
      anchored,
      scheduleQuery('2026-10-08', '2026-10-21', { selection: 'PREVIOUS', anchor: focused.focus }),
    )
    const before = { ...anchored, focus: '2026-10-21T08:30:00' }
    assert.equal(ask('谁来上课', before).anchor, before.focus)
    assert.equal(ask('谁来上课', before).selection, 'AT')
    assert.equal(ask('下一节在哪', before).anchor, before.focus)
    assert.equal(validScheduleQuery({ ...anchored, anchor: '2026-10-21T14:00:99' }), false)
  },
)
test(
  'display labels distinguish query purpose without inventing a school calendar or attendance',
  opts,
  () => {
    assert.equal(scheduleDateLabel(day), '10月20日 周二')
    assert.equal(scheduleAnswerHeading({ selection: 'PREVIOUS' }), '最近已结束的课')
    assert.equal(scheduleAnswerHeading({ selection: 'AT' }), '这节课')
    assert.equal(scheduleAnswerHeading({ selection: 'ALL', detail: 'TEACHER' }), '任课教师')
  },
)
test(
  'actual DEV adapter creates projected entries from current authorized fixture state',
  opts,
  async () => {
    const fixture = createTeachingFlowFixture(),
      today = chinaDate(),
      query = scheduleQuery(today)
    const read = (params) =>
      fixture.adapter({ url: '/api/timetable/unified/query', method: 'get', params })
    fixture.setActor(2)
    const mine = await readPrivateScheduleQuery(query, null, read)
    assert.ok(mine.display.entries.length)
    assert.ok(mine.display.entries.every((row) => !Object.hasOwn(row, 'attendance')))
  const foreign = fixture.actors().find(actor => actor.nickname === '另一学院学生（模拟）')
  assert.ok(foreign)
  fixture.setActor(foreign.id)
  assert.equal(fixture.principal().id, foreign.id)
    const other = await readPrivateScheduleQuery(query, null, read)
    assert.notDeepEqual(
      other.display.entries.map((row) => row.id),
      mine.display.entries.map((row) => row.id),
    )
  },
)
test(
  'component remains read-only, has progressive full-count disclosure and scope cleanup is wired',
  opts,
  () => {
    const file = 'src/components/ScheduleAnswerCard.vue',
      source = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source)
    assert.deepEqual(errors, [])
    compileScript(descriptor, { id: file })
    assert.deepEqual(
      compileTemplate({ source: descriptor.template.content, filename: file, id: file }).errors,
      [],
    )
    assert.doesNotMatch(source, /v-html|localStorage|sessionStorage|sendMessage|saveCourse|post\(/)
    assert.match(source, /remaining/)
    assert.match(source, /min-height: 44px/)
    const chat = readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')
    assert.match(chat, /message\.scheduleQuery\?\.scope===scheduleScope && message\.scheduleResult/)
    assert.match(chat, /message\.scheduleResult=null/)
    assert.match(chat, /scheduleOwner: scope/)
  },
)
