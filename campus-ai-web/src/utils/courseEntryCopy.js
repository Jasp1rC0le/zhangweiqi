import { dayNumber } from './timetable.js'
const line = value => typeof value === 'string' && value.length <= 100 && [...value].every(character => {
  const code = character.codePointAt(0)
  return code >= 32 && ![127, 0x2028, 0x2029].includes(code)
})
const time = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
const period = value => Number.isSafeInteger(value) && value >= 1 && value <= 24
const date = value => { try { return typeof value === 'string' && Number.isFinite(dayNumber(value)) } catch { return false } }

// A single authorized row, not a page/day summary and never a response serialization.
export function courseEntryText(entry, asOf) {
  if (!entry || !['name', 'teacher', 'room', 'className'].every(key => line(entry[key])) || !entry.name.trim() ||
      !date(entry.date) ||
      typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf)) ||
      !Array.isArray(entry.sources) || !entry.sources.length || entry.sources.some(source => !['PERSONAL', 'TEACHING'].includes(source)) ||
      typeof entry.cancelled !== 'boolean' || typeof entry.conflict !== 'boolean') return null
  let hours = '钟点与节次未配置，请核对原课表'
  const slots = period(entry.startPeriod) && period(entry.endPeriod) && entry.endPeriod >= entry.startPeriod
  if (time(entry.startTime) && time(entry.endTime) && entry.startTime < entry.endTime) {
    hours = `${entry.startTime.slice(0,5)}—${entry.endTime.slice(0,5)}（北京时间）`
    if (slots) hours += ` · 第${entry.startPeriod}—${entry.endPeriod}节`
  } else if (entry.startTime != null || entry.endTime != null) return null
  else if (slots) hours = `第${entry.startPeriod}—${entry.endPeriod}节（钟点未配置）`
  else if (entry.startPeriod != null || entry.endPeriod != null) return null
  const weekday = ['日','一','二','三','四','五','六'][new Date(`${entry.date}T00:00:00Z`).getUTCDay()]
  const source = entry.sources.includes('TEACHING') ? entry.sources.includes('PERSONAL') ? '授权教学安排 · 已与本人导入合并' : '授权教学安排' : '本人导入课表'
  const checked = new Intl.DateTimeFormat('zh-CN', { timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).format(new Date(asOf))
  return ['Campthink 单节课程', `日期：${entry.date} · 周${weekday}`, `课程：${entry.name.trim()}`, `时间：${hours}`,
    `任课教师：${entry.teacher.trim() || '未填写'}`, `地点：${entry.room.trim() || '未填写'}`,
    ...(entry.className.trim() ? [`班级：${entry.className.trim()}`] : []),
    `来源：${source}`, ...(entry.cancelled ? [`状态：${entry.sources.includes('TEACHING') ? '已取消，请勿按原安排上课' : '学籍变动后待核对，请勿直接按原安排上课'}`] : []),
    ...(entry.conflict ? ['提醒：存在时间冲突，请核对安排'] : []), `读取时间（北京时间）：${checked}`,
    '仅此节课程的读取快照，不是完整当天课表或实时教务同步；不含考勤与名单。', '转发前请核对接收对象。',
  ].join('\n')
}
