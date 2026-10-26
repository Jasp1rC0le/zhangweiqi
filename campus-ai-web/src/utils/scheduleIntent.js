import { addDays, dayNumber, mondayOf } from './timetable.js'
import { validSchedulePerspective } from './schedulePerspective.js'
import { extractScheduleTiming } from './scheduleTimingIntent.js'
import { scheduleSourceLookup } from './scheduleSourceLookup.js'
import { isScheduleReadCancellation, stripScheduleReadModifiers } from './scheduleReadWords.js'
import { protectScheduleCoursePhrase } from './scheduleCoursePhrase.js'

// Lexemes supply independent slots, not an ever-growing list of complete questions.
const dayLexeme = /大后天|后天|后日|明天|明日|今天|今日|昨日|昨天|前天|前日|(?:下下周|下周|本周|这周|上周|下(?:个)?星期|下礼拜|周|星期|礼拜)[一二三四五六日天1-7]|\d{4}-\d{1,2}-\d{1,2}|(?:\d{4}年)?(?:\d{1,2}|[一二三四五六七八九十]{1,3})月(?:\d{1,2}|[一二两三四五六七八九十]{1,3})[日号]?|(?:本月|这个月|下个月|上个月)?(?:\d{1,2}|[一二两三四五六七八九十]{1,3})[日号]/
export const calendarDayLexeme = dayLexeme.source
const timeLexeme = new RegExp(`${dayLexeme.source}|(?:本周末|这周末|下周末|周末|下下周|下周|本周|这周|上周|本星期|这星期|下星期|本礼拜|这礼拜|下礼拜|工作日)|(?:下一天|第二天|后一天)`, 'g')
const periodLexemes = [['AM', /上午|早上|早晨|早间/g], ['PM', /下午|午后/g], ['EVENING', /晚上|晚间|夜里/g], ['ALL', /全天|一整天/g]]
const selectionLexemes = [['NEXT', /再?下(?:一)?(?:节|堂)(?:课)?|接下来一(?:节|堂)(?:课)?/g], ['PREVIOUS', /再?上(?:一)?(?:节|堂)(?:课)?|前一(?:节|堂)(?:课)?/g], ['CURRENT', /现在|此刻|当前|正在/g], ['REMAINING', /还有|剩下|剩余|还没结束/g], ['FIRST', /第一(?:节|堂)(?:课)?|最早一(?:节|堂)(?:课)?/g], ['LAST', /最后一(?:节|堂)(?:课)?|最晚一(?:节|堂)(?:课)?|(?:几点|什么时候)(?:可以|能|才能)?(?:放学|下完课)/g]]
const detailLexemes = [['LOCATION', /(?:在|去|到)(?:哪(?:一?[个间])?(?:教室|教学楼|地方|里|儿)?|什么地方)(?:上(?:课)?)?|哪里(?:上(?:课)?)?|哪(?:一?[个间])?教室|教室|地点/g], ['TEACHER', /任课(?:老师|教师)?|老师|教师|谁(?:来)?(?:给我(?:们)?|教我(?:们)?)?(?:上课|教课|教)?/g], ['TIME', /几点(?:钟)?(?:开始|结束|上课|下课|上|下)?|什么时候(?:开始|结束|上课|下课|上|下)?|何时(?:开始|结束|上课|下课)?|时间|钟点/g], ['PERIODS', /多少节(?:课)?|几节/g], ['COURSES', /多少门(?:课)?|几门/g], ['COUNT', /多少|几堂|数量/g], ['FREE', /有空|空闲|没课/g]]
const validDate = date => {
  try { dayNumber(date); return date >= '2000-01-01' && date <= '2100-12-31' } catch { return false }
}
const clean = text => text.normalize('NFKC').replace(/[\s？?！!，,。；;：:]/g, '')
  .replace(/(下下|上|下|这|本)(?:个)?(?:星期|礼拜|周)/g, '$1周')
  .replace(/(下下|上|下|这|本)周(?:周|星期|礼拜)(?=[一二三四五六日天1-7])/g, '$1周')
  .replace(/今早|今晨/g, '今天上午').replace(/明早/g, '明天上午').replace(/今晚/g, '今天晚上').replace(/明晚/g, '明天晚上')
  .replace(/今儿(?:个)?/g, '今天').replace(/明儿(?:个)?/g, '明天')
  .replace(/(\d{4})\/(\d{1,2})\/(\d{1,2})/g,'$1-$2-$3')
  .replace(/(^|[^\d./])(\d{1,2})[./](\d{1,2})(?![\d./])/g,'$1$2月$3日')
const clarify = (text,pendingSchedule) => ({ clarification: text,...(pendingSchedule?{pendingSchedule}:{}) })
const requestPrefix=/^(?:麻烦(?:你)?|能不能|能否|可以|请问|请|帮我|告诉我|跟我说|说一下|我(?:想|要)?(?:知道|了解)|想知道|给我|查(?:询|一下|一查|下|查)?|看(?:一下|一看|下|看)?|那(?:么)?|还有|(?:本人|自己|个人)的?(?=课表|课程)|我(?:想|的)?)+/
const courseReferenceLexeme=/刚才那(?:一)?(?:门|节|堂)(?:课)?|这(?:一)?(?:门|节|堂)(?:课)?|那(?:一)?(?:门|节|堂)(?:课)?/g
const readScopeStart=new RegExp(`^(?:${timeLexeme.source}|${[...periodLexemes,...selectionLexemes].map(([,expression])=>expression.source).join('|')})`)
const choose = (value, lexemes) => lexemes.filter(([, expression]) => new RegExp(expression.source).test(value)).map(([slot]) => slot)
export const scheduleQuery = (from, to = from, options = {}) => ({ from, to, period: 'ALL', selection: 'ALL', detail: 'SUMMARY', ...options })
export function validPendingSchedule(value) {
  return !!value && typeof value==='object' && !Array.isArray(value) &&
    Object.keys(value).every(key=>['course','period','detail','perspective'].includes(key)) &&
    (value.course==null || typeof value.course==='string' && !!value.course.trim() && value.course.length<=100) &&
    ['ALL','AM','PM','EVENING'].includes(value.period) &&
    ['SUMMARY','LOCATION','TEACHER','TIME','COUNT','COURSES','PERIODS','FREE','WAIT_START','WAIT_END','DURATION'].includes(value.detail) &&
    validSchedulePerspective(value.perspective)
}
export function validScheduleQuery(q) {
  return !!q && validDate(q.from) && validDate(q.to) && dayNumber(q.to) >= dayNumber(q.from) && dayNumber(q.to) - dayNumber(q.from) <= 13 &&
    validSchedulePerspective(q.perspective) &&
    (q.course == null || typeof q.course === 'string' && q.course.length <= 100) &&
    ['ALL', 'AM', 'PM', 'EVENING'].includes(q.period) && ['ALL', 'NEXT', 'PREVIOUS', 'CURRENT', 'REMAINING', 'FIRST', 'LAST', 'AT'].includes(q.selection) &&
    ['SUMMARY', 'LOCATION', 'TEACHER', 'TIME', 'COUNT', 'COURSES', 'PERIODS', 'FREE','WAIT_START','WAIT_END','DURATION'].includes(q.detail) &&
    (!q.anchor || (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(q.anchor) && validDate(q.anchor.slice(0, 10)) && q.anchor.slice(0, 10) >= q.from && q.anchor.slice(0, 10) <= q.to && Number(q.anchor.slice(11, 13)) < 24 && Number(q.anchor.slice(14, 16)) < 60 && Number(q.anchor.slice(17,19)||0)<60 && ['NEXT', 'PREVIOUS', 'AT'].includes(q.selection))) &&
    (q.selection !== 'AT' || !!q.anchor)
}
export function requestScheduleQuery(q) {
  return scheduleQuery(q.from, q.to, { period: q.period, selection: q.selection, detail: q.detail, ...(q.anchor ? { anchor: q.anchor } : {}), ...(q.course ? { course: q.course } : {}), ...(q.perspective ? { perspective: q.perspective } : {}) })
}
function timeRange(token, today, base) {
  const offsets = { 前天: -2, 前日: -2, 昨天: -1, 昨日: -1, 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 后日: 2, 大后天: 3 }
  if (Object.hasOwn(offsets, token)) return { from: addDays(today, offsets[token]), days: 1 }
  if (/下一天|第二天|后一天/.test(token)) return { from: addDays(base || today, 1), days: 1 }
  const weekday = token.match(/^(下下周|下周|本周|这周|上周|下(?:个)?星期|下礼拜|周|星期|礼拜)([一二三四五六日天1-7])$/)
  if (weekday) {
    const direction = weekday[1]
    const week = direction === '下下周' ? 2 : direction.startsWith('下') ? 1 : direction === '上周' ? -1 : 0
    const day = /^[1-7]$/.test(weekday[2]) ? Number(weekday[2]) - 1 : '一二三四五六日'.indexOf(weekday[2].replace('天', '日'))
    return { from: addDays(mondayOf(/^(周|星期|礼拜)$/.test(direction) ? base || today : today), week * 7 + day), days: 1 }
  }
  if (/周|星期|礼拜|工作日/.test(token)) {
    const week = token.startsWith('下下') ? 2 : token.startsWith('下') ? 1 : token.startsWith('上') ? -1 : 0
    const monday = addDays(mondayOf(token === '周末' || token === '工作日' ? base || today : today), week * 7)
    return { from: addDays(monday, token.endsWith('末') ? 5 : 0), days: token.endsWith('末') ? 2 : token === '工作日' ? 5 : 7 }
  }
  const digits={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}
  const number=value=>/^\d+$/.test(value)?Number(value):value.includes('十')?(value.split('十')[0]?digits[value.split('十')[0]]:1)*10+(value.split('十')[1]?digits[value.split('十')[1]]:0):digits[value]
  const iso=token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const full=token.match(/^(?:(\d{4})年)?([\d一二三四五六七八九十]{1,3})月([\d一二两三四五六七八九十]{1,3})[日号]?$/)
  const bare=token.match(/^(本月|这个月|下个月|上个月)?([\d一二两三四五六七八九十]{1,3})[日号]$/)
  let year,month,day
  if(iso){year=Number(iso[1]);month=Number(iso[2]);day=Number(iso[3])}
  else if(full){year=Number(full[1] || today.slice(0,4));month=number(full[2]);day=number(full[3])}
  else if(bare){
    const reference=bare[1]?today:base || today,shift=bare[1]==='下个月'?1:bare[1]==='上个月'?-1:0
    const serial=Number(reference.slice(0,4))*12+Number(reference.slice(5,7))-1+shift
    year=Math.floor(serial/12);month=serial%12+1;day=number(bare[2])
  }else return null
  const from = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  return validDate(from) ? { from, days: 1 } : null
}

// Shared calendar slots for bounded teaching evidence, not a new list of complete questions.
export function calendarRangeForText(text,{today,previous=null,maxDays=31}={}) {
  if(typeof text!=='string'||!validDate(today))return{clarification:'请提供有效日期。'}
  const value=clean(text).replace(/上月/g,'上个月').replace(/下月/g,'下个月').replace(/(?:学号|账号|编号)[:：]?[\da-zA-Z-]+号?/g,'')
  if(/第[\d一二三四五六七八九十]+周|学期|学年|全年|整年|去年|明年|[寒暑]假|[\d一二两三四五六七八九十]+年以?前/.test(value))return{clarification:`请给出自然日期或自然周，每次最多${maxDays}天；教学周、学期和学年不会被默认成今天。`}
  const recent=/(?:最近|过去|近)(\d{1,3}|[一二两三四五六七八九十]{1,3})(?:个)?(天|日|周|星期)/.exec(value)
  if(recent){const digits={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9},n=/^\d+$/.test(recent[1])?Number(recent[1]):recent[1].includes('十')?(digits[recent[1].split('十')[0]]||1)*10+(digits[recent[1].split('十')[1]]||0):digits[recent[1]],days=n*(/周|星期/.test(recent[2])?7:1);if(!Number.isInteger(days)||days<1||days>maxDays)return{clarification:`一次最多查询${maxDays}天，请缩小日期范围。`};return{from:addDays(today,1-days),to:today,explicit:true}}
  const expression=new RegExp(`${timeLexeme.source}|本月|这个月|上个月|下个月`,'g'),tokens=[...value.matchAll(expression)]
  if(!tokens.length){if(previous&&validDate(previous.from)&&validDate(previous.to)&&dayNumber(previous.to)>=dayNumber(previous.from)&&dayNumber(previous.to)-dayNumber(previous.from)<maxDays)return{from:previous.from,to:previous.to,explicit:false,inherited:true};return{from:mondayOf(today),to:addDays(mondayOf(today),6),explicit:false,inherited:false}}
  if(tokens.length>2||tokens.length===2&&!/到|至|—|–|-|~/.test(value.slice(tokens[0].index+tokens[0][0].length,tokens[1].index)))return{clarification:'要查哪一天，还是一段连续日期？例如“上周”或“10月12日到10月16日”。'}
  const range=token=>{if(/^(?:本月|这个月|上个月|下个月)$/.test(token)){const offset=token==='上个月'?-1:token==='下个月'?1:0,serial=Number(today.slice(0,4))*12+Number(today.slice(5,7))-1+offset,year=Math.floor(serial/12),month=serial%12,from=`${year}-${String(month+1).padStart(2,'0')}-01`,days=new Date(Date.UTC(year,month+1,0)).getUTCDate();return{from,days}}return timeRange(token,today,previous?.from)}
  const first=range(tokens[0][0]),last=tokens.length===2?range(tokens[1][0]):first
  if(!first||!last)return{clarification:'日期无效，请给出有效的自然日期。'}
  const from=first.from,to=addDays(last.from,last.days-1)
  if(dayNumber(to)<dayNumber(from)||dayNumber(to)-dayNumber(from)>=maxDays)return{clarification:`日期需要按先后顺序，且每次最多${maxDays}天；不会截取前${maxDays}天冒充完整范围。`}
  return{from,to,explicit:true}
}

export function planScheduleQuestion(text, { today, previous = null, retry = null, scope = '' } = {}) {
  if (typeof text !== 'string' || text.length > 300 || !validDate(today)) return null
  // Quoted titles are data, not calendar/person/operator tokens. This also
  // preserves grammatical characters inside titles rather than stripping them.
  const titles=[]
  let value = clean(text.normalize('NFKC').replace(/《([^》]+)》|“([^”]+)”|「([^」]+)」|"([^"\n]+)"/g,(_whole,...parts)=>{
    titles.push(parts.slice(0,4).find(part=>typeof part==='string').trim());return ''
  }))
  const readContext=validScheduleQuery(previous)||validDate(previous?.date)||previous?.awaiting===true
  if(readContext&&!titles.length&&isScheduleReadCancellation(value))
    return {clarification:'已取消这次课表查询，没有读取或修改课程。',cancelled:true}
  if(scheduleSourceLookup(text))return clarify('这是已保存课表的来源请求，请打开本人课表核对原件或历史；不会把上传说明当成课程名称。')
  // A quoted public document is not a course merely because it has a title.
  // Explicit lesson reads still support course names such as "城市规划".
  const publicDocument=titles.some(title=>/方案|规划|办法|制度|规定|政策|通知|公告|简章|手册|章程|指南|细则|报告/.test(title))
  const documentQuestion=/原文|来源|正文|内容|公布|发布|生效|失效|申报|申请|报名|资格|目标|成果|要求/.test(value)
  const explicitLessonRead=/课表|课程表|上课|下课|任课|授课|教室|在哪上|哪里上|谁(?:来)?(?:教|讲)|哪[位个]老师|老师是谁|(?:几点|何时|什么时候)(?:开始|结束|上|下)/.test(value)
  if(publicDocument&&documentQuestion&&!explicitLessonRead)return null
  // Name/role assertions never establish ownership, and work content is not a calendar query.
  if (!value || /她|他(?:们|的|[今明后]天|上|课表)|别人|全校|全班|全学院|同学|室友|同桌|我们班|谁(?:旷课|迟到)|知识点|笔记|作业|习题|题目|实验报告|复习|讲义|课件|讲解|解释|翻译|求解/.test(value)) return null
  if(/^(?:请)?(?:不要|别|不必|不用)(?:查|看|查询)/.test(value))return null
  if (/怎么(?:导入|上传|更新|同步)|如何(?:导入|上传|更新|同步)|帮我(?:导入|上传|修改|删除)|导出课表|适合自学|课程推荐/.test(value)) return null
  if (/关门|开门|营业|预约|报销|补办|水卡|校园卡|开放时间/.test(value)) return null
  if (/制度|规定|政策|学费|收费|课程介绍|教学大纲|选课流程|退课流程|学分要求|课程推荐|怎么做|如何做/.test(value)) return null
  if(/(?:通知|公告|通告)(?:在哪|在哪里|哪里|呢|原文|内容|链接|网址|说了|讲了|$)/.test(value) &&
      !/课表|课程安排|上课|授课|调课|停课|课程变更|考勤|点名/.test(value))return null
  if (retry?.question === text && retry.scope === scope && scope && validScheduleQuery(retry)) return requestScheduleQuery(retry)
  let prior = validScheduleQuery(previous) ? previous : validDate(previous?.date) ? scheduleQuery(previous.date) : null
  let pending=previous?.awaiting&&validPendingSchedule(previous.pendingSchedule)?previous.pendingSchedule:null
  const hasContext = !!prior || previous?.awaiting === true
  const containerQuestion=/(?:课表|课程表)(?:里面?|中)/.test(value)
  value=value.replace(/课程表/g,'课表').replace(/课表(?:里面?|中)/g,'课表')
  if(containerQuestion&&prior)prior={...requestScheduleQuery(prior),selection:'ALL',anchor:undefined}
  if(titles.length>1 || titles.some(title=>!title || title.length>100))return clarify('请先指定一门课程（名称不超过100字），或不限定课程名称查看完整日期范围；不会只取其中一门。')
  if(hasContext){
    const prefix=value.match(requestPrefix)?.[0]||'',tail=value.slice(prefix.length)
    if(/^它(?:的)?(?=在哪|在哪里|去哪|谁|几点|何时|什么时候|还有|还要|上多久|多长)/.test(tail))
      value=prefix+'这门'+tail.replace(/^它(?:的)?/,'')
  }
  const self=/我|本人/.test(value)
  const teachingSelf=self && /(?:教|讲)(?:的|什么|哪些|啥)?课|授课|教学安排|(?:作为|以)(?:任课)?(?:老师|教师)(?:身份)?/.test(value) && !/谁(?:来|给我|教我)?(?:教|讲|授)课/.test(value)
  const studyingSelf=self && /上的课|选(?:的|修的)课|选课安排|(?:作为|以)学生(?:身份)?/.test(value)
  if(teachingSelf && studyingSelf)return clarify('要查“我教的课”还是“我上的课”？两种安排分别核对，不会混成同一个身份范围。')
  const perspective=teachingSelf?'TEACHER':studyingSelf?'STUDENT':null
  if(perspective&&pending?.perspective&&perspective!==pending.perspective)pending={period:pending.period,detail:pending.detail,perspective}
  const changedPerspective=!!perspective && !!prior && perspective!==(prior.perspective||'AUTO')
  if(changedPerspective)prior=scheduleQuery(prior.from,prior.to,{period:prior.period,perspective})
  if(perspective){
    value=value.replace(/(?:作为|以)(?:任课)?(?:老师|教师|学生)(?:身份)?/g,'')
      .replace(/(?:教|讲)(?:的|什么|哪些|啥)?课|授课(?:安排)?|教学安排|选(?:的|修的)课|选课安排/g,'课程')
      .replace(/课程表/g,'课表')
    if(!/课/.test(value))value+='课'
  }
  value=stripScheduleReadModifiers(value,{prefixLength:value.match(requestPrefix)?.[0]?.length||0,scopeStart:readScopeStart,literalCourse:titles.length===1})
  if(!titles.length&&!new RegExp(courseReferenceLexeme.source).test(value)){
    const phrase=protectScheduleCoursePhrase(value,{timeExpression:timeLexeme,periodExpressions:periodLexemes,selectionExpressions:selectionLexemes,requestPrefix,hasContext})
    if(phrase?.ambiguous)return clarify('课程名称还不明确或超过100字，请核对完整名称；不会删掉名称中的字再匹配另一门课程。')
    if(phrase){titles.push(phrase.name);value=phrase.value}
  }
  if(hasContext || new RegExp(timeLexeme.source).test(value)){
    value=value.replace(/课程(?:如何|怎样|怎么)(?:安排|排的|排)/g,'课程安排')
      .replace(/(?:不)?(?:用|需要|得)(?:去)?上课(?=吗|么|没|呀|啊|吧|$)/g,'有课')
  }
  if((hasContext || /课|教室/.test(value)) && /早八|晚八/.test(value))return clarify('请指定这节课的日期或准确时间；“早八”不会默认成某门已存课程，也不会作为课程名称查询。')
  if(hasContext && /(?:换|改|变更|调整).*(?:教室|地点).*(?:吗|没|是否)/.test(value))return clarify('要核对目前已保存的教室，可以问“这节在哪上”；要确认是否调过课，请查看课程变更通知。不会仅凭当前地点推断变更历史。')
  const ambiguousRange=/之后|以后|之前|以前|(?:后面|接下来|前面|往后|剩下|余下)(?:的)?(?:几|两|[一二三四五六七八九十\d]+)?(?:天|日|周)/.test(value)
  const calendarResidue=value.replace(timeLexeme,'').replace(/之后|以后|之前|以前|后面|接下来|前面|往后|剩下|余下/g,'')
  const calendarOnly=calendarResidue.replace(/那么|然后|帮我|没有|什么|哪些|课程|课表|安排|[那再只就从请查看我的有没啥还课几两天日周呢吗呀啊吧\d]/g,'')===''
  if(ambiguousRange && (/课表|课程|上课|下课|什么课|啥课|的课/.test(value) || hasContext&&calendarOnly))
    return clarify('想查从哪一天到哪一天？请给出起止日期，例如“周四到周日”。“之后”是否包含当天、以及“后面几天”到哪天尚不明确；一次最多14天，不会擅自扩大范围。')
  const timing=extractScheduleTiming(value,{hasContext:hasContext || titles.length===1&&/上|课/.test(value),previous:prior})
  if(timing.clarification)return clarify(timing.clarification)
  value=timing.value
  const times = [...value.matchAll(timeLexeme)].map(match => ({ token: match[0], index: match.index }))
  const periods = choose(value, periodLexemes), operators = choose(value, selectionLexemes), fields = choose(value, detailLexemes)
  if(timing.detail && fields.some(x=>['COUNT','COURSES','PERIODS','FREE'].includes(x)))return clarify('要核对剩余时间还是课程数量？请先选一个条件；不会用某一节的时长冒充全日汇总。')
  const details = timing.detail?[timing.detail]:fields.some(x => x === 'PERIODS' || x === 'COURSES') ? fields.filter(x => x !== 'COUNT') : fields
  const selections = operators.includes('NEXT') ? operators.filter(x => x !== 'CURRENT' && x !== 'REMAINING') : operators
  const topic = /课|任课/.test(value) || titles.length===1 || !!timing.detail
  const courseReference = new RegExp(courseReferenceLexeme.source).test(value)
  const selector = selections.length > 0
  let residual = value.replace(timeLexeme, '').replace(courseReferenceLexeme,'').replace(requestPrefix,'')
  for (const [, expression] of [...periodLexemes, ...selectionLexemes, ...detailLexemes]) residual = residual.replace(expression, '')
  residual = residual.replace(/^(?:需要|应该|得|要)/,'').replace(/所有|全部|一共|总共/g, '').replace(/课程安排|课程|课表|上课|下课|什么课|啥课|哪些课|有课|课/g, '')
    .replace(requestPrefix, '')
    .replace(/是|谁|什么|啥|哪些|哪几门|哪几节|有没有|是否|需要|要|上|有|的|呢|吗|么|没|呀|啊|怎么样|如何|一下|来着|了/g, '')
  residual = residual.replace(/哪(?:几)?天|星期几|周几|礼拜几|刚才那(?:门|节|堂)|这(?:门|节|堂)|那(?:门|节|堂)|到|至|—/g, '')
  const explicitList = !containerQuestion && (/课表|课程安排|课程|什么课|啥课|哪些课|有课|几门课|几节课/.test(value) || (times.length>0 && topic && details.length===0 && !selector && !courseReference))
  residual = residual.replace(/所有|全部|一共|总共|都|还|开始|结束/g, '').replace(requestPrefix,'')
  const entity = titles.length===1&&!residual ? titles[0] : residual && !titles.length && /^[\p{L}\p{N}《》·+#()（）-]{2,100}$/u.test(residual) && !/怎么|怎样|为何|取消|停课|调课|带|难|适合|推荐|选修吗|最近|这[几两]天|星期|礼拜|给我|去哪|哪儿|换个|需要|应该|知道|告诉|放学|用去/.test(residual) && (times.length || prior || containerQuestion || pending) && (details.length || topic)
    ? residual.replace(/[《》]/g, '') : !residual?pending?.course||null:null
  const elliptical = hasContext && (!explicitList || changedPerspective && !times.length) && (times.length > 0 || periods.length > 0 || details.length > 0 || selector || courseReference || topic) && (!residual || entity)
  const courseOperator = selections.some(x => ['NEXT', 'PREVIOUS', 'FIRST', 'LAST'].includes(x))
  if (!topic && !courseOperator && !elliptical && !courseReference && !(times.length && details.length)) return null
  if (/第[\d一二三四五六七八九十]+周|[上下本这整]学期|整学期|[上下这本]个?月|[明后前去]年|[寒暑]假|\d{1,4}\/\d{1,2}|[\d一二两三四五六七八九十]+天[前后]/.test(value.replace(timeLexeme,'')))
    return clarify('这是教学周、学期或不明确的日期。请给出日期或自然周，例如“下周有什么课”；不会把它默认成今天。')
  if (residual && !entity) return topic || selector || courseReference
    ? clarify('这句课表问题还有歧义。请补充日期、上午/下午，或先查“这周有什么课”再指定一天或下一节；不会改用模型猜你的安排。') : null
  if (periods.length > 1 || selections.length > 1) return clarify('请先指定一个时段或一种顺序，例如“今天上午”或“下一节”；我不会自行取其中一个条件。')
  if (times.length > 2 || (times.length === 2 && !/到|至|—/.test(value.slice(times[0].index + times[0].token.length, times[1].index))))
    return clarify('你要查哪一天，还是一段连续日期？可以说“今天到周五有什么课”。')
  if((containerQuestion||pending)&&!times.length&&!prior)return clarify('想查哪一天或哪一周？例如“明天”或“这周”。课程名称会保留，不会默认只查今天。',{
    ...(entity?{course:entity}:{}),period:periods[0]||pending?.period||'ALL',detail:details.length===1?details[0]:pending?.detail||'SUMMARY',
    ...(perspective||pending?.perspective?{perspective:perspective||pending.perspective}:{})
  })
  if(prior && prior.from!==prior.to && !prior.focus && times.some(time=>/^(?:下一天|第二天|后一天)$/.test(time.token)))return clarify('上次查询是一段日期范围，尚未定位到具体一天。请明确日期，不会默认从范围第一天向后算。')
  const referenceDate = prior?.focus && (courseReference || ['NEXT','PREVIOUS','AT','FIRST','LAST'].includes(prior.selection)) ? prior.focus.slice(0,10) : prior?.from
  let range = times.length ? timeRange(times[0].token, today, referenceDate) : /哪(?:几)?天|星期几|周几|礼拜几/.test(value) ? { from: mondayOf(today), days: 7 } : null
  if (times.length && !range) return clarify('这个日期无效，请给出完整有效日期。')
  if (times.length === 2) {
    const last = timeRange(times[1].token, today, range.from)
    if (!last) return clarify('结束日期无效，请重新指定。')
    range = { from: range.from, days: dayNumber(addDays(last.from, last.days - 1)) - dayNumber(range.from) + 1 }
  }
  const newTime = !!range || periods.length > 0
  if(timing.remainingSpan && range && (range.from!==today || range.days!==1))
    return clarify('剩余上课时间需要定位今天当前这节；未来或跨日课程可以查询完整起止时长，不会把它当成正在上的课。')
  const nextTiming = !!timing.detail && selections[0] === 'NEXT' && !newTime && !/再|然后/.test(value)
  const repeatUpcoming = nextTiming && prior?.focus && (prior.focusOrigin || prior.selection) === 'NEXT' &&
    (!entity || entity === prior.course || entity === prior.focusName)
  // A current/past focus (including its detail followups) is not the next lesson.
  // Reselect from the service clock without inheriting its old course or period.
  const freshNextTiming = nextTiming && !repeatUpcoming
  const continuePeriod = !freshNextTiming && elliptical && (!['NEXT','PREVIOUS'].includes(selections[0]) || ['NEXT', 'PREVIOUS', 'AT'].includes(prior?.selection))
  const period = periods[0] || (continuePeriod ? prior?.period || pending?.period || 'ALL' : 'ALL')
  let selection = selections[0] || timing.defaultSelection || (!newTime && elliptical ? prior?.selection || 'ALL' : 'ALL')
  let anchor
  if (courseReference && !prior?.focus && !prior?.focusName && !prior?.course) return clarify('你指哪门课？请先指定一天或问“下一节”，再追问地点、老师或时间。')
  if(courseReference && newTime && !entity && !prior?.course && !prior?.focusName)return clarify('要跨日期追问同一门课，还需要明确课程名称；不会把当天其他课程当作这门课。')
  const detailOnly = elliptical && !newTime && !selector
  if (detailOnly && prior?.focus) { selection = 'AT'; anchor = prior.focus }
  if(repeatUpcoming){selection='AT';anchor=prior.focus}
  if (selection === 'NEXT' && !freshNextTiming && prior?.focus && !times.length && !periods.length &&
      (['NEXT', 'PREVIOUS', 'AT'].includes(prior.selection) || /再|然后|下一(?:节|堂)(?:课)?呢$/.test(value))) anchor = prior.focus
  if(selection==='PREVIOUS' && prior?.focus && !times.length && !periods.length)anchor=prior.focus
  if (!range) {
    if (selection === 'NEXT' && !detailOnly) range = { from: anchor?.slice(0, 10) || today, days: 14 }
    else if(selection==='PREVIOUS' && !detailOnly)range={from:addDays(anchor?.slice(0,10)||today,-13),days:14}
    else if (elliptical && prior) range = { from: prior.from, days: dayNumber(prior.to) - dayNumber(prior.from) + 1 }
    else if (elliptical) return clarify('还需要先明确日期，例如“明天上午”或“这周”，再继续问老师、地点或时间。')
    else range = { from: today, days: 1 }
  }
  if (!Number.isInteger(range.days) || range.days < 1 || range.days > 14) return clarify('一次最多查询14天，请缩小范围；日期前后顺序也需要正确。')
  const query = scheduleQuery(range.from, addDays(range.from, range.days - 1), {
    period, selection, detail: details.length === 1 ? details[0] : details.length > 1 ? 'SUMMARY' : pending?.detail || (detailOnly ? prior?.detail || 'SUMMARY' : 'SUMMARY'),
    ...(anchor ? { anchor } : {}),
    ...(entity ? { course: entity } : courseReference && prior?.focusName ? { course: prior.focusName } : (continuePeriod || courseReference) && prior?.course ? { course: prior.course } : {}),
    ...(perspective || elliptical && (prior?.perspective||pending?.perspective) ? { perspective: perspective || prior?.perspective || pending.perspective } : {}),
  })
  return validScheduleQuery(query) ? query : clarify('日期或课程定位已失效，请重新指定日期或下一节。')
}
