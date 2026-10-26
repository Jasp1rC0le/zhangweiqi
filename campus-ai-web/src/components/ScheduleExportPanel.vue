<script setup>
import DateField from '@/components/DateField.vue'
import {computed,nextTick,onBeforeUnmount,onMounted,reactive,ref,watch} from 'vue'
import {readScheduleExportAccess,readScheduleExportClasses,prepareScheduleExport,downloadScheduleExport} from '@/api/teaching'
import {readCourseSchedule} from '@/api/courseSchedule'
import {validatedCourseSnapshot} from '@/utils/privateCourseSchedule'
import {createScheduleExportResource,SCHEDULE_FORMATS,SCHEDULE_SOURCES,EXPORT_VIEWS,scheduleExportKey,savedCoverageRange} from '@/utils/scheduleExport'
import {addDays,chinaDate,mondayOf} from '@/utils/timetable'
import {captureAuditFocusIntent} from '@/utils/teachingAdministrativeAudit'
import {focusWorkflowElement,cancelWorkflowFocus} from '@/utils/teachingWorkflows'
import {calendarExportIntent,calendarExportScopeKey,requireCalendarExportAccess} from '@/utils/calendarExportHandoff'
import {createGovernanceClassSelection} from '@/utils/governanceClassSelection'
import TeachingScopePicker from './TeachingScopePicker.vue'
const props=defineProps({owner:{type:String,required:true},active:{type:Boolean,default:true},preferredView:{type:String,default:''},from:{type:String,default:''},to:{type:String,default:''},preset:{type:Object,default:null},calendarContext:{type:Object,default:null}})
const root=ref(),previewElement=ref(),noticeElement=ref(),opened=ref(false),termBusy=ref(false),requirement=ref(props.preset?.scope||'AUTHORIZED'),state=reactive({access:null,busy:false,preview:null,error:'',notice:'',downloaded:null})
const form=reactive({source:'MY',view:'STUDENT',from:props.from||mondayOf(chinaDate()),to:props.to||addDays(mondayOf(chinaDate()),6),classId:'',period:'ALL',format:'XLSX',search:'',includeCancelled:false})
const initialized=ref(false),incomingCalendar=ref(null),applyingCalendar=ref(false),calendarProvenance=ref(''),classPickerRefresh=ref(0),calendarClassIntent=ref(false)
const classSelection=reactive({items:[],selected:null,page:0,total:0,totalPages:0,loading:false,error:''})
let disposed=false,adopting=false,intent,termController,termGeneration=0,handoffGeneration=0
const owner=()=>!disposed&&props.active?props.owner:''
const busy=computed(()=>state.busy||termBusy.value||applyingCalendar.value||classSelection.loading||!props.active)
const resource=createScheduleExportResource({owner,state,readAccess:readScheduleExportAccess,prepare:prepareScheduleExport,download:downloadScheduleExport,onFile:(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}})
const classResource=createGovernanceClassSelection({scope:()=>opened.value&&owner()?`${owner()}:${form.view}`:'',state:classSelection,read:(query,signal)=>readScheduleExportClasses(query,signal)})
const classVerified=computed(()=>!form.classId||form.source==='TEACHING'&&classSelection.selected?.value===form.classId)
const fileBlocked=computed(()=>busy.value||!!incomingCalendar.value||!classVerified.value)
const views=computed(()=>state.access?(form.source==='TEACHING'?state.access.teachingViews:state.access.personalViews):[])
const readClasses=(query,signal)=>readScheduleExportClasses({...query,view:form.view},signal)
function cancelFocus(){intent?.dispose();intent=null;cancelWorkflowFocus(root.value)}
function manualClassChange(value){
  if(busy.value||typeof value!=='string')return
  if(calendarClassIntent.value&&value===''){requirement.value='AUTHORIZED';calendarClassIntent.value=false}
  form.classId=value
}
function currentCalendar(){try{return calendarExportIntent(props.calendarContext,owner())}catch{return null}}
async function resolveClass(){
  if(!form.classId||form.source!=='TEACHING'){classResource.reset();return !form.classId}
  const principal=owner(),key=calendarExportScopeKey(form),retrying=!!classSelection.error,selected=await classResource.resolve(form.view,form.classId)
  const valid=!!selected&&opened.value&&principal===owner()&&key===calendarExportScopeKey(form)
  if(valid&&retrying)classPickerRefresh.value++
  return valid
}
async function applyCalendar(){
  const target=incomingCalendar.value
  if(!target||!owner()||busy.value)return
  const principal=owner(),key=calendarExportScopeKey(target),epoch=++handoffGeneration
  const current=()=>!disposed&&opened.value&&owner()===principal&&epoch===handoffGeneration&&key===calendarExportScopeKey(currentCalendar())
  if(!current()){state.error='当前课表已切换，请从上方重新点“导出课表”；已有条件没有被替换。';return}
  applyingCalendar.value=true;calendarProvenance.value='';cancelFocus();resource.reset(true);classResource.reset()
  try{
    if(!await resource.access()||!current())return
    requireCalendarExportAccess(state.access,target)
    adopting=true
    Object.assign(form,{source:target.source,view:target.view,from:target.from,to:target.to,classId:target.classId,period:'ALL',search:'',includeCancelled:false})
    requirement.value=target.classId?'CLASS':'AUTHORIZED';calendarClassIntent.value=!!target.classId;adopting=false;initialized.value=true
    calendarProvenance.value=`沿用 ${target.from} 至 ${target.to} · ${EXPORT_VIEWS[target.view]}。尚未生成文件。`
    const selected=await resolveClass()
    if(!current())return
    incomingCalendar.value=null
    if(!selected)return
  }catch(error){if(current())state.error=error.message}
  finally{adopting=false;if(epoch===handoffGeneration)applyingCalendar.value=false}
}
async function adoptLatestCalendar(){const target=currentCalendar();if(!target){state.error='当前课表尚未核对，请先重新读取课表。';return}incomingCalendar.value=target;await applyCalendar()}
async function keepExisting(){if(busy.value)return;incomingCalendar.value=null;state.error='';if(!initialized.value&&state.access){chooseDefaults();initialized.value=true}if(form.classId)await resolveClass()}
function chooseDefaults(preset=props.preset){
  if(!state.access)return;calendarClassIntent.value=false;adopting=true
  const p=preset&&!preset.error?preset:{},preferred=p.view||props.preferredView;requirement.value=p.scope||'AUTHORIZED'
  form.source=p.source||(props.preferredView&&['COUNSELOR','SECRETARY','ADMIN'].includes(props.preferredView)?'TEACHING':'MY')
  if(!state.access.sources.includes(form.source))form.source='MY'
  const allowed=form.source==='TEACHING'?state.access.teachingViews:state.access.personalViews;form.view=allowed.includes(preferred)?preferred:p.view?'':allowed[0]||''
  if(p.from)form.from=p.from;if(p.to)form.to=p.to;if(p.format&&Object.hasOwn(SCHEDULE_FORMATS,p.format))form.format=p.format;if(p.period)form.period=p.period
  if(p.search)form.search=p.search;form.classId='';adopting=false
  if(preset?.error)state.error=preset.error
}
async function activate(){if(!owner()||!opened.value||busy.value)return;if(incomingCalendar.value&&!initialized.value){await applyCalendar();return}if(!state.access){if(!await resource.access())return;if(!initialized.value){chooseDefaults();initialized.value=true}}if(form.classId&&!incomingCalendar.value)await resolveClass()}
async function open(context){if(!owner()||busy.value)return;if(context){try{const target=calendarExportIntent(context,owner());incomingCalendar.value=!initialized.value||calendarExportScopeKey(form)!==calendarExportScopeKey(target)?target:null}catch(error){state.error=error.message;return}}opened.value=true;await nextTick();await activate();const principal=owner();await nextTick();if(principal===owner()&&opened.value)focusWorkflowElement(root.value,()=>principal===owner()&&opened.value)}
async function toggle(e){opened.value=e.target.open;if(opened.value){if(!initialized.value&&!props.preset&&props.calendarContext)incomingCalendar.value=currentCalendar();await activate()}else{cancelFocus();handoffGeneration++;applyingCalendar.value=false;incomingCalendar.value=null;classResource.reset();termGeneration++;termController?.abort();termBusy.value=false;resource.reset(true)}}
async function step(method){
  if(fileBlocked.value)return
  cancelFocus();let key;try{key=scheduleExportKey(form);if(requirement.value==='CLASS'&&(form.source!=='TEACHING'||!form.classId))throw new Error('这次请求是班级课表，请先在“班级与课程筛选”明确选择授权班级');if(requirement.value==='COLLEGE'&&(form.source!=='TEACHING'||!['SECRETARY','ADMIN'].includes(form.view)))throw new Error('学院导出需要实际负责学院的书记或正常管理员，请核对授权身份')}catch(e){state.error=e.message;return}
  const principal=owner(),focus=captureAuditFocusIntent(root.value?.closest('.workspace-page')||root.value);intent=focus
  try{if(method==='prepare'&&form.classId&&!await resolveClass())return;if(principal!==owner()||!opened.value||key!==scheduleExportKey(form))return;const ok=method==='prepare'?await resource.prepare(form):await resource.download();if(!ok)return;await nextTick();if(!disposed&&opened.value&&owner()===principal&&key===scheduleExportKey(form)&&focus.current()){const target=state.preview?previewElement.value:noticeElement.value;target?.focus({preventScroll:true});target?.scrollIntoView({block:'start',behavior:'auto'})}}finally{focus.dispose();if(intent===focus)intent=null}
}
async function fullPersonal(){if(busy.value||!owner())return;calendarClassIntent.value=false;calendarProvenance.value='';termController?.abort();termController=new AbortController();const principal=owner(),epoch=++termGeneration;termBusy.value=true;state.error='';try{const response=await readCourseSchedule(termController.signal);if(disposed||principal!==owner()||epoch!==termGeneration)return;const s=validatedCourseSnapshot(response.data?.schedule);if(!s)throw new Error('本人尚未保存个人课表；请先导入，或选择授权教学日期');const range=savedCoverageRange(s);adopting=true;requirement.value='AUTHORIZED';Object.assign(form,{source:'PERSONAL',view:'STUDENT',classId:'',from:range.from,to:range.to,period:'ALL',search:''});adopting=false;resource.reset();state.notice=`已采用${s.semester}个人源的已保存范围（周次${range.weeks.join('、')}），不代表整学期已齐；不包含未保存课程或教学安排。尚未生成文件。`}catch(e){if(principal===owner())state.error=e.response?.data?.message||e.message||'个人学期读取失败'}finally{if(principal===owner()&&epoch===termGeneration)termBusy.value=false}}
watch(()=>form.source,()=>{if(adopting||!state.access)return;calendarClassIntent.value=false;adopting=true;form.classId='';requirement.value='AUTHORIZED';const allowed=form.source==='TEACHING'?state.access.teachingViews:state.access.personalViews;if(!allowed.includes(form.view))form.view=allowed[0]||'';adopting=false;resource.reset()},{flush:'sync'})
watch(()=>[form.source,form.view,form.classId],()=>{classResource.reset();if(!adopting&&opened.value&&form.classId&&state.access)void resolveClass()},{flush:'sync'})
watch(form,()=>{if(!adopting){calendarProvenance.value='';cancelFocus();resource.reset()}},{deep:true,flush:'sync'})
watch(()=>[props.owner,props.active],()=>{calendarClassIntent.value=false;calendarProvenance.value='';cancelFocus();handoffGeneration++;applyingCalendar.value=false;incomingCalendar.value=null;initialized.value=false;classResource.reset();termGeneration++;termController?.abort();termBusy.value=false;resource.reset(true);opened.value=false;adopting=true;Object.assign(form,{source:'MY',view:'STUDENT',classId:'',search:'',from:props.from||mondayOf(chinaDate()),to:props.to||addDays(mondayOf(chinaDate()),6)});adopting=false},{flush:'sync'})
watch(()=>calendarExportScopeKey(currentCalendar()),()=>{if(applyingCalendar.value){handoffGeneration++;applyingCalendar.value=false;classResource.reset();resource.reset(true);state.error='当前课表已切换，请重新采用最新范围；没有按迟到结果准备文件。'}},{flush:'sync'})
watch(()=>props.preset,async p=>{if(p){calendarClassIntent.value=false;calendarProvenance.value='';handoffGeneration++;incomingCalendar.value=null;initialized.value=false;resource.reset();chooseDefaults(p);await open()}},{deep:true})
onMounted(()=>{if(props.preset)open()})
onBeforeUnmount(()=>{disposed=true;handoffGeneration++;cancelFocus();termGeneration++;termController?.abort();classResource.dispose();resource.dispose()})
defineExpose({open})
</script>
<template>
  <details ref="root" class="schedule-export" :open="opened" :data-workflow-ready="state.access?'ready':state.error?'error':'waiting'" @toggle="toggle">
    <summary>导出课表文件</summary>
    <div v-if="opened">
      <p class="hint">选择范围与格式，核对后下载。不含名单与考勤。</p>
      <section v-if="incomingCalendar" class="calendar-handoff" aria-label="沿用当前课表范围">
        <p role="status">{{applyingCalendar?'正在核对当前课表带入的范围，尚未准备文件。':initialized?'已有导出条件或文件准备已保留，请明确选择是否替换。':'带入范围尚未确认，请重新采用当前课表，或明确改为手动设置。'}}</p>
        <p>{{incomingCalendar.from}} 至 {{incomingCalendar.to}} · {{EXPORT_VIEWS[incomingCalendar.view]}} · {{SCHEDULE_SOURCES[incomingCalendar.source]}}<span v-if="incomingCalendar.classId"> · 指定班级需重新核对</span></p>
        <p class="hint">采用会替换日期、来源、身份和班级，清除旧课程/时段筛选；保留文件格式，不自动生成或下载。</p>
        <div class="actions"><button type="button" :disabled="busy||!calendarContext" @click="adoptLatestCalendar">替换条件并采用当前课表</button><button type="button" :disabled="busy" @click="keepExisting">{{initialized?'保留现有导出条件':'改为手动设置范围'}}</button></div>
      </section>
      <p v-if="state.busy" role="status">正在读取完整授权范围并核验文件…</p><p v-if="state.error" class="failure" role="alert">{{state.error}}</p>
      <p v-if="classSelection.loading" role="status">正在重新核对所选班级，尚未准备文件…</p>
      <p v-if="classSelection.error" class="failure" role="alert">{{classSelection.error}}；未改查全部班级。<button type="button" :disabled="busy" @click="resolveClass">重试班级核对</button></p>
      <p v-if="calendarProvenance&&!state.preview" class="hint" role="status">{{calendarProvenance}}</p>
      <p v-if="form.classId&&classVerified&&!state.preview" class="hint" role="status">已核对班级：{{[classSelection.selected.description,classSelection.selected.label].filter(Boolean).join(' · ')}}。仅授权教学安排，不含个人导入。</p>
      <button v-if="!state.access" type="button" :disabled="busy" @click="activate">重新读取导出能力</button>
      <template v-if="state.access">
        <section v-if="state.preview" ref="previewElement" class="export-preview" tabindex="-1" aria-label="课表文件下载核对">
          <h3>完整导出 {{state.preview.count}} 项课程</h3><p>{{state.preview.filter.from}} 至 {{state.preview.filter.to}}，北京时间<br />{{state.preview.scope}}<br />{{SCHEDULE_FORMATS[state.preview.filter.format]}}，{{Math.ceil(state.preview.bytes/1024)}} KB</p>
          <p v-if="state.preview.filter.period!=='ALL'||state.preview.filter.search||state.preview.filter.includeCancelled" class="hint">筛选：{{({ALL:'全天',MORNING:'上午',AFTERNOON:'下午',EVENING:'晚上'})[state.preview.filter.period]}}<span v-if="state.preview.filter.search"> · 课程匹配“{{state.preview.filter.search}}”</span><span v-if="state.preview.filter.includeCancelled"> · 含取消课程</span></p>
          <ul><li v-for="r in state.preview.sample" :key="r.id">{{r.date}} {{r.timeLabel}}<br />{{r.name}} · {{r.room}}<span v-if="r.teacher"> · {{r.teacher}}</span></li></ul>
          <details><summary>来源说明与校验值</summary><p v-for="w in state.preview.warnings" :key="w">{{w}}</p><code>{{state.preview.sha256}}</code></details>
          <p class="hint">准备5分钟内有效，下载前重新读取权限与课表。数据变化会要求重新准备，不返回旧文件。</p>
          <div class="actions"><button type="button" class="primary" :disabled="fileBlocked" @click="step('download')">核验并下载 {{state.preview.filter.format}}</button><button type="button" :disabled="busy" @click="resource.reset()">取消文件准备</button></div>
        </section>
        <p v-if="state.notice" ref="noticeElement" class="notice" role="status" tabindex="-1">{{state.notice}}</p>
        <form v-if="!state.preview&&initialized" @submit.prevent="step('prepare')">
          <label>课表来源<select v-model="form.source" aria-label="导出课表来源" :disabled="busy"><option v-for="s in state.access.sources" :key="s" :value="s">{{SCHEDULE_SOURCES[s]}}</option></select></label>
          <label>核对身份<select v-model="form.view" aria-label="导出核对身份" required :disabled="busy"><option v-if="!form.view" value="" disabled>请选择当前有权身份</option><option v-for="v in views" :key="v" :value="v">{{EXPORT_VIEWS[v]}}</option></select></label>
          <div class="date-pair wide"><label>开始日期<DateField v-model="form.from" required :disabled="busy"  /></label><label>结束日期<DateField v-model="form.to" required :min="form.from" :max="addDays(form.from||chinaDate(),209)" :disabled="busy"  /></label></div>
          <label>文件格式<select v-model="form.format" aria-label="导出文件格式" :disabled="busy"><option v-for="f in state.access.formats" :key="f" :value="f">{{SCHEDULE_FORMATS[f]}}</option></select></label>
          <details class="wide" :open="requirement==='CLASS'||form.period!=='ALL'"><summary>班级、课程与时段筛选</summary><TeachingScopePicker v-if="form.source==='TEACHING'" :model-value="form.classId" @update:model-value="manualClassChange" :owner="`${owner}:${form.view}`" label="导出班级" :read-page="readClasses" :refresh="classPickerRefresh" optional :disabled="busy" /><label>上课时段<select v-model="form.period" aria-label="导出上课时段" :disabled="busy"><option value="ALL">全天</option><option value="MORNING">上午（12点前）</option><option value="AFTERNOON">下午（12至18点）</option><option value="EVENING">晚上（18点后）</option></select></label><label>查找课程<input v-model="form.search" maxlength="100" placeholder="课程、地点、教师或教学组，按字面筛选" :disabled="busy" /></label><label class="check"><input v-model="form.includeCancelled" type="checkbox" :disabled="busy" /> 同时导出已取消的课程</label></details>
          <p v-if="form.classId" class="hint wide">班级文件只包含该班级的授权教学安排，不含本人个人导入；准备与下载时会再次核对权限。</p>
          <div class="actions wide"><button class="primary" :disabled="fileBlocked">准备并核对文件</button><button type="button" :disabled="busy||!!incomingCalendar" @click="fullPersonal">采用本人已保存范围</button></div>
          <p class="hint wide">每份最多210天、2000项课程，不会只导出当前页。ICS是一次性日历文件，不会自动收到后续调停课更新。</p>
          <p v-if="form.format==='JSON'" class="hint wide">这里是JSON日期快照，不是个人原始JSON导入文件。可重新导入的原始JSON仍在下方“导入、更新或导出个人课表”。</p>
        </form>
      </template>
    </div>
  </details>
</template>
<style scoped>
.date-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.schedule-export{color:var(--assistant-ink,#29323c);font-size:16px;line-height:1.7;max-width:100%;min-width:0;border-top:1px solid var(--assistant-line,#e2e7ec);padding-top:12px;margin-top:24px;scroll-margin-top:90px}summary{cursor:pointer;min-height:44px;align-content:center;font-size:16px}p{margin:12px 0;overflow-wrap:anywhere}.hint{font-size:14px;color:var(--assistant-muted,#5d6876)}.failure{color:var(--assistant-danger,#bf303d)}.notice{color:var(--assistant-success,#187248);scroll-margin-top:100px}form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:20px}label{display:grid;gap:8px;min-width:0;font-size:15px}.wide{grid-column:1/-1}input,select,button{font:inherit;font-size:16px;box-sizing:border-box;min-width:0;max-width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;color:inherit;background:var(--assistant-surface,#fff);caret-color:var(--assistant-accent,#0b62db)}button{cursor:pointer;transition:background-color 180ms ease-out}button:hover:not(:disabled){background:var(--assistant-hover,#e8edf2)}button.primary{background:var(--assistant-accent,#0b62db);color:#fff;border-color:transparent}button.primary:hover:not(:disabled){background:var(--assistant-accent-hover,#084db0)}:disabled{opacity:.6;cursor:default}:focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}::selection{background:var(--assistant-soft,#eaf2ff)}.actions{display:flex;gap:12px;flex-wrap:wrap}.export-preview{margin:20px 0;padding:20px 0;border-block:1px solid var(--assistant-line,#e2e7ec);scroll-margin-top:100px}.export-preview h3{font-size:20px;font-weight:600;margin:0 0 12px}.export-preview li{padding-bottom:10px}.export-preview code{display:block;overflow-wrap:anywhere;font-size:13px}.check{display:flex;gap:10px;align-items:center;min-height:44px}.check input{width:22px;min-height:22px;height:22px;flex:none}form details label{margin-top:12px}@media(max-width:600px){form{grid-template-columns:1fr}.actions>button{flex:1 1 100%}}@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
