import test from 'node:test'
import assert from 'node:assert/strict'
import {planScheduleQuestion,scheduleQuery,validScheduleQuery} from '../src/utils/scheduleIntent.js'
import {previousScheduleQuery,readPrivateScheduleQuery} from '../src/utils/scheduleChat.js'
import {resolveTeachingWorkflow} from '../src/utils/teachingWorkflows.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate,addDays} from '../src/utils/timetable.js'

const opts={timeout:4000},today='2026-10-20',scope='synthetic-owner'
const pending={awaiting:true,pendingSchedule:{course:'体育',period:'ALL',detail:'SUMMARY',perspective:'STUDENT'}}
const ask=(text,previous=pending)=>planScheduleQuestion(text,{today,previous,scope})
test('natural read cancellation clears only the current read context and never cancels courses',opts,()=>{
  for(const previous of [pending,scheduleQuery(today)])for(const text of ['取消','取消吧','我不查了','算了，不查了','先别查了','不用查了','请取消这次查询','我想先不查了','那我不查了']){
    const result=ask(text,previous)
    assert.equal(result.cancelled,true,text);assert.equal(validScheduleQuery(result),false)
  }
  for(const text of ['取消我的课表','不要查今天，改查明天'])
    assert.notEqual(ask(text)?.cancelled,true,text)
  assert.ok(resolveTeachingWorkflow('取消我的课表',{today,scope}),'course mutation remains an explicit existing workflow')
  const messages=[{role:'user',localSchedule:true},{role:'assistant',localSchedule:true,scheduleQuery:{...pending,scope}}]
  assert.equal(ask('取消吧',previousScheduleQuery(messages,'other-owner')),null)
  assert.equal(ask('明天《取消吧》在哪上').course,'取消吧')
})
test('scope modifiers preserve the requested course, period and date without consuming literal titles',opts,()=>{
  for(const text of ['只查下午','只要下午','仅下午呢','就下午','先看下午','请帮我就只看下午']){
    const result=ask(text)
    assert.ok(result.clarification,text);assert.equal(result.pendingSchedule.period,'PM',text);assert.equal(result.pendingSchedule.course,'体育')
  }
  for(const [text,date] of [['就明天','2026-10-21'],['先看周四','2026-10-22'],['只查明天','2026-10-21'],['那就明天呢','2026-10-21']])
    assert.deepEqual(ask(text),scheduleQuery(date,date,{course:'体育',perspective:'STUDENT'}),text)
  assert.equal(ask('明天先知理论谁教').course,'先知理论')
  assert.equal(ask('就明天《只此青绿》谁教').course,'只此青绿')
  assert.equal(ask('只看明天天气'),null)
})
test('request-now is not a current-lesson filter and actual future DEV courses survive it',opts,async()=>{
  for(const text of ['现在帮我查明天什么课','我现在查明天的课','马上看看明天什么课','请现在查明天课表'])
    assert.deepEqual(ask(text,null),scheduleQuery('2026-10-21'),text)
  assert.equal(ask('现在上什么课',null).selection,'CURRENT')
  assert.equal(ask('查现在什么课',null).selection,'CURRENT')
  assert.equal(ask('现在查个人的课表',null).selection,'ALL')
  const fixture=createTeachingFlowFixture({privateEditDemo:true}),day=chinaDate(),future=addDays(day,7)
  const query=planScheduleQuestion(`现在帮我查${future}什么课`,{today:day,scope})
  const result=await readPrivateScheduleQuery(query,null,q=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:q}))
  assert.equal(result.selection,'ALL');assert.equal(result.count,2)
  const narrowed=planScheduleQuestion('只查上午',{today:day,scope,previous:pending})
  const current=planScheduleQuestion('就今天',{today:day,scope,previous:{awaiting:true,pendingSchedule:narrowed.pendingSchedule}})
  assert.equal(current.period,'AM');assert.equal(current.course,'体育')
  assert.equal((await readPrivateScheduleQuery(current,null,q=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:q}))).count,1)
})
