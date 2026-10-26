<script setup>
import DateField from '@/components/DateField.vue'
import {computed,nextTick,onBeforeUnmount,onMounted,reactive,ref,watch} from 'vue'
import {readTeachingCapabilities,readTeachingConfigPage,previewTeachingCourse,readTeachingCourseDefinition,createTeachingCourse,createTeachingRosterCourse} from '@/api/teaching'
import {createFormalCourseResource,resolveFormalTarget,formalCoursePayload,formalMissingFields,formalWeeksLabel} from '@/utils/formalCourseDraft'
import {planActionFollowup} from '@/utils/chatActionFollowup'
import {useUnsavedChanges} from '@/utils/useUnsavedChanges'
import {useScopedConfirmation} from '@/utils/useScopedConfirmation'
import TeachingScopePicker from './TeachingScopePicker.vue'
import TeachingRosterPicker from './TeachingRosterPicker.vue'
import '@/styles/teaching-confirmation.css'
const props=defineProps({scope:{type:String,required:true},user:{type:Object,required:true},active:Boolean,seed:{type:Object,default:()=>({})}})
const emit=defineEmits(['state','done'])
const state=reactive({busy:false,phase:'editing',preview:null,error:'',notice:'',canRetry:false}),form=reactive({course:{id:crypto.randomUUID(),classId:'',teacherId:'',name:props.seed.name||'',semester:'',firstMonday:'',weekday:props.seed.weekday||'',startTime:props.seed.startTime||'',endTime:props.seed.endTime||'',weeks:props.seed.weeks||'',room:props.seed.room||''},rosterMode:'CLASS',groupName:'',students:[]})
const loaded=ref(false),resolving=ref(false),rosterEnabled=ref(false),followup=ref(''),focusTarget=ref(),confirmationButton=ref()
let disposed=false,generation=0,controller,seedConsumed=false
const seedOwner=props.scope
const owner=()=>!disposed&&props.active&&props.user.role==='ADMIN'?props.scope:''
const resource=createFormalCourseResource({owner,state,preview:previewTeachingCourse,read:readTeachingCourseDefinition,create:(p,signal)=>p.rosterMode==='SELECTED'?createTeachingRosterCourse({course:p.course,groupName:p.groupName,studentIds:p.studentIds},signal):createTeachingCourse(p.course,signal)})
const {confirm,confirming}=useScopedConfirmation(()=>`${owner()}:${state.preview?.fingerprint||''}`,()=>!!owner())
const busy=computed(()=>state.busy||resolving.value||confirming.value),locked=computed(()=>busy.value||!loaded.value||!owner()||['preview','uncertain','saved'].includes(state.phase))
const missing=computed(()=>formalMissingFields(form))
useUnsavedChanges(()=>!!owner()&&state.phase!=='saved',()=>busy.value)
watch([busy,()=>state.phase],()=>emit('state',{busy:busy.value,phase:state.phase}),{immediate:true})
watch(form,()=>resource.invalidate(),{deep:true,flush:'sync'})
async function initialize(){
  if(!owner())return;resolving.value=true;const principal=owner(),epoch=++generation;controller?.abort();controller=new AbortController()
  try{const {data}=await readTeachingCapabilities(controller.signal);if(disposed||epoch!==generation||owner()!==principal)return;if(typeof data?.rosterEnabled!=='boolean'||data.maxCourseMembers!==2000)throw new Error('教学配置能力响应不完整');rosterEnabled.value=data.rosterEnabled;loaded.value=true}
  catch(e){if(owner()===principal)state.error=e.response?.data?.message||e.message||'教学配置尚未就绪'}finally{if(owner()===principal)resolving.value=false}
  if(loaded.value&&!seedConsumed&&props.scope===seedOwner&&props.seed.instructions){seedConsumed=true;await handleFollowup(props.seed.instructions,props.scope)}
}
async function prepare(){await resource.prepare(form);await locate()}
async function save(){if(await resource.execute())emit('done',{message:state.notice,saved:true});else await locate()}
async function reconcile(){if(await resource.reconcile())emit('done',{message:state.notice,saved:true})}
async function retry(){if(!state.canRetry||busy.value)return;if(await confirm('仅重试同一课程编号和已确认内容。不会创建第二门课程，也不能趁结果未知修改字段。',{title:'核对原课程请求',confirmText:'重试原请求',className:'ct-teaching-change-confirm'}))if(await resource.retry())emit('done',{message:state.notice,saved:true})}
async function locate(target=focusTarget.value){const principal=owner();await nextTick();if(principal&&owner()===principal&&target){target.focus?.({preventScroll:true});target.scrollIntoView({block:'start',behavior:'auto'})}}
async function handleFollowup(text,requestScope){
  const principal=owner(),before=JSON.stringify(form),plan=planActionFollowup(text,{kind:'TEACHING_COURSE',scope:principal,requestScope,active:!!principal&&requestScope===principal,loaded:loaded.value,busy:busy.value,phase:state.phase,userRole:props.user.role,schoolId:props.user.schoolId,form:{...form.course,course:form.course}})
  if(plan.type==='CANCEL'){emit('done',{message:state.phase==='uncertain'?'操作已收起，旧保存结果仍需核对，没有重发。':'教学草稿已取消，没有保存。'});return{accepted:true,closed:true,message:'已收起本次操作。'}}
  followup.value=plan.message
  if(['BLOCKED','CLARIFY'].includes(plan.type))return{accepted:false,preserveInput:true,message:plan.message}
  if(plan.type==='PATCH'){
    resolving.value=true;controller?.abort();controller=new AbortController();const epoch=++generation,patch={...plan.patch.course},extras={...plan.patch.targets}
    try{
      if(extras.classQuery)patch.classId=(await resolveFormalTarget('CLASS',extras.classQuery,readTeachingConfigPage,controller.signal)).value
      if(extras.teacherQuery)patch.teacherId=(await resolveFormalTarget('TEACHER',extras.teacherQuery,readTeachingConfigPage,controller.signal)).value
      if(disposed||principal!==owner()||epoch!==generation||before!==JSON.stringify(form))return{accepted:false,preserveInput:true,message:'草稿或账号已变化，没有采用旧字段。'}
      if(extras.rosterMode==='SELECTED'&&!rosterEnabled.value)throw new Error('独立教学名单尚未启用，不能创建选修或合班')
      resource.invalidate();Object.assign(form.course,patch);if(extras.groupName)form.groupName=extras.groupName;if(extras.rosterMode)form.rosterMode=extras.rosterMode
      followup.value='补充已原子填入教学草稿，旧预览已失效。班级与教师已通过本校读取核对，尚未保存。'
    }catch(e){if(owner()===principal){followup.value=e.response?.data?.message||e.message;return{accepted:false,preserveInput:true,message:followup.value}}}
    finally{if(owner()===principal)resolving.value=false}
  }
  if(plan.type==='PREVIEW'){await resource.prepare(form);if(!state.preview)return{accepted:false,preserveInput:true,message:state.error||'字段尚未齐全，没有保存。'}}
  if(plan.type==='PATCH'&&!missing.value.length){try{formalCoursePayload(form);if(await resource.prepare(form))followup.value='字段已齐，后台核对后已生成预览。请阅读目标与安排，再手动确认保存。';else followup.value=state.error||'仍需核对字段，没有保存。'}catch(e){followup.value=e.message}}
  if(plan.type==='CONFIRM_BUTTON'){followup.value='请阅读预览，再点击“确认保存教学安排”；聊天消息没有执行保存。';await locate(confirmationButton.value)}else await locate()
  return{accepted:true,message:followup.value||plan.message}
}
defineExpose({handleFollowup})
watch(()=>props.scope,()=>{generation++;controller?.abort();loaded.value=false;resolving.value=false;resource.reset();followup.value='';Object.assign(form.course,{id:crypto.randomUUID(),classId:'',teacherId:'',name:'',semester:'',firstMonday:'',weekday:'',startTime:'',endTime:'',weeks:'',room:''});form.students=[];form.groupName='';form.rosterMode='CLASS'},{flush:'sync'})
onMounted(initialize)
onBeforeUnmount(()=>{disposed=true;generation++;controller?.abort();resource.dispose()})
</script>
<template>
  <section class="formal-course" aria-label="正式教学草稿" :aria-busy="busy">
    <p ref="focusTarget" tabindex="-1" class="feedback" role="status">{{followup||'可在聊天中连续补课程、班级、教师账号、学期、周次、时间和教室；重名时需在选择器核对。'}}</p>
    <p v-if="state.error" class="failure" role="alert">{{state.error}}</p><p v-if="resolving" role="status">正在核对本校目标，尚未保存…</p>
    <p v-if="loaded&&missing.length&&state.phase==='editing'" class="hint">还需核对：{{missing.join('、')}}。可继续发消息补充，不必重新填写。</p>
    <button v-if="!loaded" type="button" :disabled="busy" @click="initialize">重新读取教学配置</button>
    <form v-else-if="!['preview','uncertain','saved'].includes(state.phase)" @submit.prevent="prepare">
      <TeachingScopePicker v-model="form.course.classId" :owner="scope" label="课程班级或主办班" :disabled="locked" />
      <TeachingScopePicker v-model="form.course.teacherId" :owner="scope" label="任课教师账号" kind="TEACHER" :disabled="locked" />
      <label class="wide">课程名称<input v-model="form.course.name" required maxlength="100" :disabled="locked" /></label>
      <label>学期<input v-model="form.course.semester" required maxlength="100" :disabled="locked" /></label><label>第1周周一<DateField v-model="form.course.firstMonday" required :disabled="locked"  monday-only /></label>
      <label>星期<select v-model="form.course.weekday" aria-label="教学课程星期" required :disabled="locked"><option value="" disabled>选择星期</option><option v-for="(d,i) in ['一','二','三','四','五','六','日']" :key="d" :value="i+1">周{{d}}</option></select></label><label>上课周次<input v-model="form.course.weeks" required maxlength="160" placeholder="例如1-16单，或1;3;5" :disabled="locked" /></label>
      <label>开始钟点<input v-model="form.course.startTime" type="time" required :disabled="locked" /></label><label>结束钟点<input v-model="form.course.endTime" type="time" required :disabled="locked" /></label>
      <label class="wide">教室<input v-model="form.course.room" required maxlength="100" :disabled="locked" /></label>
      <label class="wide">名单方式<select v-model="form.rosterMode" aria-label="教学名单方式" :disabled="locked"><option value="CLASS">整行政班</option><option value="SELECTED" :disabled="!rosterEnabled">选修或合班，逐人核对</option></select></label>
      <template v-if="form.rosterMode==='SELECTED'"><label class="wide">教学组名称<input v-model="form.groupName" required maxlength="100" :disabled="locked" /></label><div class="wide"><TeachingRosterPicker v-model="form.students" :owner="scope" :disabled="locked" /></div></template>
      <p class="hint wide">整班采用保存时的有效名单；选修与合班采用明确勾选的人。不会因同名绑定身份，也不覆盖已创建课程或过去考勤。</p>
      <button class="primary wide" :disabled="locked">核对教学安排并预览</button>
    </form>
    <section v-if="state.preview" class="preview" aria-label="教学课程完整预览">
      <h3>{{state.preview.course.name}}</h3><p>{{state.preview.classLabel}}<br />任课教师：{{state.preview.teacherLabel}}</p>
      <p>{{state.preview.course.semester}}，第1周周一 {{state.preview.course.firstMonday}}<br />周{{'一二三四五六日'[state.preview.course.weekday-1]}} {{state.preview.course.startTime}}—{{state.preview.course.endTime}}，{{state.preview.course.room}}<br />第{{formalWeeksLabel(state.preview.course.weeks)}}</p>
      <p>{{state.preview.rosterMode==='CLASS'?'整行政班有效名单':state.preview.groupName+' · 明确勾选名单'}}，当前 {{state.preview.members}} 人。{{state.preview.members?'':'班级暂无有效学生。'}}</p>
      <p class="hint">5分钟内有效；保存前复核教师、班级与名单，成功后回读原课程编号。没有修改已有课程或考勤。</p>
      <div class="actions"><button ref="confirmationButton" type="button" class="primary" :disabled="busy" @click="save">确认保存教学安排</button><button type="button" :disabled="busy" @click="resource.invalidate()">返回继续编辑</button></div>
    </section>
    <section v-if="state.phase==='uncertain'" class="recovery" aria-label="教学安排保存核对"><p>保存结果尚未确认。原课程编号和内容已冻结，不重复新建。</p><div class="actions"><button type="button" :disabled="busy" @click="reconcile">核对原课程结果</button><button v-if="state.canRetry" type="button" :disabled="busy" @click="retry">重试原课程请求</button></div></section>
  </section>
</template>
<style scoped>
.formal-course{color:var(--assistant-ink,#29323c);font-size:16px;line-height:1.7;min-width:0}.formal-course p{overflow-wrap:anywhere;margin:12px 0}.feedback,.preview{scroll-margin-top:100px}.hint{font-size:14px;color:var(--assistant-muted,#5d6876)}.failure{color:var(--assistant-danger,#bf303d)}form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:20px}.wide{grid-column:1/-1}label{display:grid;gap:8px;min-width:0;font-size:15px}input,select,button{font:inherit;font-size:16px;box-sizing:border-box;min-width:0;max-width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;color:inherit;background:var(--assistant-surface,#fff);caret-color:var(--assistant-accent,#0b62db)}button{cursor:pointer;transition:background-color 180ms ease-out}button:hover:not(:disabled){background:var(--assistant-hover,#e8edf2)}button.primary{background:var(--assistant-accent,#0b62db);color:#fff;border-color:transparent}button.primary:hover:not(:disabled){background:var(--assistant-accent-hover,#084db0)}:disabled{opacity:.6;cursor:default}:focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}::selection{background:var(--assistant-soft,#eaf2ff)}.preview,.recovery{margin-top:20px;border-top:1px solid var(--assistant-line,#e2e7ec);padding-top:20px}.preview h3{font-size:20px;font-weight:600;margin:0 0 12px}.actions{display:flex;gap:12px;flex-wrap:wrap}@media(max-width:600px){form{grid-template-columns:1fr}.actions>button{flex:1 1 100%}}@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
