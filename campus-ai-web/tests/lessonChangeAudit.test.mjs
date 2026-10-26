import test from 'node:test'
import assert from 'node:assert/strict'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { chinaDate, addDays } from '../src/utils/timetable.js'
import { validatedAdministrativeAuditAccess, validatedAdministrativeAuditPage, createAdministrativeAuditResource } from '../src/utils/teachingAdministrativeAudit.js'
const today=chinaDate(),filter={kind:'LESSON_CHANGE',from:today,to:today,search:''},root='/api/admin/teaching/lesson-changes',auditRoot='/api/admin/teaching/operations/audit'
const request=(f,path,method='get',data,params,signal)=>f.adapter({url:path,method,data,params,signal})
async function change(f,action='RESCHEDULE'){
  const page=(await request(f,root+'/page','get',null,{from:today,to:addDays(today,6),page:0,size:25,search:''})).data
  const selected=page.items.find(r=>!r.blockedReason),target=(await request(f,root+'/target/'+selected.lessonId)).data
  const input={requestId:crypto.randomUUID(),lessonId:target.lessonId,revision:target.revision,sourceHash:target.sourceHash,action,reason:'已核对模拟调课依据',previewHash:null,date:null,startTime:null,endTime:null,teacherId:null,room:null}
  if(action==='RESCHEDULE')Object.assign(input,{date:addDays(today,1),startTime:'15:50',endTime:'17:25',teacherId:4,room:'新教室F2-309'})
  input.previewHash=(await request(f,root+'/preview','post',input)).data.fingerprint
  return(await request(f,root,'post',input)).data
}
test('actual course change and cancellation enter the optional seventh audit type with original/new immutable evidence',{timeout:10000},async()=>{
  const f=createTeachingFlowFixture({responsibilities:true});f.setActor(1)
  const access=validatedAdministrativeAuditAccess((await request(f,auditRoot+'/access')).data);assert.equal(access.categories.length,7)
  const saved=await change(f),cancelled=await change(f,'CANCEL')
  const data=validatedAdministrativeAuditPage((await request(f,auditRoot+'/page','get',null,{...filter,page:0,size:25})).data,filter,0)
  assert.equal(data.total,2)
  const row=data.items.find(r=>r.eventId===saved.requestId);assert.equal(row.target,saved.original.name);assert.ok(row.beforeValue.includes(saved.original.teacherLabel));assert.ok(row.afterValue.includes('F2-309'));assert.ok(row.actorName.includes('未保存显示名'));assert.equal(row.affectedLessons,1)
  assert.ok(data.items.find(r=>r.eventId===cancelled.requestId).afterValue.includes('取消这一节'))
  assert.equal((await request(f,auditRoot+'/page','get',null,{...filter,search:'F2-309',page:0,size:25})).data.total,1)
  assert.equal(f.audit().filter(h=>h.action==='LESSON_CHANGE').length,2)
})
test('new category reuses complete CSV preparation, checked bytes and actor fences rather than exporting the visible page',{timeout:10000},async()=>{
  const f=createTeachingFlowFixture({responsibilities:true});f.setActor(1);const saved=await change(f),state={},files=[]
  const r=createAdministrativeAuditResource({scope:()=>String(f.principal().id),state,access:s=>request(f,auditRoot+'/access','get',null,null,s),read:(q,s)=>request(f,auditRoot+'/page','get',null,q,s),prepare:(q,s)=>request(f,auditRoot+'/export-preview','get',null,q,s),download:(p,s)=>request(f,auditRoot+'/export','post',p,null,s),onFile:file=>files.push(file)})
  assert.equal(await r.access(),true);assert.equal(await r.load(filter),true,state.error);assert.equal(await r.prepare(filter),true,state.error);assert.equal(files.length,0)
  assert.equal(await r.download(),true,state.error);assert.equal(files.length,1)
  const csv=await files[0].blob.text();assert.ok(csv.includes(saved.requestId));assert.ok(csv.includes('单次')||csv.includes('LESSON_CHANGE'));assert.ok(csv.includes(saved.original.room));assert.ok(csv.includes('新教室F2-309'));assert.ok(csv.includes('未保存显示名'))
  f.setActor(2);assert.equal(await r.load(filter),false);assert.equal(state.access,null);assert.equal(state.data,null);assert.equal(files.length,1);r.dispose()
})
test('wrong action, oversized snapshots or unknown kinds do not masquerade as checked lesson audit rows',{timeout:10000},async()=>{
  const f=createTeachingFlowFixture();f.setActor(1);await change(f)
  const data=(await request(f,auditRoot+'/page','get',null,{...filter,page:0,size:25})).data
  for(const patch of [{action:'GRANT'},{beforeValue:'x'.repeat(401)},{kind:'LESSON_CHANGE_OTHER'},{afterValue:null}])assert.throws(()=>validatedAdministrativeAuditPage({...data,items:[{...data.items[0],...patch}]},filter,0))
  for(const actor of [2,4,5,6,8]){f.setActor(actor);await assert.rejects(()=>request(f,auditRoot+'/page','get',null,{...filter,page:0,size:25}),e=>e.response?.status===403)}
})
