// Read-only guard: never let npm ci replace dependencies under a live Vite.
import {execFileSync} from 'node:child_process'
import {readlinkSync, realpathSync} from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const normalized = value => value.replaceAll('\\', '/').replace(/\/$/, '')
export function liveVitePids(snapshot, root, workingDirectory = () => '') {
  const directory = normalized(root), web = directory + '/campus-ai-web', found = []
  for (const line of snapshot.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/)
    if (!match || !/(?:^|[\s/\\])vite(?:\.js)?(?:\s|$)/.test(match[2])) continue
    const command = normalized(match[2])
    if (command.includes(web + '/node_modules/vite/')) { found.push(Number(match[1])); continue }
    const cwd = normalized(workingDirectory(Number(match[1])) || '')
    if (cwd === web || cwd === directory) found.push(Number(match[1]))
  }
  return found
}
function processDirectory(pid) {
  if (process.platform === 'linux') { try { return readlinkSync(`/proc/${pid}/cwd`) } catch { return '' } }
  try { return execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {timeout: 3000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).split('\n').find(line => line.startsWith('n'))?.slice(1) || '' }
  catch { return '' }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = realpathSync(process.argv[2])
  const snapshot = execFileSync('ps', ['-axo', 'pid=,command='], {timeout: 5000, encoding: 'utf8'})
  const pids = liveVitePids(snapshot, root, processDirectory)
  if (pids.length) { console.error(`Release refused: live Vite PIDs ${pids.join(',')}. Build in an isolated source copy; no process was stopped.`); process.exitCode = 1 }
}
