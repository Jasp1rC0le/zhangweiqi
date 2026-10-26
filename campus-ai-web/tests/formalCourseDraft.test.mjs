import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {formalCoursePayload,resolveFormalTarget,createFormalCourseResource,formalMissingFields,formalWeeksLabel} from '../src/utils/formalCourseDraft.js'
import {planActionFollowup} from '../src/utils/chatActionFollowup.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
const opts={timeout:6000},classId='10000000-0000-4000-8000-000000000010'
const form=()=>({course:{id:crypto.randomUUID(),classId,teacherId:'4',name:'模拟复杂教学',semester:'模拟学期',firstMonday:'2026-10-12',weekday:3,startTime:'14:00',endTime:'15:35',weeks:'1-3',room:'F2-306'},rosterMode:'CLASS',groupName:'',students:[]})
function setup(extra={}){const f=createTeachingFlowFixture();f.setActor(1);const state={};let owner='normal-admin',writes=0;const call=(url,method,data,signal)=>f.adapter({url,method,data,signal});const api={preview:(p,s)=>call('/api/admin/teaching/courses/preview','post',p,s),create:(p,s)=>{writes++;return call(p.rosterMode==='CLASS'?'/api/admin/teaching/courses':'/api/admin/teaching/courses/roster','post',p.rosterMode==='CLASS'?p.course:{course:p.course,groupName:p.groupName,studentIds:p.studentIds},s)},read:(id,s)=>call(`/api/admin/teaching/courses/${id}/definition`,'get',undefined,s),...extra};const r=createFormalCourseResource({owner:()=>owner,state,...api});return{f,state,r,api,writes:()=>writes,switch:()=>{owner='another';r.reset()}}}
const context=()=>({kind:'TEACHING_COURSE',userRole:'ADMIN',schoolId:1,scope:'s',requestScope:'s',active:true,loaded:true,busy:false,phase:'editing',form:{...form().course,course:form().course}})
test('formal semantic slots compose targets, calendar, metadata, verified afternoon periods and enrollment mode without writes',opts,()=>{
  const c=context(),before=JSON.stringify(c),p=planActionFollowup('班级物联网示例班一，教师账号4，学期2026秋，第一周周一2026-10-12，周四，第五到六节，周次1-16单，教室F2-418，名单方式合班，教学组嵌入式选修',c)
  assert.equal(p.type,'PATCH',p.message);assert.equal(p.patch.targets.classQuery,'物联网示例班一');assert.equal(p.patch.targets.teacherQuery,'4');assert.equal(p.patch.targets.rosterMode,'SELECTED');assert.equal(p.patch.targets.groupName,'嵌入式选修');assert.equal(p.patch.course.startTime,'14:00');assert.equal(p.patch.course.endTime,'15:35');assert.equal(p.patch.course.firstMonday,'2026-10-12');assert.equal(p.patch.course.semester,'2026秋');assert.equal(p.patch.course.room,'F2-418');assert.equal(JSON.stringify(c),before)
  assert.equal(planActionFollowup('教师账号4',c).patch.targets.teacherQuery,'4');assert.equal(planActionFollowup('第九到十节',c).type,'CLARIFY');assert.equal(planActionFollowup('第五到六节',{...c,schoolId:2}).type,'CLARIFY')
  const first=planActionFollowup('给物联网示例班一新增课程《模拟数据库》，教师账号4，学期模拟学期，第一周周一2026-10-12，周三，第5到6节，第1到16周，教室F2-418',c);assert.equal(first.type,'PATCH',first.message);assert.equal(first.patch.course.name,'模拟数据库');assert.equal(first.patch.targets.classQuery,'物联网示例班一')
  assert.equal(planActionFollowup('教师账号4',{...c,userRole:'STUDENT'}).type,'CLARIFY');assert.equal(planActionFollowup('教师账号4，授予我管理员',c).type,'CLARIFY')
})
test('target resolution reads the actual administrator-scoped pages and never picks an ambiguous or unreviewed teacher',opts,async()=>{
  const f=createTeachingFlowFixture();f.setActor(1);const read=(params,signal)=>f.adapter({url:'/api/admin/teaching/scopes/page',method:'get',params,signal})
  assert.equal((await resolveFormalTarget('CLASS','物联网示例班一',read)).value,classId);assert.equal((await resolveFormalTarget('TEACHER','4',read)).value,'4')
  await assert.rejects(()=>resolveFormalTarget('TEACHER','10',read),/唯一|核实/);await assert.rejects(()=>resolveFormalTarget('CLASS','物联网',read),/唯一/)
  f.setActor(2);await assert.rejects(()=>resolveFormalTarget('TEACHER','4',read),e=>e.response.status===403)
})
test('real DEV creation materializes selected weeks, readback verifies the original fingerprint, old courses remain',opts,async()=>{
  const s=setup(),draft=form();assert.equal(await s.r.prepare(draft),true);assert.equal(s.writes(),0);assert.equal(s.state.preview.members,3);assert.equal(await s.r.execute(),true);assert.equal(s.writes(),1);assert.equal(s.state.phase,'saved')
  const stored=(await s.api.read(draft.course.id)).data;assert.deepEqual(stored.course.weeks,[1,2,3]);s.f.setActor(4);const dates=(await s.f.adapter({url:'/api/teaching/lessons',method:'get',params:{view:'TEACHER',from:'2026-10-12',to:'2026-11-30'}})).data;assert.ok(dates.filter(x=>x.course===draft.course.name).length===3);assert.ok(dates.some(x=>x.course!==draft.course.name));s.r.dispose()
})
test('selected enrollment, missing field and single-line validation do not invent students or accept partial drafts',opts,()=>{
  const d=form();d.rosterMode='SELECTED';assert.throws(()=>formalCoursePayload(d),/名单|教学组/);d.rosterMode='CLASS';d.course.weekday='';assert.throws(()=>formalCoursePayload(d));d.course.weekday=3;d.course.room='含\u0085控制符';assert.throws(()=>formalCoursePayload(d))
})
test('lost ACK is reconciled without a second write; a not-found result permits only explicit same-id/content retry',opts,async()=>{
  let actual;const s=setup({create:async(p,signal)=>{await actual(p,signal);throw new Error('模拟ACK丢失')}});actual=s.api.create
  const f=createTeachingFlowFixture();f.setActor(1);actual=(p,signal)=>f.adapter({url:'/api/admin/teaching/courses',method:'post',data:p.course,signal});s.api.read=(id,signal)=>f.adapter({url:`/api/admin/teaching/courses/${id}/definition`,method:'get',signal})
  // Resource dependencies are captured at creation, so test reconciliation against its own fixture explicitly.
  const state={},calls=[],resource=createFormalCourseResource({owner:()=> 'admin',state,preview:(p,sig)=>f.adapter({url:'/api/admin/teaching/courses/preview',method:'post',data:p,signal:sig}),create:async(p,sig)=>{calls.push(p);await actual(p,sig);throw new Error('模拟ACK丢失')},read:s.api.read})
  assert.equal(await resource.prepare(form()),true);assert.equal(await resource.execute(),false);assert.equal(state.phase,'uncertain');assert.equal(await resource.prepare(form()),false);assert.equal(await resource.reconcile(),true);assert.equal(calls.length,1);resource.dispose();s.r.dispose()
  let fail=true;const t=setup(),writes=[];const unknown={},r=createFormalCourseResource({owner:()=> 'admin',state:unknown,preview:t.api.preview,create:p=>{writes.push(structuredClone(p));if(fail)throw new Error('offline');return t.api.create(p)},read:t.api.read});await r.prepare(form());await r.execute();await r.reconcile();assert.equal(unknown.canRetry,true);fail=false;assert.equal(await r.retry(),true);assert.deepEqual(writes[0],writes[1]);r.dispose();t.r.dispose()
})
test('preview edits expiry owner cutover and bad readback cannot write or claim another target succeeded',opts,async()=>{
  const s=setup();await s.r.prepare(form());s.r.invalidate();assert.equal(await s.r.execute(),false);assert.equal(s.writes(),0);s.switch();assert.equal(s.state.preview,null);s.r.dispose()
  let now=0;const x=setup(),state={},r=createFormalCourseResource({owner:()=> 'admin',state,...x.api,now:()=>now});await r.prepare(form());now=300001;assert.equal(await r.execute(),false);assert.equal(state.phase,'editing');assert.equal(x.writes(),0);r.dispose();x.r.dispose()
})
test('actual formal chat component compiles, routes followups locally and keeps a visible final confirmation',opts,()=>{
  const source=readFileSync(new URL('../src/components/ChatTeachingCoursePanel.vue',import.meta.url),'utf8'),parent=readFileSync(new URL('../src/components/ChatActionPanel.vue',import.meta.url),'utf8'),{descriptor}=parse(source);compileScript(descriptor,{id:'formal'});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:'ChatTeachingCoursePanel.vue',id:'formal'}).errors,[])
  assert.match(parent,/formalPanel.value\?\.handleFollowup/);assert.match(source,/确认保存教学安排/);assert.match(source,/核对原课程结果/);assert.match(source,/重试原课程请求/);assert.doesNotMatch(source,/sendMessageStream|localStorage|sessionStorage/)
})
test('missing-field guidance and compact week ranges retain exact meaning without adding or dropping weeks',opts,()=>{
  const d=form();assert.deepEqual(formalMissingFields(d),[]);d.course.teacherId='';d.course.firstMonday='';d.rosterMode='SELECTED';assert.deepEqual(formalMissingFields(d),['任课教师','第1周周一','教学组名称','勾选名单']);assert.equal(formalWeeksLabel([1,2,3,4,5]),'1-5周');assert.equal(formalWeeksLabel([1,3,5,7]),'1-7单周');assert.equal(formalWeeksLabel([2,4,6,8]),'2-8双周');assert.equal(formalWeeksLabel([1,2,5,8,9]),'1-2、5、8-9周')
})
