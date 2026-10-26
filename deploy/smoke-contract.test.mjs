import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { coreTableNames, assertTableInventory, resolveSmokeArtifacts, redactGeneratedSecrets } from './smoke-contract.mjs'

test('core inventory follows actual DDL rather than a frozen table count', () => {
  const schema = 'CREATE TABLE IF NOT EXISTS users (id INT);\nCREATE TABLE `receipt_keys`(id INT);'
  assert.deepEqual(coreTableNames(schema), ['receipt_keys', 'users'])
  assert.deepEqual(coreTableNames(schema + '\nCREATE TABLE new_feature (id INT);'), ['new_feature', 'receipt_keys', 'users'])
  assert.throws(() => coreTableNames('SELECT 1;'), /must define tables/)
  assert.throws(() => coreTableNames(schema + '\nCREATE TABLE users (id INT);'), /duplicate/)
  assert.throws(() => coreTableNames('CREATE TABLE `invalid-name` (id INT);'), /unsupported/)
})

test('equal table counts cannot hide a missing required table or an extra table', () => {
  assert.doesNotThrow(() => assertTableInventory('users\nreceipt_keys', ['receipt_keys', 'users'], 'fresh'))
  assert.throws(() => assertTableInventory('users\nwrong_table', ['receipt_keys', 'users'], 'fresh'), /inventory differs/)
  assert.throws(() => assertTableInventory('users\nreceipt_keys\nextra', ['receipt_keys', 'users'], 'restored'), /inventory differs/)
})

test('source and extracted release layouts resolve without mixing their artifacts', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'campthink-smoke-contract-'))
  t.after(() => rm(root, { recursive: true, force: true })) // Only this test's fresh empty fixture.
  const put = async (name, contents = 'fixture') => { const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, contents) }
  await put('deploy/migrations/V20261004__ai_spend.sql')
  await put('deploy/migrations/V20261009__contact_submission_keys.sql')
  await put('campus-ai-server/target/campus-ai-server-0.0.1-SNAPSHOT.jar')
  await put('campus-ai-server/src/main/resources/schema.sql')
  assert.equal((await resolveSmokeArtifacts(root)).layout, 'source')
  await assert.rejects(resolveSmokeArtifacts(root, root), /missing smoke artifact/)
  await put('server.jar')
  await assert.rejects(resolveSmokeArtifacts(root), /schema-new-database-only.sql/)
  await put('schema-new-database-only.sql')
  const packaged = await resolveSmokeArtifacts(root)
  assert.equal(packaged.layout, 'release'); assert.equal(packaged.jar, path.join(root, 'server.jar'))
  assert.deepEqual(await resolveSmokeArtifacts('/unused/source', root), packaged)
})

test('failure logs redact all generated fixture credentials, including rotated tokens', () => {
  const secrets = new Set(['fixture-password', 'fixture-jwt', 'fixture-cookie', 'fixture-reset'])
  const result = redactGeneratedSecrets('fixture-password / fixture-jwt / fixture-cookie / fixture-reset', secrets)
  assert.equal(result, '[redacted] / [redacted] / [redacted] / [redacted]')
})

test('release smoke consumes the contract and bundles its helpers without fixed counts', async () => {
  const read = name => readFile(new URL(name, import.meta.url), 'utf8')
  const smoke = await read('local-smoke.mjs'), build = await read('build-release.sh')
  assert.match(smoke, /resolveSmokeArtifacts\(root, process.env.SMOKE_RELEASE_DIR\)/)
  assert.match(smoke, /coreTableNames\(schema\)/)
  assert.doesNotMatch(smoke, /'4[45]'|4[45]-table/)
  assert.match(smoke, /APP_JOBS_ENABLED: 'false'/)
  assert.match(smoke, /SPRING_SQL_INIT_MODE: 'never'/)
  assert.match(build, /smoke-contract.test.mjs/)
  assert.match(build, /smoke-contract.mjs/)
})
