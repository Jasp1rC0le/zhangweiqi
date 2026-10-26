<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import NavigationIcon from '@/components/NavigationIcon.vue'
import FormDraftRecovery from '@/components/FormDraftRecovery.vue'
import { wallFormRecovery } from '@/utils/formDraftRecovery.js'
import { useFormDraftRecovery } from '@/utils/useFormDraftRecovery.js'
import * as api from '@/api/wall'
const route=useRoute(), router=useRouter()
const categories=[{id:'',name:'全部'},{id:'course',name:'专业课'},{id:'experiment',name:'实验求助'},{id:'campus',name:'校园生活'},{id:'team',name:'组队交流'}]
const category=ref(''), mine=ref(false), entries=ref([]), more=ref(false), offset=ref(0)
const loading=ref(false), busy=ref(false), error=ref(''), status=ref(''), composing=ref(false)
const appending=ref(false)
const detail=ref(null), comments=ref([]), commentMore=ref(false), commentOffset=ref(0)
const reply=ref(''), replyId=ref(crypto.randomUUID()), reporting=ref(null), reason=ref('内容不实')
const replyPostId=ref(route.query.post ? String(route.query.post) : null)
const form=reactive({id:crypto.randomUUID(),category:'course',title:'',body:''})
const dirty=computed(()=>Boolean(form.title.trim()||form.body.trim()||reply.value.trim()))
const recovery=useFormDraftRecovery(wallFormRecovery,()=>dirty.value ? [{
  post:form.title.trim()||form.body.trim() ? {...form} : null,
  reply:reply.value.trim()&&replyPostId.value ? {id:replyId.value,postId:replyPostId.value,body:reply.value} : null,
}] : [])
const {state:recoveryState,pending:pendingDraft,notice:recoveryNotice}=recovery
watch([form,reply],()=>recovery.save(),{deep:true})
let sequence=0, disposed=false, internalNavigation=false
watch(reporting,async id=>{if(id){await nextTick();document.querySelector('.wall-report')?.scrollIntoView({block:'center',behavior:'auto'})}})
onBeforeRouteUpdate((to,from)=>{
  if(to.query.post===from.query.post)return true
  if(busy.value&&!internalNavigation)return false
  if(reply.value.trim()&&!window.confirm(recoveryState.value.enabled?'回复尚未提交。切换后可从30分钟临时副本中恢复，继续？':'回复还没有提交，切换主题会清除这段回复。继续？'))return false
  if(reply.value.trim()&&recoveryState.value.enabled)pendingDraft.value=wallFormRecovery.recovery.snapshot()?.entries[0]??null
  reply.value='';replyId.value=crypto.randomUUID();reporting.value=null
  replyPostId.value=to.query.post ? String(to.query.post) : null
  return true
})
const categoryName=id=>categories.find(c=>c.id===id)?.name||'交流'
const stateName=s=>({PENDING:'审核中 · 仅自己可见',PUBLISHED:'已公开',REJECTED:'未通过审核',HIDDEN:'已隐藏'})[s]
const stamp=t=>new Date(t).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
function fail(e){error.value=e.response?.status===409?'提交状态已改变，请先在“我的发布”核对结果；本页草稿仍保留，不要连续重复提交':e.response?.status===404?'校园墙服务尚未加载，或该内容已经撤回。请刷新列表；本页草稿没有丢失':e.response?.data?.detail||e.response?.data?.message||'暂时无法连接校园墙，请稍后重试'}
async function load(append=false){
  if((busy.value&&!internalNavigation)||route.query.post||(append&&loading.value))return
  const seq=++sequence;loading.value=true;appending.value=append;error.value=''
  try{const page=await api.listWall({category:category.value,mine:mine.value,offset:append?offset.value:0});if(seq!==sequence||disposed)return;entries.value=append?[...entries.value,...page.items]:page.items;more.value=page.more;offset.value=page.nextOffset}
  catch(e){if(seq===sequence&&!disposed)fail(e)}finally{if(seq===sequence&&!disposed){loading.value=false;appending.value=false}}
}
watch([category,mine],()=>load())
async function open(id){
  if(busy.value&&!internalNavigation)return
  const seq=++sequence;loading.value=true;error.value='';detail.value=null;comments.value=[]
  try{const [entry,page]=await Promise.all([api.getWall(id),api.listComments(id)]);if(seq!==sequence||disposed)return;detail.value=entry;comments.value=page.items;commentMore.value=page.more;commentOffset.value=page.nextOffset}
  catch(e){if(seq===sequence&&!disposed)fail(e)}finally{if(seq===sequence&&!disposed)loading.value=false}
}
async function moreComments(){if(busy.value||loading.value||!detail.value)return;busy.value=true;error.value='';try{const page=await api.listComments(detail.value.id,commentOffset.value);comments.value.push(...page.items);commentMore.value=page.more;commentOffset.value=page.nextOffset}catch(e){fail(e)}finally{busy.value=false}}
watch(()=>route.query.post,id=>{if(id)open(String(id));else{detail.value=null;load()}},{immediate:true})
async function publish(){
  if(busy.value)return
  if(!form.title.trim()||form.body.trim().length<2){error.value='请填写标题和至少两个字的具体内容，不能只填空格';return}
  busy.value=true;error.value='';status.value=''
  try{const entry=await api.postWall({...form});if(disposed)return;Object.assign(form,{id:crypto.randomUUID(),category:'course',title:'',body:''});composing.value=false;recovery.save();recoveryNotice.value='';status.value='已提交审核，通过后同校用户可见';internalNavigation=true;await router.push({path:'/wall',query:{post:entry.id}})}catch(e){if(!disposed)fail(e)}finally{busy.value=false;internalNavigation=false}
}
async function respond(){
  if(busy.value||loading.value||!detail.value||detail.value.status!=='PUBLISHED'||replyPostId.value!==detail.value.id)return
  if(!reply.value.trim()){error.value='请先填写具体回复，不能只填空格';return}
  busy.value=true;error.value='';status.value=''
  try{const entry=await api.postComment(detail.value.id,{id:replyId.value,body:reply.value});if(disposed)return;comments.value.push(entry);reply.value='';replyId.value=crypto.randomUUID();recovery.save();recoveryNotice.value='';status.value='回复已提交审核，暂时仅自己可见'}catch(e){if(!disposed)fail(e)}finally{busy.value=false}
}
async function restoreDraft(){
  if(busy.value)return
  const entry=recovery.peek()
  if(!entry)return
  const hasPost=form.title.trim()||form.body.trim()
  if((hasPost&&(!entry.post||form.title!==entry.post.title||form.body!==entry.post.body||form.category!==entry.post.category))
    ||(reply.value.trim()&&(!entry.reply||reply.value!==entry.reply.body||replyPostId.value!==entry.reply.postId))){
    recoveryNotice.value='先提交或自行复制当前输入，再恢复暂存；不会覆盖新填写的内容';return
  }
  busy.value=true;internalNavigation=true
  try{
    if(entry.reply&&route.query.post!==entry.reply.postId)await router.push({path:'/wall',query:{post:entry.reply.postId}})
    if(disposed||!recovery.peek())return
    if(entry.post){Object.assign(form,entry.post);composing.value=true}
    if(entry.reply){replyId.value=entry.reply.id;replyPostId.value=entry.reply.postId;reply.value=entry.reply.body}
    recovery.restored()
  }finally{busy.value=false;internalNavigation=false}
}
async function toggleLike(entry){if(busy.value||loading.value)return;busy.value=true;error.value='';status.value='';try{await api.likeWall(entry.id,!entry.liked);entry.likes+=entry.liked?-1:1;entry.liked=!entry.liked}catch(e){fail(e)}finally{busy.value=false}}
async function remove(entry){
  if(busy.value||loading.value)return
  if(!window.confirm(entry.parentId?'撤回这条回复？撤回后不可恢复':'撤回这个主题及其全部回复？撤回后不可恢复'))return
  busy.value=true;try{await api.deleteWall(entry.id);status.value='内容已撤回，无法恢复';if(entry.parentId)comments.value=comments.value.filter(c=>c.id!==entry.id);else{reply.value='';internalNavigation=true;await router.push('/wall')}}catch(e){fail(e)}finally{busy.value=false;internalNavigation=false}
}
async function report(){if(busy.value||loading.value||!reporting.value)return;busy.value=true;error.value='';status.value='';try{await api.reportWall(reporting.value,reason.value);reporting.value=null;status.value='举报已送交本校管理员处理'}catch(e){fail(e)}finally{busy.value=false}}
onBeforeRouteLeave(()=>!busy.value&&(!dirty.value||window.confirm(recoveryState.value.enabled?'内容尚未提交，仅有30分钟临时副本。继续离开？':'还有未提交的内容，离开会丢失草稿。继续离开？')))
function beforeUnload(event){if(busy.value||(dirty.value&&!recovery.hasCurrent())){event.preventDefault();event.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',beforeUnload))
onBeforeUnmount(()=>{disposed=true;sequence++;window.removeEventListener('beforeunload',beforeUnload)})
</script>

<template>
  <div class="work-page wall-page">
    <header class="work-heading"><div><h1>校园里的事，一起聊</h1><p>遇到不会的实验、想找的队友，或值得分享的小事</p></div><button class="work-button primary" :disabled="busy" :aria-expanded="composing" @click="composing=!composing"><NavigationIcon name="wall" />发布主题</button></header>
    <details class="wall-guidance" :open="composing">
      <summary>使用说明</summary>
      <p class="wall-notice">仅登录后的同校用户可见 · 默认显示“同校同学” · 内容审核后公开，不自动进入 AI 知识库</p>
    </details>
    <FormDraftRecovery v-if="composing || dirty || detail || pendingDraft || recoveryNotice || recoveryState.enabled || recoveryState.error" :state="recoveryState" :pending="Boolean(pendingDraft)" :busy="busy" enabled-allowed scope="校园墙" :notice="recoveryNotice" @toggle="recovery.toggle" @restore="restoreDraft" @discard="recovery.discard" />
    <div v-if="error" class="work-error" role="alert">{{ error }} <button class="work-button" :disabled="loading || busy" @click="route.query.post ? open(String(route.query.post)) : load()">重试</button></div>
    <p v-if="status" class="work-status" role="status">{{ status }}</p>
    <form v-if="composing" class="work-form" :aria-busy="busy" @submit.prevent="publish" @input="status=''">
      <h2>把问题说具体，更容易得到帮助</h2>
      <label>话题<select v-model="form.category" :disabled="busy"><option v-for="c in categories.slice(1)" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
      <label>标题<input v-model="form.title" :disabled="busy" required maxlength="100" placeholder="例如：实验波形一直不稳定，该先检查什么？" /></label>
      <label>具体内容<textarea v-model="form.body" :disabled="busy" required minlength="2" maxlength="5000" rows="6" placeholder="说明背景、已经尝试过什么、目前卡在哪一步。不要填写姓名、学号、联系方式或他人的隐私。"></textarea></label>
      <small>本版支持纯文字。不要发布未经授权的试题、曝光信息、交易广告或危险操作指导。前端不显示真实身份，管理员可依规则处理举报，不代表平台无法追溯。</small>
      <div class="work-actions"><button class="work-button primary" :disabled="busy">{{busy?'正在提交':'提交审核'}}</button><button class="work-button" type="button" :disabled="busy" @click="composing=false">收起草稿</button><span class="work-help">{{form.body.length}} / 5000</span></div>
    </form>
    <template v-if="route.query.post">
      <button class="work-button wall-back" :disabled="busy" @click="router.push('/wall')">返回全部主题</button>
      <p v-if="loading" class="work-loading" role="status">正在打开主题…</p>
      <div v-if="!loading && !detail && reply" class="work-form"><label>暂存回复 · 原主题暂时无法读取<textarea v-model="reply" maxlength="2000" rows="4"></textarea></label><p class="work-help">文字仍保留，可先复制。原主题不存在或无权访问时不能提交，也不会改发到其他主题</p></div>
      <article v-else-if="detail" class="wall-detail">
        <div class="wall-meta"><span>{{categoryName(detail.category)}}</span><time>{{stamp(detail.createdAt)}}</time><span>{{detail.mine?'我的发布':'同校同学'}}</span></div>
        <h2>{{detail.title}}</h2><p v-if="detail.status!=='PUBLISHED'" class="work-status">{{stateName(detail.status)}}<span v-if="detail.reviewNote"> · {{detail.reviewNote}}</span></p>
        <p class="wall-body">{{detail.body}}</p>
        <div class="wall-controls"><button v-if="!detail.mine&&detail.status==='PUBLISHED'" :disabled="busy" :aria-pressed="detail.liked" @click="toggleLike(detail)">{{detail.liked?'已赞同':'赞同'}} {{detail.likes}}</button><span v-else>{{detail.likes}} 人赞同</span><button v-if="detail.mine" :disabled="busy" @click="remove(detail)">撤回主题</button><button v-else :disabled="busy" @click="reporting=detail.id">举报</button></div>
        <h3 class="wall-replies-title">同学的回复</h3>
        <p v-if="!comments.length" class="work-help">还没有公开回复。有相关经历的话，分享你核对过的做法。</p>
        <article v-for="comment in comments" :key="comment.id" class="wall-comment"><div class="wall-meta"><span>{{comment.mine?'我的回复':'同校同学'}}</span><time>{{stamp(comment.createdAt)}}</time></div><p class="wall-body">{{comment.body}}</p><p v-if="comment.status!=='PUBLISHED'" class="work-help">{{stateName(comment.status)}} {{comment.reviewNote}}</p><div class="wall-controls"><button v-if="comment.mine" :disabled="busy" @click="remove(comment)">撤回回复</button><template v-else><button :disabled="busy" :aria-pressed="comment.liked" @click="toggleLike(comment)">{{comment.liked?'已赞同':'赞同'}} {{comment.likes}}</button><button :disabled="busy" @click="reporting=comment.id">举报</button></template></div></article>
        <button v-if="commentMore" class="work-button" :disabled="busy" @click="moreComments">加载更多回复</button>
        <form v-if="detail.status==='PUBLISHED'" class="work-form wall-reply" :aria-busy="busy" @submit.prevent="respond" @input="status=''"><label>回复这个主题<textarea v-model="reply" :disabled="busy" required maxlength="2000" rows="3" placeholder="分享思路和依据，不公开个人信息"></textarea></label><div><button class="work-button primary" :disabled="busy">提交回复审核</button></div></form>
      </article>
    </template>
    <template v-else>
      <div class="wall-filter"><div class="work-tabs" aria-label="筛选话题"><button v-for="c in categories" :key="c.id" :aria-pressed="category===c.id" :disabled="busy" @click="category=c.id">{{c.name}}</button></div><button class="work-button" :aria-pressed="mine" :disabled="busy" @click="mine=!mine">{{mine?'查看全部':'我的发布'}}</button></div>
      <p v-if="loading&&!appending" class="work-loading" role="status">正在读取校园墙…</p>
      <div v-else-if="!loading&&!entries.length&&!error" class="work-empty"><NavigationIcon name="wall" /><h2>{{mine?'你还没有发布过主题':'把第一个具体问题留在这里'}}</h2><p>本区没有填充虚假帖子<br />可以从一次实验卡点或一条组队邀请开始</p><button class="work-button primary" @click="composing=true">发布第一个主题</button></div>
      <div v-else class="wall-list"><article v-for="entry in entries" :key="entry.id" class="wall-row"><div class="wall-meta"><span>{{categoryName(entry.category)}}</span><time>{{stamp(entry.createdAt)}}</time><span v-if="entry.mine">我</span></div><RouterLink :to="{path:'/wall',query:{post:entry.id}}"><h2>{{entry.title}}</h2><p>{{entry.body}}</p></RouterLink><footer><span v-if="entry.status!=='PUBLISHED'">{{stateName(entry.status)}}</span><span>{{entry.replies}} 条公开回复</span><span>{{entry.likes}} 人赞同</span></footer></article></div>
      <button v-if="more && (!loading || appending)" class="work-button" :disabled="loading || busy" @click="load(true)">{{loading?'加载中':'加载更多主题'}}</button>
    </template>
    <form v-if="reporting" class="work-form wall-report" :aria-busy="busy" @submit.prevent="report"><h2>举报内容</h2><label>原因<select v-model="reason" :disabled="busy"><option v-for="r in ['隐私泄露','辱骂攻击','广告诈骗','内容不实','其他问题']" :key="r">{{r}}</option></select></label><div class="work-actions"><button class="work-button primary" :disabled="busy">提交举报</button><button class="work-button" type="button" :disabled="busy" @click="reporting=null">取消</button></div></form>
  </div>
</template>

<style scoped>
.wall-notice{font-size:14px;color:#5c6754;padding-bottom:20px;border-bottom:1px solid #dce1d4;line-height:1.8}.wall-filter{display:flex;gap:14px;align-items:flex-start;margin:24px 0}.wall-filter>.work-button{margin-left:auto;flex:none}.wall-list{border-top:1px solid #dce1d4}.wall-row{padding:24px 4px;border-bottom:1px solid #dce1d4}.wall-row a{color:inherit;text-decoration:none}.wall-row h2{font-size:20px;font-weight:600;line-height:1.5;margin:12px 0 8px;overflow-wrap:anywhere}.wall-row a:hover h2{color:#3544dc}.wall-row p{font-size:16px;line-height:1.7;color:#596454;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.wall-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13px;color:#5b6752}.wall-meta>span:first-child{color:#435938;background:#e8eedf;border-radius:999px;padding:4px 10px}.wall-row footer{display:flex;gap:18px;color:#627054;font-size:13px;margin-top:14px}.wall-empty svg,.work-empty svg{width:36px;height:36px;color:#5c6a4d;margin:0 auto}.wall-detail{max-width:78ch;margin:26px auto}.wall-detail>h2{font-size:27px;line-height:1.4;overflow-wrap:anywhere}.wall-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;font-size:16px}.wall-controls{display:flex;gap:18px;align-items:center;color:#627054;font-size:14px}.wall-controls button{border:0;background:transparent;color:#46573e;padding:8px 0}.wall-controls button[aria-pressed=true]{color:#3544dc}.wall-replies-title{margin-top:38px;border-top:1px solid #d6dccd;padding-top:24px;font-size:20px}.wall-comment{padding:22px 0;border-bottom:1px solid #dce1d4}.wall-reply{margin-top:28px}.wall-back{margin-top:10px}.work-form h2{font-size:20px;margin:0}.wall-list+.work-button{margin-top:24px}@media(max-width:760px){.wall-filter{display:block}.wall-filter>.work-button{margin-bottom:14px}.wall-filter .work-tabs{margin-bottom:12px}.wall-detail>h2{font-size:24px}}
</style>
