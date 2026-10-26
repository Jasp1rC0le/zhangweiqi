// Application data + private originals. Never restores over an existing schema.
// Native Node AES-256-GCM; the 32-byte key is supplied in a separate private file.
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto'
import {createReadStream, createWriteStream} from 'node:fs'
import {lstat, realpath, readFile, mkdir, readdir, open, writeFile} from 'node:fs/promises'
import {pipeline} from 'node:stream/promises'
import {Readable, Transform, Writable} from 'node:stream'
import {createGzip, createGunzip} from 'node:zlib'
import {spawn} from 'node:child_process'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

const MAGIC = Buffer.from('CTBACK01')
const OMIT_DATA = new Set(['auth_sessions', 'account_action_tokens'])
const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const HASH = /^[a-f0-9]{64}$/
const children = new Set()
export function identifier(value) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value || '')) throw new Error('Invalid database/table identifier')
  return '`' + value + '`'
}
async function privateFile(file) {
  if (!path.isAbsolute(file)) throw new Error('Use an absolute private file path')
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('Private files must be regular files with mode 600 or 400')
}
async function directory(folder) {
  if (!path.isAbsolute(folder) || folder === path.parse(folder).root || await realpath(folder) !== path.resolve(folder)) throw new Error('Use an explicit real non-root directory')
  if (!(await lstat(folder)).isDirectory()) throw new Error('Directory required')
}
async function newDirectory(folder) {
  if (!path.isAbsolute(folder)) throw new Error('Use an absolute destination')
  await directory(path.dirname(folder))
  await mkdir(folder, {mode: 0o700}) // EEXIST is deliberately fatal, even when empty.
}
export async function loadKey(file) {
  await privateFile(file)
  const encoded = (await readFile(file, 'utf8')).trim()
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('Key must be a base64-encoded random 32-byte key')
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('Invalid key encoding')
  return key
}
function meter(limit = Infinity) {
  let bytes = 0
  const digest = createHash('sha256')
  const stream = new Transform({transform(chunk, encoding, done) {
    bytes += chunk.length
    if (bytes > limit) { done(new Error('Payload exceeds its declared bound')); return }
    digest.update(chunk); done(null, chunk)
  }})
  return {stream, result: () => ({bytes, sha256: digest.digest('hex')})}
}
export async function encrypt(input, destination, key) {
  const iv = randomBytes(12), header = Buffer.concat([MAGIC, iv])
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(header)
  const measured = meter()
  const output = createWriteStream(destination, {flags: 'wx', mode: 0o600})
  output.write(header)
  await pipeline(input, measured.stream, cipher, output, {end: false})
  output.end(cipher.getAuthTag())
  await new Promise((resolve, reject) => { output.once('finish', resolve); output.once('error', reject) })
  return measured.result()
}
export async function decrypt(file, key, output, expected) {
  await privateFile(file)
  const stat = await lstat(file)
  if (stat.size < 36) throw new Error('Truncated encrypted object')
  const handle = await open(file, 'r')
  const header = Buffer.alloc(20), tag = Buffer.alloc(16)
  try { await handle.read(header, 0, 20, 0); await handle.read(tag, 0, 16, stat.size - 16) }
  finally { await handle.close() }
  if (!header.subarray(0, 8).equals(MAGIC)) throw new Error('Unsupported encrypted object version')
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8))
  decipher.setAAD(header); decipher.setAuthTag(tag)
  const measured = meter(expected?.bytes ?? 16 * 1024 * 1024)
  await pipeline(createReadStream(file, {start: 20, end: stat.size - 17}), decipher, measured.stream, output)
  const result = measured.result()
  if (expected && (result.bytes !== expected.bytes || result.sha256 !== expected.sha256)) throw new Error('Restored payload checksum mismatch')
  return result
}
const discard = () => new Writable({write(chunk, encoding, done) { done() }})
function command(binary, args, timeout = 30000) {
  const child = spawn(binary, args, {stdio: ['pipe', 'pipe', 'pipe']})
  children.add(child)
  // Never echo client output/errors: it can contain account or schema data.
  child.stderr.resume(); child.stdin.on('error', () => {})
  let escalation
  const timer = setTimeout(() => { child.kill('SIGTERM'); escalation = setTimeout(() => child.kill('SIGKILL'), 2000) }, timeout)
  const done = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(`${path.basename(binary)} could not start`)))
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${path.basename(binary)} failed or timed out (${code})`)))
  }).finally(() => { clearTimeout(timer); clearTimeout(escalation); children.delete(child) })
  done.catch(() => {})
  return {child, done}
}
function mysql(options, db = options.db) {
  return [options.mysql || 'mysql', [`--defaults-file=${options.config}`, '--batch', '--raw', '--skip-column-names', ...(db ? ['--database=' + db] : [])]]
}
async function query(options, sql, db = options.db) {
  const [binary, args] = mysql(options, db), {child, done} = command(binary, args)
  child.stdin.end(sql)
  let output = ''
  for await (const chunk of child.stdout) {
    output += chunk
    if (output.length > 32 * 1024 * 1024) { child.kill(); throw new Error('Metadata exceeds supported bound') }
  }
  await done
  return output.trim()
}
async function inventory(options) {
  const tables = (await query(options, "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY table_name")).split('\n').filter(Boolean)
  if (!tables.length || tables.length > 1000) throw new Error('Invalid application table inventory')
  tables.forEach(identifier)
  for (const required of ['users', 'auth_sessions', 'account_action_tokens', 'private_material_files', 'private_material_quota']) {
    if (!tables.includes(required)) throw new Error('Required application schema is missing')
  }
  return tables
}
async function readLock(options, tables) {
  const [binary, args] = mysql(options)
  const held = command(binary, [...args, '--unbuffered'], 300000)
  held.child.stdin.write(`SET SESSION lock_wait_timeout=10; LOCK TABLES ${tables.map(t => identifier(t) + ' READ').join(',')}; SELECT 'CT_SNAPSHOT_LOCKED';\n`)
  await Promise.race([new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error('Application read-lock timed out')), 15000)
    held.child.stdout.on('data', chunk => {
      output += chunk
      if (output.includes('CT_SNAPSHOT_LOCKED')) { clearTimeout(timer); resolve() }
    })
    held.done.catch(error => { clearTimeout(timer); reject(error) })
  }), held.done.then(() => { throw new Error('Snapshot lock closed prematurely') })])
  return async () => { held.child.stdin.end('UNLOCK TABLES;\n'); await held.done }
}
async function* dump(options, tables) {
  const args = [`--defaults-file=${options.config}`, '--skip-lock-tables', '--single-transaction', '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--hex-blob', '--skip-add-drop-table']
  // Keep session/token table definitions, but never revive their rows on restore.
  for (const suffix of [['--no-data', options.db], ['--no-create-info', '--skip-triggers', options.db, ...tables.filter(t => !OMIT_DATA.has(t))]]) {
    const {child, done} = command(options.mysqldump || 'mysqldump', [...args, ...suffix], 120000)
    child.stdin.end()
    yield* child.stdout
    await done
  }
}
function payloadRecord(record) {
  if (!record || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || !HASH.test(record.sha256 || '')) throw new Error('Invalid payload manifest')
}
export async function backup(options) {
  identifier(options.db); await privateFile(options.config); await directory(options.materials)
  if (options.allowReadLock !== true) throw new Error('Backup requires an explicitly approved application-schema read-lock window')
  const key = await loadKey(options.key), tables = await inventory(options)
  await newDirectory(options.out)
  const release = await readLock(options, tables)
  try {
    // Optional caller-owned synchronization hook for isolated concurrency tests.
    // It does not replace the real MySQL locks and is not exposed by the CLI.
    await options.onLocked?.()
    const manifest = {version: 1, createdAt: new Date().toISOString(), tables, counts: {}, excludedData: [...OMIT_DATA], originals: []}
    for (const table of tables) manifest.counts[table] = OMIT_DATA.has(table) ? 0 : Number(await query(options, `SELECT COUNT(*) FROM ${identifier(table)}`))
    const metadata = await query(options, "SELECT JSON_OBJECT('id',id,'bytes',byte_size,'sha256',sha256) FROM private_material_files ORDER BY id LIMIT 100001")
    const originals = metadata ? metadata.split('\n').map(line => JSON.parse(line)) : []
    if (originals.length > 100000) throw new Error('Original inventory exceeds supported bound')
    for (const item of originals) {
      if (!ID.test(item.id)) throw new Error('Invalid original identifier')
      payloadRecord(item)
      const source = path.join(options.materials, item.id + '.bin')
      await privateFile(source)
      if ((await lstat(source)).size !== item.bytes) throw new Error('Original length does not match database')
      const saved = await encrypt(createReadStream(source), path.join(options.out, item.id + '.ctenc'), key)
      if (saved.bytes !== item.bytes || saved.sha256 !== item.sha256) throw new Error('Original content does not match database')
      manifest.originals.push({...saved, id: item.id})
    }
    const gzip = createGzip()
    const pumping = pipeline(Readable.from(dump(options, tables)), gzip)
    pumping.catch(() => {})
    manifest.database = await encrypt(gzip, path.join(options.out, 'database.sql.gz.ctenc'), key)
    await pumping
    if (JSON.stringify(await inventory(options)) !== JSON.stringify(tables)) throw new Error('Schema changed during backup; backup not finalized')
    await encrypt(Readable.from([JSON.stringify(manifest)]), path.join(options.out, 'manifest.ctenc'), key)
    // COMPLETE is last; no partial backup can look complete. It contains no private data.
    await writeFile(path.join(options.out, 'COMPLETE'), 'Campthink application snapshot v1\n', {flag: 'wx', mode: 0o600})
    return {tables: tables.length, originals: originals.length, excludedData: [...OMIT_DATA], encrypted: 'AES-256-GCM', destination: options.out}
  } finally { await release() }
}
export async function restore(options) {
  if (!/^campthink_restore_[A-Za-z0-9_]{1,46}$/.test(options.db || '')) throw new Error('Restore requires a new campthink_restore_ schema')
  identifier(options.db); await privateFile(options.config); await directory(options.from)
  if ((await readFile(path.join(options.from, 'COMPLETE'), 'utf8')) !== 'Campthink application snapshot v1\n') throw new Error('Incomplete snapshot')
  const key = await loadKey(options.key), chunks = []
  await decrypt(path.join(options.from, 'manifest.ctenc'), key, new Writable({write(chunk, encoding, done) { chunks.push(chunk); done() }}))
  const manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.tables) || !manifest.tables.length || manifest.tables.length > 1000 || !Array.isArray(manifest.originals) || manifest.originals.length > 100000) throw new Error('Invalid snapshot manifest')
  manifest.tables.forEach(identifier); payloadRecord(manifest.database)
  if (new Set(manifest.tables).size !== manifest.tables.length || JSON.stringify(manifest.excludedData) !== JSON.stringify([...OMIT_DATA])) throw new Error('Invalid table policy')
  for (const table of manifest.tables) if (!Number.isSafeInteger(manifest.counts[table]) || manifest.counts[table] < 0 || (OMIT_DATA.has(table) && manifest.counts[table] !== 0)) throw new Error('Invalid table count')
  const expectedFiles = new Set(['COMPLETE', 'manifest.ctenc', 'database.sql.gz.ctenc'])
  for (const item of manifest.originals) {
    if (!ID.test(item.id)) throw new Error('Invalid original identifier')
    payloadRecord(item)
    const name = item.id + '.ctenc'
    if (expectedFiles.has(name)) throw new Error('Duplicate original')
    expectedFiles.add(name)
    await decrypt(path.join(options.from, name), key, discard(), item)
  }
  if ((await readdir(options.from)).some(name => !expectedFiles.has(name))) throw new Error('Unexpected backup object')
  await decrypt(path.join(options.from, 'database.sql.gz.ctenc'), key, discard(), manifest.database)
  // Authentication and all payload checks happen before any restore mutation.
  if (await query(options, `SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${options.db}'`, '') !== '0') throw new Error('Refusing to overwrite an existing database')
  await newDirectory(options.materials)
  await query(options, `CREATE DATABASE ${identifier(options.db)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, '')
  const [binary, args] = mysql(options), importing = command(binary, args, 120000), unzip = createGunzip()
  importing.child.stdout.resume()
  const importingData = pipeline(unzip, importing.child.stdin)
  importingData.catch(() => {})
  await decrypt(path.join(options.from, 'database.sql.gz.ctenc'), key, unzip, manifest.database)
  await importingData; await importing.done
  for (const item of manifest.originals) {
    await decrypt(path.join(options.from, item.id + '.ctenc'), key, createWriteStream(path.join(options.materials, item.id + '.bin'), {flags: 'wx', mode: 0o600}), item)
  }
  if (JSON.stringify(await inventory(options)) !== JSON.stringify(manifest.tables)) throw new Error('Restored table inventory mismatch')
  for (const table of manifest.tables) if (Number(await query(options, `SELECT COUNT(*) FROM ${identifier(table)}`)) !== manifest.counts[table]) throw new Error('Restored table count mismatch')
  const restored = await query(options, "SELECT JSON_OBJECT('id',id,'bytes',byte_size,'sha256',sha256) FROM private_material_files ORDER BY id")
  const metadata = restored ? restored.split('\n').map(line => JSON.parse(line)) : []
  if (JSON.stringify(metadata.map(x => [x.id, x.bytes, x.sha256])) !== JSON.stringify(manifest.originals.map(x => [x.id, x.bytes, x.sha256]))) throw new Error('Restored originals do not match restored database')
  return {tables: manifest.tables.length, originals: manifest.originals.length, restoredSessions: 0, restoredActionTokens: 0, database: options.db, materials: options.materials}
}
export function terminateChildren() { for (const child of children) child.kill('SIGTERM') }
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, ...args] = process.argv.slice(2), options = {}
  for (let n = 0; n < args.length; n += 2) {
    if (!args[n].startsWith('--') || args[n + 1] === undefined) throw new Error('Expected --option value')
    options[args[n].slice(2)] = args[n + 1]
  }
  options.allowReadLock = options['allow-read-lock'] === 'yes'
  const deadline = setTimeout(() => { terminateChildren(); console.error('Snapshot exceeded 5 minutes; partial output is not a valid backup'); process.exit(124) }, 300000)
  process.once('SIGTERM', () => { terminateChildren(); process.exit(143) })
  process.once('SIGINT', () => { terminateChildren(); process.exit(130) })
  try {
    if (!['backup', 'restore'].includes(mode)) throw new Error('Use backup or restore; read deploy/app-backup.md first')
    console.log(JSON.stringify(await (mode === 'backup' ? backup(options) : restore(options))))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
  finally { clearTimeout(deadline); terminateChildren() }
}
