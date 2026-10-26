<script setup>
import {computed,nextTick,onBeforeUnmount,reactive,ref,watch} from 'vue'
import TeachingScopePicker from './TeachingScopePicker.vue'
import {readTeachingCourseMode,reviewTeachingCourseMode} from '@/api/teaching'
import {COURSE_MODES,createCourseModeResource} from '@/utils/teachingCourseMode'
import {useScopedConfirmation} from '@/utils/useScopedConfirmation'
import {useUnsavedChanges} from '@/utils/useUnsavedChanges'
import {auditDate} from '@/utils/teachingAudit'
import '@/styles/teaching-confirmation.css'
const props=defineProps({owner:{type:String,required:true},actorId:{type:Number,required:true},refresh:{type:Number,default:0},disabled:Boolean})
const state=reactive({data:null,preview:null,pending:null,busy:false,blocked:false,canRetry:false,error:'',notice:''})
const courseId=ref(''),mode=ref(''),reason=ref(''),opened=ref(false),resultElement=ref(),previewElement=ref()
let disposed=false,settling=false
const scope=()=>!disposed && props.owner?`${props.owner}:${courseId.value}`:''
const resource=createCourseModeResource({scope,actor:()=>props.actorId,state,read:readTeachingCourseMode,save:reviewTeachingCourseMode})
const {confirm,confirming}=useScopedConfirmation(()=>`${scope()}:${state.preview?.payload.requestId||''}:${mode.value}:${reason.value}`,()=>!disposed && !!props.owner)
const busy=computed(()=>props.disabled || state.busy || confirming.value),dirty=computed(()=>!!reason.value.trim() || !!mode.value || !!state.preview || !!state.pending)
useUnsavedChanges(()=>dirty.value,()=>busy.value)
const choicesLocked=computed(()=>busy.value || state.blocked)
async function focusResult(owner,id){await nextTick();if(!disposed && owner===props.owner && id===courseId.value && (state.notice||state.error)){resultElement.value?.focus({preventScroll:true});resultElement.value?.scrollIntoView({block:'start',behavior:'auto'})}}
function clearVerifiedDraft(){settling=true;mode.value='';reason.value='';settling=false}
async function read(){if(busy.value || !courseId.value)return;const owner=props.owner,id=courseId.value;const ok=await resource.load(id);if(ok && state.data?.mode!=='LEGACY')clearVerifiedDraft();if(state.notice||state.error)await focusResult(owner,id)}
async function prepare(){if(busy.value || state.blocked)return;const owner=props.owner,id=courseId.value;if(await resource.prepare(mode.value,reason.value)){const request=state.preview?.payload.requestId;await nextTick();if(!disposed && opened.value && owner===props.owner && id===courseId.value && request===state.preview?.payload.requestId){previewElement.value?.focus({preventScroll:true});previewElement.value?.scrollIntoView({block:'start',behavior:'auto'})}}}
async function submit(){
  if(busy.value || state.blocked || !state.preview)return
  const plan=state.preview,owner=props.owner,id=courseId.value,t=plan.target
  if(!await confirm(`课程：${t.name}\n学期：${t.semester}；任课教师：${t.teacher}\n周${t.weekday} ${t.startTime}—${t.endTime}；教室：${t.room}\n核定为：${COURSE_MODES[plan.payload.mode]}\n名单版本：${plan.payload.revision}\n依据：${plan.payload.reason}\n只明确来源类型；不新建或恢复选课，不改写过去考勤。核定后本入口不重复覆盖。`,{title:'核对历史课程类型',confirmText:'确认核定来源',className:'ct-teaching-change-confirm'}))return
  if(owner!==props.owner || id!==courseId.value || state.preview!==plan)return
  if(await resource.submit())clearVerifiedDraft();await focusResult(owner,id)
}
async function reconcile(retry=false){if(busy.value)return;const owner=props.owner,id=courseId.value;if(await (retry?resource.retry():resource.reconcile()))clearVerifiedDraft();await focusResult(owner,id)}
function cancelDraft(){if(busy.value || state.pending)return;mode.value='';reason.value='';resource.invalidatePreview()}
watch([mode,reason],()=>{if(!settling)resource.invalidatePreview()},{flush:'sync'})
watch(courseId,()=>{resource.reset();mode.value='';reason.value=''}, {flush:'sync'})
watch(()=>props.owner,()=>{resource.reset();courseId.value='';mode.value='';reason.value='';opened.value=false},{flush:'sync'})
onBeforeUnmount(()=>{disposed=true;resource.dispose()})
</script>
<template>
  <details class="course-mode-panel" @toggle="opened=$event.target.open">
    <summary>核定历史课程类型</summary>
    <template v-if="opened">
      <p class="mode-help">仅处理来源待定的历史课程。先读原课程，再核对整班或逐人选课依据；主办行政班不是整班名单的证明。</p>
      <TeachingScopePicker v-model="courseId" :owner="owner" kind="COURSE" label="待核对课程" :disabled="busy || dirty" :refresh="refresh" />
      <button type="button" :disabled="busy || !courseId" @click="read">{{ state.busy?'正在核对':'读取当前课程类型' }}</button>
      <section v-if="state.data" class="mode-target" aria-label="当前课程来源">
        <h3>{{ state.data.target.name }}</h3>
        <p>{{ state.data.target.semester }} · {{ state.data.target.teacher }}</p>
        <p>周{{ state.data.target.weekday }} {{ state.data.target.startTime }}—{{ state.data.target.endTime }} · {{ state.data.target.room }}</p>
        <p>{{ state.data.college }} · 主办行政班 {{ state.data.adminClassName }}<br />教学组 {{ state.data.groupName }}</p>
        <p class="mode-state" :class="state.data.mode==='LEGACY'?'warning':'success'">{{ COURSE_MODES[state.data.mode] }} · 当前名单版本 {{ state.data.revision }}</p>
        <p>有效成员 {{ state.data.activeMembers }} 人 · 跨主办班 {{ state.data.outsideAdminClass }} 人 · 待核实学籍 {{ state.data.invalidActiveMembers }} 人</p>
        <p class="mode-help">尚未开始且未取消的安排 {{ state.data.futureLessons }} 项；本次只核定类型，不改变这些安排或名单。</p>
        <template v-if="state.data.reviewedBy"><p>核定账号 {{ state.data.reviewedBy }} · {{ auditDate(state.data.reviewedAt,true) }}</p><p>核定依据：{{ state.data.reviewReason }}</p></template>
        <p v-else-if="state.data.mode!=='LEGACY'" class="mode-help">该课程创建时已明确类型；本入口不重写。</p>
      </section>
      <div v-if="state.notice || state.error" ref="resultElement" class="mode-operation-result" tabindex="-1">
        <strong>{{ state.data?.target.name || state.pending?.target.name }}</strong><small>{{ state.data?.target.semester || state.pending?.target.semester }} · {{ state.data?.target.teacher || state.pending?.target.teacher }}</small>
        <p v-if="state.notice" class="success" role="status">{{ state.notice }}</p><p v-if="state.error" class="failure" role="alert">{{ state.error }}</p>
      </div>
      <section v-if="state.pending" class="mode-recovery" aria-label="未确认核定请求">
        <h4>核对同一核定请求</h4><p>{{ state.pending.target.name }} · {{ COURSE_MODES[state.pending.payload.mode] }}</p><details><summary>查看已确认的核定依据</summary><p>{{ state.pending.payload.reason }}</p></details>
        <p>结果未确认时不另建请求；先读取回执，必要时重试同一个请求。</p>
        <div class="mode-actions"><button type="button" :disabled="busy" @click="reconcile()">核对当前结果</button><button v-if="state.canRetry" type="button" :disabled="busy" @click="reconcile(true)">重试同一核定请求</button></div>
      </section>
      <form v-if="state.data?.mode==='LEGACY'" @submit.prevent="prepare">
        <fieldset :disabled="choicesLocked"><legend>按原始教学依据选择</legend>
          <label class="mode-choice" :class="{'chosen':mode==='ADMIN_CLASS'}"><input v-model="mode" type="radio" value="ADMIN_CLASS" :disabled="choicesLocked || state.data.outsideAdminClass>0 || state.data.invalidActiveMembers>0" /><span><strong>按行政班整班授课</strong><small>未来转班/复学按行政班联动；有效成员不能跨主办班。</small></span></label>
          <label class="mode-choice" :class="{'chosen':mode==='EXPLICIT'}"><input v-model="mode" type="radio" value="EXPLICIT" :disabled="choicesLocked || state.data.invalidActiveMembers>0" /><span><strong>按逐人名单选课</strong><small>用于选修或合班；不因同班而自动加入。</small></span></label>
        </fieldset>
        <p v-if="state.data.outsideAdminClass" class="warning">当前有效名单含其他行政班学生，整班类型不可直接选择。请核对逐人选课依据；不会自动移除成员。</p>
        <p v-if="state.data.invalidActiveMembers" class="failure">先核对有效名单中的学籍/行政归属，本入口不忽略异常人员。</p>
        <label class="mode-reason">核定依据<textarea v-model="reason" rows="3" maxlength="300" :disabled="choicesLocked" required placeholder="填写已核对的原教学安排或选课依据" /></label>
        <div class="mode-actions"><button class="primary" :disabled="choicesLocked || !mode || !reason.trim()">核对并生成预览</button><button type="button" :disabled="busy || !!state.pending || !dirty" @click="cancelDraft">取消当前草稿</button></div>
      </form>
      <section v-if="state.preview" ref="previewElement" class="mode-preview" tabindex="-1" aria-label="课程类型核定预览">
        <h4>将 {{ state.preview.target.name }} 核定为{{ COURSE_MODES[state.preview.payload.mode] }}</h4>
        <p>{{ state.preview.target.semester }} · {{ state.preview.target.teacher }} · {{ state.preview.target.room }}</p><details class="mode-preview-reason"><summary>核定依据（{{ state.preview.payload.reason.length }}字）</summary><p>{{ state.preview.payload.reason }}</p></details>
        <p>预览五分钟内有效。只明确后续联动规则；不新建选课，不修改历史考勤、归属或原通知。</p>
        <div class="mode-actions"><button class="primary" type="button" :disabled="busy || state.blocked" @click="submit">确认核定来源</button><button type="button" :disabled="busy" @click="resource.invalidatePreview()">取消预览</button></div>
      </section>
    </template>
  </details>
</template>
<style scoped>
.course-mode-panel{max-width:800px;min-width:0;padding-block:12px;border-bottom:1px solid var(--assistant-line,#e2e7ec);color:var(--assistant-ink,#29323c);font-size:16px;line-height:1.7}summary{font-size:16px;min-height:44px;align-content:center;cursor:pointer}.mode-help{color:var(--assistant-muted,#5d6876);font-size:14px}p{margin:10px 0;overflow-wrap:anywhere}.mode-target{margin-top:24px;padding-block:18px;border-block:1px solid var(--assistant-line,#e2e7ec)}h3{margin:0 0 8px;font-size:18px;font-weight:600}h4{margin:0 0 10px;font-size:16px;font-weight:600}.mode-state{font-weight:600;font-variant-numeric:tabular-nums}.warning{color:var(--assistant-warning,#9a5400)}.success{color:var(--assistant-success,#187248)}.failure{color:var(--assistant-danger,#bf303d)}
button,textarea{font:inherit;font-size:16px;min-height:44px;min-width:0;max-width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;color:inherit;background:var(--assistant-surface,#fff);caret-color:var(--assistant-accent,#0b62db)}button{cursor:pointer;transition:background-color 180ms ease}.course-mode-panel>button{margin-top:12px}button:hover:not(:disabled){background:var(--assistant-hover,#e8edf2)}button.primary{background:var(--assistant-accent,#0b62db);color:white;border-color:transparent}button.primary:hover:not(:disabled){background:var(--assistant-accent-hover,#084db0)}:disabled{opacity:.6;cursor:default}:focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}::selection{background:var(--assistant-soft,#eaf2ff)}
form{margin-top:24px}fieldset{border:0;padding:0;margin:0;display:grid;gap:10px}legend{font-size:16px;font-weight:600;margin-bottom:10px}.mode-choice{display:flex;gap:12px;align-items:center;min-height:56px;padding:12px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;cursor:pointer}.mode-choice.chosen{background:var(--assistant-soft,#eaf2ff);border-color:transparent}.mode-choice input{width:20px;height:20px;flex:none;accent-color:var(--assistant-accent,#0b62db)}.mode-choice strong{font-size:16px;font-weight:500}.mode-choice small{display:block;font-size:14px;color:var(--assistant-muted,#5d6876);margin-top:4px}.mode-reason{display:grid;gap:8px;margin-top:20px;font-size:14px}textarea{width:100%;resize:vertical}.mode-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}.mode-preview,.mode-recovery{margin-top:24px;padding-top:20px;border-top:1px solid var(--assistant-line,#e2e7ec)}.mode-operation-result{scroll-margin-top:90px;margin-block:18px}.mode-operation-result p{margin:0}.mode-operation-result .failure{margin-top:8px}
@media(max-width:600px){.mode-actions>button{flex:1 1 100%}.mode-choice{align-items:flex-start}.mode-choice input{margin-top:4px}}@media(prefers-reduced-motion:reduce){button{transition:none}}
.mode-preview{scroll-margin-top:90px}.mode-operation-result>strong{font-size:16px;font-weight:600}.mode-operation-result>small{display:block;font-size:14px;color:var(--assistant-muted,#5d6876);margin:4px 0 10px}.mode-choice:has(input:disabled){opacity:.6;cursor:default}
</style>
