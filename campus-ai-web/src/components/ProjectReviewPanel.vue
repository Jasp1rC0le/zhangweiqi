<script setup>
import {onMounted,ref,watch} from 'vue'
import http from '@/api/http'
const props=defineProps({project:{type:Object,required:true},dirty:Boolean})
const entries=ref([]),recipient=ref(''),includeMaterial=ref(false),includeData=ref(false),confirmed=ref(false),busy=ref(false),error=ref(''),status=ref('')
let requestId=crypto.randomUUID()
function resetConsent(){confirmed.value=false;requestId=crypto.randomUUID()}
watch(()=>props.project.revision,resetConsent)
watch([recipient,includeMaterial,includeData],resetConsent)
const endpoint=()=>`/api/projects/${props.project.id}/reviews`
const fail=e=>{error.value=e.response?.status===404?'审阅服务尚未加载，请在原配置环境重启后端后重试':e.response?.data?.message||e.response?.data?.detail||'操作未确认成功，请刷新列表后重试'}
async function load(){error.value='';try{entries.value=(await http.get(endpoint())).data}catch(e){fail(e)}}
async function invite(){
  if(busy.value||props.dirty||!confirmed.value)return
  busy.value=true;error.value='';status.value=''
  try{await http.post(endpoint(),{requestId,revision:props.project.revision,recipient:recipient.value.trim(),includeMaterial:includeMaterial.value,includeData:includeData.value});requestId=crypto.randomUUID();confirmed.value=false;status.value='已发送站内审阅，可让对方在“收到的审阅”查看';await load()}catch(e){fail(e)}finally{busy.value=false}
}
async function revoke(entry){
  if(!window.confirm('撤销后对方不能再打开，此邀请保存的快照与意见会清除；已被对方复制的内容无法收回。确认撤销？'))return
  busy.value=true;error.value=''
  try{await http.delete(`${endpoint()}/${entry.id}`);status.value='已撤销并清除邀请中的快照与意见';await load()}catch(e){fail(e)}finally{busy.value=false}
}
onMounted(load)
</script>
<template>
  <section class="project-review-panel">
    <div class="section-heading"><div><h2>请一个人，帮你看一遍</h2><p>发送已保存的 v{{ project.revision }} 快照，不包含后续修改；只有指定同校账号可读，7天后到期</p></div><RouterLink to="/reviews">收到的审阅</RouterLink></div>
    <p v-if="error" class="studio-error" role="alert">{{ error }}<button :disabled="busy" @click="load">重试加载</button></p><p v-if="status" role="status">{{ status }}</p>
    <p v-if="dirty" class="studio-warning">先保存当前项目，再发起审阅，避免对方看到旧内容</p>
    <form @submit.prevent="invite"><fieldset :disabled="busy||dirty">
      <label class="text-label">对方的登录账号<input v-model="recipient" required maxlength="50" autocomplete="off" placeholder="填写对方已注册的账号，不是昵称或邮箱" @input="confirmed=false" /></label>
      <p class="data-help">默认仅分享项目名称、任务要求与清单。个人备注、复核理由和历史版本始终不分享。</p>
      <label class="archive-filter"><input v-model="includeMaterial" type="checkbox" @change="confirmed=false" />同时分享材料正文与证据片段</label>
      <label class="archive-filter"><input v-model="includeData" type="checkbox" @change="confirmed=false" />同时分享数据表、来源和计算设置</label>
      <label class="archive-filter"><input v-model="confirmed" type="checkbox" required />我已核对账号与分享范围，确认这些内容可提供给对方</label>
      <button class="primary" :disabled="!confirmed||!recipient.trim()">{{ busy?'处理中…':'发送只读审阅' }}</button>
    </fieldset></form>
    <h3>已发出的审阅</h3><p v-if="!entries.length" class="inline-empty">还没有审阅邀请。对方无需 Pro，也不会获得项目编辑权限。</p>
    <ul class="review-outgoing"><li v-for="entry in entries" :key="entry.id"><strong>{{ entry.recipient }} · v{{ entry.revision }}</strong><p>{{ entry.revoked?'已撤销':entry.expired?'已到期':`到期：${new Date(entry.expiresAt).toLocaleString('zh-CN')}` }}</p><p v-if="entry.reviewNote" class="review-note">{{ entry.reviewNote }}</p><span v-else>暂无审阅意见</span><button v-if="!entry.revoked" :disabled="busy" @click="revoke(entry)">撤销并清除</button></li></ul>
    <p class="studio-boundary">免费审阅，不是公开发布或实时协同编辑。撤销可阻止后续访问，但无法收回对方已阅读或复制的内容。</p>
  </section>
</template>
<style scoped>
fieldset .archive-filter{margin:0;min-height:44px;font-size:14px;line-height:1.6}
fieldset{border:0;padding:0;margin:0;display:grid;gap:16px}form button{justify-self:start}.review-outgoing{padding:0;list-style:none}.review-outgoing li{padding:20px 0;border-bottom:1px solid #d9ddce;display:grid;gap:10px;overflow-wrap:anywhere}.review-outgoing p{margin:0;font-size:14px}.review-note{white-space:pre-wrap}.review-outgoing button{justify-self:start}.review-outgoing span{color:#66705e;font-size:14px}
</style>
