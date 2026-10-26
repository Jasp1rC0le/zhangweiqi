// Uses a temporary Caddy CA trusted only by this process. Never installs a root in the OS.
import { mkdtemp, readFile, writeFile, readdir, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import assert from 'node:assert/strict'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const folder = await mkdtemp(path.join(tmpdir(), 'campthink-tls-smoke-')); await chmod(folder, 0o700)
const binary = process.env.CADDY_BIN
if (!binary?.startsWith('/')) throw new Error('Set CADDY_BIN to the absolute, checksum-verified Caddy executable')
const checks = [], received = []
let child, logs = ''
const backend = http.createServer((req, res) => {
  received.push(req.headers)
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' })
  res.write('data: first\n\n'); setTimeout(() => res.end('data: done\n\n'), 200)
})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const request = (url, options) => new Promise((resolve, reject) => {
  const request = (url.startsWith('https:') ? https : http).get(url, options, response => {
    let body = ''; let chunks = 0
    response.on('data', chunk => { body += chunk; chunks++ })
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body, chunks }))
  }); request.on('error', reject); request.setTimeout(5000, () => request.destroy(new Error('Request timeout')))
})
try {
  for (const port of [34443, 34480]) {
    const probe = http.createServer()
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve) })
    await new Promise(resolve => probe.close(resolve))
  }
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve))
  let config = await readFile(path.join(root, 'deploy/Caddyfile.example'), 'utf8')
  config = '{\n admin off\n skip_install_trust\n http_port 34480\n https_port 34443\n}\n'
    + config.replace('campthink.cn {', 'localhost:34443 {\n bind 127.0.0.1\n tls internal')
      .replace('/srv/campus-ai-web', path.join(root, 'campus-ai-web/dist'))
      .replace('127.0.0.1:8080', `127.0.0.1:${backend.address().port}`)
  await writeFile(path.join(folder, 'Caddyfile'), config)
  child = spawn(binary, ['run', '--config', path.join(folder, 'Caddyfile'), '--adapter', 'caddyfile'], {
    env: { ...process.env, XDG_DATA_HOME: path.join(folder, 'data'), XDG_CONFIG_HOME: path.join(folder, 'config') }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', chunk => { logs += chunk }); child.stderr.on('data', chunk => { logs += chunk })
  let ca
  for (let i = 0; i < 60; i++) {
    if (child.exitCode != null) throw new Error('Caddy stopped before TLS became ready')
    try {
      ca = await readFile(path.join(folder, 'data/caddy/pki/authorities/local/root.crt'))
      await request('https://localhost:34443/', { ca, family: 4 }); break
    } catch { await delay(200) }
  }
  assert.ok(ca)
  const secure = (route, extra = {}) => request(`https://localhost:34443${route}`, { ca, family: 4, ...extra })
  const page = await secure('/privacy')
  assert.equal(page.status, 200); assert.match(page.body, /<div id="app">/)
  checks.push('valid local TLS chain and hostname; SPA deep links serve the production bundle')
  assert.match(page.headers['strict-transport-security'], /max-age=31536000/)
  assert.match(page.headers['content-security-policy'], /worker-src 'self' blob:/)
  assert.equal(page.headers['x-content-type-options'], 'nosniff')
  assert.equal(page.headers['x-frame-options'], 'DENY')
  assert.equal(page.headers['permissions-policy'], 'camera=(), microphone=(self), geolocation=()')
  assert.equal(page.headers['cache-control'], 'no-cache')
  checks.push('HSTS, CSP worker policy, anti-sniffing, clickjacking, same-origin opt-in microphone policy and no-cache shell headers')
  assert.equal((await secure('/.env')).status, 404); assert.equal((await secure('/design-review.html')).status, 404)
  checks.push('development previews and secret paths blocked')
  const asset = (await readdir(path.join(root, 'campus-ai-web/dist/assets'))).find(name => name.endsWith('.js'))
  assert.match((await secure(`/assets/${asset}`)).headers['cache-control'], /immutable/)
  checks.push('hashed assets use immutable cache')
  const stream = await secure('/api/test-stream', { headers: { 'X-Forwarded-For': '203.0.113.8', Forwarded: 'for=203.0.113.8', 'X-Forwarded-Proto': 'http' } })
  assert.equal(stream.status, 200); assert.ok(stream.chunks >= 2); assert.match(stream.body, /first[\s\S]*done/)
  assert.equal(received.at(-1)['x-forwarded-for'], '127.0.0.1')
  assert.equal(received.at(-1)['x-forwarded-proto'], 'https')
  assert.equal(received.at(-1).forwarded, undefined)
  checks.push('SSE streams without waiting for completion; spoofed proxy identity discarded')
  const redirect = await request('http://localhost:34480/privacy', { family: 4 })
  // Caddy's https_port changes its internal listener, not the public 443 redirect target.
  assert.equal(redirect.status, 308); assert.equal(redirect.headers.location, 'https://localhost/privacy')
  checks.push('HTTP redirects to HTTPS preserving route')
  await assert.rejects(request('https://localhost:34443/', { family: 4 }))
  checks.push('temporary CA is not trusted by the operating system')
  await writeFile(path.join(folder, 'result.json'), JSON.stringify({ checks, production: false, publicCertificate: false }, null, 2))
  console.log(JSON.stringify({ checks, evidence: folder }, null, 2))
} finally {
  if (child && child.exitCode == null) {
    const stopped = new Promise(resolve => child.once('close', resolve)); child.kill('SIGTERM')
    await Promise.race([stopped, delay(5000)])
    if (child.exitCode == null) { child.kill('SIGKILL'); await stopped }
  }
  await new Promise(resolve => backend.close(resolve))
  await writeFile(path.join(folder, 'caddy.log'), logs)
}
