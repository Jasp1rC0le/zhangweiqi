export const TEACHING_VIEWS = Object.freeze({
  STUDENT: '学生', TEACHER: '教师', COUNSELOR: '辅导员', SECRETARY: '书记',
})
export const ATTENDANCE_STATUSES = Object.freeze({
  UNKNOWN: '待点名', ON_TIME: '按时', LATE: '迟到', ABSENT: '旷课', EXCUSED: '请假', EARLY_LEAVE:'早退',
})
export const QUICK_ATTENDANCE=Object.freeze([{value:'ON_TIME',label:'按时'},{value:'ABSENT',label:'旷课'},{value:'EARLY_LEAVE',label:'早退'}])
export function attendanceSummary(lessons) {
  const counts = { unknown: 0, onTime: 0, late: 0, absent: 0, excused: 0,earlyLeave:0 }
  for (const lesson of lessons.filter(l => !l.cancelled))
    for (const key of Object.keys(counts)) counts[key] += lesson.counts[key] || 0
  const confirmed = counts.onTime + counts.late + counts.absent+counts.earlyLeave
  return { ...counts, confirmed, rate: confirmed ? (counts.onTime + counts.late) / confirmed : null }
}
const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const validText = (value, max = 100) => typeof value === 'string' && value.length <= max
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
export function validatedLesson(l) {
  if (!l || !validId(l.id) || !['course', 'className', 'college', 'teacher', 'room'].every(k => validText(l[k])) ||
      !validTime(l.startsAt) || !validTime(l.endsAt) || Date.parse(l.endsAt) <= Date.parse(l.startsAt) ||
      !Number.isInteger(l.revision) || l.revision < 0 || typeof l.finalized !== 'boolean' || typeof l.cancelled !== 'boolean' ||
      !l.counts || !['unknown', 'onTime', 'late', 'absent', 'excused'].every(k => Number.isInteger(l.counts[k]) && l.counts[k] >= 0 && l.counts[k] <= 2000))
    throw new Error('课程响应不完整，请重新读取')
  if (Object.values(l.counts).filter(Number.isInteger).reduce((sum, n) => sum + n, 0) > 2000)
    throw new Error('名单人数超出范围，请重新读取')
  if(l.counts.earlyLeave!=null && (!Number.isInteger(l.counts.earlyLeave) || l.counts.earlyLeave<0 || l.counts.earlyLeave>2000))throw new Error('早退统计响应异常')
  return l
}
export function validatedDetail(value, expectedId) {
  if (!value || validatedLesson(value.lesson).id !== expectedId || !Array.isArray(value.entries) || value.entries.length > 300 ||
      value.entries.some(e => !e || !validId(e.studentId) || !validText(e.studentNumber, 40) || !validText(e.name) || !Object.hasOwn(ATTENDANCE_STATUSES, e.status)) ||
      new Set(value.entries.map(e => e.studentId)).size !== value.entries.length)
    throw new Error('点名名单响应异常，未覆盖已有内容')
  return value
}
export function validatedDetailPage(value,id,page,search='') {
  const detail=validatedDetail(value?.detail,id)
  if(value.page!==page || value.size!==50 || value.search!==search.trim() || !Number.isSafeInteger(value.total) || value.total<0 || value.total>2000 || value.totalPages!==Math.ceil(value.total/50) || detail.entries.length!==Math.min(50,Math.max(0,value.total-page*50)) || (page>0 && page>=value.totalPages) || typeof detail.canMark!=='boolean' || typeof detail.canRecordAbsence!=='boolean')throw new Error('点名分页响应异常，未覆盖当前选择')
  return value
}
export function validatedLessonPage(value,page) {
  const integer=n=>Number.isSafeInteger(n)&&n>=0
  if(!value || value.page!==page || value.size!==50 || !integer(value.total) || value.total>10000000 || value.totalPages!==Math.ceil(value.total/50) || (page>0&&page>=value.totalPages) || !Array.isArray(value.items) || value.items.length!==Math.min(50,Math.max(0,value.total-page*50)) || new Set(value.items.map(l=>l?.id)).size!==value.items.length)
    throw new Error('课程分页响应异常，未返回不完整列表')
  value.items.forEach(validatedLesson)
  const counts=value.summary?.counts
  if(!counts || !['unknown','onTime','late','absent','excused','earlyLeave'].every(k=>integer(counts[k])) || Object.values(counts).some(n=>!integer(n)) || Object.values(counts).reduce((a,b)=>a+b,0)>value.total*2000 || !integer(value.summary.absentStudents) || value.summary.absentStudents>counts.absent || !['planned','today','conflicts'].every(k=>integer(value[k])&&value[k]<=value.total) || value.today>value.planned || !Array.isArray(value.conflictIds) || new Set(value.conflictIds).size!==value.conflictIds.length || value.conflictIds.some(id=>!value.items.some(l=>l.id===id)))
    throw new Error('完整范围统计响应异常，未用当前页冒充汇总')
  return value
}
export const isMyDayQuestion = text => typeof text === 'string' && text.length <= 100 &&
  /(?:我|我的).*(?:今天|明天).*(?:课|上课|教室|老师)|(?:今天|明天).*(?:我|我的).*(?:课|上课|教室|老师)/.test(text)
export function teachingClock(value) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
export function teachingDate(value) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(value))
}
export function rollCallProgress(detail, marks) {
  const entries=detail?.entries || []
  let changed=0,pending=0,unknownDelta=0
  for(const entry of entries) {
    const status=Object.hasOwn(marks,entry.studentId)?marks[entry.studentId]:entry.status
    if(status!==entry.status)changed++
    if(status==='UNKNOWN')pending++
    unknownDelta+=Number(status==='UNKNOWN')-Number(entry.status==='UNKNOWN')
  }
  return {total:entries.length,recorded:entries.length-pending,pending,changed,
    remaining:Math.max(0,(detail?.lesson.counts.unknown || 0)+unknownDelta)}
}
function validateMarkReceipt(detail, before, payload) {
  if(!Array.isArray(payload.marks) || ![payload.revision,payload.revision+1].includes(detail.lesson.revision) ||
    detail.lesson.cancelled || (payload.finish && !detail.lesson.finalized) ||
    detail.entries.length!==before.entries.length ||
    before.entries.some(entry=>!detail.entries.some(next=>next.studentId===entry.studentId && next.studentNumber===entry.studentNumber)) ||
    payload.marks.some(mark=>!detail.entries.some(entry=>entry.studentId===mark.studentId && entry.status===mark.status)))
    throw new Error('点名回执与提交的名单或状态不一致；先重新核对，不要重复提交')
}
// Requests and results share an account boundary. No localStorage or credential access.
export function createTeachingResource({ owner, readAccess, readLessons, readLessonsPage, readDetail, readDetailPage, save, savePage, state }) {
  let generation = 0, controller
  function reset() {
    generation++; controller?.abort()
    Object.assign(state, { access: null, lessons: [], lessonPage:null, lessonQuery:null, summaryStale:false, detail: null, rosterPage:null, loading: false, saving: false, writeBlocked:false, error: '' })
  }
  function operation() {
    controller?.abort(); controller = new AbortController()
    const revision = ++generation, principal = owner(), signal = controller.signal
    return { signal, current: () => !!principal && owner() === principal && generation === revision && !signal.aborted }
  }
  async function load(view, from, to, page=0, search='', {requireView=false}={}) {
    const op = operation(); state.loading = true; state.error = ''; state.detail = null;state.rosterPage=null;state.writeBlocked=false
    // Never leave an earlier scope visible after changing view/date/account.
    state.lessons = [];state.lessonPage=null;state.lessonQuery=null;state.summaryStale=false
    try {
      if(!Number.isSafeInteger(page)||page<0||!validText(search,100))throw new Error('课程页码或搜索内容无效')
      const { data: access } = await readAccess(op.signal)
      if (!op.current()) return
      if (!access || typeof access.enabled !== 'boolean' || !Array.isArray(access.views) || access.views.some(v => !Object.hasOwn(TEACHING_VIEWS, v))) throw new Error('教学权限响应异常')
      state.access = access
      if (!access.enabled || !access.views.length) return
      if(requireView && !access.views.includes(view))throw new Error('当前账号没有已确认的任课权限，未读取学生视图冒充点名名单；请联系管理员核对教师身份及课程绑定。')
      const selected = access.views.includes(view) ? view : access.views[0]
      const { data } = await (readLessonsPage?readLessonsPage(selected,from,to,op.signal,page,search.trim()):readLessons(selected, from, to, op.signal))
      if (!op.current()) return
      if(readLessonsPage) {
        state.lessonPage=validatedLessonPage(data,page)
        state.lessonQuery={view:selected,from,to,page,search:search.trim()}
        state.lessons=state.lessonPage.items
      } else {
        if (!Array.isArray(data) || data.length > 500 || new Set(data.map(l => l?.id)).size !== data.length) throw new Error('课程列表响应异常')
        state.lessons = data.map(validatedLesson)
      }
      return selected
    } catch (failure) {
      if (op.current()) state.error = failure.response?.status === 404 ? '当前后端还未加载教学模块。需要先完成迁移和新版本启用；个人课表不受影响。' : failure.response?.data?.message || failure.message || '读取失败，请重试'
    } finally { if (op.current()) state.loading = false }
  }
  async function select(id, view, page=0, search='') {
    const op = operation(); state.loading = true; state.error = ''; state.detail = null;state.rosterPage=null;state.writeBlocked=false
    try {
      const { data } = await (readDetailPage?readDetailPage(id,view,page,search.trim(),op.signal):readDetail(id, view, op.signal))
      if (op.current()) {
        if(readDetailPage){state.rosterPage=validatedDetailPage(data,id,page,search);state.detail=state.rosterPage.detail}
        else state.detail=validatedDetail(data,id)
      }
    } catch (failure) {
      if (op.current()) state.error = failure.response?.data?.message || failure.message || '名单读取失败，请重试'
    } finally { if (op.current()) state.loading = false }
  }
  async function saveMarks(id, payload) {
    if (state.saving || state.writeBlocked || !state.detail || state.detail.lesson.id !== id) return false
    const op = operation(); state.saving = true; state.error = ''
    const query=state.rosterPage,before=state.detail
    try {
      const { data } = await (savePage && query?savePage(id,payload,query.page,query.search,op.signal):save(id, payload, op.signal))
      if (!op.current()) return false
      const next=savePage && query?validatedDetailPage(data,id,query.page,query.search):null
      const detail=next?next.detail:validatedDetail(data,id)
      validateMarkReceipt(detail,before,payload)
      state.detail=detail;if(next)state.rosterPage=next
      state.lessons = state.lessons.map(l => l.id === id ? state.detail.lesson : l)
      if(readLessonsPage&&state.lessonQuery) {
        // A lesson delta cannot derive distinct absent people across other pages. Refresh the actual scope.
        state.summaryStale=true
        const q=state.lessonQuery
        try {
          const result=await readLessonsPage(q.view,q.from,q.to,op.signal,q.page,q.search)
          if(!op.current())return false
          const refreshed=validatedLessonPage(result.data,q.page)
          if(refreshed.items.some(l=>l.id===id&&l.revision<detail.lesson.revision))throw new Error('课程统计版本未更新')
          state.lessonPage=refreshed;state.lessons=refreshed.items;state.summaryStale=false
        } catch(failure) {
          if(!op.current())return false
          state.error=`点名已保存，完整统计未刷新：${failure.response?.data?.message||failure.message||'连接失败'}。请重新读取，不要重复提交。`
        }
      }
      return true
    } catch (failure) {
      if (op.current()) {
        const status=failure.response?.status
        state.writeBlocked=status===409 || !status || status>=500
        state.error=status===409
          ? '考勤已在另一页面更新。你的选择已保留，请重新读取后核对；不会自动覆盖或重发。'
          : state.writeBlocked
            ? `${failure.response?.data?.message || failure.message || '连接中断'}。保存结果尚未确认，你的选择已保留；先重新核对，不要重复提交。`
            : failure.response?.data?.message || failure.message || '保存失败，你的选择已保留'
      }
      return false
    } finally { if (op.current()) state.saving = false }
  }
  return { reset, load, select, saveMarks }
}
