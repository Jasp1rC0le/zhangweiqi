import { createRequire } from 'node:module'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: ['/Users/zhangweiqi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }))
const output = await mkdtemp(path.join(tmpdir(), 'campthink-free-budget-'))
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
const errors = [], checks = []
let state = 'ok'
page.on('pageerror', error => errors.push(error.message))
const window = { from: '2026-10-04', until: '2026-10-05', attempts: 13, completed: 10, failed: 2, unresolved: 3,
  inputTokens: 42000, outputTokens: 8500, estimatedCny: 0.152, occupiedCny: 0.476, limitCny: 10 }
await page.route(url => url.pathname.startsWith('/api/'), async route => {
  const url = new URL(route.request().url())
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  if (url.pathname === '/api/auth/refresh') return json({ token: 'isolated-fixture' })
  if (url.pathname === '/api/auth/me') return json({ id: -771, username: 'fixture', nickname: '验收管理员', schoolId: 1, role: 'ADMIN' })
  if (url.pathname === '/api/ai/quota') return json({ limit: 20000, remaining: 19000, unit: 'tokens' })
  if (url.pathname === '/api/models') return json([{ key: 'standard', available: true, configured: true, name: '问答' }])
  if (url.pathname === '/api/admin/ai-budget/daily') {
    if (state === 'export-error') return json({ message: 'temporary failure' }, 503)
    if (state === 'export-empty') return json([])
    assert.equal(url.searchParams.get('from'), '2026-10-04')
    assert.equal(url.searchParams.get('until'), '2026-10-05')
    return json([{ date: '2026-10-04', provider: 'deepseek', model: 'flash', attempts: 13, unresolved: 3, inputTokens: 42000, outputTokens: 8500, estimatedCny: '0.152000', occupiedCny: '0.476000' }])
  }
  if (url.pathname === '/api/admin/ai-budget') {
    if (state === 'malformed') return json({ enabled: true })
    if (state === 'denied') return json({ message: '仅配置的成本管理员可查看全站预算' }, 403)
    if (state === 'error') return json({ message: 'temporary failure' }, 503)
    const item = state === 'empty' ? { ...window, attempts: 0, completed: 0, failed: 0, unresolved: 0, inputTokens: 0, outputTokens: 0, estimatedCny: 0, occupiedCny: 0 } : window
    return json({ enabled: state !== 'disabled', date: '2026-10-04', timezone: 'Asia/Shanghai', currency: 'CNY', today: item, month: { ...item, limitCny: 200 } })
  }
  if (url.pathname === '/api/admin/overview') return json({ recentModelCalls: 0, recentModelTokens: null })
  return json([])
})
try {
  await page.goto('http://localhost:5173/admin')
  await page.getByRole('button', { name: /模型用量/ }).click()
  await page.getByRole('heading', { name: '免费版预算' }).waitFor()
  await page.getByText('¥0.4760', { exact: false }).first().waitFor()
  assert.equal(await page.locator('.budget-windows article').count(), 2)
  assert.equal(await page.locator('.budget-warning').count(), 2)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: path.join(output, 'budget-desktop.png'), fullPage: true })
  checks.push('daily/monthly budget and unresolved cost shown separately, desktop fits')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出对账明细' }).click()
  const download = await downloadEvent
  assert.match(await readFile(await download.path(), 'utf8'), /estimatedCny/)
  checks.push('date-bounded daily CSV downloads after authenticated request')
  state = 'export-empty'
  await page.getByRole('button', { name: '导出对账明细' }).click()
  await page.getByText('所选日期没有记录，未生成空账单').waitFor()
  checks.push('empty export is explicit, not a zero-cost bill')
  state = 'export-error'
  await page.getByRole('button', { name: '导出对账明细' }).click()
  await page.getByText(/导出失败，未生成账单/).waitFor()
  checks.push('export failure is recoverable and does not fake a download')
  state = 'error'
  await page.getByRole('button', { name: '刷新预算' }).click()
  await page.getByText(/暂时无法读取预算/).waitFor()
  assert.equal(await page.locator('.budget-windows').count(), 0)
  checks.push('failure never displays stale balances or zero costs')
  state = 'denied'
  await page.getByRole('button', { name: '刷新预算' }).click()
  await page.getByText(/全站预算仅向指定/).waitFor()
  checks.push('operator permission failure is explicit')
  state = 'empty'
  await page.getByRole('button', { name: '刷新预算' }).click()
  await page.getByText(/尚无记账记录/).first().waitFor()
  checks.push('empty ledger does not claim historical usage is zero')
  state = 'disabled'
  await page.getByRole('button', { name: '刷新预算' }).click()
  await page.getByText(/预算保护未启用/).waitFor()
  checks.push('disabled guard warns against public launch')
  state = 'malformed'
  await page.getByRole('button', { name: '刷新预算' }).click()
  await page.getByText(/暂时无法读取预算/).waitFor()
  assert.equal(await page.locator('.budget-windows').count(), 0)
  checks.push('malformed response fails visibly instead of rendering NaN or zero')
  state = 'ok'
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '刷新预算' }).click()
  await page.locator('.budget-windows').waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.getByRole('heading', { name: '免费版预算' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(output, 'budget-mobile.png') })
  await page.locator('.budget-footnote').scrollIntoViewIfNeeded()
  await page.locator('.budget-footnote').waitFor({ state: 'visible' })
  await page.screenshot({ path: path.join(output, 'budget-mobile-bottom.png') })
  checks.push('mobile single-column budget cards fit viewport')
  assert.deepEqual(errors, [])
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, errors, mockedApi: true }, null, 2))
  console.log(JSON.stringify({ checks, output }, null, 2))
} finally { await browser.close() }
