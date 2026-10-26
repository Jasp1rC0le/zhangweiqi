// Production-asset startup check, no database, authentication or external services.
import {createServer} from 'node:http'
import {readFile, stat, mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {createRequire} from 'node:module'
const root = path.resolve(process.argv[2]), out = path.resolve(process.argv[3])
const requestedPath = process.argv[4] || '/login?reauth=1'
const blockedModule = process.argv[5]
if (!/^\/(?!\/)/.test(requestedPath) || requestedPath.includes('\\')) throw new Error('Use a local absolute test path')
await stat(path.join(root, 'index.html')); await mkdir(out, {recursive: true, mode: 0o700})
const failures = [], responses = []
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg'}
const server = createServer(async (req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  if (blockedModule && name.includes(blockedModule) && name.endsWith('.js')) { res.writeHead(404); res.end(); return }
  if (name.includes('..') || name.includes('\\')) { res.writeHead(400); res.end(); return }
  if (name.startsWith('/api/')) { res.writeHead(503); res.end(); return }
  let target = path.join(root, name)
  try { if (!(await stat(target)).isFile()) target = path.join(root, 'index.html') }
  catch { target = path.extname(name) ? null : path.join(root, 'index.html') }
  if (!target) { res.writeHead(404); res.end(); return }
  res.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream'}); res.end(await readFile(target))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const require = createRequire('/Users/zhangweiqi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
let browser
try {
  browser = await require('playwright').chromium.launch({channel: 'chrome', headless: true, timeout: 12000})
  const page = await browser.newPage({viewport: {width: 1440, height: 1050}}); page.setDefaultTimeout(6000)
  page.on('pageerror', error => failures.push(error.stack))
  page.on('response', response => { if (response.status() >= 400) responses.push({url: new URL(response.url()).pathname, status: response.status()}) })
  await page.goto(`http://127.0.0.1:${server.address().port}${requestedPath}`, {timeout: 15000})
  await page.locator('h1').first().waitFor().catch(() => {})
  const headings = await page.locator('h1,h2').allTextContents()
  await page.screenshot({path: path.join(out, 'page.png'), fullPage: true, animations: 'disabled'})
  const result = {at: new Date().toISOString(), failures, responses, headings, passed: failures.length === 0 && headings.length > 0}
  await writeFile(path.join(out, 'receipt.json'), JSON.stringify(result, null, 2), {mode: 0o600})
  console.log(JSON.stringify(result, null, 2)); if (!result.passed) process.exitCode = 1
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
