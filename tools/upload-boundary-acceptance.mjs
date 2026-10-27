// A bounded local HTTP measurement, not production load or a capacity claim.
import assert from 'node:assert/strict'
import {request} from 'node:http'
import {randomBytes, randomUUID} from 'node:crypto'
import {readdir, stat, mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fixture, repo, pause} from './ops-fixture.mjs'

const fixed = process.argv.includes('--expect-fixed')
const receipt = {startedAt: new Date().toISOString(), expectedFixed: fixed, testAdmissionSlots: 2, productionDefaultSlotsUnchanged: 16, productionChanged: false, observations: {}}
let active
const open = new Set()
const closeRequests = () => { for (const req of open) req.destroy(); open.clear() }
const deadline = setTimeout(() => { closeRequests(); void active?.close().finally(() => process.exit(124)) }, 100000)
process.once('SIGTERM', () => { closeRequests(); void active?.close().finally(() => process.exit(143)) })
async function temporary() {
  const names = await readdir(active.multipart)
  let bytes = 0, files = 0
  for (const name of names) { const info = await stat(path.join(active.multipart, name)).catch(() => null); if (info?.isFile()) { files++; bytes += info.size } }
  return {files, bytes}
}
async function awaitCleanup() {
  for (let n = 0; n < 20; n++) { if (!(await temporary()).files) return; await pause(100) }
  throw new Error('Multipart temporary files did not clear after client abort')
}
function partial(token, contentLength) {
  const boundary = 'campthink-' + randomUUID(), began = Date.now(), result = {status: null, responseMs: null}
  const req = request(active.backend + '/api/private-materials', {method: 'POST', headers: {
    Origin: active.origin, 'Content-Type': 'multipart/form-data; boundary=' + boundary,
    ...(token ? {Authorization: 'Bearer ' + token} : {}), ...(contentLength ? {'Content-Length': contentLength} : {}),
  }}, res => { result.status = res.statusCode; result.responseMs = Date.now() - began; res.resume() })
  open.add(req); req.on('error', () => {}); req.once('close', () => open.delete(req)); req.setTimeout(4000, () => req.destroy())
  req.write(`--${boundary}\r\nContent-Disposition: form-data; name="requestId"\r\n\r\n${randomUUID()}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="slow.txt"\r\nContent-Type: text/plain\r\n\r\n`)
  if (!contentLength) req.write(Buffer.alloc(128 * 1024, 97))
  return {req, result}
}
try {
  active = await fixture(process.argv[2], {maxInFlight: 2})
  receipt.fixture = {folder: active.folder, schema: active.db}
  const password = randomBytes(20).toString('hex'), username = 'upload21_' + active.suffix
  assert.equal((await active.api('POST', '/api/users', {username, nickname: '合成上传边界', password, schoolId: 1, privacyAccepted: true, policyVersion: '2026-10-27'})).status, 201)
  const login = await active.api('POST', '/api/auth/login', {username, password}); assert.equal(login.status, 200)
  const token = login.value.token
  const anonymous = partial(); await pause(500)
  receipt.observations.anonymousBeforeBodyComplete = {...anonymous.result, temporary: await temporary(), sentFileBytes: 128 * 1024}
  anonymous.req.destroy(); await awaitCleanup()
  const a = partial(token), b = partial(token); await pause(300)
  const c = partial(token); await pause(500)
  receipt.observations.concurrentIncomplete = {first: {...a.result}, second: {...b.result}, third: {...c.result}, temporary: await temporary()}
  closeRequests(); await awaitCleanup()
  assert.equal(await active.sql('SELECT COUNT(*) FROM private_material_files'), '0')
  receipt.observations.afterAbort = {temporary: await temporary(), committedOriginals: 0, ready: (await active.api('GET', '/api/health/ready')).status}
  if (fixed) {
    assert.equal(receipt.observations.anonymousBeforeBodyComplete.status, 401)
    assert.equal(receipt.observations.anonymousBeforeBodyComplete.temporary.bytes, 0)
    assert.equal(receipt.observations.concurrentIncomplete.third.status, 503)
    // Each admitted request spools its requestId part and file part separately.
    assert.equal(receipt.observations.concurrentIncomplete.temporary.files, 4)
    assert.equal(receipt.observations.concurrentIncomplete.first.status, null)
    assert.equal(receipt.observations.concurrentIncomplete.second.status, null)
    const oversized = partial(token, 40 * 1024 * 1024 + 1); await pause(500)
    receipt.observations.declaredOversizedRequest = {...oversized.result, temporary: await temporary()}
    oversized.req.destroy(); await awaitCleanup(); assert.equal(oversized.result.status, 413)
    const tooLargeFile = await active.upload(token, 'over-limit.txt', Buffer.alloc(11 * 1024 * 1024, 120))
    assert.equal(tooLargeFile.status, 413); await awaitCleanup()
    receipt.observations.actualOversizedFile = {bytesSent: 11 * 1024 * 1024, status: tooLargeFile.status, temporary: await temporary()}
    const id = randomUUID(), data = Buffer.from('合成正常重试原件')
    const success = await active.upload(token, 'retry.txt', data, '合成', id)
    const retry = await active.upload(token, 'retry.txt', data, '合成', id)
    const changed = await active.upload(token, 'retry.txt', Buffer.from('changed synthetic data'), '合成', id)
    assert.equal(success.status, 200); assert.equal(retry.status, 200); assert.equal(success.value.id, retry.value.id); assert.equal(changed.status, 409)
    assert.equal(await active.sql('SELECT COUNT(*) FROM private_material_files'), '1')
    receipt.observations.afterCapacityRelease = {first: success.status, sameRequest: retry.status, changedRequest: changed.status, committedOriginals: 1, temporary: await temporary()}
    assert.equal((await active.api('POST', '/api/auth/logout', undefined, token)).status, 204)
    const revoked = partial(token); await pause(500)
    receipt.observations.revokedBeforeBodyComplete = {...revoked.result, temporary: await temporary()}
    revoked.req.destroy(); await awaitCleanup()
    assert.equal(revoked.result.status, 401); assert.equal(receipt.observations.revokedBeforeBodyComplete.temporary.bytes, 0)
    assert.equal(active.modelCalls(), 0)
  }
  receipt.status = fixed ? 'passed' : 'baseline-measured-not-fixed'
  console.log(JSON.stringify(receipt.observations, null, 2))
} catch (error) { receipt.status = 'failed'; receipt.failure = error.message; console.error(error.stack); process.exitCode = 1 }
finally {
  closeRequests(); await active?.close(); clearTimeout(deadline)
  receipt.closedOwnServices = active?.stopped() ?? true; receipt.completedAt = new Date().toISOString()
  const folder = path.join(repo, '.local/runtime/operations-2026-10-21'); await mkdir(folder, {recursive: true, mode: 0o700})
  const file = path.join(folder, `upload-${fixed ? 'fixed' : 'baseline'}-${Date.now()}.json`)
  await writeFile(file, JSON.stringify(receipt, null, 2), {mode: 0o600}); console.log('Receipt: ' + file)
}
