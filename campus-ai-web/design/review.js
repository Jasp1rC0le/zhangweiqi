/** Local-only component fixtures. No real auth, backend requests, or mutations. Not a build entry. */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElButton, ElForm, ElFormItem, ElIcon, ElInput, ElOption, ElSelect } from 'element-plus'
import 'element-plus/dist/index.css'
import '../src/styles/campthink.css'
import '../src/styles/readability.css'
import '../src/styles/public-refinement.css'
import App from '../src/App.vue'
import http, { adminHttp, userSessionEnded } from '../src/api/http.js'
import { createSessionSync } from '../src/api/sessionSync.js'
import { useAuthStore } from '../src/stores/auth.js'
import { useAdminAuthStore } from '../src/stores/adminAuth.js'
import LoginView from '../src/views/LoginView.vue'
import ConnectionIssueView from '../src/views/ConnectionIssueView.vue'
import CanteenView from '../src/views/CanteenView.vue'
import AdminView from '../src/views/AdminView.vue'
import PrivacyView from '../src/views/PrivacyView.vue'
import ProjectStudioView from '../src/views/ProjectStudioView.vue'
import AccountView from '../src/views/AccountView.vue'
import ProjectReviewsView from '../src/views/ProjectReviewsView.vue'
import SafetyFixture from './SafetyFixture.vue'
import ReviewExit from './ReviewExit.vue'
import { createDemoLogout } from './demoLogout.js'
import { createProjectFixture } from './projectFixture.js'
import { createCanteenFixture } from './canteenFixture.js'
import { createMaterialIntakeFixture } from './materialIntakeFixture.js'
import { createPrivateMaterialFixture } from './privateMaterialFixture.js'
import { installVoiceInputFixture } from './voiceInputFixture.js'
import { createWallFixture } from './wallFixture.js'
import ChatView from '../src/views/ChatView.vue'
import WallView from '../src/views/WallView.vue'
import StudyView from '../src/views/StudyView.vue'
import TimetableView from '../src/views/TimetableView.vue'
import { createTimetableFixture } from './timetableFixture.js'
import InstrumentView from '../src/views/InstrumentView.vue'
import FeedbackView from '../src/views/FeedbackView.vue'
import ProView from '../src/views/ProView.vue'
import { installPausedChatFixture } from './chatStreamFixture.js'
import { installChatAssistantFixture } from './chatAssistantFixture.js'
import { sessionDraftRecovery } from '../src/utils/sessionDraftRecovery.js'
import { createAdminFixture } from './adminFixture.js'
import TeachingView from '../src/views/TeachingView.vue'
import { createTeachingFixture } from './teachingFixture.js'
import { createTeachingFlowFixture } from './teachingFlowFixture.js'
import { prepareTeachingChangeDemo } from './teachingChangeDemo.js'

if (!import.meta.env.DEV) throw new Error('Design fixtures are development-only')
if(new URLSearchParams(window.location.search).has('voiceDemo'))installVoiceInputFixture(window)
if (new URLSearchParams(window.location.search).get('stream') === 'paused') installPausedChatFixture()
const chatAssistantFixture = new URLSearchParams(window.location.search).has('assistant') ? installChatAssistantFixture({messageSpacing:new URLSearchParams(window.location.search).has('spacing')}) : null
const projectFixture = createProjectFixture({reviewDraft:new URLSearchParams(window.location.search).get('page')==='reviews'})
const canteenFixture = createCanteenFixture()
const wallFixture=createWallFixture()
const timetableFixture=createTimetableFixture({saved:new URLSearchParams(window.location.search).get('timetable')==='saved', coursesSaved:new URLSearchParams(window.location.search).get('courses')==='saved'})

const draftFixture = new URLSearchParams(window.location.search).has('draftRecovery')
const materialDemo = new URLSearchParams(window.location.search).get('materialIntake') === '1'
const requested = new URLSearchParams(window.location.search).get('page') || 'login'
const exitedDemo = requested === 'exit'
const privateEditDemoRequested=['workspace','timetable'].includes(requested)&&new URLSearchParams(window.location.search).get('privateEditDemo')==='1'
const changeDemoRequested=['teaching','timetable','workspace'].includes(requested)&&new URLSearchParams(window.location.search).get('changeDemo')==='1'
// Keep old bookmarked teaching URLs on the current permission-aware/paged fixture too.
const teachingFlowRequested=!exitedDemo&&(new URLSearchParams(window.location.search).has('teachingFlow')||requested==='teaching'||changeDemoRequested||privateEditDemoRequested)
const adminFixturePage = ['admin','workspace-admin'].includes(requested)
const adminFixture = createAdminFixture({schoolId:teachingFlowRequested?1:-1})
const teachingFixture = createTeachingFixture(new URLSearchParams(window.location.search).get('view') || 'TEACHER')
const teachingFlow = teachingFlowRequested ? createTeachingFlowFixture({ largeScope: new URLSearchParams(window.location.search).has('paging'),largeClass:new URLSearchParams(window.location.search).has('bigClass'),legacyCourse:new URLSearchParams(window.location.search).has('legacyCourse'),managementHistory:new URLSearchParams(window.location.search).has('managementAudit'),responsibilities:new URLSearchParams(window.location.search).has('responsibilities'),calendarDelayMs:new URLSearchParams(window.location.search).has('calendarDelay')?600:0,privateReadFailure:new URLSearchParams(window.location.search).get('privateReadFailure')||'',privateEditDemo:privateEditDemoRequested,dualRoleDemo:new URLSearchParams(window.location.search).get('dualRoleDemo')==='1',sourceDemo:new URLSearchParams(window.location.search).get('sourceDemo')||'' }) : null
if(teachingFlow&&requested==='teaching'&&!changeDemoRequested&&!new URLSearchParams(window.location.search).has('teachingFlow'))teachingFlow.setActor(({STUDENT:2,TEACHER:4,COUNSELOR:5,SECRETARY:6})[new URLSearchParams(window.location.search).get('view')]||4)
let changeDemoState=null
if(changeDemoRequested){try{changeDemoState={ready:true,...await prepareTeachingChangeDemo(teachingFlow)}}catch(error){changeDemoState={ready:false,message:error.response?.data?.message||error.message||'示例准备未核对，没有自动重发'}}}
const student = { id: materialDemo ? 900019 : draftFixture ? 900001 : -1, username: 'design-fixture', nickname: '设计验收', role: adminFixturePage || new URLSearchParams(window.location.search).has('teachingAdmin') ? 'ADMIN' : 'STUDENT', schoolId: materialDemo ? 900019 : draftFixture ? 900001 : -1 }
const materialFixture = materialDemo ? createMaterialIntakeFixture({ principal: () => fixtureAuth.user }) : null
const privateMaterialFixture = materialDemo ? createPrivateMaterialFixture({principal:()=>fixtureAuth.user}) : null
const canteens = [{ id: 1, name: '第一食堂（设计示例）', status: 'PUBLISHED' }, { id: 2, name: '第二食堂（设计示例）', status: 'DRAFT' }]
const merchants = [
  { id: 1, canteenId: 1, canteenName: canteens[0].name, name: '一碗热面（示例）', location: '一楼 · 08 号窗口', description: '仅用于检查布局的模拟商家，不是真实营业信息。', ratingCount: 28, averageScore: 4.6, reviewCount: 1, myScore: 0, operatingStatus: 'OPEN', status: 'PUBLISHED', hasPhoto: false },
  { id: 2, canteenId: 2, canteenName: canteens[1].name, name: '今日饭食（示例）', location: '二楼 · 12 号窗口', description: '长名称与缺少评分时的展示测试。', ratingCount: 0, averageScore: null, reviewCount: 0, myScore: 0, operatingStatus: 'UNKNOWN', status: 'DRAFT', hasPhoto: false },
]
const overview = { pendingSubmissions: 0, unresolvedFeedback: 0, openContactMessages: 0, pendingEmployerCandidates: 0, searchableDocuments: 0, recentModelCalls: 0, recentModelTokens: 0, pendingBackgroundJobs: 0, failedBackgroundJobs: 0 }
const feedbackReceipts=new Map()
let failFeedback=new URLSearchParams(window.location.search).has('failFeedback')
const adapter = async (config) => {
  // Explicitly synthetic local OCR review; never calls a provider.
  if(config.url==='/api/timetable/courses/image-capabilities')return{data:{version:2,provider:'local-ocr',engine:'synthetic-local',external:false,maxBytes:2097152,available:true},status:200,statusText:'OK',headers:{},config}
  if(config.url==='/api/timetable/courses/recognize-image'){
    document.documentElement.dataset.visionRequests=String(Number(document.documentElement.dataset.visionRequests||0)+1)
    if(new URLSearchParams(window.location.search).has('visionFailure'))throw{response:{status:503,data:{message:'模拟识别失败，请保留图片后重试'}},config}
    return{data:{version:2,provider:'local-ocr',engine:'synthetic-local',external:false,semester:'2026秋（合成课表）',firstMonday:'2026-09-07',week:9,warnings:[],rows:[{name:'合成课程A',teacher:'',weekday:1,startPeriod:1,endPeriod:2,weeks:[9],room:'合成教室A'},{name:'合成课程B川',teacher:'',weekday:3,startTime:'14:00',endTime:'15:35',weeks:[9],room:'',reviewNote:'名称中的符号需对照原图核对'}]},status:200,statusText:'OK',headers:{},config}
  }
  if(privateMaterialFixture){const response=await privateMaterialFixture(config);if(response)return response}
  if (materialFixture) { const response = await materialFixture.adapter(config); if (response) return response }
  if (teachingFlow) { const response = await teachingFlow.adapter(config); if (response) return response }
  if(new URLSearchParams(window.location.search).has('chatActions')&&config.url.startsWith('/api/admin/knowledge/')){
    if(teachingFlow?.principal().role!=='ADMIN')throw{response:{status:403,data:{message:'只有模拟管理员会话可维护知识库'}}}
    const response=await adminFixture.adapter(config);if(response)return response
  }
  if (config.url.startsWith('/api/teaching/') || config.url.startsWith('/api/admin/teaching/')) return teachingFixture.adapter(config)
  if (chatAssistantFixture) { const response = chatAssistantFixture.adapter(config); if (response) return response }
  if(adminFixturePage||teachingFlow?.principal().role==='ADMIN') { const response = await adminFixture.adapter(config); if(response) return response }
  if(config.url==='/api/contact-messages/capabilities')return{data:{requestIdVersion:1},status:200,statusText:'OK',headers:{},config}
  if(config.url==='/api/contact-messages'&&config.method==='post'){
    if(failFeedback)throw{response:{status:503,data:{message:'模拟发送失败：内容仍在本页，请重试'}},config}
    const body=typeof config.data==='string'?JSON.parse(config.data):config.data
    const existing=feedbackReceipts.get(body.requestId)
    if(existing&&JSON.stringify(existing)!==JSON.stringify(body))throw{response:{status:409,data:{message:'示例提交编号已使用，内容发生变化'}},config}
    feedbackReceipts.set(body.requestId,body)
    return{data:{id:1},status:201,statusText:'Created',headers:{},config}
  }
  if(new URLSearchParams(window.location.search).has('failSave')&&config.url==='/api/projects'&&config.method==='post')throw{response:{status:503,data:{message:'模拟保存失败：字段仍保留，可稍后重试'}},config}
  if(config.url.startsWith('/api/wall')||config.url.startsWith('/api/admin/wall'))return wallFixture.adapter(config)
  if(config.url==='/api/conversations'&&config.method==='post')return{data:{id:901,title:'示例学习辅导'},status:200,statusText:'OK',headers:{},config}
  if(config.url==='/api/conversations/901/messages'&&config.method==='post')return{data:{assistantMessage:{content:'## 模拟辅导结果\n这是设计验收内容，不是实际 AI 回复。\n\n先核对题目给出的单位，再逐项记录原始数据。\n\n- [ ] 对照教师材料核验\n- [ ] 记录真实测量结果'}},status:200,statusText:'OK',headers:{},config}
  if (config.url === '/api/canteens' || config.url.startsWith('/api/canteens/')) return canteenFixture.adapter(config)
  if (config.url === '/api/timetable' || config.url.startsWith('/api/timetable/')) return timetableFixture.adapter(config)
  if (config.url.startsWith('/api/projects') || config.url.startsWith('/api/project-reviews')) return projectFixture.adapter(config)
  if (config.method !== 'get') throw new Error('设计验收模式不执行保存、发布或其他写入')
  let data = []
  if (config.url === '/api/auth/me') data = student
  else if (config.url === '/api/models') data = draftFixture
    ? ['standard','kimi','glm'].map(key => ({key,name:key,available:true,configured:true}))
    : [{key:'standard',name:'问答',available:true,configured:true}]
  else if (config.url === '/api/account/profile' || config.url === '/api/account/email') data = {}
  else if(config.url === '/api/ai/quota') data={remaining:58400,limit:60000,used:1600,unit:'tokens'}
  else if(config.url === '/api/ai/quota/activity') data=[{createdAt:'2026-09-23T18:00:00',reservedTokens:2000,actualTokens:600,state:'SETTLED'},{createdAt:'2026-09-23T17:00:00',reservedTokens:1000,actualTokens:0,state:'RELEASED'},{createdAt:'2026-09-23T16:00:00',reservedTokens:1000,actualTokens:null,state:'RESERVED'}]
  else if (config.url === '/api/account/sessions') data = [{createdAt:'2026-09-23T10:00:00',expiresAt:'2026-10-23T10:00:00',current:true},{createdAt:'2026-09-22T10:00:00',expiresAt:'2026-10-22T10:00:00',current:false}]
  else if (config.url === '/api/schools') data = [{ id: student.schoolId, name: '天津中德应用技术大学（示例）' }]
  else if (config.url.endsWith('/overview')) data = overview
  else if (config.url.endsWith('/canteens')) data = canteens
  else if (config.url.endsWith('/canteens/merchants')) data = merchants
  else if (/\/merchants\/\d+\/reviews$/.test(config.url)) data = [{ id: 1, score: 5, comment: '用于核对长短评排版的模拟内容。', mine: false, status: 'PUBLISHED' }]
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}
http.defaults.adapter = adapter
adminHttp.defaults.adapter = adapter

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
const fixtureAuth = useAuthStore(pinia)
fixtureAuth.user = exitedDemo ? null : student
if (teachingFlow) fixtureAuth.user = teachingFlow.principal()
// Only this DEV entry uses an in-memory principal. Never read or renew a real
// session to render synthetic fixtures; every request uses the adapter above.
fixtureAuth.token = exitedDemo ? '' : 'design-fixture-only'
fixtureAuth.loadCurrentUser = async () => fixtureAuth.user
fixtureAuth.logout = createDemoLogout({ auth: fixtureAuth, navigate: path => window.location.replace(path) })
if (draftFixture && !exitedDemo) sessionDraftRecovery.bind(student)
const admin = useAdminAuthStore(pinia)
admin.loadCurrentUser = async () => { await fixtureAuth.loadCurrentUser(); return admin.user }
const pages = { login: LoginView, exit: ReviewExit, canteens: CanteenView, admin: AdminView, projects: ProjectStudioView, account: AccountView, safety: SafetyFixture }
const workspaceFixture=['workspace','wall','study','instruments','canteens','workspace-admin','feedback','reviews','timetable','teaching'].includes(requested)
const router = createRouter({
  history: createMemoryHistory(),
  routes: workspaceFixture ? [
    {path:'/',redirect:requested==='workspace-admin'?'/admin':requested==='workspace'?'/chat':`/${requested}`},
    {path:'/connection-error',name:'connection-error',component:ConnectionIssueView},
    {path:'/chat',name:'workspace',component:ChatView,meta:{requiresAuth:true},children:[
      {path:'',name:'chat',component:{render:()=>null}},
      {path:'/wall',name:'wall',component:WallView},
      {path:'/study',name:'study',component:StudyView},
      {path:'/timetable',name:'timetable',component:TimetableView},
      {path:'/teaching',name:'teaching',component:TeachingView},
      {path:'/instruments',name:'instruments',component:InstrumentView},
      {path:'/projects/:id?',name:'projects',component:ProjectStudioView},
      {path:'/reviews/:id?',name:'reviews',component:ProjectReviewsView},
      {path:'/canteens',name:'canteens',component:CanteenView,props:{demo:true}},
      {path:'/account',name:'account',component:AccountView},
      {path:'/feedback',name:'feedback',component:FeedbackView},
      {path:'/pro',name:'pro',component:ProView},
      {path:'/admin',name:'admin',component:AdminView},
    ]},
    {path:'/privacy',component:PrivacyView},
  ] : [
    requested === 'projects' ? {path:'/',redirect:'/projects'} : { path: '/', component: pages[requested] || LoginView, props: requested === 'canteens' ? { demo: true } : {} },
    { path: '/login', component: LoginView },
    { path: '/privacy', component: PrivacyView },
    { path: '/projects/:id?', name: 'projects', component: ProjectStudioView },
    { path: '/reviews/:id?', name: 'reviews', component: ProjectReviewsView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
app.use(router)
for (const component of [ElButton, ElForm, ElFormItem, ElIcon, ElInput, ElOption, ElSelect]) app.component(component.name, component)
await router.isReady()
app.mount('#app')
const label = document.createElement('div')
label.textContent = exitedDemo ? '模拟验收已退出 · 正式账号未受影响' : materialDemo ? '资料验收 · 合成人员与店铺 · 仅本页内存保存，刷新重置' : draftFixture ? '草稿验收 · 假账号 · 独立浏览器暂存 · 不连接后台' : ['projects','canteens','admin','workspace-admin','timetable'].includes(requested) ? '设计验收 · 修改只在本页内存中，刷新即重置' : '设计验收 · 模拟数据 · 不连接后台、不执行写入'
Object.assign(label.style, { position: 'fixed', left: '10px', bottom: '5px', zIndex: '10000', fontSize: '9px', padding: '4px 8px', background: '#283144', color: '#fff', borderRadius: '4px', pointerEvents: 'none' })
document.body.append(label)
if (teachingFlow) {
  label.textContent = changeDemoState ? changeDemoState.ready ? '调课通知示例已核对 · 仅本页模拟，刷新可重验' : `示例未核对：${changeDemoState.message}` : privateEditDemoRequested?'四周个人课表源（模拟） · 仅本页内存，刷新重置':'教学闭环模拟 · 分账号权限 · 全部数据只在本页内存'
  if(new URLSearchParams(window.location.search).has('voiceDemo'))label.textContent='语音手势使用合成转写，不录音 · 本页模拟数据'
  if(changeDemoState&&!changeDemoState.ready)label.setAttribute('role','alert')
  const controls = document.createElement('div'), select = document.createElement('select'), clock = document.createElement('select')
  Object.assign(controls.style,{position:'fixed',right:'10px',bottom:'6px',zIndex:'10000',display:'flex',gap:'8px',padding:'4px',background:'#fff',borderRadius:'8px'})
  select.setAttribute('aria-label','切换模拟账号')
  for(const actor of teachingFlow.actors()){const o=document.createElement('option');o.value=String(actor.id);o.textContent=actor.nickname;select.append(o)}
  select.value=String(teachingFlow.principal().id)
  select.onchange=()=>{fixtureAuth.user=teachingFlow.setActor(select.value)}
  clock.setAttribute('aria-label','模拟课堂时间')
  for(const [time,text] of [['13:00','学生课前1小时'],['13:55','教师课前5分钟'],['14:02','上课后2分钟']]){const o=document.createElement('option');o.value=time;o.textContent=text;clock.append(o)}
  clock.onchange=()=>{teachingFlow.advanceTo(clock.value);window.dispatchEvent(new Event('campthink-demo-clock'))}
  controls.append(select,clock);document.body.append(controls)
}
if (adminFixturePage) {
  const controls = document.createElement('div')
  Object.assign(controls.style, { position:'fixed', right:'10px', bottom:'5px', zIndex:'10000', display:'flex', flexWrap:'wrap', gap:'6px', maxWidth:'90vw' })
  for (const [text, run] of [['模拟发布失败',adminFixture.failPublication],['模拟发布后列表失败',adminFixture.failNextList],['恢复模拟服务',adminFixture.restore]]) {
    const button = document.createElement('button'); button.textContent = text
    Object.assign(button.style,{fontSize:'11px',padding:'6px',borderRadius:'8px'})
    button.onclick = run; controls.append(button)
  }
  document.body.append(controls)
}
if (workspaceFixture && new URLSearchParams(window.location.search).has('sessionSync')) {
  // Separate test channel: cannot log out the user's real work tabs or touch cookies.
  const fixtureSync = createSessionSync({
    channel: new BroadcastChannel('campthink-design-session-v1'),
    changed: () => { userSessionEnded.value = true },
  })
  const invalidate = document.createElement('button')
  invalidate.textContent = '模拟退出并通知其他设计测试页'
  Object.assign(invalidate.style, {position:'fixed',right:'12px',bottom:'12px',zIndex:'10000',padding:'10px',borderRadius:'16px'})
  invalidate.onclick = () => { userSessionEnded.value = true; fixtureSync.publish(); invalidate.remove() }
  document.body.append(invalidate)
  window.addEventListener('pagehide', () => fixtureSync.close(), {once:true})
}
if (requested === 'canteens') {
  const approve = document.createElement('button')
  approve.textContent = '模拟通过我的短评审核'
  Object.assign(approve.style, { position: 'fixed', right: '10px', bottom: '30px', zIndex: '10000', fontSize: '11px', padding: '8px', borderRadius: '10px' })
  approve.onclick = () => { canteenFixture.approveMine(); approve.textContent = '已模拟通过 · 收起再展开可查看' }
  document.body.append(approve)
}
if (requested === 'projects') {
  const conflict = document.createElement('button')
  conflict.textContent = '模拟下次保存冲突'
  Object.assign(conflict.style, { position: 'fixed', right: '10px', bottom: '5px', zIndex: '10000', fontSize: '10px' })
  conflict.onclick = () => { projectFixture.conflictNextSave(); conflict.textContent = '下次保存将返回冲突' }
  document.body.append(conflict)
}
if(requested==='reviews'||requested==='feedback'){
  const simulate=document.createElement('button')
  simulate.textContent=requested==='reviews'?'模拟其他页面更新意见':'模拟反馈服务恢复'
  Object.assign(simulate.style,{position:'fixed',right:'10px',bottom:'30px',zIndex:'10000',padding:'10px',borderRadius:'16px'})
  simulate.onclick=()=>{if(requested==='reviews')projectFixture.changeReviewNote();else failFeedback=false;simulate.textContent='模拟操作已执行'}
  document.body.append(simulate)
}
