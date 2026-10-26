import { attendanceDistribution, cockpitCount } from './cockpit.js'
import { dayNumber } from './timetable.js'
import { createScopedTextCopy } from './scopedTextCopy.js'
const views = { COUNSELOR: '辅导员', SECRETARY: '书记' }
const line = value => typeof value === 'string' && value.length > 0 && value.length <= 300 && !/[\r\n\u2028\u2029]/u.test(value)
const day = value => { try { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(dayNumber(value)) } catch { return false } }
const amount = (value, unit) => cockpitCount(value) === '未返回' ? '未返回' : `${cockpitCount(value)} ${unit}`

// Presentation of existing whole-scope facts only. Never iterate a page or serialize a response.
export function attendanceSummaryText(input) {
  const model = attendanceDistribution(input?.counts)
  if (!model || !Object.hasOwn(views, input?.view) || !line(input.scopeLabel) || !line(input.summaryScope) || !day(input.from) || !day(input.to) || dayNumber(input.to) < dayNumber(input.from) || dayNumber(input.to) - dayNumber(input.from) > 30) return null
  return [
    'Campthink 考勤核对摘要',
    `日期：${input.from} 至 ${input.to}`,
    `查看身份：${views[input.view]}`,
    `范围：${input.scopeLabel}`,
    `汇总范围：${input.summaryScope}`,
    `已配置安排：${amount(input.planned, '项')}`,
    `总考勤人次：${amount(model.total, '人次')}`,
    `按时：${amount(input.counts.onTime, '人次')}`,
    `旷课：${amount(input.counts.absent, '人次')}`,
    `早退：${amount(input.counts.earlyLeave, '人次')}`,
    `待点名：${amount(input.counts.unknown, '人次')}`,
    `历史迟到：${amount(input.counts.late, '人次')}`,
    `历史请假：${amount(input.counts.excused, '人次')}`,
    `涉及旷课学生：${amount(input.absentStudents, '人')}（去重）`,
    `登记进度：${cockpitCount(model.recorded)} / ${cockpitCount(model.total)} 人次已填写，不是出勤率`,
    '口径：待点名可能尚未上课或未填写，不计入旷课；已取消课程不计入。',
    '仅为当前授权范围的读取快照，不是实时教务同步；不含学生姓名、学号或名单。',
  ].join('\n')
}

export function createAttendanceSummaryCopy(options) {
  return createScopedTextCopy({ ...options,
    successNotice: '摘要已交给浏览器剪贴板。粘贴前请核对目标位置。',
    failureNotice: '浏览器未允许自动复制。可选中下方摘要后手动复制。',
  })
}
