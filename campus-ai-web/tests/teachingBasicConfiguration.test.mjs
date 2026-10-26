import test from 'node:test'
import assert from 'node:assert/strict'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
const options={timeout:3000}
const api=async(f,url,method='get',data,params={})=>(await f.adapter({url,method,data,params})).data
const admin=f=>f.setActor(1)
async function firstClass(f){admin(f);return(await api(f,'/api/admin/teaching/scopes/page','get',null,{kind:'CLASS',page:0,size:25})).items[0].value}
test('simulated binding changes who can see a lesson and receive reminders; private imports and immutable marks do not transfer',options,async()=>{
  const f=createTeachingFlowFixture(),classId=await firstClass(f),members=await api(f,`/api/admin/teaching/classes/${classId}/members`),student=members.find(m=>m.userId===2)
  f.setActor(2);const original=await api(f,'/api/timetable/unified'),lesson=original.entries.find(e=>e.lessonId).lessonId,notice=(await api(f,'/api/teaching/notices'))[0]
  await api(f,`/api/teaching/notices/${notice.id}/read`,'post');admin(f)
  await api(f,`/api/admin/teaching/members/${student.id}/account`,'put',{userId:10,expectedUserId:2})
  f.setActor(2);assert.equal((await api(f,'/api/timetable/unified')).entries.filter(e=>e.lessonId).length,0)
  assert.equal((await api(f,'/api/timetable/courses')).schedule.courses.length,2);assert.equal((await api(f,'/api/teaching/notices')).length,0)
  f.setActor(10);assert.equal((await api(f,`/api/teaching/lessons/${lesson}`,'get',null,{view:'STUDENT'})).entries.length,1)
  assert.equal((await api(f,'/api/timetable/courses')).schedule,null);assert.equal((await api(f,'/api/teaching/notices')).length,1)
  assert.equal((await api(f,'/api/teaching/access')).views.includes('TEACHER'),false)
  admin(f);await api(f,`/api/admin/teaching/members/${student.id}/account`,'put',{userId:2,expectedUserId:10})
  f.setActor(2);const again=(await api(f,'/api/teaching/notices'))[0];assert.equal(again.id,notice.id);assert.equal(again.readAt,new Date(f.clock()).toISOString())
  assert.equal(f.audit().filter(e=>e.action==='BIND').length,2);assert.equal(f.audit().filter(e=>e.old).length,0)
})
test('binding rejects stale target, duplicated account, unknown account and non-admin, with a true no-op',options,async()=>{
  const f=createTeachingFlowFixture(),classId=await firstClass(f),members=await api(f,`/api/admin/teaching/classes/${classId}/members`),student=members.find(m=>m.userId===2)
  const url=`/api/admin/teaching/members/${student.id}/account`
  await assert.rejects(()=>api(f,url,'put',{userId:10,expectedUserId:null}),e=>e.response.status===409)
  await assert.rejects(()=>api(f,url,'put',{userId:8,expectedUserId:2}),e=>e.response.status===409)
  await assert.rejects(()=>api(f,url,'put',{userId:999,expectedUserId:2}),e=>e.response.status===400)
  await api(f,url,'put',{userId:2,expectedUserId:2});assert.equal(f.audit().length,0)
  f.setActor(2);await assert.rejects(()=>api(f,url,'put',{userId:10,expectedUserId:2}),e=>e.response.status===403)
  admin(f);assert.equal((await api(f,`/api/admin/teaching/classes/${classId}/members`)).find(m=>m.id===student.id).userId,2)
})
test('binding audit is a real simulated event and survives unlink with absent historical class claims',options,async()=>{
  const f=createTeachingFlowFixture(),classId=await firstClass(f),student=(await api(f,`/api/admin/teaching/classes/${classId}/members`)).find(m=>m.userId===2)
  await api(f,`/api/admin/teaching/members/${student.id}/account`,'put',{userId:null,expectedUserId:2})
  const from=f.clock().slice(0,10),page=await api(f,'/api/admin/teaching/operations/audit/page','get',null,{kind:'ACCOUNT_BINDING',from,to:from,page:0,size:25})
  assert.equal(page.total,1);assert.equal(page.items[0].beforeValue,'2');assert.equal(page.items[0].afterValue,'未绑定')
  assert.match(page.items[0].historyNote,/未保存当时行政班/)
})
test('normal simulated admin can add/revoke counselor scope; new scope affects counts, not platform roles',options,async()=>{
  const f=createTeachingFlowFixture();f.setActor(5);const before=await api(f,'/api/timetable/unified','get',null,{view:'COUNSELOR'})
  admin(f);const classes=(await api(f,'/api/admin/teaching/scopes/page','get',null,{kind:'CLASS',page:0,size:25})).items
  const target=classes.find(c=>!before.classes.some(b=>b.id===c.value)).value,grant={userId:5,viewRole:'COUNSELOR',scopeKey:target}
  await api(f,'/api/admin/teaching/grants','post',grant);await api(f,'/api/admin/teaching/grants','post',grant)
  f.setActor(5);const after=await api(f,'/api/timetable/unified','get',null,{view:'COUNSELOR'});assert.equal(after.classes.length,before.classes.length+1);assert.equal(f.principal().role,'STUDENT')
  admin(f);await api(f,'/api/admin/teaching/grants/revoke','post',grant)
  f.setActor(5);assert.equal((await api(f,'/api/timetable/unified','get',null,{view:'COUNSELOR'})).classes.length,before.classes.length)
})
test('secretary scope can explicitly cover another college, but unapproved identity or invalid scope cannot',options,async()=>{
  const f=createTeachingFlowFixture();f.setActor(6);const before=await api(f,'/api/timetable/unified','get',null,{view:'SECRETARY'})
  admin(f);const grant={userId:6,viewRole:'SECRETARY',scopeKey:'示例学院乙'}
  await api(f,'/api/admin/teaching/grants','post',grant);f.setActor(6)
  assert.ok((await api(f,'/api/timetable/unified','get',null,{view:'SECRETARY'})).classes.length>before.classes.length)
  admin(f);await assert.rejects(()=>api(f,'/api/admin/teaching/grants','post',{userId:10,viewRole:'SECRETARY',scopeKey:'示例学院乙'}),e=>e.response.status===403)
  await assert.rejects(()=>api(f,'/api/admin/teaching/grants','post',{userId:6,viewRole:'SECRETARY',scopeKey:'不存在学院'}),e=>e.response.status===400)
  f.setActor(2);await assert.rejects(()=>api(f,'/api/admin/teaching/grants','post',grant),e=>e.response.status===403)
})
test('late or aborted simulated writes cannot borrow a subsequently selected admin actor',options,async()=>{
  const f=createTeachingFlowFixture(),classId=await firstClass(f),member=(await api(f,`/api/admin/teaching/classes/${classId}/members`)).find(m=>m.userId===2)
  f.setActor(2);const old=api(f,`/api/admin/teaching/members/${member.id}/account`,'put',{userId:10,expectedUserId:2});admin(f)
  await assert.rejects(()=>old,e=>e.response.status===409)
  const controller=new AbortController();controller.abort()
  await assert.rejects(()=>f.adapter({url:`/api/admin/teaching/members/${member.id}/account`,method:'put',data:{userId:10,expectedUserId:2},signal:controller.signal}),e=>e.response.status===409)
  assert.equal(f.audit().length,0);assert.equal((await api(f,`/api/admin/teaching/classes/${classId}/members`)).find(m=>m.id===member.id).userId,2)
})
