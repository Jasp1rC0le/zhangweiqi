export function answerDisclosure(message) {
  if (message?.role !== 'assistant') return ''
  if (message.localSchedule) return message.scheduleNarration?.mode === 'model' ? 'AI辅助表述' : '课表查询'
  if (message.localAction || message.action || message.academic || message.workflow) return '业务工具'
  return 'AI生成'
}

export function disclosedAnswerText(message) {
  const disclosure = answerDisclosure(message)
  const marker = disclosure.startsWith('AI') ? 'Campthink AI 生成内容，请核实' : 'Campthink 业务查询结果'
  return `【${marker}】\n\n${message.content || ''}`
}
