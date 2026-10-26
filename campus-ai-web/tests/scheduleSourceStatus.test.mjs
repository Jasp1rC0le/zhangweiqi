import test from 'node:test'
import assert from 'node:assert/strict'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { readPrivateScheduleQuery } from '../src/utils/scheduleChat.js'
import { scheduleQuery } from '../src/utils/scheduleIntent.js'
import { chinaDate,addDays,mondayOf } from '../src/utils/timetable.js'

const opts={timeout:4000},day=chinaDate(),tomorrow=addDays(day,1)
const read=(fixture,query)=>readPrivateScheduleQuery(query,null,q=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:q}))
test('a saved image is distinct from queryable courses and cannot establish free dates',opts,async()=>{
  const fixture=createTeachingFlowFixture({sourceDemo:'image'})
  const absent=await read(fixture,scheduleQuery(tomorrow))
  assert.equal(absent.display.state,'UNRESOLVED')
  assert.match(absent.display.summary,/已保存旧课表图片/)
  assert.match(absent.answer,/未读取图片内容.*未确认.*本次日期/)
  assert.equal(absent.count,0)
  const known=await read(fixture,scheduleQuery(day))
  assert.equal(known.count,1);assert.equal(known.display.state,'READY')
  const free=await read(fixture,scheduleQuery(day,day,{detail:'FREE'}))
  assert.equal(free.display.state,'UNRESOLVED');assert.equal(free.count,0);assert.deepEqual(free.display.freeDates,[])
})
test('source existence is owner scoped and does not contaminate explicit teaching',opts,async()=>{
  const fixture=createTeachingFlowFixture({sourceDemo:'image'})
  fixture.setActor(4)
  const teach=await read(fixture,scheduleQuery(day,day,{perspective:'TEACHER'}))
  assert.equal(teach.count,2);assert.equal(teach.queryScope.resolved,'TEACHER')
  assert.doesNotMatch(teach.answer,/旧课表图片/)
  fixture.setActor(8)
  assert.equal((await read(fixture,scheduleQuery(tomorrow))).display.state,'EMPTY')
  assert.doesNotMatch((await read(fixture,scheduleQuery(tomorrow))).answer,/旧课表图片/)
})
test('actual synthetic import and clear change the source explanation without reviving an image',opts,async()=>{
  const fixture=createTeachingFlowFixture({sourceDemo:'image'})
  const input={revision:0,semester:'本批合成学期',firstMonday:mondayOf(day),remindDays:7,courses:[{name:'本批合成已解析课',weekday:2,startTime:'08:30',endTime:'09:15',weeks:[1],room:'合成室'}]}
  await fixture.adapter({url:'/api/timetable/courses',method:'put',data:input})
  const outside=await read(fixture,scheduleQuery(addDays(day,56)))
  assert.equal(outside.display.state,'EMPTY');assert.match(outside.answer,/已保存的个人课表记录/)
  assert.doesNotMatch(outside.answer,/本批合成已解析课|本次未读取图片内容/)
  const current=(await fixture.adapter({url:'/api/timetable/courses',method:'get'})).data.schedule
  await fixture.adapter({url:'/api/timetable/courses',method:'delete',params:{revision:current.revision}})
  const cleared=await read(fixture,scheduleQuery(tomorrow))
  assert.equal(cleared.display.state,'EMPTY');assert.match(cleared.answer,/已保存的个人课表记录/)
  assert.doesNotMatch(cleared.answer,/本次未读取图片内容/)
  assert.equal((await fixture.adapter({url:'/api/timetable/courses',method:'get'})).data.schedule,null)
})
