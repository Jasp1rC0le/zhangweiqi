import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { singleCitedKnowledgeSource as select } from '../src/utils/answerSource.js'

const library = { documentId: 35, title: '图书馆咨询电话' }
const admissions = { documentId: 12, title: '学校招生电话' }
const message = content => ({ role: 'assistant', content, sources: [library, admissions] })
test('selects cited admissions source instead of first retrieved library record', () => {
  assert.equal(select(message('招生电话见[资料2]')).source, admissions)
})
test('does not promote a source without explicit citations', () => {
  assert.equal(select(message('招生咨询电话')), null)
  assert.equal(select(message('网络资料[网络1]和列表[1]')), null)
})
test('multiple documents remain a multi-source answer without a misleading card', () => {
  assert.equal(select(message('本科电话[资料2]，图书馆电话[资料1]')), null)
})
test('repeated citations and chunks of the same document count once', () => {
  const m = { ...message('信息[资料2][资料3][资料2]'), sources: [library, admissions, { ...admissions, chunkId: 22 }] }
  assert.deepEqual(select(m), { source: admissions, sourceCount: 1 })
})
test('out-of-range references do not fall back to the first retrieved record', () => {
  for (const text of ['[资料0]', '[资料99]', '[资料2][资料99]']) assert.equal(select(message(text)), null)
})
test('code examples and markdown links are not provenance', () => {
  for (const text of ['`[资料1]`', '```txt\n[资料1]\n```', '[资料1](https://example.com)', '![资料1](x)']) {
    assert.equal(select(message(text)), null)
  }
})
test('same title and URL do not collapse different document IDs', () => {
  assert.equal(select({ ...message('[资料1][资料2]'), sources: [admissions, { ...admissions, documentId: 99 }] }), null)
})
test('partial, interrupted and user messages never receive verified-looking cards', () => {
  for (const change of [{ streaming: true }, { interrupted: true }, { role: 'user' }, { sources: null }]) {
    assert.equal(select({ ...message('[资料2]'), ...change }), null)
  }
})

test('answer card labels the cited document count rather than the retrieved chunk count', () => {
  const view = readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')
  assert.match(view, /回答引用\s*\{\{ campusServiceResult\(message\)\.sourceCount \}\}\s*份本校资料/)
  assert.doesNotMatch(view, /依据\s*\{\{ campusServiceResult\(message\)\.sourceCount \}\}\s*项本校资料/)
})

test('reference disclosure labels every retrieved item as a fragment without changing citation numbers', () => {
  const view = readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')
  assert.match(view, /<summary>本校参考片段 <span>\{\{ message\.sources\.length \}\} 条<\/span>/)
  assert.match(view, /<span>\{\{ index \+ 1 \}\}<\/span>/)
  assert.doesNotMatch(view, /<summary>参考本校资料/)
})
