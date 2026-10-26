import test from 'node:test'
import assert from 'node:assert/strict'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { validatedUnifiedWeek } from '../src/utils/unifiedTimetable.js'
import { addDays,chinaDate,mondayOf } from '../src/utils/timetable.js'
const opts={timeout:3000}
const api=async(f,url,params={},method='get',data)=> (await f.adapter({url,params,method,data})).data
test('DEV attention matches the real backend today-only rule rather than labeling an old unmarked course as today',opts,async()=>{
  const f=createTeachingFlowFixture(),monday=addDays(mondayOf(chinaDate()),-7);f.setActor(1)
  await api(f,'/api/admin/teaching/courses',{},'post',{id:crypto.randomUUID(),classId:'10000000-0000-4000-8000-000000000010',teacherId:4,name:'旧周模拟未点名',semester:'模拟学期',firstMonday:monday,weekday:1,startTime:'08:30',endTime:'10:05',weeks:[1],room:'模拟教室'})
  f.setActor(4);const old=await api(f,'/api/timetable/unified',{view:'TEACHER',monday});assert.equal(old.attention,null);assert.equal(old.summary.attendance.unknown,3)
  const current=await api(f,'/api/timetable/unified',{view:'TEACHER'});if(current.attention)assert.equal(current.attention.date,current.today)
})
test('separate simulated principals receive their own backend-authorized scopes',opts,async()=>{
  const f=createTeachingFlowFixture()
  const expected=[[2,'STUDENT',1],[4,'TEACHER',2],[5,'COUNSELOR',1],[6,'SECRETARY',2],[8,'STUDENT',1]]
  for(const [actor,role,count] of expected){f.setActor(actor);const w=validatedUnifiedWeek(await api(f,'/api/timetable/unified'));assert.equal(w.view,role);assert.equal(w.entries.filter(e=>e.lessonId).length,count)}
  f.setActor(2);await assert.rejects(()=>api(f,'/api/timetable/unified',{view:'SECRETARY'}),e=>e.response.status===403)
})
test('personal and teaching exact rows merge but private saved inputs remain',opts,async()=>{
  const f=createTeachingFlowFixture(), before=await api(f,'/api/timetable/courses'),w=validatedUnifiedWeek(await api(f,'/api/timetable/unified'))
  assert.equal(w.summary.mergedDuplicates,1);assert.equal(w.entries.length,2);assert.deepEqual(w.entries.find(e=>e.lessonId).sources,['PERSONAL','TEACHING']);assert.deepEqual(await api(f,'/api/timetable/courses'),before)
})
test('hour and five-minute dispatch are idempotent and notices/read status are private',opts,async()=>{
  const f=createTeachingFlowFixture(), student=await api(f,'/api/teaching/notices');assert.equal(student.length,1)
  f.setActor(4);assert.equal((await api(f,'/api/teaching/notices')).length,0);assert.equal(f.advanceTo('13:55'),1);assert.equal(f.advanceTo('13:55'),0)
  const teacher=await api(f,'/api/teaching/notices');assert.equal(teacher[0].kind,'TEACHER_ROSTER')
  f.setActor(2);await assert.rejects(()=>api(f,`/api/teaching/notices/${teacher[0].id}/read`,{},'post'),e=>e.response.status===404)
  await api(f,`/api/teaching/notices/${student[0].id}/read`,{},'post');assert.ok((await api(f,'/api/teaching/notices'))[0].readAt)
  f.setActor(5);assert.deepEqual(await api(f,'/api/teaching/notices'),[])
})
test('teacher roster save correction and leadership statistics form a full synthetic lifecycle',opts,async()=>{
  const f=createTeachingFlowFixture();f.setActor(4);const w=await api(f,'/api/timetable/unified'), c=w.entries.find(e=>e.startTime==='14:00')
  const url=`/api/teaching/lessons/${c.id}`, detail=await api(f,url,{view:'TEACHER'})
  const input={revision:0,marks:detail.entries.map(e=>({studentId:e.studentId,status:'ON_TIME'})),reason:'',finish:true}
  await assert.rejects(()=>api(f,url+'/attendance',{},'put',input),e=>e.response.status===409)
  f.advanceTo('13:55');await api(f,url+'/attendance',{},'put',input)
  f.advanceTo('14:02');input.revision=1;input.marks[0].status='LATE'
  await assert.rejects(()=>api(f,url+'/attendance',{},'put',input),e=>e.response.status===400)
  input.reason='核对后补记迟到';const changed=await api(f,url+'/attendance',{},'put',input);assert.equal(changed.lesson.counts.late,1);assert.equal(changed.lesson.finalized,true);assert.equal(f.audit().length,4)
  f.setActor(2);const self=await api(f,url,{view:'STUDENT'});assert.equal(self.entries.length,1);assert.equal(self.entries[0].status,'LATE')
  for(const actor of [5,6]){f.setActor(actor);const result=await api(f,'/api/timetable/unified');assert.equal(result.summary.attendance.late,1);await assert.rejects(()=>api(f,url+'/attendance',{},'put',input),e=>[403,404].includes(e.response.status))}
})
test('reasoned return to unknown reopens completion; noop does not increment or add fake audit',opts,async()=>{
  const f=createTeachingFlowFixture();f.setActor(4);f.advanceTo('14:02')
  const course=(await api(f,'/api/timetable/unified')).entries.find(e=>e.startTime==='14:00'),url=`/api/teaching/lessons/${course.id}`
  const original=await api(f,url,{view:'TEACHER'}), payload={revision:0,marks:original.entries.map(e=>({studentId:e.studentId,status:'ON_TIME'})),reason:'',finish:true}
  const done=await api(f,url+'/attendance',{},'put',payload);assert.equal(done.lesson.finalized,true);assert.equal(done.lesson.revision,1)
  payload.revision=1;const unchanged=await api(f,url+'/attendance',{},'put',payload);assert.equal(unchanged.lesson.revision,1);assert.equal(f.audit().length,3)
  payload.marks[0].status='UNKNOWN';payload.finish=false
  await assert.rejects(()=>api(f,url+'/attendance',{},'put',payload),e=>e.response.status===400)
  payload.reason='原记录需要重新核对';const pending=await api(f,url+'/attendance',{},'put',payload);assert.equal(pending.lesson.finalized,false);assert.equal(pending.lesson.counts.unknown,1);assert.equal(pending.lesson.counts.absent,0);assert.equal(pending.lesson.revision,2)
  const own=(await api(f,url,{view:'TEACHER'})).entries[0];assert.equal(own.status,'UNKNOWN');assert.equal(f.audit().length,4)
})
test('simulated unknown periods stay in the private list and never invent clock times or a complete grid',opts,async()=>{
  const f=createTeachingFlowFixture(),original=(await api(f,'/api/timetable/courses')).schedule
  const unknown={name:'未配置的晚课（模拟）',weekday:original.courses[0].weekday,startPeriod:9,endPeriod:10,weeks:[1],room:'模拟教室'}
  await api(f,'/api/timetable/courses',{},'put',{...original,courses:[...original.courses,unknown]})
  const w=validatedUnifiedWeek(await api(f,'/api/timetable/unified')),row=w.entries.find(e=>e.name===unknown.name)
  assert.equal(w.gridSafe,false);assert.equal(row.startTime,null);assert.equal(row.endTime,null);assert.equal(row.startPeriod,9);assert.match(row.timeLabel,/钟点待配置/)
  assert.equal((await api(f,'/api/timetable/courses')).schedule.courses.length,3)
})
test('simulated explicit off-slot clock times are preserved without a partial whole-week grid',opts,async()=>{
  const f=createTeachingFlowFixture(),original=(await api(f,'/api/timetable/courses')).schedule
  const special={name:'特殊钟点课程（模拟）',weekday:original.courses[0].weekday,startTime:'10:10',endTime:'10:15',startPeriod:null,endPeriod:null,weeks:[1],room:'模拟教室'}
  await api(f,'/api/timetable/courses',{},'put',{...original,courses:[...original.courses,special]})
  const w=validatedUnifiedWeek(await api(f,'/api/timetable/unified')),row=w.entries.find(e=>e.name===special.name)
  assert.equal(w.gridSafe,false);assert.equal(row.startTime,'10:10');assert.equal(row.endTime,'10:15');assert.equal(row.startPeriod,null);assert.equal(row.endPeriod,null)
})
test('simulated uploaded week coverage follows the selected semester week rather than only the first week',opts,async()=>{
  const f=createTeachingFlowFixture(),original=(await api(f,'/api/timetable/courses')).schedule
  const later={name:'第三周个人课程（模拟）',weekday:original.courses[0].weekday,startPeriod:1,endPeriod:2,weeks:[3],room:'模拟教室'}
  await api(f,'/api/timetable/courses',{},'put',{...original,courses:[later]})
  assert.equal((await api(f,'/api/timetable/unified')).entries.some(e=>e.name===later.name),false)
  const monday=addDays(original.firstMonday,14),w=validatedUnifiedWeek(await api(f,'/api/timetable/unified',{monday,view:'STUDENT'}))
  assert.equal(w.entries.length,1);assert.equal(w.entries[0].name,later.name);assert.equal(w.entries[0].date,addDays(monday,later.weekday-1));assert.equal(w.gridSafe,true)
})
