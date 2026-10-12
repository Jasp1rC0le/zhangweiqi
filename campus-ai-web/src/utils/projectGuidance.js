import { sourceValid, evidenceLine } from './projectStudio.js'

export const taskHints = {
  business: {
    title: '例如：市场调查课程报告',
    brief: '请直接复制老师的原话，例如：\n说明问卷样本来源与调查范围\n展示分析过程，并说明样本局限',
    material: '粘贴你已经写好的报告正文，例如：\n一、调查对象与样本来源\n二、数据分析过程\n三、结论与局限\n\n这里只放你的真实内容，数据表可以在“数据检查”中单独导入',
  },
  engineering: {
    title: '例如：电机转速测量实验报告',
    brief: '请直接复制实验任务书，例如：\n写明实验条件、仪器与参数单位\n附原始测量记录\n计算误差并分析原因',
    material: '粘贴你已经写好的实验报告，例如：\n一、实验目的与条件\n二、仪器与实验方法\n三、实验结果与误差分析\n\n这里只放你的真实记录，不要用示例数值代替测量结果',
  },
  general: {
    title: '例如：交互设计课程作品',
    brief: '请直接复制老师或项目负责人的要求，例如：\n说明作品目标与使用场景\n提交设计过程和最终成果\n说明个人贡献及演示方式',
    material: '粘贴你已经完成的作品说明、项目文档或代码说明，例如：\n一、目标与方案\n二、实现过程\n三、成果与个人贡献\n\n这里只处理文字，图片、压缩包和可执行代码暂不解析',
  },
}

export function nextProjectAction(project) {
  if (!project.title.trim()) return { label: '给项目起个名字', detail: '填课程或作业名称，方便下次继续；截止日期可暂时不填', section: 'requirements', target: 'project-title' }
  if (!project.brief.trim()) return { label: '粘贴老师的任务要求', detail: '复制任务书或作业通知中的要求，不用自己重新概括', section: 'requirements', target: 'project-brief' }
  if (!project.requirements.length) return { label: '把原文整理成清单', detail: '系统按非空行拆分，你再逐条核对；不会替你猜测评分标准', section: 'requirements', action: 'organize' }
  const invalid = project.requirements.findIndex(r => !r.title.trim() || !sourceValid(r, project.brief) || !r.confirmed)
  if (invalid >= 0) return { label: `核对第 ${invalid + 1} 条要求`, detail: '确认意思与任务书一致后勾选“我已核对”，错误或多余的项可以修改或移除', section: 'requirements', target: `requirement-${invalid}` }
  if (!project.manuscript.trim()) return { label: '放入你已经写好的材料', detail: '粘贴报告或作品说明，随后选中一段原文即可关联到要求', section: 'materials', target: 'project-manuscript' }
  const missing = project.requirements.findIndex(r => !evidenceLine(r, project.manuscript) || !r.done)
  if (missing >= 0) return { label: `补齐第 ${missing + 1} 条的材料证据`, detail: '选中正文中的对应段落并关联，再由你确认材料是否完成；没有数据表也可以继续', section: 'materials', target: 'project-manuscript', requirementId: project.requirements[missing].id }
  return { label: '运行提交前检查', detail: '清单已关联证据，运行检查后仍须复核专业内容；数据检查按需使用', section: 'review', action: 'review' }
}

export function evidenceSelection(text, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || end <= start) return null
  const quote = text.slice(start, end)
  if (!quote.trim() || quote.length > 2000) return null
  return { start, end, quote }
}
export function selectionStillValid(text, selection) {
  return !!selection && text.slice(selection.start, selection.end) === selection.quote && !!evidenceSelection(text, selection.start, selection.end)
}
