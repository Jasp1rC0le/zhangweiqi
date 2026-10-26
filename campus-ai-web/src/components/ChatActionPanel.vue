<script setup>
import { computed,nextTick,onBeforeUnmount,onMounted,reactive,ref,watch } from 'vue'
import { readCourseSchedule,saveCourseSchedule } from '@/api/courseSchedule'
import { readTeachingAccess,readTeachingLessonsPage,readTeachingLessonPage,saveRollCallPage } from '@/api/teaching'
import { getEditableKnowledgePage,getKnowledgeDocument,reviseKnowledgeDocument,importKnowledgeDocument } from '@/api/admin'
import { createChatActionResource } from '@/utils/chatActions'
import { planActionFollowup } from '@/utils/chatActionFollowup'
import { validatedCourseSnapshot } from '@/utils/privateCourseSchedule'
import { validatedLessonPage,validatedDetailPage,TEACHING_VIEWS,ATTENDANCE_STATUSES,QUICK_ATTENDANCE,teachingDate,teachingClock } from '@/utils/teaching'
import { chinaDate,addDays } from '@/utils/timetable'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import ChatTeachingCoursePanel from './ChatTeachingCoursePanel.vue'
import TeachingLessonChangesPanel from './TeachingLessonChangesPanel.vue'
import ChatPrivateCourseEditPanel from './ChatPrivateCourseEditPanel.vue'

const props=defineProps({intent:{type:Object,required:true},scope:{type:String,required:true},user:{type:Object,required:true},active:Boolean})
const emit=defineEmits(['state','done'])
const state=reactive({busy:false,phase:'editing',preview:null,error:'',notice:''}),reading=ref(false),loaded=ref(false),formalBusy=ref(false)
const resource=createChatActionResource({owner:()=>props.active?props.scope:'',state,api:{readSchedule:readCourseSchedule,saveSchedule:saveCourseSchedule,readDetail:readTeachingLessonPage,saveMarks:saveRollCallPage,readDocument:getKnowledgeDocument,reviseDocument:reviseKnowledgeDocument,importDocument:importKnowledgeDocument}})
const kind=props.intent.kind,seed=props.intent.seed||{},snapshot=ref(null)
const form=reactive({revision:0,semester:'',firstMonday:'',course:{name:seed.name||'',weekday:seed.weekday||'',startTime:seed.startTime||'',endTime:seed.endTime||'',startPeriod:seed.startPeriod||'',endPeriod:seed.endPeriod||'',weeks:seed.weeks||'',room:seed.room||''}})
const periodMode=ref(!!seed.startPeriod)
const roles=ref([]),role=ref(''),date=ref(chinaDate()),until=ref(addDays(chinaDate(),6)),courseSearch=ref(seed.course||seed.search||''),courses=ref(null),lessonId=ref(''),rosterSearch=ref(seed.student||''),roster=ref(null),studentId=ref(''),attendanceStatus=ref(seed.status||''),reason=ref('')
const documentSearch=ref(seed.search||''),documents=ref(null),documentId=ref(''),currentDocument=ref(null),publicConsent=ref(false)
const knowledge=reactive({title:'',category:'',sourceDepartment:'',sourceUrl:'',publishedAt:null,effectiveAt:null,expiresAt:null,content:''})
const busy=computed(()=>state.busy||reading.value||formalBusy.value),locked=computed(()=>busy.value||!props.active||state.phase==='preview'||state.phase==='uncertain'||state.phase==='saved')
const title=({PERSONAL_COURSE:'新增个人课程',PERSONAL_COURSE_EDIT:'修改本人已保存课程',TEACHING_COURSE:'新增教学安排',TEACHING_LESSON_CHANGE:'调整已建的一节课',ATTENDANCE:'记录一名同学的考勤',ATTENDANCE_QUERY:'查询授权范围考勤',KNOWLEDGE:seed.mode==='CREATE'?'新增知识资料':'修改知识资料'})[kind]
const selectedStudent=computed(()=>roster.value?.detail.entries.find(e=>e.studentId===studentId.value))
const followupNotice=ref(''),followupElement=ref(),confirmationButton=ref(),formalPanel=ref(),formalPhase=ref('editing')
let generation=0,controller,disposed=false
function invalidate(){resource.invalidate()}
function beginRead(){controller?.abort();controller=new AbortController();const epoch=++generation,scope=props.scope,signal=controller.signal;reading.value=true;state.error='';return{signal,current:()=>!disposed&&props.active&&props.scope===scope&&epoch===generation&&!signal.aborted}}
async function read(action){if(busy.value||!props.active)return;const op=beginRead();try{await action(op)}catch(e){if(op.current())state.error=e.response?.data?.message||e.message||'读取失败，请重试'}finally{if(op.current())reading.value=false}}
async function loadCourses(page=0){
  courses.value=null;lessonId.value='';roster.value=null;studentId.value='';invalidate()
  await read(async op=>{const {data}=await readTeachingLessonsPage(role.value,date.value,until.value,op.signal,page,courseSearch.value.trim());if(op.current())courses.value=validatedLessonPage(data,page)})
}
async function loadRoster(page=0){
  roster.value=null;studentId.value='';reason.value='';invalidate();if(!lessonId.value)return
  await read(async op=>{const search=rosterSearch.value.trim(),{data}=await readTeachingLessonPage(lessonId.value,kind==='ATTENDANCE'?'TEACHER':role.value,page,search,op.signal);if(op.current())roster.value=validatedDetailPage(data,lessonId.value,page,search)})
}
async function loadDocuments(page=0){
  documents.value=null;documentId.value='';currentDocument.value=null;invalidate()
  await read(async op=>{const data=await getEditableKnowledgePage(page,documentSearch.value.trim(),op.signal);if(!op.current())return
    if(data?.page!==page||data.size!==25||data.search!==documentSearch.value.trim()||!Number.isSafeInteger(data.total)||data.total<0||data.totalPages!==Math.ceil(data.total/25)||!Array.isArray(data.items)||data.items.length!==Math.min(25,Math.max(0,data.total-page*25))||data.items.some(d=>!Number.isSafeInteger(d.id)||d.id<1||typeof d.title!=='string')||new Set(data.items.map(d=>d.id)).size!==data.items.length)throw new Error('知识分页响应异常')
    documents.value=data
  })
}
async function loadDocument(){
  currentDocument.value=null;invalidate();if(!documentId.value)return
  await read(async op=>{const doc=await getKnowledgeDocument(Number(documentId.value),{signal:op.signal});if(!op.current())return
    if(doc.id!==Number(documentId.value)||doc.schoolId!==props.user.schoolId||doc.status!=='PUBLISHED'||doc.hasSuccessor||typeof doc.rawContent!=='string'||!/^[a-f0-9]{64}$/.test(doc.revisionTag))throw new Error('资料目标、学校或核对版本异常')
    currentDocument.value=doc;for(const key of Object.keys(knowledge))knowledge[key]=key==='content'?doc.rawContent:doc[key]??(key.endsWith('At')?null:'')
    publicConsent.value=false
  })
}
async function initialize(){
  loaded.value=false
  if(['TEACHING_COURSE','TEACHING_LESSON_CHANGE','PERSONAL_COURSE_EDIT'].includes(kind)){loaded.value=true;return}
  if(kind==='KNOWLEDGE'){
    if(props.user.role!=='ADMIN'){state.error='只有正常管理员会话可以维护本校公共知识库。普通用户可使用“补充校园信息”提交审核。';return}
    loaded.value=true;if(seed.mode!=='CREATE')await loadDocuments();return
  }
  await read(async op=>{
    if(kind==='PERSONAL_COURSE'){
      const {data}=await readCourseSchedule(op.signal);if(!op.current())return
      snapshot.value=validatedCourseSnapshot(data?.schedule);form.revision=snapshot.value?.revision||0
      form.semester=snapshot.value?.semester||'';form.firstMonday=snapshot.value?.firstMonday||''
    }else{
      const {data}=await readTeachingAccess(op.signal);if(!op.current())return
      if(!data?.enabled||!Array.isArray(data.views)||data.views.some(v=>!Object.hasOwn(TEACHING_VIEWS,v)))throw new Error('教学模块尚未启用，或权限暂时无法读取；不会从公共库猜测人员记录')
      roles.value=kind==='ATTENDANCE'?data.views.filter(v=>v==='TEACHER'):data.views
      if(!roles.value.length)throw new Error(kind==='ATTENDANCE'?'只有已绑定课程的任课教师可以记录考勤，管理员身份不会自动取得点名权。':'当前账号还没有教学归属。')
      role.value=roles.value[0]
    }
    loaded.value=true
  })
  if(loaded.value&&['ATTENDANCE','ATTENDANCE_QUERY'].includes(kind))await loadCourses()
}
async function preview(){
  let input
  if(kind==='PERSONAL_COURSE')input={kind,form:{...form,course:{...form.course,weekday:Number(form.course.weekday),...(periodMode.value?{startTime:null,endTime:null,startPeriod:Number(form.course.startPeriod),endPeriod:Number(form.course.endPeriod)}:{startPeriod:null,endPeriod:null})}}}
  else if(kind==='ATTENDANCE'){
    const student=selectedStudent.value;if(!student||!roster.value){state.error='请明确选择课程和同学，不能仅按姓名批量记旷课';return}
    input={kind,lessonId:lessonId.value,page:roster.value.page,search:roster.value.search,revision:roster.value.detail.lesson.revision,studentId:student.studentId,studentNumber:student.studentNumber,studentName:student.name,status:attendanceStatus.value,reason:reason.value}
  }else input={kind,mode:seed.mode,documentId:Number(documentId.value),revisionTag:currentDocument.value?.revisionTag,document:{...knowledge},schoolId:props.user.schoolId,publicConsent:publicConsent.value}
  await resource.preview(input)
}
async function save(){if(await resource.execute())emit('done',{message:state.notice,saved:true})}
function cancel(){if(busy.value)return;emit('done',state.phase==='uncertain'||['TEACHING_COURSE','TEACHING_LESSON_CHANGE','PERSONAL_COURSE_EDIT'].includes(kind)&&formalPhase.value==='uncertain'?'这项操作已收起，保存结果仍需到原业务页面核对；不要重复提交。':'这项操作已取消，没有提交修改。')}
async function handleFollowup(text,requestScope){
  if(['TEACHING_COURSE','TEACHING_LESSON_CHANGE','PERSONAL_COURSE_EDIT'].includes(kind))return formalPanel.value?.handleFollowup(text,requestScope)||{accepted:false,preserveInput:true,message:'当前操作面板或归属尚未就绪；未保存或发给模型。'}
  const owner=props.scope,current=()=>!disposed&&props.active&&props.scope===owner&&requestScope===owner
  const plan=planActionFollowup(text,{kind,phase:state.phase,busy:busy.value,active:current(),loaded:loaded.value,scope:owner,requestScope,form,periodMode:periodMode.value,metadataLocked:!!snapshot.value,selectedStudent:selectedStudent.value,canMark:roster.value?.detail.canMark===true,canRecordAbsence:roster.value?.detail.canRecordAbsence===true,status:attendanceStatus.value,reason:reason.value,userRole:props.user.role,knowledge,revising:seed.mode==='REVISE',documentReady:!!currentDocument.value})
  if(plan.type==='CANCEL'){const message=state.phase==='uncertain'?'操作已收起，之前的保存结果仍需原业务页核对；没有重发。':'本次草稿已取消，没有提交修改。';cancel();return{accepted:true,closed:true,message}}
  followupNotice.value=plan.message
  if(['BLOCKED','CLARIFY'].includes(plan.type))return{accepted:false,message:plan.message,preserveInput:true}
  if(plan.type==='PATCH'){
    resource.invalidate()
    if(kind==='PERSONAL_COURSE'){Object.assign(form.course,plan.patch.course);Object.assign(form,plan.patch.metadata);if(Object.hasOwn(plan.patch,'periodMode'))periodMode.value=plan.patch.periodMode}
    else if(kind==='ATTENDANCE'){if(Object.hasOwn(plan.patch,'status'))attendanceStatus.value=plan.patch.status;if(Object.hasOwn(plan.patch,'reason'))reason.value=plan.patch.reason}
    else {Object.assign(knowledge,plan.patch);publicConsent.value=false}
  }
  if(plan.type==='PREVIEW'){
    await preview();if(!current())return{accepted:false,message:'操作归属已变化，没有在新账号展示旧预览。'}
    followupNotice.value=state.preview?'当前版本已重新核对并生成预览；请阅读目标和变更，再点击“确认保存”。':state.error||'字段尚未齐全，请补充后重新预览；没有保存。'
    if(!state.preview)return{accepted:false,message:followupNotice.value,preserveInput:true}
  }
  await nextTick()
  if(!current())return{accepted:false,message:'操作归属已变化，没有继续处理旧补充。'}
  const target=plan.type==='CONFIRM_BUTTON'?confirmationButton.value:followupElement.value
  target?.scrollIntoView({block:'start',behavior:'auto'})
  return{accepted:true,message:followupNotice.value}
}
defineExpose({handleFollowup})
watch([form,periodMode,studentId,attendanceStatus,reason,knowledge,publicConsent],invalidate,{deep:true})
watch([date,until,role,courseSearch],()=>{courses.value=null;lessonId.value='';roster.value=null;studentId.value='';invalidate()})
watch(rosterSearch,()=>{roster.value=null;studentId.value='';invalidate()})
watch(studentId,()=>{reason.value='';invalidate()})
watch([busy,()=>state.phase,()=>props.active],()=>emit('state',{busy:busy.value,pending:props.active&&!['saved','cancelled'].includes(state.phase)}),{immediate:true})
useUnsavedChanges(()=>props.active&&state.phase!=='saved',()=>busy.value)
onMounted(initialize)
onBeforeUnmount(()=>{disposed=true;generation++;controller?.abort();resource.reset()})
</script>

<template>
  <section class="chat-action" :aria-label="title" :aria-busy="busy">
    <h2>{{ title }}</h2>
    <p v-if="kind!=='ATTENDANCE_QUERY'" class="action-hint">先核对目标与内容，确认后保存。</p>
    <p v-if="followupNotice" ref="followupElement" class="action-followup-notice" role="status">{{ followupNotice }}</p>
    <p v-if="state.error" class="action-error" role="alert">{{ state.error }}</p>
    <p v-if="reading" role="status">正在读取有权访问的记录…</p>
    <ChatPrivateCourseEditPanel v-if="kind==='PERSONAL_COURSE_EDIT'" ref="formalPanel" :scope="scope" :user="user" :active="active" :seed="seed" @state="formalBusy=$event.busy;formalPhase=$event.phase" @done="emit('done',$event)" />
    <ChatTeachingCoursePanel v-else-if="kind==='TEACHING_COURSE' && user.role==='ADMIN'" ref="formalPanel" :scope="scope" :user="user" :active="active" :seed="seed" @state="formalBusy=$event.busy;formalPhase=$event.phase" @done="emit('done',$event)" />
    <p v-else-if="kind==='TEACHING_COURSE'">正式教学安排仅由管理员配置。添加本人课程请发送“新增课程”。</p>
    <TeachingLessonChangesPanel v-else-if="kind==='TEACHING_LESSON_CHANGE' && user.role==='ADMIN'" ref="formalPanel" inline :instructions="seed.instructions" :owner="scope" :actor-id="user.id" :school-id="user.schoolId" :user-role="user.role" :active="active" @state="formalBusy=$event.busy;formalPhase=$event.phase" @closed="emit('done',$event)" @saved="receipt=>emit('done',{saved:true,message:`${receipt.original.name} · ${receipt.original.date} ${receipt.original.startTime}—${receipt.original.endTime}\n${receipt.proposed ? '已调整到 '+receipt.proposed.date+' '+receipt.proposed.startTime+'—'+receipt.proposed.endTime+'，'+receipt.proposed.teacherLabel+'，'+receipt.proposed.room : '本次课已取消'}。原请求回执已回读，其他周次、名单归属和旧考勤保留。`})" />
    <p v-else-if="kind==='TEACHING_LESSON_CHANGE'">调课、代课或取消正式课程仅限正常管理员。任课教师、辅导员和书记身份不会自动获得这项权限；没有读取名单或提交修改。</p>
    <template v-else-if="loaded && state.phase!=='uncertain'">
      <form v-if="kind==='PERSONAL_COURSE' && state.phase!=='preview'" class="action-form" @submit.prevent="preview">
        <p v-if="snapshot" class="wide">保存到 {{ snapshot.semester }}；已有 {{ snapshot.courses.length }} 项安排，均会保留。</p>
        <template v-else><label>学期<input v-model="form.semester" maxlength="100" required :disabled="locked" placeholder="按校历填写" /></label><label>第1周周一<input v-model="form.firstMonday" type="date" required :disabled="locked" /></label></template>
        <label class="wide">课程名称<input v-model="form.course.name" maxlength="100" required :disabled="locked" /></label>
        <label>星期<select v-model="form.course.weekday" required :disabled="locked"><option value="" disabled>选择星期</option><option v-for="(day,i) in ['一','二','三','四','五','六','日']" :key="day" :value="i+1">周{{ day }}</option></select></label>
        <label>上课周次<input v-model="form.course.weeks" required :disabled="locked" placeholder="例如1-16，或1;3;5" maxlength="160" /></label>
        <label class="wide">时间填写方式<select v-model="periodMode" :disabled="locked"><option :value="false">起止钟点</option><option :value="true">开始和结束节次</option></select></label>
        <template v-if="periodMode"><label>开始节次<input v-model="form.course.startPeriod" type="number" min="1" max="16" required :disabled="locked" /></label><label>结束节次<input v-model="form.course.endPeriod" type="number" min="1" max="16" required :disabled="locked" /></label></template>
        <template v-else><label>开始时间<input v-model="form.course.startTime" type="time" required :disabled="locked" /></label><label>结束时间<input v-model="form.course.endTime" type="time" required :disabled="locked" /></label></template>
        <label class="wide">教室<input v-model="form.course.room" maxlength="100" :disabled="locked" placeholder="未确定可留空，不会替你猜" /></label><button class="primary wide" :disabled="locked">预览新增课程</button>
      </form>
      <template v-else-if="['ATTENDANCE','ATTENDANCE_QUERY'].includes(kind) && state.phase!=='preview'">
        <form class="action-form" @submit.prevent="loadCourses(0)">
          <label v-if="kind==='ATTENDANCE_QUERY'" class="wide">查询身份<select v-model="role" :disabled="locked"><option v-for="r in roles" :key="r" :value="r">{{ TEACHING_VIEWS[r] }} · 仅授权范围</option></select></label>
          <label>开始日期<input v-model="date" type="date" required :disabled="locked" /></label><label>结束日期<input v-model="until" type="date" :min="date" :max="addDays(date,30)" required :disabled="locked" /></label>
          <label class="wide">查找课程<input v-model="courseSearch" type="search" maxlength="100" :disabled="locked" placeholder="课程、班级或任课教师" /></label><button class="wide" :disabled="locked">查找授权课程</button>
        </form>
        <template v-if="courses">
          <p class="action-result">课程范围汇总：{{ courses.total }} 项课程；按时 {{ courses.summary.counts.onTime }}、旷课 {{ courses.summary.counts.absent }}、早退 {{ courses.summary.counts.earlyLeave }}、待点名 {{ courses.summary.counts.unknown }} 人次。待点名不计旷课；这不是姓名搜索的小计。</p>
          <div class="action-pages"><button type="button" :disabled="locked || courses.page===0" @click="loadCourses(courses.page-1)">上一页课程</button><span>{{ courses.totalPages?courses.page+1:0 }}/{{ courses.totalPages }}</span><button type="button" :disabled="locked || courses.page+1>=courses.totalPages" @click="loadCourses(courses.page+1)">下一页课程</button></div>
          <label>{{ kind==='ATTENDANCE'?'选择本次课程':'选择课程查看记录' }}<select v-model="lessonId" :disabled="locked" @change="loadRoster(0)"><option value="">请选择，不自动猜课程</option><option v-for="l in courses.items" :key="l.id" :value="l.id">{{ l.course }} · {{ teachingDate(l.startsAt) }} {{ teachingClock(l.startsAt) }} · {{ l.className }}</option></select></label>
          <details v-if="kind==='ATTENDANCE_QUERY'"><summary>查看本页课程摘要</summary><ul class="query-rows"><li v-for="l in courses.items" :key="l.id">{{ l.course }} · {{ teachingDate(l.startsAt) }} {{ teachingClock(l.startsAt) }} · {{ l.room }}<small>任课教师 {{ l.teacher }}；旷课 {{ l.counts.absent }}、早退 {{ l.counts.earlyLeave || 0 }}、待点名 {{ l.counts.unknown }} 人次</small></li></ul></details>
        </template>
        <template v-if="lessonId">
          <form class="action-search" @submit.prevent="loadRoster(0)"><label>查找同学<input v-model="rosterSearch" type="search" maxlength="100" :disabled="locked" placeholder="姓名或学号" /></label><button :disabled="locked">查找名单</button></form>
          <template v-if="roster"><p class="action-hint">共 {{ roster.total }} 个匹配。重名时请按学号核对；只读授权范围，不按同名绑定身份。</p><label v-if="kind==='ATTENDANCE'">选择具体同学<select v-model="studentId" :disabled="locked"><option value="">选择同学与学号</option><option v-for="s in roster.detail.entries" :key="s.studentId" :value="s.studentId">{{ s.name }} · {{ s.studentNumber }} · {{ ATTENDANCE_STATUSES[s.status] }}</option></select></label>
            <ul v-else class="query-rows"><li v-for="s in roster.detail.entries" :key="s.studentId">{{ s.name }} · {{ s.studentNumber }} · {{ ATTENDANCE_STATUSES[s.status] }}</li></ul>
            <div class="action-pages"><button type="button" :disabled="locked || roster.page===0" @click="loadRoster(roster.page-1)">上一页名单</button><span>{{ roster.totalPages?roster.page+1:0 }}/{{ roster.totalPages }}</span><button type="button" :disabled="locked || roster.page+1>=roster.totalPages" @click="loadRoster(roster.page+1)">下一页名单</button></div>
          </template>
          <form v-if="selectedStudent" class="action-form" @submit.prevent="preview"><fieldset class="wide"><legend>记录为</legend><div class="action-options"><button v-for="s in QUICK_ATTENDANCE" :key="s.value" type="button" :aria-pressed="attendanceStatus===s.value" :disabled="locked" @click="attendanceStatus=s.value">{{ s.label }}</button></div></fieldset><label class="wide">更正原因<input v-model="reason" maxlength="300" :required="selectedStudent.status!=='UNKNOWN'||roster.detail.lesson.finalized" :disabled="locked" placeholder="更正已有记录时必填" /></label><button class="primary wide" :disabled="locked">预览考勤变更</button></form>
        </template>
      </template>
      <template v-else-if="kind==='KNOWLEDGE' && state.phase!=='preview'">
        <template v-if="seed.mode==='REVISE' && !currentDocument"><form class="action-search" @submit.prevent="loadDocuments(0)"><label>查找知识资料<input v-model="documentSearch" maxlength="100" type="search" :disabled="locked" placeholder="搜索全部当前版本的标题或分类" /></label><button :disabled="locked">查找资料</button></form>
          <template v-if="documents"><label>选择修订资料<select v-model="documentId" :disabled="locked" @change="loadDocument"><option value="">选择资料，先核读原文</option><option v-for="doc in documents.items" :key="doc.id" :value="String(doc.id)">{{ doc.title }} · {{ doc.category }}</option></select></label><div class="action-pages"><span>共 {{ documents.total }} 份 · {{ documents.totalPages?documents.page+1:0 }}/{{ documents.totalPages }}</span><button type="button" :disabled="locked || documents.page===0" @click="loadDocuments(documents.page-1)">上一页资料</button><button type="button" :disabled="locked || documents.page+1>=documents.totalPages" @click="loadDocuments(documents.page+1)">下一页资料</button></div></template>
        </template>
        <form v-if="seed.mode==='CREATE'||currentDocument" class="action-form" @submit.prevent="preview">
          <p v-if="currentDocument" class="wide">正在修订 #{{ currentDocument.id }} 第{{ currentDocument.versionNumber || 1 }}版；原发布日期、生效/失效日期会保留。更换资料请取消后重新发起。</p>
          <label class="wide">资料标题<input v-model="knowledge.title" maxlength="200" required :disabled="locked" /></label><label>分类<input v-model="knowledge.category" maxlength="50" required :disabled="locked" /></label><label>发布部门<input v-model="knowledge.sourceDepartment" maxlength="100" :disabled="locked" /></label><label class="wide">来源链接<input v-model="knowledge.sourceUrl" type="url" maxlength="1000" :disabled="locked" placeholder="有原文来源时填写" /></label><label class="wide">资料正文<textarea v-model="knowledge.content" maxlength="100000" rows="8" required :disabled="locked"></textarea></label>
          <label class="action-consent wide"><input v-model="publicConsent" type="checkbox" :disabled="locked" /> 已核对内容可在本校公开，不含个人名单、考勤或私人课表</label><button class="primary wide" :disabled="locked || !publicConsent">预览知识资料变更</button>
        </form>
      </template>
      <section v-if="state.preview" class="action-preview" aria-label="确认变更预览"><h3>{{ state.preview.title }}</h3><ul><li v-for="(line,index) in state.preview.lines" :key="line" :class="kind==='ATTENDANCE'&&index===2?`status-${attendanceStatus.toLowerCase()}`:''">{{ line }}</li></ul><details v-if="kind==='KNOWLEDGE'"><summary>核读待发布正文</summary><pre>{{ knowledge.content }}</pre></details><div class="action-buttons"><button ref="confirmationButton" class="primary" type="button" :disabled="busy" @click="save">{{ busy?'正在保存':'确认保存' }}</button><button type="button" :disabled="busy" @click="invalidate">返回修改</button></div></section>
    </template>
    <div class="action-buttons"><button type="button" :disabled="busy" @click="cancel">{{ state.phase==='uncertain'?'收起，先核对记录':kind==='ATTENDANCE_QUERY'?'结束本次查询':'取消，不保存' }}</button><button v-if="(!loaded || (kind==='PERSONAL_COURSE' && state.error)) && kind!=='TEACHING_COURSE' && state.phase!=='uncertain'" type="button" :disabled="busy" @click="initialize">重新读取</button></div>
    <p v-if="kind==='KNOWLEDGE' && state.error" class="action-hint">如需验证管理员会话，请通过原管理后台入口完成，再回来重新读取；不会在聊天中索取密码。</p>
  </section>
</template>

<style scoped>
.action-followup-notice{scroll-margin-top:100px}
.status-absent{color:var(--assistant-danger,#bf303d);font-weight:600}.status-early_leave{color:var(--assistant-warning,#9a5400);font-weight:600}.status-on_time{color:var(--assistant-success,#187248);font-weight:600}
.chat-action{font-size:16px;line-height:1.7;color:var(--assistant-ink,#29323c);min-width:0;max-width:100%;overflow-wrap:anywhere}.chat-action h2{font-size:20px;line-height:1.4;font-weight:600;margin:0 0 12px}.chat-action h3{font-size:18px;margin:0 0 12px}.chat-action p{margin:12px 0}.action-hint{color:var(--assistant-muted,#5d6876);font-size:14px}.action-error{color:var(--assistant-danger,#bf303d)}.action-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:20px 0}.wide{grid-column:1/-1}.chat-action label{display:grid;gap:7px;min-width:0;font-size:15px}.chat-action input,.chat-action select,.chat-action textarea,.chat-action button{font:inherit;font-size:16px;min-height:44px;min-width:0;max-width:100%;box-sizing:border-box;color:inherit;background:var(--assistant-surface,#fff);border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;padding:10px 12px;caret-color:var(--assistant-accent,#0b62db)}.chat-action textarea{resize:vertical;width:100%}.chat-action button{cursor:pointer;transition:background-color 180ms ease-out}.chat-action button:hover{background:var(--assistant-soft,#eaf2ff)}.chat-action button.primary{background:var(--assistant-accent,#0b62db);color:#fff;border-color:transparent}.chat-action button.primary:hover{background:var(--assistant-accent-hover,#084db0)}.chat-action :disabled{opacity:.6;cursor:not-allowed}.chat-action :focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}.action-buttons,.action-pages,.action-options{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-block:16px}.action-pages{font-size:14px;color:var(--assistant-muted,#5d6876);font-variant-numeric:tabular-nums}.action-pages button{font-size:14px}.action-search{display:flex;gap:10px;align-items:end;margin:20px 0;flex-wrap:wrap}.action-search label{flex:1 1 180px}.chat-action fieldset{border:0;margin:0;padding:0}.action-options button[aria-pressed=true]{background:var(--assistant-soft,#eaf2ff);border-color:var(--assistant-accent,#0b62db);color:var(--assistant-accent,#0b62db)}.action-preview{margin-top:24px;padding-top:20px;border-top:1px solid var(--assistant-line,#e2e7ec)}.action-preview ul{padding-left:22px;margin:12px 0}.action-preview pre{white-space:pre-wrap;font:inherit;max-height:320px;overflow:auto}.action-consent{display:flex!important;align-items:center;gap:10px}.action-consent input{width:22px;min-height:22px;height:22px;flex:none}.query-rows{list-style:none;padding:0;margin:20px 0}.query-rows li{padding:14px 0;border-bottom:1px solid var(--assistant-line,#e2e7ec)}.query-rows small{display:block;color:var(--assistant-muted,#5d6876)}@media(max-width:760px){.action-form{grid-template-columns:1fr}.action-buttons>button{flex:1 1 130px}}@media(prefers-reduced-motion:reduce){.chat-action button{transition:none}}
</style>
