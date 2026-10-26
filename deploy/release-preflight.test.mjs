import test from 'node:test'
import assert from 'node:assert/strict'
import {liveVitePids} from './release-preflight.mjs'
test('release guard finds absolute and relative Vite commands in this workspace only', () => {
  const processes = '10440 /opt/homebrew/bin/node /work/project/campus-ai-web/node_modules/vite/bin/vite.js --port 5173\n12 node node_modules/vite/bin/vite.js\n13 node /work/another/campus-ai-web/node_modules/vite/bin/vite.js\n14 node build.mjs'
  assert.deepEqual(liveVitePids(processes, '/work/project', pid => pid === 12 ? '/work/project/campus-ai-web' : '/work/another'), [10440, 12])
})
test('an isolated nested source copy does not share its parent workspace Vite', () => {
  const processes = '10440 node /work/project/campus-ai-web/node_modules/vite/bin/vite.js'
  assert.deepEqual(liveVitePids(processes, '/work/project/.local/release-copy', () => '/work/project/campus-ai-web'), [])
})
