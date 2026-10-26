import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {calendarRangeForText} from '../src/utils/scheduleIntent.js'
import {resolveTeachingWorkflow,previousTeachingWorkflow,teachingWorkflowDestination,teachingWorkflowRoute,focusWorkflowElement,cancelWorkflowFocus,TEACHING_WORKFLOWS} from '../src/utils/teachingWorkflows.js'
const opts={timeout:5000},today='2026-10-17',scope='owner:school:session:mode:conversation',resolve=(text,previous)=>resolveTeachingWorkflow(text,{today,scope,previous})
test('workflow speech act and topic slots keep private management requests local without pretending to execute',opts,()=>{
  const groups={EVIDENCE:['导出我这周的考勤','下载上周迟到明细','给我导一份考勤表格','查看点名更正历史'],MANAGEMENT_HISTORY:['查看转班记录','查账号绑定历史','查询身份审核记录','看管理操作历史','查看复学的记录'],LIFECYCLE:['把模拟同学转班','帮我为某人恢复学籍','请给模拟同学办理离校','打开复学核对'],COURSE_MEMBERS:['帮模拟同学重新选课','把某人退课','打开恢复选课'],COURSE_SOURCE:['把历史课程类型核定为整班','核定课程来源','确认历史课按逐人选课'],ACCOUNT_BINDING:['给学生绑定账号','把学生账号解绑','重新绑定账号'],RESPONSIBILITY:['配置辅导员负责班级','调整书记负责学院范围'],IDENTITY_APPLICATION:['申请教师身份','我想成为书记'],IDENTITY_REVIEW:['审核教学身份申请','撤销教师身份'],RETENTION:['删除考勤历史','备份考勤记录','查看一年到期考勤归档'],PRIVILEGE:['把我设为平台管理员','开通管理员权限']}
  for(const [workflow,values] of Object.entries(groups))for(const text of values)assert.equal(resolve(text)?.workflow,workflow,text)
})
test('public policy, writing code, third-party downloads and negated operations stay ordinary questions',opts,()=>{
  for(const text of ['我想了解转班流程','复学有什么要求','教师身份申请条件是什么','如何办理退课','帮我设计考勤导出算法','请编写考勤导出接口','解释课程来源核定代码','帮我下载图书馆通知','不要删除考勤记录','别把某人转班','图书馆几点关门'])assert.equal(resolve(text),null,text)
})
test('same-owner followups reuse semantic subject and date slots, not unrelated old conversation',opts,()=>{
  const first={...resolve('导出上周的考勤'),scope};assert.equal(first.from,'2026-10-05');assert.equal(first.to,'2026-10-11')
  const next=resolve('那这周呢',first);assert.equal(next.workflow,'EVIDENCE');assert.equal(next.from,'2026-10-12');assert.equal(next.to,'2026-10-18')
  const history=resolve('看更正历史',first);assert.equal(history.kind,'AUDIT');assert.equal(history.from,first.from)
  const message={role:'assistant',workflowContext:first};assert.deepEqual(previousTeachingWorkflow([message],scope),first);assert.equal(previousTeachingWorkflow([message,{role:'assistant',content:'普通校园回答'}],scope),null);assert.equal(previousTeachingWorkflow([message],'other'),null)
  assert.equal(resolve('那上周呢',{...first,scope:'other'}),null)
})
test('an ambiguous export asks for target before date and does not confuse personal schedule with attendance',opts,()=>{
  const first={...resolve('导出一下'),scope};assert.equal(first.awaitingTarget,true);assert.match(first.clarification,/对象/);assert.equal(teachingWorkflowDestination(first),null)
  assert.equal(resolve('考勤 上周',first).workflow,'EVIDENCE');assert.equal(resolve('我的课表',first).workflow,'TIMETABLE')
  const privateSchedule=previousTeachingWorkflow([{role:'assistant',localSchedule:true,scheduleQuery:{scope,from:today,to:today}}],scope);assert.equal(resolve('那导出呢',privateSchedule).workflow,'TIMETABLE')
})
test('shared calendar parser covers dates, weeks, months and rolling units without substituting partial ranges',opts,()=>{
  for(const [text,from,to] of [['昨天','2026-10-16','2026-10-16'],['上周','2026-10-05','2026-10-11'],['本月','2026-10-01','2026-10-31'],['上个月','2026-09-01','2026-09-30'],['最近七天','2026-10-11','2026-10-17'],['过去2周','2026-10-04','2026-10-17'],['10月12日到10月16日','2026-10-12','2026-10-16'],['2026年10月13日','2026-10-13','2026-10-13']]){const result=calendarRangeForText(text,{today});assert.equal(result.from,from,text);assert.equal(result.to,to,text)}
  for(const text of ['这学期','第6周','最近60天','10月31日到10月1日','2月30日','10月1日到11月30日','今天和明天'])assert.ok(calendarRangeForText(text,{today}).clarification,text)
  const pending=resolve('导出这学期的考勤');assert.ok(pending.clarification);assert.equal(teachingWorkflowDestination(pending),null);const clarified=resolve('上周',{...pending,scope});assert.equal(clarified.from,'2026-10-05')
})
test('management export routes to capability-checked preparation while permanent archive never pretends to execute',opts,()=>{
  const result=resolve('导出本周管理操作历史');assert.equal(result.workflow,'MANAGEMENT_HISTORY');assert.match(result.notice,/先读取/);assert.match(result.notice,/管理员权限与服务能力/);assert.match(resolve('删除一年以前的考勤').workflow,/RETENTION/)
  const route=teachingWorkflowDestination({...resolve('导出本周考勤'),url:'https://bad.example',userId:999,view:'ADMIN'});assert.equal(route.path,'/teaching');assert.equal(route.query.tool,'evidence');assert.equal(route.query.from,'2026-10-12');assert.equal(route.query.userId,undefined);assert.equal(route.query.view,undefined)
})
test('route metadata is an allowlist and never authorizes arbitrary targets or silently accepts invalid dates',opts,()=>{
  assert.equal(teachingWorkflowRoute({tool:'sql',statement:'DROP'}),null);assert.equal(teachingWorkflowDestination({workflow:'UNKNOWN'}),null);assert.ok(teachingWorkflowRoute({tool:'evidence',from:'2026-02-30',to:today}).error)
  assert.deepEqual(teachingWorkflowRoute({tool:'management-history',from:'2026-10-12',to:'2026-10-18',userId:'1',role:'ADMIN'}),{tool:'management-history',from:'2026-10-12',to:'2026-10-18',kind:'ATTENDANCE',expiredOnly:false})
})
test('local workflow and private schedule dispatch precede model/history in every mode',opts,()=>{
  const source=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8'),start=source.indexOf('if(workflow){'),end=source.indexOf('  if(action){',start),branch=source.slice(start,end)
  assert.ok(start>0&&end>start);assert.match(branch,/localAction:true/);assert.match(branch,/workflowContext/);assert.doesNotMatch(branch,/sendMessageStream|ensureConversation|createKnowledgeSubmission|selectedModelKey.value==='standard'/)
  const schedule=source.slice(source.indexOf('const privateQuery ='),source.indexOf('if (privateQuery)'));assert.doesNotMatch(schedule,/selectedModelKey.value === 'standard'/)
  const data=resolve('导出考勤 '+('模拟依据'.repeat(400)));assert.equal(data.workflow,'EVIDENCE')
  assert.equal(resolve('帮我把模拟学生复学 {"userId":1}').workflow,'LIFECYCLE')
})
test('new route card and exact destination integration compile without fake mutation controls',opts,()=>{
  for(const path of ['src/components/ChatWorkflowCard.vue','src/components/AdminTeachingPanel.vue','src/components/TeachingGovernancePanel.vue','src/components/TeachingAdministrativeAuditPanel.vue','src/views/TeachingView.vue','src/views/AdminView.vue','src/views/AccountView.vue']){
    const source=readFileSync(new URL('../'+path,import.meta.url),'utf8'),{descriptor,errors}=parse(source);assert.deepEqual(errors,[]);compileScript(descriptor,{id:path});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:path,filename:path}).errors,[])
  }
  const card=readFileSync(new URL('../src/components/ChatWorkflowCard.vue',import.meta.url),'utf8');assert.match(card,/RouterLink/);assert.match(card,/adminRequired/);assert.match(card,/min-height:44px/);assert.match(card,/font-size:16px/);assert.doesNotMatch(card,/v-html|sendMessage|save|post\(|localStorage|sessionStorage/)
  const target=readFileSync(new URL('../src/components/AdminTeachingPanel.vue',import.meta.url),'utf8');assert.match(target,/lastWorkflowFocus/);assert.match(target,/key!==workflowKey.value/);assert.match(target,/hasDraft.value/)
})
test('personal file requests reach the literal private export action without importing a name, role or account id into authority',opts,()=>{
  const value=resolveTeachingWorkflow('导出我的课表',{today:'2026-10-17',scope:'100:1'});assert.equal(value.personalExport,true)
  assert.deepEqual(teachingWorkflowDestination(value),{path:'/timetable',query:{tool:'personal-export'}})
  assert.equal(teachingWorkflowDestination({...value,userId:999,role:'ADMIN'}).query.userId,undefined)
  assert.equal(teachingWorkflowRoute({tool:'personal-export',userId:'999'}),null)
  assert.doesNotMatch(TEACHING_WORKFLOWS.TIMETABLE.description,/不创建个人课表导出/)
})
test('route focus opens the existing disclosure without hiding its title under the fixed header',opts,()=>{
  const calls=[],summary={tagName:'SUMMARY',getAttribute:()=>null,focus:options=>calls.push(['focus',options])},element={style:{},tagName:'DETAILS',querySelector:()=>summary,scrollIntoView:options=>calls.push(['scroll',options])}
  assert.equal(focusWorkflowElement(element),true);assert.equal(element.open,true);assert.equal(element.style.scrollMarginTop,'90px');assert.deepEqual(calls,[['focus',{preventScroll:true}],['scroll',{block:'start',behavior:'auto'}]])
  assert.equal(focusWorkflowElement(null),false)
})
test('a workspace transition delays one focus until enter completes and never steals scroll after user input or cutover',opts,()=>{
  const make=()=>{const handlers=new Map(),calls=[],page={isConnected:true,classList:{contains:()=>true},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)},element={style:{},tagName:'DETAILS',closest:()=>page,querySelector:()=>({tagName:'SUMMARY',getAttribute:()=>null,focus:()=>calls.push('focus')}),scrollIntoView:()=>calls.push('scroll')};return{handlers,calls,element}}
  const first=make();focusWorkflowElement(first.element);assert.deepEqual(first.calls,[]);first.handlers.get('campthink-workspace-ready')();assert.deepEqual(first.calls,['focus','scroll']);assert.equal(first.handlers.size,0)
  const second=make();focusWorkflowElement(second.element);second.handlers.get('wheel')();assert.equal(second.handlers.size,0);assert.deepEqual(second.calls,[])
  const third=make();let current=true;focusWorkflowElement(third.element,()=>current);current=false;third.handlers.get('campthink-workspace-ready')();assert.deepEqual(third.calls,[]);assert.equal(third.handlers.size,0)
})
test('the async destination body must be ready before scrolling, with cancellation and observer release',opts,()=>{
  const make=()=>{let status='waiting',callback,disconnected=false;const handlers=new Map(),calls=[],element={style:{},tagName:'DETAILS',getAttribute:()=>status,addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name),querySelector:()=>({tagName:'SUMMARY',getAttribute:()=>null,focus:()=>calls.push('focus')}),scrollIntoView:()=>calls.push('scroll')},observe=fn=>{callback=fn;return{observe:()=>{},disconnect:()=>{disconnected=true}}};return{element,observe,handlers,calls,ready(){status='ready';callback()},released:()=>disconnected}}
  const first=make();assert.equal(focusWorkflowElement(first.element,()=>true,first.observe),true);assert.equal(first.element.open,true);assert.deepEqual(first.calls,[]);first.ready();assert.deepEqual(first.calls,['focus','scroll']);assert.equal(first.released(),true);assert.equal(first.handlers.size,0)
  const second=make();focusWorkflowElement(second.element,()=>true,second.observe);second.handlers.get('wheel')();second.ready();assert.deepEqual(second.calls,[]);assert.equal(second.released(),true)
  const third=make();let current=true;focusWorkflowElement(third.element,()=>current,third.observe);current=false;third.ready();assert.deepEqual(third.calls,[]);assert.equal(third.released(),true)
  const removed=make();focusWorkflowElement(removed.element,()=>true,removed.observe);cancelWorkflowFocus(removed.element);removed.ready();assert.deepEqual(removed.calls,[]);assert.equal(removed.released(),true);assert.equal(removed.handlers.size,0)
})
