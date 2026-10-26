import { isEnrollmentId as uuid } from './teachingIds.js'
import { dayNumber } from './timetable.js'
const text = (v, max) => typeof v === 'string' && v.length <= max
const plain = (v, max) =>
  text(v, max) &&
  v.trim() &&
  ![...v].some((c) => c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159))
const integer = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 2147483647
const positive = (v) => Number.isSafeInteger(v) && v > 0
const sha = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const instant = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v))
const time = (v) => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)
export const LESSON_CHANGE_ACTIONS = { RESCHEDULE: '调课或代课', CANCEL: '取消本次课' }
export const LESSON_CONFLICTS = {
  TEACHER: '任课教师时间冲突',
  ROOM: '相同教室时间冲突',
  MEMBERS: '选课成员时间冲突',
}
export function lessonChangeDate(v) {
  return (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    v.slice(0, 4) >= '2000' &&
    v.slice(0, 4) <= '2100' &&
    Number.isFinite(dayNumber(v)) &&
    new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
  )
}
export function lessonChangeQuery(q) {
  if (
    !q ||
    !lessonChangeDate(q.from) ||
    !lessonChangeDate(q.to) ||
    dayNumber(q.to) < dayNumber(q.from) ||
    dayNumber(q.to) - dayNumber(q.from) > 30 ||
    !integer(q.page) ||
    q.page > 10000 ||
    q.size !== 25 ||
    !text(q.search, 100) ||
    (q.search && !plain(q.search, 100))
  )
    throw new Error('选择31天以内的日期与有效查找条件')
  return { from: q.from, to: q.to, page: q.page, size: 25, search: q.search.trim() }
}
export function validatedLessonChangePage(value, raw) {
  const q = lessonChangeQuery(raw)
  if (
    !value ||
    value.page !== q.page ||
    value.size !== 25 ||
    value.from !== q.from ||
    value.to !== q.to ||
    value.search !== q.search ||
    !integer(value.total) ||
    value.totalPages !== Math.ceil(value.total / 25) ||
    !Array.isArray(value.items) ||
    value.items.length !== Math.min(25, Math.max(0, value.total - q.page * 25)) ||
    (q.page > 0 && q.page >= value.totalPages) ||
    new Set(value.items.map((r) => r?.lessonId)).size !== value.items.length ||
    value.items.some(
      (r) =>
        !uuid(r.lessonId) ||
        !plain(r.course, 100) ||
        !text(r.semester, 100) ||
        !text(r.className, 100) ||
        !text(r.teacher, 150) ||
        !text(r.room, 100) ||
        !instant(r.startsAt) ||
        !instant(r.endsAt) ||
        Date.parse(r.endsAt) <= Date.parse(r.startsAt) ||
        !integer(r.revision) ||
        !text(r.blockedReason, 150),
    )
  )
    throw new Error('课程分页响应异常，没有返回部分清单')
  return value
}
export function validatedLessonChangeTarget(v, id) {
  if (
    !v ||
    !uuid(id) ||
    v.lessonId !== id ||
    !uuid(v.courseId) ||
    !uuid(v.classId) ||
    !integer(v.revision) ||
    !integer(v.rosterRevision) ||
    !plain(v.name, 100) ||
    !plain(v.semester, 100) ||
    !plain(v.classLabel, 250) ||
    !plain(v.groupName, 100) ||
    !text(v.teacherLabel, 150) ||
    !(v.teacherId === null || positive(v.teacherId)) ||
    !lessonChangeDate(v.firstMonday) ||
    !lessonChangeDate(v.date) ||
    !time(v.startTime) ||
    !time(v.endTime) ||
    v.startTime >= v.endTime ||
    !plain(v.room, 100) ||
    !integer(v.members) ||
    v.members > 2000 ||
    !['LEGACY', 'ADMIN_CLASS', 'EXPLICIT'].includes(v.enrollmentMode) ||
    !sha(v.sourceHash)
  )
    throw new Error('原课程、版本或名单响应不完整，请重新读取')
  return v
}
export function lessonChangeInput(target, form, requestId) {
  validatedLessonChangeTarget(target, target?.lessonId)
  if (
    !uuid(requestId) ||
    !Object.hasOwn(LESSON_CHANGE_ACTIONS, form?.action) ||
    !plain(form.reason, 300) ||
    target.revision >= 2147483647
  )
    throw new Error('先核对目标并填写1至300字原因')
  const result = {
    requestId,
    lessonId: target.lessonId,
    revision: target.revision,
    sourceHash: target.sourceHash,
    action: form.action,
    date: null,
    startTime: null,
    endTime: null,
    teacherId: null,
    room: null,
    reason: form.reason.trim(),
    previewHash: null,
  }
  if (form.action === 'RESCHEDULE') {
    if (
      !lessonChangeDate(form.date) ||
      !time(form.startTime) ||
      !time(form.endTime) ||
      form.startTime >= form.endTime ||
      !positive(Number(form.teacherId)) ||
      !plain(form.room, 100)
    )
      throw new Error('选择明确日期、起止钟点、已核实任课教师和教室')
    Object.assign(result, {
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      teacherId: Number(form.teacherId),
      room: form.room.trim(),
    })
  }
  return result
}
function checkedProposed(v, payload) {
  if (payload.action === 'CANCEL') {
    if (v !== null) throw new Error('取消请求返回了不相关调课目标')
    return
  }
  if (
    !v ||
    v.date !== payload.date ||
    v.startTime !== payload.startTime ||
    v.endTime !== payload.endTime ||
    v.teacherId !== payload.teacherId ||
    v.room !== payload.room ||
    !plain(v.teacherLabel, 150)
  )
    throw new Error('替代安排与本次要求不一致，没有放行保存')
}
export function validatedLessonChangePreview(v, target, payload) {
  if (
    !v ||
    JSON.stringify(validatedLessonChangeTarget(v.original, payload.lessonId)) !==
      JSON.stringify(target) ||
    v.action !== payload.action ||
    v.reason !== payload.reason ||
    !sha(v.fingerprint) ||
    !Array.isArray(v.conflicts) ||
    v.conflicts.some(
      (c) => !Object.hasOwn(LESSON_CONFLICTS, c.kind) || !positive(c.arrangements),
    ) ||
    new Set(v.conflicts.map((c) => c.kind)).size !== v.conflicts.length ||
    !Array.isArray(v.warnings) ||
    v.warnings.some((w) => !text(w, 500))
  )
    throw new Error('变更预览的原目标、原因或版本不一致')
  checkedProposed(v.proposed, payload)
  return v
}
function checkedReceipt(v, plan, actorId) {
  const p = plan.payload
  if (
    !v ||
    v.actorId !== actorId ||
    v.requestId !== p.requestId ||
    v.action !== p.action ||
    v.reason !== p.reason ||
    v.revision !== p.revision + 1 ||
    !instant(v.recordedAt) ||
    JSON.stringify(v.original) !== JSON.stringify(plan.preview.original)
  )
    throw new Error('变更回执不属于本次目标或账号，请先核对原请求')
  checkedProposed(v.proposed, p)
  if (p.action === 'CANCEL') {
    if (v.replacementCourseId !== null || v.replacementLessonId !== null)
      throw new Error('取消回执含不相关替代安排')
  } else if (
    !uuid(v.replacementCourseId) ||
    !uuid(v.replacementLessonId) ||
    v.replacementCourseId === v.original.courseId ||
    v.replacementLessonId === p.lessonId
  )
    throw new Error('替代编号响应异常，没有冒认原课程已修改')
  return v
}
export function createLessonChangeResource({
  owner,
  actorId,
  state,
  readAccess,
  readPage,
  readTarget,
  preview,
  save,
  readReceipt,
  now = Date.now,
}) {
  let epoch = 0,
    controller,
    disposed = false,
    prepared,
    pending
  function reset() {
    epoch++
    controller?.abort()
    prepared = null
    pending = null
    Object.assign(state, {
      access: null,
      page: null,
      target: null,
      preview: null,
      receipt: null,
      busy: false,
      phase: 'list',
      error: '',
      notice: '',
      canRetry: false,
    })
  }
  function invalidate() {
    if (!state.busy && !['uncertain', 'saved'].includes(state.phase)) {
      prepared = null
      state.preview = null
      state.phase = state.target ? 'editing' : 'list'
      state.error = ''
    }
  }
  async function run(work) {
    if (disposed || !owner() || state.busy) return false
    controller = new AbortController()
    const principal = owner(),
      id = actorId(),
      op = { epoch: ++epoch, signal: controller.signal, owner: principal, actor: id }
    op.current = () =>
      !disposed &&
      owner() === principal &&
      actorId() === id &&
      op.epoch === epoch &&
      !op.signal.aborted
    state.busy = true
    state.error = ''
    try {
      return await work(op)
    } catch (e) {
      if (op.current())
        state.error = e.response?.data?.message || e.message || '读取失败，请保留草稿并核对'
      return false
    } finally {
      if (op.current()) state.busy = false
    }
  }
  async function reconcile(op) {
    if (!pending) throw new Error('没有待核对的原请求')
    try {
      const value = checkedReceipt(
        (await readReceipt(pending.payload.requestId, op.signal)).data,
        pending,
        op.actor,
      )
      if (!op.current()) return false
      state.receipt = value
      state.preview = null
      state.phase = 'saved'
      state.notice = `${value.action === 'CANCEL' ? '本次课已取消' : '替代安排已保存'}，原请求回执已核对。原课程其他周次与旧考勤保留。`
      state.canRetry = false
      prepared = null
      pending = null
      return true
    } catch (e) {
      if (op.current() && e.response?.status === 404) {
        state.phase = 'uncertain'
        state.canRetry = true
        state.error = '暂未查到回执，不证明在途保存没执行。只能显式重试同一编号和原内容。'
        return false
      }
      throw e
    }
  }
  async function persist(op, plan) {
    pending = plan
    prepared = null
    state.preview = null
    state.phase = 'uncertain'
    state.canRetry = false
    let acknowledged = false
    try {
      const r = await save(plan.payload, op.signal)
      if (!op.current()) return false
      checkedReceipt(r.data, plan, op.actor)
      acknowledged = true
      return await reconcile(op)
    } catch (e) {
      if (op.current() && !acknowledged && [400, 403, 409, 422].includes(e.response?.status)) {
        pending = null
        state.phase = 'editing'
      }
      throw e
    }
  }
  const locked = () => ['uncertain'].includes(state.phase)
  return {
    access: () =>
      run(async (op) => {
        const value = (await readAccess(op.signal)).data
        if (!op.current()) return false
        if (
          !value ||
          typeof value.enabled !== 'boolean' ||
          value.maxMembers !== 2000 ||
          value.changeScope !== 'ONE_FUTURE_LESSON'
        )
          throw new Error('调停课能力响应异常')
        state.access = value
        return true
      }),
    list: (query) =>
      run(async (op) => {
        if (locked()) throw new Error('先核对原请求，不新建第二次变更')
        const q = lessonChangeQuery(query),
          value = validatedLessonChangePage((await readPage(q, op.signal)).data, q)
        if (!op.current()) return false
        state.page = value
        state.target = null
        state.preview = null
        state.receipt = null
        prepared = null
        state.phase = 'list'
        return true
      }),
    select: (id) =>
      run(async (op) => {
        if (locked()) throw new Error('先核对原请求，不切换目标')
        const v = validatedLessonChangeTarget((await readTarget(id, op.signal)).data, id)
        if (!op.current()) return false
        prepared = null
        state.target = v
        state.preview = null
        state.receipt = null
        state.phase = 'editing'
        state.notice = ''
        return true
      }),
    prepare: (form, requestId) =>
      run(async (op) => {
        if (locked() || state.phase === 'saved' || !state.access?.enabled)
          throw new Error('先核对当前目标和原请求状态')
        const target = state.target,
          payload = lessonChangeInput(target, form, requestId),
          value = validatedLessonChangePreview(
            (await preview(payload, op.signal)).data,
            target,
            payload,
          )
        if (!op.current()) return false
        prepared = {
          owner: op.owner,
          actor: op.actor,
          payload: Object.freeze({ ...payload, previewHash: value.fingerprint }),
          preview: structuredClone(value),
          expiresAt: now() + 300000,
        }
        state.preview = value
        state.phase = 'preview'
        return true
      }),
    execute: () =>
      run(async (op) => {
        const p = prepared
        if (!p || p.owner !== op.owner || p.actor !== op.actor || now() >= p.expiresAt) {
          prepared = null
          state.preview = null
          state.phase = 'editing'
          throw new Error('预览已失效，请重新核对')
        }
        const current = validatedLessonChangePreview(
          (await preview({ ...p.payload, previewHash: null }, op.signal)).data,
          p.preview.original,
          { ...p.payload, previewHash: null },
        )
        if (!op.current()) return false
        if (current.fingerprint !== p.preview.fingerprint || current.conflicts.length) {
          prepared = null
          state.preview = null
          state.phase = 'editing'
          throw new Error('目标、名单或冲突已变化，请重新预览，没有保存')
        }
        return persist(op, p)
      }),
    reconcile: () => run(reconcile),
    retry: () =>
      run(async (op) => {
        if (!pending || !state.canRetry) throw new Error('先核对原请求回执')
        if (await reconcile(op)) return true
        if (!op.current() || !pending || !state.canRetry) return false
        return persist(op, pending)
      }),
    invalidate,
    reset,
    dispose() {
      reset()
      disposed = true
    },
  }
}
