<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import NavigationIcon from '@/components/NavigationIcon.vue'
import FormDraftRecovery from '@/components/FormDraftRecovery.vue'
import { wallFormRecovery } from '@/utils/formDraftRecovery.js'
import { useFormDraftRecovery } from '@/utils/useFormDraftRecovery.js'
import * as api from '@/api/wall'
import { wallComposerText, wallHasSeparateTitle, wallPostPayload } from '@/utils/wallComposer'
const route=useRoute(), router=useRouter()
const categories=[{id:'',name:'全部',icon:'wall'},{id:'campus',name:'日常吐槽',icon:'wall'},{id:'team',name:'交友搭子',icon:'projects'},{id:'course',name:'课程交流',icon:'study'},{id:'experiment',name:'实验求助',icon:'instruments'}]
const category=ref(''), mine=ref(false), entries=ref([]), more=ref(false), offset=ref(0)
const loading=ref(false), busy=ref(false), error=ref(''), status=ref('')
const appending=ref(false), composing=ref(false), composerInput=ref()
async function startComposing(){if(busy.value)return;if(route.query.post){await router.push('/wall');if(route.query.post)return}composing.value=true;await nextTick();composerInput.value?.focus()}
function closeComposing(){if(!busy.value)composing.value=false}
const detail=ref(null), comments=ref([]), commentMore=ref(false), commentOffset=ref(0)
const reply=ref(''), replyId=ref(crypto.randomUUID()), reporting=ref(null), reason=ref('内容不实')
const replyPostId=ref(route.query.post ? String(route.query.post) : null)
const form=reactive({id:crypto.randomUUID(),category:'campus',title:'',body:''})
const composerText=computed({get:()=>wallComposerText(form),set:value=>{form.title='';form.body=value}})
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
watch(category,value=>{if(!composerText.value.trim())form.category=value||'campus'})
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
  const payload=wallPostPayload(form)
  if(payload.body.trim().length<2||payload.body.length>5000){error.value='写两句再发布吧，最多5000字';return}
  busy.value=true;error.value='';status.value=''
  try{const entry=await api.postWall(payload);if(disposed)return;Object.assign(form,{id:crypto.randomUUID(),category:category.value||'campus',title:'',body:''});composing.value=false;recovery.save();recoveryNotice.value='';status.value='已提交，审核后同校可见';internalNavigation=true;await router.push({path:'/wall',query:{post:entry.id}})}catch(e){if(!disposed)fail(e)}finally{busy.value=false;internalNavigation=false}
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
    if(entry.post){composing.value=true;Object.assign(form,entry.post);if(route.query.post&&!entry.reply)await router.push('/wall')}
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
    <header class="work-heading"><h1>校园墙</h1><div class="wall-heading-actions"><button class="work-button primary wall-create" type="button" :disabled="busy" :aria-expanded="composing" @click="startComposing"><NavigationIcon name="wall" />发布动态</button><details class="wall-settings"><summary aria-label="社区设置" title="社区设置"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></summary><div class="wall-settings-menu"><p>同校可见，审核后发布。友善交流，不曝光他人隐私，不发广告、危险指导或未获授权的试题。管理员可处理举报，不保证无法追溯；内容不自动进入 AI 知识库。</p><FormDraftRecovery v-if="!pendingDraft" :state="recoveryState" :pending="false" :busy="busy" enabled-allowed scope="校园墙" :notice="recoveryNotice" @toggle="recovery.toggle" @restore="restoreDraft" @discard="recovery.discard" /></div></details></div></header>
    <FormDraftRecovery v-if="pendingDraft" :state="recoveryState" pending :busy="busy" enabled-allowed scope="校园墙" :notice="recoveryNotice" @toggle="recovery.toggle" @restore="restoreDraft" @discard="recovery.discard" />
    <div v-if="error" class="work-error" role="alert">{{ error }} <button class="work-button" :disabled="loading || busy" @click="route.query.post ? open(String(route.query.post)) : load()">重试</button></div>
    <p v-if="status" class="work-status" role="status">{{ status }}</p>
    <Transition name="wall-compose"><form v-if="composing&&!route.query.post" class="wall-composer" :aria-busy="busy" @submit.prevent="publish" @input="status=''">
      <textarea ref="composerInput" v-model="composerText" :disabled="busy" required minlength="2" maxlength="5000" rows="4" aria-label="动态内容" placeholder="分享新鲜事，或者找个搭子……"></textarea>
      <div class="wall-compose-top"><strong>写点新鲜事</strong><button type="button" class="work-button" :disabled="busy" @click="closeComposing">收起</button></div><div class="wall-publish"><small>{{form.category==='campus'?'审核后同校可见':categoryName(form.category)+' · 审核后同校可见'}}</small><span v-if="composerText.length>4500">{{composerText.length}} / 5000</span><button class="work-button primary" :disabled="busy||composerText.trim().length<2">{{busy?'发布中…':'发布'}}</button></div>
    </form></Transition>
    <template v-if="route.query.post">
      <button class="work-button wall-back" :disabled="busy" @click="router.push('/wall')">返回全部主题</button>
      <p v-if="loading" class="work-loading" role="status">正在打开主题…</p>
      <div v-if="!loading && !detail && reply" class="work-form"><label>暂存回复 · 原主题暂时无法读取<textarea v-model="reply" maxlength="2000" rows="4"></textarea></label><p class="work-help">文字仍保留，可先复制。原主题不存在或无权访问时不能提交，也不会改发到其他主题</p></div>
      <article v-else-if="detail" class="wall-detail">
        <div class="wall-meta"><span>{{categoryName(detail.category)}}</span><time>{{stamp(detail.createdAt)}}</time><span>{{detail.mine?'我的发布':'同校同学'}}</span></div>
        <h2 v-if="wallHasSeparateTitle(detail)">{{detail.title}}</h2><p v-if="detail.status!=='PUBLISHED'" class="work-status">{{stateName(detail.status)}}<span v-if="detail.reviewNote"> · {{detail.reviewNote}}</span></p>
        <p class="wall-body">{{detail.body}}</p>
        <div class="wall-controls"><button v-if="!detail.mine&&detail.status==='PUBLISHED'" :disabled="busy" :aria-pressed="detail.liked" @click="toggleLike(detail)">{{detail.liked?'已赞同':'赞同'}} {{detail.likes}}</button><span v-else>{{detail.likes}} 人赞同</span><button v-if="detail.mine" :disabled="busy" @click="remove(detail)">撤回主题</button><button v-else :disabled="busy" @click="reporting=detail.id">举报</button></div>
        <h2 class="wall-replies-title">同学的回复</h2>
        <p v-if="!comments.length" class="work-help">还没人回复，来接个话吧。</p>
        <div class="wall-comments"><article v-for="comment in comments" :key="comment.id" class="wall-comment"><div class="wall-meta"><span>{{comment.mine?'我的回复':'同校同学'}}</span><time>{{stamp(comment.createdAt)}}</time></div><p class="wall-body">{{comment.body}}</p><p v-if="comment.status!=='PUBLISHED'" class="work-help">{{stateName(comment.status)}} {{comment.reviewNote}}</p><div class="wall-controls"><button v-if="comment.mine" :disabled="busy" @click="remove(comment)">撤回回复</button><template v-else><button :disabled="busy" :aria-pressed="comment.liked" @click="toggleLike(comment)">{{comment.liked?'已赞同':'赞同'}} {{comment.likes}}</button><button :disabled="busy" @click="reporting=comment.id">举报</button></template></div></article></div>
        <button v-if="commentMore" class="work-button" :disabled="busy" @click="moreComments">加载更多回复</button>
        <form v-if="detail.status==='PUBLISHED'" class="work-form wall-reply" :aria-busy="busy" @submit.prevent="respond" @input="status=''"><label>回复这个主题<textarea v-model="reply" :disabled="busy" required maxlength="2000" rows="3" placeholder="分享思路和依据，不公开个人信息"></textarea></label><div><button class="work-button primary" :disabled="busy">提交回复审核</button></div></form>
      </article>
    </template>
    <template v-else>
      <div class="wall-filter"><div class="work-tabs" aria-label="筛选话题"><button v-for="c in categories" :key="c.id" :aria-pressed="category===c.id" :disabled="busy" @click="category=c.id"><NavigationIcon :name="c.icon" />{{c.name}}</button></div><button class="work-button" :aria-pressed="mine" :disabled="busy" @click="mine=!mine">{{mine?'查看全部':'我的发布'}}</button></div>
      <p v-if="loading&&!appending" class="work-loading" role="status">正在读取校园墙…</p>
      <section v-else-if="!loading&&!entries.length&&!error" class="wall-quiet-empty"><NavigationIcon name="wall" /><h2>{{mine?'你的动态，从这里开始':'今天有什么新鲜事？'}}</h2><button class="work-button" type="button" @click="startComposing">写第一条</button></section>
      <div v-else class="wall-list"><article v-for="entry in entries" :key="entry.id" class="wall-row"><div class="wall-meta"><span>{{categoryName(entry.category)}}</span><time>{{stamp(entry.createdAt)}}</time><span v-if="entry.mine">我</span></div><RouterLink :to="{path:'/wall',query:{post:entry.id}}"><h2 v-if="wallHasSeparateTitle(entry)">{{entry.title}}</h2><p>{{entry.body}}</p></RouterLink><footer><span v-if="entry.status!=='PUBLISHED'">{{stateName(entry.status)}}</span><span :aria-label="entry.replies+'条回复'"><NavigationIcon name="wall" />{{entry.replies}}</span><span :aria-label="entry.likes+'人赞同'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5c-2-2-5-1-8 2-3-3-6-4-8-2-4 4 1 9 8 14 7-5 12-10 8-14Z" /></svg>{{entry.likes}}</span></footer></article></div>
      <button v-if="more && (!loading || appending)" class="work-button" :disabled="loading || busy" @click="load(true)">{{loading?'加载中':'加载更多主题'}}</button>
    </template>
    <form v-if="reporting" class="work-form wall-report" :aria-busy="busy" @submit.prevent="report"><h2>举报内容</h2><label>原因<select v-model="reason" :disabled="busy"><option v-for="r in ['隐私泄露','辱骂攻击','广告诈骗','内容不实','其他问题']" :key="r">{{r}}</option></select></label><div class="work-actions"><button class="work-button primary" :disabled="busy">提交举报</button><button class="work-button" type="button" :disabled="busy" @click="reporting=null">取消</button></div></form>
  </div>
</template>

<style scoped>
.wall-page{--wall-gap:24px}.wall-page .work-heading{align-items:center;margin-bottom:32px}.wall-heading-actions{display:flex;align-items:center;gap:10px;margin-left:auto}.wall-page .work-heading h1{margin:0}.wall-page .work-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}.wall-page .navigation-icon{width:18px;height:18px}.wall-create{white-space:nowrap}.wall-settings{position:relative}.wall-settings>summary{list-style:none;display:grid;place-items:center;width:44px;height:44px;border-radius:12px;cursor:pointer;color:var(--assistant-muted)}.wall-settings>summary::-webkit-details-marker{display:none}.wall-settings summary svg{width:22px;height:22px;fill:currentColor}.wall-settings>summary:hover{background:var(--assistant-panel)}.wall-settings-menu{position:absolute;right:0;top:52px;z-index:20;width:min(340px,calc(100vw - 40px));padding:20px;background:var(--assistant-surface);border-radius:14px;box-shadow:0 8px 30px #1b2a3c24;font-size:14px;line-height:1.7}.wall-settings-menu p{margin:0}.wall-composer{position:relative;margin:0 0 32px;border:1px solid var(--assistant-line);border-radius:16px;padding:24px;background:var(--assistant-surface)}.wall-composer:focus-within{border-color:var(--assistant-accent)}.wall-composer textarea{box-sizing:border-box;display:block;width:100%;border:0;background:transparent;resize:vertical;min-height:160px;padding:48px 0 12px;font:inherit;font-size:17px;line-height:1.8;color:var(--assistant-ink);outline:0}.wall-compose-top{position:absolute;top:16px;left:24px;right:16px;display:flex;align-items:center;justify-content:space-between}.wall-compose-top strong{font-size:14px;font-weight:500;color:var(--assistant-muted)}.wall-compose-top button{background:transparent;border:0}.wall-publish{display:flex;align-items:center;gap:12px;margin-top:12px}.wall-publish small,.wall-publish>span{font-size:12px;color:var(--assistant-muted)}.wall-publish button{margin-left:auto;min-width:84px}.wall-filter{display:flex;align-items:center;gap:16px;margin:0 0 28px}.wall-filter>.work-button{margin-left:auto;flex:none}.wall-filter .work-tabs{overflow:auto;max-width:100%;background:transparent;padding:0;gap:4px}.wall-filter .work-tabs button{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;min-height:44px}.wall-filter button[aria-pressed=true]{font-weight:600;color:var(--assistant-accent);background:var(--assistant-soft)}.wall-list,.wall-comments{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--wall-gap);align-items:start}.wall-row{min-width:0;padding:26px;border:1px solid var(--assistant-line);border-radius:16px;background:var(--assistant-surface);transition:transform 200ms cubic-bezier(.22,1,.36,1),border-color 180ms ease}.wall-row:hover{transform:translateY(-3px);border-color:#aabbd1}.wall-row a{display:block;color:inherit;text-decoration:none;outline-offset:5px}.wall-row h2{font-size:21px;font-weight:600;line-height:1.45;margin:18px 0 12px;overflow-wrap:anywhere;letter-spacing:-.02em}.wall-row a>p{font-size:17px;line-height:1.85;color:var(--assistant-ink);margin:20px 0 0;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;min-height:5.55em}.wall-row a:hover h2{color:var(--assistant-accent)}.wall-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--assistant-muted)}.wall-meta>span:first-child{color:var(--assistant-accent);background:var(--assistant-soft);border-radius:8px;padding:5px 8px}.wall-row footer{display:flex;align-items:center;gap:20px;color:var(--assistant-muted);font-size:13px;margin-top:28px}.wall-row footer span{display:inline-flex;align-items:center;gap:6px}.wall-row footer svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.6}.wall-quiet-empty{min-height:42vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:18px;color:var(--assistant-muted)}.wall-quiet-empty>.navigation-icon{width:40px;height:40px;color:var(--assistant-accent);stroke-width:1.3}.wall-quiet-empty h2{font-size:24px;font-weight:500;color:var(--assistant-ink);margin:0;letter-spacing:-.02em}.wall-detail{max-width:860px;margin:32px auto}.wall-detail>h2{font-size:30px;line-height:1.4;overflow-wrap:anywhere}.wall-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85;font-size:17px}.wall-controls{display:flex;gap:18px;align-items:center;color:var(--assistant-muted);font-size:14px}.wall-controls button{border:0;background:transparent;color:var(--assistant-muted);min-height:44px;padding:8px 0;cursor:pointer}.wall-controls button[aria-pressed=true]{color:var(--assistant-accent);font-weight:600}.wall-replies-title{margin-top:48px;padding-top:24px;border-top:1px solid var(--assistant-line);font-size:20px}.wall-comment{min-width:0;padding:20px;background:var(--assistant-panel);border-radius:14px}.wall-comment .wall-body{font-size:16px}.wall-reply{margin-top:28px}.wall-back{margin-top:0}.wall-list+.work-button{margin-top:24px}.wall-settings summary:focus-visible{outline:2px solid var(--assistant-accent);outline-offset:3px}.wall-compose-enter-active,.wall-compose-leave-active{transition:opacity 200ms ease,transform 240ms cubic-bezier(.22,1,.36,1)}.wall-compose-enter-from,.wall-compose-leave-to{opacity:0;transform:translateY(-8px)}
@media(min-width:1600px){.wall-list{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:760px){.wall-page .work-heading{margin-bottom:24px;gap:12px}.wall-heading-actions{gap:4px}.wall-create{padding:10px 14px}.wall-filter{display:block;margin-bottom:20px}.wall-filter .work-tabs{margin-bottom:12px}.wall-list,.wall-comments{grid-template-columns:1fr;gap:16px}.wall-row{padding:22px}.wall-composer{padding:20px}.wall-compose-top{left:20px}.wall-row a>p{min-height:0;font-size:16px}.wall-quiet-empty h2{font-size:21px}}
@media(prefers-reduced-motion:reduce){.wall-row,.wall-compose-enter-active,.wall-compose-leave-active{transition:none}.wall-row:hover,.wall-compose-enter-from,.wall-compose-leave-to{transform:none}}
</style>
