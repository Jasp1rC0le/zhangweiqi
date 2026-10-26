import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('production policy permits opt-in same-origin voice while denying camera and location', { timeout: 1500 }, async () => {
  const source = await readFile(new URL('./Caddyfile.example', import.meta.url), 'utf8')
  const headers = [...source.matchAll(/^\s*header Permissions-Policy "([^"]+)"/gm)]
  assert.equal(headers.length, 1, 'one unambiguous Permissions-Policy header')
  const directives = headers[0][1].split(',').map(value => value.trim())
  assert.deepEqual(directives.sort(), ['camera=()', 'geolocation=()', 'microphone=(self)'])
  const component = await readFile(new URL('../campus-ai-web/src/components/HoldToTalk.vue', import.meta.url), 'utf8')
  assert.match(component, /policy\.allowsFeature\('microphone'\)/)
  assert.match(component, /enabled\.value&&consent\.value/)
})
