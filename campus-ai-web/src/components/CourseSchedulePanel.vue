<script setup>
import DateField from '@/components/DateField.vue'
import NavigationIcon from './NavigationIcon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCourseScheduleStore } from '@/stores/courseSchedule'
import {
  saveCourseSchedule,
  confirmCourseSchedule,
  deleteCourseSchedule,
  readCourseSchedule,
} from '@/api/courseSchedule'
import {
  COURSE_TEMPLATE,
  PERIOD_TEMPLATE,
  isPeriodCourse,
  courseTimeLabel,
  courseConflicts,
  weekCourses,
  nextImportedCourse,
  validateCourseMetadata,
  courseKey,
} from '@/utils/courseSchedule'
import { addDays, chinaDate, dayNumber, defaultSemester } from '@/utils/timetable'
import CourseWeekGrid from './CourseWeekGrid.vue'
import PersonalScheduleOperations from './PersonalScheduleOperations.vue'
import SchoolTimetableGuide from './SchoolTimetableGuide.vue'
import CourseImageImport from './CourseImageImport.vue'
import { parseCourseText, coursesToCsv, describeCourseChanges } from '@/utils/courseImport'
import { readCourseUpload } from '@/utils/courseUpload'
import { useTimetableClock } from '@/utils/useTimetableClock'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { takeCourseFile } from '@/utils/courseFile'
import { captureDraftFields, hasDraftFieldChanges } from '@/utils/formDraft'
import { createPrivateCourseExport, privateCourseReadState } from '@/utils/privateCourseExport'
import { captureAuditFocusIntent as captureExportFocusIntent } from '@/utils/teachingAdministrativeAudit'
import { focusWorkflowElement, cancelWorkflowFocus } from '@/utils/teachingWorkflows'

const props = defineProps({ manageOnly: { type: Boolean, default: false }, layoutReady: { type: String, default: 'ready' }, exportRequested: { type: Boolean, default: false }, manageRequested: { type: Boolean, default: false } })

const store = useCourseScheduleStore(),
  clock = useTimetableClock()
const editing = ref(false),
  importMode = ref('image'),
  operationsBusy = ref(false), operationsDirty = ref(false),
  operationsPanel = ref(),
  raw = ref(''),
  preview = ref(null),
  busy = ref(false),
  reading = ref(false),
  imageBusy = ref(false), imagePending = ref(false),
  error = ref(''),
  versionConflict = ref(false),
  notice = ref(''),
  confirmed = ref(false),
  selectedWeek = ref(1),
  heading = ref(),
  fileError = ref(),
  fileLabel = ref(''),
  fileNotice = ref(''),
  importHeading = ref(), emptyHeading = ref(), previewTarget = ref()
const form = reactive({ semester: defaultSemester(), firstMonday: '', remindDays: 7 })
const exportState = reactive({ busy: false, preview: null, error: '', notice: '' })
const courseRoot = ref(), readErrorTarget = ref(), exportNotice = ref(), exportTarget = ref(), exportStart = ref(), exportPreview = ref(), exportFeedback = ref()
const draftFields = ['semester', 'firstMonday', 'remindDays']
const draftBaseline = ref(captureDraftFields(form, draftFields))
const dirty = computed(
    () => editing.value && (!!raw.value.trim() || imagePending.value || hasDraftFieldChanges(form, draftBaseline.value)),
  ),
  baseUnavailable = computed(() => busy.value || reading.value || confirming.value || exportState.busy || operationsBusy.value),
  unavailable = computed(() => baseUnavailable.value || imageBusy.value)
async function openOperations(){if(unavailable.value||editing.value)return;await operationsPanel.value?.openPanel()}
async function openTeacherEditing(){if(unavailable.value||editing.value||operationsDirty.value)return;await operationsPanel.value?.openPanel({operation:'BATCH',missingTeachersOnly:true,firstMonday:store.schedule?.firstMonday})}
const filledTeachers=computed(()=>store.schedule?.courses.filter(course=>course.teacher?.trim()).length||0)
defineExpose({ dirty:computed(()=>dirty.value||operationsDirty.value), importing:editing, unavailable, openImport, openExport, openManagement, openOperations })
useUnsavedChanges(
  () => dirty.value || operationsDirty.value,
  () => unavailable.value,
)
let disposed = false,
  fileGeneration = 0,
  fileRead = null
const { confirming, confirm } = useScopedConfirmation(
  () => (store.principal ? `${store.principal}:${fileGeneration}` : null),
  () => !disposed,
)
const privateExport = createPrivateCourseExport({
  owner: () => store.principal,
  active: () => !disposed && !busy.value && !reading.value && !confirming.value && !editing.value,
  state: exportState, read: readCourseSchedule,
  onFile: (blob, filename) => download(blob, filename, blob.type),
})
let exportFocusIntent, navigationFocusIntent
function resetPrivateExport() { exportFocusIntent?.dispose(); privateExport.reset() }
function cancelExportNavigation() {
  navigationFocusIntent?.dispose()
  for (const target of [exportStart.value, exportNotice.value, importHeading.value, readErrorTarget.value, heading.value, emptyHeading.value]) cancelWorkflowFocus(target)
}
async function openManagement(force = false) {
  const owner=store.principal,generation=fileGeneration
  cancelExportNavigation()
  const intent=captureExportFocusIntent(courseRoot.value?.closest('.workspace-page') || courseRoot.value)
  navigationFocusIntent=intent
  try {
    await store.load(force)
    if(disposed || !owner || owner!==store.principal || generation!==fileGeneration || !intent.current())return
    notice.value=store.error?'':'这里只管理本人导入副本。更新请上传新表并比较差异后确认；删除整份副本需在下方另行确认，不会改正式教学安排。'
    await nextTick()
    if(disposed || owner!==store.principal || generation!==fileGeneration || !intent.current())return
    const target=store.error?readErrorTarget.value:editing.value?importHeading.value:store.schedule?heading.value:emptyHeading.value
    focusWorkflowElement(target,()=>!disposed && owner===store.principal && generation===fileGeneration && props.manageRequested)
  } finally { intent.dispose() }
}
async function exportStep(method) {
  exportFocusIntent?.dispose()
  const intent = captureExportFocusIntent(courseRoot.value?.closest('.workspace-page') || courseRoot.value), owner = store.principal, generation = fileGeneration
  exportFocusIntent = intent
  await privateExport[method]()
  await nextTick()
  if (!disposed && owner === store.principal && generation === fileGeneration && intent.current()) {
    const target = exportState.preview ? exportPreview.value : exportFeedback.value
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }
  intent.dispose()
}
async function openExport(force = false) {
  const owner = store.principal, generation = fileGeneration
  cancelExportNavigation()
  const intent = captureExportFocusIntent(courseRoot.value?.closest('.workspace-page') || courseRoot.value)
  navigationFocusIntent = intent
  try {
    await store.load(force)
    if (disposed || !owner || owner !== store.principal || generation !== fileGeneration || !intent.current()) return
    const outcome = privateCourseReadState(store)
    if (outcome === 'error' || outcome === 'waiting') notice.value = ''
    else if (outcome === 'empty') notice.value = '当前账号没有已保存的个人课表，不能导出；可先导入并确认保存。'
    else if (editing.value) notice.value = '请先完成或取消当前导入；未保存草稿不会混入导出文件。'
    await nextTick()
    if (disposed || owner !== store.principal || generation !== fileGeneration || !intent.current()) return
    const target = outcome === 'error' || outcome === 'waiting' ? readErrorTarget.value : outcome === 'empty' ? exportNotice.value : editing.value ? importHeading.value : exportStart.value
    if (target) focusWorkflowElement(target, () => !disposed && owner === store.principal && generation === fileGeneration && props.exportRequested)
  } finally { intent.dispose() }
}
watch(editing, resetPrivateExport, { flush: 'sync' })
watch(() => store.schedule, resetPrivateExport, { flush: 'sync' })
watch(() => props.exportRequested, value => { if (!value) cancelExportNavigation() }, { flush: 'sync' })
watch(() => props.manageRequested, value => { if (!value) cancelExportNavigation() }, { flush: 'sync' })
const currentWeek = computed(() =>
  store.schedule
    ? Math.floor((dayNumber(chinaDate(clock.value)) - dayNumber(store.schedule.firstMonday)) / 7) +
      1
    : null,
)
const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const displayed = computed(() => weekCourses(store.schedule, Number(selectedWeek.value)))
const gridCourses = computed(() => displayed.value.filter(isPeriodCourse))
const weekMonday = computed(() =>
  store.schedule ? addDays(store.schedule.firstMonday, (Number(selectedWeek.value) - 1) * 7) : '',
)
const periodGridSafe = computed(
  () => gridCourses.value.length && !courseConflicts(gridCourses.value).length,
)
const nextCourse = computed(() => nextImportedCourse(store.schedule, clock.value))
const conflicts = computed(() => courseConflicts(displayed.value))
const difference = computed(() =>
  describeCourseChanges(store.schedule?.courses || [], preview.value?.courses || []),
)
const metadataChange = computed(
  () =>
    store.schedule &&
    (form.semester.trim() !== store.schedule.semester ||
      form.firstMonday !== store.schedule.firstMonday ||
      Number(form.remindDays) !== store.schedule.remindDays),
)
const checkMessage = computed(() => {
  if (!store.schedule) return ''
  const schedule = store.schedule,
    checked = new Date(schedule.checkedAt),
    age = Number.isFinite(checked.getTime())
      ? Math.max(0, dayNumber(chinaDate(clock.value)) - dayNumber(chinaDate(checked)))
      : null
  if (currentWeek.value < 1 || currentWeek.value > 30)
    return '日期不在这份表格的学期范围内，请核对学期和第1周日期'
  if (!weekCourses(schedule, currentWeek.value).length)
    return `第${currentWeek.value}周没有导入的课程，不代表这周停课，请核对教务`
  if (schedule.remindDays && (age === null || age >= schedule.remindDays))
    return `已${age ?? '多'}天未核对，请查看学校或老师通知；个人副本不自动同步教务变更`
  return '按你导入的表格展示，临时调课仍需核对教务或老师通知'
})
const dateLabel = (value) =>
  new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
function invalidatePreview() {
  preview.value = null
  confirmed.value = false
  notice.value = ''
  fileNotice.value = ''
}
async function openImport() {
  if (!editing.value) { await startImport(); return }
  await nextTick()
  importHeading.value?.focus({ preventScroll: true })
  importHeading.value?.scrollIntoView({ block: 'start', behavior: 'auto' })
}
watch(raw, () => {
  if (editing.value) invalidatePreview()
  if (!reading.value) fileLabel.value = ''
})
watch([() => form.semester, () => form.firstMonday, () => form.remindDays], () => {
  confirmed.value = false
})
watch(
  () => store.principal,
  () => {
    cancelExportNavigation()
    resetPrivateExport()
    fileGeneration++
    fileRead?.abort()
    fileRead = null
    editing.value = false
    raw.value = ''
    preview.value = null
    busy.value = false
    reading.value = false
    imageBusy.value = false
    imagePending.value = false
    error.value = ''
    versionConflict.value = false
    notice.value = ''
    confirmed.value = false
    fileLabel.value = ''
    fileNotice.value = ''
    Object.assign(form, { semester: defaultSemester(), firstMonday: '', remindDays: 7 })
    draftBaseline.value = captureDraftFields(form, draftFields)
  },
  { flush: 'sync' },
)
watch(
  () => store.schedule,
  () => {
    selectedWeek.value = Math.min(30, Math.max(1, currentWeek.value || 1))
  },
  { immediate: true },
)
async function startImport(fromAction = true) {
  if(operationsDirty.value||unavailable.value){notice.value='请先完成或收起当前个人安排草稿，再导入新表；没有覆盖草稿。';return}
  if (fromAction !== false) cancelExportNavigation()
  const owner = store.principal,
    generation = fileGeneration
  editing.value = true
  error.value = ''
  versionConflict.value = false
  notice.value = ''
  preview.value = null
  confirmed.value = false
  raw.value = ''
  fileLabel.value = ''
  fileNotice.value = ''
  Object.assign(form, {
    semester: store.schedule?.semester || defaultSemester(),
    firstMonday: store.schedule?.firstMonday || '',
    remindDays: store.schedule?.remindDays ?? 7,
  })
  draftBaseline.value = captureDraftFields(form, draftFields)
  if (fromAction === false) return
  await nextTick()
  if (disposed || generation !== fileGeneration || owner !== store.principal) return
  importHeading.value?.focus({ preventScroll: true })
  importHeading.value?.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}
async function cancel() {
  if (unavailable.value) return
  if (
    dirty.value &&
    !(await confirm('本次选图及未保存的表格、学期、日期和提醒设置会被放弃，已保存的课表不会改变', {
      title: '放弃这次导入？',
      confirmText: '放弃未保存内容',
      cancelText: '继续编辑',
    }))
  )
    return
  fileGeneration++
  editing.value = false
  raw.value = ''
  preview.value = null
  confirmed.value = false
  error.value = ''
}
function inspect() {
  error.value = ''
  preview.value = null
  confirmed.value = false
  try {
    const result = parseCourseText(raw.value)
    if (result.metadata?.semester) form.semester = result.metadata.semester
    if (result.metadata?.firstMonday) form.firstMonday = result.metadata.firstMonday
    preview.value = { ...result, revision: store.schedule?.revision || 0 }
    fileNotice.value = `已解析${result.courses.length}条课程；请核对学期、日期和下方差异，尚未保存`
  } catch (failure) {
    error.value = failure.message
  }
}
async function chooseFile(event) {
  const file = takeCourseFile(event.target)
  if (!file || disposed || unavailable.value || !store.principal) return
  const generation = ++fileGeneration,
    owner = store.principal
  fileRead?.abort()
  const controller = new AbortController()
  fileRead = controller
  invalidatePreview()
  error.value = ''
  reading.value = true
  fileLabel.value = file.name
  fileNotice.value = '正在本机解析…'
  try {
    const result = await readCourseUpload(file, { signal: controller.signal })
    if (disposed || generation !== fileGeneration || owner !== store.principal) return
    if (result.metadata?.semester) form.semester = result.metadata.semester
    if (result.metadata?.firstMonday) form.firstMonday = result.metadata.firstMonday
    raw.value =
      coursesToCsv(result.courses) ||
      JSON.stringify({
        semester: form.semester,
        firstMonday: form.firstMonday,
        courses: result.courses,
      })
    await nextTick()
    if (disposed || generation !== fileGeneration || owner !== store.principal) return
    preview.value = { ...result, revision: store.schedule?.revision || 0 }
    fileNotice.value = `已在本机解析${result.courses.length}条课程；下方可核对差异，尚未保存`
  } catch (failure) {
    if (
      !disposed &&
      generation === fileGeneration &&
      owner === store.principal &&
      failure.name !== 'AbortError'
    ) {
      error.value = `${failure.message}。当前填写和已保存课表没有改变，可重选文件或继续粘贴`
      fileNotice.value = '此文件未能解析，未生成新预览；之前的填写与已保存课表保持不变'
    }
  } finally {
    if (fileRead === controller) fileRead = null
    if (!disposed && generation === fileGeneration && owner === store.principal) {
      reading.value = false
      if (error.value) {
        await nextTick()
        if (!disposed && generation === fileGeneration && owner === store.principal)
          fileError.value?.focus({ preventScroll: false })
      }
    }
  }
}
async function adoptCourseImage(result) {
  if(disposed||unavailable.value||result.owner!==store.principal)return
  const owner=store.principal,generation=++fileGeneration
  fileRead?.abort();fileRead=null;invalidatePreview();error.value=''
  if(result.metadata.semester)form.semester=result.metadata.semester
  if(result.metadata.firstMonday)form.firstMonday=result.metadata.firstMonday
  raw.value=coursesToCsv(result.courses)||JSON.stringify({semester:form.semester,firstMonday:form.firstMonday,courses:result.courses})
  await nextTick()
  if(disposed||owner!==store.principal||generation!==fileGeneration)return
  preview.value={courses:result.courses,metadata:result.metadata,warnings:result.warnings,conflicts:result.conflicts,duplicates:result.duplicates,source:result.source,revision:store.schedule?.revision||0}
  fileLabel.value='本人核对后的图片识别结果';fileNotice.value=`待保存${result.courses.length}条课程；请核对学期、第1周日期和下方新增/移除差异，尚未保存`
  result.onApplied()
  await nextTick()
  if(!disposed&&owner===store.principal&&generation===fileGeneration){previewTarget.value?.focus({preventScroll:true});previewTarget.value?.scrollIntoView({block:'start',behavior:'auto'})}
}
async function save() {
  if(imagePending.value){notice.value='请先采用或清除上方图片识别候选，再保存课程；现有课表没有改变';return}
  if (
    unavailable.value ||
    versionConflict.value ||
    !preview.value ||
    !confirmed.value ||
    !store.loaded ||
    store.error
  )
    return
  const owner = store.principal,
    proposal = preview.value,
    generation = fileGeneration
  busy.value = true
  error.value = ''
  versionConflict.value = false
  notice.value = ''
  let acknowledged = false
  try {
    validateCourseMetadata({ ...form, remindDays: Number(form.remindDays) })
    const response = await saveCourseSchedule({
      revision: proposal.revision,
      semester: form.semester.trim(),
      firstMonday: form.firstMonday,
      remindDays: Number(form.remindDays),
      courses: proposal.courses,
    })
    acknowledged = true
    if (disposed || generation !== fileGeneration || !store.adopt(response.data.schedule, owner))
      return
    editing.value = false
    raw.value = ''
    preview.value = null
    confirmed.value = false
    notice.value = '课程已保存，仅本人可见；下次登录直接查看'
    await nextTick()
    if (disposed || generation !== fileGeneration || owner !== store.principal) return
    heading.value?.focus({ preventScroll: true })
    heading.value?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  } catch (failure) {
    if (!disposed && generation === fileGeneration && owner === store.principal) {
      versionConflict.value = acknowledged || failure.response?.status === 409
      error.value = acknowledged
        ? '服务端已保存，但本页未能显示新数据。请刷新页面后查看，不要重复提交；当前填写仍保留'
        : failure.response?.data?.message || failure.message || '保存未确认，请保留原文件并重试'
    }
  } finally {
    if (!disposed && generation === fileGeneration && owner === store.principal) busy.value = false
  }
}
async function reloadForComparison() {
  if (unavailable.value) return
  const owner = store.principal,
    generation = fileGeneration
  busy.value = true
  try {
    await store.load(true)
    if (disposed || generation !== fileGeneration || owner !== store.principal) return
    if (store.error) return
    invalidatePreview()
    error.value = ''
    versionConflict.value = false
    notice.value = editing.value
      ? '已读取最新保存内容，你的填写仍保留；请重新检查差异并确认，不会自动覆盖'
      : '已读取最新保存内容，请核对后再操作'
  } finally {
    if (!disposed && generation === fileGeneration && owner === store.principal) busy.value = false
  }
}
async function mutate(action) {
  if (unavailable.value || operationsDirty.value || !store.schedule) return
  const owner = store.principal,
    revision = store.schedule.revision,
    generation = fileGeneration
  if (
    !(await confirm(
      action === 'delete'
        ? '删除本站保存的课程表格后，需要重新导入。历史原件和教务数据不会改变'
        : '只有你已经对照教务或老师通知核对后，才记录本次核对时间；本站不会自动核对',
      {
        title: action === 'delete' ? '删除本站课程表格？' : '确认课程表格没有变化？',
        confirmText: action === 'delete' ? '删除本站表格' : '我已核对，记录时间',
      },
    )) ||
    revision !== store.schedule?.revision
  )
    return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    if (action === 'delete') {
      await deleteCourseSchedule(revision)
      if (!disposed && generation === fileGeneration && store.adopt(null, owner))
        notice.value = '本站课程表格已删除，历史原件保持不变'
    } else {
      const response = await confirmCourseSchedule(revision)
      if (!disposed && generation === fileGeneration && store.adopt(response.data.schedule, owner))
        notice.value = '已记录核对时间，不代表实时教务同步'
    }
  } catch (failure) {
    if (!disposed && generation === fileGeneration && owner === store.principal) {
      versionConflict.value = failure.response?.status === 409
      error.value = failure.response?.data?.message || '操作未确认，请重新读取核对'
    }
  } finally {
    if (!disposed && generation === fileGeneration && owner === store.principal) busy.value = false
  }
}
function download(value, filename, type) {
  const url = URL.createObjectURL(new Blob([value], { type })),
    link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
onMounted(async () => {
  const owner = store.principal,
    generation = fileGeneration
  await store.load()
  if (
    !disposed &&
    generation === fileGeneration &&
    owner === store.principal &&
    !store.schedule &&
    store.loaded &&
    !store.error
  )
    startImport(false)
})
onBeforeUnmount(() => {
  cancelExportNavigation()
  resetPrivateExport()
  disposed = true
  fileGeneration++
  fileRead?.abort()
  fileRead = null
})
</script>
<template>
  <section ref="courseRoot" class="course-panel" aria-label="私人课程表格" :aria-busy="unavailable || store.loading">
    <PersonalScheduleOperations ref="operationsPanel" v-if="store.principal && !editing" :scope="store.principal" :disabled="busy||reading||confirming||exportState.busy" @state="operationsBusy=$event.busy;operationsDirty=$event.dirty" @changed="store.load(true)" />
    <p v-if="store.loading" role="status">正在读取课程表格…</p>
    <div v-if="store.error" ref="readErrorTarget" class="course-alert" role="alert" tabindex="-1" :data-workflow-ready="layoutReady">
      <p>{{ store.error }}</p>
      <button
        class="work-button"
        :disabled="store.loading || unavailable"
        @click="props.exportRequested ? openExport(true) : props.manageRequested ? openManagement(true) : store.load(true)"
      >
        重新读取并核对差异
      </button>
    </div>
    <p v-if="notice" ref="exportNotice" class="course-notice" role="status" tabindex="-1" :data-workflow-ready="layoutReady">{{ notice }}</p>
    <section v-if="store.schedule && !editing" class="course-saved" aria-label="已保存课程表格">
      <header class="course-head">
        <div>
          <h2 ref="heading" tabindex="-1" :data-workflow-ready="layoutReady">{{ store.schedule.semester }}</h2>
          <p>
            {{ store.schedule.courses.length }}条课程安排 · 核对于
            {{ dateLabel(store.schedule.checkedAt) }}
          </p>
        </div>
        <button
          v-if="!editing"
          class="work-button"
          :disabled="unavailable || operationsDirty || !store.loaded"
          @click="startImport"
        >
          导入新表并比较
        </button>
      </header>
      <p class="course-teacher-summary">任课教师已填{{ filledTeachers }}/{{ store.schedule.courses.length }}项
        <button class="work-button" type="button" :disabled="unavailable||editing||operationsDirty" @click="openTeacherEditing">补充任课教师</button>
      </p>
      <details class="course-teacher-note"><summary>教师账号如何关联？</summary><p>填教师姓名不会建立账号权限；正式课程需明确绑定教师账号，各日期与节次共用同一课程记录。</p></details>
      <template v-if="!manageOnly">
        <p v-if="nextCourse && !nextCourse.timeUnknown" class="course-next">
          <strong>{{
            nextCourse.timeUnknown
              ? '已导入的最近上课日 · 按节次查看'
              : nextCourse.current
                ? '导入表格中正在上的课'
                : '导入表格里的下一节'
          }}</strong
          ><br />{{ nextCourse.date }} · {{ courseTimeLabel(nextCourse) }} · {{ nextCourse.name }} ·
          {{ nextCourse.room || '教室未填写' }} · {{ nextCourse.teacher || '任课教师未录入' }}
          <small v-if="nextCourse.timeUnknown" class="course-time-note"
            >未设置作息钟点，不判断这节课是否已结束；当天全部安排见下方</small
          >
        </p>
        <p v-else-if="!nextCourse">
          已导入的课程没有后续安排，不代表之后没有课，请核对是否需要导入新学期
        </p>
        <div class="course-week">
          <button
            class="work-button"
            :disabled="Number(selectedWeek) <= 1"
            @click="selectedWeek = Number(selectedWeek) - 1"
          >
            上一周
          </button>
          <label
            >查看周次<select v-model="selectedWeek">
              <option v-for="week in 30" :key="week" :value="week">
                第{{ week }}周{{ week === currentWeek ? ' · 本周' : '' }}
              </option>
            </select></label
          >
          <button
            class="work-button"
            :disabled="Number(selectedWeek) >= 30"
            @click="selectedWeek = Number(selectedWeek) + 1"
          >
            下一周
          </button>
          <button
            v-if="currentWeek >= 1 && currentWeek <= 30 && Number(selectedWeek) !== currentWeek"
            class="work-button"
            @click="selectedWeek = currentWeek"
          >
            回到本周
          </button>
        </div>
        <p v-if="gridCourses.length" class="course-time-note">
          按节次展示 · 尚无作息钟点，不推算正在上课或下课时间
        </p>
        <p v-if="!displayed.length">这一周没有导入的课程；不要据此判断停课</p>
        <p v-if="conflicts.length" class="course-alert">
          本周有{{ conflicts.length }}组时间重叠，请回教务核对，不自动删掉其中任何一门
        </p>
        <CourseWeekGrid
          v-if="periodGridSafe"
          class="course-desktop-grid"
          :courses="gridCourses"
          :monday="weekMonday"
          :today="chinaDate(clock)"
        />
        <div
          v-for="(day, i) in days"
          :key="day"
          class="course-day"
          :class="{ 'course-mobile-list': periodGridSafe && displayed.every(isPeriodCourse) }"
        >
          <template v-if="displayed.some((c) => c.weekday === i + 1)"
            ><h3>
              {{ day }} <small>{{ addDays(weekMonday, i).slice(5).replace('-', '/') }}</small>
            </h3>
            <ul>
              <li
                v-for="course in displayed.filter((c) => c.weekday === i + 1)"
                :key="courseKey(course)"
              >
                <span>{{ courseTimeLabel(course) }}</span
                ><strong>{{ course.name }}</strong
                ><span>{{ course.room || '教室未填写' }} · {{ course.teacher || '任课教师未录入' }}</span>
              </li>
            </ul></template
          >
        </div>
      </template>
      <p class="course-check">
        {{ checkMessage }}
        <a
          href="https://zdjw.tsguas.edu.cn/app-web/#/tabs/home"
          target="_blank"
          rel="noopener noreferrer"
          >打开教务核对 ↗</a
        >
      </p>
      <div class="course-actions">
        <button class="work-button" :disabled="unavailable || operationsDirty || editing" @click="mutate('checked')">
          我已核对，表格没变</button
        ><button class="course-delete" :disabled="unavailable || operationsDirty || editing" @click="mutate('delete')">
          删除本站表格
        </button>
      </div>
      <section ref="exportTarget" class="course-export" aria-label="导出本人已保存课表">
        <button ref="exportStart" :data-workflow-ready="layoutReady" class="work-button" :disabled="unavailable || editing || store.loading || !!store.error" @click="exportStep('prepare')">{{ exportState.busy ? '正在重新读取并核验…' : '导出已保存课表' }}</button>
        <p class="course-export-scope">仅导出本人保存的课程、任课教师、学期和周次 JSON，可重新导入。未保存草稿、教学名单和考勤不包含在内。</p>
        <div v-if="exportState.preview" ref="exportPreview" class="course-export-preview" tabindex="-1">
          <h3>核对这份个人课表</h3>
          <p>{{ exportState.preview.semester }} · 完整 {{ exportState.preview.count }} 项安排 · 版本 {{ exportState.preview.revision }}</p>
          <p>第1周周一 {{ exportState.preview.firstMonday }}。准备5分钟内有效；下载前再次读取校验，数据变化则重新准备。</p>
          <details><summary>查看文件校验值</summary><code>{{ exportState.preview.sha256 }}</code></details>
          <div class="course-actions"><button class="work-button primary course-export-download" :disabled="unavailable" @click="exportStep('download')">核验并下载本人课表 JSON</button><button class="work-button" :disabled="unavailable" @click="resetPrivateExport">取消准备</button></div>
        </div>
        <p v-if="exportState.error || exportState.notice" ref="exportFeedback" tabindex="-1" :role="exportState.error ? 'alert' : 'status'" :class="exportState.error ? 'course-alert' : 'course-notice'">{{ exportState.error || exportState.notice }}</p>
      </section>
    </section>
    <div v-if="error" ref="fileError" class="course-alert" role="alert" tabindex="-1">
      <p>{{ error }}</p>
      <button
        v-if="versionConflict"
        class="work-button"
        :disabled="unavailable || store.loading"
        @click="reloadForComparison"
      >
        读取最新表格，保留当前填写
      </button>
    </div>
    <div v-if="!store.schedule && !editing && store.loaded && !store.error">
      <h2 ref="emptyHeading" tabindex="-1" :data-workflow-ready="layoutReady">添加你的课表</h2>
      <button class="work-button primary" @click="startImport"><NavigationIcon name="timetable" />导入课表</button>
    </div>
    <form v-if="editing" class="course-import" @submit.prevent="inspect">
      <h2 ref="importHeading" tabindex="-1" :data-workflow-ready="layoutReady">
        {{ store.schedule ? '更新课表' : '导入课表' }}
      </h2>
      <p class="course-import-intro">上传 → 核对课程 → 确认保存</p>
      <div class="course-import-methods" role="group" aria-label="选择课表导入方式">
        <button class="work-button" type="button" :aria-pressed="importMode === 'image'" :disabled="unavailable" @click="importMode = 'image'"><NavigationIcon name="timetable" />课表截图</button>
        <button class="work-button" type="button" :aria-pressed="importMode === 'file'" :disabled="unavailable" @click="importMode = 'file'"><NavigationIcon name="sources" />表格文件</button>
      </div>
      <CourseImageImport v-show="importMode === 'image'" :scope="store.principal" :disabled="baseUnavailable" @busy="imageBusy=$event" @pending="imagePending=$event" @adopt="adoptCourseImage" />
      <SchoolTimetableGuide v-show="importMode === 'file'" />
      <fieldset :disabled="unavailable">
        <div v-show="importMode === 'file'" class="course-actions">
          <label class="course-file"
            >选择表格文件<input
              type="file"
              accept=".json,.xlsx,.csv,.tsv,.txt"
              aria-describedby="course-file-help"
              @change="chooseFile"
          /></label>
        </div>
        <p v-show="importMode === 'file'" id="course-file-help">
          XLSX / CSV / JSON · 本机解析 · XLSX最大10MB，文本最大100KB
        </p>
        <p v-if="fileLabel || fileNotice" class="course-file-status" role="status">
          <strong v-if="fileLabel">{{ fileLabel }}</strong>
          <span>{{ fileNotice || '课程数据待重新检查' }}</span>
        </p>
        <div v-if="raw.trim()" class="course-fields">
          <label>学期<input v-model="form.semester" maxlength="100" required /></label
          ><label
            >开学第一周周一<DateField v-model="form.firstMonday" aria-label="开学第一周周一" required monday-only :disabled="unavailable" /><small
              >按学校校历确认</small
            ></label
          ><label
            >核对提醒<select v-model="form.remindDays">
              <option :value="3">每3天</option>
              <option :value="7">每7天</option>
              <option :value="14">每14天</option>
              <option :value="0">关闭定期提醒</option>
            </select></label
          >
        </div>
        <details v-show="importMode === 'file' || raw.trim()" class="course-advanced">
          <summary>手动粘贴或调整数据</summary>
          <div class="course-actions">
            <button
              type="button"
              class="work-button"
              @click="download(COURSE_TEMPLATE, '课程表格模板.csv', 'text/csv;charset=utf-8')"
            >
              时间版示例</button
            ><button
              type="button"
              class="work-button"
              @click="download(PERIOD_TEMPLATE, '课程节次模板.csv', 'text/csv;charset=utf-8')"
            >
              节次版示例
            </button>
          </div>
          <label class="course-text"
            >课程数据<textarea
              v-model="raw"
              maxlength="50000"
              rows="7"
              placeholder="课程名称,星期,开始时间,结束时间,周次,教室,任课教师&#10;课程示例,1,08:00,09:40,1-16单,教室示例,教师示例"
            /><small
              >星期填1至7；只有节次时，将开始时间、结束时间表头改为开始节次、结束节次，填1至16。周次填6、1-16单或1;3;5。任课教师可留空，也兼容原6列表格；最多120条，不导入学生姓名、学号或成绩</small
            ></label
          >
        </details>
        <div class="course-actions">
          <button
            v-if="!preview"
            class="work-button primary"
            type="submit"
            :disabled="!raw.trim() || !store.loaded || !!store.error"
          >
            预览课程变化</button
          ><button class="work-button" type="button" @click="cancel">取消导入</button>
        </div>
        <section v-if="preview" ref="previewTarget" class="course-preview" aria-label="待保存课程及差异" tabindex="-1">
          <h3>待保存{{ preview.courses.length }}条课程安排</h3>
          <p>
            合并{{ preview.duplicates }}条完全重复行 · 与本站已保存内容比较：新增{{
              difference.added.length
            }}条、调整{{ difference.modified.length }}条、移除{{
              difference.removed.length
            }}条、未变{{ difference.unchanged }}条
          </p>
          <p v-if="!form.firstMonday" class="course-alert">
            文件没有提供开学日期：请在上方确认一次“第1周周一日期”，不用逐条整理课程。
          </p>
          <p v-for="warning in preview.warnings || []" :key="warning" class="course-alert">
            {{ warning }}
          </p>
          <p v-if="metadataChange" class="course-alert">
            学期、第1周日期或提醒设置发生变化；同一课程也可能因此对应不同日期，请逐项核对
          </p>
          <p v-if="preview.conflicts.length" class="course-alert">
            有{{ preview.conflicts.length }}组时间重叠。系统保留它们，不替你判断哪门课正确
          </p>
          <details v-if="preview.conflicts.length">
            <summary>查看时间重叠的课程</summary>
            <ul>
              <li v-for="(pair, i) in preview.conflicts.slice(0, 20)" :key="i">
                {{ preview.courses[pair.a].name }} / {{ preview.courses[pair.b].name }} ·
                {{ days[preview.courses[pair.a].weekday - 1] }} · 第{{ pair.weeks.join('、') }}周
              </li>
            </ul>
            <p v-if="preview.conflicts.length > 20">仅列出前20组，请核对全部课程安排</p>
          </details>
          <details v-if="difference.removed.length">
            <summary>将移除的{{ difference.removed.length }}条安排</summary>
            <ul>
              <li v-for="course in difference.removed" :key="courseKey(course)">
                {{ course.name }} · {{ days[course.weekday - 1] }} · {{ courseTimeLabel(course) }} ·
                第{{ course.weeks.join('、') }}周 · {{ course.room || '教室未填' }} · {{ course.teacher || '任课教师未录入' }}
              </li>
            </ul>
          </details>
          <section
            v-if="difference.modified.length"
            class="course-changes"
            aria-label="课程具体变化"
          >
            <h3>这些安排有调整</h3>
            <div
              v-for="change in difference.modified"
              :key="courseKey(change.before)"
              class="course-change"
            >
              <strong>{{ change.after.name }}</strong>
              <p v-for="field in change.changes" :key="field.label">
                <span>{{ field.label }}</span
                >：<del>{{ field.before }}</del> → <ins>{{ field.after }}</ins>
              </p>
            </div>
          </section>
          <details v-if="difference.added.length && store.schedule">
            <summary>新增的{{ difference.added.length }}条安排</summary>
            <ul>
              <li v-for="course in difference.added" :key="courseKey(course)">
                {{ course.name }} · {{ days[course.weekday - 1] }} · {{ courseTimeLabel(course) }} ·
                第{{ course.weeks.join('、') }}周 · {{ course.room || '教室未填' }} · {{ course.teacher || '任课教师未录入' }}
              </li>
            </ul>
          </details>
          <details open>
            <summary>核对全部{{ preview.courses.length }}条待保存安排</summary>
            <ul>
              <li v-for="course in preview.courses" :key="courseKey(course)">
                {{ course.name }} · {{ days[course.weekday - 1] }} · {{ courseTimeLabel(course) }} ·
                第{{ course.weeks.join('、') }}周 · {{ course.room || '教室未填' }} · {{ course.teacher || '任课教师未录入' }}
              </li>
            </ul>
          </details>
          <label class="course-confirm"
            ><input
              v-model="confirmed"
              type="checkbox"
            />我已核对日期、周次、全部课程及移除项；重叠课程也已确认</label
          >
          <p v-if="imagePending" class="course-alert">上方图片还有未采用的内容，请先采用识别结果或清除本次图片，再保存此预览。</p>
          <button
            class="work-button primary"
            type="button"
            :disabled="
              !confirmed || imagePending || !form.firstMonday || versionConflict || !store.loaded || !!store.error
            "
            @click="save"
          >
            {{ busy ? '正在保存…' : store.schedule ? '确认替换课程表格' : '确认保存课程表格' }}
          </button>
        </section>
      </fieldset>
    </form>
    <details class="course-boundary"><summary>数据与同步说明</summary><p>
      课表保存在统一数据库，按当前账号权限读取。聊天由模型理解问题，并根据查到的课程、教师、时间和地点回答；不发送学号、名单、成绩或考勤。图片识别仅在你主动同意时发送本次选图。未导入周次不补猜，不自动同步教务。正式教学另有站内提醒，尚无微信/离线推送；不索取教务密码。
    </p></details>
  </section>
</template>
<style scoped>
.course-import-methods{display:flex;gap:8px;margin:18px 0 8px;flex-wrap:wrap}.course-import-methods .work-button{gap:8px;min-height:44px;font-size:16px}.course-import-methods .work-button[aria-pressed=true]{background:var(--assistant-soft,#eaf2ff);color:var(--assistant-accent,#0b62db);border-color:transparent}.course-import-methods svg,.course-panel>.work-button svg{width:19px;height:19px}.course-import-intro{color:var(--assistant-muted,#5d6876);font-size:14px;margin:0 0 8px}.course-teacher-note p{margin-top:0}
.course-teacher-summary { display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:14px;line-height:1.7; }
.course-teacher-note { max-width:70ch;font-size:14px;line-height:1.7;color:var(--assistant-muted,#5d6876); }
.course-export { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--assistant-line, #e2e7ec); }
.course-panel .course-export .work-button { font-size: 16px; }
.course-export-scope { color: var(--assistant-muted, #5d6876); font-size: 14px; }
.course-export-preview { padding-block: 12px; scroll-margin-top: 90px; }
.course-export-preview h3 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
.course-export-preview code { display: block; overflow-wrap: anywhere; font-size: 14px; }
.course-export-preview summary { min-height: 44px; align-content: center; cursor: pointer; }
.course-export-download { background: var(--assistant-accent, #0b62db); color: #fff; border-color: transparent; }
@media (max-width: 600px) { .course-export .work-button { width: 100%; min-height: 44px; } }
.course-file-status strong,
.course-file-status span {
  display: block;
}
.course-file-status {
  color: #34513d;
  overflow-wrap: anywhere;
}
.course-advanced {
  margin: 20px 0;
}
.course-advanced summary {
  cursor: pointer;
  min-height: 44px;
  align-content: center;
}
.course-change {
  padding: 12px 0;
  border-bottom: 1px solid var(--ct-line);
}
.course-change p {
  margin: 6px 0;
}
.course-change del {
  color: #675a55;
  text-decoration-thickness: 1px;
}
.course-change ins {
  color: #24553b;
  text-decoration: none;
  font-weight: 600;
}
.course-panel {
  color: var(--ct-ink);
  font-size: 16px;
  line-height: 1.7;
  min-width: 0;
}
.course-panel p,
.course-panel li,
.course-panel strong {
  overflow-wrap: anywhere;
}
.course-panel h2 {
  font-size: 22px;
  line-height: 1.4;
  margin: 0 0 10px;
  scroll-margin-top: 16px;
  overflow-wrap: anywhere;
}
.course-panel h3 {
  font-size: 18px;
  line-height: 1.5;
  margin: 0 0 12px;
}
.course-panel a {
  color: var(--ct-blue);
  text-underline-offset: 4px;
}
.course-panel button,
.course-panel a,
.course-panel select,
.course-panel input,
.course-panel textarea,
.course-panel summary {
  accent-color: var(--ct-blue);
}
.course-panel :focus-visible {
  outline: 2px solid var(--ct-blue);
  outline-offset: 3px;
}
.course-boundary,
.course-head p,
.course-fields small,
.course-text small {
  color: #526377;
}
.course-boundary {
  margin: 16px 0 24px;
}
.course-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.course-head button {
  flex: none;
}
.course-head > div {
  min-width: 0;
  max-width: 100%;
}
.course-head p {
  margin: 0;
}
.course-check {
  padding: 16px 20px;
  background: #edf2ec;
  color: #34513d;
  border-radius: var(--ct-radius-control);
}
.course-check a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-inline-start: 12px;
}
.course-next {
  padding-block: 10px 22px;
  border-bottom: 1px solid var(--ct-line);
}
.course-week {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 20px 0 12px;
  font-weight: 600;
}
.course-week select {
  max-width: 100%;
}
.course-week label {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 160px;
}
.course-week label select {
  width: auto;
  flex: 1;
}
.course-time-note {
  display: block;
  color: #526377;
  font-size: 14px;
  margin-top: 8px;
  margin-bottom: 16px;
}
.course-day h3 small {
  color: #526377;
  font-size: 14px;
  font-weight: 400;
  margin-left: 6px;
}
.course-mobile-list {
  display: none;
}
.course-day:empty {
  display: none;
}
.course-day {
  margin-block: 28px;
}
.course-day ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.course-day li {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr) minmax(100px, 0.5fr);
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--ct-line);
  font-variant-numeric: tabular-nums;
}
.course-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-block: 20px;
}
.course-delete {
  border: none;
  color: #526377;
  background: transparent;
  text-decoration: underline;
  text-underline-offset: 4px;
  min-height: 44px;
  padding: 10px;
  font: inherit;
  cursor: pointer;
}
.course-alert,
.course-notice {
  padding: 16px 20px;
  border-radius: var(--ct-radius-control);
  background: #f4efe3;
  color: #625133;
}
.course-notice {
  background: #edf2ec;
  color: #34513d;
}
.course-import {
  margin-top: 32px;
  padding: 24px;
  border-radius: var(--ct-radius-panel);
  background: var(--ct-white);
  border: 1px solid var(--ct-line);
}
.course-import > p {
  max-width: 65ch;
  color: #526377;
}
.course-import fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.course-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-block: 24px;
}
.course-fields label,
.course-text,
.course-file {
  display: grid;
  gap: 8px;
  min-width: 0;
  font-weight: 600;
}
.course-fields small,
.course-text small {
  font-weight: 400;
  font-size: 14px;
}
.course-panel input:not([type='checkbox']),
.course-panel select,
.course-panel textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 10px 12px;
  font: inherit;
  color: var(--ct-ink);
  background: var(--ct-paper);
  border: 1px solid var(--ct-line);
  border-radius: 14px;
}
.course-panel textarea {
  resize: vertical;
}
.course-panel textarea::placeholder {
  color: #526377;
}
.course-preview {
  border-top: 1px solid var(--ct-line);
  padding-top: 24px;
  margin-top: 24px;
}
.course-preview details {
  margin-block: 18px;
}
.course-preview summary {
  min-height: 44px;
  cursor: pointer;
  padding-block: 10px;
  font-weight: 600;
}
.course-preview ul {
  padding-inline-start: 20px;
}
.course-preview li {
  margin-block: 10px;
}
.course-confirm {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 44px;
  padding-block: 14px;
}
.course-confirm input {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 4px;
}
@media (max-width: 1100px) {
  .course-desktop-grid {
    display: none;
  }
  .course-mobile-list {
    display: block;
  }
}
@media (max-width: 760px) {
  .course-week {
    gap: 8px;
  }
  .course-week label {
    order: -1;
    flex-basis: 100%;
  }
  .course-head {
    flex-direction: column;
    gap: 16px;
  }
  .course-fields {
    grid-template-columns: 1fr;
  }
  .course-import {
    padding: 18px;
  }
  .course-day li {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .course-check a {
    margin-inline-start: 0;
  }
}
</style>
