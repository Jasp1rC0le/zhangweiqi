import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceDrafts } from '../src/utils/workspaceDrafts.js'

test('separates new drafts across all three workspaces', () => {
  const drafts = createWorkspaceDrafts()
  drafts.save('standard', null, 'ask draft')
  drafts.save('kimi', null, 'paper draft')
  assert.equal(drafts.read('standard'), 'ask draft')
  assert.equal(drafts.read('kimi'), 'paper draft')
  assert.equal(drafts.read('glm'), '')
})
test('leaving a saved chat does not carry its draft into a new conversation', () => {
  const drafts = createWorkspaceDrafts()
  drafts.save('standard', 7, 'follow-up question')
  assert.equal(drafts.read('standard'), '')
  assert.equal(drafts.read('standard', 7), 'follow-up question')
  assert.equal(drafts.read('standard', 8), '')
})
test('clearing a sent draft leaves other conversations and tools untouched', () => {
  const drafts = createWorkspaceDrafts()
  drafts.save('kimi', null, 'new paper')
  drafts.save('kimi', 4, 'old paper')
  drafts.save('glm', null, 'code')
  drafts.clear('kimi')
  assert.equal(drafts.read('kimi'), '')
  assert.equal(drafts.read('kimi', 4), 'old paper')
  assert.equal(drafts.read('glm'), 'code')
})
test('deleting a conversation forgets its drafts across models without clearing new drafts', () => {
  const drafts = createWorkspaceDrafts()
  for (const model of ['standard', 'kimi', 'glm']) {
    drafts.save(model, 7, 'removed conversation')
    drafts.save(model, 17, 'keep other conversation')
    drafts.save(model, null, 'keep new draft')
  }
  drafts.forgetConversation(7)
  for (const model of ['standard', 'kimi', 'glm']) {
    assert.equal(drafts.read(model, 7), '')
    assert.equal(drafts.read(model, 17), 'keep other conversation')
    assert.equal(drafts.read(model), 'keep new draft')
  }
})
test('account cutover clears every in-memory model and conversation slot without mutating prior snapshots', () => {
  const drafts = createWorkspaceDrafts()
  for (const model of ['standard', 'kimi', 'glm']) {
    drafts.save(model, null, 'old owner new draft')
    drafts.save(model, 7, 'old owner saved conversation draft')
  }
  const priorSnapshot = drafts.entries()
  drafts.reset()
  assert.deepEqual(drafts.entries(), [])
  for (const model of ['standard', 'kimi', 'glm']) {
    assert.equal(drafts.read(model), '')
    assert.equal(drafts.read(model, 7), '')
  }
  assert.equal(priorSnapshot.length, 6)
  assert.equal(priorSnapshot[0].text, 'old owner new draft')
  drafts.save('standard', null, 'next owner draft')
  assert.equal(drafts.read('standard'), 'next owner draft')
  assert.equal(drafts.read('kimi', 7), '')
})
