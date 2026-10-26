import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {validatedCourseMode,courseModePlan,validatedModeReceipt,createCourseModeResource} from '../src/utils/teachingCourseMode.js'
const opts={timeout:5000},id='10000000-0000-4000-8000-000000000021',mixed='10000000-0000-4000-8000-000000000020',why='模拟：核对原课程的选课依据'
function fixture(){const f=createTeachingFlowFixture({legacyCourse:true});f.setActor(1);return f}
const api=f=>async(url,method='get',data)=>(await f.adapter({url,method,data})).data
const path=course=>`/api/admin/teaching/courses/${course}/enrollment-mode`
function resource(f,overrides={}){const state={},r=createCourseModeResource({scope:()=> 'admin',actor:()=>1,state,read:(course,signal)=>f.adapter({url:path(course),method:'get',signal}),save:(course,data,signal)=>f.adapter({url:path(course)+'/review',method:'post',data,signal}),...overrides});return{r,state}}
test('source response and plan bind exact course, version, administrative membership and actor',opts,async()=>{
  const f=fixture(),call=api(f),data=validatedCourseMode(await call(path(id)),id);assert.equal(data.mode,'LEGACY');assert.equal(data.outsideAdminClass,0)
  const plan=courseModePlan(data,'ADMIN_CLASS',why,crypto.randomUUID(),1);assert.equal(plan.payload.revision,0);assert.equal(plan.ownerActor,1)
  for(const patch of [{courseId:mixed},{mode:'invented'},{revision:null},{activeMembers:2001},{outsideAdminClass:4},{target:{...data.target,startTime:'08:99'}},{reviewRequestId:crypto.randomUUID()}])assert.throws(()=>validatedCourseMode({...data,...patch},id),/异常/)
  const cross=await call(path(mixed));assert.equal(cross.outsideAdminClass,1);assert.throws(()=>courseModePlan(cross,'ADMIN_CLASS',why,crypto.randomUUID(),1),/归属/)
})
test('DEV classification really persists one source decision and leaves roster, attendance and notices intact',opts,async()=>{
  const f=fixture(),call=api(f),evidence=async()=>{f.setActor(4);const detail=(await f.adapter({url:`/api/teaching/lessons/${id}`,method:'get',params:{view:'TEACHER'}})).data,notices=await call('/api/teaching/notices');f.setActor(1);return{entries:detail.entries,revision:detail.lesson.revision,notices}},before=await evidence(),data=await call(path(id)),plan=courseModePlan(data,'ADMIN_CLASS',why,crypto.randomUUID(),1)
  const result=validatedModeReceipt(await call(path(id)+'/review','post',plan.payload),plan);assert.equal(result.revision,1);assert.deepEqual(await call(path(id)+'/review','post',plan.payload),result)
  const current=await call(path(id));assert.equal(current.mode,'ADMIN_CLASS');assert.equal(current.reviewRequestId,plan.payload.requestId);assert.equal(current.reviewReason,why);assert.equal(f.audit().filter(r=>r.action==='MODE_REVIEW').length,1)
  assert.deepEqual(await evidence(),before)
  await assert.rejects(()=>call(path(id)+'/review','post',{...plan.payload,requestId:crypto.randomUUID(),revision:1}),e=>e.response.status===409)
  f.setActor(4);await assert.rejects(()=>call(path(id)),e=>e.response.status===403)
})
test('prepare rereads real state, expiry does not submit and only verified receipt clears the block',opts,async()=>{
  const f=fixture();let now=Date.now(),writes=0;const {r,state}=resource(f,{now:()=>now,save:async(course,data,signal)=>{writes++;return f.adapter({url:path(course)+'/review',method:'post',data,signal})}})
  await r.load(id);await r.prepare('ADMIN_CLASS',why);const first=state.preview;now+=300001;assert.equal(await r.submit(),false);assert.equal(writes,0);assert.equal(state.preview,null)
  await r.prepare('ADMIN_CLASS',why);assert.notEqual(state.preview.payload.requestId,first.payload.requestId);assert.equal(await r.submit(),true);assert.equal(state.pending,null);assert.equal(state.blocked,false);assert.match(state.notice,/回读确认/);r.dispose()
})
test('a lost ACK is reconciled from durable request identity, never by treating an empty body as success',opts,async()=>{
  const f=fixture();let writes=0;const {r,state}=resource(f,{save:async(course,data,signal)=>{writes++;await f.adapter({url:path(course)+'/review',method:'post',data,signal});return{data:null}}})
  await r.load(id);await r.prepare('ADMIN_CLASS',why);assert.equal(await r.submit(),false);assert.equal(state.blocked,true);assert.ok(state.pending);assert.match(state.error,/回执/)
  assert.equal(await r.reconcile(),true);assert.equal(writes,1);assert.equal(state.pending,null);assert.equal(state.data.mode,'ADMIN_CLASS');r.dispose()
})
test('request not delivered may explicitly retry only the same confirmed payload and nonce',opts,async()=>{
  const f=fixture(),bodies=[];let failOnce=true;const {r,state}=resource(f,{save:async(course,data,signal)=>{bodies.push({...data});if(failOnce){failOnce=false;throw new Error('模拟连接中断')}return f.adapter({url:path(course)+'/review',method:'post',data,signal})}})
  await r.load(id);await r.prepare('ADMIN_CLASS',why);await r.submit();assert.equal(state.blocked,true);assert.equal(state.canRetry,false);assert.equal(await r.reconcile(),false);assert.equal(state.canRetry,true);assert.equal(await r.retry(),true);assert.deepEqual(bodies[0],bodies[1]);assert.equal(f.audit().filter(r=>r.action==='MODE_REVIEW').length,1);r.dispose()
})
test('saved but refresh-failed response stays recoverable without another write',opts,async()=>{
  const f=fixture();let reads=0,writes=0;const {r,state}=resource(f,{read:async(course,signal)=>{reads++;if(reads===3)throw new Error('模拟刷新失败');return f.adapter({url:path(course),method:'get',signal})},save:async(course,data,signal)=>{writes++;return f.adapter({url:path(course)+'/review',method:'post',data,signal})}})
  await r.load(id);await r.prepare('ADMIN_CLASS',why);assert.equal(await r.submit(),false);assert.match(state.error,/已保存/);assert.equal(state.blocked,true);assert.equal(await r.reconcile(),true);assert.equal(writes,1);assert.equal(state.pending,null);r.dispose()
})
test('a competing legitimate decision is shown but not claimed as this request, and new filters invalidate previews',opts,async()=>{
  const f=fixture(),call=api(f);const {r,state}=resource(f,{save:async()=>{throw new Error('模拟回执丢失')}});await r.load(id);await r.prepare('ADMIN_CLASS',why);await r.submit()
  await call(path(id)+'/review','post',{requestId:crypto.randomUUID(),revision:0,mode:'EXPLICIT',reason:'另一正常管理员请求的依据'});assert.equal(await r.reconcile(),false);assert.equal(state.data.mode,'EXPLICIT');assert.equal(state.pending,null);assert.equal(state.blocked,false);assert.match(state.notice,/其他请求/)
  r.invalidatePreview();assert.equal(state.preview,null);r.dispose()
})
test('account cutover aborts late private target reads and prevents a different actor submitting a preview',opts,async()=>{
  const f=fixture(),value=await api(f)(path(id));let owner='a',actor=1,resolve,signal;const {r,state}=resource(f,{scope:()=>owner,actor:()=>actor,read:(_,s)=>{signal=s;return new Promise(done=>{resolve=done})}})
  const pending=r.load(id);owner='b';actor=2;r.reset();assert.equal(signal.aborted,true);resolve({data:value});await pending;assert.equal(state.data,null);assert.equal(state.preview,null);r.dispose()
})
test('folded mode UI keeps explicit read preview confirmation, reason and result recovery within inherited controls',opts,()=>{
  const source=readFileSync(new URL('../src/components/TeachingCourseModePanel.vue',import.meta.url),'utf8'),{descriptor}=parse(source)
  compileScript(descriptor,{id:'mode'});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:'TeachingCourseModePanel.vue',id:'mode'}).errors,[])
  assert.match(source,/核定历史课程类型/);assert.match(source,/state\.data\.outsideAdminClass>0/);assert.match(source,/ct-teaching-change-confirm/);assert.match(source,/clearVerifiedDraft/);assert.match(source,/if\(!settling\)/);assert.match(source,/resource\.reconcile/);assert.match(source,/resource\.retry/);assert.match(source,/flush:'sync'/);assert.match(source,/min-height:44px/);assert.match(source,/font-size:16px/)
  const parent=readFileSync(new URL('../src/components/AdminTeachingPanel.vue',import.meta.url),'utf8');assert.match(parent,/enrollmentModeReviewEnabled===true/);assert.match(parent,/!courseOnly && modeReviewEnabled/)
  assert.doesNotMatch(source,/localStorage|sessionStorage|v-html|\.delete\(/)
})
