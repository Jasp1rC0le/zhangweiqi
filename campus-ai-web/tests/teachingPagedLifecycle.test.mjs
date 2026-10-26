import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse,compileScript,compileTemplate } from '@vue/compiler-sfc'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { createTeachingResource,validatedDetailPage } from '../src/utils/teaching.js'
import { createEnrollmentResource,validatedCourseRosterPage } from '../src/utils/teachingEnrollment.js'
import { chinaDate } from '../src/utils/timetable.js'
const options={timeout:5000},api=(f,url,params={},method='get',data)=>f.adapter({url,params,method,data}),uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
test('702 synthetic members traverse bounded point-name pages; whole-class completion is enforced',options,async()=>{
  const f=createTeachingFlowFixture({largeClass:true});f.setActor(4);f.advanceTo('14:02');const id=uid(79000),seen=new Set();let version=0
  await assert.rejects(api(f,`/api/teaching/lessons/${id}`,{view:'TEACHER'}),e=>e.response.status===400)
  for(let page=0;page<15;page++){
    const response=(await api(f,`/api/teaching/lessons/${id}/page`,{view:'TEACHER',page,size:50,search:''})).data
    validatedDetailPage(response,id,page);assert.equal(response.total,702)
    const marks=response.detail.entries.map(e=>{assert.equal(seen.has(e.studentId),false);seen.add(e.studentId);return{studentId:e.studentId,status:'ON_TIME'}})
    const payload={revision:version,marks,reason:'',finish:page===14}
    if(page===0)await assert.rejects(api(f,`/api/teaching/lessons/${id}/attendance/page`,{page,size:50,search:''},'put',{...payload,finish:true}),e=>e.response.status===400)
    const result=(await api(f,`/api/teaching/lessons/${id}/attendance/page`,{page,size:50,search:''},'put',payload)).data
    version=result.detail.lesson.revision;assert.equal(result.detail.lesson.counts.unknown,702-seen.size)
  }
  assert.equal(seen.size,702);f.setActor(6);const scoped=(await api(f,`/api/teaching/lessons/${id}/page`,{view:'SECRETARY',page:0,size:50,search:''})).data;assert.equal(scoped.total,234)
  f.setActor(1);const roster=(await api(f,`/api/admin/teaching/courses/${id}/roster/page`,{page:28,size:25,search:'',activeOnly:false})).data;validatedCourseRosterPage(roster,id,28);assert.equal(roster.roster.members.length,2)
})
test('paged resource fences old accounts, wrong pages and failed saved refresh',options,async()=>{
  const f=createTeachingFlowFixture({largeClass:true});f.setActor(4);f.advanceTo('14:02');let owner='a',resolve
  const state={},resource=createTeachingResource({owner:()=>owner,state,readDetailPage:()=>new Promise(r=>resolve=r)})
  const pending=resource.select(uid(79000),'TEACHER');owner='b';resource.reset();resolve(await api(f,`/api/teaching/lessons/${uid(79000)}/page`,{view:'TEACHER',page:0,size:50,search:''}));await pending;assert.equal(state.detail,null)
  f.setActor(1);const id=uid(79000),s={},enroll=createEnrollmentResource({owner:()=>owner,state:s,readPage:(id,page,search)=>api(f,`/api/admin/teaching/courses/${id}/roster/page`,{page,size:25,search,activeOnly:false}),readMember:()=>{throw new Error('synthetic read failure')},write:(id,student,input)=>api(f,`/api/admin/teaching/courses/${id}/members/${student}/withdraw`,{},'post',input)})
  f.advanceTo('13:00');await enroll.load(id);assert.equal(await enroll.withdraw(s.roster.members[0].studentId,'模拟核验'),false);assert.match(s.notice,/已保存/);assert.equal(s.uncertain,true);assert.match(s.error,/不要重复提交/)
})
test('mock transfer and leaving alter future authorization while past marks and account persist',options,async()=>{
  const f=createTeachingFlowFixture();f.setActor(4);f.advanceTo('14:02');const first=uid(20),student=uid(100)
  await api(f,`/api/teaching/lessons/${first}/attendance/page`,{page:0,size:50,search:''},'put',{revision:0,marks:[{studentId:student,status:'LATE'}],reason:'',finish:false})
  f.setActor(1);const before=(await api(f,`/api/admin/teaching/students/${student}/status`)).data
  // This course has already started: transition must retain its original scope and audit.
  const input={requestId:uid(91000),revision:0,expectedClassId:before.classId,action:'TRANSFER',targetClassId:uid(12),reason:'模拟转班依据'}
  const result=await api(f,`/api/admin/teaching/students/${student}/transition`,{},'post',input);assert.equal(result.data.classId,uid(12));assert.deepEqual(await api(f,`/api/admin/teaching/students/${student}/transition`,{},'post',input),result)
  f.setActor(5);const past=(await api(f,`/api/teaching/lessons/${first}/page`,{view:'COUNSELOR',page:0,size:50,search:''})).data;assert.ok(past.detail.entries.some(e=>e.studentId===student && e.status==='LATE'))
  f.setActor(1);await api(f,`/api/admin/teaching/students/${student}/transition`,{},'post',{...input,requestId:uid(91001),revision:1,expectedClassId:uid(12),action:'LEAVE',targetClassId:null});assert.equal((await api(f,`/api/admin/teaching/students/${student}/status`)).data.status,'LEFT')
  f.setActor(2);assert.equal((await api(f,'/api/auth/me')).data.id,2);assert.ok((await api(f,`/api/teaching/lessons/${first}/page`,{view:'STUDENT',page:0,size:50,search:''})).data.detail.entries.some(e=>e.status==='LATE'))
  assert.equal(chinaDate().length,10)
})
test('new lifecycle form compiles and keeps confirmation account fencing and reasoned direct writes',options,()=>{
  const source=readFileSync(new URL('../src/components/TeachingLifecyclePanel.vue',import.meta.url),'utf8'),{descriptor,errors}=parse(source);assert.deepEqual(errors,[]);compileScript(descriptor,{id:'life'});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:'life',filename:'TeachingLifecyclePanel.vue'}).errors,[])
  assert.match(source,/useScopedConfirmation/);assert.match(source,/owner!==props.owner/);assert.match(source,/uncertain.value=true/);assert.doesNotMatch(source,/localStorage|sendMessageStream|cookie/i)
})
