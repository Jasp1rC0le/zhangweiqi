import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const root=new URL('../',import.meta.url)
const source=async name=>readFile(new URL(name,root),'utf8')
test('readiness checks every current core table, including feedback retry receipts',{timeout:1500},async()=>{
  const schema=await source('campus-ai-server/src/main/resources/schema.sql')
  const tables=[...schema.matchAll(/^CREATE TABLE IF NOT EXISTS (\w+)/gm)].map(m=>m[1]).sort()
  const health=await source('campus-ai-server/src/main/java/com/campusai/health/HealthController.java')
  const list=health.match(/AND table_name IN \(([\s\S]+?)\)/)?.[1]
  assert.ok(list)
  const checked=[...list.matchAll(/'([^']+)'/g)].map(m=>m[1]).sort()
  assert.deepEqual(checked,tables)
  assert.equal(Number(health.match(/tables == (\d+)/)?.[1]),tables.length)
})
test('receipt migration matches fresh schema and is packaged explicitly',{timeout:1500},async()=>{
  const schema=await source('campus-ai-server/src/main/resources/schema.sql')
  const migration=await source('deploy/migrations/V20261009__contact_submission_keys.sql')
  const definition=text=>text.match(/CREATE TABLE IF NOT EXISTS contact_submission_keys \([\s\S]*?\);/)?.[0].replace(/\s+/g,' ').trim()
  assert.ok(definition(migration));assert.equal(definition(migration),definition(schema))
  const statements=migration.replace(/^--.*$/gm,'').split(';').filter(value=>value.trim())
  assert.equal(statements.length,1)
  assert.match(statements[0],/^\s*CREATE TABLE IF NOT EXISTS contact_submission_keys\b/)
  const build=await source('deploy/build-release.sh')
  assert.ok(build.includes('V20261009__contact_submission_keys.sql'))
  assert.ok(build.includes('reliability-smoke.mjs'))
  const restore=await source('deploy/restore-drill.sh')
  assert.ok(restore.includes("table_name='contact_submission_keys'"))
})

test('release verifies mjs tests and uses bounded non-mutating static checks',{timeout:1500},async()=>{
  const build=await source('deploy/build-release.sh')
  assert.match(build,/bounded 90 node --test --test-timeout=15000 tests\s/)
  assert.doesNotMatch(build,/tests\/\*\.test\.js/)
  assert.match(build,/bounded 60 npx eslint \. --no-cache/)
  assert.match(build,/bounded 60 npx oxlint \. --deny-warnings/)
  assert.doesNotMatch(build,/npx (?:eslint|oxlint).*--fix/)
  assert.match(build,/bounded 180 mvn -q verify/)
  assert.ok(build.includes('mkdir -p "$repo_root/.local/runtime"'))
})

test('release explicitly inventories every current migration and forbids blind migration claims',{timeout:1500},async()=>{
  const {readdir}=await import('node:fs/promises')
  const names=(await readdir(new URL('deploy/migrations/',root))).filter(name=>name.endsWith('.sql'))
  const build=await source('deploy/build-release.sh')
  for(const name of names)assert.ok(build.includes(name),`missing migration: ${name}`)
  assert.match(build,/real schema diff remains mandatory/)
  assert.match(build,/isolated source copy/)
  assert.ok(build.includes('schema-new-database-only.sql'))
})
