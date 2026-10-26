import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolveChatAction} from '../src/utils/chatActions.js'
import {resolveTeachingWorkflow} from '../src/utils/teachingWorkflows.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate} from '../src/utils/timetable.js'
import {previousAttendanceClarification,resolveAttendanceContinuation} from '../src/utils/attendanceActionIntent.js'
const opts={timeout:5000},workflow=text=>resolveTeachingWorkflow(text,{today:'2026-10-18',scope:'synthetic'})
test('record speech and explicit status slots work in forward/reverse order and before lesson-change interpretation',opts,()=>{
  let combinations=0
  for(const verb of ['记一下','记上','记录','登记','补记','录入'])for(const [label,status] of [['旷课','ABSENT'],['早退','EARLY_LEAVE'],['按时','ON_TIME']])for(const text of [`帮我${verb}合成甲${label}`,`合成甲${label}，${verb}`]){const a=resolveChatAction(text);assert.equal(a?.kind,'ATTENDANCE',text);assert.equal(a.seed.status,status,text);assert.equal(workflow(text),null);combinations++}
  assert.equal(combinations,36)
  const a=resolveChatAction('修改这节课合成甲的考勤为旷课');assert.equal(a.kind,'ATTENDANCE');assert.equal(a.seed.status,'ABSENT');assert.equal(workflow('修改这节课合成甲的考勤为旷课'),null)
  assert.equal(resolveChatAction('把合成甲的考勤改成按时').seed.student,'合成甲');assert.equal(resolveChatAction('将张三设为旷课').seed.student,'张三')
  assert.equal(resolveChatAction('将合成甲从早退改为旷课').seed.status,'ABSENT')
})
test('unsupported or contradictory statuses ask locally rather than inferring absence or sending a private command to a model',opts,()=>{
  for(const text of ['登记合成甲迟到','合成甲未到，登记一下','帮我记录合成甲请假','将合成甲改为旷课或早退','记录合成甲缺勤']){const a=resolveChatAction(text);assert.equal(a?.kind,'CLARIFY_ACTION',text);assert.match(a.seed.message,/不会被自动换成旷课/)}
  const known=resolveChatAction('把合成甲从迟到改为按时');assert.equal(known.kind,'ATTENDANCE');assert.equal(known.seed.status,'ON_TIME')
  const generic=resolveChatAction('记录考勤');assert.equal(generic.kind,'ATTENDANCE');assert.equal(generic.seed.status,'')
  const long=resolveChatAction('帮我记录合成甲旷课 '+('合成依据'.repeat(250)));assert.equal(long.kind,'ATTENDANCE');assert.equal(long.seed.student,'');assert.equal(long.seed.status,'')
})
test('public policy coding negation and explicit knowledge targets do not become private attendance writes',opts,()=>{
  for(const text of ['不要记合成甲旷课','假如把合成甲设为旷课会怎样','怎么记录旷课','帮我写一段考勤登记代码','请解释考勤登记制度','旷课登记流程是什么'])assert.equal(resolveChatAction(text),null,text)
  assert.equal(resolveChatAction('查看记录合成甲旷课').kind,'ATTENDANCE_QUERY')
  assert.equal(resolveChatAction('修改知识库中的考勤规则').kind,'KNOWLEDGE');assert.equal(resolveChatAction('新增知识库《考勤记录制度》').seed.mode,'CREATE');assert.equal(resolveChatAction('修改知识库《新增课程指南》').seed.mode,'REVISE')
  assert.equal(resolveChatAction('查看知识库考勤规定'),null)
  assert.equal(resolveChatAction('将我的私人课表存入知识库').kind,'CLARIFY_ACTION')
  assert.equal(resolveChatAction('新增课程《考勤记录》').kind,'PERSONAL_COURSE')
})
test('referenced-course moves require a source choice even for admins; academic fallback never claims a write',opts,()=>{
  for(const text of ['把《合成课程》调到明天','把《合成课程》改到明天']){const w=workflow(text);assert.equal(w.workflow,'SCHEDULE_SOURCE');assert.ok(w.clarification);assert.equal(w.handoff,undefined)}
  assert.equal(workflow('把我个人课表里的《合成课程》调到明天').workflow,'PERSONAL_OPERATIONS');assert.equal(workflow('把正式教学《合成课程》调到明天').handoff,'TEACHING_LESSON_CHANGE')
  for(const text of ['查我的成绩','帮我修改本人的成绩','我的学号是多少']){const a=resolveChatAction(text);assert.equal(a.kind,'CLARIFY_ACTION');assert.match(a.seed.message,/本人学业工具/);assert.match(a.seed.message,/不修改教务成绩/)}
  assert.equal(resolveChatAction('我的绩点怎么算'),null);assert.equal(resolveChatAction('写一个我的成绩分析算法'),null)
})
test('a verbal attendance operation still hits actual server-style scope guards and exact manual targets, never status-by-name write',opts,async()=>{
  const f=createTeachingFlowFixture(),a=resolveChatAction('帮我记一下合成甲旷课');assert.equal(a.kind,'ATTENDANCE')
  const before=f.audit().length,date=chinaDate();f.setActor(2)
  const access=(await f.adapter({url:'/api/teaching/access',method:'get'})).data;assert.equal(access.views.includes('TEACHER'),false)
  await assert.rejects(f.adapter({url:'/api/teaching/lessons/page',method:'get',params:{view:'TEACHER',from:date,to:date,page:0,size:50,search:''}}),e=>[403,404].includes(e.response.status))
  f.setActor(4);const rows=(await f.adapter({url:'/api/teaching/lessons/page',method:'get',params:{view:'TEACHER',from:date,to:date,page:0,size:50,search:''}})).data
  assert.ok(rows.items.length);assert.equal(f.audit().length,before) // Parsing and authorization read do not choose a person or save.
  const code=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8');assert.match(code,/action.seed\?\.message\|\|/);const start=code.indexOf('  if(action){'),end=code.indexOf('// Personal schedule answers',start);assert.doesNotMatch(code.slice(start,end),/sendMessageStream|ensureConversation|saveRollCall|post\(/)
})
test('oversized malformed quote runs remain bounded and cannot supply a name or executable status seed',opts,()=>{
  const text='帮我记一下合成甲旷课 '+ '《'.repeat(25000),a=resolveChatAction(text)
  assert.equal(a.kind,'ATTENDANCE');assert.equal(a.seed.student,'');assert.equal(a.seed.status,'')
})
test('unsupported-state clarification carries only a same-scope hint and a later explicit state never grants or writes',opts,()=>{
  const first=resolveChatAction('登记合成甲迟到'),scope='owner:mode:conversation:route',context={...first.seed.pendingAttendance,scope}
  assert.equal(context.student,'合成甲');const messages=[{role:'assistant',actionClarification:context}]
  assert.deepEqual(previousAttendanceClarification(messages,scope),context);assert.equal(previousAttendanceClarification(messages,'other'),null);assert.equal(previousAttendanceClarification([...messages,{role:'assistant',content:'新话题'}],scope),null)
  const next=resolveAttendanceContinuation('那就旷课',{previous:context,scope});assert.equal(next.kind,'ATTENDANCE');assert.equal(next.seed.status,'ABSENT');assert.equal(next.seed.student,'合成甲')
  assert.equal(resolveAttendanceContinuation('那就旷课',{previous:context,scope:'other'}),null);assert.equal(resolveAttendanceContinuation('图书馆几点关门',{previous:context,scope}),null)
  assert.equal(resolveAttendanceContinuation('还是迟到',{previous:context,scope}).kind,'CLARIFY_ACTION');assert.equal(resolveAttendanceContinuation('请假',{previous:context,scope}).kind,'CLARIFY_ACTION');assert.equal(resolveAttendanceContinuation('取消',{previous:context,scope}).seed.pendingAttendance,undefined)
  const source=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8');assert.match(source,/message.actionClarification=null/);assert.match(source,/const routeText=materialRouteText\(content\)/);assert.match(source,/resolveAttendanceContinuation\(routeText/)
})
test('save-without-an-open-draft cannot fall through claiming persistence, while existing operations keep precedence',opts,()=>{
  for(const text of ['保存我的课表','帮我记下明天的课表','保存考勤记录','保存知识库']){const a=resolveChatAction(text);assert.equal(a?.kind,'CLARIFY_ACTION',text);assert.match(a.seed.message,/没有.*草稿/)}
  assert.equal(resolveChatAction('记录考勤').kind,'ATTENDANCE');assert.equal(resolveChatAction('帮我记下合成甲旷课').kind,'ATTENDANCE');assert.equal(resolveChatAction('新增课程《成绩分析》').kind,'PERSONAL_COURSE')
})
