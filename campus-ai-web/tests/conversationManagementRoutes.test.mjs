import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {resolveTeachingWorkflow,teachingWorkflowDestination,previousTeachingWorkflow,teachingWorkflowRoute} from '../src/utils/teachingWorkflows.js'
import {resolveChatAction} from '../src/utils/chatActions.js'
import {createTeachingResource} from '../src/utils/teaching.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate} from '../src/utils/timetable.js'
const scope='owner:school:session:mode:conversation',today='2026-10-18',opts={timeout:5000}
const resolve=(text,previous)=>resolveTeachingWorkflow(text,{scope,today,previous})
test('roll-call speech act, subject and date slots route to a teacher selection without marking anyone',opts,()=>{
  for(const text of ['开始点名','打开今天的点名名单','我要点一下名','进入明天的点名','帮我开始本周点名','我想点个名']){
    const r=resolve(text);assert.equal(r?.workflow,'ROLL_CALL',text);const route=teachingWorkflowDestination(r);assert.equal(route.query.tool,'roll-call');assert.equal(route.path,'/teaching');assert.equal(route.query.view,undefined);assert.equal(route.query.studentId,undefined)
  }
  const initial=resolve('开始点名');assert.equal(initial.from,today);assert.equal(initial.to,today)
  const prior={...resolve('打开明天的点名名单'),scope},next=resolve('那下周呢',prior);assert.equal(next.workflow,'ROLL_CALL');assert.equal(next.from,'2026-10-19');assert.equal(next.to,'2026-10-25')
  assert.ok(resolve('开始这学期点名').clarification);assert.equal(teachingWorkflowDestination(resolve('开始最近60天点名')),null)
  for(const text of ['点名制度是什么','如何办理点名更正','请写点名代码','不要开始点名','帮我设为旷课'])assert.notEqual(resolve(text)?.workflow,'ROLL_CALL',text)
})
test('private mutation routing does not depend on the caller being a student or administrator',opts,()=>{
  for(const text of ['修改我自己导入的课表','修改个人课表','怎么更新我自己的课程表']){
    const r=resolve(text);assert.equal(r?.workflow,'PERSONAL_MANAGE',text);if(r.handoff){assert.equal(r.handoff,'PERSONAL_COURSE_EDIT');assert.equal(teachingWorkflowDestination({...r,userId:99,role:'ADMIN'}),null)}else{assert.deepEqual(teachingWorkflowDestination({...r,userId:99,role:'ADMIN'}),{path:'/timetable',query:{tool:'personal-manage'}});assert.match(r.notice,/人工|不会自动/)}
  }
  for(const text of ['删除本人课表','把我导入的课表调到明天','取消我的私人课表','查看我的课表修改历史']){const r=resolve(text);assert.equal(r.workflow,'PERSONAL_OPERATIONS');assert.deepEqual(teachingWorkflowDestination({...r,userId:99,role:'ADMIN'}),{path:'/timetable',query:{tool:'personal-operations'}})}
  assert.equal(resolve('修改知识库里的课程安排'),null)
  assert.equal(resolve('查看调课历史').workflow,'MANAGEMENT_HISTORY')
  assert.equal(resolve('查看调课操作历史').workflow,'MANAGEMENT_HISTORY')
  assert.equal(resolve('谁修改了课程安排').workflow,'MANAGEMENT_HISTORY')
  assert.equal(resolveChatAction('新增课程《网络》周三')?.kind,'PERSONAL_COURSE')
  assert.equal(resolve('新增课程《网络》周三'),null)
})
test('ambiguous schedule source remains a local slot until explicitly supplied in the same owner conversation',opts,()=>{
  const first={...resolve('修改课表'),scope};assert.equal(first.workflow,'SCHEDULE_SOURCE');assert.ok(first.clarification);assert.equal(teachingWorkflowDestination(first),null)
  assert.equal(resolve('个人导入',first).handoff,'PERSONAL_COURSE_EDIT')
  const formal=resolve('正式教学',first);assert.equal(formal.handoff,'TEACHING_LESSON_CHANGE');assert.equal(formal.instructions,'修改课表');assert.equal(teachingWorkflowDestination(formal),null)
  assert.equal(resolve('那就取消',first).cancelled,true)
  assert.equal(resolve('个人导入',{...first,scope:'other'}),null)
  assert.equal(resolve('图书馆几点关门',first),null)
  const messages=[{role:'assistant',workflowContext:first}];assert.deepEqual(previousTeachingWorkflow(messages,scope),first);assert.equal(previousTeachingWorkflow([...messages,{role:'assistant',content:'new topic'}],scope),null)
  assert.equal(resolve('不是个人导入',first).workflow,'SCHEDULE_SOURCE')
  assert.equal(resolve('修改某同学的课表').workflow,'SCHEDULE_SOURCE')
  assert.ok(resolve('修改个人导入和正式教学课表').clarification)
  assert.equal(resolve('教室改到F2-308',{...resolve('修改本人课表'),scope}).workflow,'PERSONAL_MANAGE')
  assert.equal(resolve('修改课表 '+('模拟'.repeat(5000))+' {"userId":1}').workflow,'SCHEDULE_SOURCE')
})
test('strict teacher entry reads capabilities first and never falls back to another authorized view',opts,async()=>{
  const calls=[],state={},r=createTeachingResource({owner:()=>scope,state,readAccess:async()=>{calls.push('access');return{data:{enabled:true,views:['STUDENT','COUNSELOR']}}},readLessons:async()=>{calls.push('list');return{data:[]}}})
  await r.load('TEACHER',today,today,0,'',{requireView:true});assert.deepEqual(calls,['access']);assert.match(state.error,/任课权限/);assert.deepEqual(state.lessons,[])
  calls.length=0;assert.equal(await r.load('TEACHER',today,today),'STUDENT');assert.deepEqual(calls,['access','list']) // compatibility, not the roll-call route
})
test('actual DEV access selects only bound teacher lessons and rejects students leaders and an unbound applicant',opts,async()=>{
  const f=createTeachingFlowFixture(),date=chinaDate(),counts={access:0,list:0}
  const api=config=>f.adapter(config),state={},r=createTeachingResource({owner:()=>String(f.principal().id),state,readAccess:()=>{counts.access++;return api({url:'/api/teaching/access',method:'get'})},readLessonsPage:(view,from,to,signal,page,search)=>{counts.list++;return api({url:'/api/teaching/lessons/page',method:'get',params:{view,from,to,page,size:50,search},signal})}})
  for(const actor of [2,5,6,10]){f.setActor(actor);r.reset();counts.list=0;await r.load('TEACHER',date,date,0,'',{requireView:true});assert.equal(counts.list,0,`actor ${actor}`);assert.deepEqual(state.lessons,[])}
  f.setActor(4);r.reset();assert.equal(await r.load('TEACHER',date,date,0,'',{requireView:true}),'TEACHER');assert.equal(counts.list,1);assert.ok(state.lessons.length);assert.ok(state.lessons.every(l=>l.teacher.includes('模拟')))
})
test('literal routes and real management navigation do not import asserted identities or perform automatic writes',opts,()=>{
  assert.equal(teachingWorkflowRoute({tool:'roll-call',from:today,to:today,view:'ADMIN',userId:99}).tool,'roll-call');assert.equal(teachingWorkflowRoute({tool:'roll-call',from:today,to:'2026-12-18'}).error.length>0,true)
  const source=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8'),start=source.indexOf('let action=scheduleScope.value'),end=source.indexOf('// Personal schedule answers',start),branch=source.slice(start,end)
  assert.match(branch,/PERSONAL_MANAGE.*SCHEDULE_SOURCE/);assert.match(branch,/PERSONAL_COURSE_EDIT'\].includes\(workflow\?\.handoff\)/);assert.doesNotMatch(branch,/sendMessageStream|ensureConversation|saveCourseSchedule|post\(/)
  const panel=readFileSync(new URL('../src/components/CourseSchedulePanel.vue',import.meta.url),'utf8'),manage=panel.slice(panel.indexOf('async function openManagement'),panel.indexOf('async function exportStep'))
  assert.match(manage,/store.load\(force\)/);assert.match(manage,/props.manageRequested/);assert.match(manage,/owner!==store.principal/);assert.match(manage,/focusWorkflowElement/);assert.doesNotMatch(manage,/saveCourseSchedule|deleteCourseSchedule|mutate\(/)
  const timetable=readFileSync(new URL('../src/views/TimetableView.vue',import.meta.url),'utf8');assert.match(timetable,/openManagement\(\)/);assert.match(timetable,/route.query.tool === tool/)
})
test('only the new teacher entry is strict and all touched real surfaces compile',opts,()=>{
  const source=readFileSync(new URL('../src/views/TeachingView.vue',import.meta.url),'utf8');assert.match(source,/requireView:rollCallRequested.value/);assert.match(source,/!rollCallRequested && state.access/);assert.match(source,/rollCallRequested && state.access && !state.access.views.includes\('TEACHER'\)/)
  for(const file of ['src/views/TeachingView.vue','src/views/ChatView.vue','src/views/TimetableView.vue','src/components/CourseSchedulePanel.vue']){
    const {descriptor,errors}=parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));assert.deepEqual(errors,[]);compileScript(descriptor,{id:file});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:file,filename:file}).errors,[])
  }
})
