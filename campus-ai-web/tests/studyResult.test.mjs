import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareStudyResult } from '../src/utils/studyResult.js'
const submitted = () => ({ form: { course: '合成课', task: '要求', blocker: '单位', attempt: '' }, source: '本人录入' })
test('complete result preserves original markdown and a detached submitted snapshot', () => {
  const input = submitted(), next = prepareStudyResult({ assistantMessage: { content: '## 建议\n核对单位\n' } }, input)
  input.form.task = '之后修改'
  assert.equal(next.answer, '## 建议\n核对单位\n'); assert.equal(next.snapshot.form.task, '要求')
})
test('empty or invalid answers cannot replace a previously completed result', () => {
  const old = { answer: '上一次结果' }; let current = old
  for (const content of ['', '  ', null, 42]) {
    assert.throws(() => { current = prepareStudyResult({ assistantMessage: { content } }, submitted()) })
    assert.equal(current, old)
  }
})
test('malformed reference collections reject before any view commit', () => {
  assert.throws(() => prepareStudyResult({ assistantMessage: { content: '新结果' }, sources: {} }, submitted()), /参考资料格式异常/)
  assert.throws(() => prepareStudyResult({ assistantMessage: { content: '新结果' }, sources: [null] }, submitted()), /参考资料不完整/)
})
test('only safe external reference links are retained', () => {
  const next = prepareStudyResult({ assistantMessage: { content: '建议' }, sources: [{ title: '安全来源', sourceUrl: 'https://example.org/' }, { title: '不安全', sourceUrl: 'javascript:alert(1)' }], webSources: [{ title: '凭据URL', url: 'https://name:secret@example.org' }] }, submitted())
  assert.equal(next.references[0].url, 'https://example.org/'); assert.equal(next.references[1].url, null); assert.equal(next.references[2].url, null)
})
test('reference collection is bounded and labels distinguish source types', () => {
  const next = prepareStudyResult({ assistantMessage: { content: '建议' }, sources: [{ title: '资料' }], webSources: Array.from({ length: 40 }, () => ({ title: '网页' })) }, submitted())
  assert.equal(next.references.length, 30); assert.equal(next.references[0].label, '资料1'); assert.equal(next.references[1].label, '网络1')
})
test('optional missing references yield an empty list without mutating request data', () => {
  const input = submitted(), before = structuredClone(input)
  assert.deepEqual(prepareStudyResult({ assistantMessage: { content: '建议' }, sources: null }, input).references, [])
  assert.deepEqual(input, before)
})
