import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {createResponsibilityResource,responsibilityTarget,responsibilityPage,responsibilityPlan,responsibilityReceipt} from '../src/utils/teachingResponsibilities.js'
import {validatedAdministrativeAuditAccess,validatedAdministrativeAuditPage} from '../src/utils/teachingAdministrativeAudit.js'
import {chinaDate} from '../src/utils/timetable.js'
const opts={timeout:6000},root='/api/admin/teaching/responsibilities',uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,query={userId:5,viewRole:'COUNSELOR',scopeKey:uid(10)}
function fixture(options={}){const f=createTeachingFlowFixture({responsibilities:true,...options});f.setActor(1);return f}
const request=(f,path,params)=>f.adapter({url:root+path,method:'get',params})
const change=(f,data)=>f.adapter({url:root+'/change',method:'post',data})
async function setup(f,overrides={}){const state={};const resource=createResponsibilityResource({scope:()=> 'admin-1',actor:()=>1,state,read:(q,signal)=>f.adapter({url:root+'/check',method:'get',params:q,signal}),save:(data,signal)=>f.adapter({url:root+'/change',method:'post',data,signal}),receipt:(id,signal)=>f.adapter({url:root+'/requests/'+id,method:'get',signal}),...overrides});await resource.load(query);return{state,resource}}
test('controlled range revoke changes actual DEV visibility, preserves marks, and grants no platform role',opts,async()=>{
  const f=fixture();const before=responsibilityTarget((await request(f,'/check',query)).data,query);assert.equal(before.active,true)
  const plan=responsibilityPlan(before,'REVOKE','模拟负责人交接',1),receipt=responsibilityReceipt((await change(f,plan.payload)).data,plan);assert.equal(receipt.revision,1)
  assert.deepEqual((await change(f,plan.payload)).data,receipt)
  f.setActor(5);const access=await f.adapter({url:'/api/teaching/access',method:'get'});assert.equal(access.data.views.includes('COUNSELOR'),false);assert.equal(f.principal().role,'STUDENT')
  f.setActor(4);const lesson=await f.adapter({url:`/api/teaching/lessons/${uid(20)}`,method:'get',params:{view:'TEACHER'}});assert.equal(lesson.data.entries.length,3);assert.ok(lesson.data.entries.every(e=>e.status==='UNKNOWN'))
})
test('new audit category has real snapshots, versions and complete CSV rather than fixed success rows',opts,async()=>{
  const f=fixture(),{resource}=await setup(f);await resource.prepare('REVOKE','模拟范围调整原因');assert.equal(await resource.submit(),true)
  const access=validatedAdministrativeAuditAccess((await f.adapter({url:'/api/admin/teaching/operations/audit/access',method:'get'})).data);assert.equal(access.categories.length,7)
  const filter={kind:'RESPONSIBILITY',from:chinaDate(),to:chinaDate(),search:''},rows=(await f.adapter({url:'/api/admin/teaching/operations/audit/page',method:'get',params:{...filter,page:0,size:25}})).data
  validatedAdministrativeAuditPage(rows,filter,0);assert.equal(rows.total,1);assert.equal(rows.items[0].subjectId,'5');assert.match(rows.items[0].target,/辅导员甲/);assert.equal(rows.items[0].action,'REVOKE')
  const preview=(await f.adapter({url:'/api/admin/teaching/operations/audit/export-preview',method:'get',params:filter})).data
  const file=(await f.adapter({url:'/api/admin/teaching/operations/audit/export',method:'post',data:{token:preview.token}})).data;assert.match(await file.text(),/模拟范围调整原因/);assert.match(await file.text(),/负责范围使用当次快照/);assert.match(await file.text(),/对象（见历史依据）/);resource.dispose()
})
test('scope pagination traverses all actual grants, not only a first-page array',opts,async()=>{
  const f=fixture({largeScope:true}),classes=(await f.adapter({url:'/api/admin/teaching/scopes/page',method:'get',params:{kind:'CLASS',page:0,size:100}})).data.items
  for(const item of classes.filter(c=>c.value!==uid(10)).slice(0,30)){const q={...query,scopeKey:item.value},target=(await request(f,'/check',q)).data;await change(f,responsibilityPlan(target,'GRANT','模拟分页负责配置',1).payload)}
  const seen=new Set();for(let page=0;page<2;page++){const q={userId:5,viewRole:'COUNSELOR',page,size:25},data=responsibilityPage((await request(f,'/page',q)).data,q);assert.equal(data.total,31);data.items.forEach(i=>{assert.ok(!seen.has(i.scopeKey));seen.add(i.scopeKey)})}assert.equal(seen.size,31)
})
test('reviewed identity, normal ADMIN and new version are required, old route cannot bypass',opts,async()=>{
  const f=fixture();for(const id of [2,4,5,6]){f.setActor(id);await assert.rejects(()=>request(f,'/access'),e=>e.response.status===403)}f.setActor(1)
  await assert.rejects(()=>f.adapter({url:'/api/admin/teaching/grants/revoke',method:'post',data:query}),e=>e.response.status===409)
  const target=(await request(f,'/check',{...query,userId:10})).data;assert.equal(target.eligible,false);assert.throws(()=>responsibilityPlan(target,'GRANT','尚未审核身份',1))
  const before=(await request(f,'/check',query)).data,plan=responsibilityPlan(before,'REVOKE','模拟变更',1);await change(f,plan.payload)
  await assert.rejects(()=>change(f,{...plan.payload,requestId:crypto.randomUUID()}),e=>e.response.status===409)
})
test('lost ACK after accepted write is blocked and recovered from the same immutable request',opts,async()=>{
  const f=fixture();let calls=0;const {state,resource}=await setup(f,{save:async data=>{calls++;await change(f,data);throw new Error('模拟ACK丢失')}})
  await resource.prepare('REVOKE','模拟断线核对');const id=state.preview.payload.requestId;assert.equal(await resource.submit(),false);assert.equal(state.blocked,true);assert.equal(state.pending.payload.requestId,id)
  assert.equal(await resource.prepare('REVOKE','不能改成另一内容'),false);assert.equal(calls,1);assert.equal(await resource.reconcile(),true);assert.equal(calls,1);assert.equal(state.result.requestId,id);assert.equal(state.data,null);resource.dispose()
})
test('no receipt does not prove no write; explicit retry uses only the original ID and payload',opts,async()=>{
  const f=fixture(),writes=[];let offline=true;const {state,resource}=await setup(f,{save:async data=>{writes.push({...data});if(offline)throw new Error('模拟发送失败');return change(f,data)}})
  await resource.prepare('REVOKE','模拟同请求重试');await resource.submit();assert.equal(await resource.reconcile(),false);assert.equal(state.canRetry,true);assert.equal(state.blocked,true)
  offline=false;assert.equal(await resource.retry(),true);assert.deepEqual(writes[0],writes[1]);assert.equal(state.result.revision,1);resource.dispose()
})
test('bad ACK stays unknown; read errors and stale versions do not claim save success',opts,async()=>{
  const f=fixture();const {state,resource}=await setup(f,{save:async data=>{const r=await change(f,data);return{data:{...r.data,actorId:999}}}})
  await resource.prepare('REVOKE','模拟错误回执');await resource.submit();assert.equal(state.blocked,true);assert.equal(state.result,null);assert.equal(await resource.reconcile(),true);resource.dispose()
  const g=fixture(),known=await setup(g,{save:()=>{throw{response:{status:409,data:{message:'模拟版本冲突'}}}}});await known.resource.prepare('REVOKE','模拟旧版本');await known.resource.submit();assert.equal(known.state.pending,null);assert.equal(known.state.data,null);assert.match(known.state.error,/版本冲突/);known.resource.dispose()
})
test('late target and late save response are isolated when owner changes',opts,async()=>{
  const f=fixture();let owner='admin',resolve;const target=(await request(f,'/check',query)).data,state={}
  const r=createResponsibilityResource({scope:()=>owner,actor:()=>1,state,read:()=>new Promise(done=>{resolve=done}),save:()=>assert.fail('no write'),receipt:()=>assert.fail('no receipt')})
  const waiting=r.load(query);owner='student';r.reset();resolve({data:target});await waiting;assert.equal(state.data,null);assert.equal(state.notice,'');r.dispose()
  owner='admin';const value=await setup(f,{scope:()=>owner,save:()=>new Promise(done=>{resolve=done})});await value.resource.prepare('REVOKE','模拟切号');const plan=value.state.preview,write=value.resource.submit();owner='student';value.resource.reset();resolve({data:{...plan.payload,actorId:1,scopeLabel:plan.target.scopeLabel,oldActive:true,newActive:false,oldRevision:0,revision:1,recordedAt:new Date().toISOString()}});await write;assert.equal(value.state.result,null);assert.equal(value.state.pending,null);value.resource.dispose()
})
test('expired or edited preview never saves, and changed source requires a fresh preview',opts,async()=>{
  const f=fixture();let now=1000,calls=0;const {resource}=await setup(f,{now:()=>now,save:()=>{calls++;assert.fail('expired write')}})
  await resource.prepare('REVOKE','模拟到期');now+=300001;assert.equal(await resource.submit(),false);assert.equal(calls,0);resource.dispose()
  const g=fixture(),v=await setup(g),before=v.state.data;await change(g,responsibilityPlan(before,'REVOKE','另一管理员页面变更',1).payload);assert.equal(await v.resource.prepare('REVOKE','旧表单不覆盖'),false);assert.match(v.state.error,/已变化/);assert.equal(v.state.preview,null);v.resource.dispose()
})
test('unsafe target, duplicate page or changed receipt cannot be accepted',opts,async()=>{
  const f=fixture(),target=(await request(f,'/check',query)).data,plan=responsibilityPlan(target,'REVOKE','模拟核对',1),ack=(await change(f,plan.payload)).data
  assert.throws(()=>responsibilityTarget({...target,userId:8},query));assert.throws(()=>responsibilityPlan(target,'REVOKE','',1));assert.throws(()=>responsibilityPlan(target,'REVOKE','包含\n换行',1));assert.throws(()=>responsibilityReceipt({...ack,reason:'换了原因'},plan))
  assert.throws(()=>responsibilityPlan(target,'REVOKE','包含\u0085控制字符',1));assert.throws(()=>responsibilityPlan({...target,revision:2147483647},'REVOKE','不回绕版本',1))
  const q={userId:5,viewRole:'COUNSELOR',page:0,size:25},page=(await request(f,'/page',q)).data;assert.throws(()=>responsibilityPage({...page,total:100},q))
})
test('new range interface compiles with explicit confirmation, unknown-result recovery and 44px/16px controls',opts,()=>{
  const file=readFileSync(new URL('../src/components/TeachingResponsibilityPanel.vue',import.meta.url),'utf8'),{descriptor}=parse(file);compileScript(descriptor,{id:'responsibility'});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:'TeachingResponsibilityPanel.vue',id:'responsibility'}).errors,[])
  for(const pattern of [/核对并撤销/,/确认撤销此范围/,/核对保存回执/,/重试同一个请求/,/min-height:44px/,/font-size:16px/,/useScopedConfirmation/,/useUnsavedChanges/,/className:'ct-teaching-change-confirm'/,/editorElement\.value\?\.scrollIntoView/,/aria-label="教学身份"/])assert.match(file,pattern)
  assert.doesNotMatch(file,/v-html|localStorage|sessionStorage|setTimeout/)
})
