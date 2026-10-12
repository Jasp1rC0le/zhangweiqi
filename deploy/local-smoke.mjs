// Real MySQL + packaged Java HTTP smoke test. Never touches the user's database or external AI.
// Requires MySQL binaries and a previously built server.jar. Artifacts stay in a fresh private temp folder.
import { mkdtemp, mkdir, readFile, writeFile, chmod, readdir, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { createServer as createSmtpServer } from 'node:net'
import assert from 'node:assert/strict'
import {checkFeedbackAndReviews,checkRefreshAndLogout} from './reliability-smoke.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bin = process.env.SMOKE_MYSQL_BIN || '/usr/local/mysql-8.4.11-macos15-arm64/bin'
const folder = await mkdtemp(path.join(tmpdir(), 'campthink-release-smoke-'))
await chmod(folder, 0o700)
const dbPort = Number(process.env.SMOKE_DB_PORT || 33317)
const appPort = Number(process.env.SMOKE_APP_PORT || 33318)
const checks = []
const commands = new Set()
const abort = new AbortController()
const deadline = setTimeout(() => abort.abort(new Error('isolated smoke exceeded 180 seconds')),180000)
deadline.unref()
const interrupt=()=>abort.abort(new Error('isolated smoke interrupted'))
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt)
abort.signal.addEventListener('abort',()=>{for(const command of commands)command.kill('SIGKILL')})
const password = randomBytes(24).toString('hex')
const accountPassword = randomBytes(20).toString('hex')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let mysql, java
let modelCalls = 0
const mail = []
const smtpSockets=new Set()
const smtpServer = createSmtpServer(socket => {
  smtpSockets.add(socket);socket.once('close',()=>smtpSockets.delete(socket))
  let buffer = '', data = null
  socket.setTimeout(10000, () => socket.destroy())
  socket.on('error', () => {})
  socket.write('220 localhost isolated SMTP fixture\r\n')
  socket.on('data', chunk => {
    buffer += chunk.toString()
    while (buffer.includes('\r\n')) {
      const index = buffer.indexOf('\r\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 2)
      if (data !== null) {
        if (line === '.') { mail.push(data); data = null; socket.write('250 accepted locally\r\n') }
        else data += line.replace(/^\.\./, '.') + '\r\n'
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-localhost\r\n250 8BITMIME\r\n')
      else if (/^DATA$/i.test(line)) { data = ''; socket.write('354 end with dot\r\n') }
      else if (/^QUIT$/i.test(line)) socket.end('221 bye\r\n')
      else socket.write('250 ok\r\n')
    }
  })
})
function lastMailToken() {
  const raw = mail.at(-1); assert.ok(raw)
  let body = raw.slice(raw.indexOf('\r\n\r\n') + 4)
  if (/Content-Transfer-Encoding: base64/i.test(raw)) body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8')
  else body = body.replace(/=\r\n/g, '').replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  const token = body.match(/#token=([A-Za-z0-9_-]{43})/)?.[1]
  assert.ok(token, 'SMTP message should carry an opaque fragment token'); return token
}
const modelServer = createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk
  const request = JSON.parse(body)
  modelCalls++
  const data = { model: request.model, choices: [{ message: { role: 'assistant', content: '隔离模型返回：请核对实验要求' } }], usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 } }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data))
})
const run = (command, args, input = '') => new Promise((resolve, reject) => {
  if(abort.signal.aborted){reject(abort.signal.reason);return}
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
  commands.add(child)
  let timedOut=false
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},60000)
  let out = '', err = ''
  child.stdout.on('data', x => { out += x }); child.stderr.on('data', x => { err += x })
  child.on('error', error=>{clearTimeout(timer);commands.delete(child);reject(error)})
  child.stdin.on('error',()=>{})
  child.on('close', code => {
    clearTimeout(timer);commands.delete(child)
    if(abort.signal.aborted)reject(abort.signal.reason)
    else if(timedOut)reject(new Error(`${path.basename(command)} exceeded 60 seconds`))
    else if(code===0)resolve(out.trim())
    else reject(new Error(`${path.basename(command)} failed (${code}): ${err.slice(-1600)}`))
  })
  child.stdin.end(input)
})
const sql = text => run(path.join(bin, 'mysql'), ['--no-defaults', '--protocol=SOCKET', `--socket=${folder}/mysql.sock`, '-u', 'root', '-N', 'campthink_smoke'], text)
const check = name => { checks.push(name); console.log(`PASS ${name}`) }
async function waitFor(fn, child, label) {
  const until=Date.now()+60000
  while(Date.now()<until) {
    if(abort.signal.aborted)throw abort.signal.reason
    if(child?.launchError)throw child.launchError
    if (child?.exitCode != null) throw new Error(`${label} exited prematurely (${child.exitCode})`)
    try { if (await fn()) return } catch { /* startup race only */ }
    await sleep(500)
  }
  throw new Error(`${label} startup timed out`)
}
async function request(method, url, body, token, cookie) {
  const response = await fetch(`http://127.0.0.1:${appPort}${url}`, { method,
    signal:AbortSignal.any([abort.signal,AbortSignal.timeout(8000)]),
    headers: { 'Content-Type': 'application/json', Origin: `http://localhost:${appPort}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  let data; try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: response.status, data, headers: response.headers }
}
async function stop(child) {
  if (!child || !child.pid || child.exitCode != null || child.signalCode != null) return
  const done = new Promise(resolve => child.once('close', resolve))
  child.kill('SIGTERM')
  await Promise.race([done, sleep(10000)])
  if (child.exitCode == null) { child.kill('SIGKILL'); await done }
}

try {
  // Port collision must fail before initializing any service, never connect to an existing instance.
  for (const port of [dbPort, appPort]) {
    const probe = createServer()
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve) })
    await new Promise(resolve => probe.close(resolve))
  }
  await mkdir(path.join(folder, 'data'))
  await run(path.join(bin, 'mysqld'), ['--no-defaults', '--initialize-insecure', `--datadir=${folder}/data`, `--log-error=${folder}/mysql.log`])
  mysql = spawn(path.join(bin, 'mysqld'), ['--no-defaults', `--datadir=${folder}/data`, `--socket=${folder}/mysql.sock`, `--pid-file=${folder}/mysql.pid`, `--port=${dbPort}`, '--bind-address=127.0.0.1', '--mysqlx=OFF', `--log-error=${folder}/mysql.log`], { stdio: 'ignore' })
  mysql.on('error',error=>{mysql.launchError=error})
  await waitFor(async () => { await run(path.join(bin, 'mysqladmin'), ['--no-defaults', `--socket=${folder}/mysql.sock`, '-u', 'root', 'ping']); return true }, mysql, 'MySQL')
  await run(path.join(bin, 'mysql'), ['--no-defaults', `--socket=${folder}/mysql.sock`, '-u', 'root'],
    `CREATE DATABASE campthink_smoke CHARACTER SET utf8mb4; CREATE USER 'campthink_test'@'127.0.0.1' IDENTIFIED BY '${password}'; GRANT ALL ON campthink_smoke.* TO 'campthink_test'@'127.0.0.1';`)
  const schema=await readFile(path.join(root, 'campus-ai-server/src/main/resources/schema.sql'), 'utf8')
  await sql(schema)
  const migration = await readFile(path.join(root, 'deploy/migrations/V20261004__ai_spend.sql'), 'utf8')
  await sql(migration); await sql(migration)
  const receiptMigration=await readFile(path.join(root,'deploy/migrations/V20261009__contact_submission_keys.sql'),'utf8')
  await sql(receiptMigration);await sql(receiptMigration)
  assert.equal(await sql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()'), '45')
  assert.equal(await sql('SELECT @@transaction_isolation'),'REPEATABLE-READ')
  check('real MySQL fresh schema and repeatable additive migration')
  const receiptDefinition=schema.match(/CREATE TABLE IF NOT EXISTS contact_submission_keys \([\s\S]*?\);/)?.[0]
  assert.ok(receiptDefinition)
  // Representative prior schema, not a copy of the user's database.
  const legacy=schema.replace(receiptDefinition,'')
  await sql(`CREATE DATABASE campthink_upgrade_smoke CHARACTER SET utf8mb4; USE campthink_upgrade_smoke;\n${legacy}\nINSERT INTO contact_messages(name,contact,subject,message) VALUES('fixture','test@example.invalid','历史反馈','迁移后必须保持');`)
  assert.equal(await sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='campthink_upgrade_smoke'"),'44')
  await sql(`USE campthink_upgrade_smoke;\n${receiptMigration}\n${receiptMigration}`)
  assert.equal(await sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='campthink_upgrade_smoke'"),'45')
  assert.equal(await sql('SELECT message FROM campthink_upgrade_smoke.contact_messages'),'迁移后必须保持')
  assert.equal(await sql('SELECT COUNT(*) FROM campthink_upgrade_smoke.contact_submission_keys'),'0')
  check('additive receipt migration upgrades representative 44-table schema twice without modifying historical feedback')
  await new Promise(resolve => modelServer.listen(0, '127.0.0.1', resolve))
  await new Promise(resolve => smtpServer.listen(0, '127.0.0.1', resolve))
  const modelPort = modelServer.address().port
  const env = { ...process.env, SPRING_PROFILES_ACTIVE: 'free', DB_HOST: '127.0.0.1', DB_PORT: String(dbPort), DB_NAME: 'campthink_smoke', DB_USERNAME: 'campthink_test', DB_PASSWORD: password,
    JWT_SECRET: randomBytes(48).toString('base64'), SERVER_PORT: String(appPort), SERVER_ADDRESS: '127.0.0.1',
    CORS_ALLOWED_ORIGINS: `http://localhost:${appPort}`, PUBLIC_WEB_URL: `http://localhost:${appPort}`, AUTH_SECURE_COOKIES: 'false',
    DEEPSEEK_API_KEY: 'isolated-fake-key', DEEPSEEK_BASE_URL: `http://127.0.0.1:${modelPort}`, KIMI_API_KEY: '', GLM_API_KEY: '',
    DEEPSEEK_FLASH_INPUT_CNY_PER_MILLION: '2', DEEPSEEK_FLASH_OUTPUT_CNY_PER_MILLION: '8',
    AI_PLATFORM_DAILY_CNY: '1', AI_PLATFORM_MONTHLY_CNY: '10', AI_COST_ADMIN_USER_ID: '1',
    KNOWLEDGE_SEED_OFFICIAL_SCHOOL: 'false', CAREER_SEED_OFFICIAL_CANDIDATES: 'false',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpServer.address().port), SMTP_FROM: 'fixture@example.org', SMTP_USERNAME: '', SMTP_PASSWORD: '',
    SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE: 'false', SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH: 'false',
    BOCHA_API_KEY: '', KNOWLEDGE_SEMANTIC_API_KEY: '',
    JOB_INITIAL_DELAY_MILLIS: '3600000' }
  let appLog = ''
  java = spawn('java', ['-jar', path.join(root, 'campus-ai-server/target/campus-ai-server-0.0.1-SNAPSHOT.jar')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  java.on('error',error=>{java.launchError=error})
  java.stdout.on('data', chunk => { appLog += chunk }); java.stderr.on('data', chunk => { appLog += chunk })
  try {
    await waitFor(async () => (await request('GET', '/api/health/ready')).status === 200, java, 'Backend')
    check('packaged Java boot and 45-table readiness')
    // Rename only our empty fixture table to simulate an old deployment missing the migration.
    await sql('RENAME TABLE contact_submission_keys TO fixture_held_contact_keys')
    assert.equal((await request('GET','/api/health/ready')).status,503)
    await sql('RENAME TABLE fixture_held_contact_keys TO contact_submission_keys')
    assert.equal((await request('GET','/api/health/ready')).status,200)
    check('missing feedback receipt table makes readiness fail, restored table returns ready')
    const register = name => request('POST', '/api/users', { username: name, nickname: '隔离测试', password: accountPassword, schoolId: 1, privacyAccepted: true, policyVersion: '2026-10-04' })
    assert.equal((await register('smoke_owner')).status, 201)
    assert.equal((await register('smoke_other')).status, 201)
    const stale = await request('POST', '/api/users', { username: 'stale_policy', nickname: '旧版本', password: accountPassword, schoolId: 1, privacyAccepted: true, policyVersion: '2026-09-21' })
    assert.equal(stale.status, 409)
    assert.equal(await sql("SELECT COUNT(*) FROM user_privacy_consents WHERE policy_version='2026-10-04'"), '2')
    check('registration rejects stale policy without rewriting old consents')
    await sql("UPDATE users SET role='ADMIN' WHERE id=1")
    const login = name => request('POST', '/api/auth/login', { username: name, password: accountPassword })
    const owner = await login('smoke_owner'); const other = await login('smoke_other')
    assert.equal(owner.status, 200); assert.equal(other.status, 200)
    const token = owner.data.token; const otherToken = other.data.token
    assert.ok(token); assert.match(owner.headers.get('set-cookie'), /HttpOnly/i)
    check('real registration, password hashing login and HttpOnly refresh cookie')
    const conversation = await request('POST', '/api/conversations', { title: '隔离测试', model: 'standard' }, token)
    assert.equal(conversation.status, 201)
    const conversationId = conversation.data.id
    assert.equal((await request('GET', `/api/conversations/${conversationId}`, undefined, otherToken)).status, 404)
    assert.equal((await request('GET', '/api/admin/ai-budget', undefined, otherToken)).status, 403)
    assert.equal((await request('GET', '/api/admin/overview', undefined, otherToken)).status, 403)
    assert.equal((await request('GET', '/api/admin/model-usage', undefined, otherToken)).status, 403)
    check('cross-account conversation and administrator access denied')
    await checkFeedbackAndReviews({request,sql,owner,other,check})
    const answer = await request('POST', `/api/conversations/${conversationId}/messages`, { content: '请解释牛顿第二定律在实验数据中的应用', model: 'standard' }, token)
    assert.equal(answer.status, 200, `chat status: ${answer.status}`)
    assert.equal(modelCalls, 1)
    const budget = await request('GET', '/api/admin/ai-budget', undefined, token)
    assert.equal(budget.status, 200); assert.equal(budget.data.today.completed, 1)
    assert.equal(Number(budget.data.today.estimatedCny), 0.00032)
    check('real HTTP model routing, durable budget accounting and operator dashboard (upstream stub)')
    const stats = await request('GET', '/api/admin/overview', undefined, token)
    const usage = await request('GET', '/api/admin/model-usage', undefined, token)
    assert.equal(stats.status, 200); assert.equal(stats.data.recentModelCalls, 1)
    assert.equal(stats.data.recentModelTokens, 100)
    assert.equal(usage.status, 200); assert.equal(usage.data.length, 1)
    assert.equal(usage.data[0].requestCount, 1); assert.equal(usage.data[0].totalTokens, 100)
    check('administrator overview and model usage execute real MySQL SQL, student access denied')
    await sql('UPDATE ai_model_usage SET total_tokens=NULL WHERE user_id=1')
    assert.equal((await request('GET', '/api/admin/overview', undefined, token)).data.recentModelTokens, null)
    assert.equal((await request('GET', '/api/admin/model-usage', undefined, token)).data[0].totalTokens, null)
    await sql('UPDATE ai_model_usage SET total_tokens=100 WHERE user_id=1')
    check('unknown token totals remain unknown instead of becoming a misleading partial sum')
    const today = budget.data.date; const until = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
    const dailyUrl = `/api/admin/ai-budget/daily?from=${today}&until=${until}`
    const daily = await request('GET', dailyUrl, undefined, token)
    assert.equal(daily.status, 200); assert.equal(daily.data[0].attempts, 1)
    assert.equal((await request('GET', dailyUrl, undefined, otherToken)).status, 403)
    check('daily cost export is scoped to operator and contains no chat content')
    await sql("UPDATE ai_spend_buckets SET charged_cny=10 WHERE period_key LIKE 'M:%'")
    const blocked = await request('POST', `/api/conversations/${conversationId}/messages`, { content: '请继续解释加速度实验的误差来源', model: 'standard' }, token)
    assert.equal(blocked.status, 429); assert.equal(modelCalls, 1)
    check('exhausted monthly budget rejects before upstream call')
    const bind = await request('POST', '/api/account/email/verification', { email: 'fixture@example.org', password: accountPassword }, otherToken)
    assert.equal(bind.status, 202); assert.equal(mail.length, 1)
    const emailToken = lastMailToken()
    assert.equal((await request('POST', '/api/auth/email/verify', { token: emailToken })).status, 204)
    assert.equal((await request('POST', '/api/auth/email/verify', { token: emailToken })).status, 400)
    assert.equal((await request('GET', '/api/account/email', undefined, otherToken)).data.email, 'fixture@example.org')
    check('SMTP loopback delivers verification; token works once and verified email persists')
    await checkRefreshAndLogout({request,login,check})
    const reset = await request('POST', '/api/auth/password-reset/request', { username: 'smoke_other', email: 'fixture@example.org' })
    assert.equal(reset.status, 202); assert.equal(mail.length, 2)
    const resetToken = lastMailToken(); const resetPassword = randomBytes(20).toString('hex')
    assert.equal((await request('POST', '/api/auth/password-reset/confirm', { token: resetToken, password: resetPassword })).status, 204)
    assert.equal((await request('POST', '/api/auth/password-reset/confirm', { token: resetToken, password: resetPassword })).status, 400)
    assert.equal((await request('GET', '/api/auth/me', undefined, otherToken)).status, 401)
    const relogin = await request('POST', '/api/auth/login', { username: 'smoke_other', password: resetPassword })
    assert.equal(relogin.status, 200)
    const recoveredToken = relogin.data.token
    check('SMTP password reset is one-use, revokes old sessions and new password logs in')
    const exported = await request('GET', '/api/account/export', undefined, recoveredToken)
    assert.equal(exported.status, 200)
    assert.equal(JSON.stringify(exported.data).includes('password_hash'), false)
    assert.equal(JSON.stringify(exported.data).includes('smoke_owner'), false)
    assert.equal((await request('DELETE', '/api/account', { password: resetPassword }, recoveredToken)).status, 204)
    assert.equal((await request('GET', '/api/auth/me', undefined, recoveredToken)).status, 401)
    assert.equal(await sql('SELECT COUNT(*) FROM contact_submission_keys WHERE user_id=2'),'0')
    check('account export isolation and deletion revoke access')
    assert.equal((await request('POST', '/api/auth/logout', undefined, token)).status, 204)
    assert.equal((await request('GET', '/api/auth/me', undefined, token)).status, 401)
    check('logout immediately invalidates existing access token')
  } finally {
    // Redact generated test credentials even from isolated diagnostic logs.
    await writeFile(path.join(folder, 'backend.log'), appLog.replaceAll(password, '[redacted]').replaceAll(accountPassword, '[redacted]'), { mode: 0o600 })
  }
  await stop(java)
  const dump = await run(path.join(bin, 'mysqldump'), ['--no-defaults', `--socket=${folder}/mysql.sock`, '-u', 'root',
    '--single-transaction', '--quick', '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--hex-blob', 'campthink_smoke'])
  await sql('CREATE DATABASE campthink_restore_smoke CHARACTER SET utf8mb4')
  await run(path.join(bin, 'mysql'), ['--no-defaults', `--socket=${folder}/mysql.sock`, '-u', 'root', 'campthink_restore_smoke'], dump)
  const restoredCounts = await sql("SELECT COUNT(*) FROM campthink_restore_smoke.users; SELECT COUNT(*) FROM campthink_restore_smoke.ai_provider_attempts; SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='campthink_restore_smoke'")
  assert.deepEqual(restoredCounts.split('\n'), ['1', '1', '45'])
  assert.equal(await sql('SELECT COUNT(*) FROM campthink_restore_smoke.contact_submission_keys'),'1')
  check('real mysqldump restores into a new isolated database, retaining accounts and cost ledger')
  let encryptedBackupVerified = false
  if (process.env.SMOKE_ENCRYPTED_BACKUP === 'true') {
    const identity = path.join(folder, 'drill.agekey')
    await run('age-keygen', ['-o', identity]); await chmod(identity, 0o600)
    const recipient = await run('age-keygen', ['-y', identity])
    const cnf = path.join(folder, 'drill.cnf')
    await writeFile(cnf, `[client]\nuser=root\nprotocol=SOCKET\nsocket=${folder}/mysql.sock\n`, { mode: 0o600 })
    const backupRoot = path.join(folder, 'backups')
    await run('bash', [path.join(root, 'deploy/backup-db.sh'), cnf, 'campthink_smoke', backupRoot, recipient])
    const job = path.join(backupRoot, (await readdir(backupRoot))[0])
    await run('bash', [path.join(root, 'deploy/restore-drill.sh'), cnf, identity, job, 'campthink_restore_encrypted'])
    assert.equal(await sql('SELECT COUNT(*) FROM campthink_restore_encrypted.users'), '1')
    await assert.rejects(run('bash', [path.join(root, 'deploy/restore-drill.sh'), cnf, identity, job, 'campthink_restore_encrypted']))
    const corrupt = path.join(folder, 'backup-corrupt'); await cp(job, corrupt, { recursive: true })
    await writeFile(path.join(corrupt, 'database.sql.gz.age'), 'tampered ciphertext')
    await assert.rejects(run('bash', [path.join(root, 'deploy/restore-drill.sh'), cnf, identity, corrupt, 'campthink_restore_corrupt']))
    assert.equal(await sql("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='campthink_restore_corrupt'"), '0')
    encryptedBackupVerified = true
    check('real age encrypted backup and isolated restore; refuses overwrite and rejects tampering before DB creation (not offsite)')
  }
  await writeFile(path.join(folder, 'result.json'), JSON.stringify({ checks, realMySql: true, isolation:'REPEATABLE-READ', realHttpSessions:true, browserTabsVerified:false, realModel: false, smtpLoopbackVerified: true, realMailboxVerified: false, production: false, encryptedBackupVerified, offsiteRestoreVerified: false }, null, 2), { mode: 0o600 })
  console.log(`Evidence: ${folder}`)
} catch (failure) {
  console.error(`FAIL: ${failure.message}; isolated evidence: ${folder}`)
  process.exitCode = 1
} finally {
  await stop(java); await stop(mysql)
  for(const socket of smtpSockets)socket.destroy()
  modelServer.closeAllConnections()
  await new Promise(resolve => modelServer.close(resolve))
  await new Promise(resolve => smtpServer.close(resolve))
  clearTimeout(deadline);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt)
}
