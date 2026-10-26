<script setup>
import { computed,onBeforeUnmount,onMounted,reactive,ref,watch } from 'vue'
import { readLessonChangeNotices,markLessonChangeNoticeRead } from '@/api/teaching'
import { createChangeNoticeResource,CHANGE_NOTICE_ACTIONS } from '@/utils/lessonChangeNotices'
import { auditDate } from '@/utils/teachingAudit'
const props=defineProps({owner:{type:String,required:true},active:{type:Boolean,default:true},disabled:Boolean})
const emit=defineEmits(['open','new-change'])
const state=reactive({data:null,enabled:null,busy:false,error:'',notice:''}),opened=ref(false),manualOpen=ref(false),unreadOnly=ref(true)
let disposed=false
const owner=()=>!disposed&&props.active?props.owner:''
const resource=createChangeNoticeResource({owner,state,read:readLessonChangeNotices,mark:markLessonChangeNoticeRead,onNew:value=>emit('new-change',value)})
const busy=computed(()=>state.busy||props.disabled)
async function refresh(page=state.data?.page||0){if(!owner()||busy.value)return false;const ok=await resource.load({page,size:25,unreadOnly:unreadOnly.value});if(ok&&state.data?.total&&!manualOpen.value)opened.value=true;return ok}
async function filter(value){if(busy.value)return;unreadOnly.value=value;await refresh(0)}
async function read(notice){if(busy.value)return;await resource.mark(notice)}
function toggle(event){opened.value=event.target.open}
watch(()=>[props.owner,props.active],()=>{resource.reset();opened.value=false;manualOpen.value=false;unreadOnly.value=true;if(owner())refresh(0)},{flush:'sync'})
watch(()=>props.disabled,value=>{if(!value&&owner()&&!state.data&&!state.error&&!state.busy)refresh(0)})
onMounted(()=>refresh(0))
onBeforeUnmount(()=>{disposed=true;resource.dispose()})
defineExpose({refresh:()=>refresh()})
</script>
<template>
  <details v-if="active && state.enabled!==false" class="change-inbox" :open="opened" @toggle="toggle">
    <summary @click="manualOpen=true"><strong>课程变更</strong><span>{{state.busy?'正在核对':state.data?.total?`${state.data.total}条${unreadOnly?'未读':''}`:state.data?'暂无未读':''}}</span></summary>
    <div v-if="opened" class="inbox-body">
      <p class="hint">最近31天的调课、代课与取消；只显示当前有权查看的安排。这是站内通知，不是微信或离线推送。</p>
      <div class="inbox-tools" aria-label="课程变更通知筛选"><button type="button" :aria-pressed="unreadOnly" :disabled="busy" @click="filter(true)">未读</button><button type="button" :aria-pressed="!unreadOnly" :disabled="busy" @click="filter(false)">全部</button><button type="button" :disabled="busy" @click="refresh(0)">刷新通知</button></div>
      <p v-if="state.busy" role="status" class="hint">正在核对本人收件范围…</p>
      <p v-if="state.notice" role="status" class="success">{{state.notice}}</p>
      <p v-if="state.error" role="alert" class="failure">{{state.error}} <button type="button" :disabled="busy" @click="refresh(0)">重新读取</button></p>
      <template v-if="!state.busy && state.data">
        <p v-if="!state.data.total" class="hint">{{unreadOnly?'没有未读的课程变更。已读记录可切到“全部”查看。':'最近31天没有当前可查看的课程变更。'}}课前1小时/5分钟提醒另行保留。</p>
        <ul v-else class="change-rows">
          <li v-for="notice in state.data.items" :key="notice.id">
            <div class="row-title"><h3>{{notice.course}}</h3><span class="change-type" :data-action="notice.action">{{CHANGE_NOTICE_ACTIONS[notice.action]}}</span></div>
            <template v-if="notice.action==='RESCHEDULE' && !notice.outdated"><p class="arrangement">{{notice.proposed.date}} {{notice.proposed.startTime}}—{{notice.proposed.endTime}}<br />{{notice.proposed.room}} · {{notice.proposed.teacher}}</p><details><summary>查看原安排</summary><p>{{notice.original.date}} {{notice.original.startTime}}—{{notice.original.endTime}}<br />{{notice.original.room}} · {{notice.original.teacher}}</p></details></template>
            <template v-else><p class="arrangement">原安排：{{notice.original.date}} {{notice.original.startTime}}—{{notice.original.endTime}}<br />{{notice.original.room}} · {{notice.original.teacher}}</p><p v-if="notice.outdated" class="warning">这项安排已有后续调整或取消，请刷新课表核对，不按旧时间上课。</p><p v-else-if="notice.action==='RELEASED'" class="hint">这里只核对你原来的任课安排，不代表获得替代课程的名单或点名权限。</p><p v-else class="warning">只取消这一节，其他周次不变。</p></template>
            <p class="hint">{{auditDate(notice.changedAt,true)}} 更新<span v-if="notice.readAt"> · 已读</span></p>
            <div class="row-actions"><button v-if="notice.targetLessonId && !notice.outdated" type="button" class="primary" :disabled="busy" @click="emit('open',notice)">查看这节课</button><button v-if="!notice.readAt" type="button" :disabled="busy" @click="read(notice)">知道了</button></div>
          </li>
        </ul>
        <nav v-if="state.data.totalPages>1" class="inbox-pages" aria-label="课程变更通知分页"><span>共{{state.data.total}}条 · 第{{state.data.page+1}}/{{state.data.totalPages}}页</span><button type="button" :disabled="busy||state.data.page===0" @click="refresh(state.data.page-1)">上一页通知</button><button type="button" :disabled="busy||state.data.page+1>=state.data.totalPages" @click="refresh(state.data.page+1)">下一页通知</button></nav>
      </template>
    </div>
  </details>
</template>
<style scoped>
.change-inbox{margin-block:20px;max-width:800px;color:var(--assistant-ink,#29323c);font-size:16px;line-height:1.7;border-block:1px solid var(--assistant-line,#e2e7ec);min-width:0}.change-inbox summary{cursor:pointer;min-height:44px;align-content:center}.change-inbox>summary{padding-block:10px}.change-inbox>summary>strong{font-size:18px;font-weight:600}.change-inbox>summary>span{margin-inline-start:12px;font-size:14px;color:var(--assistant-warning,#9a5400)}.inbox-body{padding-bottom:16px}p{margin:10px 0;overflow-wrap:anywhere}.hint{font-size:14px;color:var(--assistant-muted,#5d6876)}.inbox-tools,.row-actions,.inbox-pages{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-block:14px}button{font:inherit;font-size:16px;min-height:44px;min-width:0;max-width:100%;padding:10px 14px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;background:var(--assistant-surface,#fff);color:inherit;cursor:pointer;transition:background-color 180ms ease-out}button:hover:not(:disabled){background:var(--assistant-hover,#e8edf2)}button[aria-pressed=true]{background:var(--assistant-soft,#eaf2ff);border-color:var(--assistant-accent,#0b62db);color:var(--assistant-accent,#0b62db)}button.primary{background:var(--assistant-accent,#0b62db);color:#fff;border-color:transparent}button.primary:hover:not(:disabled){background:var(--assistant-accent-hover,#084db0)}button:disabled{opacity:.6;cursor:default}:focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}::selection{background:var(--assistant-soft,#eaf2ff)}.change-rows{list-style:none;margin:0;padding:0}.change-rows>li{padding-block:18px;border-bottom:1px solid var(--assistant-line,#e2e7ec)}.change-rows>li:last-child{border-bottom:0}.row-title{display:flex;align-items:baseline;gap:12px;justify-content:space-between;flex-wrap:wrap}.row-title h3{font:inherit;font-size:18px;font-weight:600;margin:0;overflow-wrap:anywhere}.change-type{font-size:14px;color:var(--assistant-accent,#0b62db)}.change-type[data-action=CANCEL],.change-type[data-action=RELEASED],.warning{color:var(--assistant-warning,#9a5400)}.arrangement{font-weight:500;font-variant-numeric:tabular-nums}.failure{color:var(--assistant-danger,#bf303d)}.success{color:var(--assistant-success,#187248)}.inbox-pages{font-size:14px;font-variant-numeric:tabular-nums}@media(max-width:600px){.row-actions>button{flex:1 1 130px}.inbox-pages>span{flex:1 1 100%}.inbox-pages>button{flex:1 1 0}}@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
