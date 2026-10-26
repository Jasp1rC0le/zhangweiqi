import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {auditDate,validateAudit,auditPageCsv,createAuditReader} from '../src/utils/teachingAudit.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate} from '../src/utils/timetable.js'
const id='10000000-0000-4000-8000-000000000001',opts={timeout:3000}
const row={id,studentNumber:'0001234567890123456',studentName:'合成同学',actorName:'合成教师',oldStatus:'LATE',newStatus:'ON_TIME',reason:'核对后更正',recordedAt:'2026-10-15T00:00:00Z',expiresAt:'2027-10-15T00:00:00Z',expired:false}
const page=()=>({lessonId:id,view:'TEACHER',items:[{...row}],page:0,size:25,total:1,totalPages:1,retentionYears:1,expiredWithinScope:0,deletionEnabled:false})
test('audit result is bound to lesson view page policy and complete bounded rows',opts,()=>{
  assert.equal(validateAudit(page(),id,'TEACHER',0).total,1)
  assert.equal(validateAudit({...page(),items:[{...row,newStatus:'EARLY_LEAVE'}]},id,'TEACHER',0).items[0].newStatus,'EARLY_LEAVE')
  assert.match(auditDate(row.expiresAt),/2027/);assert.match(auditDate('2026-10-14T16:30:00Z',true),/2026.*10.*15.*00:30/)
  for(const patch of [{lessonId:'other'},{view:'SECRETARY'},{page:1},{total:2},{retentionYears:2},{deletionEnabled:true},{expiredWithinScope:2},{items:[row,row]}])
    assert.throws(()=>validateAudit({...page(),...patch},id,'TEACHER',0),/异常/)
})
test('CSV exports only this visible page, preserves long student numbers as text and neutralizes formulas',opts,()=>{
  const data=page();data.items[0].studentName='=HYPERLINK("https://invalid.example")';data.items[0].reason='\t+SUM(1,2)\n核对'
  const csv=auditPageCsv(data)
  assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/'0001234567890123456/);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/' \+SUM| '\+SUM/)
  assert.equal(csv.split('\r\n').length,2);assert.ok(!csv.includes('https://private.example'))
})
test('scope reset rejects late audit reads and clears all private rows',opts,async()=>{
  let owner='a',finish,signal;const state={};const r=createAuditReader({scope:()=>owner,state,read:(_,__,___,s)=>{signal=s;return new Promise(resolve=>{finish=resolve})}})
  const pending=r.load(id,'TEACHER',0);owner='b';r.reset();assert.equal(signal.aborted,true)
  finish({data:page()});await pending;assert.equal(state.data,null);assert.equal(state.error,'');r.dispose()
})
test('bad target and failed reads cannot leave exportable stale rows',opts,async()=>{
  const state={data:page()};const r=createAuditReader({scope:()=>'a',state,read:async()=>({data:{...page(),lessonId:'wrong'}})})
  await r.load(id,'TEACHER',0);assert.equal(state.data,null);assert.match(state.error,/未导出/);r.dispose()
})
test('audit panel is a scoped read-only secondary task with no hidden deletion or approval writes',opts,()=>{
  const source=readFileSync(new URL('../src/components/TeachingAuditPanel.vue',import.meta.url),'utf8'),{descriptor}=parse(source)
  compileScript(descriptor,{id:'audit'});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:'TeachingAuditPanel.vue',id:'audit'}).errors,[])
  assert.match(source,/flush:'sync'/);assert.match(source,/reader.dispose/);assert.match(source,/state.loading \|\| !state.data.items.length/)
  assert.doesNotMatch(source,/localStorage|sessionStorage|v-html|\.delete\(|\.post\(/)
})
test('mock audit reads actual simulated saves and corrections with student scope, not canned success',opts,async()=>{
  const fixture=createTeachingFlowFixture(),api=async(url,params={},method='get',data)=>(await fixture.adapter({url,params,method,data})).data
  fixture.setActor(4);fixture.advanceTo('14:01')
  const lessons=await api('/api/teaching/lessons',{view:'TEACHER',from:chinaDate(),to:chinaDate()}),id=lessons.find(l=>l.course.includes('网络')).id
  const detail=await api(`/api/teaching/lessons/${id}`,{view:'TEACHER'}),marks=detail.entries.map(e=>({studentId:e.studentId,status:'LATE'}))
  await api(`/api/teaching/lessons/${id}/attendance`,{},'put',{revision:0,marks,reason:'',finish:false})
  marks[0].status='ON_TIME'
  await api(`/api/teaching/lessons/${id}/attendance`,{},'put',{revision:1,marks,reason:'模拟更正原因',finish:false})
  const history=validateAudit(await api(`/api/teaching/lessons/${id}/audit`,{view:'TEACHER',page:0,size:25}),id,'TEACHER',0)
  assert.equal(history.total,detail.entries.length+1);assert.equal(history.items[0].reason,'模拟更正原因')
  fixture.setActor(2);const own=await api(`/api/teaching/lessons/${id}/audit`,{view:'STUDENT',page:0,size:25});assert.ok(own.items.every(r=>r.studentId===detail.entries[0].studentId));assert.equal(own.total,2)
  fixture.setActor(8);await assert.rejects(()=>api(`/api/teaching/lessons/${id}/audit`,{view:'STUDENT',page:0,size:25}),e=>e.response.status===404)
})
