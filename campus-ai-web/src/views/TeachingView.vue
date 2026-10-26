<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { addDays, chinaDate } from '@/utils/timetable'
import {
  TEACHING_VIEWS,
  ATTENDANCE_STATUSES,
  QUICK_ATTENDANCE,
  attendanceSummary,
  rollCallProgress,
  createTeachingResource,
  teachingClock,
  teachingDate,
} from '@/utils/teaching'
import {
  readTeachingAccess,
  readTeachingLessonsPage,
  readTeachingLessonPage,
  saveRollCallPage,
  readTeachingNotices,
  markTeachingNoticeRead,
} from '@/api/teaching'
import AdminTeachingPanel from '@/components/AdminTeachingPanel.vue'
import TeachingAuditPanel from '@/components/TeachingAuditPanel.vue'
import TeachingGovernancePanel from '@/components/TeachingGovernancePanel.vue'
import AttendanceCockpit from '@/components/AttendanceCockpit.vue'
import ScheduleExportPanel from '@/components/ScheduleExportPanel.vue'
import TeachingChangeNotices from '@/components/TeachingChangeNotices.vue'
import { userSessionGeneration } from '@/api/http'
import { onBeforeRouteUpdate,useRoute } from 'vue-router'
import { createForegroundPoll } from '@/utils/foregroundPoll'
import {teachingWorkflowRoute,focusWorkflowElement} from '@/utils/teachingWorkflows'
import {captureAuditFocusIntent} from '@/utils/teachingAdministrativeAudit'
import {onTimePageCandidates,planOnTimePage,applyOnTimePage,detachManualPageMark,undoOnTimePage} from '@/utils/rollCallPageDraft'
import '@/styles/teaching-confirmation.css'
import { calendarBackDestination } from '@/utils/calendarReturnContext'

const auth = useAuthStore()
const route = useRoute()
const calendarBack = computed(() => calendarBackDestination(route.query))
const workflow=computed(()=>teachingWorkflowRoute(route.query))
const rollCallRequested=computed(()=>workflow.value?.tool==='roll-call')
const workflowElement=ref()
const scheduleFiles=ref()
const lessonList = ref()
function showCourseRecords() {
  lessonList.value?.focus({ preventScroll: true })
  lessonList.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
}
const changeNotices=ref()
const owner = computed(() =>
  auth.user ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '',
)
const state = reactive({
  access: null,
  lessons: [],
  detail: null,
  loading: false,
  saving: false,
  error: '',
})
const resource = createTeachingResource({
  owner: () => owner.value,
  state,
  readAccess: readTeachingAccess,
  readLessonsPage: readTeachingLessonsPage,
  readDetailPage: readTeachingLessonPage,
  savePage: saveRollCallPage,
})
// A route expresses intent, not permission: createTeachingResource still checks
// the returned access list before selecting or reading this perspective.
const view = ref(typeof route.query.view === 'string' && Object.hasOwn(TEACHING_VIEWS, route.query.view) ? route.query.view : ''),
  from = ref(!workflow.value?.error&&workflow.value?.from||chinaDate()),
  to = ref(!workflow.value?.error&&workflow.value?.to||addDays(chinaDate(), 6)),
  search = ref('')
const marks = reactive({}),
  reason = ref(''),
  savedNotice = ref(''),
  notices = ref([]),
  noticeError = ref('')
const detailHeading = ref()
const pageFillUndo=ref(null),pageSaveAction=ref(),pageFillAction=ref()
const pageFillCount=computed(()=>state.rosterPage?onTimePageCandidates(state.detail,marks).length:0)
const pageFillScope=()=>JSON.stringify([owner.value,view.value,state.detail?.lesson.id,state.rosterPage?.page,state.rosterPage?.search])
const rosterSearch=ref('')
const progress=computed(()=>rollCallProgress(state.detail,marks))
const remainingUnknown=computed(()=>progress.value.remaining)
const hasNextRosterPage=computed(()=>!!state.rosterPage && state.rosterPage.page+1<state.rosterPage.totalPages)
const saveAndAdvance=computed(()=>hasNextRosterPage.value && progress.value.pending===0)
async function readRosterPage(page,query=rosterSearch.value) {
  const principal=owner.value,id=state.detail?.lesson.id
  if(!id)return
  savedNotice.value=''
  pendingDetailFocus?.intent?.dispose();pendingDetailFocus={owner:principal,id}
  await resource.select(id,view.value,page,query)
  await nextTick()
  focusPendingDetail()
}
async function rosterPage(page=0){if(busy.value || dirty.value || !state.detail)return;await readRosterPage(page)}
async function reconcileMarks() {
  if(await mayReplace())await readRosterPage(state.rosterPage?.page || 0,state.rosterPage?.search || '')
}
let disposed = false,
  lessonLoadGeneration = 0,
  pendingDetailFocus=null,
  noticeController,
  noticeGeneration = 0,
  timer
const { confirm, confirming } = useScopedConfirmation(
  () => `${owner.value}:${view.value}:${state.detail?.lesson.id || ''}`,
  () => !disposed,
)
const dirty = computed(
  () =>
    !!state.detail &&
    (reason.value.trim() !== '' ||
      state.detail.entries.some((e) => marks[e.studentId] !== e.status)),
)
const busy = computed(() => state.loading || state.saving || confirming.value)
let lastWorkflowFocus=''
const workflowKey=computed(()=>JSON.stringify([owner.value,workflow.value?.tool,workflow.value?.from,workflow.value?.to,workflow.value?.kind,workflow.value?.expiredOnly,workflow.value?.view,workflow.value?.classId]))
watch([workflowKey,view,busy],async()=>{
  const key=workflowKey.value,principal=owner.value
  if(workflow.value?.tool!=='evidence'||workflow.value.error||auth.user?.role==='ADMIN'||!view.value||!state.access?.governanceEnabled||busy.value||dirty.value||key===lastWorkflowFocus)return
  await nextTick();if(disposed||principal!==owner.value||key!==workflowKey.value||busy.value||dirty.value)return
  const panel=workflowElement.value?.querySelector('.teaching-governance');if(focusWorkflowElement(panel,()=>!disposed&&principal===owner.value&&key===workflowKey.value&&!busy.value&&!dirty.value))lastWorkflowFocus=key
},{flush:'post'})
useUnsavedChanges(
  () => dirty.value,
  () => busy.value,
)
const summary = computed(() => state.summaryStale?null:state.lessonPage?attendanceSummary([{counts:state.lessonPage.summary.counts,cancelled:false}]):attendanceSummary(state.lessons))
const leadership = computed(() => ['COUNSELOR', 'SECRETARY'].includes(view.value))
const summaryContext = computed(() => {
  const query = state.lessonQuery
  if (!leadership.value || !state.lessonPage || !query) return null
  return { owner: owner.value, view: query.view, scopeLabel: query.search ? `全部负责范围 · 课程关键词“${query.search}”` : '全部负责范围', summaryScope: '完整筛选课程；不是当前页小计', queryKey: JSON.stringify([query.view, query.from, query.to, query.search]), disabled: busy.value || dirty.value || state.summaryStale || !!state.error }
})
const filtersExpanded = ref(!globalThis.matchMedia?.('(max-width: 760px)')?.matches)
const filtered = computed(() =>
  state.lessonPage?state.lessons:state.lessons.filter((l) =>
    `${l.course} ${l.className} ${l.teacher}`.includes(search.value.trim()),
  ),
)
const teacher = computed(() => view.value === 'TEACHER')
const focused = computed(
  () => route.query.return === 'timetable' && typeof route.query.lesson === 'string',
)
const canMark = computed(() => teacher.value && state.detail?.canMark === true)
function resetPageMarks(){if(busy.value)return;for(const e of state.detail?.entries || [])marks[e.studentId]=e.status;reason.value='';pageFillUndo.value=null}
function markStudent(id,status){pageFillUndo.value=detachManualPageMark(pageFillUndo.value,id);marks[id]=status}
async function fillPageOnTime() {
  if(busy.value || state.writeBlocked || !canMark.value || !state.rosterPage)return
  try{
    const scope=pageFillScope(),detail=state.detail,plan=planOnTimePage(scope,detail,marks),beforeReason=reason.value
    const accepted=await confirm(`${detail.lesson.course} · ${teachingDate(detail.lesson.startsAt)} ${teachingClock(detail.lesson.startsAt)}\n第${state.rosterPage.page+1}页：你已核实剩余${plan.studentIds.length}人都按时到达吗？\n仅填写本页尚未选择且无历史记录者；保留手选旷课、早退和既有记录。只填草稿，不保存、不完成全课。`,{title:'先核对本页剩余同学',confirmText:'已核实，填草稿',cancelText:'返回继续核对',className:'ct-teaching-change-confirm'})
    if(!accepted)return
    if(busy.value || state.writeBlocked || reason.value!==beforeReason || scope!==pageFillScope())return
    pageFillUndo.value=applyOnTimePage(plan,scope,state.detail,marks)
    savedNotice.value=`已填入${plan.studentIds.length}人的按时草稿，尚未保存。请核对名单后另点保存；其他页未改。`
    await nextTick();if(!disposed && scope===pageFillScope() && !busy.value)pageSaveAction.value?.focus({preventScroll:true})
  }catch(error){state.error=error.message||'草稿未填入，请重新核对当前名单'}
}
async function undoPageFill(){
  if(busy.value || state.writeBlocked || !canMark.value || !pageFillUndo.value)return
  const scope=pageFillScope()
  try{const count=undoOnTimePage(pageFillUndo.value,scope,state.detail,marks);pageFillUndo.value=null;savedNotice.value=`已撤销${count}项批量草稿；后续手选和原记录保留。尚未保存。`;await nextTick();if(!disposed && scope===pageFillScope() && !busy.value)pageFillAction.value?.focus({preventScroll:true})}catch(error){state.error=error.message}
}
const correctionRequired = computed(
  () =>
    !!state.detail &&
    state.detail.entries.some(
      (e) =>
        marks[e.studentId] !== e.status &&
        (e.status !== 'UNKNOWN' || state.detail.lesson.finalized),
    ),
)
watch(correctionRequired, (required) => {
  if (!required) reason.value = ''
})
const title = computed(
  () =>
    ({
      STUDENT: '我的课程与考勤',
      TEACHER: '课程点名',
      COUNSELOR: '班级考勤',
      SECRETARY: '学院考勤',
    })[view.value] || (rollCallRequested.value?'任课课程点名':'教学考勤'),
)
const roleHint = computed(
  () =>
    ({
      STUDENT: '只显示本人课程和考勤记录',
      TEACHER: '只显示已绑定的任课课程',
      COUNSELOR: '只显示负责班级的记录',
      SECRETARY: '只显示负责学院的记录',
    })[view.value] || '按已确认的教学归属开放',
)
const selectedLabel = computed(() =>
  state.detail ? `${state.detail.lesson.course} · ${state.detail.lesson.className}` : '',
)
watch(
  () => state.detail,
  (detail) => {
    pageFillUndo.value=null
    for (const key of Object.keys(marks)) delete marks[key]
    for (const e of detail?.entries || []) marks[e.studentId] = e.status
    reason.value = ''
  },
)
watch(
  owner,
  () => {
    resource.reset()
    noticeController?.abort()
    noticeGeneration++
    notices.value = []
    view.value = ''
    savedNotice.value = ''
    pendingDetailFocus?.intent?.dispose();pendingDetailFocus=null
    noticeError.value = ''
    search.value=''
    if (owner.value) load()
  },
  { flush: 'sync' },
)
async function mayReplace() {
  if (busy.value) return false
  return (
    !dirty.value ||
    (await confirm('当前点名选择尚未保存。放弃后只重新读取记录，不会替你提交。', {
      title: '保留未保存点名？',
      confirmText: '放弃选择并继续',
    }))
  )
}
onBeforeRouteUpdate((target,current)=>target.fullPath!==current.fullPath?mayReplace():true)
watch(workflow,next=>{if(next?.error||!next?.from||!next?.to)return;from.value=next.from;to.value=next.to;if(owner.value&&!busy.value&&!dirty.value)load()},{flush:'post'})
async function load(page=0,appliedSearch=search.value.trim()) {
  if (!owner.value || disposed) return
  const principal=owner.value,generation=++lessonLoadGeneration
  rosterSearch.value=''
  const selected = await resource.load(rollCallRequested.value?'TEACHER':view.value, from.value, to.value,page,appliedSearch,{requireView:rollCallRequested.value})
  if(disposed || principal!==owner.value || generation!==lessonLoadGeneration)return
  if (selected) view.value = selected
  else if(rollCallRequested.value)view.value=''
  if (
    typeof route.query.lesson === 'string' &&
    state.access?.views.includes(String(route.query.view)) && (!rollCallRequested.value || route.query.view==='TEACHER')
  ) {
    view.value = String(route.query.view)
    await resource.select(route.query.lesson, view.value)
  }
  await loadNotices()
}
async function changeLessonPage(page) {
  if(!(await mayReplace()))return
  const q=state.lessonQuery
  if(!q)return
  savedNotice.value=''
  // Pagination stays on the applied dates/search, not half-edited filter controls.
  from.value=q.from;to.value=q.to;search.value=q.search
  await load(page,q.search)
}
async function reload() {
  if (await mayReplace()) {
    savedNotice.value = ''
    await load()
  }
}
async function configurationSaved(){
  if(busy.value||dirty.value){savedNotice.value='教学变更已保存；当前点名草稿保留，核对后再刷新课程。';return}
  await load()
}
async function changeView(event) {
  const next = event.target.value
  event.target.value = view.value
  if (!(await mayReplace())) return
  view.value = next
  await load()
}
async function select(lesson) {
  if (!(await mayReplace())) return
  const principal = owner.value
  savedNotice.value = ''
  rosterSearch.value=''
  pendingDetailFocus?.intent?.dispose();pendingDetailFocus={owner:principal,id:lesson.id}
  await resource.select(lesson.id, view.value)
  await nextTick()
  focusPendingDetail()
}
function focusPendingDetail(){
  const request=pendingDetailFocus
  if(!request)return
  if(disposed || owner.value!==request.owner || window.innerWidth>760&&!request.force || request.intent&&!request.intent.current()){request.intent?.dispose();pendingDetailFocus=null;return}
  if (
    detailHeading.value &&
    state.detail?.lesson.id === request.id &&
    !detailHeading.value?.closest('[inert]')
  ) {
    request.intent?.dispose();pendingDetailFocus=null
    if(request.force)detailHeading.value.style.scrollMarginTop='100px'
    detailHeading.value?.focus({ preventScroll: true })
    detailHeading.value?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }
}
async function save(finish = false, advance = false) {
  if (busy.value || state.writeBlocked || !canMark.value || !state.detail) return
  if(correctionRequired.value && !reason.value.trim())return
  const id = state.detail.lesson.id,principal=owner.value,query=state.rosterPage
  const payload = {
    revision: state.detail.lesson.revision,
    marks: state.detail.entries.map((e) => ({
      studentId: e.studentId,
      status: marks[e.studentId],
    })),
    reason: reason.value.trim(),
    finish,
  }
  if (await resource.saveMarks(id, payload)) {
    savedNotice.value = finish
      ? '点名已完成。更正仍会保留原记录和原因。'
      : state.detail?.lesson.finalized
        ? '更正已保存，原记录和更正原因保留。'
        : '已保存当前点名，未记录的同学仍是待点名。'
    if(advance && !state.error && owner.value===principal && state.detail?.lesson.id===id && query && query.page+1<query.totalPages)
      await readRosterPage(query.page+1,query.search)
  }
}
async function loadNotices() {
  noticeController?.abort()
  noticeController = new AbortController()
  const signal = noticeController.signal,
    epoch = ++noticeGeneration,
    principal = owner.value
  const current = () =>
    !disposed && owner.value === principal && epoch === noticeGeneration && !signal.aborted
  try {
    if (!state.access?.enabled || !state.access.views.length) return
    const [response] = await Promise.all([readTeachingNotices(signal),changeNotices.value?.refresh()])
    if (!current()) return
    if (!Array.isArray(response.data) || response.data.length > 100) throw new Error('通知响应异常')
    notices.value = response.data
    noticeError.value = ''
  } catch {
    if (current()) noticeError.value = '站内通知暂时没能读取，下次刷新再试'
  }
}
async function openNotice(notice) {
  if (!(await mayReplace())) return
  const principal = owner.value
  const targetView = notice.kind === 'TEACHER_ROSTER' ? 'TEACHER' : 'STUDENT'
  if (!state.access?.views.includes(targetView)) return
  view.value = targetView
  rosterSearch.value=''
  await resource.select(notice.lessonId, view.value)
  if (owner.value !== principal || state.error || !state.detail) return
  try {
    await markTeachingNoticeRead(notice.id)
    if (owner.value === principal && !disposed) await loadNotices()
  } catch {
    if (owner.value === principal && !disposed)
      noticeError.value = '课程已打开，通知已读状态未保存，可稍后重试'
  }
}
async function openChangedLesson(notice){
  if(notice.outdated||!notice.targetLessonId||!['STUDENT','TEACHER'].includes(notice.view)||!(await mayReplace()))return
  const principal=owner.value
  if(!state.access?.views.includes(notice.view))return
  view.value=notice.view;rosterSearch.value=''
  pendingDetailFocus?.intent?.dispose()
  pendingDetailFocus={owner:principal,id:notice.targetLessonId,force:true,intent:captureAuditFocusIntent(window)}
  await resource.select(notice.targetLessonId,notice.view)
  if(owner.value===principal&&state.error){noticeError.value='课程暂时无法打开，请刷新课表核对；没有代你点名。';pendingDetailFocus?.intent?.dispose();pendingDetailFocus=null}
  await nextTick();focusPendingDetail()
}
async function incomingLessonChange({owner:principal}){
  if(disposed||principal!==owner.value)return
  if(busy.value||dirty.value||state.detail){if(dirty.value)savedNotice.value='收到新的课程变更，未保存点名已保留；请核对并刷新后继续。';return}
  await load()
}
function demoClockChanged() {
  if (!busy.value && !dirty.value) load()
}
onMounted(() => {
  load()
  if (import.meta.env.DEV) window.addEventListener('campthink-demo-clock', demoClockChanged)
  timer = createForegroundPoll({ interval: 30000, run: () => !busy.value && loadNotices() })
  timer.start()
})
onBeforeUnmount(() => {
  disposed = true
  pendingDetailFocus?.intent?.dispose();pendingDetailFocus=null
  resource.reset()
  noticeController?.abort()
  noticeGeneration++
  timer?.stop()
  window.removeEventListener('campthink-demo-clock', demoClockChanged)
})
</script>

<template>
  <main ref="workflowElement" class="work-page teaching-page">
    <header class="teaching-heading" :class="{ 'focused-heading': focused }">
      <RouterLink v-if="route.query.return === 'timetable' && !calendarBack.error" :to="calendarBack.to">返回课表</RouterLink>
      <p v-else-if="route.query.return === 'timetable'" class="teaching-error" role="alert">{{ calendarBack.error }} <RouterLink to="/timetable">重新选择课表范围</RouterLink></p>
      <div>
        <h1>{{ title }}</h1>
        <p v-if="!focused">{{ roleHint }}</p>
      </div>
      <label v-if="!focused && !rollCallRequested && state.access?.views.length" class="view-control"
        >当前视图
        <select :value="view" aria-label="当前视图" :disabled="busy" @change="changeView">
          <option v-for="role in state.access.views" :key="role" :value="role">
            {{ TEACHING_VIEWS[role] }}
          </option>
        </select>
      </label>
      <button v-if="!focused" type="button" class="schedule-file-entry" @click="scheduleFiles?.open()">导出课程安排</button>
    </header>
    <p v-if="workflow?.error" class="teaching-workflow-warning" role="alert">{{ workflow.error }}</p>
    <p v-else-if="workflow&&!['evidence','roll-call'].includes(workflow.tool)&&auth.user?.role!=='ADMIN'" class="teaching-workflow-warning" role="status">这个管理入口需要正常本校管理员账号；当前只显示你原有授权范围，没有授予管理权限。</p>

    <section v-if="state.access && !state.access.enabled" class="teaching-empty">
      <h2>教学考勤尚未启用</h2>
      <p>学校授权、课程归属和数据库迁移配置完成后，这里会显示你的课程。个人导入的课表继续可用。</p>
      <RouterLink to="/timetable">回到我的课表</RouterLink>
    </section>
    <section v-else-if="rollCallRequested && state.access && !state.access.views.includes('TEACHER')" class="teaching-empty" role="status">
      <h2>当前账号还不能点名</h2>
      <p>点名需要已通过的教师身份和明确绑定的任课课程。学生、辅导员、书记或平台管理员身份不会自动获得任课权限；这里没有读取学生名单冒充点名。</p>
      <RouterLink to="/account#teaching-identity">核对本人的教学身份</RouterLink> · <RouterLink to="/teaching">查看原有授权视图</RouterLink>
    </section>
    <section v-else-if="state.access && !state.access.views.length" class="teaching-empty">
      <h2>{{auth.user?.role==='ADMIN'?'管理教学安排':'还没有绑定教学归属'}}</h2>
      <p v-if="auth.user?.role==='ADMIN'">在下方导入、绑定或核对具体课程。管理员权限与任课身份分开，无需把自己绑定成教师才能管理。</p>
      <p v-else>
        请联系教学管理员绑定本人账号、班级或课程。这里不会按同名匹配，也不能自行切换成教师或领导。
      </p>
    </section>
    <template v-else>
      <p v-if="rollCallRequested && state.access?.views.includes('TEACHER')" class="teaching-entry-hint">先选课程和具体节次，再逐人点名。这里只显示本人的任课课程，打开或切页不会自动记录按时。</p>
      <div v-if="!focused && leadership" class="leadership-query-controls">
        <button type="button" class="teaching-button" :disabled="busy" :aria-expanded="filtersExpanded" aria-controls="teaching-query-filters" @click="filtersExpanded = !filtersExpanded">{{ filtersExpanded ? '收起筛选' : '调整日期与课程' }}</button>
        <span v-if="state.lessonQuery?.search">课程筛选：{{ state.lessonQuery.search }}</span>
      </div>
      <form v-if="!focused" v-show="!leadership || filtersExpanded" id="teaching-query-filters" class="teaching-filters" @submit.prevent="reload">
        <label>开始日期<input v-model="from" type="date" :disabled="busy" required /></label>
        <label
          >结束日期<input
            v-model="to"
            type="date"
            :min="from"
            :max="addDays(from || chinaDate(), 30)"
            :disabled="busy"
            required
        /></label>
        <button class="teaching-button" :disabled="busy">
          {{ state.loading ? '正在读取' : '查看记录' }}
        </button>
        <label class="teaching-search"
          >筛选课程<input v-model="search" type="search" maxlength="100" placeholder="课程、班级或教师" :disabled="busy"
        /></label>
      </form>
      <p v-if="!focused && state.lessonQuery && search.trim()!==state.lessonQuery.search" class="roll-call-hint">点击“查看记录”应用新关键词；当前显示上次筛选结果。</p>
      <p v-if="state.error && !canMark" class="teaching-error" role="alert">
        {{ state.error }} <button type="button" :disabled="busy" @click="reload">重新读取</button>
      </p>
      <p v-if="noticeError" class="teaching-error" role="status">{{ noticeError }}</p>
      <TeachingChangeNotices v-if="!focused && state.access?.views.some(v=>['STUDENT','TEACHER'].includes(v))" ref="changeNotices" :owner="owner" :disabled="busy" @open="openChangedLesson" @new-change="incomingLessonChange" />
      <section
        v-if="!focused && notices.some((n) => !n.readAt)"
        class="teaching-notices"
        aria-label="课前站内通知"
      >
        <button
          v-for="notice in notices.filter((n) => !n.readAt)"
          :key="notice.id"
          type="button"
          :disabled="busy"
          @click="openNotice(notice)"
        >
          <span>{{ notice.kind === 'TEACHER_ROSTER' ? '点名名单已备好' : '下节课提醒' }}</span>
          <strong>{{ notice.course }}</strong
          ><small
            >{{ teachingDate(notice.startsAt) }} {{ teachingClock(notice.startsAt) }} ·
            {{ notice.room }}</small
          >
        </button>
      </section>
      <AttendanceCockpit v-if="!focused && leadership && summary && state.lessonQuery"
        :counts="summary" :planned="state.lessonPage?.planned"
        :absent-students="state.lessonPage?.summary.absentStudents"
        :from="state.lessonQuery.from" :to="state.lessonQuery.to" :summary-context="summaryContext">
        <template #action><button type="button" :disabled="busy || !state.lessons.length" @click="showCourseRecords">查看课程记录</button></template>
      </AttendanceCockpit>
      <div
        v-else-if="!focused && state.lessons.length && summary"
        class="teaching-summary"
        aria-label="当前查询范围考勤统计"
      >
        <span class="attendance-metric on-time"
          >按时 <strong>{{ summary.onTime }}</strong></span
        ><span class="attendance-metric absent"
          >旷课 <strong>{{ summary.absent }}</strong></span
        ><span class="attendance-metric early-leave"
          >早退 <strong>{{ summary.earlyLeave }}</strong></span
        ><span
          >待点名 <strong>{{ summary.unknown }}</strong></span
        >
        <small>{{ state.lessonPage?'全部筛选课程 · 人次；':'人次；' }}待点名不计旷课<span v-if="summary.late || summary.excused"> · 历史迟到 {{ summary.late }}，请假 {{ summary.excused }}</span></small>
      </div>
      <p v-if="state.loading && !state.lessons.length" class="teaching-loading" role="status">
        正在读取授权范围内的课程…
      </p>
      <div v-else class="teaching-layout" :class="{ 'focused-lesson': focused }">
        <section v-if="!focused" ref="lessonList" class="lesson-list" tabindex="-1" aria-label="课程安排">
          <nav v-if="state.lessonPage && state.lessonPage.totalPages>1" class="roster-pagination" aria-label="课程分页">
            <span>共 {{ state.lessonPage.total }} 项课程 · 第 {{ state.lessonPage.page+1 }}/{{ state.lessonPage.totalPages }} 页</span>
            <div>
              <button type="button" class="teaching-button" :disabled="busy || state.lessonPage.page===0" @click="changeLessonPage(state.lessonPage.page-1)">上一页课程</button>
              <button type="button" class="teaching-button" :disabled="busy || state.lessonPage.page+1>=state.lessonPage.totalPages" @click="changeLessonPage(state.lessonPage.page+1)">下一页课程</button>
            </div>
          </nav>
          <p v-if="!filtered.length && state.access?.views.length" class="teaching-empty-copy">
            {{
              state.lessons.length || state.lessonQuery?.search
                ? '没有匹配课程，试试其他关键词。'
                : '这个日期范围没有已配置课程。试试其他日期，临时调课请核对教务通知。'
            }}
          </p>
          <button
            v-for="lesson in filtered"
            :key="lesson.id"
            type="button"
            class="lesson-choice"
            :class="{ selected: state.detail?.lesson.id === lesson.id }"
            :aria-pressed="state.detail?.lesson.id === lesson.id"
            :disabled="busy"
            @click="select(lesson)"
          >
            <time
              >{{ teachingDate(lesson.startsAt)
              }}<b>{{ teachingClock(lesson.startsAt) }}—{{ teachingClock(lesson.endsAt) }}</b></time
            >
            <strong>{{ lesson.course }}</strong
            ><span>{{ lesson.className }} · {{ lesson.room }}</span
            ><small>任课教师 {{ lesson.teacher }}</small>
            <span class="lesson-state">{{
              lesson.cancelled ? '已取消' : lesson.finalized ? '点名完成' : '等待点名'
            }}</span>
          </button>
        </section>
        <Transition name="teaching-detail" mode="out-in" @after-enter="focusPendingDetail">
          <section
            v-if="state.detail"
            :key="state.detail.lesson.id"
            class="roll-call"
            aria-label="课程考勤"
            :aria-busy="state.saving"
          >
            <header>
              <h2 ref="detailHeading" tabindex="-1">{{ selectedLabel }}</h2>
              <p>
                {{ teachingDate(state.detail.lesson.startsAt) }} ·
                {{ teachingClock(state.detail.lesson.startsAt) }}—{{
                  teachingClock(state.detail.lesson.endsAt)
                }}
              </p>
              <p>{{ state.detail.lesson.room }} · 任课教师 {{ state.detail.lesson.teacher }}</p>
            </header>
            <p v-if="focused && view !== 'STUDENT'" class="focused-counts">
              按时 {{ state.detail.lesson.counts.onTime }} · 旷课 {{ state.detail.lesson.counts.absent }} · 早退 {{ state.detail.lesson.counts.earlyLeave || 0 }} ·
              待点名 {{ state.detail.lesson.counts.unknown }}<small>人次；未点名不计旷课</small>
            </p>
            <p v-if="state.detail.lesson.cancelled" class="teaching-error">
              此课已取消。保留原记录，不能继续点名。
            </p>
            <p v-else class="roll-call-hint">
              {{
                teacher
                  ? '直接点选按时、旷课或早退，保存本页后生效。更正已有记录必须填写原因。'
                  : view === 'STUDENT'
                    ? '下方只有本人的记录，如有异议请联系任课老师核对。'
                    : '负责范围内的只读记录，由任课教师点名和更正。'
              }}
            </p>
            <p v-if="teacher && !canMark && !state.detail.lesson.cancelled" class="roll-call-hint">
              名单可以先查看；课前5分钟可记录按时，开课后才可记旷课或早退。<button
                type="button"
                class="teaching-button"
                :disabled="busy"
                @click="reload"
              >
                重新读取
              </button>
            </p>
            <form v-if="state.rosterPage" class="roster-pagination" @submit.prevent="rosterPage(0)">
              <label>查找名单<input v-model="rosterSearch" type="search" maxlength="100" placeholder="姓名或学号" :disabled="busy || dirty" /></label>
              <button class="teaching-button" :disabled="busy || dirty">查找</button>
              <span>{{ state.rosterPage.search ? '匹配' : '本课名单' }} {{ state.rosterPage.total }} 人 · 本课待点名 {{ state.detail.lesson.counts.unknown }} 人</span>
              <div><button type="button" class="teaching-button" :disabled="busy || dirty || state.rosterPage.page===0" @click="rosterPage(state.rosterPage.page-1)">上一页</button><span>{{ state.rosterPage.totalPages ? state.rosterPage.page+1 : 0 }}/{{ state.rosterPage.totalPages }}</span><button type="button" class="teaching-button" :disabled="busy || dirty || state.rosterPage.page+1>=state.rosterPage.totalPages" @click="rosterPage(state.rosterPage.page+1)">下一页</button></div>
              <small v-if="dirty">先保存本页，再翻页或搜索；完成点名会核对本课完整名单。</small>
            </form>
            <div class="roll-call-workflow">
            <ol class="roll-call-list">
              <li v-for="entry in state.detail.entries" :key="entry.studentId">
                <div class="student-label">
                  <strong>{{ entry.name }}</strong
                  ><span>{{ entry.studentNumber }}</span>
                  <small v-if="teacher && marks[entry.studentId]==='UNKNOWN'" class="pending-mark">待点名</small>
                  <small v-if="!['UNKNOWN','ON_TIME','ABSENT','EARLY_LEAVE'].includes(entry.status)" class="legacy-status">历史记录：{{ ATTENDANCE_STATUSES[entry.status] }}，尚未更改</small>
                </div>
                <div v-if="teacher && !state.detail.lesson.cancelled" class="quick-marks" role="group" :aria-label="`${entry.name}的考勤状态`">
                  <button v-for="choice in QUICK_ATTENDANCE" :key="choice.value" type="button" class="quick-mark" :data-status="choice.value" :aria-pressed="marks[entry.studentId]===choice.value" :aria-label="`${entry.name}：${choice.label}`" :disabled="busy || !canMark || (choice.value!=='ON_TIME' && !state.detail.canRecordAbsence)" @click="markStudent(entry.studentId,choice.value)">
                    <svg v-if="marks[entry.studentId]===choice.value" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>{{ choice.label }}
                  </button>
                </div>
                <span v-else class="attendance-state" :class="entry.status.toLowerCase()">{{
                  ATTENDANCE_STATUSES[entry.status]
                }}</span>
              </li>
            </ol>
            <form v-if="canMark" class="roll-call-actions" aria-label="点名保存与翻页" @submit.prevent="save(false,saveAndAdvance)">
              <p class="roll-call-progress" aria-live="polite">
                <strong>本页已记录 {{ progress.recorded }}/{{ progress.total }} 人</strong>
                <span>本课还有 {{ remainingUnknown }} 人待点名<span v-if="dirty"> · 未保存 {{ progress.changed }} 项</span></span>
              </p>
              <label v-if="correctionRequired"
                >更正原因 <span>说明核对依据，保留更正记录</span
                ><input
                  v-model="reason"
                  maxlength="300"
                  required
                  :disabled="busy"
                  placeholder="例如：迟到后补记，已与本人核对"
              /></label>
              <p v-if="state.error" class="teaching-error" role="alert">{{ state.error }}</p>
              <div :class="{ 'page-fill-actions': pageFillCount || pageFillUndo?.studentIds.length }">
                <button v-if="state.writeBlocked" type="button" class="teaching-button primary" :disabled="busy" @click="reconcileMarks">重新核对保存结果</button>
                <button v-else ref="pageSaveAction" type="submit" class="teaching-button primary" :disabled="busy || !dirty">
                  {{ state.saving ? '正在保存' : saveAndAdvance ? '保存并下一页' : state.rosterPage?.totalPages>1 ? '保存本页点名' : '保存点名' }}
                </button>
                <button v-if="pageFillCount" ref="pageFillAction" type="button" class="teaching-button" :disabled="busy || state.writeBlocked" :aria-label="`核对本页剩余${pageFillCount}人并填为按时草稿`" @click="fillPageOnTime">本页填按时</button>
                <button v-if="pageFillUndo?.studentIds.length" type="button" class="teaching-button" :disabled="busy || state.writeBlocked" @click="undoPageFill">撤销批量草稿</button>
                <button v-if="dirty" type="button" class="teaching-button" :disabled="busy" @click="resetPageMarks">撤销本页修改</button>
                <button
                  type="button"
                  class="teaching-button"
                  :disabled="
                    busy ||
                    state.writeBlocked ||
                    remainingUnknown>0 ||
                    state.detail.lesson.finalized
                  "
                  @click="save(true)"
                >
                  完成点名</button
                >
              </div>
              <nav v-if="state.rosterPage?.totalPages>1" class="roll-call-page-controls" aria-label="名单就近翻页">
                <button type="button" class="teaching-button" :disabled="busy || dirty || state.rosterPage.page===0" @click="rosterPage(state.rosterPage.page-1)">上一页</button>
                <span>第 {{ state.rosterPage.page+1 }}/{{ state.rosterPage.totalPages }} 页</span>
                <button type="button" class="teaching-button" :disabled="busy || dirty || !hasNextRosterPage" @click="rosterPage(state.rosterPage.page+1)">下一页</button>
              </nav>
              <p v-if="savedNotice" class="teaching-saved" role="status">{{ savedNotice }}</p>
            </form>
            </div>
            <TeachingAuditPanel :owner="owner" :lesson-id="state.detail.lesson.id" :view="view" :revision="state.detail.lesson.revision" />
          </section>
          <section v-else-if="state.lessons.length" class="teaching-selection-empty">
            <h2>{{ state.loading ? '正在读取名单' : '选一节课' }}</h2>
            <p>
              {{ teacher ? '打开对应班级名单，记录到达情况。' : '查看课程地点、教师和考勤记录。' }}
            </p>
          </section>
        </Transition>
      </div>
      <p v-if="!focused && state.access?.enabled" class="teaching-footnote">
        站内通知按已配置钟点生成：学生课前1小时，教师课前5分钟。未绑定账号不会收到通知；这是站内收件箱，不是微信推送，也不代表实时教务同步。
      </p>
    </template>
    <ScheduleExportPanel v-if="!focused" ref="scheduleFiles" :owner="owner" :preferred-view="auth.user?.role==='ADMIN'?'ADMIN':view" :active="!busy&&!dirty" :from="from" :to="to" />
    <TeachingGovernancePanel v-if="!focused && auth.user?.role !== 'ADMIN' && state.access?.governanceEnabled && view" :key="workflow?.tool==='evidence'?workflowKey:`evidence-${owner}-${view}`" :owner="owner" :preferred-view="view" :active="!busy && !dirty" :preset="workflow?.tool==='evidence'?workflow:null" />
    <AdminTeachingPanel v-if="!focused && auth.user?.role === 'ADMIN'" :workflow="workflow" @saved="configurationSaved" />
  </main>
</template>

<style scoped>
.leadership-query-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 16px; }
.leadership-query-controls > span { font-size: 14px; color: var(--assistant-muted, #5d6876); overflow-wrap: anywhere; }
.schedule-file-entry{min-height:44px;padding:10px 16px;font:inherit;font-size:16px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;background:var(--assistant-soft,#eaf2ff);color:var(--assistant-accent,#0b62db);cursor:pointer}
.teaching-workflow-warning{color:var(--assistant-warning,#9a5400);font-size:16px;line-height:1.7;overflow-wrap:anywhere}
.teaching-entry-hint{max-width:65ch;margin:16px 0;color:var(--assistant-muted,#5d6876);font-size:16px;line-height:1.7;overflow-wrap:anywhere}
.quick-marks{display:flex;gap:8px;flex:none}.quick-mark{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:76px;min-height:44px;padding:10px 12px;border:1px solid var(--assistant-line,#dbe3ef);border-radius:10px;font:inherit;font-size:15px;font-weight:600;background:var(--assistant-surface,#fff);cursor:pointer;transition:background-color 180ms ease,color 180ms ease,border-color 180ms ease}.quick-mark svg{width:16px;height:16px;flex:none}.quick-mark[data-status='ON_TIME']{color:var(--assistant-success,#187248);background:var(--assistant-success-soft,#e8f7ef);border-color:transparent}.quick-mark[data-status='ABSENT']{color:var(--assistant-danger,#bf303d);background:var(--assistant-danger-soft,#fff0f1);border-color:transparent}.quick-mark[data-status='EARLY_LEAVE']{color:var(--assistant-warning,#a65b00);background:var(--assistant-warning-soft,#fff4de);border-color:transparent}.quick-mark[aria-pressed='true'][data-status='ON_TIME']{background:var(--assistant-success,#187248);color:white}.quick-mark[aria-pressed='true'][data-status='ABSENT']{background:var(--assistant-danger,#bf303d);color:white}.quick-mark[aria-pressed='true'][data-status='EARLY_LEAVE']{background:var(--assistant-warning,#a65b00);color:white}.quick-mark:hover:not(:disabled){filter:brightness(.96)}.quick-mark:active:not(:disabled){transform:translateY(1px)}.quick-mark:disabled{opacity:.45;cursor:not-allowed}.legacy-status{font-size:13px;color:var(--assistant-muted,#5d6876);margin-top:5px}.attendance-metric{padding:9px 13px;border-radius:10px;display:inline-flex;align-items:center;gap:8px}.attendance-metric.on-time{color:var(--assistant-success);background:var(--assistant-success-soft)}.attendance-metric.absent{color:var(--assistant-danger);background:var(--assistant-danger-soft)}.attendance-metric.early-leave{color:var(--assistant-warning);background:var(--assistant-warning-soft)}.teaching-summary .attendance-metric strong{color:inherit;font-size:24px}.attendance-state.early_leave{color:var(--assistant-warning)}.teaching-page .roll-call header{padding:20px 22px;border-radius:16px;background:var(--assistant-soft)}.teaching-page .roll-call-list{margin-top:24px}.teaching-page .roll-call-list li{padding-block:17px}.teaching-page .teaching-button.primary{box-shadow:0 3px 8px rgb(11 98 219 / 16%)}
@media(max-width:760px){.roll-call-list li{flex-wrap:wrap}.quick-marks{width:100%}.quick-mark{flex:1;font-size:16px}.teaching-page .roll-call header{padding:18px}.student-label span{font-size:14px}}
@media(prefers-reduced-motion:reduce){.quick-mark{transition:none}.quick-mark:active:not(:disabled){transform:none}}
.roster-pagination{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-block:24px 12px;font-size:14px;color:var(--assistant-muted,#5d6876)}.roster-pagination label{display:grid;gap:6px;min-width:0;flex:1 1 180px}.roster-pagination input{font:inherit;font-size:16px;min-height:44px;box-sizing:border-box;max-width:100%;color:var(--assistant-ink,#29323c);border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;padding:9px 12px;background:var(--assistant-surface,#fff)}.roster-pagination div{display:flex;gap:12px;align-items:center}.roster-pagination small{flex-basis:100%;font-size:14px;color:var(--assistant-warning,#8b5e14)}
.teaching-page {
  max-width: 1240px;
  color: var(--assistant-ink, #29323c);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif;
  font-size: 16px;
  line-height: 1.65;
}
.teaching-layout.focused-lesson {
  display: block;
  max-width: 820px;
}
.focused-counts {
  font-size: 14px;
  margin: 18px 0;
  color: var(--assistant-muted, #5d6876);
  font-variant-numeric: tabular-nums;
}
.focused-counts small {
  display: block;
  font-size: 12px;
  margin-top: 4px;
}
.teaching-heading > a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--assistant-accent, #536f90);
  text-underline-offset: 4px;
  white-space: nowrap;
}
.teaching-heading.focused-heading {
  align-items: flex-start;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
}
.teaching-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 30px;
}
h1 {
  font-size: 30px;
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: -0.03em;
  margin: 0 0 8px;
}
h2 {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}
p {
  margin: 0;
}
.teaching-heading p,
.roll-call header p,
.roll-call-hint,
.teaching-empty p,
.teaching-selection-empty p,
.teaching-footnote {
  color: var(--assistant-muted, #5d6876);
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}
.view-control {
  min-width: 130px;
}
input,
select,
.teaching-button {
  min-height: 44px;
  border: 1px solid var(--assistant-line, #e2e7ec);
  border-radius: 12px;
  background: #fff;
  color: inherit;
  padding: 9px 13px;
  font: inherit;
  caret-color: var(--assistant-accent, #536f90);
}
select {
  cursor: pointer;
}
.teaching-button {
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 180ms ease-out,
    transform 180ms ease-out;
}
.teaching-button.primary {
  background: var(--assistant-accent, #536f90);
  border-color: transparent;
  color: #fff;
}
.teaching-button.primary:hover {
  background: var(--assistant-accent-hover, #405b7b);
}
.teaching-button:active {
  transform: scale(0.98);
}
button:disabled,
input:disabled,
select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.teaching-button:hover:not(:disabled) {
  background: var(--assistant-soft, #eaf0f6);
}
.teaching-button.primary:hover:not(:disabled) {
  background: var(--assistant-accent-hover, #405b7b);
}
.teaching-filters {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}
.teaching-search {
  margin-left: auto;
  min-width: 190px;
  max-width: 300px;
}
.teaching-summary {
  display: flex;
  gap: 20px;
  align-items: baseline;
  flex-wrap: wrap;
  padding: 18px 0;
  margin-bottom: 20px;
  border-top: 1px solid var(--assistant-line, #e2e7ec);
  border-bottom: 1px solid var(--assistant-line, #e2e7ec);
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
}
.teaching-summary strong {
  font-size: 19px;
  font-weight: 600;
  color: var(--assistant-ink, #29323c);
  font-variant-numeric: tabular-nums;
  margin-left: 4px;
}
.teaching-summary small {
  margin-left: auto;
}
.teaching-layout {
  display: grid;
  grid-template-columns: minmax(230px, 1fr) minmax(0, 1.7fr);
  gap: 38px;
  align-items: start;
}
.lesson-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lesson-choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  position: relative;
  text-align: left;
  border: 0;
  border-radius: 14px;
  background: transparent;
  padding: 18px;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background-color 180ms ease-out;
}
.lesson-choice:hover {
  background: var(--assistant-panel, #f0f3f6);
}
.lesson-choice.selected {
  background: var(--assistant-soft, #eaf0f6);
}
.lesson-choice time {
  color: var(--assistant-muted, #5d6876);
  font-size: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-variant-numeric: tabular-nums;
}
.lesson-choice time b {
  font-weight: 500;
}
.lesson-choice > strong {
  font-size: 17px;
  font-weight: 600;
}
.lesson-choice > span:not(.lesson-state),
.lesson-choice small {
  font-size: 13px;
  color: var(--assistant-muted, #5d6876);
}
.lesson-state {
  margin-top: 5px;
  font-size: 12px;
  color: var(--assistant-accent, #536f90);
}
.roll-call {
  min-width: 0;
}
.roll-call-hint {
  font-size: 13px;
  line-height: 1.7;
  margin-top: 14px;
  max-width: 65ch;
}
.roll-call-list {
  list-style: none;
  padding: 0;
  margin: 20px 0;
}
.roll-call-list li {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  align-items: center;
  padding: 13px 0;
  border-bottom: 1px solid var(--assistant-line, #e2e7ec);
}
.student-label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.student-label strong {
  font-weight: 500;
  overflow-wrap: anywhere;
}
.student-label span {
  font-size: 12px;
  color: var(--assistant-muted, #5d6876);
  font-variant-numeric: tabular-nums;
}
.status-choice {
  min-width: 108px;
}
.attendance-state {
  font-size: 14px;
}
.attendance-state.absent {
  color: #a24439;
}
.attendance-state.late {
  color: #795d25;
}
.attendance-state.unknown {
  color: var(--assistant-muted, #5d6876);
}
.roll-call-actions {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-block: 14px max(14px,env(safe-area-inset-bottom));
  border-top: 1px solid var(--assistant-line,#e2e7ec);
  background: var(--assistant-surface,#fff);
}
.roll-call-workflow {display:flow-root}
.roll-call-actions .teaching-button {font-size:16px}
.roll-call-progress {display:flex;flex-wrap:wrap;gap:2px 14px;font-size:14px;font-variant-numeric:tabular-nums}
.roll-call-progress strong {font-weight:600}
.roll-call-progress > span {color:var(--assistant-muted,#5d6876)}
.roll-call-page-controls {display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;color:var(--assistant-muted,#5d6876)}
.roll-call-actions input {font-size:16px;min-width:0}
.roll-call-actions .teaching-error,.roll-call-actions .teaching-saved {margin:0}
.pending-mark {font-size:14px;color:var(--assistant-warning,#9a5400)}
.roll-call-actions label span {
  font-weight: 400;
  color: var(--assistant-muted, #5d6876);
}
.roll-call-actions > div {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
@media(max-width:600px){
  .roll-call-actions > div.page-fill-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}
  .page-fill-actions > .teaching-button{width:100%;min-width:0;min-height:48px;white-space:normal}
}
.draft-status {
  font-size: 12px;
  color: var(--assistant-muted, #5d6876);
}
.teaching-empty,
.teaching-selection-empty {
  padding: 40px 0;
  max-width: 65ch;
}
.teaching-empty a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-top: 12px;
  color: var(--assistant-accent, #536f90);
  text-underline-offset: 4px;
}
.teaching-empty-copy {
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
  padding: 18px;
}
.teaching-error {
  color: #a24439;
  margin: 12px 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.teaching-error button {
  min-height: 44px;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.teaching-saved {
  font-size: 14px;
  margin-top: 16px;
  color: var(--assistant-accent, #536f90);
}
.teaching-loading {
  padding: 30px 0;
  color: var(--assistant-muted, #5d6876);
}
.teaching-footnote {
  font-size: 12px;
  line-height: 1.8;
  max-width: 85ch;
  margin-top: 36px;
}
.teaching-notices {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.teaching-notices button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  text-align: left;
  max-width: 100%;
  border: 0;
  border-radius: 14px;
  padding: 12px 16px;
  background: var(--assistant-soft, #eaf0f6);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.teaching-notices button > span {
  font-size: 12px;
  color: var(--assistant-accent, #536f90);
}
.teaching-notices strong {
  font-size: 15px;
  font-weight: 500;
}
.teaching-notices small {
  font-size: 12px;
  color: var(--assistant-muted, #5d6876);
}
.teaching-detail-enter-active,
.teaching-detail-leave-active {
  transition:
    opacity 180ms ease-out,
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.teaching-detail-enter-from,
.teaching-detail-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
:focus-visible {
  outline: 2px solid var(--assistant-accent, #536f90);
  outline-offset: 3px;
}
::selection {
  background: var(--assistant-soft, #eaf0f6);
  color: var(--assistant-ink, #29323c);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  clip-path: inset(50%);
  overflow: hidden;
  white-space: nowrap;
}
@media (max-width: 760px) {
  .teaching-heading {
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 24px;
  }
  h1 {
    font-size: 26px;
  }
  .teaching-heading p {
    font-size: 14px;
  }
  .view-control {
    min-width: 105px;
  }
  .teaching-filters {
    gap: 10px;
  }
  .teaching-filters > label:not(.teaching-search) {
    flex: 1;
    min-width: 130px;
  }
  .teaching-search {
    order: 4;
    flex-basis: 100%;
    max-width: none;
    margin-left: 0;
  }
  .teaching-layout {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .lesson-list {
    display: grid;
    grid-template-columns: 1fr;
  }
  .lesson-choice {
    padding: 16px;
  }
  .teaching-summary {
    gap: 10px 16px;
  }
  .teaching-summary small {
    flex-basis: 100%;
    margin: 0;
  }
  .roll-call-actions > div {
    align-items: stretch;
  }
  .roll-call-actions .teaching-button {
    flex: 1;
  }
  .draft-status {
    flex-basis: 100%;
  }
  .teaching-empty {
    padding: 26px 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .teaching-detail-enter-active,
  .teaching-detail-leave-active,
  .lesson-choice,
  .teaching-button {
    transition: none;
  }
  .teaching-detail-enter-from,
  .teaching-detail-leave-to,
  .teaching-button:active {
    transform: none;
  }
}
</style>
