import { calendarRangeForText } from './scheduleIntent.js'

const exportVerb = /导出|下载|备份|另存|保存为|导(?:一份|一个|个|份)/i
const scheduleTopic = /课表|课程表|课程安排/
const otherTarget = /他人|别人|她|他们|全班|全校|全院|全学院|整个班|我们班|我们学院|班级|学院|年级|专业|同学|室友|同桌|学号|账号|账户|老师|教师|书记|导员|辅导员|学生/
const selfTarget = /本人|我自己|自己的|我的|个人/
const negatedOwner = /(?:不是|不要|不用|非|并非|不属于)\s*(?:我(?:自己)?的|本人(?:的)?|自己的|个人(?:的)?)/
const fullCoverage = /整(?:个)?学期|全(?:部)?学期|(?:本|这|当前)(?:个)?学期|完整|全部|所有已保存|已保存的全部/
const fullTerm = /(?:完整(?:的)?|整(?:个)?|全(?:部)?|本|这|当前)(?:个)?学期/g
const partialCoverage = /上午|早上|下午|晚上|晚间|下(?:一)?节|前(?:几|\d+|[一二三四五六七八九十]+)节|第[\d一二三四五六七八九十]+节|只(?:要|导出|下载)(?!本人|个人|我自己|自己|我的)|仅(?!本人|个人|我自己|自己|我的)|某门|这门|那门|单独/
const unsupportedFormat = /Excel|xlsx?|csv|pdf|ics|ical/i
const affirmative = /^(?:好的?|可以|行|是的|对|没错|确认|就这样)[吧呀啊。.!！?？\s]*$/
const cancel = /^(?:取消|算了|不用了|不导出了|不要导出(?:了)?|停止(?:这次)?导出|先不导出)[吧。.!！?？\s]*$/
const grammar = /麻烦|劳驾|请问|帮我|帮忙|给我|我想|我要|能否|可不可以|能不能|可以|只(?:要|导出|下载)(?=本人|个人|我自己|自己|我的)|仅(?=本人|个人|我自己|自己|我的)|导出|下载|备份|另存(?:为)?|保存为|生成|导(?:一份|一个|个|份)|一下|一份|一个|文件|课程安排|课程表|课表|我自己|自己|本人|个人|我的|我|的|本地|到|成|为|以|用|格式|完整|全部|所有|已保存|当前|JSON|Excel|xlsx?|csv|pdf|ics|ical|好的?|没错|是的|是|确认|就是|就|都|请|也|再|需要|要|啊|呀|吧|呢|吗|[，,。.!！?？：:、;；\s]/gi
const dateParts = /大后天|后天|后日|明天|明日|今天|今日|昨日|昨天|前天|前日|早上|上午|下午|晚上|晚间|下(?:一)?节|第|节|[0-9上下本这前后周星期礼拜一二三四五六七八九十两年月日号天到至—-]/g
const pendingValue = value => value && ['target', 'coverage', 'format'].every(key => typeof value[key] === 'boolean')

// Slots describe a file's intended scope, never a user id, identity grant or authorization claim.
export function planPrivateCourseExport(text, { today, previous = null } = {}) {
  if (typeof text !== 'string' || !text.trim()) return null
  if (text.length > 10000) return exportVerb.test(text) && scheduleTopic.test(text)
    ? { clarification: '这条课表导出要求过长，请只说明本人、完整学期和文件格式；不会截断内容后默认成另一份文件。未读取或生成文件。', awaitingTarget: true, pendingPrivateExport: { target: true, coverage: true, format: true } }
    : null
  const value = text.normalize('NFKC').replace(/[《》“”「」"'‘’]/g, '').trim(), pending = pendingValue(previous) ? previous : null
  if (pending && cancel.test(value)) return { clarification: '已取消这次课表导出说明，没有准备或下载文件。', cancelled: true }
  const command = exportVerb.test(value) && scheduleTopic.test(value)
  const positive = value.replace(/(?:不要|不用|不是|不需要)(?:Excel|xlsx?|csv|pdf|ics|ical)/gi, '')
  const deniedSelf = negatedOwner.test(positive)
  const residual = positive.replace(negatedOwner, '').replace(fullTerm, '').replace(partialCoverage, '').replace(grammar, '').replace(dateParts, '')
  const entitySupplement = pending?.target && /^[\p{L}\p{N}·（）()-]{2,24}$/u.test(value) && !/你好|您好|谢谢|再见|什么|怎么|如何|为何|哪里|多少|请|帮|给|想|要|查|讲|说|写|知识|论文|作业|代码|天气|食堂|水卡|hello|hi/i.test(value)
  const bare = entitySupplement || ((!residual || otherTarget.test(value)) && (selfTarget.test(value) || otherTarget.test(value) || /JSON/i.test(value) || unsupportedFormat.test(value) || fullCoverage.test(value) || affirmative.test(value) || partialCoverage.test(value) || /[今明昨前后这本上下].*(?:天|周|月)|\d.*[日号]/.test(value)))
  if (!command && (!pending || !bare)) return null
  if (/考勤|点名|旷课|迟到|早退|学籍|绑定|知识库|水卡/.test(value)) return null

  const slots = { target: pending?.target ?? false, coverage: pending?.coverage ?? false, format: pending?.format ?? false }
  const explicitOther = otherTarget.test(positive)
  const own = selfTarget.test(positive) || /^(?:我|我本人)[。.!！?？\s]*$/.test(positive)
  const mixedOwner = own && !!residual && /和|与|跟|以及|还有|、|，|,/.test(positive)
  const range = calendarRangeForText(positive.replace(fullTerm, ''), { today, maxDays: 31 })
  const partial = partialCoverage.test(positive) || range.explicit === true || !!range.clarification
  // An unrecognized name/course modifier is not permission to default to the account owner.
  if (explicitOther || deniedSelf || mixedOwner || (residual && !own)) slots.target = true
  else if (own && !residual) slots.target = false
  if (partial || (residual && own)) slots.coverage = true
  else if (fullCoverage.test(positive)) slots.coverage = false
  if (unsupportedFormat.test(positive)) slots.format = true
  else if (/JSON/i.test(positive)) slots.format = false
  if (pending && affirmative.test(positive) && !slots.target) {
    if (pending.coverage) slots.coverage = false
    else if (pending.format) slots.format = false
  }
  if (!slots.target && !slots.coverage && !slots.format) return { personalExport: true }
  const clarification = slots.target
    ? '这个JSON入口只导出本人已保存的个人课表。要改为导出本人吗？如需他人或班级安排，请走授权教学入口。'
    : slots.coverage
      ? '个人JSON包含完整已保存学期，尚不支持按日期、课程或节次裁剪。改为导出完整学期吗？未准备或下载文件。'
      : '目前可下载并重新导入JSON，尚不支持Excel、PDF、CSV或ICS。改用JSON吗？未生成文件。'
  return { clarification, awaitingTarget: true, pendingPrivateExport: slots }
}
