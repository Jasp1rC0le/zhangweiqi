import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {governanceFilter,validateGovernancePage,validateGovernancePreview,createGovernanceResource,governanceChecksum} from '../src/utils/teachingGovernance.js'
import {chinaDate} from '../src/utils/timetable.js'
const opts={timeout:5000},today=chinaDate(),filter=(view='TEACHER',kind='ATTENDANCE')=>({view,kind,from:today,to:today,classId:'',expiredOnly:false})
const api=f=>async(url,params={},method='get',data)=>(await f.adapter({url,params,method,data})).data
async function marked(){const f=createTeachingFlowFixture();f.setActor(4);f.advanceTo('14:01');const call=api(f),lessons=await call('/api/teaching/lessons',{view:'TEACHER',from:today,to:today}),lesson=lessons.find(c=>c.course.includes('网络')),detail=await call(`/api/teaching/lessons/${lesson.id}`,{view:'TEACHER'});await call(`/api/teaching/lessons/${lesson.id}/attendance`,{},'put',{revision:0,marks:detail.entries.map(e=>({studentId:e.studentId,status:'ON_TIME'})),reason:'',finish:true});await call(`/api/teaching/lessons/${lesson.id}/attendance`,{},'put',{revision:1,marks:[{studentId:detail.entries[0].studentId,status:'EARLY_LEAVE'}],reason:'模拟：核对早退原因',finish:true});return{f,call,lesson,detail}}
test('governance rejects invalid dates, huge ranges and fabricated classes before request',opts,()=>{
  assert.deepEqual(governanceFilter(filter()),filter())
  for(const patch of [{from:'2026-02-31',to:'2026-03-01'},{from:'2026-01-01',to:'2026-12-01'},{view:'__proto__'},{kind:'SQL'},{classId:'other'}])assert.throws(()=>governanceFilter({...filter(),...patch}))
})
test('real mock changes feed scoped immutable history including early leave, never another student',opts,async()=>{
  const {f,call}=await marked(),query=filter('TEACHER','AUDIT'),teacher=validateGovernancePage(await call('/api/teaching/governance/page',query),query,0)
  assert.equal(teacher.total,4);assert.equal(teacher.items[0].newStatus,'EARLY_LEAVE');assert.equal(teacher.items[0].reason,'模拟：核对早退原因');assert.equal(teacher.deletionEnabled,false)
  f.setActor(2);const own=filter('STUDENT','AUDIT'),student=validateGovernancePage(await call('/api/teaching/governance/page',own),own,0);assert.equal(student.total,2);assert.ok(student.items.every(r=>r.studentNumber==='demo-1-1'))
  f.setActor(6);assert.equal((await call('/api/teaching/governance/page',filter('SECRETARY','AUDIT'))).total,4)
  f.setActor(8);await assert.rejects(()=>call('/api/teaching/governance/page',filter('ADMIN')),e=>e.response.status===403)
})
test('whole-scope export is not the first page and byte checksums match the complete CSV',opts,async()=>{
  const f=createTeachingFlowFixture({largeClass:true}),call=api(f);f.setActor(4)
  const first=await call('/api/teaching/governance/page',filter());assert.equal(first.items.length,25);assert.equal(first.total,708)
  const preview=validateGovernancePreview(await call('/api/teaching/governance/export-preview',filter()),filter());assert.equal(preview.count,708)
  const downloaded=await f.adapter({url:'/api/teaching/governance/export',method:'post',data:{token:preview.token}})
  assert.equal(await governanceChecksum(await downloaded.data.arrayBuffer()),preview.sha256);assert.equal((await downloaded.data.text()).split('\r\n').filter(Boolean).length,711)
  f.setActor(2);await assert.rejects(()=>call('/api/teaching/governance/export',{},'post',{token:preview.token}),e=>e.response.status===410)
})
test('response validation binds date class view kind counts and retention without accepting truncation',opts,async()=>{
  const {call}=await marked(),q=filter(),page=await call('/api/teaching/governance/page',q)
  for(const patch of [{filter:{...q,view:'ADMIN'}},{deletionEnabled:true},{total:100},{expiredWithinScope:999},{items:[{...page.items[0],status:'invented'}]}])assert.throws(()=>validateGovernancePage({...page,...patch},q,0),/异常/)
  const p=await call('/api/teaching/governance/export-preview',q);for(const patch of [{count:2001},{filter:{...q,expiredOnly:true}},{expiresAt:'2020-01-01T00:00:00Z'},{sha256:'bad'},{deletionEnabled:true}])assert.throws(()=>validateGovernancePreview({...p,...patch},q),/异常/)
})
function resourceFor(f,{scope=()=> 'owner',onFile=()=>{},...overrides}={}) {const state={},r=createGovernanceResource({scope,state,onFile,access:signal=>f.adapter({url:'/api/teaching/governance/access',signal}),read:(params,signal)=>f.adapter({url:'/api/teaching/governance/page',params,signal}),prepare:(params,signal)=>f.adapter({url:'/api/teaching/governance/export-preview',params,signal}),download:(data,signal)=>f.adapter({url:'/api/teaching/governance/export',method:'post',data,signal}),...overrides});return{state,r}}
test('prepared exports verify actual bytes and only then hand a file to the browser',opts,async()=>{
  const {f}=await marked();let file;const {r,state}=resourceFor(f,{onFile:value=>{file=value}});await r.access();await r.load(filter());await r.prepare(filter());assert.equal(state.preview.count,6);assert.equal(await r.download(),true);assert.equal(file.count,6);assert.equal(state.downloaded.sha256,state.preview.sha256);r.dispose()
})
test('wrong file checksum cannot save anything and changed records require fresh preparation',opts,async()=>{
  const {f,call,lesson,detail}=await marked();let files=0;const {r,state}=resourceFor(f,{onFile:()=>files++,download:async()=>({data:new Blob(['wrong'],{type:'text/csv'}),headers:{'content-type':'text/csv','x-content-sha256':state.preview.sha256}})});await r.access();await r.load(filter());await r.prepare(filter());assert.equal(await r.download(),false);assert.equal(files,0);assert.equal(state.preview,null);assert.match(state.error,/校验/);r.dispose()
  const another=resourceFor(f);await another.r.access();await another.r.load(filter('TEACHER','AUDIT'));await another.r.prepare(filter('TEACHER','AUDIT'));await call(`/api/teaching/lessons/${lesson.id}/attendance`,{},'put',{revision:2,marks:[{studentId:detail.entries[0].studentId,status:'ON_TIME'}],reason:'模拟：准备后变化',finish:true});assert.equal(await another.r.download(),false);assert.match(another.state.error,/变化/);assert.equal(another.state.preview,null);another.r.dispose()
})
test('account and filter invalidation abort late private results and downloads',opts,async()=>{
  const {f}=await marked();let owner='a',resolve,signal;const {r,state}=resourceFor(f,{scope:()=>owner,read:(params,s)=>{signal=s;return new Promise(done=>{resolve=()=>f.adapter({url:'/api/teaching/governance/page',params}).then(done)})}});await r.access();const pending=r.load(filter());owner='b';r.reset(true);assert.equal(signal.aborted,true);await resolve();await pending;assert.equal(state.data,null);assert.equal(state.access,null);r.dispose()
})
test('new folded evidence UI preserves primary point-name task, native semantics and lifecycle cleanup',opts,()=>{
  const source=readFileSync(new URL('../src/components/TeachingGovernancePanel.vue',import.meta.url),'utf8'),{descriptor}=parse(source)
  compileScript(descriptor,{id:'governance'});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:'governance',filename:'TeachingGovernancePanel.vue'}).errors,[])
  assert.match(source,/resource\.reset\(true\)/);assert.match(source,/resource\.dispose/);assert.match(source,/min-height:44px/);assert.match(source,/font-size:16px/);assert.match(source,/2000/);assert.match(source,/尚未归档或删除/)
  assert.ok(source.indexOf('class="governance-export"')<source.indexOf('class="governance-rows"'));assert.match(source,/owner===scope\(\).*token===state.preview\?\.token/);assert.match(source,/scrollIntoView\(\{block:'start',behavior:'auto'\}\)/)
  assert.doesNotMatch(source,/localStorage|sessionStorage|v-html|\.delete\(/)
})
