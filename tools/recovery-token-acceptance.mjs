// New-email/disabled-account token boundaries in a fresh MySQL + HTTP fixture.
// Mail is captured on loopback only; no real mailbox or browser profile is used.
import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {randomBytes, createHash} from 'node:crypto'
import {mkdir, writeFile, readFile} from 'node:fs/promises'
import path from 'node:path'
import {fixture, repo} from './ops-fixture.mjs'

const release = path.resolve(process.argv[2] || 'releases/free-20261021T082657Z-nvr3oL')
const tag = process.argv[3] || 'probe'
assert.match(tag, /^[a-z0-9-]+$/)
const failureOnly = process.argv[4] === '--delivery-failure-only'
assert.ok(!process.argv[4] || failureOnly)
const output = path.join(repo, '.local/runtime/evening-2026-10-21', `recovery-token-${tag}.json`)
const messages = [], sockets = new Set(), checks = []
let rejectNextMessage = false
const smtp = createServer(socket => {
  sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {})
  socket.setTimeout(10000, () => socket.destroy())
  let buffer = '', data = null
  socket.write('220 localhost isolated mail receiver\r\n')
  socket.on('data', chunk => {
    buffer += chunk
    while (buffer.includes('\r\n')) {
      const at = buffer.indexOf('\r\n'), line = buffer.slice(0, at); buffer = buffer.slice(at + 2)
      if (data !== null) {
        if (line === '.') {
          if (rejectNextMessage) { rejectNextMessage = false; socket.write('550 isolated delivery failure\r\n') }
          else { messages.push(data); socket.write('250 accepted locally\r\n') }
          data = null
        }
        else data += line.replace(/^\.\./, '.') + '\r\n'
      } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250-localhost\r\n250 8BITMIME\r\n')
      else if (/^DATA$/i.test(line)) { data = ''; socket.write('354 end with dot\r\n') }
      else if (/^QUIT$/i.test(line)) socket.end('221 bye\r\n')
      else socket.write('250 ok\r\n')
    }
  })
})
function token() {
  const raw = messages.at(-1); assert.ok(raw, 'missing loopback message')
  let body = raw.slice(raw.indexOf('\r\n\r\n') + 4)
  if (/Content-Transfer-Encoding: base64/i.test(raw)) body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8')
  else body = body.replace(/=\r\n/g, '').replace(/=([A-Fa-f0-9]{2})/g, (_, value) => String.fromCharCode(parseInt(value, 16)))
  const result = body.match(/#token=([A-Za-z0-9_-]{43})/)?.[1]
  assert.ok(result, 'missing opaque fragment token'); return result
}
const expect = (name, actual, expected) => checks.push({name, actual, expected, passed: actual === expected})
let app
const report = {startedAt: new Date().toISOString(), release, jarSha256: createHash('sha256').update(await readFile(path.join(release, 'server.jar'))).digest('hex'), checks, realMySql: true, realHttp: true, realMail: false, production: false}
const timer = setTimeout(() => { console.error('Recovery token acceptance exceeded its 180-second bound'); process.exit(124) }, 180000)
timer.unref()
try {
  await new Promise((resolve, reject) => { smtp.once('error', reject); smtp.listen(0, '127.0.0.1', resolve) })
  app = await fixture(release, {smtpPort: smtp.address().port})
  report.fixture = app.folder; report.db = app.db
  const password = randomBytes(18).toString('hex')
  const user = async name => {
    const username = `${name}_${app.suffix}`
    assert.equal((await app.api('POST', '/api/users', {username, nickname: '邮件边界合成测试', password, schoolId: 1, privacyAccepted: true, policyVersion: '2026-10-04'})).status, 201)
    const result = await app.api('POST', '/api/auth/login', {username, password}); assert.equal(result.status, 200)
    return {username, access: result.value.token, id: result.value.user.id}
  }
  const emailLink = async (owner, email) => {
    assert.equal((await app.api('POST', '/api/account/email/verification', {email, password}, owner.access)).status, 202)
    return token()
  }
  const bind = async (owner, email) => {
    const link = await emailLink(owner, email)
    assert.equal((await app.api('POST', '/api/auth/email/verify', {token: link})).status, 204)
  }
  const resetLink = async (owner, email) => {
    assert.equal((await app.api('POST', '/api/auth/password-reset/request', {username: owner.username, email})).status, 202)
    return token()
  }
  const newPassword = randomBytes(18).toString('hex')
  if (!failureOnly) {
  const owner = await user('mail_scope')
  await bind(owner, 'old@example.invalid')
  const oldReset = await resetLink(owner, 'old@example.invalid')
  await bind(owner, 'new@example.invalid')
  const stale = await app.api('POST', '/api/auth/password-reset/confirm', {token: oldReset, password: newPassword})
  expect('reset link issued to old mailbox rejected after rebind', stale.status, 400)
  expect('rejected reset preserves current session', (await app.api('GET', '/api/auth/me', undefined, owner.access)).status, 200)
  if (stale.status === 400) {
    const current = await resetLink(owner, 'new@example.invalid')
    expect('new mailbox reset works', (await app.api('POST', '/api/auth/password-reset/confirm', {token: current, password: newPassword})).status, 204)
    expect('successful reset revokes previous session', (await app.api('GET', '/api/auth/me', undefined, owner.access)).status, 401)
    expect('successful reset token cannot replay', (await app.api('POST', '/api/auth/password-reset/confirm', {token: current, password: newPassword})).status, 400)
    expect('new password logs in normally', (await app.api('POST', '/api/auth/login', {username: owner.username, password: newPassword})).status, 200)
  }
  const disabled = await user('mail_disabled')
  const pending = await emailLink(disabled, 'disabled@example.invalid')
  // Only this fixture's new synthetic user changes status. Not an admin-UI/API acceptance claim.
  await app.sql(`UPDATE users SET status=0 WHERE id=${Number(disabled.id)}`)
  expect('disabled account cannot consume email binding link', (await app.api('POST', '/api/auth/email/verify', {token: pending})).status, 400)
  expect('disabled account has no verified email added', await app.sql(`SELECT COUNT(*) FROM account_emails WHERE user_id=${Number(disabled.id)}`), '0')
  const legacy = await user('mail_legacy')
  await bind(legacy, 'legacy@example.invalid')
  const legacyReset = await resetLink(legacy, 'legacy@example.invalid')
  await app.sql(`UPDATE account_action_tokens SET pending_email=NULL WHERE user_id=${Number(legacy.id)} AND action='RESET_PASSWORD'`)
  expect('legacy reset link without mailbox binding fails closed', (await app.api('POST', '/api/auth/password-reset/confirm', {token: legacyReset, password: newPassword})).status, 400)
  expect('legacy rejection preserves login', (await app.api('GET', '/api/auth/me', undefined, legacy.access)).status, 200)
  const replacement = await user('mail_replace')
  await bind(replacement, 'replace-current@example.invalid')
  const pendingChange = await emailLink(replacement, 'replace-new@example.invalid')
  const replacementReset = await resetLink(replacement, 'replace-current@example.invalid')
  expect('reset with current mailbox succeeds before pending change', (await app.api('POST', '/api/auth/password-reset/confirm', {token: replacementReset, password: newPassword})).status, 204)
  expect('successful reset invalidates pre-reset mailbox change', (await app.api('POST', '/api/auth/email/verify', {token: pendingChange})).status, 400)
  const replacedLogin = await app.api('POST', '/api/auth/login', {username: replacement.username, password: newPassword})
  assert.equal(replacedLogin.status, 200)
  expect('reset leaves the previously verified mailbox intact', (await app.api('GET', '/api/account/email', undefined, replacedLogin.value.token)).value.email, 'replace-current@example.invalid')
  const bounce = await user('mail_bounce')
  await bind(bounce, 'bounce-old@example.invalid')
  const bounceReset = await resetLink(bounce, 'bounce-old@example.invalid')
  await bind(bounce, 'bounce-new@example.invalid')
  await bind(bounce, 'bounce-old@example.invalid')
  expect('rebinding old mailbox cannot resurrect old reset link', (await app.api('POST', '/api/auth/password-reset/confirm', {token: bounceReset, password: newPassword})).status, 400)
  const race = await user('mail_race')
  await bind(race, 'race-current@example.invalid')
  const raceVerify = await emailLink(race, 'race-new@example.invalid')
  const raceReset = await resetLink(race, 'race-current@example.invalid')
  const [verifyResult, resetResult] = await Promise.all([
    app.api('POST', '/api/auth/email/verify', {token: raceVerify}),
    app.api('POST', '/api/auth/password-reset/confirm', {token: raceReset, password: newPassword})
  ])
  expect('concurrent mailbox change and reset have one winner', JSON.stringify([verifyResult.status, resetResult.status].sort()), '[204,400]')
  const raceLogin = await app.api('POST', '/api/auth/login', {username: race.username, password: resetResult.status === 204 ? newPassword : password})
  assert.equal(raceLogin.status, 200)
  expect('race winner determines the verified mailbox atomically', (await app.api('GET', '/api/account/email', undefined, raceLogin.value.token)).value.email,
    resetResult.status === 204 ? 'race-current@example.invalid' : 'race-new@example.invalid')
  }
  const resetRetry = await user('mail_send_fail')
  await bind(resetRetry, 'reset-failure@example.invalid')
  const validReset = await resetLink(resetRetry, 'reset-failure@example.invalid')
  rejectNextMessage = true
  expect('reset mail rejection returns a truthful failure', (await app.api('POST', '/api/auth/password-reset/request', {username: resetRetry.username, email: 'reset-failure@example.invalid'})).status, 503)
  expect('failed reset resend preserves previous valid link', (await app.api('POST', '/api/auth/password-reset/confirm', {token: validReset, password: newPassword})).status, 204)
  expect('preserved reset link still changes password normally', (await app.api('POST', '/api/auth/login', {username: resetRetry.username, password: newPassword})).status, 200)
  const verifyRetry = await user('mail_verify_fail')
  const validVerification = await emailLink(verifyRetry, 'verify-failure-old@example.invalid')
  rejectNextMessage = true
  expect('verification mail rejection returns a truthful failure', (await app.api('POST', '/api/account/email/verification', {email: 'verify-failure-new@example.invalid', password}, verifyRetry.access)).status, 503)
  expect('failed verification resend preserves previous valid link', (await app.api('POST', '/api/auth/email/verify', {token: validVerification})).status, 204)
  expect('failed resend cannot replace the earlier verification target', (await app.api('GET', '/api/account/email', undefined, verifyRetry.access)).value.email, 'verify-failure-old@example.invalid')
  report.status = checks.every(check => check.passed) ? 'passed' : 'failed'
  report.loopbackMessages = messages.length; report.modelCalls = app.modelCalls()
  process.exitCode = report.status === 'passed' ? 0 : 1
} catch (error) {
  report.status = 'failed'; report.failureType = error.constructor.name
  process.exitCode = 1
} finally {
  if (app) await app.close()
  for (const socket of sockets) socket.destroy()
  await new Promise(resolve => smtp.close(resolve))
  clearTimeout(timer)
  report.closed = true; report.finishedAt = new Date().toISOString()
  await mkdir(path.dirname(output), {recursive: true})
  await writeFile(output, JSON.stringify(report, null, 2), {mode: 0o600})
  console.log(JSON.stringify({status: report.status, checks, evidence: output, realMail: false, closed: true}))
}
