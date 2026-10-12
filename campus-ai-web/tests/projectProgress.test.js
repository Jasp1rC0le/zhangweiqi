import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyProject, splitBrief } from '../src/utils/projectStudio.js'
import { projectChanges, defensePrompts, defenseMarkdown } from '../src/utils/projectProgress.js'

test('comparison includes actual changes without modifying versions or rendering markup', () => {
  const old = emptyProject(), next = structuredClone(old)
  assert.deepEqual(projectChanges(old,next), [])
  old.dataSheet = null
  assert.deepEqual(projectChanges(old,next), [])
  next.manuscript = '<script>private text</script>'; next.dataSheet.source = '实验记录'
  const diff = projectChanges(old,next)
  assert.deepEqual(diff.map(x=>x.label), ['材料正文','数据表与检查设置'])
  assert.equal(diff[0].after, next.manuscript)
  assert.equal(old.manuscript, '')
})
test('defense only cites existing evidence and warns about unconfirmed requirements', () => {
  const project = emptyProject(); project.brief = '说明来源'; project.requirements = splitBrief(project.brief)
  const req = project.requirements[0]; req.evidence = '我的实验'; project.manuscript = '记录\n我的实验'
  assert.equal(defensePrompts(project)[0].verified, false)
  req.confirmed = true; req.note = '我记录了条件'
  assert.equal(defensePrompts(project)[0].line, 2)
  assert.equal(defensePrompts(project)[0].verified, true)
  assert.match(defenseMarkdown(project), /我记录了条件/)
  project.manuscript = '其他内容'; project.brief = '新任务'
  assert.equal(defensePrompts(project)[0].evidence, '')
  assert.equal(defensePrompts(project)[0].verified, false)
  assert.match(defenseMarkdown(project), /未关联有效证据/)
})
