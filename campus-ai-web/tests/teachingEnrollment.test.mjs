import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parse,compileScript,compileTemplate } from '@vue/compiler-sfc'
import { validatedRosterMembers,validatedCourseRoster,createEnrollmentResource } from '../src/utils/teachingEnrollment.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { mondayOf,chinaDate } from '../src/utils/timetable.js'
const opts={timeout:3000},id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const member={studentId:id(2),studentNumber:'synthetic-2',name:'模拟同学',adminClassId:id(3),college:'合成学院',active:true}
const roster={courseId:id(1),groupName:'合成选修组',revision:0,members:[member],target:{name:'合成选修',semester:'合成学期',teacher:'模拟教师',weekday:4,startTime:'14:00',endTime:'15:35',room:'合成教室'}}
function setup(overrides={}){let owner='admin-a';const state={},resource=createEnrollmentResource({owner:()=>owner,state,read:async()=>({data:roster}),write:async()=>({data:{id:id(1),studentId:id(2),revision:1}}),...overrides});resource.reset();return {state,resource,owner:v=>{owner=v;resource.reset()}}}
const api=async(f,url,params={},method='get',data)=> (await f.adapter({url,params,method,data})).data
test('roster reads reject duplicate students partial scope and over-limit arrays without dropping rows',opts,()=>{
  assert.equal(validatedCourseRoster(roster,id(1)).members.length,1)
  for(const value of [{...roster,members:[member,member]},{...roster,members:[{...member,adminClassId:''}]},{...roster,revision:-1},{...roster,courseId:id(9)}])assert.throws(()=>validatedCourseRoster(value,id(1)))
  const rows=[{id:id(2),name:'模拟同学',studentNumber:'synthetic-2',phone:'ignored'}];assert.deepEqual(Object.keys(validatedRosterMembers(rows)[0]),['id','name','studentNumber']);assert.throws(()=>validatedRosterMembers(Array(301).fill(rows[0])))
})
test('late course/account responses cannot cross target or principal',opts,async()=>{
  let resolve;const wait=new Promise(r=>resolve=r),s=setup({read:()=>wait});const pending=s.resource.load(id(1));s.owner('admin-b');resolve({data:roster});assert.equal(await pending,false);assert.equal(s.state.roster,null)
})
test('invalid acknowledgement blocks another write until a fresh roster has been checked',opts,async()=>{
  let calls=0;const s=setup({write:async()=>{calls++;return {data:{id:id(9),studentId:id(2),revision:1}}}});await s.resource.load(id(1));assert.equal(await s.resource.withdraw(id(2),'合成核验'),false);assert.equal(s.state.uncertain,true);assert.equal(s.state.notice,'');await s.resource.withdraw(id(2),'再次提交');assert.equal(calls,1);assert.ok(s.state.roster.members[0].active)
})
test('verified save with failed refresh reports saved and prohibits automatic duplicate submissions',opts,async()=>{
  let reads=0,writes=0;const s=setup({read:async()=>{if(reads++)throw new Error('503');return {data:roster}},write:async()=>{writes++;return {data:{id:id(1),studentId:id(2),revision:1}}}});await s.resource.load(id(1));assert.equal(await s.resource.withdraw(id(2),'已核对'),false);assert.match(s.state.notice,/已保存/);assert.match(s.state.error,/不要重复提交/);await s.resource.withdraw(id(2),'重复');assert.equal(writes,1)
})
test('normal verified withdrawal replaces roster only after inactive membership is re-read',opts,async()=>{
  let reads=0;const s=setup({read:async()=>({data:reads++?{...roster,revision:1,members:[{...member,active:false}]}:roster})});await s.resource.load(id(1));assert.equal(await s.resource.withdraw(id(2),'核对退课'),true);assert.equal(s.state.roster.revision,1);assert.equal(s.state.roster.members[0].active,false);assert.equal(s.state.uncertain,false)
})
test('new enrollment components compile and use direct private APIs confirmations version fences and drafts',opts,()=>{
  for(const name of ['TeachingRosterPicker','TeachingWithdrawalPanel']){const source=fs.readFileSync(new URL(`../src/components/${name}.vue`,import.meta.url),'utf8'),{descriptor,errors}=parse(source);assert.deepEqual(errors,[]);compileScript(descriptor,{id:name});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:name,id:name}).errors,[]);assert.doesNotMatch(source,/localStorage|sendMessageStream|cookie/i)}
  const parent=fs.readFileSync(new URL('../src/components/AdminTeachingPanel.vue',import.meta.url),'utf8');assert.match(parent,/rosterStudents.value.map\(m=>m.id\)/);assert.match(parent,/fingerprint!==courseKey\(\)/)
})
test('simulated create changes semester lessons private scope reminders roster and withdrawal rather than returning fixed success',opts,async()=>{
  const f=createTeachingFlowFixture();f.setActor(1)
  const options=await api(f,'/api/admin/teaching/scopes/page',{kind:'CLASS',size:25,page:0}),a=options.items[0].value,b=options.items[2].value
  const rowsA=await api(f,`/api/admin/teaching/classes/${a}/members`),rowsB=await api(f,`/api/admin/teaching/classes/${b}/members`),courseId=id(100)
  const data={course:{id:courseId,classId:a,teacherId:4,name:'合成跨院选修',semester:'合成学期',firstMonday:mondayOf(chinaDate()),weekday:new Date(chinaDate()+'T12:00:00Z').getUTCDay() || 7,startTime:'14:00',endTime:'15:35',weeks:[1,2],room:'合成教学室'},groupName:'合成跨院选修组',studentIds:[rowsA[0].id,rowsB[0].id]}
  assert.equal((await api(f,'/api/admin/teaching/courses/roster',{},'post',data)).id,courseId)
  assert.equal((await api(f,'/api/admin/teaching/courses/roster',{},'post',data)).id,courseId)
  let saved=validatedCourseRoster(await api(f,`/api/admin/teaching/courses/${courseId}/roster`),courseId);assert.equal(saved.members.length,2)
  const coursePage=await api(f,'/api/admin/teaching/scopes/page',{kind:'COURSE',size:25,page:0,search:'合成跨院选修'});assert.equal(coursePage.total,1)
  f.setActor(5);const leader=await api(f,'/api/teaching/lessons',{view:'COUNSELOR',from:chinaDate(),to:chinaDate()});assert.equal(leader.find(l=>l.course==='合成跨院选修').counts.unknown,1)
  f.setActor(8);assert.ok((await api(f,'/api/teaching/lessons',{view:'STUDENT',from:chinaDate(),to:chinaDate()})).some(l=>l.course==='合成跨院选修'));assert.ok((await api(f,'/api/teaching/notices')).some(n=>n.course==='合成跨院选修'))
  f.setActor(1);await api(f,`/api/admin/teaching/courses/${courseId}/members/${rowsB[0].id}/withdraw`,{},'post',{revision:0,reason:'合成核验'})
  saved=await api(f,`/api/admin/teaching/courses/${courseId}/roster`);assert.equal(saved.revision,1);assert.equal(saved.members.find(m=>m.studentId===rowsB[0].id).active,false)
  f.setActor(8);assert.ok(!(await api(f,'/api/teaching/notices')).some(n=>n.course==='合成跨院选修'))
  await assert.rejects(()=>api(f,`/api/admin/teaching/courses/${courseId}/roster`),e=>e.response.status===403)
})
