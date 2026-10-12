import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyProject, splitBrief, newRequirement, inspectProject, sourceValid, evidenceLine, projectMarkdown, validateProject } from '../src/utils/projectStudio.js'

const complete = () => ({ ...emptyProject(), title: '报告', brief: '说明数据来源\n\n说明局限', manuscript: '报告\n来源是课程问卷\n仅代表样本', requirements: splitBrief('说明数据来源\n\n说明局限').map((r, index) => ({ ...r, confirmed: true, done: true, evidence: index ? '仅代表样本' : '来源是课程问卷' })) })
test('split preserves original line locations and requires explicit confirmation', () => {
  const rows = splitBrief(' 第一项\r\n\r\n第二项 ')
  assert.deepEqual(rows.map(r => r.sourceLine), [1, 3])
  assert.ok(rows.every(r => !r.confirmed && !r.done && !r.evidence))
  assert.equal(rows[0].sourceQuote, '第一项')
})
test('empty project cannot claim no missing requirements', () => {
  const result = inspectProject(emptyProject())
  assert.equal(result.covered, 0)
  assert.deepEqual(result.issues.map(i => i.key), ['brief', 'requirements', 'manuscript'])
})
test('checked completion alone cannot pass evidence coverage', () => {
  const project = complete(); project.requirements[0].evidence = ''
  assert.equal(inspectProject(project).covered, 1)
  assert.match(inspectProject(project).issues[0].detail, /没有材料证据/)
})
test('edited source and deleted evidence invalidate the corresponding items', () => {
  const project = complete(); project.brief = '新的要求\n\n说明局限'; project.manuscript = '来源是课程问卷'
  assert.equal(sourceValid(project.requirements[0], project.brief), false)
  assert.equal(inspectProject(project).covered, 0)
  assert.equal(inspectProject(project).issues.length, 2)
})
test('valid exact evidence is located but never claims professional correctness', () => {
  const project = complete()
  assert.equal(evidenceLine(project.requirements[0], project.manuscript), 2)
  assert.equal(inspectProject(project).covered, 2)
  assert.equal(inspectProject(project).issues.length, 0)
  assert.match(projectMarkdown(project, 'v1'), /不验证数据、公式、引用、代码或专业正确性/)
  assert.match(projectMarkdown(project, 'v1'), /任务书第 3 行/)
})
test('unconfirmed and incomplete requirements stay unresolved', () => {
  const project = complete(); project.requirements[0].confirmed = false; project.requirements[1].done = false
  assert.equal(inspectProject(project).covered, 0)
  assert.equal(inspectProject(project).issues.length, 2)
})
test('user additions are distinguished from course requirements', () => {
  const project = complete(); project.requirements = [{ ...newRequirement('个人计划'), confirmed: true, done: true, evidence: '课程问卷' }]
  assert.match(projectMarkdown(project, ''), /本人补充要求，非学校标准/)
})
test('validation enforces required fields and total payload budget', () => {
  assert.ok(validateProject(emptyProject()))
  assert.equal(validateProject(complete()), '')
  const project = complete(); project.requirements[0].title = ' '
  assert.match(validateProject(project), /要求名称/)
  project.requirements = Array.from({ length: 81 }, () => newRequirement('要求'))
  assert.match(validateProject(project), /80条/)
})
test('overlong source lines cannot silently pass after truncation', () => {
  const project = emptyProject(); project.brief = '甲'.repeat(1001); project.requirements = splitBrief(project.brief)
  assert.equal(sourceValid(project.requirements[0], project.brief), false)
})
