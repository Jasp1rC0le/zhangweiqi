import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)

function atLeast(version, minimum) {
  const parts = version.split('.').map(Number)
  for (let index = 0; index < minimum.length; index++) {
    if (parts[index] !== minimum[index]) return parts[index] > minimum[index]
  }
  return true
}

test('installed source-map and shell quoting dependencies retain reviewed security fixes', { timeout: 1000 }, () => {
  assert.ok(atLeast(require('source-map-js/package.json').version, [1, 2, 2]))
  assert.ok(atLeast(require('shell-quote/package.json').version, [1, 11, 0]))
})

test('shell quoting rejects line terminators after comments without executing any command', { timeout: 1000 }, () => {
  const { quote } = require('shell-quote')
  for (const separator of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => quote(['ordinary', { comment: 'note' }, `value${separator}other`]), TypeError)
  }
  assert.equal(typeof quote(['ordinary', 'value with spaces']), 'string')
})
