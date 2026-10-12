import { emptyDataSheet, validateDataSheet, dataCheckMarkdown, measurementMarkdown } from './projectDataCheck.js'
import { validateReviewFeedback, reviewFeedbackMarkdown } from './projectReview.js'
import { calculationMarkdown } from './columnCalculation.js'
export const tracks = [
  { id: 'business', name: '经管 · 数据报告', description: '把任务要求、数据来源、分析过程和结论放在一起', prompts: ['说明数据来源与采集范围', '记录计算过程与关键假设', '对应数据解释结论与局限'] },
  { id: 'engineering', name: '汽轨 / 制造 · 实验报告', description: '从实验要求到原始记录，逐项确认材料是否齐全', prompts: ['记录实验条件与参数单位', '保留原始记录和处理过程', '解释误差与结论的适用范围'] },
  { id: 'general', name: '通用 · 课设与作品', description: '适用于代码、设计、数媒、航空及其他项目任务', prompts: ['列明需要提交的成果与格式', '保留过程记录与个人贡献', '准备成果说明及演示步骤'] },
]
export const trackName = (id) => tracks.find(t => t.id === id)?.name || '通用项目'
export const emptyProject = () => ({ title: '', track: 'business', deadline: '', brief: '', manuscript: '', requirements: [], dataSheet: emptyDataSheet(), reviewFeedback: [] })
export const newRequirement = (title = '') => ({ id: crypto.randomUUID(), title, sourceLine: 0, sourceQuote: '', confirmed: false, done: false, evidence: '', note: '' })
export function splitBrief(brief) {
  return brief.split(/\r?\n/).map((text, index) => ({ text: text.trim(), line: index + 1 }))
    .filter(row => row.text).map(row => ({ ...newRequirement(row.text.slice(0, 300)), sourceLine: row.line, sourceQuote: row.text.slice(0, 1000) }))
}
export function sourceValid(requirement, brief) {
  if (!requirement.sourceLine) return true // Explicitly user-added, never presented as an official requirement.
  const line = brief.split(/\r?\n/)[requirement.sourceLine - 1]?.trim()
  return Boolean(requirement.sourceQuote && line === requirement.sourceQuote)
}
export function evidenceLine(requirement, manuscript) {
  const quote = requirement.evidence.trim()
  if (!quote) return 0
  const position = manuscript.indexOf(quote)
  return position < 0 ? 0 : manuscript.slice(0, position).split('\n').length
}
export function inspectProject(project) {
  const issues = []
  if (!project.brief.trim()) issues.push({ key: 'brief', severity: 'attention', title: '缺少原始任务要求', detail: '请补充任务书原文；通用建议不能替代课程要求', section: 'requirements' })
  if (!project.requirements.length) issues.push({ key: 'requirements', severity: 'missing', title: '还没有确认检查清单', detail: '按原文拆分要求，或手动添加需要完成的事项', section: 'requirements' })
  if (!project.manuscript.trim()) issues.push({ key: 'manuscript', severity: 'missing', title: '没有可检查的材料文本', detail: '在材料页粘贴报告、作品说明或代码说明', section: 'materials' })
  let covered = 0
  for (const [index, requirement] of project.requirements.entries()) {
    const base = { key: requirement.id, index, section: 'requirements', title: requirement.title || `要求 ${index + 1}` }
    if (!requirement.title.trim()) issues.push({ ...base, severity: 'missing', detail: '要求名称为空' })
    else if (!sourceValid(requirement, project.brief)) issues.push({ ...base, severity: 'attention', detail: '原文位置已变化或被截断，请删除此项后按最新原文重新整理并确认' })
    else if (!requirement.confirmed) issues.push({ ...base, severity: 'attention', detail: '这条要求尚未由你确认，不能计入覆盖情况' })
    else if (!requirement.done) issues.push({ ...base, severity: 'missing', detail: '尚未标记为已完成，请完成材料后补充证据' })
    else if (!evidenceLine(requirement, project.manuscript)) issues.push({ ...base, severity: 'missing', detail: requirement.evidence.trim() ? '证据片段不在当前材料中，可能已被修改，请重新定位' : '已勾选完成，但没有材料证据；请粘贴对应原文片段' })
    else covered++
  }
  return { issues, covered, total: project.requirements.length }
}
export function projectMarkdown(project, revision) {
  return projectTextMarkdown(project, revision) + dataCheckMarkdown(project.dataSheet) + measurementMarkdown(project.dataSheet) + calculationMarkdown(project.dataSheet) + reviewFeedbackMarkdown(project.reviewFeedback)
}
function projectTextMarkdown(project, revision) {
  const check = inspectProject(project)
  const requirements = project.requirements.map((r, i) => `### ${i + 1}. ${r.title}\n- 来源：${r.sourceLine ? `任务书第 ${r.sourceLine} 行（${sourceValid(r, project.brief) ? '位置匹配' : '位置失效'}）` : '本人补充要求，非学校标准'}\n- 原文：${r.sourceQuote || '—'}\n- 本人确认：${r.confirmed ? '是' : '否'}\n- 本人标记完成：${r.done ? '是' : '否'}\n- 材料证据：${r.evidence || '未填写'}\n- 当前证据位置：${evidenceLine(r, project.manuscript) ? `材料第 ${evidenceLine(r, project.manuscript)} 行` : '未定位'}\n- 备注：${r.note || '—'}`).join('\n\n')
  return `# ${project.title || '未命名项目'}\n\n${trackName(project.track)} · ${revision || '未保存草稿'}\n截止日期：${project.deadline || '未设置'}\n\n## 检查边界\n仅检查本人确认的清单和文本证据是否齐全，不证明任务书已被完整拆分，不验证数据、公式、引用、代码或专业正确性，不代表可以提交。没有调用模型，不消耗 Token。\n\n## 原始任务书\n${project.brief}\n\n## 要求与证据\n${requirements}\n\n## 当前材料\n${project.manuscript}\n\n## 缺项检查\n已关联文本证据 ${check.covered}/${check.total} 项\n${check.issues.map(i => `- ${i.title}：${i.detail}`).join('\n') || '当前清单未发现缺项；仍需人工核对完整任务书及专业正确性。'}\n`
}
export function validateProject(project) {
  const feedbackError = validateReviewFeedback(project.reviewFeedback)
  if (feedbackError) return feedbackError
  const dataError = validateDataSheet(project.dataSheet)
  if (dataError) return dataError
  if (!project.title.trim()) return '先给项目起一个名字'
  if (project.title.length > 100 || project.brief.length > 20000 || project.manuscript.length > 50000) return '文字超过上限：名称100字、任务书2万字、材料5万字'
  if (project.requirements.length > 80) return '每个项目最多80条要求'
  if (project.requirements.some(r => !r.title.trim() || r.title.length > 300 || r.evidence.length > 2000 || r.note.length > 1000)) return '请检查要求名称（1–300字）、证据（2000字以内）和备注（1000字以内）'
  if (JSON.stringify(project).length > 150000) return '项目总文本过大，请精简后保存'
  return ''
}
