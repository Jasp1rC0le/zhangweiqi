import { addDays, dayNumber } from './timetable.js'
import { createScheduleExportResource } from './scheduleExport.js'

export function calendarDevice(navigator = {}, agent = navigator.userAgent || '') {
  const embedded = /MicroMessenger|QQ\//i.test(agent)
  const apple = /iPhone|iPad|iPod/i.test(agent) || /Mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1
  const harmony = /HarmonyOS|OpenHarmony|HuaweiBrowser|HUAWEI/i.test(agent)
  return { platform: apple ? 'apple' : harmony ? 'harmony' : /Android/i.test(agent) ? 'android' : 'desktop', embedded }
}
export const CALENDAR_GUIDES = Object.freeze({
  apple: ['点击导入手机日历', '在系统日历确认订阅', '在日历中检查提醒'],
  android: ['点击导入手机日历', '系统面板选择支持ICS的日历', '确认添加课程'],
  harmony: ['保存课表日历文件', '日历中打开添加／导入日程', '从文件导入并确认'],
  desktop: ['打开课表日历文件', '选择使用的日历', '确认导入课程'],
})
export function checkedCalendarLink(value, origin, now = Date.now()) {
  if (!value || typeof value.active !== 'boolean' || ![5, 10, 15, 30].includes(value.minutes)
    || typeof value.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.from) || !Number.isFinite(dayNumber(value.from))
    || new Date(value.from + 'T00:00:00Z').toISOString().slice(0, 10) !== value.from || addDays(value.from, 27) !== value.to
    || value.count != null && (!Number.isSafeInteger(value.count) || value.count < 1 || value.count > 2000)) throw new Error('日历准备信息异常，请重试')
  if (value.active) {
    let url
    try { url = new URL(value.url) } catch { throw new Error('日历地址未核对，请重试') }
    if (url.origin !== origin || url.username || url.password || url.search || url.hash
      || !/^\/api\/calendar-feed\/[a-f0-9]{64}\.[A-Za-z0-9_-]{43}\/calendar\.ics$/.test(url.pathname)
      || url.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')
      || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now || Date.parse(value.expiresAt) > now + 181 * 86400000)
      throw new Error('日历地址或有效期未核对，请重试')
  } else if (value.url != null || value.expiresAt != null) throw new Error('日历状态未核对，请重试')
  return value
}

// All capability/credential-bearing state stays in this owner-bound closure, not localStorage.
export function createCalendarImport({ owner, minutes, active, state, readLink, enableLink, revokeLink,
  readAccess, prepare, download, origin, now = Date.now, digest }) {
  let generation = 0, controller, disposed = false, file, preview, verifiedAt = 0, meta
  const fileState = {}
  const resource = createScheduleExportResource({ owner: () => !disposed && active() && owner() ? `${owner()}:${minutes()}` : '', state: fileState,
    readAccess, prepare, download, now, ...(digest ? { digest } : {}), onFile: (blob, filename) => { file = { blob, filename } } })
  const scope = () => owner() && active() ? `${owner()}:${minutes()}` : ''
  function reset() {
    generation++; controller?.abort(); resource.reset(true); file = null; preview = null; meta = null; verifiedAt = 0
    Object.assign(state, { busy: false, ready: false, count: 0, error: '', notice: '', hasLink: false })
  }
  const current = (key, epoch) => !disposed && key && key === scope() && epoch === generation
  async function warm() {
    reset(); const key = scope(), epoch = generation
    if (!key) return false
    controller = new AbortController(); state.busy = true
    try {
      const response = await readLink(controller.signal)
      if (!current(key, epoch)) return false
      meta = checkedCalendarLink(response.data, origin, now()); state.hasLink = meta.active
      if (!await resource.access() || !current(key, epoch)) throw new Error(fileState.error || '日历能力未读取，请重试')
      const filter = { source: 'PERSONAL', view: 'STUDENT', from: meta.from, to: meta.to, classId: '', period: 'ALL', format: 'ICS', search: '', includeCancelled: true, reminderMinutes: minutes() }
      if (!await resource.prepare(filter) || !current(key, epoch)) throw new Error(fileState.error || '日历未准备好，请重试')
      preview = fileState.preview
      if (!await resource.download() || !current(key, epoch)) throw new Error(fileState.error || '日历文件未核对，请重试')
      verifiedAt = now(); state.count = preview.count; state.ready = true
      return true
    } catch (failure) {
      if (current(key, epoch)) state.error = failure.response?.status === 404 ? '日历直导服务暂未就绪，请稍后重试' : failure.response?.data?.message || failure.message || '日历未准备好，请重试'
      return false
    } finally { if (current(key, epoch)) state.busy = false }
  }
  async function verifiedFile() {
    const key = scope(), epoch = generation
    if (!current(key, epoch) || !preview || !file || !state.ready || state.busy) return null
    if (Date.parse(preview.expiresAt) <= now()) return await warm() ? file : null
    if (now() >= verifiedAt && now() - verifiedAt <= 3000) return file
    state.busy = true; state.error = ''
    try {
      fileState.preview = preview
      if (!await resource.download() || !current(key, epoch)) throw new Error(fileState.error || '最新课表未核对，请重试')
      verifiedAt = now(); return file
    } catch (failure) {
      if (current(key, epoch)) {
        if (/变化|到期/.test(fileState.error || failure.message)) { state.busy = false; return await warm() ? file : null }
        state.error = failure.message; state.ready = false
      }
      return null
    }
    finally { if (current(key, epoch)) state.busy = false }
  }
  async function subscription() {
    const key = scope(), epoch = generation
    if (!key || disposed || state.busy) return null
    controller = new AbortController(); state.busy = true; state.error = ''
    try {
      const response = await enableLink(minutes(), controller.signal)
      if (!current(key, epoch)) return null
      const value = checkedCalendarLink(response.data, origin, now())
      if (!value.active || value.minutes !== minutes() || !value.count) throw new Error('日历订阅范围未核对，请重试')
      meta = value; state.hasLink = true; state.count = value.count
      return value.url
    } catch (failure) { if (current(key, epoch)) state.error = failure.response?.data?.message || failure.message || '日历暂未打开，请重试'; return null }
    finally { if (current(key, epoch)) state.busy = false }
  }
  async function revoke() {
    const key = scope(), epoch = generation
    if (!key || disposed || state.busy) return false
    controller = new AbortController(); state.busy = true; state.error = ''
    try {
      await revokeLink(controller.signal); if (!current(key, epoch)) return false
      state.hasLink = false; meta = null; state.notice = '站内链接已停用，手机已保存的日程请在日历中移除'
      return true
    } catch { if (current(key, epoch)) state.error = '未能确认停用结果，请重试'; return false }
    finally { if (current(key, epoch)) state.busy = false }
  }
  return { warm, verifiedFile, subscription, revoke, reset,
    currentLink() { return !disposed && scope() && meta?.active && meta.minutes === minutes() ? meta.url : null },
    notice(text) { state.notice = text }, fail(text) { state.error = text },
    clearFeedback() { state.error = ''; state.notice = '' },
    dispose() { disposed = true; reset(); resource.dispose() } }
}
