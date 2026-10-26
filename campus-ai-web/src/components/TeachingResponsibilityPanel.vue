<script setup>
import {computed,nextTick,onBeforeUnmount,reactive,ref,watch} from 'vue'
import {readTeachingResponsibility,readTeachingResponsibilityPage,changeTeachingResponsibility,readTeachingResponsibilityReceipt} from '@/api/teaching'
import {createResponsibilityResource,responsibilityPage} from '@/utils/teachingResponsibilities'
import {useScopedConfirmation} from '@/utils/useScopedConfirmation'
import {useUnsavedChanges} from '@/utils/useUnsavedChanges'
import TeachingScopePicker from './TeachingScopePicker.vue'
import '@/styles/teaching-confirmation.css'
const props=defineProps({owner:{type:String,required:true},actorId:{type:Number,required:true},refresh:{type:Number,default:0},disabled:Boolean})
const emit=defineEmits(['state'])
const userId=ref(''),role=ref('COUNSELOR'),scopeKey=ref(''),reason=ref(''),opened=ref(false),list=ref(null),listBusy=ref(false),listError=ref(''),resultElement=ref(),previewElement=ref(),editorElement=ref()
const state=reactive({data:null,preview:null,pending:null,result:null,busy:false,blocked:false,canRetry:false,error:'',notice:''})
let disposed=false,listEpoch=0,listController,settling=false
const scope=()=>!disposed&&props.owner?`${props.owner}:${userId.value}:${role.value}:${scopeKey.value}`:''
const resource=createResponsibilityResource({scope,actor:()=>props.actorId,state,read:readTeachingResponsibility,save:changeTeachingResponsibility,receipt:readTeachingResponsibilityReceipt})
const {confirm,confirming}=useScopedConfirmation(()=>`${scope()}:${state.preview?.payload.requestId||''}:${reason.value}`,()=>!disposed&&!!props.owner)
const busy=computed(()=>props.disabled||state.busy||listBusy.value||confirming.value)
const locked=computed(()=>busy.value||state.blocked)
const dirty=computed(()=>!!reason.value.trim()||!!state.preview||!!state.pending)
const roleName=computed(()=>role.value==='COUNSELOR'?'辅导员':'书记')
useUnsavedChanges(()=>dirty.value,()=>busy.value)
watch([dirty,busy],()=>emit('state',{dirty:dirty.value,busy:busy.value}),{immediate:true})
const validUser=computed(()=>/^[1-9]\d*$/.test(userId.value)&&Number.isSafeInteger(Number(userId.value)))
async function readList(page=0){
  if(disposed||!props.owner||!validUser.value||state.busy||listBusy.value)return false
  listController?.abort();listController=new AbortController();const signal=listController.signal,epoch=++listEpoch,owner=props.owner,target=Number(userId.value),view=role.value
  listBusy.value=true;listError.value='';list.value=null
  const current=()=>!disposed&&owner===props.owner&&target===Number(userId.value)&&view===role.value&&epoch===listEpoch&&!signal.aborted
  try{const query={userId:target,viewRole:view,page,size:25};const r=await readTeachingResponsibilityPage(query,signal);if(!current())return false;list.value=responsibilityPage(r.data,query);return true}
  catch(error){if(current())listError.value=state.result?'本次操作已有保存回执，但范围清单读取失败。请重新读取，不重复保存。':error.response?.data?.message||error.message||'负责范围读取失败，请重试';return false}
  finally{if(current())listBusy.value=false}
}
async function readTarget(){
  if(locked.value||!validUser.value||!scopeKey.value)return
  const owner=props.owner,key=scope()
  if(await resource.load({userId:Number(userId.value),viewRole:role.value,scopeKey:scopeKey.value})){await nextTick();if(!disposed&&owner===props.owner&&key===scope()){editorElement.value?.focus({preventScroll:true});editorElement.value?.scrollIntoView({block:'start',behavior:'auto'})}}
}
async function selectExisting(item){if(locked.value)return;scopeKey.value=item.scopeKey;await nextTick();await readTarget()}
async function prepare(){
  if(locked.value||!state.data)return
  const owner=props.owner,key=scope()
  if(await resource.prepare(state.data.active?'REVOKE':'GRANT',reason.value)){const id=state.preview?.payload.requestId;await nextTick();if(!disposed&&owner===props.owner&&key===scope()&&id===state.preview?.payload.requestId){previewElement.value?.focus({preventScroll:true});previewElement.value?.scrollIntoView({block:'start',behavior:'auto'})}}
}
async function afterSave(ok){
  if(!ok)return
  settling=true;reason.value='';settling=false
  const owner=props.owner,request=state.result?.requestId;await nextTick()
  if(!disposed&&owner===props.owner&&request===state.result?.requestId){resultElement.value?.focus({preventScroll:true});resultElement.value?.scrollIntoView({block:'start',behavior:'auto'});await readList()}
}
async function submit(){
  if(busy.value||state.blocked||!state.preview)return
  const plan=state.preview,t=plan.target,key=scope(),owner=props.owner
  const accepted=await confirm(`账号：${t.account}（编号${t.userId}）\n身份：${roleName.value}\n范围：${t.scopeLabel}\n操作：${plan.payload.action==='REVOKE'?'撤销这一个范围':'授予这一个范围'}\n当前范围版本：${plan.payload.revision}\n原因：${plan.payload.reason}\n不改变平台身份；不删除已保存的考勤和历史。`,{title:'确认负责范围变更',confirmText:plan.payload.action==='REVOKE'?'确认撤销此范围':'确认授予此范围',className:'ct-teaching-change-confirm'})
  if(!accepted||disposed||owner!==props.owner||key!==scope()||plan!==state.preview)return
  await afterSave(await resource.submit())
}
async function reconcile(){if(!busy.value)await afterSave(await resource.reconcile())}
async function retry(){if(busy.value||!state.canRetry)return;if(await confirm('只重试同一个已确认请求编号和原内容。服务器会核对回执，不创建第二次权限变更。',{title:'重试原请求',confirmText:'重试同一个请求',className:'ct-teaching-change-confirm'}))await afterSave(await resource.retry())}
function resetTarget(){resource.reset();settling=true;reason.value='';settling=false}
watch(scopeKey,resetTarget,{flush:'sync'})
watch([userId,role],()=>{listEpoch++;listController?.abort();listBusy.value=false;list.value=null;listError.value='';scopeKey.value='';resetTarget()},{flush:'sync'})
watch(reason,()=>{if(!settling)resource.invalidatePreview()},{flush:'sync'})
watch(()=>props.owner,()=>{listEpoch++;listController?.abort();listBusy.value=false;list.value=null;listError.value='';userId.value='';scopeKey.value='';resetTarget()},{flush:'sync'})
onBeforeUnmount(()=>{disposed=true;listEpoch++;listController?.abort();resource.dispose();emit('state',{dirty:false,busy:false})})
</script>
<template>
  <details :open="opened" class="responsibility-panel" data-teaching-tool="responsibility" @toggle="opened=$event.target.open">
    <summary>辅导员与书记负责范围</summary>
    <p class="help">辅导员按班级、书记按学院。先核对账号和现有权限，再明确授予或撤销；每次变更必须填写原因。</p>
    <form class="target-form" @submit.prevent="readList(0)">
      <label>已核实账号编号<input v-model="userId" inputmode="numeric" pattern="[1-9][0-9]*" required :disabled="locked" placeholder="账号编号，不是学号" /></label>
      <label>教学身份<select v-model="role" aria-label="教学身份" :disabled="locked"><option value="COUNSELOR">辅导员</option><option value="SECRETARY">书记</option></select></label>
      <button class="primary" :disabled="locked||!validUser">读取当前负责范围</button>
    </form>
    <p v-if="listError" class="failure" role="alert">{{listError}} <button type="button" :disabled="busy" @click="readList(0)">重新读取清单</button></p>
    <section v-if="list" class="current-scopes" aria-label="当前授权范围">
      <h3>{{list.account}}</h3><p>当前{{roleName}}负责 {{list.total}} 个{{role==='COUNSELOR'?'班级':'学院'}} · 范围版本{{list.revision}}</p>
      <p v-if="!list.total" class="help">还没有负责范围。可在下方选择一个本校范围，核对后授予。</p>
      <ul><li v-for="item in list.items" :key="item.scopeKey"><span>{{item.scopeLabel}}</span><button type="button" :disabled="locked" @click="selectExisting(item)">核对并撤销</button></li></ul>
      <nav v-if="list.totalPages>1" aria-label="负责范围分页"><button type="button" :disabled="locked||list.page===0" @click="readList(list.page-1)">上一页</button><span>{{list.page+1}} / {{list.totalPages}}页</span><button type="button" :disabled="locked||list.page+1>=list.totalPages" @click="readList(list.page+1)">下一页</button></nav>
    </section>
    <section v-if="validUser" ref="editorElement" tabindex="-1" class="scope-editor" aria-label="单个负责范围变更">
      <TeachingScopePicker v-model="scopeKey" :owner="owner" :kind="role==='SECRETARY'?'COLLEGE':'CLASS'" :label="role==='SECRETARY'?'选择要调整的学院':'选择要调整的班级'" :disabled="locked" :refresh="refresh" />
      <button type="button" :disabled="locked||!scopeKey" @click="readTarget">核对这个范围</button>
      <template v-if="state.data">
        <h3>{{state.data.scopeLabel}}</h3><p>{{state.data.account}} · {{roleName}}</p>
        <p :class="state.data.active?'success':'help'">{{state.data.active?'当前有此范围权限，可撤销':'当前没有此范围权限'}}</p><p class="help">{{state.data.baselineNote}}</p>
        <p v-if="!state.data.active&&!state.data.eligible" class="warning">账号未具备有效的对应教学身份，不能增加范围。请先由管理员核对身份申请。</p>
        <label>变更原因<textarea v-model="reason" rows="3" maxlength="300" :disabled="locked" placeholder="例如：负责班级调整，撤销原班级权限" /></label>
        <button type="button" :class="state.data.active?'danger':'primary'" :disabled="locked||!reason.trim()||!state.data.active&&!state.data.eligible" @click="prepare">{{state.data.active?'预览撤销这个范围':'预览授予这个范围'}}</button>
      </template>
    </section>
    <section v-if="state.preview" ref="previewElement" tabindex="-1" class="operation-preview" aria-label="负责范围变更预览">
      <h3>{{state.preview.payload.action==='REVOKE'?'将撤销':'将授予'}}：{{state.preview.target.scopeLabel}}</h3><p>{{state.preview.target.account}} · {{roleName}}</p>
      <details><summary>查看完整原因</summary><p>{{state.preview.payload.reason}}</p></details>
      <p class="help">只改变此范围的查看权限，不改变身份，不删除考勤。</p>
      <div class="actions"><button type="button" :class="state.preview.payload.action==='REVOKE'?'danger':'primary'" :disabled="busy" @click="submit">{{state.preview.payload.action==='REVOKE'?'确认撤销此范围':'确认授予此范围'}}</button><button type="button" :disabled="busy" @click="resource.invalidatePreview()">取消预览</button></div>
    </section>
    <section v-if="state.pending" class="recovery" aria-label="未确认的负责范围变更"><h3>先核对上一次操作</h3><p>账号与范围已锁定，避免结果未知时重复授权或撤销。</p><div class="actions"><button type="button" :disabled="busy" @click="reconcile">核对保存回执</button><button v-if="state.canRetry" type="button" :disabled="busy" @click="retry">重试同一个请求</button></div></section>
    <section v-if="state.error||state.notice" ref="resultElement" tabindex="-1" class="operation-result" aria-label="负责范围操作结果">
      <p v-if="state.notice" :class="state.result?'success':'help'" role="status">{{state.notice}}</p><p v-if="state.result" class="help">{{state.result.scopeLabel}} · 本次回执版本{{state.result.revision}}；当前权限请看最新范围清单。</p><p v-if="state.error" class="failure" role="alert">{{state.error}}</p>
    </section>
  </details>
</template>
<style scoped>
.scope-editor{scroll-margin-top:90px}
.responsibility-panel{max-width:800px;min-width:0;color:var(--assistant-ink,#29323c);font-size:16px;line-height:1.7;border-bottom:1px solid var(--assistant-line,#e2e7ec);padding-block:12px}summary{min-height:44px;align-content:center;cursor:pointer;font-size:16px}p{margin:10px 0;overflow-wrap:anywhere}.help{color:var(--assistant-muted,#5d6876);font-size:14px}.success{color:var(--assistant-success,#187248)}.warning{color:var(--assistant-warning,#9a5400)}.failure{color:var(--assistant-danger,#bf303d)}h3{margin:16px 0 8px;font-size:18px;font-weight:600;overflow-wrap:anywhere}form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-block:20px}label{display:grid;gap:8px;font-size:15px}input,select,textarea,button{font:inherit;font-size:16px;box-sizing:border-box;min-height:44px;min-width:0;max-width:100%;padding:10px 12px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;background:var(--assistant-surface,#fff);color:inherit;caret-color:var(--assistant-accent,#0b62db)}textarea{width:100%;resize:vertical}button{cursor:pointer;transition:background-color 180ms ease}button:hover:not(:disabled){background:var(--assistant-hover,#e8edf2)}button.primary{background:var(--assistant-accent,#0b62db);color:#fff;border-color:transparent}button.primary:hover:not(:disabled){background:var(--assistant-accent-hover,#084db0)}button.danger{color:var(--assistant-danger,#bf303d);background:var(--assistant-danger-soft,#fff0f1);border-color:transparent}:disabled{opacity:.6;cursor:default}:focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}::selection{background:var(--assistant-soft,#eaf2ff)}ul{list-style:none;padding:0;margin:12px 0}li{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-block:12px;border-bottom:1px solid var(--assistant-line,#e2e7ec)}li>span{min-width:0;overflow-wrap:anywhere}li>button{flex:none}nav,.actions{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.scope-editor,.operation-preview,.recovery{margin-top:24px;padding-top:20px;border-top:1px solid var(--assistant-line,#e2e7ec)}.scope-editor>button{margin-top:14px}.scope-editor>label{margin-top:20px}.operation-preview,.operation-result{scroll-margin-top:90px}.operation-result{margin-block:20px}.actions{margin-top:16px}@media(max-width:600px){form{grid-template-columns:1fr}li{align-items:flex-start;flex-wrap:wrap}li>span{flex:1 1 100%}.actions>button{flex:1 1 100%}}@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
