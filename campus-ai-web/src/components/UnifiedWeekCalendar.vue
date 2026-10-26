<script setup>
import DateField from '@/components/DateField.vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useCourseScheduleStore } from '@/stores/courseSchedule'
import { userSessionGeneration } from '@/api/http'
import { addDays, chinaDate, mondayOf } from '@/utils/timetable'
import { createUnifiedTimetable, createUnifiedNoticeReader, createUnifiedScopes, unifiedLayoutReadiness } from '@/utils/unifiedTimetable'
import { ATTENDANCE_STATUSES } from '@/utils/teaching'
import { readUnifiedTimetablePage, readUnifiedScopesPage } from '@/api/unifiedTimetable'
import { markTeachingNoticeRead, readTeachingNotices } from '@/api/teaching'
import { useRouter, useRoute } from 'vue-router'
import { calendarSchedulePreset } from '@/utils/schedulePerspective.js'
import { createForegroundPoll } from '@/utils/foregroundPoll'
import TeachingChangeNotices from './TeachingChangeNotices.vue'
import { changeNoticeDestination } from '@/utils/lessonChangeNotices'
import AttendanceCockpit from './AttendanceCockpit.vue'
import { checkedCalendarExportContext } from '@/utils/calendarExportHandoff'
import CourseEntryCopy from './CourseEntryCopy.vue'
import { calendarDateTarget, CALENDAR_DATE_MIN, CALENDAR_DATE_MAX } from '@/utils/calendarDateTarget'
import { calendarBackPreset, calendarBackQuery } from '@/utils/calendarReturnContext'
const emit = defineEmits(['available', 'scope', 'layout', 'export-context'])
const auth = useAuthStore(),
  personal = useCourseScheduleStore(),
  router = useRouter(),
  route = useRoute()
const owner = computed(() =>
  auth.user ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '',
)
const state = reactive({ week: null, loading: false, stale: false, error: '', unsupported: false })
const resource = createUnifiedTimetable({
  owner: () => owner.value,
  state,
  read: readUnifiedTimetablePage,
})
const scopeState = reactive({ data: null, loading: false, error: '' })
const layoutReadiness = computed(() => unifiedLayoutReadiness(state, scopeState))
watch([owner, layoutReadiness], ([principal, status]) => emit('layout', { owner: principal, status }), { immediate: true, flush: 'post' })
const scopes = createUnifiedScopes({ owner: () => owner.value, state: scopeState, read: readUnifiedScopesPage })
const coursePage = ref(0), classSearch = ref(''), classFinderVisible = ref(false)
const monday = ref(mondayOf(chinaDate())),
  view = ref(''),
  classId = ref(''),
  selectedDay = ref(chinaDate()),
  showWeek = ref(false)
const dateDraft = ref(selectedDay.value), dateError = ref(''), dateHintId = useId()
watch(selectedDay, value => { dateDraft.value = value; dateError.value = '' }, { flush: 'sync' })
const dateHint = computed(() => {
  if (dateDraft.value !== selectedDay.value) return `日期尚未应用，当前仍查看${selectedDay.value}所在周。点“查看”后切换。`
  if (state.loading) return `正在读取${selectedDay.value}所在周，身份和班级不变…`
  if (state.error || state.stale || !state.week) return `尚未核对${selectedDay.value}所在周；请重试，没有改查其他日期。`
  return state.pagination?.totalPages > 1
    ? `已定位${selectedDay.value}所在周；明细按整周分页，每项标明日期，统计仍覆盖整周。`
    : `当前明细日期：${selectedDay.value}；统计仍覆盖整周。`
})
async function jumpDate() {
  if (!owner.value || disposed || state.loading || scopeState.loading || noticeBusy.value || !scopeState.data) return
  let target
  try { target = calendarDateTarget(dateDraft.value) } catch (failure) { dateError.value = failure.message; return }
  dateError.value = ''
  coursePage.value = 0
  monday.value = target.monday
  selectedDay.value = target.date
  await load()
}
const days = ['一', '二', '三', '四', '五', '六', '日']
const queryPreset=computed(()=>{
  const own=calendarSchedulePreset(route.query),back=calendarBackPreset(route.query)
  if(own&&back)return{error:'课表链接混合了不同返回入口，请重新选择课表范围；没有切换身份或班级。'}
  return back||own
})
function applyQueryPreset(){
  const preset=queryPreset.value
  if(preset && !preset.error){view.value=preset.view;monday.value=preset.monday;selectedDay.value=preset.date;if(Object.hasOwn(preset,'classId')){classId.value=preset.classId;coursePage.value=preset.page}}
}
const labels = {
  STUDENT: '我的课程',
  TEACHER: '任课安排',
  COUNSELOR: '班级考勤',
  SECRETARY: '学院考勤',
}
const focus = computed(() => state.week?.attention || state.week?.next)
const leadership = computed(() => ['COUNSELOR', 'SECRETARY'].includes(state.week?.view))
const displayed = computed(() => state.pagination?.totalPages > 1 ? state.week?.entries || [] : state.week?.entries.filter(e => e.date === selectedDay.value) || [])
const unavailable = computed(() => state.loading || state.stale || noticeBusy.value)
const noticeBusy = ref(false)
const appliedExportScope = ref('')
const exportContext = computed(() => checkedCalendarExportContext({ owner: owner.value, week: state.week, loading: state.loading, stale: state.stale, error: state.error, scopeLoading: scopeState.loading, scopeError: scopeState.error, noticeBusy: noticeBusy.value, confirmed: appliedExportScope.value === JSON.stringify([owner.value,view.value,monday.value,classId.value]), view: view.value, monday: monday.value, classId: classId.value }))
watch(exportContext, value => emit('export-context', value), { immediate: true, flush: 'sync' })
const returnContext = computed(() => {
  if (!exportContext.value || mondayOf(selectedDay.value) !== state.week.monday) return null
  try { return calendarBackQuery({ date: selectedDay.value, view: state.week.view, classId: classId.value, page: coursePage.value }) } catch { return null }
})
const recordUnavailable = computed(() => unavailable.value || !returnContext.value)
const outsideClassOption = computed(() => classId.value && !scopeState.data?.scopes.classes.some(row => row.id === classId.value))
const copyForeground = ref(document.visibilityState !== 'hidden')
// Reuse the verified calendar scope; a URL, retained error snapshot or current page is not authority.
const copyScope = computed(() => copyForeground.value && exportContext.value ? JSON.stringify([exportContext.value, coursePage.value, selectedDay.value, state.week.now]) : '')
function copyVisibilityChanged() { copyForeground.value = document.visibilityState !== 'hidden' }
const summaryContext = computed(() => {
  if (!state.week || !leadership.value || !state.pagination) return null
  const selected = state.week.classes.find(item => item.id === classId.value) || scopeState.data?.scopes.classes.find(item => item.id === classId.value)
  return { owner: owner.value, view: state.week.view, scopeLabel: classId.value ? selected ? `${selected.college} · ${selected.name}` : '指定班级尚未核对' : '全部负责班级', summaryScope: state.pagination.summaryScope, queryKey: JSON.stringify([state.week.view, state.week.monday, classId.value]), disabled: unavailable.value || scopeState.loading || !!scopeState.error || !!classId.value && !selected }
})
const noticeError = ref('')
const changeNotices=ref()
let refreshAfterChange=false
const noticeResource = createUnifiedNoticeReader({
  owner: () => owner.value,
  week: () => state.week,
  read: readTeachingNotices,
  apply: (notices, target) => {
    const changed =
      notices.length !== target.notices.length ||
      notices.some((n) => !target.notices.some((old) => old.id === n.id))
    target.notices = notices
    noticeError.value = ''
    if (changed && !state.loading && !noticeBusy.value) load()
  },
  onError: (failure) => {
    noticeError.value = '提醒暂时没能刷新，可重新读取课表核对。'
    if ([401, 403].includes(failure.response?.status)) {
      resource.reset()
      emit('available', false)
    }
  },
})
let timer,
  noticeTimer,
  disposed = false
async function load() {
  if (!owner.value || disposed) return
  if(queryPreset.value?.error){resource.reset();scopes.reset();scopeState.error=queryPreset.value.error;return}
  if (!scopeState.data) { await loadScopes(); return }
  const principal=owner.value, requestedMonday=monday.value, requestedClass=classId.value
  await resource.load(requestedMonday, view.value, requestedClass, coursePage.value)
  if(disposed||owner.value!==principal)return
  if (state.week) {
    view.value = state.week.view
    if (!state.loading && !state.stale && !state.error && requestedMonday===monday.value && requestedClass===classId.value)
      appliedExportScope.value=JSON.stringify([principal,state.week.view,requestedMonday,requestedClass])
    emit('available', true)
    emit('scope', state.week.view)
  } else if (state.unsupported) emit('available', false)
  if(refreshAfterChange && !state.loading){refreshAfterChange=false;if(state.week)await load()}
}
async function changed({owner:principal}){
  if(disposed||principal!==owner.value)return
  if(state.loading||scopeState.loading){refreshAfterChange=true;return}
  await load()
}
async function openChangedNotice(notice){
  if(state.loading||scopeState.loading||noticeBusy.value)return
  const destination=changeNoticeDestination(notice,scopeState.data?.scopes.views)
  if(!destination){noticeError.value='通知或查看范围已变化，请重新读取课表与通知。';return}
  const principal=owner.value
  try{await router.push(destination)}catch{if(!disposed&&owner.value===principal)noticeError.value='课程入口暂时无法打开，请重新核对；没有提交点名。'}
}
async function loadScopes(page = 0) {
  if (!owner.value || disposed) return
  if(queryPreset.value?.error){resource.reset();scopes.reset();scopeState.error=queryPreset.value.error;return}
  const principal = owner.value
  resource.reset()
  const result = await scopes.load(view.value, page, classSearch.value)
  if (owner.value !== principal || disposed) return
  if (!result) { if (scopeState.unsupported) emit('available', false); return }
  view.value = result.scopes.view
  classFinderVisible.value ||= result.totalPages > 1 || !!classSearch.value
  if (classSearch.value && result.total === 1) {
    classId.value = result.scopes.classes[0].id
    coursePage.value = 0
  }
  emit('scope', view.value)
  // The filter is available even if the first calendar read fails.
  emit('available', true)
  await load()
}
function changeClass() { coursePage.value = 0; load() }
function searchClasses() { classId.value = ''; coursePage.value = 0; loadScopes() }
function stepCourse(delta) { coursePage.value += delta; load() }
function firstCoursePage() { if (!state.loading && !scopeState.loading) { coursePage.value = 0; load() } }
function stepWeek(delta) {
  coursePage.value = 0
  monday.value = addDays(monday.value, delta * 7)
  selectedDay.value = monday.value
  load()
}
function currentWeek() {
  coursePage.value = 0
  monday.value = mondayOf(chinaDate())
  selectedDay.value = chinaDate()
  load()
}
function changeView() {
  classId.value = ''
  coursePage.value = 0
  classSearch.value = ''
  classFinderVisible.value = false
  loadScopes()
}
async function open(entry) {
  if (!entry.lessonId || recordUnavailable.value) return
  await router.push({
    path: '/teaching',
    query: { lesson: entry.lessonId, view: state.week.view, date: entry.date, return: 'timetable', ...returnContext.value },
  })
}
async function openNotice(notice) {
  if (recordUnavailable.value) return
  const principal = owner.value
  const back = returnContext.value
  const sourceQuery = JSON.stringify([view.value, monday.value, classId.value, coursePage.value, selectedDay.value])
  noticeBusy.value = true
  try {
    await markTeachingNoticeRead(notice.id)
  } catch {
    if (owner.value === principal && !disposed) state.error = '通知已读状态未保存，请稍后重试'
    return
  } finally {
    if (owner.value === principal && !disposed) noticeBusy.value = false
  }
  if (owner.value !== principal || disposed || sourceQuery !== JSON.stringify([view.value, monday.value, classId.value, coursePage.value, selectedDay.value])) return
  await router.push({
    path: '/teaching',
    query: {
      lesson: notice.lessonId,
      view: notice.kind === 'TEACHER_ROSTER' ? 'TEACHER' : 'STUDENT',
      date: notice.startsAt.slice(0, 10),
      return: 'timetable',
      ...back,
    },
  })
}
function demoClockChanged() {
  load()
}
watch(
  [owner,()=>route.query.queryView,()=>route.query.queryDate,()=>route.query.back,()=>route.query.backDate,()=>route.query.backView,()=>route.query.backClass,()=>route.query.backPage],
  () => {
    resource.reset()
    scopes.reset()
    noticeResource.reset()
    noticeBusy.value = false
    noticeError.value = ''
    refreshAfterChange=false
    view.value = ''
    classId.value = ''
    coursePage.value = 0
    classSearch.value = ''
    classFinderVisible.value = false
    dateDraft.value = selectedDay.value
    dateError.value = ''
    emit('available', false)
    emit('scope', '')
    applyQueryPreset()
    if (owner.value) load()
  },
  { flush: 'sync' },
)
watch(
  () => personal.schedule?.revision,
  () => {
    if (owner.value) load()
  },
)
onMounted(() => {
  document.addEventListener('visibilitychange', copyVisibilityChanged)
  applyQueryPreset()
  load()
  if (import.meta.env.DEV) window.addEventListener('campthink-demo-clock', demoClockChanged)
  timer = createForegroundPoll({ interval: 300000, run: () => !state.loading && load() })
  noticeTimer = createForegroundPoll({ interval: 60000, run: () => !state.loading && !noticeBusy.value && Promise.all([noticeResource.load(),changeNotices.value?.refresh()]) })
  timer.start(); noticeTimer.start()
})
onBeforeUnmount(() => {
  disposed = true
  document.removeEventListener('visibilitychange', copyVisibilityChanged)
  timer?.stop()
  noticeTimer?.stop()
  window.removeEventListener('campthink-demo-clock', demoClockChanged)
  resource.reset()
  scopes.reset()
  noticeResource.reset()
})
</script>
<template>
  <section class="unified-calendar" aria-label="统一课程安排" :aria-busy="state.loading">
    <p v-if="scopeState.error" class="calendar-error" role="alert">{{ scopeState.error }} <button type="button" @click="loadScopes()">重试班级筛选</button></p>
    <p v-if="scopeState.loading" class="calendar-loading" role="status">正在读取授权范围…</p>
    <p v-if="state.error" class="calendar-error" role="alert">
      {{ state.error }} <button v-if="!state.unsupported" type="button" @click="load">重试</button>
      <button v-if="coursePage > 0 && !state.unsupported" type="button" :disabled="state.loading || scopeState.loading" @click="firstCoursePage">读取该范围第一页</button>
    </p>
    <p v-if="state.loading && !state.week" class="calendar-loading" role="status">
      正在读取课程安排…
    </p>
    <template v-if="scopeState.data">
      <header class="calendar-controls">
        <label v-if="scopeState.data.scopes.views.length > 1"
          >查看<select
            v-model="view"
            aria-label="查看范围"
            :disabled="state.loading || scopeState.loading"
            @change="changeView"
          >
            <option v-for="v in scopeState.data.scopes.views" :key="v" :value="v">{{ labels[v] }}</option>
          </select></label
        >
        <label v-if="scopeState.data.total > 1 || classId || classSearch"
          >班级<select
            v-model="classId"
            aria-label="筛选班级"
            :disabled="state.loading || scopeState.loading"
            @change="changeClass"
          >
            <option value="">全部负责班级</option>
            <option v-if="outsideClassOption" :value="classId">指定班级（不在本页选项中）</option>
            <option v-for="c in scopeState.data.scopes.classes" :key="c.id" :value="c.id">{{ c.college }} · {{ c.name }}</option>
          </select></label
        >
        <span class="calendar-range"
          >{{ monday.slice(5).replace('-', '/') }}—{{
            addDays(monday, 6).slice(5).replace('-', '/')
          }}</span
        >
        <nav aria-label="课表周次">
          <button type="button" :disabled="state.loading" aria-label="上一周" @click="stepWeek(-1)">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12 5-5 5 5 5" /></svg></button
          ><button type="button" :disabled="state.loading" @click="currentWeek">本周</button
          ><button type="button" :disabled="state.loading" aria-label="下一周" @click="stepWeek(1)">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg>
          </button>
        </nav>
      </header>
      <form class="calendar-date-jump" novalidate @submit.prevent="jumpDate">
        <label>查看日期<DateField v-model="dateDraft" aria-label="查看课表日期" :aria-describedby="dateHintId" :aria-invalid="!!dateError" :min="CALENDAR_DATE_MIN" :max="CALENDAR_DATE_MAX" required :disabled="state.loading || scopeState.loading || noticeBusy" @input="dateError = ''"  /></label>
        <button type="submit" :disabled="state.loading || scopeState.loading || noticeBusy">查看</button>
      </form>
      <p :id="dateHintId" class="calendar-date-hint" :class="{ 'calendar-error': dateError }" :role="dateError ? 'alert' : 'status'">{{ dateError || dateHint }}</p>
      <form v-if="classFinderVisible" class="calendar-class-search" @submit.prevent="searchClasses">
        <label>找班级<input v-model="classSearch" maxlength="100" placeholder="班级或学院名称" :disabled="state.loading || scopeState.loading" /></label>
        <button type="submit" :disabled="state.loading || scopeState.loading">搜索</button>
        <span>第{{ scopeState.data.page + 1 }}页 · {{ scopeState.data.total }}个匹配班级</span>
        <button type="button" :disabled="scopeState.data.page === 0 || state.loading || scopeState.loading" @click="classId = ''; loadScopes(scopeState.data.page - 1)">上一页班级</button>
        <button type="button" :disabled="scopeState.data.page + 1 >= scopeState.data.totalPages || state.loading || scopeState.loading" @click="classId = ''; loadScopes(scopeState.data.page + 1)">下一页班级</button>
      </form>
      <p v-if="classSearch && scopeState.data.total === 0" class="calendar-footnote" role="status">没有匹配的授权班级。请更换关键词；当前课程范围仍为全部负责班级。</p>
    </template>
    <template v-if="state.week">
      <TeachingChangeNotices v-if="state.week.teachingEnabled && ['STUDENT','TEACHER'].includes(state.week.view)" ref="changeNotices" :owner="owner" :disabled="state.loading||scopeState.loading||noticeBusy" @open="openChangedNotice" @new-change="changed" />
      <nav v-if="state.pagination?.totalPages > 1" class="calendar-pagination" aria-label="课程明细分页">
        <span>第{{ state.pagination.page + 1 }} / {{ state.pagination.totalPages }}页 · 共{{ state.pagination.total }}项安排</span>
        <button type="button" :disabled="state.loading || state.pagination.page === 0" @click="stepCourse(-1)">上一页</button>
        <button type="button" :disabled="state.loading || state.pagination.page + 1 >= state.pagination.totalPages" @click="stepCourse(1)">下一页</button>
      </nav>
      <p v-if="state.pagination" class="calendar-footnote">统计：{{ state.pagination.summaryScope }}</p>
      <p v-if="state.stale" class="calendar-footnote" role="status">
        {{
          state.loading
            ? '正在刷新，保留上次读取的安排…'
            : '暂时显示上次读取的安排；重新读取成功后可打开记录。'
        }}
      </p>
      <div
        v-if="state.week.notices.some((n) => !n.readAt)"
        class="calendar-notices"
        aria-label="未读课前通知"
      >
        <button
          v-for="notice in state.week.notices.filter((n) => !n.readAt)"
          :key="notice.id"
          type="button"
          :disabled="recordUnavailable"
          @click="openNotice(notice)"
        >
          <strong>{{ notice.kind === 'TEACHER_ROSTER' ? '名单已备好' : '下节课提醒' }}</strong
          ><span>{{ notice.course }} · {{ notice.room }}</span
          ><small>打开记录并标为已读</small>
        </button>
      </div>
      <section v-if="focus" class="calendar-focus" aria-label="当前需要关注的课程">
        <div>
          <h2>{{ focus.name }}</h2>
          <p class="calendar-focus-state">{{ state.week.focusLabel }}</p>
          <p>
            {{ focus.date.slice(5).replace('-', '/') }} · {{ focus.timeLabel }} ·
            {{ focus.room || '教室未填写' }}
          </p>
          <p v-if="focus.teacher">
            任课教师 {{ focus.teacher }}<span v-if="focus.className"> · {{ focus.className }}</span>
          </p>
        </div>
        <button
          v-if="focus.lessonId"
          class="calendar-primary"
          type="button"
          :disabled="recordUnavailable"
          @click="open(focus)"
        >
          {{ state.week.view === 'TEACHER' ? (focus.canMark ? '去点名' : '查看名单') : '查看记录' }}
        </button>
      </section>
      <p v-else-if="['STUDENT','TEACHER'].includes(state.week.view) && (!state.pagination || state.pagination.totalPages <= 1)" class="calendar-no-next">当前已保存安排中没有下一节。临时调课请核对教务通知。</p>
      <AttendanceCockpit v-if="leadership" :counts="state.week.summary.attendance"
        :planned="state.week.summary.plannedClasses" :absent-students="state.week.summary.absentStudents"
        :from="state.week.monday" :to="state.week.sunday" :stale="state.stale" :summary-context="summaryContext">
        <template #action>
          <RouterLink v-if="!unavailable" :to="{ path: '/teaching', query: { view: state.week.view, tool: 'evidence', from: state.week.monday, to: state.week.sunday, classId: classId || undefined } }">核对记录与导出</RouterLink>
        </template>
      </AttendanceCockpit>
      <div v-else class="calendar-totals" aria-label="后台计算的本周结果">
        <span
          >本周 <strong>{{ state.week.summary.plannedClasses }}</strong
          >项安排</span
        ><span :class="{ 'calendar-pending': state.week.summary.attendance.unknown > 0 }"
          >待点名 <strong>{{ state.week.summary.attendance.unknown }}</strong
          >{{ state.week.view === 'STUDENT' ? '次' : '人次' }}</span
        ><span v-if="state.week.view !== 'STUDENT'" :class="{ 'calendar-recorded-absence': state.week.summary.absentStudents > 0 }"
          >已记录旷课 <strong>{{ state.week.summary.absentStudents }}</strong
          >人</span
        ><span :class="{ 'calendar-pending': state.week.summary.attendance.late > 0 }"
          >已记录迟到 <strong>{{ state.week.summary.attendance.late }}</strong
          >人次</span
        ><span :class="{ 'calendar-pending': state.week.summary.attendance.earlyLeave > 0 }">早退 <strong>{{ state.week.summary.attendance.earlyLeave || 0 }}</strong>人次</span
        ><span v-if="state.week.summary.conflicts" class="calendar-warning"
          >{{ state.week.summary.conflicts }}项时间冲突待核对</span
        ><small v-if="state.week.summary.mergedDuplicates"
          >已合并{{ state.week.summary.mergedDuplicates }}项重复，原件未改</small
        >
      </div>
      <h2 v-if="leadership" class="leadership-records-heading">课程明细</h2>
      <div v-if="!state.pagination || state.pagination.totalPages <= 1" class="calendar-day-tabs" role="group" aria-label="选择上课日期">
        <button
          v-for="(day, i) in days"
          :key="day"
          type="button"
          :aria-pressed="selectedDay === addDays(monday, i)"
          @click="selectedDay = addDays(monday, i)"
        >
          <strong>{{ addDays(monday, i) === state.week.today ? '今天' : '周' + day }}</strong
          ><span>{{ addDays(monday, i).slice(5).replace('-', '/') }}</span>
        </button>
      </div>
      <ul class="calendar-day-list">
        <li v-for="entry in displayed" :key="entry.id" :class="{ cancelled: entry.cancelled }">
          <time><small v-if="state.pagination?.totalPages > 1">{{ entry.date.slice(5).replace('-', '/') }} · 周{{ days[entry.weekday - 1] }}</small>{{ entry.timeLabel }}</time>
          <div>
            <strong>{{ entry.name }}</strong>
            <p>
              {{ entry.room || '教室未填写'
              }}<span v-if="entry.teacher"> · {{ entry.teacher }}</span
              ><span v-if="entry.className"> · {{ entry.className }}</span>
            </p>
            <small
              >{{ entry.sources.includes('TEACHING') ? '教学安排' : '个人导入'
              }}{{ entry.sources.length > 1 ? ' · 已与个人导入合并' : ''
              }}<span v-if="entry.conflict"> · 时间冲突</span
              ><span v-if="entry.cancelled"> · {{ entry.sources.includes('TEACHING')?'已取消':'学籍变动后待核对' }}</span></small
            >
            <CourseEntryCopy :entry="entry" :scope="copyScope" :as-of="state.week.now" />
          </div>
          <span v-if="entry.attendance" class="calendar-attendance" :data-status="entry.attendance">{{
            ATTENDANCE_STATUSES[entry.attendance]
          }}</span
          ><button
            v-if="entry.lessonId && !entry.cancelled"
            type="button"
            :disabled="recordUnavailable"
            @click="open(entry)"
          >
            {{ state.week.view === 'TEACHER' ? (entry.canMark ? '点名' : '名单') : '记录' }}
          </button>
        </li>
      </ul>
      <p v-if="!displayed.length" class="calendar-empty">
        这天没有已保存的安排。不代表学校停课，可核对教务或导入课表。
      </p>
      <button
        v-if="state.week.gridSafe"
        type="button"
        class="calendar-week-toggle"
        :aria-expanded="showWeek"
        @click="showWeek = !showWeek"
      >
        {{ showWeek ? '收起周课表' : '展开整周课表' }}
      </button>
      <p v-else-if="state.week.entries.length" class="calendar-footnote">
        {{ state.pagination?.totalPages > 1 || ['COUNSELOR','SECRETARY'].includes(state.week.view) ? '课程明细按日期逐条展示；上方统计覆盖全部筛选范围。' : '同一节次有多个安排或作息未配置，按日期逐条展示，不叠盖课程。' }}
      </p>
      <div
        v-if="showWeek && state.week.gridSafe"
        class="calendar-grid-scroll"
        tabindex="0"
        role="region"
        aria-label="整周课表，可横向滚动"
      >
        <div class="calendar-grid">
          <span class="grid-corner">节次</span
          ><strong
            v-for="(day, i) in days"
            :key="day"
            class="grid-day"
            :style="{ gridColumn: i + 2, gridRow: 1 }"
            >周{{ day }}</strong
          ><template v-for="slot in state.week.bells" :key="slot.period"
            ><span class="grid-time" :style="{ gridColumn: 1, gridRow: slot.period + 1 }"
              ><b>{{ slot.period }}</b
              >{{ slot.start }}<br />{{ slot.end }}</span
            ><span
              v-for="day in 7"
              :key="day"
              class="grid-cell"
              :style="{ gridColumn: day + 1, gridRow: slot.period + 1 }" /></template
          ><button
            v-for="entry in state.week.entries.filter(
              (e) => !e.cancelled && e.startPeriod >= 1 && e.endPeriod <= state.week.bells.length,
            )"
            :key="entry.id"
            type="button"
            class="grid-course"
            :disabled="unavailable"
            :style="{
              gridColumn: entry.weekday + 1,
              gridRow: `${entry.startPeriod + 1} / span ${entry.endPeriod - entry.startPeriod + 1}`,
            }"
            :aria-label="`${entry.date} ${entry.name} ${entry.timeLabel} ${entry.room}`"
            @click="entry.lessonId ? open(entry) : (selectedDay = entry.date)"
          >
            <strong>{{ entry.name }}</strong
            ><span>{{ entry.room }}</span
            ><small>{{ entry.teacher }}</small>
          </button>
        </div>
        <p class="calendar-footnote">不在已配置节次内的钟点课程仍保留在每日列表，没有删掉。</p>
      </div>
      <details v-if="state.week.warnings.length" class="calendar-explanations">
        <summary>{{ state.week.warnings.length }}条安排需要核对</summary>
        <p v-for="warning in state.week.warnings" :key="warning">{{ warning }}</p>
      </details>
      <p class="calendar-footnote">
        {{ state.week.clockSource }}。来自本人导入及授权教学安排，不是实时教务同步。
      </p>
      <p v-if="noticeError" class="calendar-footnote" role="status">
        {{ noticeError
        }}<button type="button" :disabled="state.loading" @click="load">重新读取</button>
      </p>
    </template>
  </section>
</template>
<style scoped>
.leadership-records-heading { margin: 30px 0 16px; font-size: 20px; font-weight: 600; letter-spacing: -.025em; }
.unified-calendar {
  color: var(--assistant-ink, #29323c);
  font-size: 16px;
  line-height: 1.65;
}
.calendar-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.calendar-date-jump { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 8px; margin: 0 0 6px; }
.calendar-date-jump label { display: grid; gap: 6px; color: var(--assistant-muted, #5d6876); font-size: 14px; line-height: 1.6; }
.calendar-date-jump input { min-width: 0; width: 190px; min-height: 44px; box-sizing: border-box; padding: 8px 12px; border: 1px solid var(--assistant-line, #e2e7ec); border-radius: 12px; background: var(--assistant-surface, #fff); color: var(--assistant-ink, #29323c); font: inherit; font-size: 16px; font-variant-numeric: tabular-nums; caret-color: var(--assistant-accent, #0b62db); color-scheme: light; }
.calendar-date-jump input:disabled { opacity: .6; cursor: not-allowed; }
.calendar-date-jump input[aria-invalid='true'] { border-color: var(--assistant-danger, #a43e42); }
.calendar-date-hint { margin: 6px 0 20px; color: var(--assistant-muted, #5d6876); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.calendar-date-hint.calendar-error { color: var(--assistant-danger, #a43e42); }
.calendar-controls label {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.calendar-controls select { max-width: min(400px, 60vw); }
.calendar-class-search, .calendar-pagination {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  margin: 12px 0 20px;
}
.calendar-class-search label { display: flex; align-items: center; gap: 8px; }
.calendar-class-search input {
  min-width: 0;
  width: min(260px, 48vw);
  min-height: 44px;
  border: 1px solid var(--assistant-line, #e2e7ec);
  border-radius: 10px;
  padding: 8px 12px;
  font: inherit;
  color: inherit;
  background: var(--assistant-surface, #fff);
}
.calendar-pagination span { margin-right: auto; }
.calendar-day-list time small { display: block; margin-bottom: 3px; }
.calendar-pending, .calendar-attendance:is([data-status='UNKNOWN'], [data-status='LATE'],[data-status='EARLY_LEAVE']) {
  color: var(--assistant-warning, #8b5e14);
  background: var(--assistant-warning-soft, #fff4d9);
}
.calendar-recorded-absence, .calendar-attendance[data-status='ABSENT'] {
  color: var(--assistant-danger, #a43e42);
  background: var(--assistant-danger-soft, #fdeced);
}
.calendar-attendance[data-status='ON_TIME'] {
  color: var(--assistant-success, #216b4c);
  background: var(--assistant-success-soft, #eaf6ef);
}
.calendar-totals :is(.calendar-pending, .calendar-recorded-absence), .calendar-attendance {
  padding: 5px 9px;
  border-radius: 8px;
}
.calendar-totals :is(.calendar-pending, .calendar-recorded-absence) strong { color: inherit; }
.calendar-controls select,
button {
  font: inherit;
  color: inherit;
  min-height: 44px;
  border: 1px solid var(--assistant-line, #e2e7ec);
  background: #fff;
  border-radius: 12px;
  padding: 9px 13px;
}
button {
  cursor: pointer;
  transition: background-color 180ms ease-out;
}
button:hover:not(:disabled) {
  background: var(--assistant-soft, #eaf0f6);
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.calendar-range {
  color: var(--assistant-muted, #5d6876);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}
nav {
  display: flex;
  gap: 4px;
}
nav svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  display: block;
}
.calendar-focus {
  display: flex;
  align-items: center;
  gap: 24px;
  justify-content: space-between;
  padding: 24px;
  border:0;
  background:var(--assistant-soft,#eaf2ff);
  border-radius:16px;
}
.calendar-focus > div > span {
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
}
h2 {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.025em;
  margin: 8px 0 10px;
}
.calendar-focus p {
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
  margin: 4px 0;
}
.calendar-primary {
  background: var(--assistant-accent, #536f90);
  border-color: transparent;
  color: #fff;
  white-space: nowrap;
  font-weight: 500;
}
.calendar-primary:hover:not(:disabled) {
  background: var(--assistant-accent-hover, #405b7b);
}
.calendar-totals {
  display: flex;
  gap: 20px;
  align-items: baseline;
  flex-wrap: wrap;
  padding: 20px 0;
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
}
.calendar-totals strong {
  font-weight: 600;
  color: var(--assistant-ink, #29323c);
  font-variant-numeric: tabular-nums;
  margin: 0 4px;
}
.calendar-totals small {
  margin-left: auto;
}
.calendar-warning,
.calendar-error {
  color: #a24439;
}
.calendar-day-tabs {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  margin: 8px 0 20px;
}
.calendar-day-tabs button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 2px;
  border: 0;
  background: transparent;
  font-size: 13px;
}
.calendar-day-tabs strong {
  font-weight: 500;
}
.calendar-day-tabs span {
  font-size: 12px;
  color: var(--assistant-muted, #5d6876);
}
.calendar-day-tabs button[aria-pressed='true'] {
  background: var(--assistant-soft, #eaf0f6);
  color: var(--assistant-accent, #536f90);
}
.calendar-day-list {
  padding: 0;
  margin: 0;
  list-style: none;
}
.calendar-day-list li {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px 0;
  border-bottom: 1px solid var(--assistant-line, #e2e7ec);
}
.calendar-day-list time {
  width: 132px;
  flex: none;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: var(--assistant-muted, #5d6876);
}
.calendar-day-list li > div {
  flex: 1;
  min-width: 0;
}
.calendar-day-list strong {
  font-size: 17px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.calendar-day-list p {
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
  margin: 5px 0;
}
.calendar-day-list small {
  font-size: 12px;
  color: var(--assistant-muted, #5d6876);
}
.calendar-attendance {
  font-size: 13px;
  color: var(--assistant-accent, #536f90);
  white-space: nowrap;
}
.cancelled > div > strong {
  text-decoration: line-through;
}
.calendar-no-next,
.calendar-empty,
.calendar-loading {
  padding: 24px 0;
  color: var(--assistant-muted, #5d6876);
  font-size: 14px;
}
.calendar-week-toggle {
  border: 0;
  background: transparent;
  color: var(--assistant-accent, #536f90);
  margin-top: 16px;
}
.calendar-explanations {
  font-size: 13px;
  margin: 20px 0;
  color: var(--assistant-muted, #5d6876);
}
summary {
  min-height: 44px;
  align-content: center;
  cursor: pointer;
}
.calendar-footnote {
  font-size: 12px;
  line-height: 1.8;
  color: var(--assistant-muted, #5d6876);
  margin-top: 24px;
}
.calendar-grid-scroll {
  overflow-x: auto;
  margin-top: 14px;
  scrollbar-color: var(--assistant-accent, #536f90) transparent;
}
.calendar-grid {
  display: grid;
  grid-template-columns: 72px repeat(7, minmax(110px, 1fr));
  grid-template-rows: 44px repeat(8, minmax(74px, auto));
  min-width: 850px;
}
.grid-corner,
.grid-day,
.grid-time {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--assistant-muted, #5d6876);
}
.grid-time {
  flex-direction: column;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  line-height: 1.4;
}
.grid-time b {
  font-size: 13px;
  margin-bottom: 3px;
}
.grid-cell {
  border-top: 1px solid var(--assistant-line, #e2e7ec);
  border-left: 1px solid var(--assistant-line, #e2e7ec);
}
.grid-course {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
  margin: 4px;
  padding: 8px;
  border: 0;
  background: var(--assistant-soft, #eaf0f6);
  overflow-wrap: anywhere;
}
.grid-course strong {
  font-size: 13px;
  font-weight: 500;
}
.grid-course span,
.grid-course small {
  font-size: 12px;
  color: var(--assistant-muted, #5d6876);
}
:focus-visible {
  outline: 2px solid var(--assistant-accent, #536f90);
  outline-offset: 3px;
}
::selection {
  background: var(--assistant-soft, #eaf0f6);
  color: var(--assistant-ink, #29323c);
}
@media (max-width: 760px) {
  .calendar-controls {
    gap: 8px;
  }
  .calendar-range {
    margin-left: 0;
    font-size: 13px;
  }
  .calendar-controls nav {
    margin-left: auto;
  }
  .calendar-focus {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
    padding-top: 8px;
  }
  h2 {
    font-size: 24px;
  }
  .calendar-primary {
    width: 100%;
  }
  .calendar-totals {
    gap: 10px 16px;
  }
  .calendar-totals small {
    flex-basis: 100%;
    margin: 0;
  }
  .calendar-day-list li {
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 18px 0;
  }
  .calendar-day-list time {
    width: 100%;
    font-size: 13px;
  }
  .calendar-day-list li > button {
    min-width: 64px;
  }
  .calendar-day-tabs {
    gap: 2px;
  }
  .calendar-day-tabs strong {
    font-size: 12px;
  }
  .calendar-day-tabs span {
    font-size: 11px;
  }
  .calendar-grid {
    min-width: 850px;
  }
}
@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
}
.calendar-notices {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.calendar-notices button {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  background: var(--assistant-soft, #eaf0f6);
  border: 0;
  max-width: 100%;
}
.calendar-notices strong {
  font-size: 14px;
  font-weight: 500;
}
.calendar-notices span,
.calendar-notices small {
  font-size: 12px;
  color: var(--assistant-muted, #5d6876);
}
@media (max-width: 760px) {
  .calendar-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px 12px;
  }
  .calendar-controls .calendar-range {
    grid-column: 1;
    grid-row: 1;
    align-self: center;
  }
  .calendar-controls nav {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }
  .calendar-controls label {
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .calendar-controls select {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    padding-inline: 10px;
  }
  .calendar-controls nav button {
    padding-inline: 12px;
  }
}
</style>
