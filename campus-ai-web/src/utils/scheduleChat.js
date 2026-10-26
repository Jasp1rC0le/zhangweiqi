import { chinaDate } from './timetable.js'
import { planScheduleQuestion, scheduleQuery, validScheduleQuery, requestScheduleQuery, validPendingSchedule } from './scheduleIntent.js'
import { validScheduleDisplay } from './scheduleDisplay.js'
import { validScheduleRefinement } from './scheduleRefinement.js'
import { validScheduleScope } from './schedulePerspective.js'
export const resolveScheduleQuestion = planScheduleQuestion
const focusOrigins = new Set(['ALL','NEXT','PREVIOUS','CURRENT','REMAINING','FIRST','LAST','AT'])

// View-only provenance: a detail answer must not turn a current/past lesson into
// an upcoming selection. Never include this hint in the API or model history.
export function scheduleFocusOrigin(query, focus, previous) {
  if (!focus || !validScheduleQuery(query)) return null
  if (query.selection === 'AT' && query.anchor === focus && previous?.focus === focus &&
      (query.perspective || 'AUTO') === (previous.perspective || 'AUTO') &&
      (!query.course || query.course === previous.course || query.course === previous.focusName)) {
    const origin = previous.focusOrigin || previous.selection
    if (focusOrigins.has(origin)) return origin
  }
  return query.selection
}

// Rebind only user-authored intent from history already read through the current
// account's protected endpoint. Never infer intent/data from a model's answer.
export function scopeScheduleHistory(messages, scope, today) {
  if (!Array.isArray(messages)) return []
  const bound = []
  for (const message of messages) {
    if (message.role !== 'user' || message.localSchedule) { bound.push(message); continue }
    const sentAt = typeof message.createdAt === 'string' ? Date.parse(message.createdAt) : NaN
    const date = Number.isFinite(sentAt) ? chinaDate(new Date(sentAt)) : today
    const intent = scope ? resolveScheduleQuestion(message.content, { today: date, previous: previousScheduleQuery(bound, scope) }) : null
    bound.push({ ...message, scheduleQuestion: validScheduleQuery(intent) ? { ...intent, scope } : intent?.clarification ? { awaiting: true, scope } : null })
  }
  return bound
}

// Only structured intent stays in this view. Never save or send course details to a model.
export function previousScheduleQuery(messages, scope) {
  if (!scope || !Array.isArray(messages)) return null
  const answer = messages.at(-1), question = messages.at(-2)
  if (answer?.role !== 'assistant' || question?.role !== 'user') return null
  if(answer.localAction && question.localAction && answer.workflowContext?.scope===scope &&
      answer.workflowContext.workflow==='PERSONAL_SOURCES' && answer.workflowContext.awaitingScheduleDate===true)
    return {awaiting:true,pendingSchedule:{period:'ALL',detail:'SUMMARY',perspective:'STUDENT'}}
  const query = answer.localSchedule || question.localSchedule
    ? answer.localSchedule && question.localSchedule && answer.scheduleQuery
    : question.scheduleQuestion
  if (!query || query.scope !== scope) return null
  const normalized = query.date ? scheduleQuery(query.date) : query
  const naturalQuestion = typeof query.naturalQuestion === 'string' && query.naturalQuestion.length <= 300 ? { naturalQuestion: query.naturalQuestion } : {}
  if (!validScheduleQuery(normalized)) return query.awaiting ? { awaiting: true,...naturalQuestion,...(validPendingSchedule(query.pendingSchedule)?{pendingSchedule:{...query.pendingSchedule}}:{}) } : null
  return { ...requestScheduleQuery(normalized), ...(query.focus ? { focus: query.focus } : {}),
    ...(query.focus && focusOrigins.has(query.focusOrigin) ? { focusOrigin: query.focusOrigin } : {}),
    ...(typeof query.focusName === 'string' && query.focusName.trim() && query.focusName.length <= 100 ? { focusName: query.focusName } : {}), ...naturalQuestion }
}

// Remove transient data only after the current protected read is denied. This
// does not mutate server history or erase unrelated public/other-scope messages.
export function clearDeniedScheduleResults(messages, scope, status) {
  if(!Array.isArray(messages))return []
  if(!scope || ![401,403].includes(status))return messages
  const remove=new Set()
  for(let i=0;i<messages.length;i++){
    const message=messages[i]
    if(!message.localSchedule || (message.scheduleQuery?.scope||message.scheduleOwner)!==scope)continue
    remove.add(i)
    const question=messages[i-1]
    if(message.role==='assistant' && question?.role==='user' && question.localSchedule &&
        (!question.scheduleOwner || question.scheduleOwner===scope))remove.add(i-1)
  }
  return messages.filter((_message,index)=>!remove.has(index))
}

export function deniedScheduleIntent(query) {
  if(!validScheduleQuery(query))return null
  return scheduleQuery(query.from,query.to,{
    period:query.period,detail:query.detail,selection:query.selection==='AT'?'ALL':query.selection,
    ...(query.perspective?{perspective:query.perspective}:{}),
  })
}

export async function readPrivateSchedule(date, signal, read) {
  const { data } = await read(date, signal)
  if (data?.date !== date || typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 20000)
    throw new Error('本人课表响应异常，请重新读取；没有显示其他日期或不完整内容')
  return data.answer
}

export async function readPrivateScheduleQuery(query, signal, read) {
  if (!validScheduleQuery(query)) throw new Error('课表查询条件无效，请重新指定日期')
  const { data } = await read(requestScheduleQuery(query), signal)
  if (data?.version !== 1 || !['from', 'to', 'period', 'selection', 'detail'].every(key => data[key] === query[key]) ||
      (data.anchor || null) !== (query.anchor || null) || !Number.isFinite(Date.parse(data.asOf)) || !Number.isInteger(data.unknownTimes) || data.unknownTimes < 0 ||
      (data.course || '') !== (query.course || '') ||
      !Number.isInteger(data.count) || data.count < 0 || data.count > 200 || typeof data.answer !== 'string' || !data.answer.trim() || data.answer.length > 100000 ||
      (data.focus != null && !validScheduleQuery({ ...query, selection: 'AT', anchor: data.focus })) ||
      (data.display !== undefined && data.display !== null && !validScheduleDisplay(data.display, data)) ||
      (data.refinement !== undefined && data.refinement !== null && !validScheduleRefinement(data.refinement, data)) ||
      !validScheduleScope(data.queryScope,query,data))
    throw new Error('本人课表响应异常，未显示错误范围的结果；请重试')
  return data
}
