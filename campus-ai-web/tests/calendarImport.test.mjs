import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse } from '@babel/parser'
import { calendarDevice, checkedCalendarLink, createCalendarImport } from '../src/utils/calendarImport.js'
const now = Date.parse('2026-11-01T02:00:00Z'), origin = 'https://campthink.cn'
const link = (active = false) => ({ active, url: active ? origin + '/api/calendar-feed/' + 'a'.repeat(64) + '.' + 'A'.repeat(43) + '/calendar.ics' : null,
  expiresAt: active ? new Date(now + 180 * 86400000).toISOString() : null, minutes: 10, count: active ? 1 : null, from: '2026-11-01', to: '2026-11-28' })
const digest = async bytes => createHash('sha256').update(new Uint8Array(bytes)).digest('hex')
function setup(options = {}) {
  let owner = '1:1:session-a', minutes = 10, active = true, clock = now, prepared, downloads = 0, enabled = 0
  const state = {}, body = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n', bytes = new TextEncoder().encode(body)
  const access = { sources: ['MY', 'PERSONAL'], teachingViews: [], personalViews: ['STUDENT'], formats: ['JSON', 'CSV', 'XLSX', 'PDF', 'ICS'], defaultFrom: '2026-10-26', defaultTo: '2026-11-01', maxDays: 210, maxRows: 2000, expiresSeconds: 300 }
  const reads = []
  const model = createCalendarImport({ owner: () => owner, minutes: () => minutes, active: () => active, state, origin, now: () => clock, digest,
    readLink: async signal => options.readLink ? options.readLink(signal) : ({ data: link(false) }),
    enableLink: async (value, signal) => { enabled++; return options.enableLink ? options.enableLink(value, signal) : { data: { ...link(true), minutes: value } } },
    revokeLink: async () => ({ status: 204 }), readAccess: async () => ({ data: access }),
    prepare: async (filter, signal) => {
      reads.push({ filter, signal }); prepared = { token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', filter, scope: '本人课程', count: 1, sha256: await digest(bytes), bytes: bytes.length, mime: 'text/calendar;charset=UTF-8', filename: '课表.ics', expiresAt: new Date(clock + 300000).toISOString(),
        sample: [{ id: 'synthetic', date: '2026-11-02', name: '合成课程', room: '合成教室', teacher: '', className: '', timeLabel: '08:00—09:00' }], warnings: [] }
      return { data: prepared }
    },
    download: async (_input, signal) => { downloads++; return options.download ? options.download(prepared, signal, bytes) : { data: new Blob([bytes], { type: 'text/calendar;charset=UTF-8' }), headers: { 'content-type': 'text/calendar;charset=UTF-8', 'x-content-sha256': prepared.sha256 } } },
  })
  return { model, state, reads, downloads: () => downloads, enabled: () => enabled,
    owner: value => { owner = value }, minutes: value => { minutes = value }, active: value => { active = value }, time: value => { clock = value } }
}
test('platform detection covers iPhone, desktop-mode iPad, Android, old Huawei and current Harmony without a version gate', () => {
  for (const agent of ['iPhone OS 16_4', 'iPad OS 26_0']) assert.equal(calendarDevice({ userAgent: agent }).platform, 'apple')
  assert.equal(calendarDevice({ userAgent: 'Macintosh Safari', platform: 'MacIntel', maxTouchPoints: 5 }).platform, 'apple')
  assert.equal(calendarDevice({ userAgent: 'Linux Android 16 Chrome/140' }).platform, 'android')
  for (const agent of ['Linux Android 10 HUAWEI', 'OpenHarmony 5 HuaweiBrowser', 'HarmonyOS 6 HuaweiBrowser']) assert.equal(calendarDevice({ userAgent: agent }).platform, 'harmony')
  assert.equal(calendarDevice({ userAgent: 'Android 15 HONOR Chrome' }).platform, 'android')
  assert.equal(calendarDevice({ userAgent: 'iPhone MicroMessenger' }).embedded, true)
})
test('preparation is private and does not activate a shareable subscription before the user asks', async () => {
  const s = setup(); assert.equal(await s.model.warm(), true, s.state.error)
  assert.equal(s.enabled(), 0); assert.equal(s.state.ready, true)
  assert.deepEqual(s.reads[0].filter, { source: 'PERSONAL', view: 'STUDENT', from: '2026-11-01', to: '2026-11-28', classId: '', period: 'ALL', format: 'ICS', search: '', includeCancelled: true, reminderMinutes: 10 })
  const file = await s.model.verifiedFile(); assert.equal(file.filename, '课表.ics'); assert.equal(s.downloads(), 1)
  s.time(now + 10000); assert.ok(await s.model.verifiedFile()); assert.equal(s.downloads(), 2)
  s.model.dispose()
})
test('expired preparation is renewed internally instead of showing a stale or empty success', async () => {
  const s = setup(); await s.model.warm(); s.time(now + 301000)
  assert.ok(await s.model.verifiedFile()); assert.equal(s.state.ready, true); assert.equal(s.reads.length, 2); s.model.dispose()
})
test('wrong file bytes never become a shareable native file', async () => {
  const s = setup({ download: prepared => ({ data: new Blob(['different'], { type: prepared.mime }), headers: { 'content-type': prepared.mime, 'x-content-sha256': prepared.sha256 } }) })
  assert.equal(await s.model.warm(), false); assert.equal(s.state.ready, false); assert.equal(await s.model.verifiedFile(), null); s.model.dispose()
})
test('account cutover aborts a pending request and suppresses prior private metadata and URLs', async () => {
  let done, pendingSignal
  const s = setup({ readLink: signal => new Promise(resolve => { pendingSignal = signal; done = resolve }) })
  const pending = s.model.warm(); s.owner('2:1:session-b'); s.model.reset()
  assert.equal(pendingSignal.aborted, true); done({ data: link(true) }); await pending
  assert.equal(s.state.hasLink, false); assert.equal(s.state.ready, false); assert.equal(s.model.currentLink(), null); s.model.dispose()
})
test('native subscription is signed-origin checked and revocation never claims to remove phone-side copies', async () => {
  const s = setup(); await s.model.warm(); const url = await s.model.subscription(); assert.equal(url, link(true).url); assert.equal(s.state.hasLink, true)
  assert.equal(await s.model.revoke(), true); assert.equal(s.state.hasLink, false); assert.match(s.state.notice, /手机已保存的日程/); s.model.dispose()
})
test('foreign origins, unsigned paths, leaked query strings, invalid dates and overlong link validity are rejected', () => {
  for (const change of [v => { v.url = v.url.replace('campthink.cn', 'example.test') }, v => { v.url += '?token=extra' }, v => { v.url += '#extra' }, v => { v.url = 'javascript:alert(1)' }, v => { v.from = '2026-02-30' }, v => { v.count = 2001 }, v => { v.expiresAt = new Date(now + 182 * 86400000).toISOString() }]) {
    const value = link(true); change(value); assert.throws(() => checkedCalendarLink(value, origin, now))
  }
})

const script = parseSfc(readFileSync(new URL('../src/components/CalendarImportAction.vue', import.meta.url), 'utf8')).descriptor.scriptSetup.content
const ast = parse(script, { sourceType: 'module' }), node = ast.program.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'begin')
const beginSource = script.slice(node.start, node.end)
function handoff(platform, options = {}) {
  const calls = [], state = { ready: true, busy: false }
  const scope = { value: 'owner-a:10' }
  const context = { scope, disposed: false, state, launching: { value: false }, launchSequence: 0, warming: null, warm: async () => true, device: { platform, embedded: options.embedded || false },
    model: { clearFeedback() {}, warm: async () => true, verifiedFile: async () => ({ filename: '课表.ics', blob: new Blob(['calendar']) }),
      subscription: options.subscription || (async () => link(true).url), notice: text => calls.push({ kind: 'notice', text }) },
    canShare: () => options.canShare !== false, nativeFile: file => file,
    navigator: { share: async () => { calls.push({ kind: 'share' }); if (options.error) throw { name: options.error } } },
    window: { location: { assign: url => calls.push({ kind: 'navigate', url }) } }, downloadFile: () => calls.push({ kind: 'download' }), copySite: async () => calls.push({ kind: 'copy-public-site' }) }
  const run = vm.runInNewContext(beginSource + '\nbegin', context)
  return { run, calls, context, scope }
}
test('the actual Apple primary handler launches the checked native-calendar link, not a second export preview', async () => {
  const s = handoff('apple'); await s.run(); assert.equal(s.calls.filter(x => x.kind === 'navigate').length, 1)
  assert.equal(s.calls.some(x => x.kind === 'download' || x.kind === 'share'), false)
  assert.ok(s.calls.filter(x => x.kind === 'notice').every(x => !x.text.includes('导入成功')))
})
test('the same actual handler hands Android and Harmony files to the system without a fake calendar package or version branch', async () => {
  for (const platform of ['android', 'harmony']) { const s = handoff(platform); await s.run(); assert.equal(s.calls.filter(x => x.kind === 'share').length, 1); assert.equal(s.calls.some(x => x.kind === 'navigate' || x.kind === 'download'), false) }
})
test('one header action waits for private preparation and suppresses repeated launches while it is pending', async () => {
  const s = handoff('harmony'); let finish
  s.context.state.busy = true; s.context.warming = new Promise(resolve => { finish = resolve })
  const first = s.run(), repeated = s.run(); assert.equal(s.context.launching.value, true)
  s.context.state.busy = false; finish(true); await Promise.all([first, repeated])
  assert.equal(s.calls.filter(x => x.kind === 'share').length, 1); assert.equal(s.context.launching.value, false)
})
test('unsupported file handoff, cancelled chooser and lost browser activation remain distinct honest states', async () => {
  const fallback = handoff('harmony', { canShare: false }); await fallback.run(); assert.equal(fallback.calls.filter(x => x.kind === 'download').length, 1)
  const cancelled = handoff('android', { error: 'AbortError' }); await cancelled.run(); assert.equal(cancelled.calls.some(x => x.kind === 'notice' || x.kind === 'download'), false)
  const blocked = handoff('android', { error: 'NotAllowedError' }); await blocked.run(); assert.equal(blocked.calls.some(x => x.kind === 'download'), false); assert.match(blocked.calls.find(x => x.kind === 'notice').text, /再点一次/)
})
test('embedded browsers can try the same safe HTTPS handoff and late account changes cannot launch an old private URL', async () => {
  const embedded = handoff('apple', { embedded: true }); await embedded.run(); assert.equal(embedded.calls.filter(x => x.kind === 'navigate').length, 1)
  let finish; const late = handoff('apple', { subscription: () => new Promise(resolve => { finish = resolve }) }); const pending = late.run(); late.scope.value = 'owner-b:10'; finish(link(true).url); await pending
  assert.equal(late.calls.some(x => x.kind === 'navigate'), false)
})
