<script setup>
import {computed,nextTick,onBeforeUnmount,reactive,ref,watch} from 'vue'
import {chinaDate,addDays} from '@/utils/timetable'
import {auditDate} from '@/utils/teachingAudit'
import {ADMIN_AUDIT_KINDS,ADMIN_AUDIT_ACTIONS,adminAuditState,administrativeAuditKey,createAdministrativeAuditResource,captureAuditFocusIntent} from '@/utils/teachingAdministrativeAudit'
import {readTeachingAdministrativeAuditAccess,readTeachingAdministrativeAuditPage,prepareTeachingAdministrativeAuditExport,downloadTeachingAdministrativeAuditExport} from '@/api/teaching'
const props=defineProps({owner:{type:String,required:true},active:{type:Boolean,default:true},preset:{type:Object,default:null},initiallyOpen:Boolean})
const opened=ref(props.initiallyOpen),kind=ref('ALL'),from=ref(props.preset?.from||addDays(chinaDate(),-6)),to=ref(props.preset?.to||chinaDate()),search=ref(''),resultElement=ref()
const state=reactive({access:null,data:null,preview:null,downloaded:null,error:'',busy:false,operation:''}),previewElement=ref(),downloadElement=ref(),focusIntents=new Set()
let disposed=false
const scope=()=>!disposed&&props.active&&props.owner?props.owner:''
const filter=computed(()=>({kind:kind.value,from:from.value,to:to.value,search:search.value}))
const resource=createAdministrativeAuditResource({scope,state,access:readTeachingAdministrativeAuditAccess,read:readTeachingAdministrativeAuditPage,prepare:prepareTeachingAdministrativeAuditExport,download:downloadTeachingAdministrativeAuditExport,onFile:value=>{
  const url=URL.createObjectURL(value.blob),link=document.createElement('a');link.href=url;link.download=value.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}})
function cancelExportFocus(){for(const intent of focusIntents)intent.dispose();focusIntents.clear()}
async function exportStep(method){const owner=scope(),key=administrativeAuditKey(filter.value),intent=captureAuditFocusIntent(window),target=method==='prepare'?previewElement:downloadElement;focusIntents.add(intent);try{const ok=method==='prepare'?await resource.prepare(filter.value):await resource.download();if(!ok)return;const token=state.preview?.token;await nextTick();if(!disposed&&opened.value&&props.active&&owner===scope()&&key===administrativeAuditKey(filter.value)&&token&&token===state.preview?.token&&intent.current()){target.value?.focus({preventScroll:true});target.value?.scrollIntoView({block:'start',behavior:'auto'})}}finally{intent.dispose();focusIntents.delete(intent)}}
async function load(page=0,focus=false){const owner=scope(),key=administrativeAuditKey(filter.value);if(await resource.load(filter.value,page)&&focus){await nextTick();if(!disposed&&opened.value&&owner===scope()&&state.data?.page===page&&administrativeAuditKey(state.data.filter)===key){resultElement.value?.focus({preventScroll:true});resultElement.value?.scrollIntoView({block:'start',behavior:'auto'})}}}
async function activate(){if(!scope())return;if(!state.access&&!await resource.access())return;await load()}
async function toggle(event){opened.value=event.target.open;if(opened.value)await activate();else{cancelExportFocus();resource.reset(true)}}
function clearSearch(){search.value='';load()}
watch(()=>administrativeAuditKey(filter.value),()=>{cancelExportFocus();resource.reset()},{flush:'sync'})
watch(()=>[props.owner,props.active],([owner],[oldOwner])=>{cancelExportFocus();resource.reset(true);if(owner!==oldOwner){opened.value=false;search.value='';kind.value='ALL';from.value=addDays(chinaDate(),-6);to.value=chinaDate()}else if(opened.value&&props.active)activate()},{flush:'sync'})
onBeforeUnmount(()=>{disposed=true;cancelExportFocus();resource.dispose()})
</script>
<template>
  <details class="management-audit" :open="opened" :data-workflow-ready="state.data?'ready':state.error?'error':'waiting'" @toggle="toggle">
    <summary>管理操作历史</summary>
    <div v-if="opened" class="management-body">
      <p class="management-help">本校管理员只读核对：谁在什么时候，改了什么。按操作发生日期查询，不是上课日期。</p>
      <p v-if="!active" class="management-warning" role="status">先保存或取消正在编辑的配置，再读取历史；当前草稿仍保留。</p>
      <template v-else>
        <form v-if="state.access" class="management-filters" @submit.prevent="load()">
          <label>操作类型<select v-model="kind" :disabled="state.busy"><option value="ALL">全部已启用类型</option><option v-for="category in state.access.categories" :key="category.key" :value="category.key" :disabled="!category.enabled">{{ category.label }}{{ category.enabled?'':'（尚未启用）' }}</option></select></label>
          <label>开始日期<input v-model="from" type="date" required :disabled="state.busy" /></label>
          <label>结束日期<input v-model="to" type="date" :min="from" :max="addDays(from||chinaDate(),30)" required :disabled="state.busy" /></label>
          <label class="management-search">查人、课程或依据<input v-model="search" maxlength="80" placeholder="姓名、学号、课程或记录编号" :disabled="state.busy" /></label>
          <div class="management-actions"><button :class="{primary:!state.preview}" :disabled="state.busy">查询管理历史</button><button v-if="state.access.exportEnabled&&!state.preview" type="button" :disabled="state.busy||!state.data?.total||state.data.total>2000" :title="state.data?.total>2000?'超过2000条，请缩小日期、类型或搜索':'准备全部当前条件，不只这一页'" @click="exportStep('prepare')">准备完整导出<span v-if="state.data"> · {{ state.data.total }}条</span></button><button v-if="search" type="button" :disabled="state.busy" @click="clearSearch">清除搜索并读取</button></div>
        </form>
        <p v-if="state.busy" role="status">{{ state.operation==='download'?'正在重新核对权限、内容与文件校验…':state.operation==='prepare'?'正在核对完整范围并准备文件…':'正在核对管理员权限与完整记录范围…' }}</p>
        <p v-if="state.error" class="management-error" role="alert">{{ state.error }} <button type="button" :disabled="state.busy" @click="activate">重新读取</button></p>
        <template v-if="state.data">
          <div ref="resultElement" class="management-range" tabindex="-1" aria-label="管理历史查询范围">
            <strong>{{ state.data.filter.from }} 至 {{ state.data.filter.to }}</strong>
            <span>{{ ADMIN_AUDIT_KINDS[state.data.filter.kind]||'全部已启用类型' }} · 完整条件 {{ state.data.total }} 条操作</span>
            <small>操作条数不等于人数；名称与归属以逐条历史依据为准，未保存的快照不补造。</small>
          </div>
          <div v-if="state.access?.exportEnabled" class="management-export">
            <p>导出全部当前条件，不只这一页。每份最多2000条；下载不等于归档或备份。</p>
            <p v-if="state.data.total>2000" class="management-warning">超过2000条，请缩小日期、类型或搜索；不会截断文件。</p>
            <section v-if="state.preview" ref="previewElement" class="management-export-preview" tabindex="-1" aria-label="管理历史导出核对">
              <h3>完整导出 {{ state.preview.count }} 条管理记录</h3>
              <p>{{ state.preview.filter.from }} 至 {{ state.preview.filter.to }} · {{ ADMIN_AUDIT_KINDS[state.preview.filter.kind]||'全部已启用类型' }}<span v-if="state.preview.filter.search"> · 搜索：{{ state.preview.filter.search }}</span></p>
              <small>有效至 {{ auditDate(state.preview.expiresAt,true) }}。下载时重新核对权限与变更；不修改、归档或删除原记录。</small>
              <details><summary>查看文件校验值</summary><code>{{ state.preview.sha256 }}</code></details>
              <div class="management-actions"><button class="primary" type="button" :disabled="state.busy" @click="exportStep('download')">核验并下载管理历史 CSV</button><button type="button" :disabled="state.busy" @click="resource.clearPreview()">取消准备</button></div>
            </section>
            <p v-if="state.downloaded" ref="downloadElement" class="management-export-success" tabindex="-1" role="status">{{ state.downloaded.count }} 条已核验并交给浏览器下载，请检查下载文件。未归档、未删除原记录。</p>
          </div>
          <nav v-if="state.data.total" class="management-pages" aria-label="管理历史分页"><span>第 {{ state.data.page+1 }}/{{ state.data.totalPages }} 页</span><button type="button" :disabled="state.busy||state.data.page===0" @click="load(state.data.page-1,true)">上一页历史</button><button type="button" :disabled="state.busy||state.data.page+1>=state.data.totalPages" @click="load(state.data.page+1,true)">下一页历史</button></nav>
          <p v-if="!state.data.total" class="management-empty">这些条件下没有管理记录。可扩大日期（最多31天）、切换类型或清除搜索；不会用其他范围冒充结果。</p>
          <ol v-else class="management-rows">
            <li v-for="row in state.data.items" :key="row.id">
              <div class="management-row-heading"><strong>{{ row.target }}</strong><span class="management-action" :data-action="row.action">{{ ADMIN_AUDIT_ACTIONS[row.action] }}</span></div>
              <p>{{ row.context }}</p>
              <p v-if="row.beforeValue||row.afterValue" class="management-change">{{ row.kind==='ACCOUNT_BINDING'?'账号 ':'' }}{{ adminAuditState(row.beforeValue) }} → {{ adminAuditState(row.afterValue) }}</p>
              <p class="management-reason">{{ row.reason||'当次记录未填写原因' }}</p>
              <small><time :datetime="row.recordedAt">{{ auditDate(row.recordedAt,true) }}</time> · {{ row.actorName }}（账号 {{ row.actorId }}）<span v-if="row.revision!==null"> · 版本 {{ row.revision }}</span><span v-if="row.affectedLessons!==null"> · 影响 {{ row.affectedLessons }} 项安排</span></small>
              <details class="management-proof"><summary>历史依据与编号 · {{ ADMIN_AUDIT_KINDS[row.kind] }}</summary><p>{{ row.historyNote }}</p><p>记录 {{ row.eventId }}<br />对象 {{ row.subjectId }}</p></details>
            </li>
          </ol>
        </template>
        <details v-if="state.access" class="management-boundary"><summary>这份历史包含什么</summary><p v-for="category in state.access.categories" :key="category.key"><strong>{{ category.label }} · {{ category.enabled?'已接线':'尚未启用' }}</strong><br />{{ category.detail }}</p><p>注销或解绑后保留原审计。原记录没保存的历史班级或账号显示名明确标注，不用现在的信息补造。这里只读，不修改、归档或删除历史。</p></details>
      </template>
    </div>
  </details>
</template>
<style scoped>
.management-audit{max-width:800px;min-width:0;padding-block:12px;border-bottom:1px solid var(--assistant-line,#e2e7ec);font-size:16px;color:var(--assistant-ink,#29323c);line-height:1.7}.management-audit summary{min-height:44px;align-content:center;font-size:16px;cursor:pointer}.management-body{padding-top:8px}.management-help,small,.management-boundary{color:var(--assistant-muted,#5d6876);font-size:14px}.management-body p{margin:8px 0;overflow-wrap:anywhere}.management-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:20px 0}.management-filters label{display:grid;gap:6px;font-size:14px;min-width:0}.management-search,.management-actions{grid-column:1/-1}.management-actions,.management-pages{display:flex;gap:12px;align-items:center;flex-wrap:wrap}input,select,button{box-sizing:border-box;max-width:100%;min-width:0;min-height:44px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;padding:10px 12px;background:var(--assistant-surface,#fff);font:inherit;font-size:16px;color:inherit;caret-color:var(--assistant-accent,#0b62db)}input,select{width:100%}button{cursor:pointer;transition:background-color 180ms ease}button:hover:not(:disabled){background:var(--assistant-hover,#e8edf2)}button.primary{background:var(--assistant-accent,#0b62db);border-color:transparent;color:#fff}button.primary:hover:not(:disabled){background:var(--assistant-accent-hover,#084db0)}:disabled{opacity:.6;cursor:default}:focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}::selection{background:var(--assistant-soft,#eaf2ff)}.management-range{display:grid;gap:4px;margin-top:24px;scroll-margin-top:90px;font-variant-numeric:tabular-nums}.management-range strong{font-weight:600}.management-pages{margin:16px 0}.management-pages span{font-size:14px;font-variant-numeric:tabular-nums}.management-rows{padding:0;margin:0;list-style:none}.management-rows>li{padding:22px 0;border-bottom:1px solid var(--assistant-line,#e2e7ec)}.management-row-heading{display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap}.management-row-heading strong{font-weight:600;font-size:16px}.management-action{font-size:14px;color:var(--assistant-accent,#0b62db)}.management-action[data-action=LEAVE],.management-action[data-action=WITHDRAW]{color:var(--assistant-warning,#9a5400)}.management-action[data-action=RESTORE],.management-action[data-action=REENROLL]{color:var(--assistant-success,#187248)}.management-change{font-weight:500}.management-proof{margin-top:8px;font-size:14px;color:var(--assistant-muted,#5d6876)}.management-proof p{font-size:14px}.management-boundary{margin-top:22px}.management-boundary strong{font-size:14px;font-weight:500}.management-boundary p{margin:12px 0}.management-error{color:var(--assistant-danger,#bf303d)}.management-warning{color:var(--assistant-warning,#9a5400)}.management-empty{padding-block:18px}
.management-filters>label:first-child{grid-column:1/-1}
.management-action[data-action=CANCEL]{color:var(--assistant-warning,#9a5400)}
.management-export{margin:18px 0;font-size:14px;color:var(--assistant-muted,#5d6876)}.management-export-preview{padding-block:16px;border-block:1px solid var(--assistant-line,#e2e7ec);scroll-margin-top:100px}.management-export-preview h3{margin:0 0 8px;font-size:18px;font-weight:600;color:var(--assistant-ink,#29323c)}.management-export-preview code{display:block;overflow-wrap:anywhere;font-size:13px}.management-export-preview .management-actions{margin-top:12px}.management-export-success{color:var(--assistant-success,#187248);scroll-margin-top:100px}
@media(max-width:600px){.management-actions>button{flex:1 1 100%}.management-pages span{flex:1 1 100%}.management-pages button{flex:1 1 0}.management-rows>li{padding-block:20px}}
@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
