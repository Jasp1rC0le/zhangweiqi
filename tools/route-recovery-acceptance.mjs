// Real production files + real isolated HTTP. Only missing static resources are injected.
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import path from 'node:path'
import {fixture, repo} from './ops-fixture.mjs'

const out = path.join(repo, '.impeccable/review/route-recovery-2026-10-21')
await mkdir(out, {recursive: true})
const receipt = {at: new Date().toISOString(), captures: [], checks: [], errors: [], modelCalls: null}
const blockedAssets = new Set()
const mediumOnly = process.argv.includes('--medium-only')
let active, browser, currentPage
const deadline = setTimeout(() => { void active?.close().finally(() => process.exit(124)) }, 180000)
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const file = path.join(out, name + '.png')
  await page.screenshot({path: file, fullPage: true, animations: 'disabled'})
  const size = await page.evaluate(() => ({viewport: innerWidth, document: document.documentElement.scrollWidth}))
  assert.ok(size.document <= size.viewport, name + ': overflow')
  receipt.captures.push({file, ...size})
}
try {
  active = await fixture(process.argv[2], {blockedAssets})
  const require = createRequire('/Users/zhangweiqi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
  browser = await require('playwright').chromium.launch({channel: 'chrome', headless: true, timeout: 12000})
  const password = randomBytes(20).toString('hex'), username = 'recovery21_' + active.suffix
  assert.equal((await active.api('POST', '/api/users', {username, nickname: '恢复合成验收', password, schoolId: 1, privacyAccepted: true, policyVersion: '2026-10-27'})).status, 201)
  for (const device of mediumOnly ? ['medium'] : ['desktop', 'mobile']) {
    const options = {viewport: {width: device === 'desktop' ? 1440 : device === 'medium' ? 870 : 390, height: device === 'mobile' ? 844 : 1050}, ...(device === 'mobile' ? {isMobile: true, hasTouch: true} : {})}
    const makePage = async () => {
      const context = await browser.newContext(options), page = await context.newPage()
      currentPage = page; page.setDefaultTimeout(6000); page.setDefaultNavigationTimeout(15000)
      page.on('pageerror', error => receipt.errors.push(error.message))
      return {context, page}
    }
    let {context, page} = await makePage()
    await page.goto(active.origin + '/not-a-real-campthink-page?value=synthetic#private-fragment')
    await page.getByRole('heading', {name: '这个页面暂时找不到'}).waitFor()
    assert.doesNotMatch(await page.locator('.route-recovery').innerText(), /private-fragment|not-a-real-campthink-page/)
    await capture(page, 'not-found-' + device)
    await page.keyboard.press('Tab')
    const focus = await page.evaluate(() => ({outline: getComputedStyle(document.activeElement).outlineWidth, label: document.activeElement.getAttribute('aria-label')}))
    assert.equal(focus.outline, '2px')
    await page.getByRole('link', {name: '返回首页', exact: true}).click(); await page.locator('.landing').waitFor()
    receipt.checks.push({device, notFoundHomeNavigation: true, keyboardFocus: focus})
    await context.close()

    blockedAssets.add('LoginView-')
    ;({context, page} = await makePage())
    await page.goto(active.origin + '/login?reauth=1')
    await page.getByRole('heading', {name: '页面暂时没有载入'}).waitFor()
    assert.equal(await page.locator('.route-recovery-inline').count(), 0)
    await capture(page, 'cold-route-failure-' + device)
    blockedAssets.clear()
    await page.getByRole('button', {name: '重新载入', exact: true}).click(); await page.locator('.landing').waitFor()
    receipt.checks.push({device, coldReloadRecovered: true})
    await context.close()

    blockedAssets.add('/assets/index-')
    ;({context, page} = await makePage())
    await page.goto(active.origin + '/login?reauth=1')
    await page.locator('#campthink-startup[role=alert]').waitFor()
    await page.getByRole('heading', {name: '页面暂时没有载入'}).waitFor()
    await capture(page, 'entry-failure-' + device)
    blockedAssets.clear()
    await page.getByRole('link', {name: '返回首页重试', exact: true}).click(); await page.locator('.landing').waitFor()
    receipt.checks.push({device, failedEntryHasStaticRecovery: true, staticHomeRetryWorks: true})

    await page.locator('.intro-curtain').waitFor({state: 'detached'})
    if (!(await page.locator('#login-username').isVisible())) await page.getByRole('button', {name: '登录 / 注册', exact: true}).click()
    await page.locator('#login-username').fill(username); await page.locator('#login-password').fill(password)
    await page.locator('#auth-panel-login button[type=submit]').click(); await page.waitForURL('**/chat')
    const draft = '仅用于合成验收的未发送草稿'
    const composer = page.getByRole('textbox', {name: '输入消息', exact: true})
    await composer.fill(draft)
    const chooseStudy = async () => {
      await page.getByRole('button', {name: '工具', exact: true}).click()
      await page.getByRole('navigation', {name: '学习与项目工具'}).getByRole('button', {name: /实验与作业/}).click()
    }
    blockedAssets.add('StudyView-')
    await chooseStudy()
    const notice = page.locator('.route-recovery-inline')
    await notice.waitFor(); assert.equal(await composer.inputValue(), draft)
    assert.equal(new URL(page.url()).pathname, '/chat')
    assert.equal(await page.locator('.el-message--error').count(), 0)
    await capture(page, 'workspace-failure-' + device)
    await notice.getByRole('button', {name: '留在当前页面'}).click()
    assert.equal(await composer.inputValue(), draft)
    const focusAfterDismiss = await page.evaluate(() => {
      const node = document.activeElement
      return {tag: node.tagName, label: node.getAttribute('aria-label') || node.textContent.trim(),
        visible: node !== document.body && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'}
    })
    assert.equal(focusAfterDismiss.visible, true, 'dismissal must restore a visible control, not a hidden menu item')
    await chooseStudy(); await notice.waitFor()
    page.once('dialog', dialog => dialog.dismiss())
    await notice.getByRole('button', {name: '重新载入', exact: true}).click()
    assert.equal(new URL(page.url()).pathname, '/chat'); assert.equal(await composer.inputValue(), draft)
    blockedAssets.clear()
    const dialogs = []
    page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.accept() })
    await notice.getByRole('button', {name: '重新载入', exact: true}).click()
    await page.waitForURL('**/study'); await page.locator('.study-page').waitFor()
    receipt.checks.push({device, draftRetainedOnFailureAndCancel: true, focusAfterDismiss, currentPageKept: true, duplicateToast: false, confirmedReloadToStudy: true, dialogs})
    await context.close()
  }
  assert.deepEqual(receipt.errors, []); assert.equal(active.modelCalls(), 0)
  receipt.modelCalls = 0; receipt.status = 'passed'
} catch (error) {
  receipt.status = 'failed'; receipt.failure = error.message; process.exitCode = 1; console.error(error.message)
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({path: path.join(out, 'test-failure.png'), fullPage: true, animations: 'disabled'}).catch(() => {})
} finally {
  blockedAssets.clear(); await browser?.close(); await active?.close(); clearTimeout(deadline)
  receipt.closedOwnBrowserAndServices = true; receipt.completedAt = new Date().toISOString()
  const receiptFile = path.join(out, mediumOnly ? 'browser-medium.json' : 'browser.json')
  await writeFile(receiptFile, JSON.stringify(receipt, null, 2), {mode: 0o600})
  console.log(JSON.stringify({status: receipt.status, checks: receipt.checks, captureCount: receipt.captures.length, receipt: receiptFile}))
}
