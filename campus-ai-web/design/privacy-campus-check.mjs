import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: ['/Users/zhangweiqi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }))
const output = await mkdtemp(path.join(tmpdir(), 'campthink-privacy-campus-'))
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(10000)
const checks = [], errors = []
async function settlePage() {
  await page.waitForFunction(() => {
    const route = document.querySelector('.route-page')
    return route && getComputedStyle(route).opacity === '1' && !route.className.includes('enter-')
  })
  await page.evaluate(() => document.fonts.ready)
}
async function captureViewport(name, locator) {
  if (locator) await locator.scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(output, name) })
}
let school = '天津中德应用技术大学'
page.on('pageerror', error => errors.push(error.message))
await page.route(url => url.pathname.startsWith('/api/'), route => {
  const pathname = new URL(route.request().url()).pathname
  const json = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  if (pathname === '/api/auth/refresh') return json({ token: 'isolated-fixture' })
  if (pathname === '/api/auth/me') return json({ id: -775, username: 'fixture', nickname: '测试同学', schoolId: 1, role: 'STUDENT' })
  if (pathname === '/api/schools') return json([{ id: 1, name: school }])
  if (pathname === '/api/models') return json([{ key: 'standard', name: '问答', available: true }])
  if (pathname === '/api/ai/quota') return json({ limit: 20000, remaining: 19000, unit: 'tokens' })
  return json([])
})
try {
  await page.goto('http://localhost:5173/privacy')
  await page.getByText(/版本 2026-10-27/).waitFor()
  await settlePage()
  assert.ok(await page.getByText('河北从简科技有限公司', { exact: true }).first().isVisible())
  assert.equal(await page.locator('.provider-list dt').count(), 5)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: path.join(output, 'privacy-desktop.png') })
  checks.push('current policy version, verified operator and five configured processor categories visible without login')
  await page.getByRole('link', { name: '使用规则', exact: true }).click()
  await page.getByRole('heading', { name: '免费版使用规则' }).waitFor()
  checks.push('policy section navigation reaches actual terms')
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('http://localhost:5173/privacy')
  await settlePage()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: path.join(output, 'privacy-mobile.png') })
  await page.getByRole('link', { name: '第三方服务', exact: true }).click()
  await captureViewport('providers-mobile.png', page.locator('#providers h2'))
  checks.push('mobile policy and long processor names wrap without horizontal overflow')
  for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport); await page.goto('http://localhost:5173/chat')
    await settlePage()
    await page.getByRole('button', { name: /校园速查/ }).click()
    await page.getByRole('heading', { name: '官网速查，不用等 AI' }).waitFor()
    const panel = page.locator('.campus-directory')
    await panel.getByText('图书馆', { exact: true }).click()
    await panel.getByText('学院与学习', { exact: true }).click()
    assert.equal(await panel.locator('a').count(), 8)
    assert.equal(await panel.locator('a:not([rel="noopener noreferrer"])').count(), 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await captureViewport(`campus-${label}.png`, panel.getByRole('heading'))
    await captureViewport(`campus-${label}-bottom.png`, panel.locator('a').last())
    assert.ok(await panel.locator('a').last().evaluate(el => {
      const r = el.getBoundingClientRect()
      return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth
    }))
    checks.push(`${label}: eight sourced entries, accessible disclosures and explicit external links`)
  }
  school = '其他学校'; await page.reload()
  await page.getByRole('button', { name: /校园速查/ }).click()
  assert.equal(await page.locator('.campus-directory').count(), 0)
  checks.push('other schools are not shown Tianjin Sino-German local facts')
  assert.deepEqual(errors, [])
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, errors, mockedApi: true }, null, 2))
  console.log(JSON.stringify({ checks, output }, null, 2))
} finally { await browser.close() }
