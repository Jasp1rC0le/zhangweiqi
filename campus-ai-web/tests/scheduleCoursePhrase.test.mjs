import test from 'node:test'
import assert from 'node:assert/strict'
import {planScheduleQuestion,scheduleQuery} from '../src/utils/scheduleIntent.js'
import {readPrivateScheduleQuery,previousScheduleQuery} from '../src/utils/scheduleChat.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate,dayNumber,mondayOf} from '../src/utils/timetable.js'

const opts={timeout:5000},today='2026-10-20',scope='synthetic-course-owner'
const ask=(text,previous=null)=>planScheduleQuestion(text,{today,previous,scope})
test('unquoted course spans preserve grammar-like characters inside the actual entity',opts,()=>{
  for(const name of ['课程设计','数学课','大学课程论','时间管理','教师职业伦理','公共关系的艺术','现在的世界']){
    assert.deepEqual(ask(`今天${name}在哪上`),scheduleQuery(today,today,{course:name,detail:'LOCATION'}),name)
    assert.equal(ask(`请帮我查明天${name}谁教`).course,name)
    assert.equal(ask(`这周${name}什么时候上课`).course,name)
  }
  assert.equal(ask('今天的课程设计在哪上').course,'课程设计')
  assert.equal(ask('课程设计今天在哪上').course,'课程设计')
  assert.equal(ask('课表里有没有课程设计').pendingSchedule.course,'课程设计')
  assert.equal(ask('今天课程设计').course,'课程设计')
  assert.equal(ask('今天有没有课程设计').course,'课程设计')
  assert.equal(ask('这周课程设计有几节').course,'课程设计')
  assert.equal(ask('这周课程设计有几节').detail,'PERIODS')
})
test('preserving entity spans does not turn generic or public sentences into course names',opts,()=>{
  for(const text of ['今天课程安排','今天有什么课','今天我需要去哪个教室上课','我明天是什么老师上课','今天的课什么时候下'])
    assert.equal(ask(text).course,undefined,text)
  for(const text of ['帮我讲解课程设计的知识点','图书馆的开放时间','课程设计怎么做','明天会下雨吗'])
    assert.equal(ask(text),null,text)
  assert.equal(ask('明天《谁的历史》在哪上').course,'谁的历史')
  assert.equal(ask('今天'+ '课程'.repeat(60)+'在哪上')?.course,undefined,'overlong entities are not shortened into another course')
})
test('same-owner course followups preserve the full name and source perspective',opts,()=>{
  const first=ask('我作为学生今天课程设计在哪上')
  assert.equal(first.course,'课程设计');assert.equal(first.perspective,'STUDENT')
  const messages=[{role:'user',localSchedule:true},{role:'assistant',localSchedule:true,scheduleQuery:{...first,scope}}]
  const previous=previousScheduleQuery(messages,scope)
  assert.equal(ask('明天呢',previous).course,'课程设计')
  assert.equal(ask('明天呢',previous).perspective,'STUDENT')
  assert.equal(previousScheduleQuery(messages,'other-owner'),null)
})
test('normal DEV save/read resolves the full title ahead of a separate shorter saved course',opts,async()=>{
  const fixture=createTeachingFlowFixture(),day=chinaDate()
  const snapshot=(await fixture.adapter({url:'/api/timetable/courses',method:'get'})).data.schedule
  const pair=[
    {name:'课程设计',room:'合成正确教室A',startTime:'16:40',endTime:'17:25'},
    {name:'设计',room:'合成对照教室B',startTime:'15:50',endTime:'16:35'},
  ]
  const week=1+Math.floor((dayNumber(day)-dayNumber(snapshot.firstMonday))/7)
  const courses=pair.map(row=>({...row,weekday:dayNumber(day)-dayNumber(mondayOf(day))+1,weeks:[week]}))
  await fixture.adapter({url:'/api/timetable/courses',method:'put',data:{...snapshot,courses:[...snapshot.courses,...courses]}})
  const read=q=>fixture.adapter({url:'/api/timetable/unified/query',method:'get',params:q})
  for(const name of ['课程设计','设计']){
    const query=planScheduleQuestion(`今天${name}在哪上`,{today:day,scope})
    const result=await readPrivateScheduleQuery(query,null,read)
    assert.equal(result.count,1);assert.equal(result.display.entries[0].name,name)
    assert.equal(result.display.entries[0].room,pair.find(row=>row.name===name).room)
  }
  fixture.setActor(8)
  const other=await readPrivateScheduleQuery(scheduleQuery(day,day,{course:'课程设计'}),null,read)
  assert.equal(other.count,0)
  assert.ok(other.refinement.courseChoices.every(name=>!pair.some(row=>row.name===name)))
})
