<script setup>
import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import { readTeachingAudit } from '@/api/teaching'
import { ATTENDANCE_STATUSES } from '@/utils/teaching'
import { auditDate, auditPageCsv, createAuditReader } from '@/utils/teachingAudit'
const props=defineProps({owner:{type:String,required:true},lessonId:{type:String,required:true},view:{type:String,required:true},revision:{type:Number,required:true}})
const state=reactive({data:null,loading:false,error:''}),scope=computed(()=>`${props.owner}:${props.lessonId}:${props.view}:${props.revision}`)
let opened=false,disposed=false
const reader=createAuditReader({scope:()=>props.owner && !disposed?scope.value:'',state,read:readTeachingAudit})
function load(page=0){return reader.load(props.lessonId,props.view,page)}
function toggle(event){opened=event.target.open;if(opened && !state.data && !state.loading)load()}
watch(scope,()=>{reader.reset();if(opened)load()},{flush:'sync'})
onBeforeUnmount(()=>{disposed=true;reader.dispose()})
function download(){
  if(!props.owner || disposed || !state.data || state.loading || state.error)return
  const blob=new Blob([auditPageCsv(state.data)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a')
  link.href=url;link.download=`考勤更正记录-第${state.data.page+1}页.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
</script>
<template>
  <details class="teaching-audit" @toggle="toggle">
    <summary>查看更正记录与导出</summary>
    <p class="audit-policy">任课教师直接更正，须写原因并保留旧值。保存期一年；到期仅标记待归档，本入口不会删除历史。</p>
    <p v-if="state.loading" role="status">正在读取更正记录…</p>
    <p v-if="state.error" role="alert">{{ state.error }} <button type="button" :disabled="state.loading" @click="load()">重新读取</button></p>
    <template v-if="state.data && !state.error">
      <p v-if="state.data.expiredWithinScope" class="audit-policy">本课程可见范围内 {{ state.data.expiredWithinScope }} 条已到期，待归档核验；尚未自动清理。</p>
      <p v-if="!state.data.total">暂无更正或点名变更记录。</p>
      <ol class="audit-records">
        <li v-for="row in state.data.items" :key="row.id">
          <strong>{{ row.studentName }} <span>{{ row.studentNumber }}</span></strong>
          <p>{{ ATTENDANCE_STATUSES[row.oldStatus] }} → {{ ATTENDANCE_STATUSES[row.newStatus] }}</p>
          <p>{{ row.reason || '首次记录' }}</p>
          <small>{{ row.actorName }} · {{ auditDate(row.recordedAt,true) }} · {{ row.expired ? '待归档核验' : `保留至${auditDate(row.expiresAt)}` }}</small>
        </li>
      </ol>
      <nav v-if="state.data.total" aria-label="更正记录分页">
        <span>第{{ state.data.page+1 }} / {{ state.data.totalPages }}页 · 共{{ state.data.total }}条</span>
        <button type="button" :disabled="state.loading || !state.data.page" @click="load(state.data.page-1)">上一页记录</button>
        <button type="button" :disabled="state.loading || state.data.page+1>=state.data.totalPages" @click="load(state.data.page+1)">下一页记录</button>
        <button type="button" :disabled="state.loading || !state.data.items.length" @click="download">导出本页</button>
      </nav>
    </template>
  </details>
</template>
<style scoped>
.teaching-audit {margin-top:28px;padding-top:20px;border-top:1px solid var(--assistant-line,#e2e7ec);font-size:16px;line-height:1.7;min-width:0}
summary {cursor:pointer;min-height:44px;align-content:center;color:var(--assistant-accent,#2b63cf)}
.audit-policy,small,strong span {font-size:14px;color:var(--assistant-muted,#5d6876)}
.audit-records {list-style:none;padding:0;margin:16px 0}
.audit-records li {padding:16px 0;border-bottom:1px solid var(--assistant-line,#e2e7ec);overflow-wrap:anywhere}
.audit-records strong {font-weight:600}.audit-records p {margin:5px 0}
nav {display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px}
button {min-height:44px;padding:8px 12px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:10px;background:transparent;color:var(--assistant-ink,#29323c);font:inherit;cursor:pointer}
button:disabled {opacity:.5;cursor:default}button:focus-visible,summary:focus-visible {outline:2px solid var(--assistant-accent,#2b63cf);outline-offset:3px}
</style>
