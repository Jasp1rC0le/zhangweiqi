import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, writeFile, readFile, chmod, symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {randomBytes} from 'node:crypto'
import {Readable, Writable} from 'node:stream'
import {encrypt, decrypt, loadKey, identifier, restore} from './app-backup.mjs'
const sink = () => new Writable({write(chunk, encoding, done) { done() }})

test('encrypted streaming payload round trips and authenticates content and header', {timeout: 5000}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'campthink-backup-unit-')), key = randomBytes(32), file = path.join(dir, 'object.ctenc')
  const bytes = Buffer.from('合成原件\n' + 'x'.repeat(100000)), measured = await encrypt(Readable.from([bytes]), file, key), chunks = []
  await decrypt(file, key, new Writable({write(chunk, encoding, done) { chunks.push(chunk); done() }}), measured)
  assert.deepEqual(Buffer.concat(chunks), bytes)
  await assert.rejects(decrypt(file, randomBytes(32), sink(), measured))
  const modified = await readFile(file); modified[25] ^= 1
  const tampered = path.join(dir, 'tampered.ctenc'); await writeFile(tampered, modified, {mode: 0o600})
  await assert.rejects(decrypt(tampered, key, sink(), measured))
  await assert.rejects(decrypt(file, key, sink(), {...measured, bytes: 10}))
  const linked = path.join(dir, 'linked.ctenc'); await symlink(file, linked)
  await assert.rejects(decrypt(linked, key, sink(), measured), /regular/)
})
test('keys and destinations fail closed', {timeout: 5000}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'campthink-key-unit-')), file = path.join(dir, 'key')
  const key = randomBytes(32); await writeFile(file, key.toString('base64'), {mode: 0o600})
  assert.deepEqual(await loadKey(file), key)
  await chmod(file, 0o644); await assert.rejects(loadKey(file), /mode/)
  for (const name of ['a;DROP TABLE x', '../campus_ai', '', '`users`']) assert.throws(() => identifier(name))
  for (const db of ['campus_ai', 'mysql', 'campthink_restore_a;']) await assert.rejects(restore({db}), /new campthink_restore_/)
})
