import { dayNumber, mondayOf, addDays } from './timetable.js'
import { TEACHING_VIEWS } from './teaching.js'
const id = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
const text = (value, max = 100) => typeof value === 'string' && value.length <= max
// Whole-scope attendance is in instances, not users: 10k students may have >150k weekly instances.
const number = (value, max = 10000000) => Number.isSafeInteger(value) && value >= 0 && value <= max
const time = (value) =>
  typeof value === 'string' &&
  /^\d{2}:\d{2}(?::\d{2})?$/.test(value) &&
  Number(value.slice(0, 2)) < 24 &&
  Number(value.slice(3, 5)) < 60
const instant = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const counts = (value) =>
  value && ['unknown', 'onTime', 'late', 'absent', 'excused'].every((k) => number(value[k])) && (value.earlyLeave==null || number(value.earlyLeave))
export function validatedUnifiedNotices(value) {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (n) =>
        !id(n?.id) ||
        !id(n.lessonId) ||
        !['STUDENT_CLASS', 'TEACHER_ROSTER'].includes(n.kind) ||
        !['course', 'room', 'teacher'].every((k) => text(n[k])) ||
        !instant(n.startsAt) ||
        !instant(n.dueAt) ||
        (n.readAt != null && !instant(n.readAt)),
    ) ||
    new Set(value.map((n) => n.id)).size !== value.length
  )
    throw new Error('通知响应异常，请重新读取')
  return value
}
export function validatedUnifiedWeek(value) {
  if (
    !value ||
    value.version !== 1 ||
    mondayOf(value.monday) !== value.monday ||
    addDays(value.monday, 6) !== value.sunday ||
    !Number.isFinite(dayNumber(value.today)) ||
    !Number.isFinite(Date.parse(value.now)) ||
    !Object.hasOwn(TEACHING_VIEWS, value.view) ||
    !Array.isArray(value.views) ||
    !value.views.includes(value.view) ||
    value.views.some((v) => !Object.hasOwn(TEACHING_VIEWS, v)) ||
    !Array.isArray(value.entries) ||
    value.entries.length > 620 ||
    !Array.isArray(value.classes) ||
    value.classes.length > 500 ||
    value.classes.some((c) => !id(c.id) || !text(c.name) || !text(c.college)) ||
    !Array.isArray(value.bells) ||
    value.bells.length > 16 ||
    !text(value.focusLabel) ||
    typeof value.gridSafe !== 'boolean' ||
    !Array.isArray(value.notices) ||
    value.notices.length > 100 ||
    !Array.isArray(value.warnings) ||
    value.warnings.some((w) => !text(w, 500)) ||
    !value.summary ||
    ![
      'plannedClasses',
      'todayClasses',
      'conflicts',
      'mergedDuplicates',
      'absentStudents',
    ].every((k) => number(value.summary[k])) ||
    !number(value.summary.personalRevision, 1000000) ||
    !counts(value.summary.attendance)
  )
    throw new Error('统一课表响应不完整，原课表没有改变')
  if (
    value.bells.some(
      (slot, i) =>
        slot.period !== i + 1 || !time(slot.start) || !time(slot.end) || slot.start >= slot.end,
    )
  )
    throw new Error('作息配置不完整')
  validatedUnifiedNotices(value.notices)
  for (const entry of value.entries) {
    if (
      !id(entry?.id) ||
      (entry.lessonId != null && !id(entry.lessonId)) ||
      !['name', 'room', 'teacher', 'className', 'timeLabel'].every((k) => text(entry[k])) ||
      !number(entry.weekday, 7) ||
      entry.weekday < 1 ||
      addDays(value.monday, entry.weekday - 1) !== entry.date ||
      (entry.startTime != null &&
        (!time(entry.startTime) || !time(entry.endTime) || entry.startTime >= entry.endTime)) ||
      (entry.startTime == null && entry.endTime != null) ||
      (entry.startPeriod != null &&
        (!number(entry.startPeriod, 24) ||
          entry.startPeriod < 1 ||
          !number(entry.endPeriod, 24) ||
          entry.endPeriod < entry.startPeriod)) ||
      (entry.startPeriod == null && entry.endPeriod != null) ||
      (entry.counts != null && !counts(entry.counts)) ||
      (entry.attendance != null &&
        !['UNKNOWN', 'ON_TIME', 'LATE', 'ABSENT', 'EXCUSED','EARLY_LEAVE'].includes(entry.attendance)) ||
      typeof entry.cancelled !== 'boolean' ||
      typeof entry.conflict !== 'boolean' ||
      typeof entry.canMark !== 'boolean' ||
      !Array.isArray(entry.sources) ||
      !entry.sources.length ||
      entry.sources.some((s) => !['PERSONAL', 'TEACHING'].includes(s)) ||
      !Array.isArray(entry.originIds) ||
      !entry.originIds.length ||
      entry.originIds.some((v) => !id(v))
    )
      throw new Error('课程条目异常，未展示不完整数据')
  }
  if (new Set(value.entries.map((e) => e.id)).size !== value.entries.length)
    throw new Error('课程编号重复，请重新读取')
  for (const focus of [value.next, value.attention])
    if (focus != null && !value.entries.some((e) => e.id === focus.id))
      throw new Error('课程操作目标不在当前范围')
  return {
    ...value,
    next: value.next ? value.entries.find((e) => e.id === value.next.id) : null,
    attention: value.attention ? value.entries.find((e) => e.id === value.attention.id) : null,
  }
}
function validatePage(value, length) {
  if (!value || !number(value.page, 10000) || !number(value.size, 100) || value.size < 1 ||
      !number(value.total) || value.totalPages !== Math.ceil(value.total / value.size) ||
      (value.totalPages > 0 ? value.page >= value.totalPages : value.page !== 0) ||
      length > value.size || length > value.total || length !== Math.min(value.size, Math.max(0, value.total - value.page * value.size)))
    throw new Error('分页响应异常，请重新读取第一页')
}
export function validatedUnifiedPage(value) {
  const week = validatedUnifiedWeek(value?.week)
  validatePage(value, week.entries.length)
  if (!text(value.summaryScope, 200) || (value.totalPages > 1 && week.gridSafe)) throw new Error('分页汇总范围异常')
  return { ...value, week }
}
export function validatedScopePage(value) {
  const scope = value?.scopes
  if (!scope || scope.version !== 1 || !Object.hasOwn(TEACHING_VIEWS, scope.view) ||
      !Array.isArray(scope.views) || !scope.views.includes(scope.view) || scope.views.some(v => !Object.hasOwn(TEACHING_VIEWS, v)) ||
      typeof scope.teachingEnabled !== 'boolean' || typeof scope.viewHasTeaching !== 'boolean' ||
      !Array.isArray(scope.classes) || scope.classes.some(c => !id(c?.id) || !text(c.name) || !text(c.college)) ||
      new Set(scope.classes.map(c => c.id)).size !== scope.classes.length)
    throw new Error('授权班级响应异常')
  validatePage(value, scope.classes.length)
  return value
}
export function createUnifiedScopes({ owner, state, read }) {
  let generation = 0, controller
  function reset() {
    generation++; controller?.abort()
    Object.assign(state, { data: null, loading: false, error: '', unsupported: false })
  }
  async function load(view = '', page = 0, search = '') {
    controller?.abort(); controller = new AbortController()
    const epoch = ++generation, principal = owner(), signal = controller.signal
    const current = () => !!principal && owner() === principal && epoch === generation && !signal.aborted
    state.loading = true; state.error = ''; state.data = null; state.unsupported = false
    try {
      const { data } = await read(view, page, search, signal)
      if (!current()) return null
      const result = validatedScopePage(data)
      if ((view && result.scopes.view !== view) || result.page !== page || result.size !== 50) throw new Error('授权范围与请求不一致')
      state.data = result
      return result
    } catch (failure) {
      if (current()) { state.unsupported = failure.response?.status === 404; state.error = failure.response?.data?.message || failure.message || '班级筛选暂时无法读取，请重试' }
      return null
    } finally { if (current()) state.loading = false }
  }
  return { load, reset }
}
// Only transport, validation and ownership here; joining, time conversion and summaries live in the server.
export function createUnifiedTimetable({ owner, state, read }) {
  let generation = 0,
    controller,
    lastPrincipal = '',
    lastQuery = ''
  function reset() {
    generation++
    controller?.abort()
    lastPrincipal = ''
    lastQuery = ''
    Object.assign(state, {
      week: null,
      loading: false,
      stale: false,
      error: '',
      unsupported: false,
      pagination: null,
    })
  }
  async function load(monday, view, classId, page = 0) {
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal,
      epoch = ++generation,
      principal = owner()
    const current = () =>
      !!principal && owner() === principal && epoch === generation && !signal.aborted
    const query = JSON.stringify([monday, view || '', classId || '', page])
    const retain = !!state.week && lastPrincipal === principal && lastQuery === query
    if (!retain) { state.week = null; state.pagination = null }
    state.loading = true
    state.error = ''
    state.unsupported = false
    state.stale = retain
    try {
      const { data } = await read(monday, view, classId, signal, page)
      if (current()) {
        const paged = data?.week ? validatedUnifiedPage(data) : null
        const week = paged ? paged.week : validatedUnifiedWeek(data)
        if (paged && paged.page !== page) throw new Error('课程页码与请求不一致')
        if (week.monday !== monday || (view && week.view !== view))
          throw new Error('课表范围与请求不一致，请重新读取')
        // Remember the resolved default view so its next refresh is the same scope.
        lastQuery = JSON.stringify([monday, week.view, classId || '', page])
        lastPrincipal = principal
        state.week = week
        state.pagination = paged ? { page: paged.page, size: paged.size, total: paged.total, totalPages: paged.totalPages, summaryScope: paged.summaryScope } : null
        state.stale = false
      }
    } catch (failure) {
      if (current()) {
        if ([401, 403, 404].includes(failure.response?.status)) {
          state.week = null
          state.pagination = null
          lastPrincipal = ''
          lastQuery = ''
          state.stale = false
        }
        state.unsupported = failure.response?.status === 404 && !classId && page === 0
        state.error = state.unsupported
          ? '当前服务尚未加载统一课表，已保存的个人课表继续可用。'
          : failure.response?.data?.message ||
            failure.message ||
            '课表读取失败，请重试；原数据未改变'
      }
    } finally {
      if (current()) state.loading = false
    }
  }
  return { load, reset }
}

// A light inbox read does not recompute the calendar or borrow another view's response.
export function createUnifiedNoticeReader({ owner, week, read, apply, onError }) {
  let generation = 0,
    controller
  function reset() {
    generation++
    controller?.abort()
  }
  async function load() {
    const target = week(),
      principal = owner()
    if (!principal || !target?.teachingEnabled || !['STUDENT', 'TEACHER'].includes(target.view))
      return
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal,
      epoch = ++generation
    const current = () =>
      owner() === principal && week() === target && generation === epoch && !signal.aborted
    try {
      const { data } = await read(signal)
      if (current()) apply(validatedUnifiedNotices(data), target)
    } catch (failure) {
      if (current()) onError(failure)
    }
  }
  return { load, reset }
}
// "available" only means filters exist, not that the first calendar has settled.
export function unifiedLayoutReadiness(calendar, scopes) {
  if (calendar.loading || scopes.loading) return 'waiting'
  if (calendar.error || scopes.error || calendar.unsupported || scopes.unsupported) return 'error'
  return calendar.week ? 'ready' : 'waiting'
}
