import { evidenceLine, sourceValid, trackName } from './projectStudio.js'
import { emptyDataSheet } from './projectDataCheck.js'
import { calculationSettingsText } from './columnCalculation.js'

const requirementText = rows => rows.map((r, i) => `${i + 1}. ${r.title}\n来源：${r.sourceLine ? `第${r.sourceLine}行 ${r.sourceQuote}` : '本人补充'}\n已核对：${r.confirmed ? '是' : '否'}；已完成：${r.done ? '是' : '否'}\n证据：${r.evidence}\n备注：${r.note}`).join('\n\n')
const dataText = input => {
  const sheet = input || emptyDataSheet()
  return `来源：${sheet.source}\n${sheet.csv}\n实测列：${sheet.measuredColumn + 1}；参考列：${sheet.referenceColumn + 1}\n单位：${sheet.unit}；同单位已确认：${sheet.sameUnitConfirmed ? '是' : '否'}；误差阈值：${sheet.tolerancePercent}%\n${calculationSettingsText(sheet.calculation)}`
}
export function projectChanges(before, after) {
  const fields = [
    ['项目名称', p => p.title], ['任务方向', p => trackName(p.track)], ['截止日期', p => p.deadline || '未设置'],
    ['任务要求原文', p => p.brief], ['材料正文', p => p.manuscript],
    ['要求、证据与备注', p => requirementText(p.requirements)], ['数据表与检查设置', p => dataText(p.dataSheet)],
    ['本人复核记录', p => (p.reviewFeedback || []).map(r => `${r.title}\n${r.reason}\n检查快照：${r.fingerprint}`).join('\n\n')],
  ]
  return fields.flatMap(([label, read]) => {
    const oldValue = read(before), newValue = read(after)
    return oldValue === newValue ? [] : [{ label, before: oldValue || '（空）', after: newValue || '（空）' }]
  })
}
export function defensePrompts(project) {
  return project.requirements.map((r, index) => ({
    id: r.id, title: r.title || `要求 ${index + 1}`,
    question: `你如何完成“${r.title || '这条要求'}”？请说明方法、依据、你的贡献与局限`,
    evidence: evidenceLine(r, project.manuscript) ? r.evidence : '',
    line: evidenceLine(r, project.manuscript),
    verified: r.confirmed && sourceValid(r, project.brief),
  }))
}
export function defenseMarkdown(project) {
  return `# ${project.title || '未命名项目'} · 答辩准备\n\n这是依据本人清单整理的练习提纲，不是教师命题预测、专业评分或通过保证。\n\n` +
    defensePrompts(project).map((prompt, i) => `## ${i + 1}. ${prompt.title}\n${prompt.question}\n\n要求核对：${prompt.verified ? '本人已确认，原文位置匹配或为本人补充' : '仍需核对'}\n材料依据：${prompt.line ? `第${prompt.line}行\n${prompt.evidence}` : '未关联有效证据，请先补齐'}\n\n本人的说明：\n${project.requirements[i].note || '（待补充）'}\n`).join('\n')
}
