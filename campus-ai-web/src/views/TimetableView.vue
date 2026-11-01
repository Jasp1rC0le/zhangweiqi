<script setup>
import CourseSchedulePanel from '@/components/CourseSchedulePanel.vue'
import CourseTeacherLink from '@/components/CourseTeacherLink.vue'
import { useTimetableStore } from '@/stores/timetable'
import { useCourseScheduleStore } from '@/stores/courseSchedule'
import { useClassReminderStore } from '@/stores/classReminders'
import UnifiedWeekCalendar from '@/components/UnifiedWeekCalendar.vue'
import ScheduleExportPanel from '@/components/ScheduleExportPanel.vue'
import CalendarImportAction from '@/components/CalendarImportAction.vue'
import { computed, ref, nextTick, onMounted, watch, onBeforeUnmount } from 'vue'
import { ElDropdown, ElDropdownMenu, ElDropdownItem, ElMessage } from 'element-plus'
import { MoreFilled } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { userSessionGeneration } from '@/api/http'
import { scheduleExportRoute } from '@/utils/scheduleFileIntent'
const legacy=useTimetableStore(),personal=useCourseScheduleStore(),reminders=useClassReminderStore()
const importPanel=ref(),scheduleExportPanel=ref(),calendarAction=ref(),teacherLink=ref(),pageHeading=ref()
const importOpen=ref(false),importAction=ref(false),operationsOpen=ref(false),exportOpen=ref(false),legacyOpen=ref(false)
const route=useRoute(),router=useRouter(),unifiedAvailable=ref(false),scope=ref('')
const leadership=computed(()=>['COUNSELOR','SECRETARY'].includes(scope.value))
const calendarOwner=computed(()=>personal.principal?`${personal.principal}:${userSessionGeneration.value}`:'')
const editingSurface=computed(()=>importAction.value||operationsOpen.value)
const blocked=computed(()=>Boolean(importPanel.value?.dirty||importPanel.value?.unavailable||teacherLink.value?.dirty||teacherLink.value?.busy))
const title=computed(()=>importAction.value?'导入课表':operationsOpen.value?'修改安排':({TEACHER:'课表与点名',COUNSELOR:'班级考勤',SECRETARY:'学院考勤'})[scope.value]||'我的课表')
const calendarLayout=ref({owner:'',status:'waiting'}),calendarExportContext=ref(null)
const layoutReadiness=computed(()=>calendarLayout.value.owner===calendarOwner.value?calendarLayout.value.status:'waiting')
function calendarLayoutChanged(value){if(value?.owner===calendarOwner.value&&['waiting','ready','error'].includes(value.status))calendarLayout.value=value}
function calendarExportChanged(value){calendarExportContext.value=value?.owner===calendarOwner.value?value:null}
watch(calendarOwner,()=>{calendarExportContext.value=null;importAction.value=false;operationsOpen.value=false;exportOpen.value=false;legacyOpen.value=false},{flush:'sync'})
watch(()=>importPanel.value?.importing,active=>{if(!active){importAction.value=false;if(!operationsOpen.value)importOpen.value=false}})
const fileExportPreset=computed(()=>scheduleExportRoute(route.query))
watch(fileExportPreset,value=>{if(value)exportOpen.value=true},{immediate:true})
let disposed=false,routeGeneration=0
async function importedImage(value){
  if(value?.owner!==personal.principal)return
  const owner=value.owner;importAction.value=false;importOpen.value=false;operationsOpen.value=false
  ElMessage.success(value.message||'已导入')
  await router.replace({path:'/timetable',query:{queryView:'STUDENT',queryDate:value.date}});await nextTick()
  if(!disposed&&owner===personal.principal&&route.query.queryDate===value.date)pageHeading.value?.focus({preventScroll:true})
}
async function openImport(){if(blocked.value)return;operationsOpen.value=false;importOpen.value=true;importAction.value=true;await nextTick();await importPanel.value?.openImport();if(!importPanel.value?.importing)importAction.value=false}
async function openOperations(){if(blocked.value)return;importAction.value=false;operationsOpen.value=true;importOpen.value=true;await nextTick();await importPanel.value?.openOperations()}
async function associate(){await teacherLink.value?.open()}
async function openCalendarExport(){exportOpen.value=true;await nextTick();if(calendarExportContext.value?.owner===calendarOwner.value)await scheduleExportPanel.value?.open(calendarExportContext.value);else await scheduleExportPanel.value?.open()}
async function openCalendarReminder(minutes=reminders.state.minutes){exportOpen.value=true;await nextTick();await scheduleExportPanel.value?.openReminder(minutes)}
async function action(name){
  if(name==='import')return openImport()
  if(name==='operations')return openOperations()
  if(name==='export')return openCalendarExport()
  if(name==='settings')return router.push('/account#class-reminder-preferences')
  if(name==='legacy'){legacyOpen.value=true;await legacy.load()}
}
watch([()=>route.query.tool,()=>personal.principal],async([tool])=>{
  const run=++routeGeneration,owner=personal.principal
  if(!owner||!['personal-export','personal-manage','personal-operations'].includes(tool))return
  await nextTick();if(disposed||run!==routeGeneration||owner!==personal.principal)return
  if(tool==='personal-export')await openCalendarExport();else await openOperations()
},{immediate:true,flush:'post'})
onMounted(()=>personal.load())
onBeforeUnmount(()=>{disposed=true;routeGeneration++})
</script>
<template>
  <main class="work-page timetable-page timetable-direct">
    <header class="timetable-heading">
      <h1 ref="pageHeading" tabindex="-1">{{title}}</h1>
      <div v-if="!editingSurface" class="timetable-heading-actions">
        <CalendarImportAction id="class-reminders" ref="calendarAction" :minutes="reminders.state.minutes" :active="!!calendarOwner&&personal.loaded&&!!personal.schedule" :disabled="blocked||!personal.schedule" @fallback="openCalendarReminder"/>
        <ElDropdown trigger="click" @command="action"><button type="button" class="timetable-more" :disabled="blocked" aria-label="更多课表操作"><MoreFilled/></button><template #dropdown><ElDropdownMenu><ElDropdownItem v-if="!leadership" command="import">导入</ElDropdownItem><ElDropdownItem v-if="!leadership" command="operations">修改安排</ElDropdownItem><ElDropdownItem command="export" :disabled="!calendarExportContext">导出表格</ElDropdownItem><ElDropdownItem command="settings">提醒设置</ElDropdownItem><ElDropdownItem command="legacy">旧原件</ElDropdownItem></ElDropdownMenu></template></ElDropdown>
      </div>
      <button v-else type="button" class="timetable-return" :disabled="blocked" @click="importAction=false;operationsOpen=false;importOpen=false">返回课表</button>
    </header>
    <UnifiedWeekCalendar v-show="!editingSurface" @available="unifiedAvailable=$event" @scope="scope=$event" @layout="calendarLayoutChanged" @export-context="calendarExportChanged" @associate="associate" @import="openImport"/>
    <div v-if="!editingSurface&&personal.schedule&&!leadership" class="timetable-teacher-action"><button type="button" :disabled="blocked" @click="associate">关联教师</button></div>
    <section v-show="importOpen" class="timetable-edit-surface" aria-label="编辑本人课表"><CourseSchedulePanel ref="importPanel" :manage-only="true" :layout-ready="layoutReadiness" @imported="importedImage"/></section>
    <ScheduleExportPanel v-show="exportOpen&&!editingSurface" ref="scheduleExportPanel" :owner="calendarOwner" :preferred-view="scope" :preset="fileExportPreset" :calendar-context="calendarExportContext"/>
    <CourseTeacherLink ref="teacherLink" :owner="calendarOwner" :disabled="importPanel?.unavailable" @saved="ElMessage.success('已关联教师')"/>
    <section v-if="legacyOpen&&!editingSurface" class="timetable-legacy" aria-label="旧原件"><p v-if="legacy.loading" role="status">读取中…</p><p v-else-if="legacy.error" role="alert">{{legacy.error}}</p><a v-else-if="legacy.imageUrl" class="work-button" :href="legacy.imageUrl" download="我的旧课表原件.jpg">下载旧原件</a><p v-else>暂无旧原件</p></section>
  </main>
</template>
<style scoped>
.timetable-direct{max-width:1120px;margin-inline:auto}.timetable-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px}.timetable-heading h1{font-size:26px;font-weight:600;letter-spacing:-.025em;line-height:1.25;margin:0}.timetable-heading-actions{display:flex;align-items:flex-start;gap:6px}.timetable-more,.timetable-return{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:10px;border:0;border-radius:12px;background:transparent;color:var(--assistant-ink,#29323c);font:inherit;cursor:pointer}.timetable-more svg{width:20px;height:20px}.timetable-return{font-size:14px;color:var(--assistant-accent)}.timetable-teacher-action{display:flex;justify-content:flex-end;margin-top:12px}.timetable-teacher-action button{min-height:44px;padding:8px 12px;border:0;background:transparent;color:var(--assistant-accent,#087f7b);font:inherit;font-size:14px;cursor:pointer}.timetable-direct button:focus-visible{outline:2px solid var(--assistant-accent,#087f7b);outline-offset:3px}.timetable-direct button:disabled{opacity:.55;cursor:default}.timetable-edit-surface{min-width:0}.timetable-legacy{margin-top:18px;font-size:14px}.timetable-heading h1:focus{outline:none}
@media(max-width:600px){.timetable-heading{margin-bottom:10px;gap:8px}.timetable-heading h1{font-size:22px}.timetable-heading-actions{gap:0}.timetable-direct{padding-inline:0}}
</style>
