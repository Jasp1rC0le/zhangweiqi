// Explicit human-assisted acceptance. Never reads an inbox, browser credential or new password.
import {mkdtemp, chmod, readFile, writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {randomBytes, createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import path from 'node:path'
import {fixture, repo, pause, stopChild} from './ops-fixture.mjs'

assert.equal(process.argv[2], '--confirmed-two-business-emails', 'Explicit confirmation required')
const recipient = 'contact@campthinkhub.cn'
// One durable budget for this explicit two-message approval, not a fresh budget per retry.
const relayReceipt = path.join(repo, '.local/private/mail-roundtrip-approved-20261022.json')
assert.equal(existsSync(relayReceipt), false, 'This approval already has a receipt; inspect it, never automatically rerun')
const release = path.join(repo, 'releases/free-20261021T133046Z-ISj44j')
assert.equal(createHash('sha256').update(await readFile(path.join(release, 'server.jar'))).digest('hex'), '03fa7da6aeca66cc88e9f11b6a15a4cf0bd94c9ffabbab48c11265708524b187')
const folder = await mkdtemp(path.join(repo, '.local/runtime/real-mail-roundtrip-'))
await chmod(folder, 0o700)
const receipt = path.join(folder, 'status.json')
const probe = createServer()
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '::1', resolve) })
const port = probe.address().port
await new Promise(resolve => probe.close(resolve))
const origin = `http://[::1]:${port}`
const report = {startedAt: new Date().toISOString(), phase: 'preparing', origin, recipient, maximumAdditionalEmails: 2,
  credentialsStoredInReceipt: false, modelRequestsAllowed: false, production: false, realAccountChanged: false}
const save = async () => { await writeFile(receipt, JSON.stringify(report, null, 2), {mode: 0o600}) }
let app, relay, interrupted = false
const onSignal = () => { interrupted = true }
process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal)
const end = Date.now() + 20 * 60 * 1000
const awaitCondition = async condition => {
  while (Date.now() < end && !interrupted) { if (await condition()) return; await pause(3000) }
  throw new Error(interrupted ? 'user-interrupted' : 'human-step-timeout')
}
try {
  relay = spawn('python3', ['-W', 'ignore::DeprecationWarning', path.join(repo, 'tools/limited_mail_relay.py'),
    '--config', path.join(repo, '.local/private/.env.smtp'), '--origin', origin, '--receipt', relayReceipt, '--confirmed-recipient', recipient], {stdio: ['ignore', 'pipe', 'pipe']})
  relay.stderr.resume()
  const relayPort = await new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => reject(new Error('relay-start-timeout')), 10000)
    relay.once('error', () => { clearTimeout(timer); reject(new Error('relay-start-failed')) })
    relay.once('close', () => { clearTimeout(timer); reject(new Error('relay-exited')) })
    relay.stdout.on('data', data => {
      buffer += data
      while (buffer.includes('\n')) {
        const i = buffer.indexOf('\n'), line = buffer.slice(0, i); buffer = buffer.slice(i + 1)
        try { const value = JSON.parse(line); if (value.event === 'ready') { clearTimeout(timer); resolve(value.port) } } catch { /* never echo SMTP or secret-bearing diagnostics */ }
      }
    })
  })
  app = await fixture(release, {smtpPort: relayPort, smtpFrom: recipient, webHost: '::1', webPort: port})
  const username = `mail_check_${app.suffix}`, password = randomBytes(18).toString('hex')
  const registered = await app.api('POST', '/api/users', {username, nickname: '邮件验收临时账号', password, schoolId: 1, privacyAccepted: true, policyVersion: '2026-10-04'})
  assert.equal(registered.status, 201)
  const login = await app.api('POST', '/api/auth/login', {username, password}); assert.equal(login.status, 200)
  const access = login.value.token, userId = Number(login.value.user.id)
  report.username = username; report.fixture = app.folder; report.db = app.db; report.taskPids = {...app.pids(), relay: relay.pid}
  report.expiresAt = new Date(end).toISOString()
  const sent = await app.api('POST', '/api/account/email/verification', {email: recipient, password}, access)
  assert.equal(sent.status, 202, 'verification request was not accepted')
  report.phase = 'awaiting-user-verification-click'; await save()
  console.log(JSON.stringify({phase: report.phase, username, origin, receipt, expiresAt: report.expiresAt, emailSubject: '验证 Campthink 邮箱'}))
  await awaitCondition(async () => {
    const current = await app.api('GET', '/api/account/email', undefined, access)
    return current.status === 200 && current.value.email === recipient
  })
  report.emailVerifiedAt = new Date().toISOString(); report.bindingConfirmedByNormalApi = true
  const reset = await app.api('POST', '/api/auth/password-reset/request', {username, email: recipient})
  assert.equal(reset.status, 202, 'reset request was not accepted')
  report.phase = 'awaiting-user-reset-and-login'; await save()
  console.log(JSON.stringify({phase: report.phase, username, origin, receipt, emailSubject: '重置 Campthink 密码', loginUrl: origin + '/login?reauth=1'}))
  await awaitCondition(async () => Number(await app.sql(`SELECT COUNT(*) FROM account_action_tokens WHERE user_id=${userId} AND action='RESET_PASSWORD' AND used_at IS NOT NULL`)) === 1)
  assert.equal((await app.api('GET', '/api/auth/me', undefined, access)).status, 401)
  report.passwordResetObservedAt = new Date().toISOString(); report.oldSessionRejected = true
  report.phase = 'awaiting-user-new-password-login'; await save()
  console.log(JSON.stringify({phase: report.phase, username, loginUrl: origin + '/login?reauth=1', receipt}))
  await awaitCondition(async () => Number(await app.sql(`SELECT COUNT(*) FROM auth_sessions WHERE user_id=${userId} AND revoked_at IS NULL`)) >= 1)
  report.newLoginObservedAt = new Date().toISOString(); report.phase = 'passed'; report.newLoginConfirmed = true
  report.modelCalls = app.modelCalls(); assert.equal(report.modelCalls, 0)
  await save(); console.log(JSON.stringify({phase: 'passed', receipt, userPasswordRead: false, cleanupInSeconds: 15}))
  await pause(15000)
} catch (error) {
  report.phase = 'incomplete'; report.failureType = error.constructor.name
  report.reason = ['user-interrupted', 'human-step-timeout'].includes(error.message) ? error.message : 'bounded-step-failed'
  process.exitCode = 1
} finally {
  if (app) await app.close()
  await stopChild(relay)
  if (relayReceipt) {
    try { const safeRelay = JSON.parse(await readFile(relayReceipt, 'utf8')); report.mailAttempts = safeRelay.attempts } catch { /* safe receipt only */ }
  }
  report.closed = true; report.finishedAt = new Date().toISOString(); await save()
  console.log(JSON.stringify({phase: report.phase, closed: true, receipt, newPasswordRead: false}))
  process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal)
}
