import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluationTargetLabel } from '../src/utils/evaluationTarget.js'

const item = { id: 27, expectedDocumentId: 54 }
test('preserves original gold ID before evaluation and on old backends', () => {
  assert.equal(evaluationTargetLabel(item, null), '标准资料 #54')
  assert.equal(evaluationTargetLabel(item, { cases: [{ id: 27, rank: 1 }] }), '标准资料 #54')
})
test('shows resolved current version without rewriting gold ID', () => {
  const report = { cases: [{ id: 27, targetStatus: 'REVISED', evaluatedDocumentId: 64 }] }
  assert.equal(evaluationTargetLabel(item, report), '标准资料 #54 → 当前版本 #64')
  assert.equal(item.expectedDocumentId, 54)
})
test('unavailable version names the repair action', () => {
  assert.match(evaluationTargetLabel(item, { cases: [{ id: 27, targetStatus: 'UNAVAILABLE' }] }), /无有效发布版本，请核对资料状态/)
})
test('does not use other cases or unvalidated revision IDs', () => {
  assert.equal(evaluationTargetLabel(item, { cases: [{ id: 28, targetStatus: 'REVISED', evaluatedDocumentId: 64 }] }), '标准资料 #54')
  assert.equal(evaluationTargetLabel(item, { cases: [{ id: 27, targetStatus: 'REVISED', evaluatedDocumentId: '<bad>' }] }), '标准资料 #54')
})
