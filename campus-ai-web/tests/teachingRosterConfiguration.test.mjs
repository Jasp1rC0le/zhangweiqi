import test from 'node:test'
import assert from 'node:assert/strict'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { parseRosterFile } from '../src/utils/rosterImport.js'
import { mondayOf } from '../src/utils/timetable.js'
const opts={timeout:3000},api=async(f,url,method='get',data,params={})=>(await f.adapter({url,method,data,params})).data
const input=()=>({id:crypto.randomUUID(),college:'验收模拟学院',name:'验收模拟班十七',members:[{studentNumber:'DEMO-20261017-01',name:'导入模拟同学甲',userId:null},{studentNumber:'DEMO-20261017-02',name:'导入模拟同学乙',userId:null}]})
test('synthetic CSV parse -> idempotent class -> explicit account -> course -> four-role read and reminder is real in-memory state',opts,async()=>{
  const f=createTeachingFlowFixture();f.setActor(1)
  const csv='班级,学号,姓名\n验收模拟班十七,DEMO-20261017-01,导入模拟同学甲\n验收模拟班十七,DEMO-20261017-02,导入模拟同学乙\n'
  const parsed=parseRosterFile(new TextEncoder().encode(csv),'csv'),data={...input(),members:parsed.classes[0].members}
  const first=await api(f,'/api/admin/teaching/classes','post',data);assert.equal(first.id,data.id)
  await api(f,'/api/admin/teaching/classes','post',data)
  const members=await api(f,`/api/admin/teaching/classes/${data.id}/members`);assert.equal(members.length,2);assert.ok(members.every(m=>m.userId===null))
  await api(f,`/api/admin/teaching/members/${members[0].id}/account`,'put',{userId:10,expectedUserId:null})
  const date=f.clock().slice(0,10),weekday=new Date(date+'T12:00:00Z').getUTCDay()||7
  const course={id:crypto.randomUUID(),classId:data.id,teacherId:4,name:'导入闭环课程（模拟）',semester:'验收模拟学期',firstMonday:mondayOf(date),weekday,startTime:'16:40',endTime:'17:25',weeks:[1],room:'模拟教室C'}
  await api(f,'/api/admin/teaching/courses','post',course)
  for(const grant of [{userId:5,viewRole:'COUNSELOR',scopeKey:data.id},{userId:6,viewRole:'SECRETARY',scopeKey:data.college}])await api(f,'/api/admin/teaching/grants','post',grant)
  f.advanceTo('15:40');f.setActor(10)
  const own=await api(f,'/api/timetable/unified'),lesson=own.entries.find(e=>e.name===course.name);assert.ok(lesson)
  assert.equal((await api(f,'/api/teaching/notices')).filter(n=>n.course===course.name).length,1)
  for(const [actor,view,count] of [[10,'STUDENT',1],[4,'TEACHER',2],[5,'COUNSELOR',2],[6,'SECRETARY',2]]){
    f.setActor(actor);assert.equal((await api(f,`/api/teaching/lessons/${lesson.lessonId}`,'get',null,{view})).entries.length,count)
  }
})
test('class mutation validates the complete batch and refuses duplicate school identity without partial rows',opts,async()=>{
  const f=createTeachingFlowFixture();f.setActor(1);const first=input();await api(f,'/api/admin/teaching/classes','post',first)
  for(const next of [{...first,name:'不同内容'},{...input(),name:'另一班',members:[{studentNumber:first.members[0].studentNumber,name:'重复学号',userId:null}]},{...input(),name:'另一班',members:[{studentNumber:'new-id',name:'重复账号',userId:2}]}])await assert.rejects(()=>api(f,'/api/admin/teaching/classes','post',next),e=>e.response.status===409)
  const bad={...input(),name:'不得部分保存',members:[{studentNumber:'new-number',name:'合法行',userId:null},{studentNumber:'',name:'非法行',userId:null}]}
  await assert.rejects(()=>api(f,'/api/admin/teaching/classes','post',bad),e=>e.response.status===400)
  const page=await api(f,'/api/admin/teaching/scopes/page','get',null,{kind:'CLASS',page:0,size:25});assert.equal(page.total,4);assert.equal(page.items.some(b=>b.label===bad.name),false)
})
test('same names never auto-bind, per-admin-class cap stays300, and unauthenticated mock role cannot import',opts,async()=>{
  const f=createTeachingFlowFixture(),data=input();f.setActor(2)
  await assert.rejects(()=>api(f,'/api/admin/teaching/classes','post',data),e=>e.response.status===403)
  f.setActor(1);data.members[0].name='申请教师（模拟）';await api(f,'/api/admin/teaching/classes','post',data)
  assert.equal((await api(f,`/api/admin/teaching/classes/${data.id}/members`))[0].userId,null)
  await assert.rejects(()=>api(f,'/api/admin/teaching/classes','post',{...input(),name:'超限班',members:Array.from({length:301},(_,i)=>({studentNumber:'x'+i,name:'模拟',userId:null}))}),e=>e.response.status===400)
})
