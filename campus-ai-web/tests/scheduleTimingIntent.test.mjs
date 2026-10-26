import test from 'node:test'
import assert from 'node:assert/strict'
import { planScheduleQuestion, scheduleQuery, requestScheduleQuery, validScheduleQuery } from '../src/utils/scheduleIntent.js'
import { previousScheduleQuery, readPrivateScheduleQuery, scheduleFocusOrigin, deniedScheduleIntent } from '../src/utils/scheduleChat.js'
import { resolveTeachingWorkflow, previousTeachingWorkflow } from '../src/utils/teachingWorkflows.js'
import { resolveChatAction } from '../src/utils/chatActions.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { chinaDate } from '../src/utils/timetable.js'
import { scheduleAnswerHeading, scheduleTimingNote } from '../src/utils/scheduleDisplay.js'

const today='2026-10-20',scope='synthetic-current-owner',opts={timeout:4000}
const prior={...scheduleQuery(today,today,{selection:'NEXT',detail:'TIME',perspective:'STUDENT'}),focus:`${today}T14:00:00`,focusName:'合成网络'}
const ask=(text,previous=null)=>planScheduleQuestion(text,{today,previous,scope})
test('duration slots distinguish waiting for start, waiting for end and full planned span',opts,()=>{
  for(const phrase of ['还有多久上课','我还有几分钟上课','离上课还有多久','还要等多长时间开课'])
    assert.deepEqual(ask(phrase),scheduleQuery(today,'2026-11-02',{selection:'NEXT',detail:'WAIT_START'}),phrase)
  for(const waiting of ['还有','还剩','还需','再等'])for(const unit of ['多久','几分钟','多长时间'])for(const point of ['上课','开课'])
    assert.deepEqual(ask(`${waiting}${unit}${point}`),scheduleQuery(today,'2026-11-02',{selection:'NEXT',detail:'WAIT_START'}))
  assert.deepEqual(ask('今天离上课还有多久'),scheduleQuery(today,today,{selection:'NEXT',detail:'WAIT_START'}))
  assert.deepEqual(ask('还要多久下课'),scheduleQuery(today,today,{selection:'CURRENT',detail:'WAIT_END'}))
  assert.deepEqual(ask('今天还有多久放学'),scheduleQuery(today,today,{selection:'LAST',detail:'WAIT_END'}))
  assert.deepEqual(ask('这节上多久',prior),scheduleQuery(today,today,{selection:'AT',detail:'DURATION',anchor:prior.focus,course:'合成网络',perspective:'STUDENT'}))
  assert.equal(ask('那门的时长',prior).detail,'DURATION')
  assert.deepEqual(ask('今天《合成网络》上多久'),scheduleQuery(today,today,{detail:'DURATION',course:'合成网络'}))
  assert.ok(ask('上课和下课还有多久',prior)?.clarification)
  assert.equal(ask('图书馆还有多久关门',prior),null)
})
test('course pronouns are contextual entities and never consume the leading 那 as filler',opts,()=>{
  for(const phrase of ['它在哪上','那门在哪上','那一节在哪上','请问它在哪里上课'])
    assert.deepEqual(ask(phrase,prior),scheduleQuery(today,today,{selection:'AT',detail:'LOCATION',anchor:prior.focus,course:'合成网络',perspective:'STUDENT'}),phrase)
  assert.deepEqual(ask('它谁教',prior),scheduleQuery(today,today,{selection:'AT',detail:'TEACHER',anchor:prior.focus,course:'合成网络',perspective:'STUDENT'}))
  assert.deepEqual(ask('那节什么时候结束',prior),scheduleQuery(today,today,{selection:'AT',detail:'TIME',anchor:prior.focus,course:'合成网络',perspective:'STUDENT'}))
  assert.equal(ask('它在哪上'),null)
  assert.equal(validScheduleQuery(ask('他在哪上课',prior)),false,'a third person never becomes an authorized owner query')
  assert.deepEqual(ask('明天《还有多久》在哪上'),scheduleQuery('2026-10-21','2026-10-21',{detail:'LOCATION',course:'还有多久'}))
})
test('timing followups stay on the selected upcoming lesson unless explicitly asking for another one',opts,()=>{
  const same=ask('下一节还有多久开始',prior)
  assert.equal(same.selection,'AT');assert.equal(same.anchor,prior.focus);assert.equal(same.detail,'WAIT_START')
  const later=ask('再下一节还有多久开始',prior)
  assert.equal(later.selection,'NEXT');assert.equal(later.anchor,prior.focus)
  assert.ok(ask('还有多久',{...scheduleQuery(today),focus:`${today}T14:00:00`})?.clarification,'start versus end is not guessed')
  assert.equal(ask('那还要等多久',prior).detail,'WAIT_START')
})
test('an explicit next countdown after a current or past focus reselects from the service clock',opts,()=>{
  for(const origin of ['CURRENT','PREVIOUS','FIRST','LAST']){
    const selected={...scheduleQuery(today,today,{selection:origin,period:'AM',perspective:'TEACHER',course:'旧课（合成）'}),focus:`${today}T08:30:00`,focusName:'旧课（合成）'}
    for(const previous of [selected,{...selected,selection:'AT',anchor:selected.focus,focusOrigin:origin}]){
      const next=ask('下一节还有多久开始',previous)
      assert.deepEqual(next,scheduleQuery(today,'2026-11-02',{selection:'NEXT',detail:'WAIT_START',perspective:'TEACHER'}),`${origin} ${previous.selection}`)
    }
  }
})
test('focus provenance survives only the same owner target and perspective, and never leaves the view',opts,()=>{
  const detail=ask('它在哪上',prior)
  const origin=scheduleFocusOrigin(detail,prior.focus,prior)
  assert.equal(origin,'NEXT')
  const messages=[{role:'user',localSchedule:true},{role:'assistant',localSchedule:true,scheduleQuery:{...detail,focus:prior.focus,focusName:prior.focusName,focusOrigin:origin,scope}}]
  const continued=previousScheduleQuery(messages,scope)
  assert.equal(continued.focusOrigin,'NEXT')
  assert.equal(ask('下一节还有多久开始',continued).selection,'AT')
  assert.equal(ask('再下一节还有多久开始',continued).selection,'NEXT')
  assert.equal(ask('再下一节还有多久开始',continued).anchor,prior.focus)
  assert.equal(previousScheduleQuery(messages,'another-owner'),null)
  assert.equal(requestScheduleQuery(continued).focusOrigin,undefined)
  assert.equal(deniedScheduleIntent(continued).focusOrigin,undefined)
  assert.equal(scheduleFocusOrigin({...detail,perspective:'TEACHER'},prior.focus,prior),'AT')
  assert.equal(scheduleFocusOrigin({...detail,course:'另一门（合成）'},prior.focus,prior),'AT')
  assert.equal(scheduleFocusOrigin(detail,null,prior),null)
  assert.equal(ask('下一节《另一门》还有多久开始',continued).selection,'NEXT')
})
test('actual DEV current and previous answers followed by a detail cannot pin the next countdown',opts,async()=>{
  const fixture=createTeachingFlowFixture(),day=chinaDate(),messages=[]
  const run=async text=>{
    const previous=previousScheduleQuery(messages,scope)
    const query=planScheduleQuestion(text,{today:day,previous,scope})
    const result=await readPrivateScheduleQuery(query,null,q=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:q}))
    const names=[...new Set(result.display.entries.map(e=>e.name))]
    messages.push({role:'user',localSchedule:true},{role:'assistant',localSchedule:true,scheduleQuery:{...query,focus:result.focus,focusName:names.length===1?names[0]:null,focusOrigin:scheduleFocusOrigin(query,result.focus,previous),scope}})
    return result
  }
  fixture.advanceTo('11:00')
  assert.match((await run('现在上什么课')).display.entries[0].name,/体育/)
  await run('它在哪上')
  const upcoming=await run('下一节还有多久开始')
  assert.equal(upcoming.selection,'NEXT');assert.equal(upcoming.anchor,null)
  assert.match(upcoming.display.entries[0].name,/计算机网络/)
  assert.match(upcoming.display.summary,/3小时/)
  assert.equal((await run('下一节还有多久开始')).selection,'AT','an already selected upcoming target remains the same')
  messages.length=0
  fixture.advanceTo('13:00')
  assert.match((await run('上一节是什么课')).display.entries[0].name,/体育/)
  await run('它在哪上')
  const afterPast=await run('下一节还有多久开始')
  assert.equal(afterPast.selection,'NEXT');assert.equal(afterPast.anchor,null)
  assert.match(afterPast.display.summary,/1小时/)
})
test('the whole local dispatch and response contract preserve timing and current owner only',opts,async()=>{
  const messages=[{role:'user',content:'下一节在哪上',localSchedule:true,scheduleOwner:scope},{role:'assistant',localSchedule:true,scheduleQuery:{...prior,scope}}]
  for(const text of ['它在哪上','还有多久上课','那节什么时候结束']){
    assert.equal(resolveChatAction(text),null,text)
    assert.equal(resolveTeachingWorkflow(text,{today,scope,previous:previousTeachingWorkflow(messages,scope)}),null,text)
    const query=ask(text,previousScheduleQuery(messages,scope))
    assert.ok(query&&!query.clarification,text)
    const data={...requestScheduleQuery(query),version:1,asOf:'2026-10-20T05:00:00Z',count:0,unknownTimes:0,focus:null,answer:'合成空范围',queryScope:{version:1,requested:'STUDENT',resolved:'STUDENT'}}
    assert.deepEqual(await readPrivateScheduleQuery(query,null,async()=>({data})),data)
  }
  assert.equal(ask('它在哪上',previousScheduleQuery(messages,'other-owner')),null)
})
test('DEV timing derives from its scoped schedule clock and does not invent a total for different times',opts,async()=>{
  const fixture=createTeachingFlowFixture(),day=chinaDate()
  const read=query=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:query})
  const query=scheduleQuery(day,day,{selection:'NEXT',detail:'WAIT_START'})
  const next=await readPrivateScheduleQuery(query,null,read)
  assert.match(next.display.summary,/1小时/)
  assert.match(scheduleTimingNote(next),/13:00:00.*不会自动刷新/)
  assert.match(next.answer,/13:00:00.*不会自动刷新/)
  assert.equal(scheduleAnswerHeading(next),'距计划开始')
  const pinned={...query,selection:'AT',anchor:next.focus,detail:'WAIT_END'}
  const end=await readPrivateScheduleQuery(pinned,null,read)
  assert.match(end.display.summary,/尚未到计划开始.*2小时35分钟/)
  const span=await readPrivateScheduleQuery({...pinned,detail:'DURATION'},null,read)
  assert.match(span.display.summary,/1小时35分钟/)
  assert.match(scheduleTimingNote(span),/课间.*课时/)
  assert.match(span.answer,/课间.*课时/)
  fixture.advanceTo('14:02')
  const elapsed=await readPrivateScheduleQuery({...pinned,detail:'WAIT_START'},null,read)
  assert.match(elapsed.display.summary,/已过计划开始.*2分钟/)
  const mixed=await readPrivateScheduleQuery(scheduleQuery(day,day,{detail:'DURATION'}),null,read)
  assert.match(mixed.display.summary,/不同钟点.*指定/)
})
test('remaining class time is not its full span, and timing intent survives an intervening detail',opts,()=>{
  const current={...prior,selection:'CURRENT',detail:'SUMMARY',focusOrigin:'CURRENT'}
  const located={...current,selection:'AT',anchor:current.focus,detail:'LOCATION'}
  for(const previous of [current,located]){
    for(const question of ['这节还上多久','这节还要上多久','这节还需要继续上多长时间','这节还能上几分钟'])
      assert.equal(ask(question,previous).detail,'WAIT_END',`${question} ${previous.selection}`)
    assert.equal(ask('还有多久',previous).detail,'WAIT_END')
    assert.equal(ask('这节上多久',previous).detail,'DURATION')
    assert.ok(ask('明天还上多久课',previous).clarification)
  }
  const upcoming={...prior,selection:'AT',anchor:prior.focus,detail:'LOCATION',focusOrigin:'NEXT'}
  assert.equal(ask('还要等多久',upcoming).detail,'WAIT_START')
  assert.equal(ask('还有多久',{...upcoming,detail:'WAIT_END'}).detail,'WAIT_END','explicit prior end intent wins over original upcoming selection')
  assert.ok(ask('这节还上多久',upcoming).clarification,'an upcoming target is not assumed to be in progress')
  assert.ok(ask('今天还上多久课').clarification,'whole-day remaining teaching time is not supported or guessed')
  assert.equal(ask('明天《还上多久》在哪上').course,'还上多久')
})
test('DEV current course remaining time stays93minutes after a location followup, full span remains95',opts,async()=>{
  const fixture=createTeachingFlowFixture(),day=chinaDate()
  fixture.advanceTo('14:02')
  const query=scheduleQuery(day,day,{selection:'CURRENT',perspective:'STUDENT'})
  const source=q=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:q})
  const current=await readPrivateScheduleQuery(query,null,source)
  const context={...query,selection:'AT',anchor:current.focus,focus:current.focus,focusOrigin:'CURRENT',focusName:current.display.entries[0].name,detail:'LOCATION'}
  const remaining=planScheduleQuestion('这节还上多久',{today:day,previous:context,scope})
  const answer=await readPrivateScheduleQuery(remaining,null,source)
  assert.equal(answer.detail,'WAIT_END');assert.match(answer.display.summary,/1小时33分钟/)
  const full=planScheduleQuestion('这节上多久',{today:day,previous:context,scope})
  assert.match((await readPrivateScheduleQuery(full,null,source)).display.summary,/1小时35分钟/)
})
