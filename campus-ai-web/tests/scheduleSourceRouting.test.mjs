import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {planScheduleQuestion,scheduleQuery,validScheduleQuery,requestScheduleQuery} from '../src/utils/scheduleIntent.js'
import {previousScheduleQuery,readPrivateScheduleQuery} from '../src/utils/scheduleChat.js'
import {previousTeachingWorkflow,resolveTeachingWorkflow,teachingWorkflowDestination} from '../src/utils/teachingWorkflows.js'
import {resolveChatAction} from '../src/utils/chatActions.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate,mondayOf,addDays} from '../src/utils/timetable.js'

const opts={timeout:5000},today='2026-10-20',scope='synthetic-owner:school:session:mode:conversation'
const pair=query=>[{role:'user',localSchedule:true,scheduleOwner:scope},{role:'assistant',localSchedule:true,scheduleQuery:{...query,scope}}]
const week=pair(scheduleQuery('2026-10-19','2026-10-25'))
function dispatch(text,messages=[],owner=scope){
  const workflow=resolveTeachingWorkflow(text,{today,scope:owner,previous:previousTeachingWorkflow(messages,owner)})
  const action=resolveChatAction(text)
  if(workflow)return{kind:'workflow',value:workflow}
  if(action)return{kind:'action',value:action}
  const value=planScheduleQuestion(text,{today,scope:owner,previous:previousScheduleQuery(messages,owner)})
  return value?{kind:'schedule',value}:{kind:'model'}
}
test('ambiguous range continuation stays local without inventing its start or end',opts,()=>{
  for(const text of ['周三之后呢','后面几天呢','那周三以前的课呢','接下来几天呢']){
    const result=dispatch(text,week)
    assert.equal(result.kind,'schedule',text);assert.ok(result.value.clarification,text)
    assert.equal(validScheduleQuery(result.value),false,text)
  }
  assert.equal(dispatch('后面几天呢',week,'other-owner').kind,'model')
  assert.deepEqual(dispatch('周四到周日',week).value,scheduleQuery('2026-10-22','2026-10-25'))
  assert.equal(dispatch('这周哪几天没课',week).value.detail,'FREE')
})
test('container words are not course names, and existence checks do not silently default to today',opts,()=>{
  for(const container of ['课表里','课表里面','课程表中']){
    const initial=dispatch(`我的${container}有没有体育`)
    assert.equal(initial.kind,'schedule');assert.ok(initial.value.clarification)
    assert.equal(initial.value.pendingSchedule.course,'体育')
    const known=dispatch(`我的${container}有没有体育`,week).value
    assert.deepEqual(known,scheduleQuery('2026-10-19','2026-10-25',{course:'体育'}))
    const explicit=dispatch(`我今天${container}有没有体育`).value
    assert.deepEqual(explicit,scheduleQuery(today,today,{course:'体育'}))
  }
  assert.equal(dispatch('明天《课表里的世界》谁教').value.course,'课表里的世界')
  const focused=pair({...scheduleQuery('2026-10-19','2026-10-25',{selection:'AT',anchor:'2026-10-20T14:00:00',course:'网络'}),focus:'2026-10-20T14:00:00',focusName:'网络'})
  assert.deepEqual(dispatch('课表里有没有体育',focused).value,scheduleQuery('2026-10-19','2026-10-25',{course:'体育'}))
})
test('a pending course/date clarification survives only its owner and carries only allowed intent slots',opts,()=>{
  const intent=dispatch('我的课表里有没有体育').value
  const pending=pair({awaiting:true,pendingSchedule:intent.pendingSchedule})
  const previous=previousScheduleQuery(pending,scope)
  assert.equal(previous.pendingSchedule.course,'体育')
  assert.deepEqual(dispatch('这周',pending).value,scheduleQuery('2026-10-19','2026-10-25',{course:'体育'}))
  assert.equal(previousScheduleQuery(pending,'other-owner'),null)
  const forged=previousScheduleQuery(pair({awaiting:true,pendingSchedule:{...intent.pendingSchedule,userId:999}}),scope)
  assert.equal(forged.pendingSchedule,undefined)
  assert.equal(requestScheduleQuery(dispatch('这周',pending).value).pendingSchedule,undefined)
  assert.equal(dispatch('取消',pending).value.cancelled,true)
  const taught=dispatch('我教的课表里有没有体育').value
  assert.equal(taught.pendingSchedule.course,'体育');assert.equal(taught.pendingSchedule.perspective,'TEACHER')
  const waitingTeacher=pair({awaiting:true,pendingSchedule:taught.pendingSchedule})
  assert.deepEqual(dispatch('明天',waitingTeacher).value,scheduleQuery('2026-10-21','2026-10-21',{course:'体育',perspective:'TEACHER'}))
  assert.deepEqual(dispatch('我作为学生明天呢',waitingTeacher).value,scheduleQuery('2026-10-21','2026-10-21',{perspective:'STUDENT'}))
  const view=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8')
  const branch=view.slice(view.indexOf('async function runScheduleQuery('),view.indexOf('async function chooseScheduleCourse('))
  assert.match(branch,/pendingSchedule/);assert.match(branch,/cancelled/)
  assert.doesNotMatch(branch,/sendMessageStream|ensureConversation|localStorage|sessionStorage/)
})
test('existing-upload lookup opens the actual own source entry, never a phantom course or admin history',opts,()=>{
  for(const text of ['我之前上传的课表呢','帮我找上次保存的课表','查看我导入过的课程表']){
    const result=dispatch(text)
    assert.equal(result.kind,'workflow',text);assert.equal(result.value.workflow,'PERSONAL_SOURCES',text)
    assert.deepEqual(teachingWorkflowDestination(result.value),{path:'/timetable',query:{queryView:'STUDENT'}})
    assert.equal(result.value.personalExport,undefined)
    for(const followup of ['历史呢','看看我的原件','查本人副本']){
      const history=resolveTeachingWorkflow(followup,{today,scope,previous:{...result.value,scope}})
      assert.equal(history.workflow,'PERSONAL_SOURCES',followup)
    }
    assert.equal(teachingWorkflowDestination({...result.value,userId:99,role:'ADMIN'}).query.userId,undefined)
  }
  const foreign=dispatch('张三之前上传的课表呢')
  assert.ok(foreign.value.clarification);assert.equal(teachingWorkflowDestination(foreign.value),null)
  const mixed=dispatch('我之前上传的课表明天什么课')
  assert.ok(mixed.value.clarification,'source lookup is not silently broadened to mixed-source course results')
  const sourceMessages=[{role:'user',localAction:true},{role:'assistant',localAction:true,workflowContext:{...mixed.value,scope}}]
  const chooseQuery=dispatch('查我的课程',sourceMessages)
  assert.equal(chooseQuery.value.awaitingScheduleDate,true)
  const waiting=[{role:'user',localAction:true},{role:'assistant',localAction:true,workflowContext:{...chooseQuery.value,scope}}]
  assert.deepEqual(dispatch('明天',waiting).value,scheduleQuery('2026-10-21','2026-10-21',{perspective:'STUDENT'}))
  assert.equal(dispatch('明天',waiting,'other-owner').kind,'model')
})
test('public questions and source mutations are not hijacked by the private read continuation',opts,()=>{
  for(const text of ['周三之后下雨吗','后面几天图书馆开放吗','这周课程有哪些知识点','讲解《我的课表里》的写作手法','如何上传课表','图书馆以前发布的通知在哪'])
    assert.equal(dispatch(text,week).kind,'model',text)
  assert.notEqual(dispatch('修改我之前上传的课表').value?.workflow,'PERSONAL_SOURCES')
  assert.notEqual(dispatch('导出我的课表').value?.workflow,'PERSONAL_SOURCES')
  assert.equal(dispatch('我想上传校园资料').kind,'model','actual intake dispatch remains owned by its earlier dedicated handler')
})
test('clarifying a date then reading DEV filters the real saved course without a fabricated entity',opts,async()=>{
  const fixture=createTeachingFlowFixture(),day=chinaDate()
  const first=planScheduleQuestion('我的课表里有没有体育',{today:day,scope})
  assert.ok(first.clarification)
  const previous=previousScheduleQuery(pair({awaiting:true,pendingSchedule:first.pendingSchedule}),scope)
  const query=planScheduleQuestion('这周',{today:day,scope,previous})
  assert.equal(query.from,mondayOf(day));assert.equal(query.to,addDays(mondayOf(day),6))
  const result=await readPrivateScheduleQuery(query,null,q=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:q}))
  assert.equal(result.count,1);assert.match(result.display.entries[0].name,/大学体育/)
})
test('repeated ambiguous particles are bounded and do not cause regex backtracking',opts,()=>{
  const malformed=dispatch('后面几天'+'没有'.repeat(90)+'X',week)
  assert.equal(validScheduleQuery(malformed.value),false)
  const context={workflow:'PERSONAL_SOURCES',scope}
  assert.equal(resolveTeachingWorkflow('看看'.repeat(90)+'X',{today,scope,previous:context}),null)
  const long=resolveTeachingWorkflow('查看'.repeat(1200)+'之前上传的课表',{today,scope,previous:context})
  assert.ok(long.clarification);assert.equal(teachingWorkflowDestination(long),null)
})
