<script setup>
import DateField from '@/components/DateField.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { userSessionGeneration } from '@/api/http'
import { readRosterUpload } from '@/utils/rosterUpload'
import { parseCourseWeeks } from '@/utils/courseSchedule'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { readTeachingConfigPage, readTeachingCapabilities, readTeachingResponsibilityAccess, createTeachingClass, createTeachingCourse, createTeachingRosterCourse, setTeachingGrant, readTeachingMembers, bindTeachingMember } from '@/api/teaching'
import { validatedConfigPage } from '@/utils/teachingConfigPage'
import TeachingScopePicker from './TeachingScopePicker.vue'
import TeachingRosterPicker from './TeachingRosterPicker.vue'
import TeachingWithdrawalPanel from './TeachingWithdrawalPanel.vue'
import TeachingLifecyclePanel from './TeachingLifecyclePanel.vue'
import TeachingGovernancePanel from './TeachingGovernancePanel.vue'
import TeachingCourseModePanel from './TeachingCourseModePanel.vue'
import TeachingAdministrativeAuditPanel from './TeachingAdministrativeAuditPanel.vue'
import TeachingResponsibilityPanel from './TeachingResponsibilityPanel.vue'
import TeachingLessonChangesPanel from './TeachingLessonChangesPanel.vue'
import {focusWorkflowElement} from '@/utils/teachingWorkflows'

const props=defineProps({courseOnly:Boolean,seedCourse:{type:Object,default:()=>({})},workflow:{type:Object,default:null}})
const emit=defineEmits(['state','saved'])
const configElement=ref()

const auth = useAuthStore(), principal = computed(() => auth.user?.role === 'ADMIN' ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '')
const refresh = ref(0), preview = ref(null), selectedGroup = ref(0), college = ref(''), consent = ref(false), error = ref(''), notice = ref(''), busy = ref(false), available = ref(false), members = ref([]), bindingClass = ref('')
const accountInputs = reactive({})
const loadedBindingClass = ref('')
const course = reactive({ id: crypto.randomUUID(), classId: '', teacherId: '', name: '', semester: '', firstMonday: '', weekday: 1, startTime: '', endTime: '', weeks: '', room: '' })
if(props.courseOnly)Object.assign(course,{weekday:'',name:props.seedCourse.name||'',startTime:props.seedCourse.startTime||'',endTime:props.seedCourse.endTime||'',weeks:props.seedCourse.weeks||'',room:props.seedCourse.room||'',...(props.seedCourse.weekday?{weekday:props.seedCourse.weekday}:{})})
const rosterEnabled=ref(false),rosterMode=ref('CLASS'),groupName=ref(''),rosterStudents=ref([])
const selectedCourseClass=ref(null),selectedCourseTeacher=ref(null)
watch(()=>course.teacherId,value=>{if(selectedCourseTeacher.value?.value!==value)selectedCourseTeacher.value=null})
watch(principal,()=>{selectedCourseTeacher.value=null},{flush:'sync'})
const lifecycleEnabled=ref(false),readmissionEnabled=ref(false),reenrollmentEnabled=ref(false),governanceEnabled=ref(false)
const modeReviewEnabled=ref(false)
const administrativeAuditEnabled=ref(false)
const responsibilityMode=ref('checking'),responsibilityDraft=ref(false),lessonChangeDraft=ref(false)
const courseKey = () => JSON.stringify([Object.entries(course).filter(([key]) => key !== 'id'),rosterMode.value,groupName.value,rosterStudents.value.map(m=>m.id).sort()])
const savedCourse = ref(courseKey())
const grant = reactive({ userId: '', viewRole: 'COUNSELOR', scopeKey: '' })
const selected = computed(() => preview.value?.classes[selectedGroup.value])
const hasDraft = computed(() => lessonChangeDraft.value || responsibilityDraft.value || !!preview.value || courseKey() !== savedCourse.value || !!grant.userId || !!grant.scopeKey || members.value.some(m => String(m.userId || '') !== (accountInputs[m.id] || '')))
useUnsavedChanges(() => hasDraft.value, () => busy.value)
let generation = 0, controller, disposed = false
let lastWorkflowFocus=''
const workflowKey=computed(()=>props.workflow?JSON.stringify([principal.value,props.workflow.tool,props.workflow.from,props.workflow.to,props.workflow.kind,props.workflow.expiredOnly]):'')
watch([available,workflowKey,busy,hasDraft],async()=>{
  const key=workflowKey.value,owner=principal.value,tool=props.workflow?.tool
  if(!key||key===lastWorkflowFocus||!available.value||busy.value||hasDraft.value||props.workflow?.error||props.courseOnly)return
  await nextTick()
  if(disposed||owner!==principal.value||key!==workflowKey.value||busy.value||hasDraft.value)return
  const selectors={evidence:'.teaching-governance','management-history':'.management-audit',lifecycle:'.lifecycle-panel','course-members':'.withdrawal-panel','course-source':'.course-mode-panel','account-binding':'[data-teaching-tool="account-binding"]',responsibility:'[data-teaching-tool="responsibility"]'}
  const target=selectors[tool]?configElement.value?.querySelector(selectors[tool]):null
  if(focusWorkflowElement(target,()=>!disposed&&owner===principal.value&&key===workflowKey.value&&!busy.value&&!hasDraft.value))lastWorkflowFocus=key
},{flush:'post'})
const { confirm,confirming } = useScopedConfirmation(() => `${principal.value}:${loadedBindingClass.value}:${course.id}:${courseKey()}`, () => !disposed && !!principal.value)
watch([busy,confirming,hasDraft],()=>emit('state',{busy:busy.value||confirming.value,dirty:hasDraft.value}),{immediate:true})
const classIds = new Map()
function begin() {
  controller?.abort(); controller = new AbortController()
  const epoch = ++generation, owner = principal.value, signal = controller.signal
  busy.value = true; error.value = ''; notice.value = ''
  return { signal, current: () => !disposed && !!owner && owner === principal.value && epoch === generation && !signal.aborted }
}
async function operation(action) {
  if (busy.value || confirming.value || !principal.value) return
  const op = begin()
  try { await action(op) }
  catch (failure) { if (op.current()) error.value = failure.response?.data?.message || failure.message || '操作失败，未覆盖已有资料' }
  finally { if (op.current()) busy.value = false }
}
async function load() {
  await operation(async op => {
    const query = { kind: 'CLASS', page: 0, size: 1, selected: '' }
    const capabilities=await readTeachingCapabilities(op.signal)
    if(!op.current())return
    if(typeof capabilities.data?.rosterEnabled!=='boolean' || capabilities.data?.maxCourseMembers!==2000)throw new Error('教学配置能力响应异常，请重新读取')
    const { data } = await readTeachingConfigPage(query, op.signal)
    if (!op.current()) return
    validatedConfigPage(data, query); rosterEnabled.value=capabilities.data.rosterEnabled;available.value = true; refresh.value++
    lifecycleEnabled.value=capabilities.data.lifecycleEnabled===true
    readmissionEnabled.value=capabilities.data.readmissionEnabled===true
    reenrollmentEnabled.value=capabilities.data.reenrollmentEnabled===true
    governanceEnabled.value=capabilities.data.governanceEnabled===true
    modeReviewEnabled.value=capabilities.data.enrollmentModeReviewEnabled===true
    administrativeAuditEnabled.value=capabilities.data.administrativeAuditEnabled===true
    responsibilityMode.value='checking'
    try{const reply=await readTeachingResponsibilityAccess(op.signal);if(!op.current())return;if(typeof reply.data?.enabled!=='boolean'||reply.data.maxPageSize!==100||reply.data.reasonRequired!==true)throw new Error('负责范围能力响应异常');responsibilityMode.value=reply.data.enabled?'controlled':'legacy'}
    catch(failure){if(op.current())responsibilityMode.value=failure.response?.status===404?'legacy':'unavailable'}
  })
}
async function chooseFile(event) {
  const file = event.target.files?.[0]; event.target.value = ''
  if (!file) return
  await operation(async op => {
    const parsed = await readRosterUpload(file, op.signal)
    if (!op.current()) return
    preview.value = parsed; selectedGroup.value = 0; consent.value = false; classIds.clear()
    for (const group of parsed.classes) classIds.set(group.className, crypto.randomUUID())
    notice.value = '文件已在本机解析，尚未上传；按班级分组，其他列已忽略。'
  })
}
async function saveClass() {
  if (!selected.value || !college.value.trim() || !consent.value) return
  await operation(async op => {
    const group = selected.value
    const { data } = await createTeachingClass({ id: classIds.get(group.className), college: college.value.trim(), name: group.className, members: group.members }, op.signal)
    if (!op.current()) return
    if (data?.id !== classIds.get(group.className)) throw new Error('保存回执目标不一致，请核对后再操作，不自动重发')
    notice.value = `班级已保存；人员未自动绑定账号。班级编号：${data.id}`
    consent.value = false; refresh.value++
  })
}
async function saveCourse() {
  if(busy.value || confirming.value)return
  if(selectedCourseTeacher.value?.value!==course.teacherId){error.value='请从本校教师选择器核对具体账号；不按同名直接绑定';return}
  const fingerprint=courseKey(),target=course.id
  if(rosterMode.value==='SELECTED' && (!rosterEnabled.value || !groupName.value.trim() || !rosterStudents.value.length || rosterStudents.value.length>2000)){error.value='填写教学组名称并勾选1至2000名已核实学生';return}
  const description=rosterMode.value==='SELECTED'?`${groupName.value}，已勾选${rosterStudents.value.length}人`:'所选行政班的完整名单'
  const classLabel=selectedCourseClass.value?.value===course.classId?[selectedCourseClass.value.description,selectedCourseClass.value.label].filter(Boolean).join(' · '):course.classId
  const teacherLabel=[selectedCourseTeacher.value.description,selectedCourseTeacher.value.label].filter(Boolean).join(' · ')
  const confirmation=`课程：${course.name}\n班级：${classLabel}\n教师账号：${teacherLabel} · 编号${course.teacherId}（不是学号）\n学期：${course.semester}；第1周周一：${course.firstMonday}\n周${course.weekday} ${course.startTime}—${course.endTime}；第${course.weeks}周\n教室：${course.room}\n名单：${description}。确认后建立整学期单次课；教师端与学生端读取同一课程和单次课编号。`
  if(!await confirm(confirmation,{title:'核对课程与名单',confirmText:'确认创建课程',...(props.courseOnly?{className:'ct-chat-course-confirm'}:{})}))return
  if(target!==course.id || fingerprint!==courseKey()){error.value='课程草稿已变化，请重新核对后提交';return}
  await operation(async op => {
    const input={ ...course, teacherId: Number(course.teacherId), weekday: Number(course.weekday), weeks: parseCourseWeeks(course.weeks) }
    const { data } = await (rosterMode.value==='SELECTED'?createTeachingRosterCourse({course:input,groupName:groupName.value.trim(),studentIds:rosterStudents.value.map(m=>m.id)},op.signal):createTeachingCourse(input,op.signal))
    if (!op.current()) return
    if (data?.id !== target) throw new Error('课程回执目标不一致，请重新核对，不自动重发')
    notice.value = `课程与整学期单次课已保存，任课教师：${teacherLabel}。课程编号：${target}；相同教师账号可继续绑定其他课程。`
    emit('saved',{id:target,message:`教学课程“${course.name}”已保存；名单与提醒按原业务规则生成。`})
    course.id = crypto.randomUUID(); course.name = ''; savedCourse.value = courseKey();refresh.value++
  })
}
async function changeRosterMode(event){const next=event.target.value;if(next===rosterMode.value)return;if(rosterStudents.value.length && !await confirm('切换名单方式不会清除勾选草稿，但整班方式不采用勾选名单。请确认创建对象。',{title:'切换名单方式？',confirmText:'确认切换'})){event.target.value=rosterMode.value;return}rosterMode.value=next}
async function saveGrant() {
  await operation(async op => {
    await setTeachingGrant({ ...grant, userId: Number(grant.userId) }, op.signal)
    if (op.current()) { notice.value = '负责范围已保存；未改变平台管理员角色。'; grant.userId = ''; grant.scopeKey = '' }
  })
}
async function loadMembers() {
  if (members.value.some(m => String(m.userId || '') !== (accountInputs[m.id] || '')) && !(await confirm('当前账号绑定修改未保存。读取另一份名单会放弃这些修改。', { title: '保留绑定修改？', confirmText: '放弃修改并读取' }))) return
  await operation(async op => {
    const { data } = await readTeachingMembers(bindingClass.value, op.signal)
    if (!op.current()) return
    if (!Array.isArray(data) || data.length > 300) throw new Error('名单响应异常')
    members.value = data; loadedBindingClass.value = bindingClass.value
    for (const key of Object.keys(accountInputs)) delete accountInputs[key]
    for (const member of data) accountInputs[member.id] = String(member.userId || '')
  })
}
async function bind(member) {
  if (bindingClass.value !== loadedBindingClass.value) return
  await operation(async op => {
    const value = accountInputs[member.id].trim()
    if (value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)) throw new Error('填写已核实的本校账号编号，不是学号')
    const userId = value ? Number(value) : null
    await bindTeachingMember(member.id, { userId, expectedUserId: member.userId }, op.signal)
    if (op.current()) { member.userId = userId; notice.value = '账号绑定已保存并记录更正审计。' }
  })
}
function clear() { if (busy.value) return; preview.value = null; consent.value = false; college.value = ''; notice.value = ''; classIds.clear() }
watch(selectedGroup, () => { consent.value = false })
watch(principal,()=>{governanceEnabled.value=false},{flush:'sync'})
watch(principal,()=>{modeReviewEnabled.value=false},{flush:'sync'})
watch(principal,()=>{administrativeAuditEnabled.value=false},{flush:'sync'})
watch(principal,()=>{responsibilityMode.value='checking';responsibilityDraft.value=false},{flush:'sync'})
watch(principal, () => { generation++; controller?.abort(); busy.value = false; available.value = false; rosterEnabled.value=false;lifecycleEnabled.value=false;readmissionEnabled.value=false;reenrollmentEnabled.value=false;rosterMode.value='CLASS';groupName.value='';rosterStudents.value=[];members.value = []; preview.value = null; college.value = ''; loadedBindingClass.value = ''; bindingClass.value = ''; consent.value = false; notice.value = ''; error.value = ''; for (const key of Object.keys(accountInputs)) delete accountInputs[key]; Object.assign(course, { id: crypto.randomUUID(), classId: '', teacherId: '', name: '', semester: '', firstMonday: '', weekday: 1, startTime: '', endTime: '', weeks: '', room: '' }); savedCourse.value = courseKey(); Object.assign(grant, { userId: '', viewRole: 'COUNSELOR', scopeKey: '' }); if (principal.value) load() }, { flush: 'sync' })
onMounted(load)
onBeforeUnmount(() => { disposed = true; generation++; controller?.abort(); preview.value = null; members.value = [] })
</script>

<template>
  <section ref="configElement" class="teaching-config" :class="{'course-only':courseOnly}" aria-label="管理员教学归属配置">
    <h2 v-if="!courseOnly">教学归属配置</h2><p>只配置本校已核实账号。名单不公开，不发给模型，不按姓名自动绑定。</p>
    <p v-if="error" class="config-error" role="alert">{{ error }} <button type="button" :disabled="busy" @click="load">重新读取配置</button></p>
    <p v-if="notice" class="config-notice" role="status">{{ notice }}</p>
    <template v-if="available">
      <details v-if="!courseOnly"><summary>导入班级花名册</summary>
        <label class="file-label">选择XLSX或CSV<input type="file" accept=".xlsx,.csv" :disabled="busy" @change="chooseFile" /></label>
        <p>本机只解析班级、姓名、学号；先预览，再确认保存。含多班时自动分组。</p>
        <form v-if="preview" @submit.prevent="saveClass">
          <label>目标班级<select v-model="selectedGroup" :disabled="busy"><option v-for="(group, index) in preview.classes" :key="group.className" :value="index">{{ group.className }} · {{ group.members.length }}人</option></select></label>
          <label>所属学院<input v-model="college" maxlength="100" :disabled="busy" required /></label>
          <p>预览 {{ selected.members.length }}人，忽略{{ preview.ignoredColumns }}列。当前不绑定任何学生账号。</p>
          <ul class="roster-preview"><li v-for="(member, i) in selected.members.slice(0, 5)" :key="member.studentNumber">{{ i + 1 }}. {{ member.name }} · {{ member.studentNumber }}</li></ul>
          <label class="config-consent"><input v-model="consent" type="checkbox" :disabled="busy" /> 已核对本班名单、学院与使用授权</label>
          <div><button :disabled="busy || !consent || !college.trim()">{{ busy ? '处理中' : '保存这个班级' }}</button><button type="button" :disabled="busy" @click="clear">清除本机预览</button></div>
        </form>
      </details>
      <details :open="courseOnly"><summary>绑定任课课程</summary>
        <form @submit.prevent="saveCourse">
          <TeachingScopePicker v-model="course.classId" :owner="principal" :label="rosterMode==='SELECTED'?'主办行政班':'课程班级'" :disabled="busy || confirming" :refresh="refresh" @selected="selectedCourseClass=$event" />
          <label>名单方式<select :value="rosterMode" :disabled="busy || confirming" @change="changeRosterMode"><option value="CLASS">整行政班</option><option value="SELECTED" :disabled="!rosterEnabled">逐人勾选 · 选修/合班</option></select></label>
          <p v-if="!rosterEnabled">独立教学名单尚未启用，当前只可创建整班课程。</p>
          <template v-if="rosterMode==='SELECTED'"><label>教学组名称<input v-model="groupName" maxlength="100" required :disabled="busy || confirming" placeholder="例如：物联网选修教学组" /></label><TeachingRosterPicker v-model="rosterStudents" :owner="principal" :disabled="busy || confirming" :refresh="refresh" /></template>
          <TeachingScopePicker v-model="course.teacherId" :owner="principal" label="任课教师账号" kind="TEACHER" :disabled="busy || confirming" :refresh="refresh" @selected="selectedCourseTeacher=$event" />
          <label>课程名称<input v-model="course.name" maxlength="100" required :disabled="busy" /></label><label>学期<input v-model="course.semester" maxlength="100" required :disabled="busy" /></label>
          <label>第1周周一<DateField v-model="course.firstMonday" required :disabled="busy"  monday-only /></label>
          <label>星期<select v-model="course.weekday" :disabled="busy" required><option v-if="courseOnly" value="" disabled>选择星期</option><option v-for="(day, i) in ['一','二','三','四','五','六','日']" :key="day" :value="i + 1">周{{ day }}</option></select></label>
          <label>开始钟点<input v-model="course.startTime" type="time" required :disabled="busy" /></label><label>结束钟点<input v-model="course.endTime" type="time" required :disabled="busy" /></label>
          <label>上课周次<input v-model="course.weeks" placeholder="例如1-16单，或1;3;5" required :disabled="busy" /></label><label>教室<input v-model="course.room" maxlength="100" required :disabled="busy" /></label>
          <p>先核对教师姓名与登录账号，再明确任课绑定；学生端和教师端共用该课程及各日期的单次课记录。同名不会自动认领。教师可绑定多门课程，已建课程不静默改写；调课需取消旧课并配置新安排。选修/合班以勾选名单为准，主办班不授予整组权限。</p><button class="config-primary" :disabled="busy || confirming || !course.classId || !course.teacherId || selectedCourseTeacher?.value!==course.teacherId || (rosterMode==='SELECTED' && (!rosterEnabled || !groupName.trim() || !rosterStudents.length))">核对并保存课程</button>
        </form>
      </details>
      <TeachingWithdrawalPanel v-if="!courseOnly && rosterEnabled" :owner="principal" :refresh="refresh" :allow-reenroll="reenrollmentEnabled" />
      <TeachingLessonChangesPanel v-if="!courseOnly && lifecycleEnabled" :owner="principal" :actor-id="auth.user.id" :disabled="busy||confirming||responsibilityDraft" @state="lessonChangeDraft=$event.dirty||$event.busy" @saved="refresh++;emit('saved',$event)" />
      <TeachingLifecyclePanel v-if="!courseOnly && lifecycleEnabled" :owner="principal" :refresh="refresh" :allow-restore="readmissionEnabled" />
      <TeachingCourseModePanel v-if="!courseOnly && modeReviewEnabled" :owner="principal" :actor-id="auth.user.id" :refresh="refresh" :disabled="busy || confirming" />
      <TeachingGovernancePanel v-if="!courseOnly && governanceEnabled" :key="workflow?.tool==='evidence'?workflowKey:'admin-evidence'" :owner="principal" preferred-view="ADMIN" :active="!busy && !confirming && !hasDraft" :preset="workflow?.tool==='evidence'&&!workflow.error?workflow:null" />
      <TeachingAdministrativeAuditPanel v-if="!courseOnly && administrativeAuditEnabled" :key="workflow?.tool==='management-history'?workflowKey:'admin-management'" :owner="principal" :active="!busy && !confirming && !hasDraft" :preset="workflow?.tool==='management-history'&&!workflow.error?workflow:null" />
      <details v-if="!courseOnly" data-teaching-tool="account-binding"><summary>绑定学生账号</summary>
        <form @submit.prevent="loadMembers"><TeachingScopePicker v-model="bindingClass" :owner="principal" label="学生行政班" :disabled="busy" :refresh="refresh" /><button :disabled="busy || !bindingClass">读取名单</button></form>
        <p v-if="members.length">已读取名单{{ members.length }}人。如已选择其他班，请先读取对应名单；不会把当前名单的修改保存到新班级。</p>
        <ul class="binding-list"><li v-for="member in members" :key="member.id"><span>{{ member.name }}<small>{{ member.studentNumber }}</small></span><label><span class="binding-label">本人账号编号</span><input v-model="accountInputs[member.id]" inputmode="numeric" :disabled="busy" /></label><button type="button" :disabled="busy || bindingClass !== loadedBindingClass || String(member.userId || '') === accountInputs[member.id]" @click="bind(member)">保存绑定</button></li></ul>
      </details>
      <TeachingResponsibilityPanel v-if="!courseOnly && responsibilityMode==='controlled'" :owner="principal" :actor-id="auth.user.id" :refresh="refresh" :disabled="busy || confirming" @state="responsibilityDraft=$event.dirty||$event.busy" />
      <p v-if="!courseOnly && responsibilityMode==='unavailable'" role="alert">负责范围服务未就绪，请重新读取配置；不会退回旧入口绕过核对。</p>
      <details v-if="!courseOnly && responsibilityMode==='legacy'" data-teaching-tool="responsibility"><summary>配置辅导员与书记负责范围</summary>
        <form @submit.prevent="saveGrant"><label>已核实账号编号<input v-model="grant.userId" inputmode="numeric" pattern="[0-9]+" required :disabled="busy" /></label><label>角色<select v-model="grant.viewRole" :disabled="busy" @change="grant.scopeKey = ''"><option value="COUNSELOR">辅导员</option><option value="SECRETARY">书记</option></select></label>
          <TeachingScopePicker v-model="grant.scopeKey" :owner="principal" :kind="grant.viewRole === 'SECRETARY' ? 'COLLEGE' : 'CLASS'" label="负责范围" :disabled="busy" :refresh="refresh" /><button :disabled="busy || !grant.scopeKey">保存负责范围</button></form>
      </details>
    </template>
  </section>
</template>
<style scoped>
:global(.ct-chat-course-confirm .el-message-box__btns button){min-height:44px;font-size:16px}:global(.ct-chat-course-confirm .el-message-box__message){white-space:pre-line;max-height:55dvh;overflow-y:auto;font-size:16px;line-height:1.7}:global(.ct-chat-course-confirm .el-message-box__headerbtn){width:44px;height:44px}
.course-only{padding-top:0!important;border-top:0!important;margin-top:0!important}.course-only input,.course-only select,.course-only button{font-size:16px}.course-only label{font-size:15px}
.config-primary{background:var(--assistant-accent,#2b63cf);color:#fff;border-color:var(--assistant-accent,#2b63cf)}.config-primary:hover{background:var(--assistant-accent-hover,#214ea6)}
.teaching-config{padding-top:26px;border-top:1px solid var(--assistant-line,#e2e7ec);margin-top:32px;color:var(--assistant-ink,#29323c)}h2{font-size:20px;font-weight:600;margin:0 0 8px}.teaching-config p{font-size:13px;color:var(--assistant-muted,#5d6876);line-height:1.8;margin:8px 0}details{border-bottom:1px solid var(--assistant-line,#e2e7ec);padding:12px 0}summary{min-height:44px;align-content:center;font-size:15px;cursor:pointer}form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;max-width:760px;margin:16px 0}label{display:flex;flex-direction:column;gap:6px;font-size:13px}input,select,button{font:inherit;color:inherit;background:#fff;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;min-height:44px;padding:9px 12px;min-width:0}button{cursor:pointer;transition:background-color 180ms ease-out}button:hover{background:var(--assistant-soft,#eaf0f6)}:disabled{opacity:.6;cursor:not-allowed}form>p,form>ul,form>div,.config-consent{grid-column:1/-1}form>div{display:flex;flex-wrap:wrap;gap:10px}.config-consent{flex-direction:row;align-items:center;gap:8px}.config-consent input{min-height:20px;width:20px}.file-label{max-width:320px}.roster-preview{font-size:14px;list-style:none;padding:0;margin:0}.binding-list{list-style:none;padding:0;margin:16px 0;max-width:760px}.binding-list li{display:grid;grid-template-columns:minmax(90px,1fr) minmax(100px,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--assistant-line,#e2e7ec)}.binding-list small{display:block;font-size:12px;color:var(--assistant-muted,#5d6876)}.binding-label{font-size:12px}.teaching-config .config-error{color:#a24439}.config-notice{overflow-wrap:anywhere}:focus-visible{outline:2px solid var(--assistant-accent,#536f90);outline-offset:3px}@media(max-width:760px){form{grid-template-columns:1fr}.binding-list li{grid-template-columns:1fr 1fr}.binding-list li>button{grid-column:2}.file-label{max-width:none}}@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
