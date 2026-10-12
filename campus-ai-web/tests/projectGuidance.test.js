import test from 'node:test'
import assert from 'node:assert/strict'
import { nextProjectAction, evidenceSelection, selectionStillValid, taskHints } from '../src/utils/projectGuidance.js'
import { emptyProject, splitBrief } from '../src/utils/projectStudio.js'

test('guidance moves from name to source, confirmation, materials and checks without requiring optional data', () => {
  const p = emptyProject()
  assert.equal(nextProjectAction(p).target, 'project-title')
  p.title = '报告'
  assert.equal(nextProjectAction(p).target, 'project-brief')
  p.brief = '说明来源'
  assert.equal(nextProjectAction(p).action, 'organize')
  p.requirements = splitBrief(p.brief)
  assert.equal(nextProjectAction(p).target, 'requirement-0')
  p.requirements[0].confirmed = true
  assert.equal(nextProjectAction(p).target, 'project-manuscript')
  p.manuscript = '我的来源记录'
  assert.equal(nextProjectAction(p).requirementId, p.requirements[0].id)
  p.requirements[0].evidence = '来源记录'; p.requirements[0].done = true
  assert.equal(nextProjectAction(p).action, 'review')
  p.brief = '修改来源要求'
  assert.equal(nextProjectAction(p).target, 'requirement-0')
})
test('selection only accepts bounded original text and detects stale offsets', () => {
  const text = '正文\n来自本人的实验记录\n结束'
  const selected = evidenceSelection(text, 3, 12)
  assert.equal(selected.quote, '来自本人的实验记录')
  assert.equal(selectionStillValid(text, selected), true)
  assert.equal(selectionStillValid('修改' + text, selected), false)
  for (const [source, start, end] of [['', 0, 1], ['  ', 0, 2], ['abc', -1, 2], ['abc', 2, 1], ['x'.repeat(2001), 0, 2001]]) assert.equal(evidenceSelection(source, start, end), null)
})
test('each supported direction has field-specific examples and does not inject example data into new projects', () => {
  for (const track of ['business', 'engineering', 'general']) {
    assert.ok(taskHints[track].title && taskHints[track].brief && taskHints[track].material)
    assert.equal(emptyProject().manuscript, '')
  }
})
