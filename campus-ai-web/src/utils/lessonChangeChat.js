import { calendarDayLexeme, calendarRangeForText } from './scheduleIntent.js'
import { planActionFollowup, verifiedBellRange } from './chatActionFollowup.js'

// This grammar fills an existing versioned business form. It never selects a lesson or writes.
const moved = /调到|调至|挪到|移到|改到|调整到|换到/
const quoted = /[《“「"]([^》”」"]{1,100})[》”」"]/g
const separators = /^[\s，,；;。！？!?、]*$/
const clarify = message => ({ type: 'CLARIFY', message, preserveInput: true })
const normalizePart = raw => raw.normalize('NFKC')
  .replace(/明早/g, '明天上午').replace(/今早/g, '今天上午')
  .replace(/明晚/g, '明天晚上').replace(/今晚/g, '今天晚上')
  .replace(/(\d{1,2})[.](\d{2})(?=\s*(?:到|至|—|-|~|，|,|；|;|$))/g, '$1:$2')
const clean = raw => String(raw || '').split(/([《“「"][^》”」"]*[》”」"])/g)
  .map((part, index) => index % 2 ? part : normalizePart(part)).join('').trim()
function exactDay(value, today, previous) {
  const result = calendarRangeForText(value, { today, previous, maxDays: 1 })
  if (result.clarification) throw new Error(result.clarification)
  return result.explicit ? result.from : null
}
function instructionParts(text) {
  const match = moved.exec(text)
  // A field label is not an original lesson selector: “教室改到F2-306”.
  if (!match || /(?:教室|地点|教师|老师|原因)\s*$/.test(text.slice(0, match.index)))
    return { source: '', desired: text }
  return { source: text.slice(0, match.index), desired: text.slice(match.index + match[0].length) }
}
export function resolveLessonChangeAction(raw) {
  const text = clean(raw)
  const probe = text.replace(quoted, '《》').replace(/(?:原因|依据)\s*[:：].*$/, '')
  if (!text || /知识库|公告|资料正文|代码|函数|组件|脚本|流程|制度|规则|如何|怎么|不要|不许|别把/.test(probe) || /^(?:(?:请|帮我|给我|为我|麻烦你?)\s*)*(?:新增|新建|创建|添加|增加)/.test(probe)) return null
  const operation = /调课|代课|停课|换任课教师|(?:调到|调至|挪到|移到|调整到|换到)|(?:取消|更换|变更|修改|编辑|调整).*(?:这[一门节堂]*课|课程|节次|任课教师|任课老师|[《“「"])|(?:课|节次).*(?:取消|更换教师|调到|改到)/.test(text)
  if (!operation || !/课|节次|任课|教室|[《“「"]/.test(text)) return null
  return { kind: 'TEACHING_LESSON_CHANGE', seed: { instructions: text.length <= 1200 && !/[`{}]/.test(text) ? text : '' } }
}
export function planLessonChangeFollowup(raw, context) {
  if (!context?.active || !context.scope || context.scope !== context.requestScope)
    return clarify('操作归属已变化，没有修改旧调课草稿。')
  if (context.busy) return clarify('正在核对或保存，补充暂未处理；输入保留。')
  const text = clean(raw)
  if (/^(?:请)?(?:取消|取消操作|不保存|算了|放弃|收起)[。！!？?]?$/.test(text))
    return { type: 'CLOSE', message: '收起本次操作，不提交修改。' }
  if (['uncertain', 'saving', 'saved'].includes(context.phase))
    return clarify('原请求内容已冻结或已保存，请先核对回执；这条消息没有改动或重发。')
  if (context.userRole !== 'ADMIN') return clarify('调课、代课和取消正式课程仅由正常管理员办理；聊天不会提升身份。')
  if (!context.loaded) return clarify('先读取本校调停课能力，再补字段；没有调用模型。')
  if (!text || text.length > 1200 || /[`{}]/.test(text)) return clarify('请提供明确的单行变更，不从JSON、代码或长正文执行调课。')
  if (/^(?:请|帮我)?(?:确认|确认保存|保存|提交)[。！!？?]?$/.test(text))
    return { type: context.phase === 'preview' ? 'CONFIRM_BUTTON' : 'PREVIEW', message: '先核对预览，再手动点击确认按钮；聊天消息没有保存。' }
  if (/^(?:请|帮我)?(?:预览|生成预览|重新预览|看一下预览)[。！!？?]?$/.test(text))
    return context.target ? { type: 'PREVIEW', message: '重新核对当前版本并预览，不保存。' } : clarify('先从授权清单选准具体节次，再预览。')
  try {
    let { source, desired } = instructionParts(text)
    const courseNames = [...source.matchAll(quoted)].map(m => m[1])
    if (!context.target) {
      const selector = source || desired.replace(/(?:原因|依据)\s*[:：].*$/, '')
      const range = calendarRangeForText(selector, { today: context.today, maxDays: 31 })
      if (range.clarification) return clarify(range.clarification)
      const names = courseNames.length ? courseNames : [...selector.matchAll(quoted)].map(m => m[1])
      if (new Set(names).size > 1) return clarify('一次先选一门课程的一个具体节次，不批量替换同名安排。')
      return { type: 'QUERY', query: { ...(range.explicit ? { from: range.from, to: range.to } : {}), ...(names.length ? { search: names[0] } : {}) }, message: '已按原课日期和课程筛选；请核对教师、班级和时间，手动选中这一节，再应用补充。' }
    }
    const target = context.target, previous = { from: target.date, to: target.date }
    if (courseNames.some(name => name !== target.name)) return clarify('提到的课程与当前节次不一致，请返回授权清单另选；未替换目标。')
    if (source) {
      const day = exactDay(source, context.today, previous)
      if (day && day !== target.date) return clarify('消息中的原课日期与当前节次不同，请先核对目标；草稿未改变。')
      const rest = source.replace(quoted, '').replace(new RegExp(calendarDayLexeme, 'g'), '').replace(/请|帮我|麻烦你?|把|将|原来|原课程|原课|的|这(?:一)?[节堂门](?:课)?|课程|课/g, '')
      if (!separators.test(rest)) return clarify('原课条件还有未核对内容，请在授权列表选准，不按名称自动匹配。')
    }
    const patch = {}, targets = {}
    const reason = /(?:变更原因|原因|依据)\s*(?:改为|改成|是|[:：])?\s*(.+)$/.exec(desired)
    if (reason) { if (reason[1].trim().length > 300) return clarify('变更原因最多300字；原草稿未改变。'); patch.reason = reason[1].trim(); desired = desired.slice(0, reason.index) }
    const teacher = /(?:调整后)?(?:任课教师|任课老师|教师账号|教师|老师)\s*(?:改为|改成|换成|更换为|是|[:：])?\s*([^，,；;。\n]+)(?=[，,；;。]|$)/.exec(desired)
    if (teacher) { targets.teacherQuery = teacher[1].trim(); desired = desired.replace(teacher[0], '') }
    const cancelled = /取消(?:本次|这次|这一节|这节|这一堂|本节|明天的|今天的)?(?:课|课程)?|停课/.test(desired)
    if (cancelled) patch.action = 'CANCEL'
    else if (source || /调课|代课|调整|更换任课|更换教师|换任课教师/.test(desired)) patch.action = 'RESCHEDULE'
    // Do not let a room/student number be interpreted as a bare date.
    const calendarText = desired.replace(/(?:教室|地点)\s*(?:改为|改成|改到|是|[:：])?\s*[^，,；;。\s]+/g, '')
    const day = exactDay(calendarText, context.today, previous)
    if (day && cancelled && day !== target.date) return clarify('取消请求中的原课日期不属于当前节次，请返回清单核对。')
    if (day && !cancelled) patch.date = day
    desired = desired.replace(new RegExp(calendarDayLexeme, 'g'), '').replace(quoted, (_, name) => {
      if (name !== target.name) throw new Error('课程名称不属于当前已选节次，请返回清单核对。')
      return ''
    }).replace(/请|帮我|麻烦你?|把|将|取消(?:本次|这次|这一节|这节|这一堂|本节)?(?:课|课程)?|停课|给|换任课教师|更换任课教师|更换教师|调课|代课|调整后日期|日期|这(?:一)?[节堂门](?:课)?|本次课|本节课|的/g, '')
      .replace(/(?:^|[，,；;。])\s*(?:调到|调至|改到|改为|挪到|移到|调整到|在)\s*/g, '')
    if (!separators.test(desired)) {
      const planned = planActionFollowup(desired, { ...context, kind: 'PERSONAL_COURSE', form: { course: { ...context.form } }, metadataLocked: true, loaded: true, phase: 'editing' })
      if (!['PATCH', 'UNCHANGED'].includes(planned.type)) return clarify(planned.message)
      const fields = planned.patch?.course || {}
      if (Object.keys(fields).some(key => !['startTime', 'endTime', 'room', 'startPeriod', 'endPeriod'].includes(key))) return clarify('这里只改这一节的日期、钟点、教室或已核任课教师；学期、周次与名单要另走原教学配置。')
      if (planned.patch?.periodMode) Object.assign(patch, verifiedBellRange(context.schoolId, fields.startPeriod, fields.endPeriod))
      else for (const key of ['startTime', 'endTime']) if (fields[key]) patch[key] = fields[key]
      if (Object.hasOwn(fields, 'room')) patch.room = fields.room
    }
    if (patch.action === 'CANCEL' && (targets.teacherQuery || Object.keys(patch).some(key => !['action', 'reason'].includes(key)))) return clarify('取消这一节与调整日期、教室或教师不能同时执行，请明确一种操作；草稿未改变。')
    if (context.form?.action === 'CANCEL' && !patch.action && (targets.teacherQuery || Object.keys(patch).some(key => key !== 'reason'))) return clarify('当前为取消课草稿。要调整安排，请先明确“改为调课”；没有自动恢复或改换操作。')
    if (!Object.keys(patch).length && !Object.keys(targets).length) return clarify('请补具体日期、起止钟点或节次、教室、教师账号、原因，或明确取消这一节。')
    return { type: 'PATCH', patch, targets, message: '补充已解析，读取核对后填入这一节；旧预览失效，仍需人工确认。' }
  } catch (error) { return clarify(error.message || '补充不明确，原草稿未改变。') }
}
