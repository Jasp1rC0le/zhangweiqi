import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileCanteenDraft, pendingCanteenDraftIds } from '../src/utils/canteenDrafts.js'

test('first read initializes an empty field without marking a draft', () => {
  assert.equal(reconcileCanteenDraft(undefined, undefined, '原短评'), '原短评')
  assert.deepEqual(pendingCanteenDraftIds({ 1: 4 }, { 1: '原短评' }, { 1: 4 }, { 1: '原短评' }), [])
})
test('refresh updates an unchanged value but preserves unsent typing and explicit clearing', () => {
  assert.equal(reconcileCanteenDraft('原短评', '原短评', '新短评'), '新短评')
  assert.equal(reconcileCanteenDraft('未保存', '原短评', '新短评'), '未保存')
  assert.equal(reconcileCanteenDraft('', '原短评', '新短评'), '')
  assert.equal(reconcileCanteenDraft('先填写', undefined, '远端'), '先填写')
})
test('star and comment changes count one merchant once, including invisible filtered drafts', () => {
  assert.deepEqual(pendingCanteenDraftIds({ 1: 5, 2: 2 }, { 1: '草稿', 3: '另一家' }, { 1: 4, 2: 2 }, {}), ['1', '3'])
})
test('saving the score alone cannot accept an unrelated comment draft', () => {
  assert.deepEqual(pendingCanteenDraftIds({ 1: 5 }, { 1: '未提交' }, { 1: 5 }, { 1: '旧评论' }), ['1'])
  assert.deepEqual(pendingCanteenDraftIds({ 1: 5 }, { 1: '未提交' }, { 1: 5 }, { 1: '未提交' }), [])
})
test('clearing an existing comment remains dirty until the server acknowledges the clear', () => {
  assert.deepEqual(pendingCanteenDraftIds({}, { 1: '' }, {}, { 1: '已保存' }), ['1'])
  assert.deepEqual(pendingCanteenDraftIds({}, { 1: '' }, {}, { 1: '' }), [])
})
test('background score reads do not replace an unsaved star selection', () => {
  assert.equal(reconcileCanteenDraft(5, 3, 4), 5)
  assert.equal(reconcileCanteenDraft(3, 3, 4), 4)
})
