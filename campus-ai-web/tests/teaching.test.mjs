import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { ATTENDANCE_STATUSES, attendanceSummary, createTeachingResource, validatedDetail, isMyDayQuestion } from '../src/utils/teaching.js'
import { parseRosterRows, parseRosterFile } from '../src/utils/rosterImport.js'
import { zipSync, strToU8 } from 'fflate'
const options = { timeout: 3000 }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const lesson = (n = 1) => ({ id: id(n), course: '合成课程', className: '合成班', college: '合成学院', teacher: '合成教师', room: '合成教室', startsAt: '2026-10-14T02:00:00Z', endsAt: '2026-10-14T03:00:00Z', revision: 0, finalized: false, cancelled: false, counts: { unknown: 2, onTime: 1, late: 1, absent: 0, excused: 1 } })
const detail = n => ({ lesson: lesson(n), entries: [{ studentId: id(100), studentNumber: 'demo-001', name: '合成同学', status: 'UNKNOWN' }] })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function setup(read = {}) {
  let owner = 'demo-a'
  const state = { access: null, lessons: [], detail: null, loading: false, saving: false, error: '' }
  const resource = createTeachingResource({ owner: () => owner, state, readAccess: async () => ({ data: { enabled: true, views: ['TEACHER'] } }), readLessons: async () => ({ data: [lesson()] }), readDetail: async (id) => ({ data: detail(Number(id.slice(-1))) }), save: async () => ({ data: detail(1) }), ...read })
  return { state, resource, owner: value => { owner = value; resource.reset() } }
}
test('unknown and excused do not inflate confirmed attendance or absence', options, () => {
  const s = attendanceSummary([lesson(), { ...lesson(2), cancelled: true }])
  assert.equal(s.absent, 0); assert.equal(s.unknown, 2); assert.equal(s.confirmed, 2); assert.equal(s.rate, 1)
  assert.equal(attendanceSummary([]).rate, null)
})
test('only a personal short today/tomorrow query takes the private path', options, () => {
  assert.ok(isMyDayQuestion('我今天上什么课？在哪上？')); assert.ok(isMyDayQuestion('明天我有什么课'))
  assert.equal(isMyDayQuestion('全校谁旷课'), false); assert.equal(isMyDayQuestion('我' + '今天'.repeat(80) + '课'), false)
})
test('detail validation rejects duplicate targets wrong lesson unknown status and excess rows', options, () => {
  assert.equal(validatedDetail(detail(1), id(1)).entries.length, 1)
  for (const value of [{ ...detail(1), entries: [detail(1).entries[0], detail(1).entries[0]] }, { ...detail(2) }, { ...detail(1), entries: [{ ...detail(1).entries[0], status: '__proto__' }] }]) assert.throws(() => validatedDetail(value, id(1)))
})
test('late account and late target responses cannot reappear under another scope', options, async () => {
  const a = deferred(), b = deferred()
  const { state, resource, owner } = setup({ readDetail: id => id.endsWith('1') ? a.promise : b.promise })
  const first = resource.select(id(1), 'TEACHER'), next = resource.select(id(2), 'TEACHER')
  b.resolve({ data: detail(2) }); await next; a.resolve({ data: detail(1) }); await first
  assert.equal(state.detail.lesson.id, id(2))
  const old = deferred(), separate = setup({ readAccess: () => old.promise }); const pending = separate.resource.load('TEACHER', '2026-10-14', '2026-10-14')
  separate.owner('demo-b'); old.resolve({ data: { enabled: true, views: ['TEACHER'] } }); await pending; assert.equal(separate.state.access, null)
  owner('demo-b'); assert.equal(state.detail, null)
})
test('disabled and unbound scopes do not request lists; spoofed role is not adopted', options, async () => {
  let called = false
  for (const access of [{ enabled: false, views: [] }, { enabled: true, views: [] }, { enabled: true, views: ['__proto__'] }]) {
    const { state, resource } = setup({ readAccess: async () => ({ data: access }), readLessons: () => { called = true } })
    await resource.load('TEACHER', '2026-10-14', '2026-10-14'); assert.equal(called, false)
    if (access.views.includes('__proto__')) assert.ok(state.error)
  }
})
test('save conflict keeps detail, stale save after owner switch is ignored', options, async () => {
  const pending = deferred(), s = setup({ save: () => pending.promise }); s.state.detail = detail(1)
  const task = s.resource.saveMarks(id(1), {}); s.owner('demo-b'); pending.resolve({ data: detail(1) }); assert.equal(await task, false); assert.equal(s.state.detail, null)
  const c = setup({ save: async () => { throw { response: { status: 409 } } } }); c.state.detail = detail(1)
  assert.equal(await c.resource.saveMarks(id(1), {}), false); assert.equal(c.state.detail.lesson.id, id(1)); assert.match(c.state.error, /不会自动覆盖/)
})
test('roster keeps only necessary fields, groups classes and never links by name', options, () => {
  const result = parseRosterRows([['说明'], ['班级', '姓名', '身份证号码', '学号', '电话'], ['合成班一', '合成甲', 'discard', 'demo-01', 'discard'], ['合成班二', '合成乙', 'discard', 'demo-02', 'discard']])
  assert.equal(result.classes.length, 2); assert.deepEqual(Object.keys(result.classes[0].members[0]), ['studentNumber', 'name', 'userId']); assert.equal(result.classes[0].members[0].userId, null)
  assert.equal(result.ignoredColumns, 2)
})
test('duplicate numbers missing cells and ambiguous headers fail without dropping rows', options, () => {
  const h = ['班级', '姓名', '学号']
  assert.throws(() => parseRosterRows([h, ['示例班', '合成甲', 'demo-01'], ['示例班', '合成乙', 'demo-01']]), /重复/)
  assert.throws(() => parseRosterRows([h, ['示例班', '', 'demo-01']]), /第2行/)
  assert.throws(() => parseRosterRows([['班级', '姓名', '学号', '姓名']]), /重复/)
})
test('xlsx shared-string order and styled far-out empty cells preserve true rows', options, () => {
  const shared = ['班级', '姓名', '学号', '合成班', '合成同学', 'demo-01']
  const bytes = zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="合成表" r:id="r1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<sst>' + shared.map(s => `<si><t>${s}</t></si>`).join('') + '</sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c><c r="XFD2" s="1"/></row></sheetData></worksheet>'),
  })
  const result = parseRosterFile(bytes, 'xlsx'); assert.equal(result.classes[0].members[0].name, '合成同学'); assert.equal(result.classes[0].members[0].studentNumber, 'demo-01')
})
test('teaching UI compiles with role-bound actions drafts native controls and reduced motion', options, () => {
  for (const file of ['TeachingView.vue', '../components/AdminTeachingPanel.vue']) {
    const source = fs.readFileSync(new URL('../src/views/' + file, import.meta.url), 'utf8'), { descriptor, errors } = parse(source)
    assert.equal(errors.length, 0); compileScript(descriptor, { id: 'test' })
    assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file, id: 'test' }).errors, [])
    assert.match(source, /useUnsavedChanges/); assert.match(source, /prefers-reduced-motion/)
  }
  const chat = fs.readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')
  assert.match(chat, /readPrivateScheduleQuery\(privateQuery, run.signal, queryOwnTimetable\)/); assert.match(chat, /!message.localSchedule/)
  const branch = chat.slice(chat.indexOf('// Personal schedule answers'), chat.indexOf('sending.value = true\n  answerNotice', chat.indexOf('// Personal schedule answers')))
  assert.doesNotMatch(branch, /ensureConversation\(|sendMessageStream\(/)
  assert.equal(Object.keys(ATTENDANCE_STATUSES).length, 6)
  assert.equal(ATTENDANCE_STATUSES.EARLY_LEAVE,'早退')
})
