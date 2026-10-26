<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import TeachingScopePicker from './TeachingScopePicker.vue'
import { readTeachingCourseRosterPage,readTeachingCourseMember,withdrawTeachingMember,readTeachingStudentStatus,reenrollTeachingMember } from '@/api/teaching'
import { createEnrollmentResource } from '@/utils/teachingEnrollment'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import '@/styles/teaching-confirmation.css'
const props=defineProps({owner:{type:String,required:true},refresh:{type:Number,default:0},allowReenroll:Boolean})
const choice=ref(''),student=ref(''),reason=ref(''),search=ref(''),page=ref(0),disposed=ref(false),mode=ref('WITHDRAW')
const state=reactive({roster:null,loading:false,saving:false,error:'',notice:'',uncertain:false})
const operationResult=ref(null),operationResultElement=ref()
const resource=createEnrollmentResource({owner:()=>props.owner,state,readPage:readTeachingCourseRosterPage,readMember:readTeachingCourseMember,write:withdrawTeachingMember,readStudent:readTeachingStudentStatus,writeReenrollment:reenrollTeachingMember})
const scope=()=>JSON.stringify([props.owner,choice.value,state.roster?.revision,student.value,reason.value,mode.value,state.reenrollmentPreview?.requestId])
const {confirm,confirming}=useScopedConfirmation(scope,()=>!disposed.value && !!props.owner)
const busy=computed(()=>state.loading || state.saving || confirming.value)
const visible=computed(()=>state.roster?.members || [])
async function changePage(value=0){if(busy.value || reason.value.trim() || !state.roster)return;if(await resource.load(state.roster.courseId,value,search.value)){page.value=value;student.value=''}}
useUnsavedChanges(()=>!!reason.value.trim() || !!student.value,()=>busy.value)
async function load(){if(busy.value || !choice.value)return;if((reason.value.trim() || student.value) && !await confirm('重新读取会清除尚未提交的选人、核验原因和预览。取消会保留内容。',{title:'读取这门课程？',confirmText:'清除草稿并读取',className:'ct-teaching-change-confirm'}))return;operationResult.value=null;if(await resource.load(choice.value)){reason.value='';student.value='';page.value=0;search.value=''}}
async function changeMode(next){if(busy.value || mode.value===next || (next==='REENROLL' && !props.allowReenroll))return;if((reason.value.trim() || student.value) && !await confirm('切换办理事项会清除选人、原因和预览；不会提交任何操作。',{title:'切换名单变更？',confirmText:'清除草稿并切换',className:'ct-teaching-change-confirm'}))return;mode.value=next;student.value='';reason.value='';resource.invalidateReenrollment()}
async function withdraw(){const roster=state.roster,member=roster?.members.find(m=>m.studentId===student.value && m.active);if(busy.value || state.uncertain || !member || choice.value!==roster.courseId || !reason.value.trim())return;if(!await confirm(`将 ${member.name} 从 ${roster.target.name}（${roster.target.semester}，${roster.target.teacher}，周${roster.target.weekday} ${roster.target.startTime}—${roster.target.endTime}，${roster.groupName}）的未来未记录课程中退课。过去考勤保留，已点名的未来课程不会自动覆盖。`,{title:'核对退课',confirmText:'确认退课',className:'ct-teaching-change-confirm'}))return;if(await resource.withdraw(member.studentId,reason.value)){reason.value='';student.value='';page.value=0}}
async function prepareReenrollment(){if(busy.value || mode.value!=='REENROLL' || !props.allowReenroll || choice.value!==state.roster?.courseId)return;operationResult.value=null;await resource.prepareReenrollment(student.value,reason.value)}
async function saveReenrollment(){
  const preview=state.reenrollmentPreview,roster=state.roster,key=scope(),principal=props.owner
  if(busy.value || state.uncertain || !props.allowReenroll || mode.value!=='REENROLL' || !preview || !roster || choice.value!==roster.courseId || preview.studentId!==student.value || preview.reason!==reason.value.trim())return
  if(!await confirm(`重新选课：${preview.person.name}（${preview.person.studentNumber}）\n课程：${roster.target.name} · ${roster.target.semester} · ${roster.target.teacher}\n周${roster.target.weekday} ${roster.target.startTime}—${roster.target.endTime} · ${roster.target.room} · ${roster.groupName}\n当前归属：${preview.person.college} · ${preview.person.className}\n只恢复本课尚未开始且未取消的安排，过去和离校期间不补造考勤；其他原选修不会自动恢复。\n原因：${preview.reason}`,{title:'确认原课程重新选课',confirmText:'确认重新选课',className:'ct-teaching-change-confirm'}))return
  if(scope()!==key)return
  const target={key:preview.requestId,person:preview.person.name,studentNumber:preview.person.studentNumber,course:roster.target.name,semester:roster.target.semester,teacher:roster.target.teacher,room:roster.target.room}
  const confirmed=await resource.reenroll(student.value,reason.value)
  if(principal!==props.owner || disposed.value)return
  if(confirmed){reason.value='';student.value='';page.value=state.pagination?.page || 0}
  if(!state.notice && !state.error)return
  operationResult.value={...target,confirmed,notice:state.notice,error:state.error}
  await nextTick()
  if(principal!==props.owner || disposed.value || operationResult.value?.key!==target.key)return
  operationResultElement.value?.focus({preventScroll:true})
  operationResultElement.value?.scrollIntoView({block:'start',behavior:'auto'})
}
watch([choice,student,reason,mode],()=>{resource.invalidateReenrollment();operationResult.value=null},{flush:'sync'})
watch(()=>props.owner,()=>{resource.reset();choice.value='';student.value='';reason.value='';search.value='';page.value=0;mode.value='WITHDRAW';operationResult.value=null},{flush:'sync'})
onBeforeUnmount(()=>{disposed.value=true;resource.reset()})
</script>
<template>
  <details class="withdrawal-panel"><summary>调整已建课程名单</summary>
    <p>{{ allowReenroll?'核实原课程退课或重新选课，只调整未来安排，过去考勤保留。转班、离校与复学在下方单独核对。':'只处理核实后的退课，保留过去考勤。当前后端未开放重新选课。' }}</p>
    <div v-if="allowReenroll" class="enrollment-modes" role="group" aria-label="名单办理事项"><button type="button" :aria-pressed="mode==='WITHDRAW'" :disabled="busy" @click="changeMode('WITHDRAW')">办理退课</button><button type="button" :aria-pressed="mode==='REENROLL'" :disabled="busy" @click="changeMode('REENROLL')">重新选课</button></div>
    <TeachingScopePicker v-model="choice" :owner="owner" kind="COURSE" label="待核对课程" :disabled="busy" :refresh="refresh" />
    <button type="button" :disabled="busy || !choice" @click="load">{{ state.loading?'读取中':'读取课程名单' }}</button>
    <p v-if="state.error && !operationResult" role="alert" class="withdrawal-error">{{ state.error }}</p><p v-if="state.notice && !operationResult && ((!student && !reason.trim()) || state.uncertain)" role="status" class="withdrawal-notice">{{ state.notice }}</p>
    <section v-if="state.roster" aria-label="课程名单调整核对">
      <h3>{{ state.roster.target.name }}</h3><p>{{ state.roster.target.semester }} · {{ state.roster.target.teacher }}<br />周{{ state.roster.target.weekday }} {{ state.roster.target.startTime }}—{{ state.roster.target.endTime }} · {{ state.roster.target.room }}<br />{{ state.roster.groupName }} · 有效名单 {{ state.pagination?.activeTotal }} 人 · 名单版本 {{ state.roster.revision }}</p>
      <p v-if="choice!==state.roster.courseId">已选择其他课程，请先读取对应名单；当前原因尚未提交。</p>
      <form @submit.prevent="changePage(0)"><input v-model="search" aria-label="查找名单成员" placeholder="查找姓名或学号" maxlength="100" :disabled="busy || !!reason.trim()" /><button :disabled="busy || !!reason.trim()">查找成员</button></form>
      <ul><li v-for="m in visible" :key="m.studentId"><label><input v-model="student" type="radio" :value="m.studentId" :disabled="busy || state.uncertain || (mode==='REENROLL'?m.active:!m.active) || choice!==state.roster.courseId" /><span>{{ m.name }}<small>{{ m.studentNumber }} · {{ m.college }} · {{ m.active?'在课':'已退课' }}</small></span></label></li></ul>
      <div class="withdrawal-pages"><button type="button" :disabled="busy || !!reason.trim() || !state.pagination?.page" @click="changePage(state.pagination.page-1)">上一页</button><span>{{ state.pagination?.totalPages?state.pagination.page+1:0 }}/{{ state.pagination?.totalPages }} · {{ state.pagination?.total }}人</span><button type="button" :disabled="busy || !!reason.trim() || state.pagination.page+1>=state.pagination.totalPages" @click="changePage(state.pagination.page+1)">下一页</button></div>
      <p v-if="reason.trim()">原因草稿已保留；提交或清空原因后再翻页、查找。</p>
      <label class="withdrawal-reason">核验原因<textarea v-model="reason" rows="2" maxlength="300" :disabled="busy" :placeholder="mode==='REENROLL'?'填写已核对的重新选课依据':'例如：已核对正式退课安排'" /></label>
      <button v-if="mode==='WITHDRAW'" class="withdrawal-action" type="button" :disabled="busy || state.uncertain || !student || !reason.trim() || choice!==state.roster.courseId" @click="withdraw">核对并退课</button>
      <template v-else>
        <button class="enrollment-primary" type="button" :disabled="busy || state.uncertain || !student || !reason.trim() || choice!==state.roster.courseId" @click="prepareReenrollment">{{ state.loading?'正在核对':'核对当前学籍与选课' }}</button>
        <section v-if="state.reenrollmentPreview" class="reenrollment-preview" aria-label="重新选课预览">
          <h4>{{ state.roster.target.name }} · 重新选课</h4><p>{{ state.roster.target.semester }} · {{ state.roster.target.teacher }}<br />周{{ state.roster.target.weekday }} {{ state.roster.target.startTime }}—{{ state.roster.target.endTime }} · {{ state.roster.target.room }}</p><p>{{ state.reenrollmentPreview.person.name }} · {{ state.reenrollmentPreview.person.studentNumber }}<br />在校 · {{ state.reenrollmentPreview.person.college }} · {{ state.reenrollmentPreview.person.className }}</p>
          <p>仅恢复本课程未来未开始且未取消的安排，过去记录保留。核对5分钟内有效；确认后才保存。</p>
          <div class="reenrollment-actions"><button class="enrollment-primary" type="button" :disabled="busy || state.uncertain" @click="saveReenrollment">确认并保存重新选课</button><button type="button" :disabled="busy" @click="resource.invalidateReenrollment">取消本次预览</button></div>
        </section>
      </template>
      <section v-if="operationResult" ref="operationResultElement" class="enrollment-operation-result" tabindex="-1" role="status" aria-label="本次重新选课结果">
        <h4 :class="{'result-confirmed':operationResult.confirmed}">{{ operationResult.confirmed?'重新选课已保存':operationResult.notice?'已保存，最新状态待核对':'重新选课结果待核对' }}</h4>
        <p>{{ operationResult.person }} · {{ operationResult.studentNumber }}<br />{{ operationResult.course }} · {{ operationResult.semester }}<br />{{ operationResult.teacher }} · {{ operationResult.room }}</p>
        <p v-if="operationResult.notice">{{ operationResult.notice }}</p>
        <p v-if="operationResult.error" class="withdrawal-error" role="alert">{{ operationResult.error }}</p>
        <button v-if="operationResult.error" type="button" :disabled="busy" @click="load">重新读取名单核对</button>
      </section>
    </section>
  </details>
</template>
<style scoped>
.withdrawal-notice{color:var(--assistant-success,#216b4c)}
.enrollment-modes{display:flex;gap:8px;flex-wrap:wrap;margin-block:16px}.enrollment-modes button[aria-pressed='true']{background:var(--assistant-soft,#eaf2ff);color:var(--assistant-accent,#0b62db);border-color:transparent}.enrollment-primary{background:var(--assistant-accent,#0b62db);color:#fff;border-color:transparent}.reenrollment-preview{border-top:1px solid var(--assistant-line,#e2e7ec);padding-top:18px;margin-top:24px}.reenrollment-preview h4{font-size:16px;margin:0;font-weight:600}.reenrollment-actions{display:flex;gap:12px;flex-wrap:wrap}
.enrollment-operation-result{scroll-margin-block:88px 24px;border-top:1px solid var(--assistant-line,#e2e7ec);padding-top:18px}.enrollment-operation-result h4{margin:0;font-size:16px;font-weight:600}.enrollment-operation-result .result-confirmed{color:var(--assistant-success,#187248)}.enrollment-operation-result:focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:4px}
.withdrawal-panel{color:var(--assistant-ink,#29323c);border-bottom:1px solid var(--assistant-line,#e2e7ec);padding-block:12px;max-width:760px}summary{font-size:16px;min-height:44px;align-content:center;cursor:pointer}p{font-size:14px;line-height:1.7;color:var(--assistant-muted,#5d6876);margin:12px 0}section{margin-top:24px}h3{font-size:18px;font-weight:600;margin:0}input,textarea,button{font:inherit;font-size:16px;min-height:44px;min-width:0;padding:9px 12px;color:inherit;background:var(--assistant-surface,#fff);border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px}button{cursor:pointer;margin-top:8px}textarea{resize:vertical;width:100%;box-sizing:border-box}section>input{width:100%;box-sizing:border-box}ul{list-style:none;padding:0;margin:12px 0}li label{display:flex;align-items:center;gap:12px;min-height:56px;font-size:16px}li input{width:20px;min-height:20px;height:20px;accent-color:var(--assistant-accent,#2b63cf)}small{display:block;font-size:14px;color:var(--assistant-muted,#5d6876)}.withdrawal-reason{display:grid;gap:8px;font-size:14px;margin-top:16px}.withdrawal-pages{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:14px}.withdrawal-error{color:var(--assistant-danger,#a43e42)}.withdrawal-action{color:var(--assistant-danger,#a43e42);border-color:var(--assistant-danger,#a43e42)}:disabled{opacity:.6;cursor:not-allowed}:focus-visible{outline:2px solid var(--assistant-accent,#2b63cf);outline-offset:3px}
</style>
