// Fresh loopback MySQL + packaged application + production static files.
// No existing DB, browser profile, environment credentials, mail or model service.
import {mkdtemp, mkdir, readFile, writeFile, chmod, stat, realpath} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {spawn} from 'node:child_process'
import {createServer, request as httpRequest} from 'node:http'
import {tmpdir} from 'node:os'
import {randomBytes, randomUUID} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

export const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = '/usr/local/mysql-8.4.11-macos15-arm64/bin'
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
export async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise(resolve => child.once('close', resolve))
  child.kill('SIGTERM'); await Promise.race([exited, pause(5000)])
  if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited }
}
export async function run(binary, args, input = '', timeout = 30000) {
  const child = spawn(binary, args, {stdio: ['pipe', 'pipe', 'pipe']})
  child.stdin.on('error', () => {})
  let output = ''; child.stdout.on('data', data => { output += data }); child.stderr.resume()
  const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
  try {
    await new Promise((resolve, reject) => {
      child.once('error', () => reject(new Error('Could not start ' + path.basename(binary))))
      child.once('close', code => code === 0 ? resolve() : reject(new Error(path.basename(binary) + ' failed with exit ' + code)))
      child.stdin.end(input)
    })
    return output.trim()
  } finally { clearTimeout(timer) }
}
async function listen(server, port = 0, host = '127.0.0.1') { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve) }); return server.address().port }
async function freePort() { const probe = createServer(); const port = await listen(probe); await new Promise(resolve => probe.close(resolve)); return port }
async function waitFor(check, child, name) {
  const end = Date.now() + 45000
  while (Date.now() < end) {
    if (child?.exitCode !== null || child?.signalCode !== null) throw new Error(name + ' exited before ready')
    try { if (await check()) return } catch { /* bounded startup only */ }
    await pause(200)
  }
  throw new Error(name + ' startup exceeded 45 seconds')
}
export async function fixture(release, options = {}) {
  if (!path.isAbsolute(release)) throw new Error('Explicit release directory required')
  if (options.smtpPort !== undefined && (!Number.isInteger(options.smtpPort) || options.smtpPort < 1024 || options.smtpPort > 65535)) throw new Error('Invalid loopback SMTP fixture port')
  if (options.webPort !== undefined && (!Number.isInteger(options.webPort) || options.webPort < 1024 || options.webPort > 65535)) throw new Error('Invalid loopback web port')
  if (options.webHost !== undefined && !['127.0.0.1', '::1'].includes(options.webHost)) throw new Error('Web fixture must remain loopback')
  if (options.smtpFrom !== undefined && !['fixture@example.invalid', 'contact@campthinkhub.cn'].includes(options.smtpFrom)) throw new Error('Unapproved fixture sender')
  if (options.modelResponder !== undefined && typeof options.modelResponder !== 'function') throw new Error('Model responder must be an explicit in-process synthetic function')
  if (options.visionModel !== undefined && typeof options.visionModel !== 'boolean') throw new Error('Synthetic vision switch must be boolean')
  if (options.formalTeaching !== undefined && typeof options.formalTeaching !== 'boolean') throw new Error('Synthetic teaching switch must be boolean')
  await stat(path.join(release, 'server.jar')); await stat(path.join(release, 'web/index.html'))
  const folder = await mkdtemp(path.join(await realpath(tmpdir()), 'campthink-ops-20261021-')); await chmod(folder, 0o700)
  const suffix = randomBytes(6).toString('hex'), db = 'campthink_ops_20261021_' + suffix
  const data = path.join(folder, 'mysql'), originals = path.join(folder, 'originals'), multipart = path.join(folder, 'multipart')
  await mkdir(data); await mkdir(originals, {mode: 0o700}); await mkdir(multipart, {mode: 0o700})
  const socket = path.join(folder, 'mysql.sock'), appPort = await freePort(), dbPort = await freePort()
  const client = ['--no-defaults', '--protocol=SOCKET', '--socket=' + socket, '-u', 'root', '--batch', '--raw', '--skip-column-names']
  const sql = (text, database = db) => run(path.join(bin, 'mysql'), [...client, ...(database ? ['--database=' + database] : [])], text)
  let mysql, app, appLog = '', stopped = false, modelCalls = 0, currentDb = db
  const model = createServer(async (req, res) => {
    modelCalls++
    if (!options.modelResponder) { res.writeHead(503); res.end('No model calls allowed in this drill'); return }
    try {
      if (req.method !== 'POST' || !['/chat/completions', ...(options.visionModel ? ['/tokenizers/estimate-token-count'] : [])].includes(req.url)) { res.writeHead(404); res.end(); return }
      const chunks = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > (options.visionModel ? 3 * 1024 * 1024 : 65536)) throw new Error('Synthetic model request too large'); chunks.push(chunk) }
      const answer = await options.modelResponder(JSON.parse(Buffer.concat(chunks).toString('utf8')), req.url)
      res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(answer))
    } catch { res.writeHead(500); res.end('Synthetic model responder failed') }
  })
  const modelPort = await listen(model)
  const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.gz': 'application/gzip'}
  const web = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname.endsWith('.js') && [...(options.blockedAssets || [])].some(pattern => url.pathname.includes(pattern))) {
      res.writeHead(404); res.end(); return
    }
    if (url.pathname.startsWith('/api/')) {
      const proxy = httpRequest({hostname: '127.0.0.1', port: appPort, path: req.url, method: req.method, headers: req.headers, timeout: 12000}, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res) })
      proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() }); proxy.on('timeout', () => proxy.destroy())
      req.on('aborted', () => proxy.destroy()); req.pipe(proxy); return
    }
    try {
      let name = decodeURIComponent(url.pathname)
      if (name.includes('..') || name.includes('\\') || name.includes('\0')) { res.writeHead(400); res.end(); return }
      let target = path.join(release, 'web', name)
      try { if (!(await stat(target)).isFile()) target = path.join(release, 'web/index.html') }
      catch { target = path.join(release, 'web/index.html') }
      res.writeHead(200, {'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store'})
      createReadStream(target).pipe(res)
    } catch { res.writeHead(500); res.end() }
  })
  const webHost = options.webHost || '127.0.0.1'
  const webPort = await listen(web, options.webPort || 0, webHost), origin = `http://${webHost === '::1' ? '[::1]' : webHost}:${webPort}`, backend = `http://127.0.0.1:${appPort}`
  const dbPassword = randomBytes(24).toString('hex'), jwtSecret = randomBytes(48).toString('base64')
  const close = async () => {
    if (stopped) return; stopped = true
    web.closeAllConnections(); model.closeAllConnections()
    await Promise.all([new Promise(resolve => web.close(resolve)), new Promise(resolve => model.close(resolve))])
    await stopChild(app); await stopChild(mysql)
    await writeFile(path.join(folder, 'application.log'), appLog, {mode: 0o600})
  }
  const api = async (method, endpoint, body, token) => {
    const response = await fetch(backend + endpoint, {method, signal: AbortSignal.timeout(15000),
      headers: {Origin: origin, ...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body instanceof FormData || body === undefined ? {} : {'Content-Type': 'application/json'})},
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)})
    const text = await response.text(); let value
    try { value = text ? JSON.parse(text) : null } catch { value = text }
    return {status: response.status, value, headers: response.headers}
  }
  const startApp = async (database, materialRoot) => {
    await stopChild(app); currentDb = database
    await sql(`GRANT ALL ON \`${database}\`.* TO 'campthink_ops'@'127.0.0.1'`, '')
    const env = {PATH: process.env.PATH, LANG: 'en_US.UTF-8', TZ: 'Asia/Shanghai',
      DB_HOST: '127.0.0.1', DB_PORT: String(dbPort), DB_NAME: database, DB_USERNAME: 'campthink_ops', DB_PASSWORD: dbPassword,
      SERVER_ADDRESS: '127.0.0.1', SERVER_PORT: String(appPort), JWT_SECRET: jwtSecret, SPRING_SQL_INIT_MODE: 'never',
      CORS_ALLOWED_ORIGINS: origin, PUBLIC_WEB_URL: origin, AUTH_SECURE_COOKIES: 'false',
      SPRING_SERVLET_MULTIPART_LOCATION: multipart, APP_MATERIALS_STORAGE_DIR: materialRoot,
      APP_TEACHING_REQUESTS_MAX_IN_FLIGHT: String(options.maxInFlight || 16),
      DEEPSEEK_API_KEY: 'synthetic-no-outbound', DEEPSEEK_BASE_URL: `http://127.0.0.1:${modelPort}`,
      KIMI_API_KEY: options.visionModel ? 'synthetic-no-outbound' : '', KIMI_BASE_URL: `http://127.0.0.1:${modelPort}`, KIMI_MODEL: 'kimi-k3', GLM_API_KEY: '', BOCHA_API_KEY: '', KNOWLEDGE_SEMANTIC_API_KEY: '', WEB_SEARCH_ENABLED: 'false',
      SMTP_HOST: options.smtpPort ? '127.0.0.1' : '', SMTP_PORT: String(options.smtpPort || 465), SMTP_USERNAME: '', SMTP_PASSWORD: '', SMTP_FROM: options.smtpPort ? (options.smtpFrom || 'fixture@example.invalid') : '',
      SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH: options.smtpPort ? 'false' : 'true', SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE: options.smtpPort ? 'false' : 'true',
      KNOWLEDGE_SEED_OFFICIAL_SCHOOL: 'false', CAREER_SEED_OFFICIAL_CANDIDATES: 'false', APP_JOBS_ENABLED: 'false',
      JOB_INITIAL_DELAY_MILLIS: '3600000', APP_TEACHING_ENABLED: options.formalTeaching ? 'true' : 'false', APP_TEACHING_IDENTITY_ENABLED: options.formalTeaching ? 'true' : 'false', APP_TEACHING_ROSTER_ENABLED: 'false',
      APP_TEACHING_LIFECYCLE_ENABLED: 'false', APP_TEACHING_RESPONSIBILITY_ENABLED: 'false', APP_TEACHING_LESSON_CHANGE_ENABLED: 'false'}
    app = spawn('java', ['-XX:ActiveProcessorCount=4', '-Xms128m', '-Xmx512m', '-jar', path.join(release, 'server.jar')], {env, stdio: ['ignore', 'pipe', 'pipe']})
    app.stdout.on('data', bytes => { appLog += bytes }); app.stderr.on('data', bytes => { appLog += bytes })
    await waitFor(async () => (await api('GET', '/api/health/ready')).status === 200, app, 'Backend')
  }
  try {
    await run(path.join(bin, 'mysqld'), ['--no-defaults', '--initialize-insecure', '--datadir=' + data, '--log-error=' + path.join(folder, 'mysql.log')], '', 45000)
    mysql = spawn(path.join(bin, 'mysqld'), ['--no-defaults', '--datadir=' + data, '--socket=' + socket, '--pid-file=' + path.join(folder, 'mysql.pid'), '--port=' + dbPort, '--bind-address=127.0.0.1', '--mysqlx=OFF', '--innodb-buffer-pool-size=64M', '--log-error=' + path.join(folder, 'mysql.log')], {stdio: 'ignore'})
    await waitFor(async () => { await sql('SELECT 1', ''); return true }, mysql, 'MySQL')
    await sql(`CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4; CREATE USER 'campthink_ops'@'127.0.0.1' IDENTIFIED BY '${dbPassword}';`, '')
    await sql(await readFile(path.join(release, 'schema-new-database-only.sql'), 'utf8'))
    if (options.formalTeaching) {
      if (!/^campthink_ops_20261021_[a-f0-9]{12}$/.test(db)) throw new Error('Teaching fixture must use its fresh task database')
      for (const name of ['2026-10-14-teaching-attendance.sql', '2026-10-15-teaching-identities.sql'])
        await sql(await readFile(path.join(repo, 'deploy/migrations', name), 'utf8'))
    }
    const config = path.join(folder, 'mysql.cnf')
    await writeFile(config, `[client]\nuser=root\nprotocol=socket\nsocket=${socket}\n`, {mode: 0o600})
    await startApp(db, originals)
    const upload = async (token, name, bytes, text = '', requestId = randomUUID()) => {
      const form = new FormData(); form.set('requestId', requestId); form.set('file', new Blob([bytes]), name); form.set('text', text)
      return api('POST', '/api/private-materials', form, token)
    }
    return {folder, db, suffix, config, originals, multipart, origin, backend, appPort, sql, api, upload, startApp, close,
      mysqlBin: path.join(bin, 'mysql'), dumpBin: path.join(bin, 'mysqldump'), modelCalls: () => modelCalls,
      currentDb: () => currentDb, pids: () => ({mysql: mysql.pid, app: app.pid}), stopped: () => stopped}
  } catch (error) { await close(); throw error }
}
