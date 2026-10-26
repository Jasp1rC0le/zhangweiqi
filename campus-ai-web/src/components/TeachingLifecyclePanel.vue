<script setup>
import { computed,onBeforeUnmount,ref,watch } from 'vue'
import TeachingScopePicker from './TeachingScopePicker.vue'
import { readTeachingMembers,readTeachingStudentStatus,transitionTeachingStudent,readTeachingConfigPage } from '@/api/teaching'
import { validatedConfigPage } from '@/utils/teachingConfigPage'
import { validatedRosterMembers } from '@/utils/teachingEnrollment'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { validatedTeachingStudent,studentTransitionPlan,validatedTransitionReceipt } from '@/utils/teachingLifecycle'
import '@/styles/teaching-confirmation.css'
const props=defineProps({owner:{type:String,required:true},refresh:{type:Number,default:0},allowRestore:Boolean})
const source=ref(''),members=ref([]),selected=ref(''),status=ref(null),action=ref('TRANSFER'),target=ref(''),reason=ref(''),busy=ref(false),error=ref(''),notice=ref(''),uncertain=ref(false)
let epoch=0,controller,disposed=false,requestId=crypto.randomUUID()
const fingerprint=()=>JSON.stringify([selected.value,status.value?.revision,action.value,target.value,reason.value])
const {confirm,confirming}=useScopedConfirmation(()=>`${props.owner}:${fingerprint()}`,()=>!disposed && !!props.owner)
const blocked=computed(()=>busy.value || confirming.value)
useUnsavedChanges(()=>!!reason.value.trim() || !!target.value,()=>blocked.value)
function operation(){controller?.abort();controller=new AbortController();const signal=controller.signal,generation=++epoch,owner=props.owner;busy.value=true;error.value='';return{signal,current:()=>!disposed && !!owner && owner===props.owner && generation===epoch && !signal.aborted}}
async function loadMembers(){if(blocked.value || !source.value || reason.value.trim())return;const op=operation();members.value=[];selected.value='';status.value=null;notice.value='';try{const {data}=await readTeachingMembers(source.value,op.signal);if(op.current())members.value=validatedRosterMembers(data)}catch(e){if(op.current())error.value=e.response?.data?.message || e.message}finally{if(op.current())busy.value=false}}
async function readStatus(){if(blocked.value || !selected.value || reason.value.trim())return;const id=selected.value,op=operation();status.value=null;notice.value='';try{const {data}=await readTeachingStudentStatus(id,op.signal);if(op.current()){status.value=validatedTeachingStudent(data,id);action.value=data.status==='LEFT'?'RESTORE':'TRANSFER';target.value='';uncertain.value=false;requestId=crypto.randomUUID()}}catch(e){if(op.current())error.value=e.response?.data?.message || e.message}finally{if(op.current())busy.value=false}}
async function submit(){
  if(blocked.value || uncertain.value || !status.value || !reason.value.trim() || (action.value==='RESTORE' && !props.allowRestore))return
  let plan
  try{plan=studentTransitionPlan(status.value,action.value,target.value,reason.value,requestId)}catch(e){error.value=e.message;return}
  const id=plan.studentId,key=fingerprint(),owner=props.owner,nextClass=plan.nextClass,nextState=plan.nextState
  notice.value=''
  let targetLabel=''
  if(action.value!=='LEAVE'){
    const check=operation(),query={kind:'CLASS',selected:nextClass,page:0,size:1,search:''}
    try{const {data}=await readTeachingConfigPage(query,check.signal);if(!check.current())return;validatedConfigPage(data,query);if(!data.selected)throw new Error('转入班级不可用，请重新选择');targetLabel=`转入 ${data.selected.description} · ${data.selected.label}。`}catch(e){if(check.current())error.value=e.response?.data?.message || e.message;return}finally{if(check.current())busy.value=false}
  }
  if(owner!==props.owner || key!==fingerprint())return
  const effect=action.value==='RESTORE'?'保留原学生账号，只接回该行政班未来整班课。原选修仍保持退课，需单独重新选课；不补造离校期间考勤。':action.value==='TRANSFER'?'未来整班课随新行政班调整，选修保留并更新未来归属。':'离校后撤下未来课程与站内提醒，不删除账号。'
  if(!await confirm(`${status.value.name}（${status.value.studentNumber}）\n${targetLabel}${effect}\n历史考勤、原行政归属和更正记录保留；若该同学未来已有点名，则整笔拒绝。\n核验原因：${plan.payload.reason}`,{title:action.value==='RESTORE'?'核对复学联动':action.value==='TRANSFER'?'核对转班联动':'核对离校联动',confirmText:action.value==='RESTORE'?'确认复学':'确认学籍变更',className:'ct-teaching-change-confirm'}))return
  if(owner!==props.owner || key!==fingerprint())return
  const payload=plan.payload,op=operation()
  let acknowledged=false
  try{
    const {data}=await transitionTeachingStudent(id,payload,op.signal);if(!op.current())return
    uncertain.value=true
    validatedTransitionReceipt(data,plan)
    acknowledged=true;notice.value=`学籍变更已保存，联动 ${data.affectedLessons} 项未来安排；历史保留。`
    const fresh=await readTeachingStudentStatus(id,op.signal);if(!op.current())return
    const verified=validatedTeachingStudent(fresh.data,id);if(verified.revision<data.revision || (verified.revision===data.revision && (verified.classId!==nextClass || verified.status!==nextState)))throw new Error('最新状态与回执不一致')
    status.value=verified;reason.value='';target.value='';action.value=verified.status==='LEFT'?'RESTORE':'TRANSFER';uncertain.value=false;requestId=crypto.randomUUID()
  }catch(e){if(op.current()){uncertain.value=true;error.value=acknowledged?'已保存，但最新状态未确认。清空原因后重新读取，不要重复提交。':e.response?.data?.message || e.message || '结果未确认，清空原因后重新读取'}}finally{if(op.current())busy.value=false}
}
watch(selected,()=>{status.value=null;notice.value='';uncertain.value=false;requestId=crypto.randomUUID()})
watch(source,()=>{members.value=[];selected.value='';status.value=null;notice.value=''})
watch(()=>props.owner,()=>{epoch++;controller?.abort();busy.value=false;members.value=[];selected.value='';source.value='';status.value=null;target.value='';reason.value='';notice.value='';error.value='';uncertain.value=false},{flush:'sync'})
onBeforeUnmount(()=>{disposed=true;epoch++;controller?.abort();members.value=[];status.value=null})
</script>
<template>
  <details class="lifecycle-panel"><summary>{{ allowRestore?'转班、离校与复学':'转班与离校' }}</summary>
    <p>只由本校管理员操作。先选人、读取当前状态，再核对变更；历史考勤不随当前班级改写。</p>
    <TeachingScopePicker v-model="source" :owner="owner" label="查找学生当前行政班" :disabled="blocked || !!reason.trim()" :refresh="refresh" />
    <button type="button" :disabled="blocked || !source || !!reason.trim()" @click="loadMembers">读取本班名单</button>
    <label v-if="members.length">选择学生<select v-model="selected" :disabled="blocked || !!reason.trim()"><option value="">请选择</option><option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }} · {{ m.studentNumber }}</option></select></label>
    <button v-if="selected" type="button" :disabled="blocked || !!reason.trim()" @click="readStatus">读取当前学籍状态</button>
    <p v-if="error" class="failure" role="alert">{{ error }}</p><p v-if="notice && !reason.trim() && !target" class="success" role="status">{{ notice }}</p>
    <form v-if="status" @submit.prevent="submit">
      <h3>{{ status.name }}</h3><p>{{ status.studentNumber }} · {{ status.college }} · {{ status.className }}<br />{{ status.status==='LEFT'?'已离校':'在校' }} · 状态版本 {{ status.revision }}</p>
      <template v-if="status.status==='ACTIVE' || allowRestore"><label v-if="status.status==='ACTIVE'">变更类型<select v-model="action" :disabled="blocked"><option value="TRANSFER">转班</option><option value="LEAVE">离校</option></select></label>
      <p v-else class="restore-hint">复学只接回所选行政班未来整班课。原选修需到“调整已建课程名单”另行核对，不自动恢复，也不补造离校期间考勤。</p>
      <TeachingScopePicker v-if="action!=='LEAVE'" v-model="target" :owner="owner" :label="action==='RESTORE'?'复学行政班':'转入行政班'" :disabled="blocked" :refresh="refresh" />
      <label>核验原因<textarea v-model="reason" rows="2" maxlength="300" :disabled="blocked" required placeholder="填写已核对的学籍变动依据" /></label>
      <p v-if="reason.trim()">原因草稿已保留；清空后可重新选人或读取状态。</p>
      <button type="submit" class="primary-action" :disabled="blocked || uncertain || !reason.trim() || (action!=='LEAVE' && !target) || (action==='TRANSFER' && target===status.classId)">{{ busy?'正在核对保存':action==='RESTORE'?'核对并复学':'核对并确认变更' }}</button></template>
      <p v-else>当前后端尚未开放复学操作；旧身份和历史保留，不自动恢复选课。</p>
    </form>
  </details>
</template>
<style scoped>
.lifecycle-panel{max-width:760px;padding-block:12px;border-bottom:1px solid var(--assistant-line,#e2e7ec);color:var(--assistant-ink,#29323c)}summary{font-size:16px;min-height:44px;align-content:center;cursor:pointer}p{font-size:14px;line-height:1.7;color:var(--assistant-muted,#5d6876);margin:12px 0}form{margin-top:24px;display:grid;gap:14px}h3{font-size:18px;font-weight:600;margin:0}label{display:grid;gap:8px;margin-top:14px;font-size:14px}input,select,textarea,button{font:inherit;font-size:16px;min-height:44px;min-width:0;max-width:100%;box-sizing:border-box;padding:9px 12px;color:inherit;background:var(--assistant-surface,#fff);border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px}button{cursor:pointer;margin-top:12px;justify-self:start}textarea{resize:vertical;width:100%}.primary-action{background:var(--assistant-accent,#2b63cf);color:#fff;border-color:transparent}.failure{color:var(--assistant-danger,#a43e42)}.success{color:var(--assistant-success,#216b4c)}:disabled{opacity:.6;cursor:not-allowed}:focus-visible{outline:2px solid var(--assistant-accent,#2b63cf);outline-offset:3px}
</style>
