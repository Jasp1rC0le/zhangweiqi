import test from 'node:test'
import assert from 'node:assert/strict'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { chinaDate, mondayOf, addDays } from '../src/utils/timetable.js'
import { readPrivateScheduleQuery } from '../src/utils/scheduleChat.js'
import { scheduleQuery } from '../src/utils/scheduleIntent.js'
import { createLessonChangeResource } from '../src/utils/teachingLessonChanges.js'

test('DEV weekly private occurrences retain every date instead of deduplicating recurring course ids', { timeout: 4000 }, async () => {
  const fixture=createTeachingFlowFixture({privateEditDemo:true})
  const from=addDays(mondayOf(chinaDate()),7),to=addDays(from,13)
  const result=await readPrivateScheduleQuery(scheduleQuery(from,to),null,query=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:query}))
  assert.equal(result.count,4)
  assert.equal(new Set(result.display.entries.map(row=>row.id)).size,4)
  assert.equal(new Set(result.display.entries.map(row=>row.date)).size,2)
})

test('DEV previous query keeps latest ending alternatives rather than picking the later start', { timeout:4000 }, async()=>{
  const fixture=createTeachingFlowFixture(),today=chinaDate()
  const saved=(await fixture.adapter({url:'/api/timetable/courses',method:'get'})).data.schedule
  const weekday=new Date(today+'T12:00:00Z').getUTCDay()||7
  const rows=[{name:'长课（合成）',weekday,startTime:'08:30',endTime:'11:55',weeks:[1],room:'合成A'},
    {name:'短课（合成）',weekday,startTime:'10:20',endTime:'11:05',weeks:[1],room:'合成B'}]
  const changed=await fixture.adapter({url:'/api/timetable/courses',method:'put',data:{...saved,courses:rows}})
  fixture.advanceTo('14:02')
  const read=query=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:query})
  const query=scheduleQuery(today,today,{selection:'PREVIOUS'})
  assert.equal((await readPrivateScheduleQuery(query,null,read)).display.entries[0].name,'长课（合成）')
  await fixture.adapter({url:'/api/timetable/courses',method:'put',data:{...changed.data.schedule,courses:[rows[0],{...rows[1],endTime:'11:55'}]}})
  const tied=await readPrivateScheduleQuery(query,null,read)
  assert.equal(tied.count,2);assert.equal(tied.focus,null)
})

test('DEV normal cancellation receipt leads to an exclusion explanation without broadcasting its private reason', { timeout:6000 }, async()=>{
  const fixture=createTeachingFlowFixture(),today=chinaDate()
  fixture.setActor(1)
  const root='/api/admin/teaching/lesson-changes',state={}
  const call=(path,method,data,signal,params)=>fixture.adapter({url:root+path,method,data,signal,params})
  const resource=createLessonChangeResource({owner:()=> 'synthetic-admin',actorId:()=>1,state,
    readAccess:s=>call('/access','get',undefined,s),readPage:(q,s)=>call('/page','get',undefined,s,q),
    readTarget:(id,s)=>call('/target/'+id,'get',undefined,s),preview:(p,s)=>call('/preview','post',p,s),
    save:(p,s)=>call('','post',p,s),readReceipt:(id,s)=>call('/requests/'+id,'get',undefined,s)})
  assert.equal(await resource.access(),true,state.error)
  assert.equal(await resource.list({from:today,to:today,page:0,size:25,search:'计算机网络'}),true,state.error)
  assert.equal(await resource.select(state.page.items[0].lessonId),true,state.error)
  assert.equal(await resource.prepare({action:'CANCEL',reason:'合成管理员内部取消依据'},crypto.randomUUID()),true,state.error)
  assert.equal(await resource.execute(),true,state.error)
  fixture.setActor(2)
  const result=await readPrivateScheduleQuery(scheduleQuery(today),null,q=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:q}))
  assert.equal(result.count,1)
  assert.match(result.display.notices.join(''),/1项.*取消或待核对/)
  assert.ok(!JSON.stringify(result).includes('合成管理员内部取消依据'))
})
