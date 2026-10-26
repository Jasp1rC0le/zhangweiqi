import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate} from '../src/utils/timetable.js'
import {administrativeAuditFilter,validatedAdministrativeAuditAccess,validatedAdministrativeAuditPage,createAdministrativeAuditResource} from '../src/utils/teachingAdministrativeAudit.js'
const opts={timeout:5000},root='/api/admin/teaching/operations/audit',uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,filter={kind:'ALL',from:chinaDate(),to:chinaDate(),search:''}
function fixture(){const f=createTeachingFlowFixture({managementHistory:true,legacyCourse:true});f.setActor(1);return f}
const request=(f,path,params={})=>f.adapter({url:root+path,method:'get',params})
async function resource(f,overrides={}){const state={},r=createAdministrativeAuditResource({scope:()=> 'admin',state,access:signal=>request(f,'/access',{signal}),read:(params,signal)=>f.adapter({url:root+'/page',method:'get',params,signal}),...overrides});await r.access();return{r,state}}
test('management history has real complete paging, literal search and exact result filter validation',opts,async()=>{
  const f=fixture(),access=validatedAdministrativeAuditAccess((await request(f,'/access')).data);assert.equal(access.categories.length,6)
  const seen=new Set();for(let page=0;page<3;page++){const data=validatedAdministrativeAuditPage((await request(f,'/page',{...filter,page,size:25})).data,filter,page);assert.equal(data.total,65);assert.equal(data.totalPages,3);data.items.forEach(row=>{assert.equal(row.kind,'ACCOUNT_BINDING');assert.ok(!seen.has(row.id));seen.add(row.id)})}assert.equal(seen.size,65)
  const empty=await request(f,'/page',{...filter,search:'不存在%_',size:25});assert.equal(empty.data.total,0)
  assert.throws(()=>administrativeAuditFilter({...filter,to:'2026-12-31'}));assert.throws(()=>administrativeAuditFilter({...filter,from:'2026-02-30'}))
  assert.throws(()=>validatedAdministrativeAuditAccess({...access,deletionEnabled:true}))
})
test('actual DEV transition, identity approval and source review become new audit evidence, not fixed success rows',opts,async()=>{
  const f=fixture(),write=(url,data)=>f.adapter({url,method:'post',data}),course=uid(21),student=uid(100)
  await write(`/api/admin/teaching/students/${student}/transition`,{requestId:crypto.randomUUID(),revision:0,expectedClassId:uid(10),action:'TRANSFER',targetClassId:uid(11),reason:'合成：核对后转班'})
  await write(`/api/admin/teaching-identities/${uid(15003)}/review`,{revision:1,decision:'APPROVE',reason:'合成：教师身份核对'})
  await write(`/api/admin/teaching/courses/${course}/enrollment-mode/review`,{requestId:crypto.randomUUID(),revision:0,mode:'ADMIN_CLASS',reason:'合成：原教学依据'})
  const data=validatedAdministrativeAuditPage((await request(f,'/page',{...filter,size:25})).data,filter,0);assert.equal(data.total,68)
  const transition=data.items.find(r=>r.kind==='STUDENT_TRANSITION');assert.equal(transition.beforeValue,'ACTIVE');assert.equal(transition.afterValue,'ACTIVE');assert.match(transition.historyNote,/示例班一/);assert.match(transition.historyNote,/示例班二/)
  assert.ok(data.items.some(r=>r.kind==='IDENTITY_REVIEW'&&r.afterValue==='APPROVED'));assert.ok(data.items.some(r=>r.kind==='COURSE_SOURCE'&&r.afterValue==='ADMIN_CLASS'))
  const oldBinding=(await request(f,'/page',{...filter,kind:'ACCOUNT_BINDING',size:25})).data.items[0];assert.doesNotMatch(oldBinding.context,/示例班二/);assert.match(oldBinding.historyNote,/未保存当时行政班/)
})
test('student, teacher, counselor and secretary views cannot read normal administrator operation history',opts,async()=>{
  const f=fixture();for(const actor of [2,4,5,6,8]){f.setActor(actor);await assert.rejects(()=>request(f,'/access'),error=>error.response.status===403);await assert.rejects(()=>request(f,'/page',{...filter,size:25,userId:1,view:'ADMIN'}),error=>error.response.status===403)}
})
test('resource drops old rows immediately and keeps filters recoverable after a failed read',opts,async()=>{
  const f=fixture();let failing=false;const {r,state}=await resource(f,{read:params=>{if(failing)throw new Error('模拟读取中断');return request(f,'/page',params)}})
  assert.equal(await r.load(filter),true);assert.equal(state.data.total,65);failing=true;assert.equal(await r.load({...filter,search:'新条件'}),false);assert.equal(state.data,null);assert.match(state.error,/读取中断/);failing=false;assert.equal(await r.load(filter,2),true);assert.equal(state.data.items.length,15);r.dispose()
})
test('account cutover or inactive scope aborts late rows and revocation clears capability',opts,async()=>{
  const f=fixture();let owner='admin',resolve,signal;const value=(await request(f,'/page',{...filter,size:25})).data;const {r,state}=await resource(f,{scope:()=>owner,read:(_,s)=>{signal=s;return new Promise(done=>{resolve=done})}})
  const pending=r.load(filter);owner='student';r.reset(true);assert.equal(signal.aborted,true);resolve({data:value});await pending;assert.equal(state.access,null);assert.equal(state.data,null);r.dispose()
  const denied=await resource(f,{read:()=>{throw{response:{status:403,data:{message:'管理员权限已撤销'}}}}});await denied.r.load(filter);assert.equal(denied.state.access,null);assert.equal(denied.state.data,null);denied.r.dispose()
})
test('tampered counts, kind, timestamps or duplicate rows cannot masquerade as current history',opts,async()=>{
  const f=fixture(),data=(await request(f,'/page',{...filter,size:25})).data
  for(const patch of [{total:24},{filter:{...filter,kind:'IDENTITY_REVIEW'}},{items:[{...data.items[0],kind:'BAD'},...data.items.slice(1)]},{items:[data.items[0],data.items[0],...data.items.slice(2)]},{items:[{...data.items[0],recordedAt:'2020-01-01T00:00:00Z'},...data.items.slice(1)]}])assert.throws(()=>validatedAdministrativeAuditPage({...data,...patch},filter,0),/异常/)
})
test('folded audit interface is explicitly capability gated, read only, paged and touch sized',opts,()=>{
  const source=readFileSync(new URL('../src/components/TeachingAdministrativeAuditPanel.vue',import.meta.url),'utf8'),{descriptor}=parse(source);compileScript(descriptor,{id:'management'});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:'TeachingAdministrativeAuditPanel.vue',id:'management'}).errors,[])
  assert.match(source,/管理操作历史/);assert.match(source,/操作发生日期/);assert.match(source,/state\.data\.totalPages/);assert.match(source,/历史依据与编号/);assert.match(source,/flush:'sync'/);assert.match(source,/font-size:16px/);assert.match(source,/min-height:44px/);assert.doesNotMatch(source,/v-html|localStorage|sessionStorage|(?:resource|http)\.delete\(/)
  const parent=readFileSync(new URL('../src/components/AdminTeachingPanel.vue',import.meta.url),'utf8');assert.match(parent,/administrativeAuditEnabled===true/);assert.match(parent,/!courseOnly && administrativeAuditEnabled/)
})
