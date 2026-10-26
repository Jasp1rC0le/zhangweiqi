// Artifact and schema contract for the disposable, loopback-only release smoke.
import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import path from 'node:path'

export function coreTableNames(schema) {
  const definitions = [...schema.matchAll(/^[\t ]*CREATE\s+TABLE\b([^\r\n]*)/gim)]
  assert.ok(definitions.length, 'core schema must define tables')
  const names = definitions.map(([, definition]) => {
    const match = definition.match(/^\s+(?:IF\s+NOT\s+EXISTS\s+)?(`?)([a-z][a-z0-9_]{0,63})\1\s*\(/i)
    assert.ok(match, 'unsupported core table declaration; review the schema contract')
    return match[2].toLowerCase()
  })
  assert.equal(new Set(names).size, names.length, 'duplicate core table declaration')
  return names.sort()
}

export function assertTableInventory(rows, expected, label) {
  const actual = rows.trim() ? rows.trim().split(/\r?\n/).sort() : []
  assert.deepEqual(actual, [...expected].sort(), `${label}: exact core table inventory differs`)
}

async function exists(file) {
  try { return (await stat(file)).isFile() } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

export async function resolveSmokeArtifacts(sourceRoot, releaseDirectory) {
  const root = path.resolve(releaseDirectory || sourceRoot)
  const packagedJar = path.join(root, 'server.jar')
  const packagedSchema = path.join(root, 'schema-new-database-only.sql')
  const hasJar = await exists(packagedJar), hasSchema = await exists(packagedSchema)
  const packaged = Boolean(releaseDirectory) || hasJar || hasSchema
  const jar = packaged ? packagedJar : path.join(root, 'campus-ai-server/target/campus-ai-server-0.0.1-SNAPSHOT.jar')
  const schema = packaged ? packagedSchema : path.join(root, 'campus-ai-server/src/main/resources/schema.sql')
  const migrations = path.join(root, 'deploy/migrations')
  const required = [jar, schema, ...['V20261004__ai_spend.sql', 'V20261009__contact_submission_keys.sql'].map(name => path.join(migrations, name))]
  for (const file of required) assert.ok(await exists(file), `missing smoke artifact: ${file}`)
  return { root, jar, schema, migrations, layout: packaged ? 'release' : 'source' }
}

export function redactGeneratedSecrets(text, secrets) {
  let result = String(text)
  for (const value of [...secrets].filter(value => typeof value === 'string' && value.length).sort((a, b) => b.length - a.length)) {
    result = result.replaceAll(value, '[redacted]')
  }
  return result
}
