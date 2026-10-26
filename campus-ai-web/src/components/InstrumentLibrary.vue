<script setup>
import {computed,reactive,ref,watch} from 'vue'
import {instruments,instrumentGroups,instrumentSources,instrumentNote} from '@/utils/instrumentCatalog'
import NavigationIcon from '@/components/NavigationIcon.vue'
import {useAuthStore} from '@/stores/auth'
import {userSessionGeneration} from '@/api/http'
import {newInstrumentDraft,instrumentAlreadyAccepted,instrumentDraftPending,instrumentRequest,acceptInstrumentRequest} from '@/utils/instrumentDrafts'
const props=defineProps({embedded:Boolean,initial:String,saving:Boolean,saveError:String,saveErrorInstrument:String})
const emit=defineEmits(['append'])
const auth=useAuthStore(),query=ref(''),group=ref(''),selected=ref(props.initial||'oscilloscope'),confirmed=ref(false)
const drafts=reactive(new Map()),draft=computed(()=>drafts.get(selected.value)),alreadyAccepted=computed(()=>draft.value&&instrumentAlreadyAccepted(draft.value))
function ensureDraft(id){if(id&&instruments.some(i=>i.id===id)&&!drafts.has(id))drafts.set(id,newInstrumentDraft())}
ensureDraft(selected.value)
const filtered=computed(()=>instruments.filter(i=>(!group.value||i.group===group.value)&&`${i.name} ${i.purpose} ${i.group}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const current=computed(()=>instruments.find(i=>i.id===selected.value))
const source=computed(()=>current.value?instrumentSources[current.value.source]:null)
const pendingCount=computed(()=>[...drafts.values()].filter(instrumentDraftPending).length),hasPending=computed(()=>pendingCount.value>0)
function markAccepted(note){const item=drafts.get(note.instrumentId);if(!item)return false;const accepted=acceptInstrumentRequest(item,note);if(accepted)confirmed.value=false;return accepted}
function reset(){drafts.clear();ensureDraft(selected.value);confirmed.value=false}
defineExpose({hasPending,pendingCount,markAccepted,reset})
watch(selected,id=>{ensureDraft(id);confirmed.value=false},{flush:'sync'})
watch(filtered,rows=>{if(!rows.some(i=>i.id===selected.value))selected.value=rows[0]?.id||''})
watch(()=>[auth.user?.id,auth.user?.schoolId,userSessionGeneration.value],reset,{flush:'sync'})
function append(){if(!current.value||!draft.value||!confirmed.value||props.saving||alreadyAccepted.value)return;emit('append',{instrumentId:current.value.id,...instrumentRequest(draft.value),title:`${current.value.name} · 实验学习`,text:instrumentNote(current.value,draft.value.model,draft.value.symptom,draft.value.tried)})}
</script>
<template><section class="instrument-library" :class="{'is-embedded':embedded}">
  <header class="instrument-heading"><div><h2>{{embedded?'仪器与调试记录':'仪器资料'}}</h2><p>{{instruments.length}} 类常见仪器 · 原厂资料索引，非本校设备清单</p></div></header>
  <p v-if="pendingCount" class="work-help instrument-draft-status" role="status">{{pendingCount}} 份仪器记录{{embedded?'尚未加入项目材料':'尚未保存'}} · 筛选或切换仪器不会清除，离开页面前请处理</p>
  <div class="instrument-search"><label><span>找仪器</span><input v-model="query" :disabled="saving" type="search" placeholder="示波器、万用表、卡尺…" /></label><label><span>学科类别</span><select v-model="group" :disabled="saving"><option value="">全部类别</option><option v-for="g in instrumentGroups" :key="g">{{g}}</option></select></label></div>
  <div class="instrument-layout">
    <nav class="instrument-directory" aria-label="仪器目录"><p v-if="!filtered.length" class="work-help">没有找到匹配仪器，试试其他名称</p><button v-for="i in filtered" :key="i.id" :disabled="saving" :aria-pressed="selected===i.id" @click="selected=i.id"><NavigationIcon name="instruments" /><span><strong>{{i.name}}</strong><small>{{i.group}}</small></span></button></nav>
    <article v-if="current" :key="current.id" class="instrument-detail">
      <div class="instrument-title"><h3>{{current.name}}</h3><span>{{current.risk}}</span></div><p class="instrument-purpose">{{current.purpose}}</p>
      <section><h4>如何使用这份资料</h4><ol><li>核对设备铭牌、配件型号及课程指导书</li><li>阅读下方原厂资料的适用范围；不同型号不要照搬参数</li><li>在教师允许的实验条件下操作，保留原始读数与设置</li></ol></section>
      <section><h4>记录这些信息</h4><p>{{current.readings}}</p><h4>出现异常时先核对</h4><p>{{current.check}}</p></section>
      <aside class="instrument-source"><strong>原厂资料</strong><a :href="source.url" target="_blank" rel="noopener noreferrer">{{source.title}} <span aria-hidden="true">↗</span></a><p>{{source.scope}}</p><small>链接核验 {{current.checkedAt}} · 外部页面可能要求注册，站内没有复制完整手册</small></aside>
      <details class="instrument-record" open><summary>把本次情况留到项目里</summary><div class="work-form"><label>实际设备型号<input v-model="draft.model" :disabled="saving" maxlength="100" placeholder="按设备铭牌填写，不知道可以先留空" /></label><label>当前现象<textarea v-model="draft.symptom" :disabled="saving" maxlength="1500" rows="3" placeholder="例如：读数持续漂移；记录数值、单位与环境，不含个人信息"></textarea></label><label>已经尝试过什么<textarea v-model="draft.tried" :disabled="saving" maxlength="1000" rows="2" placeholder="只写实际做过的，不补造实验过程"></textarea></label><label class="instrument-consent"><input v-model="confirmed" :disabled="saving||alreadyAccepted" type="checkbox" />我知道这是学习记录，具体操作需匹配手册及教师确认</label><button class="work-button primary" :disabled="!confirmed||saving||alreadyAccepted" @click="append">{{saving?'正在保存…':alreadyAccepted?(embedded?'此记录已加入材料草稿':'此记录已保存'):embedded?'加入当前项目材料':'保存为私有项目'}}</button><p v-if="saving" class="instrument-save-progress" role="status">正在保存私有项目，请稍候</p><p v-if="saveError && selected === saveErrorInstrument" class="work-error" role="alert">{{saveError}}</p></div></details>
      <p class="work-help">设备冒烟、异味、异常振动或安全防护失效时，不按聊天建议继续试错；停止操作并联系实验教师。未知型号不提供猜测的接线、量程或运行参数。</p>
    </article>
  </div>
</section></template>
<style scoped>
.instrument-save-progress{margin:12px 0 0;font-size:14px;line-height:1.7;color:var(--assistant-muted,#5d6876)}
.instrument-library{color:#283344}.instrument-heading h2{font-size:28px;letter-spacing:-.03em;margin:0 0 10px}.instrument-heading p{color:#596454;font-size:15px;line-height:1.7}.instrument-search{display:grid;grid-template-columns:1fr 220px;gap:16px;margin:26px 0}.instrument-search label{display:grid;gap:8px;font-size:14px;color:#536047}.instrument-search input,.instrument-search select{width:100%;min-width:0;border:1px solid #d5dacd;border-radius:14px;background:#fffefa;padding:12px;font:inherit;font-size:16px;color:#283344}.instrument-layout{display:grid;grid-template-columns:245px minmax(0,1fr);gap:30px;align-items:start}.instrument-directory{display:grid;gap:5px;max-height:660px;overflow-y:auto;scrollbar-width:thin;padding:2px 8px 2px 2px}.instrument-directory button{display:flex;align-items:center;text-align:left;gap:12px;padding:12px;border:1px solid transparent;border-radius:16px;background:transparent;color:#48573c;cursor:pointer;min-width:0;font:inherit}.instrument-directory button[aria-pressed=true]{background:#e6ebfa;border-color:#d0d8ef;color:#3341c5}.instrument-directory button:hover{background:#eef1e8}.instrument-directory svg{width:22px;height:22px;flex-shrink:0}.instrument-directory strong{display:block;font-size:15px;font-weight:600}.instrument-directory small{display:block;margin-top:5px;font-size:13px;color:#607050}.instrument-title{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.instrument-title h3{font-size:25px;margin:0}.instrument-title>span{font-size:12px;padding:6px 10px;background:#f0ebdf;color:#715c31;border-radius:999px}.instrument-purpose{font-size:17px;line-height:1.8;color:#48573c}.instrument-detail section{padding:14px 0;border-bottom:1px solid #dce1d4}.instrument-detail h4{font-size:16px;margin:12px 0}.instrument-detail p,.instrument-detail li{line-height:1.8;overflow-wrap:anywhere}.instrument-detail ol{padding-left:22px;font-size:15px}.instrument-source{margin:24px 0;padding:20px;border:1px solid #dce1d4;border-radius:20px;background:#edf1e7}.instrument-source strong,.instrument-source a{display:block}.instrument-source a{color:#3344c5;margin:10px 0;line-height:1.6;text-underline-offset:4px}.instrument-source p{font-size:14px;margin:8px 0}.instrument-source small{color:#58664b;font-size:13px}.instrument-record summary{font-weight:600;cursor:pointer;padding:12px 0}.instrument-record .work-form{padding:20px;margin-top:10px}.instrument-consent{display:flex!important;align-items:flex-start;font-weight:400!important;line-height:1.6}.instrument-consent input{width:18px;height:18px;flex:none;margin-top:3px}.is-embedded .instrument-layout{grid-template-columns:190px minmax(0,1fr);gap:20px}.instrument-library :focus-visible{outline:2px solid #3544dc;outline-offset:3px}@media(max-width:1050px){.is-embedded .instrument-layout{display:block}.is-embedded .instrument-directory{display:flex;max-height:none;overflow-x:auto;margin-bottom:22px}.is-embedded .instrument-directory button{min-width:175px}}@media(max-width:760px){.instrument-heading h2{font-size:25px}.instrument-search{grid-template-columns:1fr}.instrument-layout{display:block}.instrument-directory{display:flex;overflow-x:auto;max-height:none;margin-bottom:24px;padding-bottom:8px}.instrument-directory button{flex:0 0 175px}.instrument-title h3{font-size:23px}}
</style>
