import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
const root = fileURLToPath(new URL('../campus-ai-web/dist/', import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(root, '.vite/manifest.json'), 'utf8'))
const main = Object.keys(manifest).find(key => manifest[key].isEntry)
if (!main) throw new Error('Build entry missing')
function filesFor(entries) {
  const keys = new Set(), files = new Set(['index.html'])
  function add(key) {
    if (keys.has(key)) return
    keys.add(key)
    const chunk = manifest[key]
    if (!chunk) throw new Error('Manifest dependency missing')
    files.add(chunk.file)
    for (const css of chunk.css || []) files.add(css)
    for (const dependency of chunk.imports || []) add(dependency)
  }
  for (const entry of entries) add(entry)
  return files
}
const combinations = { login: [main, 'src/views/LoginView.vue'], chat: [main, 'src/views/ChatView.vue'], timetable: [main, 'src/views/ChatView.vue', 'src/views/TimetableView.vue'] }
const pages = Object.fromEntries(Object.entries(combinations).map(([name, entries]) => {
  const files = filesFor(entries)
  let raw = 0, gzip = 0
  for (const file of files) { const bytes = readFileSync(resolve(root, file)); raw += bytes.length; gzip += gzipSync(bytes).length }
  const bytesPerSecond = 3000000 / 8
  return [name, { files: files.size, rawBytes: raw, gzipBytes: gzip, hundredColdClientsIdealSeconds: Math.round(gzip * 100 / bytesPerSecond) }]
}))
const result = { assumedBandwidthMbps: 3, theoreticalBytesPerSecond: 375000, measuredNetwork: false, excludes: 'API responses, image/font assets, upload workers, TLS/HTTP overhead; static manifest import graph only', pages }
writeFileSync(fileURLToPath(new URL('../.local/runtime/static-asset-budget-2026-10-15.json', import.meta.url)), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
