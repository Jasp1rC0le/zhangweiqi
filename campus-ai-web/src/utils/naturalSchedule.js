import { validScheduleQuery, requestScheduleQuery } from './scheduleIntent.js'
import { readPrivateScheduleQuery } from './scheduleChat.js'

// Never send display entries, rosters, assistant answers or arbitrary history.
export function naturalScheduleContext(previous) {
  if (!validScheduleQuery(previous)) return null
  return {
    ...requestScheduleQuery(previous),
    ...(previous.focus ? { focus: previous.focus } : {}),
    ...(typeof previous.focusName === 'string' && previous.focusName.length <= 100 ? { focusName: previous.focusName } : {}),
  }
}
export async function readNaturalSchedule(question, previous, signal, ask) {
  if (typeof question !== 'string' || !question.trim() || question.length > 300) throw new Error('请用300字以内描述课表问题')
  const previousQuestion = typeof previous?.naturalQuestion === 'string' && previous.naturalQuestion.length <= 300 ? previous.naturalQuestion : null
  const { data } = await ask({ question, previous: naturalScheduleContext(previous), previousQuestion }, signal)
  signal?.throwIfAborted()
  if (data?.version !== 1 || !['deepseek', 'kimi', 'glm'].includes(data.interpreter?.provider) || typeof data.interpreter.model !== 'string' || !data.interpreter.model || data.interpreter.model.length > 100)
    throw new Error('课表语义解析响应异常，未显示未核实结果')
  if (data.query) {
    if (data.clarification || !validScheduleQuery(data.query)) throw new Error('模型返回的课表条件不完整，问题仍保留')
    const query = requestScheduleQuery(data.query)
    const result = await readPrivateScheduleQuery(query, signal, async () => ({ data: data.result }))
    return { query, result, interpreter: data.interpreter, narration: scheduleNarration(data.narration) }
  }
  if (data.result != null || typeof data.clarification !== 'string' || !data.clarification.trim() || data.clarification.length > 300)
    throw new Error('课表语义解析响应异常，未显示未核实结果')
  return { query: { clarification: data.clarification }, result: null, interpreter: data.interpreter }
}
function scheduleNarration(value){
  if(value==null)return null
  if(!['model','facts'].includes(value.mode)||value.mode==='model'&&(!['deepseek','kimi','glm'].includes(value.provider)||typeof value.model!=='string'||!value.model||value.model.length>100)||typeof value.reason!=='string'||value.reason.length>100)throw new Error('课表回答来源异常，请重新读取')
  return value
}
export function naturalScheduleNotice(narration){
  if(narration?.mode==='model')return'已查询统一课表 · AI根据课程记录回答'
  if(narration?.reason==='updated')return'课表刚有更新，已展示最新课程记录'
  if(narration?.mode==='facts'&&narration.reason==='unavailable')return'课表已读取，先显示课程记录；AI文字整理暂不可用'
  if(narration?.mode==='facts')return'课表已读取 · 已显示课程记录'
  return'模型理解问题 · 统一课表查询结果'
}
