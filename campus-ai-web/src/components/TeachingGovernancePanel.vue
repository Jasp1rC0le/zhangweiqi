<script setup>
import DateField from '@/components/DateField.vue'
import {computed,nextTick,onBeforeUnmount,reactive,ref,watch} from 'vue'
import {chinaDate,addDays} from '@/utils/timetable'
import {ATTENDANCE_STATUSES,TEACHING_VIEWS,teachingDate,teachingClock} from '@/utils/teaching'
import {auditDate} from '@/utils/teachingAudit'
import {createGovernanceResource,governanceKey,governanceFilter} from '@/utils/teachingGovernance'
import {createGovernanceClassSelection} from '@/utils/governanceClassSelection'
import {readTeachingGovernanceAccess,readTeachingEvidencePage,prepareTeachingEvidenceExport,downloadTeachingEvidence,readTeachingEvidenceClasses} from '@/api/teaching'
import TeachingScopePicker from './TeachingScopePicker.vue'
const props=defineProps({owner:{type:String,required:true},preferredView:{type:String,required:true},active:{type:Boolean,default:true},preset:{type:Object,default:null}})
const state=reactive({access:null,data:null,preview:null,downloaded:null,error:'',busy:false})
const from=ref(props.preset?.from||chinaDate()),to=ref(props.preset?.to||addDays(chinaDate(),6)),kind=ref(props.preset?.kind==='AUDIT'?'AUDIT':'ATTENDANCE'),expiredOnly=ref(props.preset?.expiredOnly===true),classId=ref(props.preset?.classId||''),classLabel=ref(props.preset?.classId?'带入的班级待核对':'全部授权班级'),classOpened=ref(false),opened=ref(false)
const previewElement=ref(),exportResult=ref(),rangeElement=ref()
let disposed=false
const scope=()=>!disposed && opened.value && props.active && props.owner?`${props.owner}:${props.preferredView}`:''
const blockingMessage=computed(()=>props.preset?.error || (props.preset?.view && props.preset.view!==props.preferredView ? '带入的查看身份尚未得到当前账号确认，未改用其他身份或全部班级；请回课表重新选择。' : ''))
const classSelection=reactive({items:[],selected:null,page:0,total:0,totalPages:0,loading:false,error:''})
const classResource=createGovernanceClassSelection({scope,state:classSelection,read:(query,signal)=>readTeachingEvidenceClasses({view:query.view,page:query.page,size:query.size,search:query.search,selected:query.selected},signal)})
const operationBusy=computed(()=>state.busy || classSelection.loading)
const filter=computed(()=>({view:props.preferredView,from:from.value,to:to.value,classId:classId.value,kind:kind.value,expiredOnly:expiredOnly.value}))
const ready=computed(()=>!blockingMessage.value && props.active && props.owner && state.access?.enabled && state.access.views.includes(props.preferredView))
const viewLabel=computed(()=>props.preferredView==='ADMIN'?'本校管理员':TEACHING_VIEWS[props.preferredView]||'当前账号')
const resource=createGovernanceResource({scope,state,access:readTeachingGovernanceAccess,read:readTeachingEvidencePage,prepare:prepareTeachingEvidenceExport,download:downloadTeachingEvidence,onFile:result=>{
  const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=result.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}})
async function activate(){if(!opened.value || !props.active || !props.owner || blockingMessage.value || operationBusy.value)return;if(!state.access && !await resource.access())return;if(ready.value)await load()}
async function toggle(event){opened.value=event.target.open;if(opened.value)await activate();else{resource.reset();classResource.reset()}}
async function showCurrent(element,valid){await nextTick();if(!disposed && opened.value && props.active && valid()){element.value?.focus({preventScroll:true});element.value?.scrollIntoView({block:'start',behavior:'auto'})}}
async function load(page=0,focus=false){
  if(!ready.value || operationBusy.value || !scope())return false
  let snapshot
  try{snapshot=governanceFilter(filter.value)}catch(error){state.error=error.message;return false}
  const owner=scope(),key=governanceKey(snapshot)
  resource.reset();classResource.reset()
  if(snapshot.classId){
    classLabel.value='所选班级正在重新核对'
    const selected=await classResource.resolve(snapshot.view,snapshot.classId)
    if(owner!==scope() || governanceKey(filter.value)!==key)return false
    if(!selected){classLabel.value='所选班级尚未确认';return false}
    classLabel.value=[selected.description,selected.label].filter(Boolean).join(' · ')
  }else classLabel.value='全部授权班级'
  const ok=await resource.load(snapshot,page)
  if(ok && focus)await showCurrent(rangeElement,()=>owner===scope() && state.data?.page===page && governanceKey(state.data.filter)===key)
  return ok
}
async function prepareExport(){const owner=scope();if(await resource.prepare(filter.value)){const token=state.preview?.token;await showCurrent(previewElement,()=>owner===scope() && token && token===state.preview?.token)}}
async function downloadExport(){const owner=scope(),token=state.preview?.token;if(await resource.download())await showCurrent(exportResult,()=>owner===scope() && token===state.preview?.token && !!state.downloaded)}
const classReader=(query,signal)=>readTeachingEvidenceClasses({...query,view:props.preferredView},signal)
function selectedClass(value){classLabel.value=value?[value.description,value.label].filter(Boolean).join(' · '):'全部授权班级'}
watch(()=>governanceKey(filter.value),()=>{resource.reset();classResource.reset();classLabel.value=classId.value?classLabel.value:'全部授权班级'},{flush:'sync'})
watch(()=>`${props.owner}:${props.preferredView}`,()=>{resource.reset(true);classResource.reset();classId.value=props.preset?.classId||'';classLabel.value=classId.value?'带入的班级待核对':'全部授权班级';classOpened.value=false;if(opened.value)activate()},{flush:'sync'})
watch(()=>props.active,()=>{resource.reset(true);classResource.reset();if(opened.value&&props.active)activate()},{flush:'sync'})
onBeforeUnmount(()=>{disposed=true;resource.dispose();classResource.dispose()})
</script>
<template>
  <details class="teaching-governance" :aria-busy="operationBusy" :data-workflow-ready="state.data?'ready':state.error||classSelection.error||blockingMessage?'error':'waiting'" @toggle="toggle">
    <summary>记录核对、导出与到期清单</summary>
    <div v-if="opened" class="governance-body">
      <p class="governance-policy">{{ viewLabel }} · 只读授权范围。保留一年；到期仅待归档核验，不会自动删除。</p>
      <p v-if="preset?.classId && classId===preset.classId && !blockingMessage" class="governance-policy">已从统计页带入班级和日期；读取前会重新核对当前账号的班级权限。</p>
      <p v-if="blockingMessage" class="governance-warning" role="alert">{{ blockingMessage }} <RouterLink to="/timetable">返回课表重新选择</RouterLink></p>
      <p v-if="!active" class="governance-warning" role="status">先保存或取消正在编辑的点名/配置，再核对记录；没有丢弃当前草稿。</p>
      <p v-else-if="state.access && !ready" role="status">当前账号还没有这个教学视图的记录权限。</p>
      <form v-if="ready" class="governance-filters" @submit.prevent="load()">
        <label>查看内容<select v-model="kind" :disabled="operationBusy"><option value="ATTENDANCE">考勤结果</option><option value="AUDIT">更正与点名变更</option></select></label>
        <label>开始日期<DateField v-model="from" required :disabled="operationBusy"  /></label>
        <label>结束日期<DateField v-model="to" :min="from" :max="addDays(from||chinaDate(),30)" required :disabled="operationBusy"  /></label>
        <label class="governance-check"><input v-model="expiredOnly" type="checkbox" :disabled="operationBusy" /><span>只看到期候选</span></label>
        <button class="primary" :disabled="operationBusy">读取并核对</button>
      </form>
      <details v-if="ready" class="governance-class" @toggle.stop="classOpened=$event.target.open">
        <summary>按班级细分 · {{ classLabel }}</summary>
        <TeachingScopePicker v-if="classOpened" v-model="classId" :owner="`${owner}:${preferredView}`" label="记录行政班" optional :read-page="classReader" :disabled="operationBusy" @selected="selectedClass" />
      </details>
      <p v-if="operationBusy" role="status">正在核对授权范围与记录…</p>
      <p v-if="classSelection.error" class="governance-error" role="alert">{{ classSelection.error }}；未改查全部班级。 <button type="button" :disabled="operationBusy || !active" @click="activate">重试班级核对</button></p>
      <p v-if="state.error" class="governance-error" role="alert">{{ state.error }} <button type="button" :disabled="operationBusy || !active" @click="activate">重新核对</button></p>
      <template v-if="state.data">
        <div ref="rangeElement" class="governance-scope" tabindex="-1" aria-label="完整记录范围">
          <strong>{{ state.data.filter.from }} 至 {{ state.data.filter.to }}</strong>
          <span>{{ classLabel }} · {{ state.data.filter.kind==='AUDIT'?'变更条数':'考勤人次' }}</span>
          <span>完整范围 {{ state.data.rangeTotal }} 条 · 当前条件 {{ state.data.total }} 条</span>
          <span :class="{'governance-warning':state.data.expiredWithinScope}">到期候选 {{ state.data.expiredWithinScope }} 条 · 尚未归档或删除</span>
        </div>
        <div class="governance-export">
          <p>导出全部当前条件，不只这一页。每份最多2000条；考勤结果按下课与最后更正的较晚时间再保留一年。</p>
          <button type="button" :disabled="operationBusy || !state.data.total || state.data.total>2000" @click="prepareExport">准备范围导出</button>
          <p v-if="state.data.total>2000" class="governance-warning">超过2000条，请缩小日期或班级范围；不会截断文件。</p>
          <section v-if="state.preview" ref="previewElement" class="governance-export-preview" tabindex="-1" aria-label="待下载范围核对">
            <h3>已准备 {{ state.preview.count }} 条{{ state.preview.filter.expiredOnly?'到期核验记录':'记录' }}</h3>
            <p>{{ state.preview.filter.from }} 至 {{ state.preview.filter.to }} · {{ classLabel }} · {{ state.preview.filter.kind==='AUDIT'?'更正与点名变更':'考勤结果' }}</p>
            <small>准备有效至 {{ auditDate(state.preview.expiresAt,true) }}。下载前会再查权限与变更；这是核验文件，不代表已归档。</small>
            <details><summary>查看文件校验值</summary><code>{{ state.preview.sha256 }}</code></details>
            <button class="primary" type="button" :disabled="operationBusy" @click="downloadExport">核验并下载 CSV</button>
          </section>
          <p v-if="state.downloaded" ref="exportResult" class="governance-success" tabindex="-1" role="status">{{ state.downloaded.count }} 条已核验并交给浏览器下载；请检查下载文件。未归档、未删除原记录。</p>
        </div>
        <p v-if="!state.data.total">该条件下没有记录。可切换内容、日期或取消“只看到期候选”后重新读取。</p>
        <ol v-else class="governance-rows">
          <li v-for="row in state.data.items" :key="row.id">
            <div class="governance-row-head"><strong>{{ row.studentName }} <small>{{ row.studentNumber }}</small></strong><span class="governance-status" :data-status="state.data.filter.kind==='AUDIT'?row.newStatus:row.status">{{ state.data.filter.kind==='AUDIT'?`${ATTENDANCE_STATUSES[row.oldStatus]} → ${ATTENDANCE_STATUSES[row.newStatus]}`:ATTENDANCE_STATUSES[row.status] }}</span></div>
            <p>{{ row.course }} · {{ teachingDate(row.startsAt) }} {{ teachingClock(row.startsAt) }} · {{ row.teacher }}</p>
            <small>{{ row.college }} · {{ row.className }}<span v-if="row.withdrawn"> · 未来名单已撤</span><span v-if="row.cancelled"> · 安排已取消，保留原记录</span><span v-if="row.scopeSource==='BASELINE_AT_MIGRATION'"> · 迁移时基线，非原始归属证明</span></small>
            <p v-if="state.data.filter.kind==='AUDIT'">{{ row.reason || '首次记录' }} · {{ row.actorName }}</p>
            <small :class="{'governance-warning':row.eligible}">{{ row.eligible?'待归档核验':'保留中' }} · 保留至 {{ auditDate(row.retainedUntil,true) }}</small>
          </li>
        </ol>
        <nav v-if="state.data.total" class="governance-pages" aria-label="范围证据分页">
          <span>第 {{ state.data.page+1 }}/{{ state.data.totalPages }} 页 · 每页25条</span>
          <button type="button" :disabled="operationBusy || state.data.page===0" @click="load(state.data.page-1,true)">上一页记录</button>
          <button type="button" :disabled="operationBusy || state.data.page+1>=state.data.totalPages" @click="load(state.data.page+1,true)">下一页记录</button>
        </nav>
      </template>
    </div>
  </details>
</template>
<style scoped>
.teaching-governance{min-width:0;margin-top:28px;padding-top:20px;border-top:1px solid var(--assistant-line,#e2e7ec);font-family:inherit;font-size:16px;line-height:1.7;color:var(--assistant-ink,#29323c)}
summary{min-height:44px;align-content:center;cursor:pointer;color:var(--assistant-accent,#0b62db)}.governance-body{padding-top:8px;max-width:960px}.governance-policy,.governance-rows small,.governance-export>p,.governance-export-preview>small{font-size:14px;color:var(--assistant-muted,#5d6876)}
.governance-warning a{display:inline-flex;align-items:center;min-height:44px;margin-inline-start:8px;color:var(--assistant-accent-hover,#084db0);text-underline-offset:4px}.governance-warning a:focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}
.governance-filters{display:flex;align-items:end;gap:14px;flex-wrap:wrap;margin-block:20px 12px}.governance-filters>label{display:grid;gap:6px;min-width:0;flex:1 1 150px}.governance-filters>.governance-check{display:flex;align-items:center;gap:8px;min-height:44px;flex:1 1 160px;cursor:pointer}.governance-check input{width:20px;height:20px;min-height:0;flex:none;accent-color:var(--assistant-accent,#0b62db)}
input,select,button{box-sizing:border-box;min-height:44px;min-width:0;max-width:100%;padding:10px 12px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;background:var(--assistant-surface,#fff);color:inherit;font:inherit;font-size:16px;caret-color:var(--assistant-accent,#0b62db)}button{cursor:pointer;transition:background-color 180ms ease}button:hover:not(:disabled){background:var(--assistant-hover,#e8edf2)}button.primary{background:var(--assistant-accent,#0b62db);border-color:transparent;color:white}button.primary:hover:not(:disabled){background:var(--assistant-accent-hover,#084db0)}:disabled{opacity:.55;cursor:default}:focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}::selection{background:var(--assistant-soft,#eaf2ff)}
.governance-class{max-width:560px;margin-block:12px 20px}.governance-scope{display:grid;gap:4px;padding-block:16px;border-block:1px solid var(--assistant-line,#e2e7ec);font-variant-numeric:tabular-nums}.governance-scope strong{font-weight:600}.governance-rows{list-style:none;padding:0;margin:0}.governance-rows li{padding-block:18px;border-bottom:1px solid var(--assistant-line,#e2e7ec);overflow-wrap:anywhere}.governance-row-head{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px 16px}.governance-row-head strong{font-weight:600}.governance-row-head small{font-weight:400;margin-left:8px}.governance-rows p{margin:6px 0}.governance-status{font-weight:600}.governance-status[data-status='ON_TIME'],.governance-success{color:var(--assistant-success,#187248)}.governance-status[data-status='ABSENT'],.governance-error{color:var(--assistant-danger,#bf303d)}.governance-status[data-status='EARLY_LEAVE'],.governance-warning{color:var(--assistant-warning,#9a5400)}
.governance-rows li>small{display:block}.governance-pages{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-block:20px}.governance-pages span{font-size:14px;font-variant-numeric:tabular-nums}.governance-export{margin-block:16px 24px}.governance-export-preview{margin-top:20px;padding:18px;background:var(--assistant-soft,#eaf2ff);border-radius:12px;overflow-wrap:anywhere;scroll-margin-top:90px}.governance-export-preview h3{font-size:18px;font-weight:600;line-height:1.5;margin:0 0 8px}.governance-export-preview p{margin:0 0 8px}.governance-export-preview code{font-size:13px;overflow-wrap:anywhere}.governance-export-preview>button{margin-top:12px}.governance-success,.governance-scope{scroll-margin-top:90px}
@media(max-width:600px){.governance-filters{gap:12px}.governance-filters>label{flex-basis:100%}.governance-filters>button{width:100%}.governance-pages span{flex-basis:100%}.governance-export-preview{padding:16px}.governance-export-preview>button{width:100%}}
@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
