import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftCheckpoint } from '../src/utils/draftCheckpoint.js'

test('every field counts as an unsaved change, not just the main text', () => {
  const form = { name: '同学', contact: '', subject: '', message: '' }
  const checkpoint = createDraftCheckpoint(() => form)
  assert.equal(checkpoint.isDirty(), false)
  for (const field of Object.keys(form)) {
    const original = form[field]
    form[field] = 'changed'
    assert.equal(checkpoint.isDirty(), true)
    form[field] = original
    assert.equal(checkpoint.isDirty(), false)
  }
})
test('accept only after confirmed save; failures keep the previous checkpoint', () => {
  const profile = {major:'机械工程'}
  const checkpoint = createDraftCheckpoint(() => profile)
  profile.major = '车辆工程'
  assert.equal(checkpoint.isDirty(), true)
  checkpoint.accept()
  assert.equal(checkpoint.isDirty(), false)
  profile.major = '软件工程'
  assert.equal(checkpoint.isDirty(), true)
})
