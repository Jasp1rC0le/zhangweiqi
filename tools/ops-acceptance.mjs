import assert from 'node:assert/strict'
import {randomBytes, createHash} from 'node:crypto'
import {readFile, writeFile, mkdir, cp, readdir} from 'node:fs/promises'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fixture, repo, pause} from './ops-fixture.mjs'
import {backup, restore, terminateChildren} from '../deploy/app-backup.mjs'

const release = process.argv[2]
const browserOnly = process.argv.includes('--browser-only')
const withBrowser = process.argv.includes('--browser') || browserOnly
const receipt = {startedAt: new Date().toISOString(), isolated: true, checks: [], productionChanged: false}
const checked = (name, detail = true) => { receipt.checks.push({name, detail}); console.log('PASS ' + name) }
let active, browser, page
const deadline = setTimeout(() => { terminateChildren(); void active?.close().finally(() => process.exit(124)) }, 240000)
process.once('SIGTERM', () => { terminateChildren(); void active?.close().finally(() => process.exit(143)) })
try {
  active = await fixture(release)
  receipt.fixture = {folder: active.folder, sourceSchema: active.db, webOrigin: active.origin}
  const password = randomBytes(20).toString('hex'), ownerName = 'ops21_owner_' + active.suffix, otherName = 'ops21_other_' + active.suffix
  for (const username of [ownerName, otherName]) assert.equal((await active.api('POST', '/api/users', {username, nickname: '隔离合成验收', password, schoolId: 1, privacyAccepted: true, policyVersion: '2026-10-04'})).status, 201)
  const login = async username => { const response = await active.api('POST', '/api/auth/login', {username, password}); assert.equal(response.status, 200); return response.value.token }
  const oldToken = await login(ownerName), otherToken = await login(otherName)
  checked('normal registration and password login against real MySQL/Java')
  const course = {revision: 0, semester: '隔离合成2026秋', firstMonday: '2026-10-19', remindDays: 7,
    courses: [{name: '恢复验收课程', weekday: 3, startTime: '14:00', endTime: '14:45', weeks: [1, 2], room: '合成教室A'}]}
  assert.equal((await active.api('PUT', '/api/timetable/courses', course, oldToken)).status, 200)
  const original = Buffer.from('仅用于本机隔离恢复验收\n课程,分数\n合成课,88\n')
  const saved = await active.upload(oldToken, 'synthetic-restore.csv', original, original.toString())
  assert.equal(saved.status, 200)
  assert.equal((await active.upload(otherToken, 'synthetic-other.txt', Buffer.from('other synthetic owner'))).status, 200)
  checked('real private course/history and two original uploads committed')
  await active.sql('RENAME TABLE personal_schedule_history TO fixture_held_history')
  try { assert.equal((await active.api('GET', '/api/health/ready')).status, 503) }
  finally { await active.sql('RENAME TABLE fixture_held_history TO personal_schedule_history') }
  assert.equal((await active.api('GET', '/api/health/ready')).status, 200)
  checked('missing new core table fails readiness; restoring it recovers readiness')
  let owner = oldToken, other = otherToken
  if (!browserOnly) {
  const key = path.join(active.folder, 'backup.key'), snapshot = path.join(active.folder, 'snapshot'), restoredRoot = path.join(active.folder, 'restored-originals')
  await writeFile(key, randomBytes(32).toString('base64'), {mode: 0o600})
  const options = {db: active.db, config: active.config, mysql: active.mysqlBin, mysqldump: active.dumpBin, key, materials: active.originals, out: snapshot, allowReadLock: true}
  let concurrentUpload, uploadSettled = false
  const savedSnapshot = await backup({...options, onLocked: async () => {
    concurrentUpload = active.upload(oldToken, 'after-snapshot.txt', Buffer.from('arrived after the snapshot read-lock')).finally(() => { uploadSettled = true })
    await pause(150)
    assert.equal(uploadSettled, false, 'the real concurrent writer must wait behind the snapshot lock')
  }})
  assert.equal(savedSnapshot.originals, 2)
  assert.equal((await concurrentUpload).status, 200)
  assert.equal(await active.sql('SELECT COUNT(*) FROM private_material_files'), '3')
  checked('application read-lock snapshot encrypts DB + both referenced originals', savedSnapshot)
  checked('concurrent normal upload waits for snapshot lock; source then has3, snapshot keeps2')
  const empty = path.join(active.folder, 'empty-originals'); await mkdir(empty, {mode: 0o700})
  const badSnapshot = path.join(active.folder, 'missing-source-snapshot')
  await assert.rejects(backup({...options, materials: empty, out: badSnapshot}))
  assert.equal((await readdir(badSnapshot)).includes('COMPLETE'), false)
  checked('missing source original cannot finalize a backup')
  const restoredDb = 'campthink_restore_ops21_' + active.suffix
  const restored = await restore({...options, db: restoredDb, from: snapshot, materials: restoredRoot})
  assert.equal(restored.originals, 2)
  assert.equal(await active.sql('SELECT COUNT(*) FROM auth_sessions', restoredDb), '0')
  assert.equal(await active.sql('SELECT COUNT(*) FROM account_action_tokens', restoredDb), '0')
  checked('exact tables/counts/original hashes restored without old sessions or action tokens', restored)
  await assert.rejects(restore({...options, db: restoredDb, from: snapshot, materials: path.join(active.folder, 'overwrite-refused')}), /overwrite/)
  const tampered = path.join(active.folder, 'tampered-snapshot'); await cp(snapshot, tampered, {recursive: true})
  const tamperedFile = path.join(tampered, saved.value.id + '.ctenc'), damaged = await readFile(tamperedFile); damaged[25] ^= 1; await writeFile(tamperedFile, damaged)
  const refusedDb = 'campthink_restore_refused_' + active.suffix
  await assert.rejects(restore({...options, db: refusedDb, from: tampered, materials: path.join(active.folder, 'tamper-refused')}))
  assert.equal(await active.sql(`SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${refusedDb}'`, ''), '0')
  checked('existing targets and corrupted ciphertext rejected before restore mutation')
  await active.startApp(restoredDb, restoredRoot)
  assert.equal((await active.api('GET', '/api/private-materials', undefined, oldToken)).status, 401)
  owner = await login(ownerName); other = await login(otherName)
  const downloaded = await fetch(active.backend + '/api/private-materials/' + saved.value.id + '/download', {headers: {Authorization: 'Bearer ' + owner}, signal: AbortSignal.timeout(6000)})
  assert.equal(downloaded.status, 200); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), original)
  assert.equal((await active.api('GET', '/api/private-materials/' + saved.value.id + '/download', undefined, other)).status, 404)
  assert.equal((await active.api('GET', '/api/timetable/courses', undefined, owner)).value.schedule.courses[0].name, course.courses[0].name)
  checked('restored packaged backend: fresh login/download works, old session401, other owner404')
  receipt.restorePassed = true
  }
  if (withBrowser) {
    const require = createRequire('/Users/zhangweiqi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
    browser = await require('playwright').chromium.launch({channel: 'chrome', headless: true, timeout: 12000})
    const context = await browser.newContext({viewport: {width: 1440, height: 1050}, acceptDownloads: true})
    page = await context.newPage(); page.setDefaultTimeout(6000); page.setDefaultNavigationTimeout(15000)
    const pageErrors = []; receipt.browserErrors = pageErrors
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.goto(active.origin + '/login?reauth=1')
    await page.locator('.intro-curtain').waitFor({state: 'detached'})
    if (!(await page.locator('#login-username').isVisible())) await page.getByRole('button', {name: '登录 / 注册', exact: true}).click()
    await page.locator('#login-username').fill(ownerName); await page.locator('#login-password').fill(password)
    await page.locator('#auth-panel-login button[type=submit]').click(); await page.waitForURL('**/chat')
    await page.getByRole('button', {name: '我的原件', exact: true}).click()
    const ownRow = page.locator('.original-list li').filter({hasText: 'synthetic-restore.csv'})
    await ownRow.waitFor(); assert.equal(await page.locator('.original-list li').count(), 1)
    const [file] = await Promise.all([page.waitForEvent('download', {timeout: 8000}), ownRow.getByRole('button', {name: '下载原件', exact: true}).click()])
    const fileBytes = await readFile(await file.path()); assert.deepEqual(fileBytes, original)
    await page.screenshot({path: path.join(active.folder, 'production-originals-desktop.png'), fullPage: true, animations: 'disabled'})
    await page.goto(active.origin + '/timetable')
    await page.getByRole('button', {name: '更新课表', exact: true}).click()
    await page.locator('.course-advanced > summary').click()
    await page.locator('.course-advanced textarea').fill('课程名称,星期,开始时间,结束时间,周次,教室\n浏览器保存合成课,3,14:00,14:45,1-2,合成教室B')
    await page.getByRole('button', {name: '检查并预览差异', exact: true}).click()
    await page.locator('.course-preview input[type=checkbox]').check()
    await page.getByRole('button', {name: '确认替换课程表格', exact: true}).click()
    await page.getByText('课程已保存，仅本人可见；下次登录直接查看', {exact: true}).waitFor()
    await page.reload(); await page.getByText('浏览器保存合成课', {exact: true}).first().waitFor()
    assert.equal((await active.api('GET', '/api/timetable/courses', undefined, owner)).value.schedule.courses[0].name, '浏览器保存合成课')
    await page.screenshot({path: path.join(active.folder, 'production-course-desktop.png'), fullPage: true, animations: 'disabled'})
    await page.locator('button[aria-controls="workspace-account-menu"]').click()
    await page.getByRole('button', {name: '退出登录', exact: true}).click()
    await page.getByRole('button', {name: '确认退出', exact: true}).click(); await page.waitForURL('**/login*')
    await page.goto(active.origin + '/chat'); await page.waitForURL('**/login*')
    checked('production build + real backend: browser login, own download hash, course save/reload and logout')
    const mobile = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
    const phone = await mobile.newPage(); phone.setDefaultTimeout(6000); phone.setDefaultNavigationTimeout(15000)
    phone.on('pageerror', error => pageErrors.push(error.message))
    await phone.goto(active.origin + '/login?reauth=1'); await phone.locator('.intro-curtain').waitFor({state: 'detached'})
    if (!(await phone.locator('#login-username').isVisible())) await phone.getByRole('button', {name: '登录 / 注册', exact: true}).click()
    await phone.locator('#login-username').fill(otherName); await phone.locator('#login-password').fill(password)
    await phone.locator('#auth-panel-login button[type=submit]').click(); await phone.waitForURL('**/chat')
    await phone.getByRole('button', {name: '我的原件', exact: true}).click()
    await phone.locator('.original-list li').filter({hasText: 'synthetic-other.txt'}).waitFor()
    assert.equal(await phone.locator('.original-list li').filter({hasText: 'synthetic-restore.csv'}).count(), 0)
    await phone.screenshot({path: path.join(active.folder, 'production-other-mobile.png'), fullPage: true, animations: 'disabled'})
    checked('second real browser account on mobile sees only its own original')
    assert.deepEqual(pageErrors, [])
    receipt.browser = {pageErrors, viewport: {width: 1440, height: 1050}, noResponseMocks: true, noTokenExtraction: true}
    await browser.close(); browser = undefined
  }
  assert.equal(active.modelCalls(), 0); receipt.modelCalls = 0; receipt.status = 'passed'
} catch (error) {
  receipt.status = 'failed'; receipt.failure = error.message; console.error(error.stack); process.exitCode = 1
  if (page && !page.isClosed()) {
    receipt.browserFailure = {url: page.url(), headings: await page.locator('h1,h2,h3').allTextContents(), loginVisible: await page.locator('#login-username').isVisible()}
    await page.screenshot({path: path.join(active.folder, 'browser-failure.png'), fullPage: true, animations: 'disabled'}).catch(() => {})
  }
} finally {
  if (browser) await browser.close()
  terminateChildren(); await active?.close(); clearTimeout(deadline)
  receipt.closedOwnServices = active?.stopped() ?? true; receipt.completedAt = new Date().toISOString()
  const directory = path.join(repo, '.local/runtime/operations-2026-10-21'); await mkdir(directory, {recursive: true, mode: 0o700})
  const target = path.join(directory, `restore${withBrowser ? '-browser' : ''}-${Date.now()}.json`)
  await writeFile(target, JSON.stringify(receipt, null, 2), {mode: 0o600})
  console.log('Receipt: ' + target)
}
