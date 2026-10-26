<script setup>
import {ref,onMounted,watch,onBeforeUnmount} from 'vue'
import {useRoute,useRouter,onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import http from '@/api/http'
import CampMark from '@/components/CampMark.vue'
import {ArrowRight} from '@element-plus/icons-vue'
import {calculationSettingsText} from '@/utils/columnCalculation'
import {useAuthStore} from '@/stores/auth'
import FormDraftRecovery from '@/components/FormDraftRecovery.vue'
import {reviewFormRecovery} from '@/utils/formDraftRecovery'
import {useFormDraftRecovery} from '@/utils/useFormDraftRecovery'
import {reviewRecoveryConflict} from '@/utils/formDraftSchemas'
import '@/styles/project-studio.css'
const route=useRoute(),entries=ref([]),detail=ref(null),note=ref(''),savedNote=ref(''),loading=ref(false),saving=ref(false),error=ref(''),status=ref('')
const errorSource=ref('load')
const auth=useAuthStore(),router=useRouter(),restoring=ref(false),conflict=ref(false)
let sequence=0, disposed=false,recoveryNavigation=false
const drafts=useFormDraftRecovery(reviewFormRecovery,()=>detail.value?.canReview && note.value!==savedNote.value
  ? [{id:detail.value.entry.id,revision:detail.value.entry.revision,note:note.value,baseNote:savedNote.value}] : [])
const {state:draftState,pending:draftPending,notice:draftNotice}=drafts
const mayLeave=()=>note.value===savedNote.value||window.confirm('审阅意见尚未发送，离开会丢失本页修改。继续？')
onBeforeRouteLeave(()=>!saving.value&&!restoring.value&&mayLeave());onBeforeRouteUpdate(()=>recoveryNavigation||(!saving.value&&!restoring.value&&mayLeave()))
const beforeUnload=e=>{if(saving.value||restoring.value||(note.value!==savedNote.value&&!drafts.hasCurrent())){e.preventDefault();e.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onBeforeUnmount(()=>{disposed=true;sequence++;window.removeEventListener('beforeunload',beforeUnload)})
async function load(){
  if(saving.value||restoring.value)return
  const request=++sequence;loading.value=true;error.value='';errorSource.value='load';status.value='';conflict.value=false;detail.value=null;note.value='';savedNote.value=''
  try{
    const {data}=await http.get(route.params.id?`/api/project-reviews/${route.params.id}`:'/api/project-reviews')
    if(request!==sequence||disposed)return
    if(route.params.id){detail.value=data;note.value=data.entry.reviewNote||'';savedNote.value=note.value}else entries.value=data
  }catch(e){if(request===sequence&&!disposed)error.value=e.response?.data?.message||e.response?.data?.detail||'暂时无法读取审阅，请重试；若仍无法打开，请联系邀请人核实权限和有效期'}finally{if(request===sequence&&!disposed)loading.value=false}
}
async function restoreDraft(){
  if(saving.value||loading.value||restoring.value)return
  if(note.value!==savedNote.value){draftNotice.value='当前有未发送意见，请先自行保留或清空；恢复不会覆盖你的输入';return}
  const entry=drafts.peek();if(!entry)return
  const request=++sequence;restoring.value=true
  try{
    const {data}=await http.get(`/api/project-reviews/${entry.id}`)
    if(disposed||request!==sequence)return
    if(reviewRecoveryConflict(entry,data)){
      draftNotice.value='邀请或已发送意见发生变化，未自动恢复。可展开暂存原文自行保留，再打开最新审阅核对';return
    }
    recoveryNavigation=true
    try{await router.push(`/reviews/${entry.id}`)}finally{recoveryNavigation=false}
    if(disposed||request!==sequence)return
    detail.value=data;savedNote.value=entry.baseNote;note.value=entry.note
    error.value='';conflict.value=false;drafts.restored()
  }catch(e){if(!disposed)draftNotice.value=e.response?.data?.message||'无法核验邀请，草稿仍保留；未读取或恢复共享材料'}
  finally{if(!disposed)restoring.value=false}
}
async function save(){
  if(saving.value||loading.value||restoring.value||!detail.value?.canReview||!note.value.trim()||note.value===savedNote.value)return
  errorSource.value='save'
  if(!(detail.value.noteConcurrencyVersion>=1)){error.value='服务端尚未支持审阅冲突检查，请更新服务后重试；意见未发送';return}
  const submittedNote=note.value.trim()
  saving.value=true;error.value='';status.value='';conflict.value=false
  try{
    await http.put(`/api/project-reviews/${detail.value.entry.id}`,{note:submittedNote,baseNote:savedNote.value})
    if(disposed)return
    savedNote.value=submittedNote;note.value=submittedNote;drafts.save()
    status.value='审阅意见已发送给项目所有者，不会修改原项目'
  }catch(e){if(!disposed){conflict.value=e.response?.status===409;error.value=e.response?.data?.message||'未能确认发送成功，你的意见仍在本页，请稍后重试'}}finally{if(!disposed)saving.value=false}
}
watch(note,()=>{status.value='';if(!loading.value&&!restoring.value&&!saving.value)drafts.save()},{flush:'sync'})
watch(()=>route.params.id,()=>{if(!recoveryNavigation)load()});onMounted(load)
</script>
<template>
  <main class="project-studio review-page">
    <header class="studio-header"><RouterLink to="/projects" class="studio-brand"><CampMark /><span>Campthink.</span></RouterLink><RouterLink to="/projects">返回我的项目</RouterLink></header>
    <article class="review-content">
      <h1>{{ detail?detail.entry.title:'收到的审阅' }}</h1><p v-if="loading" role="status">正在核验审阅权限</p><p v-if="error && errorSource==='load'" class="studio-error" role="alert">{{ error }}<button :disabled="saving || loading" @click="mayLeave() && load()">重新加载</button></p><p v-if="status" role="status">{{ status }}</p>
      <FormDraftRecovery :state="draftState" :pending="Boolean(draftPending)" :busy="saving||loading||restoring" :enabled-allowed="Boolean(auth.user?.id)"
        scope="审阅意见" :notice="draftNotice" storage-description="保留最近一份本人审阅意见、原意见及邀请版本编号，不保留对方的项目材料、数据或共享权限"
        @toggle="drafts.toggle" @restore="restoreDraft" @discard="drafts.discard">
        <template #pending-detail><details v-if="draftPending"><summary>查看暂存原文</summary><pre>{{draftPending.note}}</pre><RouterLink :to="`/reviews/${draftPending.id}`">打开最新审阅</RouterLink></details></template>
      </FormDraftRecovery>
      <template v-if="detail">
        <p>来自 {{ detail.entry.owner }} · 已保存 v{{ detail.entry.revision }} · 只读快照 · 到期 {{ new Date(detail.entry.expiresAt).toLocaleString('zh-CN') }}</p>
        <h2>任务要求</h2><pre>{{ detail.content.brief||'未提供' }}</pre>
        <h2>待审阅清单</h2><ol><li v-for="item in detail.content.requirements" :key="item.id"><strong>{{ item.title }}</strong><p v-if="item.sourceQuote">要求原文：{{ item.sourceQuote }}</p><p v-if="item.evidence">材料证据：{{ item.evidence }}</p></li></ol>
        <template v-if="detail.entry.includesMaterial"><h2>材料正文</h2><pre>{{ detail.content.manuscript||'未提供' }}</pre></template><p v-else class="data-help">所有者未分享材料正文和证据</p>
        <template v-if="detail.entry.includesData&&detail.content.dataSheet"><h2>数据表</h2><p>{{ detail.content.dataSheet.source }}</p><pre>{{ detail.content.dataSheet.csv }}</pre><h2>公式设置（本人填写，未在审阅页重算）</h2><pre>{{ calculationSettingsText(detail.content.dataSheet.calculation) }}</pre></template>
        <form v-if="detail.canReview" :aria-busy="saving" @submit.prevent="save"><h2>你的审阅意见</h2><label class="text-label" for="review-note">指出具体位置、依据和修改建议</label><textarea id="review-note" v-model="note" :disabled="saving||restoring" maxlength="2000" rows="6" required placeholder="例如：第2项缺少样本来源，请补充实际采集范围；不要替对方编造数据"></textarea><p v-if="error && errorSource==='save'" class="studio-error" role="alert">{{ error }}</p><p v-if="conflict" class="data-help">请先复制保留当前意见，再重新加载核对，不会强行覆盖其他页面的更新 <button type="button" @click="mayLeave() && load()">重新加载最新意见</button></p><p class="data-help">{{ note.length }}/2000字 · 只发给项目所有者，再次发送会更新此前意见</p><p v-if="note!==savedNote && !saving" class="data-help">有尚未发送的修改</p><button class="primary" :disabled="saving||restoring||conflict||!note.trim()||note===savedNote">{{ saving?'发送中…':'发送审阅意见' }}</button></form>
        <RouterLink to="/reviews">返回审阅列表</RouterLink>
      </template>
      <template v-else-if="!loading&&!error&&!route.params.id"><p>仅显示别人定向发给你的有效邀请；不会自动公开你的资料</p><ul class="received-reviews"><li v-for="entry in entries" :key="entry.id"><RouterLink :to="`/reviews/${entry.id}`"><strong>{{ entry.title }}</strong><span>来自 {{ entry.owner }} · v{{ entry.revision }} · {{ entry.reviewNote?'已反馈':'待审阅' }}</span><span class="review-entry-action">打开审阅<ArrowRight aria-hidden="true" /></span></RouterLink></li></ul><p v-if="!entries.length">暂时没有邀请。让同校伙伴在项目的“协作审阅”中填写你的登录账号。</p></template>
    </article>
  </main>
</template>
<style scoped>
.review-content{max-width:900px;margin:auto;padding:40px 24px 80px}.review-content h1{font-size:32px}.review-content h2{margin-top:36px;font-size:22px}.review-content pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:15px;line-height:1.75;background:#f0f2e9;padding:20px;border-radius:20px}.review-content li{padding:12px 0;overflow-wrap:anywhere}.review-content p{line-height:1.7}.review-content form{margin:36px 0}.received-reviews{padding:0;list-style:none}.received-reviews a{display:grid;gap:8px;padding:20px;border:1px solid #d6ddcc;border-radius:20px;color:inherit;text-decoration:none}.received-reviews span{font-size:14px;color:#59664e}
</style>
