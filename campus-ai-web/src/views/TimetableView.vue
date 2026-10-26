<script setup>
import CourseSchedulePanel from '@/components/CourseSchedulePanel.vue'
import { useTimetableStore } from '@/stores/timetable'
import { useCourseScheduleStore } from '@/stores/courseSchedule'
import UnifiedWeekCalendar from '@/components/UnifiedWeekCalendar.vue'
import ScheduleExportPanel from '@/components/ScheduleExportPanel.vue'
import { computed, ref, nextTick, onMounted, watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { userSessionGeneration } from '@/api/http'
import {scheduleExportRoute} from '@/utils/scheduleFileIntent'
const legacy = useTimetableStore()
const personal = useCourseScheduleStore()
const importDetails = ref(), importPanel = ref(),scheduleExportPanel=ref()
const importOpen = ref(false)
const importAction = ref(false)
watch(() => importPanel.value?.importing, active => { if (!active) importAction.value = false })
const route = useRoute()
const calendarLayout = ref({ owner: '', status: 'waiting' })
const calendarOwner = computed(() => personal.principal ? `${personal.principal}:${userSessionGeneration.value}` : '')
const calendarExportContext = ref(null)
function calendarExportChanged(value) { calendarExportContext.value = value?.owner === calendarOwner.value ? value : null }
watch(calendarOwner, () => { calendarExportContext.value = null }, { flush: 'sync' })
async function openCalendarExport() { if (calendarExportContext.value?.owner === calendarOwner.value) await scheduleExportPanel.value?.open(calendarExportContext.value) }
const fileExportPreset=computed(()=>scheduleExportRoute(route.query))
const layoutReadiness = computed(() => calendarLayout.value.owner === calendarOwner.value ? calendarLayout.value.status : 'waiting')
function calendarLayoutChanged(value) {
  if (value?.owner === calendarOwner.value && ['waiting', 'ready', 'error'].includes(value.status)) calendarLayout.value = value
}
let routeGeneration = 0, disposed = false
watch([() => route.query.tool, () => personal.principal], async ([tool]) => {
  const started = ++routeGeneration, owner = personal.principal
  if (!['personal-export','personal-manage','personal-operations'].includes(tool) || !owner) return
  importOpen.value = true
  if (importDetails.value) importDetails.value.open = true
  await nextTick()
  if (!disposed && started === routeGeneration && owner === personal.principal && route.query.tool === tool) {
    if(tool==='personal-export')await importPanel.value?.openExport()
    else if(tool==='personal-operations')await importPanel.value?.openOperations()
    else await importPanel.value?.openManagement()
  }
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => { disposed = true; routeGeneration++ })
async function openImport() {
  importAction.value = true
  importOpen.value = true
  if (importDetails.value) importDetails.value.open = true
  await nextTick()
  await importPanel.value?.openImport()
  if (!importPanel.value?.importing) importAction.value = false
}
async function openOperations(){importOpen.value=true;if(importDetails.value)importDetails.value.open=true;await nextTick();await importPanel.value?.openOperations()}
onMounted(() => personal.load())
const unifiedAvailable = ref(false)
const scope = ref('')
const title = computed(
  () =>
    ({ TEACHER: '课表与点名', COUNSELOR: '班级考勤', SECRETARY: '学院考勤' })[scope.value] ||
    '我的课表',
)
const hint = computed(
  () =>
    ({
      TEACHER: '任课课程和对应名单，一处处理',
      COUNSELOR: '负责班级的到课情况，按周查看',
      SECRETARY: '负责学院的考勤汇总，按班级查看',
    })[scope.value] || '今天的课程、教师和地点，放在一起看',
)
function loadLegacy(event) {
  if (event.target.open) legacy.load()
}
</script>
<template>
  <main class="work-page timetable-page">
    <header class="timetable-heading">
      <h1>{{ title }}</h1>
      <p v-if="!importAction">{{ hint }}</p>
      <div class="timetable-actions" v-if="!importAction" aria-label="课表操作">
      <button v-if="!['COUNSELOR','SECRETARY'].includes(scope)" class="timetable-import-action" type="button" :disabled="importPanel?.dirty||importPanel?.unavailable" @click="openImport">{{ personal.schedule ? '更新课表' : '导入课表' }}</button>
      <button class="timetable-import-action timetable-export-action" type="button" :disabled="!calendarExportContext" @click="openCalendarExport">导出课表</button>
      <button v-if="!['COUNSELOR','SECRETARY'].includes(scope)" class="timetable-import-action timetable-export-action" type="button" @click="openOperations">修改个人安排</button>
      </div>
    </header>
    <UnifiedWeekCalendar v-show="!importAction" @available="unifiedAvailable = $event" @scope="scope = $event" @layout="calendarLayoutChanged" @export-context="calendarExportChanged" />
    <ScheduleExportPanel v-show="!importAction" ref="scheduleExportPanel" :owner="calendarOwner" :preferred-view="scope" :preset="fileExportPreset" :calendar-context="calendarExportContext" />
    <details ref="importDetails" class="import-management" :class="{'import-focused':importAction}" :open="importOpen || !unifiedAvailable" @toggle="importOpen = $event.target.open">
      <summary>管理个人课表</summary>
      <CourseSchedulePanel ref="importPanel" :layout-ready="layoutReadiness" :export-requested="route.query.tool === 'personal-export'" :manage-requested="route.query.tool === 'personal-manage'" :manage-only="unifiedAvailable" />
    </details>
    <details v-show="!importAction" class="legacy-source" @toggle="loadLegacy">
      <summary>旧版原件</summary>
      <p>新版统一显示解析后的课程，旧图片不再作为课表展示，已经保存的原件没有删除。</p>
      <p v-if="legacy.loading" role="status">正在读取本人原件…</p>
      <p v-else-if="legacy.error" role="alert">
        {{ legacy.error }} <button class="work-button" @click="legacy.load(true)">重试</button>
      </p>
      <a
        v-else-if="legacy.imageUrl"
        class="work-button"
        :href="legacy.imageUrl"
        download="我的旧课表原件.jpg"
        >下载旧原件</a
      >
      <p v-else-if="legacy.loaded">没有旧版原件。</p>
    </details>
  </main>
</template>
<style scoped>
.import-focused>summary{display:none}.import-focused{border-top:0!important;padding-top:0!important;margin-top:0!important}
.timetable-page {
  max-width: 1160px;
}
.timetable-heading {
  margin-bottom: 32px;
}
.timetable-import-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: 14px;
  padding: 11px 22px;
  border: 0;
  border-radius: 12px;
  background: var(--assistant-accent, #2b63cf);
  color: #fff;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 180ms ease-out;
}
.timetable-import-action:hover { background: var(--assistant-accent-hover, #214ea6); }
.timetable-export-action{margin-left:12px;background:var(--assistant-soft,#eaf2ff);color:var(--assistant-accent,#0b62db)}
.timetable-export-action:hover{background:var(--assistant-hover,#e8edf2)}
.timetable-heading .import-first-use { font-size: 14px; margin-top: 12px; max-width: 60ch; }
@media (prefers-reduced-motion: reduce) { .timetable-import-action { transition: none; } }
h1 {
  font-size: 32px;
  line-height: 1.3;
  letter-spacing: -0.025em;
  margin: 0 0 12px;
}
.timetable-heading p,
.legacy-source {
  color: #526377;
  line-height: 1.7;
}
.import-management {
  margin-top: 28px;
  border-top: 1px solid var(--assistant-line, #e2e7ec);
  padding-top: 12px;
}
.teaching-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-top: 10px;
  font-size: 14px;
  color: var(--assistant-accent, #536f90);
  text-underline-offset: 4px;
}
.legacy-source {
  font-size: 14px;
  border-top: 1px solid var(--ct-line);
  padding-top: 16px;
  margin-top: 32px;
}
summary {
  cursor: pointer;
  min-height: 44px;
  align-content: center;
}
.legacy-source a {
  text-decoration: none;
}
:focus-visible {
  outline: 2px solid var(--ct-blue);
  outline-offset: 3px;
}
@media (max-width: 760px) {
  h1 {
    font-size: 28px;
  }
  .timetable-heading {
    margin-bottom: 24px;
  }
}
</style>
