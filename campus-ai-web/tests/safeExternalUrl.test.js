import test from 'node:test'
import assert from 'node:assert/strict'
import { safeExternalUrl } from '../src/utils/safeMarkdown.js'
test('external references accept web URLs but reject executable, relative and credential-bearing links', () => {
  assert.equal(safeExternalUrl('https://www.tsguas.edu.cn/'), 'https://www.tsguas.edu.cn/')
  for (const input of [null, '', '/api/admin', '//example.com', 'javascript:alert(1)', 'data:text/html,test', 'file:///private', 'https://name:secret@example.com/']) assert.equal(safeExternalUrl(input), null)
})
