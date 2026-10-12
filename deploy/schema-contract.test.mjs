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
test('private timetable upgrade covers the current schema and release checks',{timeout:1500},async()=>{
  const schema=await source('campus-ai-server/src/main/resources/schema.sql')
  const migration=await source('deploy/migrations/2026-10-11-private-timetables.sql')
  const names=['student_timetable_versions','student_timetables','student_course_schedule_versions','student_course_schedules']
  const definition=(text,name)=>text.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\);`))?.[0].replace(/\s+/g,' ').trim()
  for (const name of names) {
    assert.ok(definition(migration,name),name)
    assert.equal(definition(migration,name),definition(schema,name),name)
  }
  const statements=migration.replace(/^--.*$/gm,'').split(';').filter(value=>value.trim())
  assert.equal(statements.length,4)
  for (const statement of statements) assert.match(statement,/^\s*CREATE TABLE IF NOT EXISTS student_/)
  const build=await source('deploy/build-release.sh')
  assert.ok(build.includes('2026-10-11-private-timetables.sql'))
  assert.match(build,/node --test[^\n]+tests\/\*\.test\.js[^\n]+tests\/\*\.test\.mjs/)
  const restore=await source('deploy/restore-drill.sh')
  for (const name of names) assert.ok(restore.includes(`'${name}'`))
  assert.ok(restore.includes('"$table_count" -ge 49'))
})
