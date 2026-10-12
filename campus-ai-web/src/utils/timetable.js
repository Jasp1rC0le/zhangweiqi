import { readTimetableImageBounds, validateTimetableDimensions } from './timetableImageHeader.js'

const DAY = 86400000
export function chinaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
export function dayNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('请填写完整日期')
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('日期无效')
  return date.getTime() / DAY
}
export function addDays(value, days) {
  return new Date((dayNumber(value) + days) * DAY).toISOString().slice(0, 10)
}
export function mondayOf(value) {
  const day = new Date(dayNumber(value) * DAY).getUTCDay()
  return addDays(value, -((day + 6) % 7))
}
export function firstMondayFrom(weekMonday, startWeek) {
  if (!Number.isInteger(startWeek) || startWeek < 1 || startWeek > 30)
    throw new Error('请填写截图中的周次（1至30）')
  if (mondayOf(weekMonday) !== weekMonday) throw new Error('起始日期应为周一，请按教务课表确认')
  return addDays(weekMonday, -(startWeek - 1) * 7)
}
export function timetableStatus(timetable, now = new Date()) {
  if (!timetable) return { kind: 'empty', label: '还没有保存课表', week: null, covered: false }
  const today = chinaDate(now)
  const week = Math.floor((dayNumber(today) - dayNumber(timetable.firstMonday)) / 7) + 1
  const covered = week >= timetable.startWeek && week <= timetable.endWeek
  if (week < 1)
    return { kind: 'future', week, covered, label: '尚未到这个学期第1周，核对学期是否正确' }
  if (!covered)
    return {
      kind: 'coverage',
      week,
      covered,
      label: `当前第${week}周，已存图片只覆盖第${timetable.startWeek}至${timetable.endWeek}周，请更换或补充课表`,
    }
  const checked = new Date(timetable.checkedAt)
  const days = Number.isFinite(checked.getTime())
    ? Math.max(0, dayNumber(today) - dayNumber(chinaDate(checked)))
    : null
  if (timetable.remindDays > 0 && (days === null || days >= timetable.remindDays)) {
    return {
      kind: 'check',
      week,
      covered,
      label: `${days === null ? '尚未核对' : `已${days}天未核对`}，如有调课请更换；本站没有实时教务同步`,
    }
  }
  return {
    kind: 'current',
    week,
    covered,
    label: `第${week}周 · 本周在图片覆盖范围内，临时调课仍需核对教务通知`,
  }
}
export function defaultSemester(today = chinaDate()) {
  const year = Number(today.slice(0, 4)),
    month = Number(today.slice(5, 7))
  const start = month >= 8 ? year : year - 1
  return `${start}—${start + 1}学年 第${month >= 8 ? 1 : 2}学期`
}

// The first stage preserves pixels only; no OCR, model or third-party request.
function boundedImageTask(task, lateCleanup = () => {}) {
  let expired = false,
    timer
  return Promise.race([
    task.then((value) => {
      if (expired) lateCleanup(value)
      return value
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true
        reject(new Error('图片处理超时，请裁剪后重试'))
      }, 10000)
    }),
  ]).finally(() => clearTimeout(timer))
}
export async function prepareTimetableImage(file) {
  if (!file || !['image/png', 'image/jpeg'].includes(file.type))
    throw new Error('请选择PNG或JPG课表截图，暂不支持HEIC、PDF或动图')
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('原图应小于8MB，请先裁剪课表区域')
  const header = await boundedImageTask(file.arrayBuffer())
  readTimetableImageBounds(header, file.type)
  if (typeof globalThis.createImageBitmap !== 'function')
    throw new Error('当前浏览器不能处理图片，请换用Chrome或Safari')
  const bitmap = await boundedImageTask(createImageBitmap(file), (value) => value.close())
  try {
    validateTimetableDimensions(bitmap.width, bitmap.height)
    const ratio = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器不能处理图片，请换用Chrome或Safari')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await boundedImageTask(
      new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9)),
    )
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('处理后的图片仍超过2MB，请缩小后重试')
    return blob
  } finally {
    bitmap.close()
  }
}
