import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveChatAction } from '../src/utils/chatActions.js'
import { planLessonChangeFollowup } from '../src/utils/lessonChangeChat.js'
import { createLessonChangeResource } from '../src/utils/teachingLessonChanges.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { resolveFormalTarget } from '../src/utils/formalCourseDraft.js'
import { chinaDate, addDays } from '../src/utils/timetable.js'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const target={lessonId:'selected-lesson',name:'程序设计基础',date:'2026-10-18'}
const form={action:'RESCHEDULE',date:target.date,startTime:'14:00',endTime:'15:35',teacherId:'4',room:'F2-306',reason:''}
const context={active:true,scope:'admin-1',requestScope:'admin-1',busy:false,phase:'editing',loaded:true,userRole:'ADMIN',schoolId:1,target,form,today:'2026-10-18'}

test('existing lesson edits are a local allowlisted operation, never a new personal course', () => {
  for (const text of ['把今天的《程序设计基础》调到明天下午两点到三点半，原因：教学安排调整', '取消明天的《高等数学》这一节，原因：教学安排调整', '给这节课换任课教师，老师改为10']) {
    assert.equal(resolveChatAction(text)?.kind, 'TEACHING_LESSON_CHANGE', text)
  }
  assert.equal(resolveChatAction('新增课程《高等数学》')?.kind, 'PERSONAL_COURSE')
  assert.equal(resolveChatAction('调课规则是什么'), null)
  assert.equal(resolveChatAction('修改这段代码的课程字段'), null)
})
test('source selector and proposed date are separate slots, with human exact-target selection',()=>{
  const text='把今天的《程序设计基础》调到明天下午两点到三点半，教室F2-308，原因：教学安排调整'
  const query=planLessonChangeFollowup(text,{...context,target:null})
  assert.equal(query.type,'QUERY');assert.deepEqual(query.query,{from:'2026-10-18',to:'2026-10-18',search:'程序设计基础'})
  const plan=planLessonChangeFollowup(text,context)
  assert.equal(plan.type,'PATCH',plan.message)
  assert.deepEqual(plan.patch,{action:'RESCHEDULE',date:'2026-10-19',startTime:'14:00',endTime:'15:30',room:'F2-308',reason:'教学安排调整'})
  assert.equal(planLessonChangeFollowup(text,{...context,target:{...target,date:'2026-10-19'}}).type,'CLARIFY')
})
test('continuous fields reuse verified bells, reject ambiguities atomically, and never grant or write',()=>{
  const bells=planLessonChangeFollowup('明天，第7到8节，教室F2-308，原因：已核对教学安排',context)
  assert.equal(bells.type,'PATCH',bells.message)
  assert.deepEqual(bells.patch,{date:'2026-10-19',startTime:'15:50',endTime:'17:25',room:'F2-308',reason:'已核对教学安排'})
  const teacher=planLessonChangeFollowup('任课教师改为10，原因：代课安排',context)
  assert.equal(teacher.type,'PATCH',teacher.message);assert.equal(teacher.targets.teacherQuery,'10')
  for(const text of ['一点到两点，教室F2-308','第9到10节','下周，教室F2-308','第1到16周，教室F2-308','教室F2-308，设置我为管理员','明天和后天','取消这一节，教室F2-308','{"room":"F2-308"}'])assert.equal(planLessonChangeFollowup(text,context).type,'CLARIFY',text)
  assert.equal(planLessonChangeFollowup('第7到8节',{...context,schoolId:2}).type,'CLARIFY')
  assert.equal(planLessonChangeFollowup('确认保存',{...context,phase:'preview'}).type,'CONFIRM_BUTTON')
  for(const phase of ['uncertain','saving','saved'])assert.equal(planLessonChangeFollowup('教室F2-308',{...context,phase}).type,'CLARIFY')
  assert.equal(planLessonChangeFollowup('教室F2-308',{...context,requestScope:'other'}).type,'CLARIFY')
  assert.equal(planLessonChangeFollowup('教室F2-308',{...context,userRole:'TEACHER'}).type,'CLARIFY')
  assert.equal(planLessonChangeFollowup('取消操作',context).type,'CLOSE')
  const cancel=planLessonChangeFollowup('取消这一节，原因：已核对停课安排',context)
  assert.equal(cancel.type,'PATCH',cancel.message);assert.deepEqual(cancel.patch,{reason:'已核对停课安排',action:'CANCEL'})
})
test('literal stored titles survive punctuation normalization and cancellation dates refer to the original lesson',()=>{
  const name='计算机网络基础（模拟）',text=`把今天的《${name}》调到明天，第7到8节，原因：按规则核对`
  assert.ok(resolveChatAction(text)?.seed.instructions.includes(`《${name}》`))
  assert.equal(planLessonChangeFollowup(text,{...context,target:null}).query.search,name)
  assert.equal(planLessonChangeFollowup(text,{...context,target:{...target,name}}).type,'PATCH')
  const cancel=planLessonChangeFollowup(`取消今天的《${name}》这一节，原因：核对教学安排`,{...context,target:{...target,name}})
  assert.equal(cancel.type,'PATCH',cancel.message)
  assert.deepEqual(cancel.patch,{reason:'核对教学安排',action:'CANCEL'})
  assert.equal(planLessonChangeFollowup(`取消明天的《${name}》这一节，原因：核对教学安排`,{...context,target:{...target,name}}).type,'CLARIFY')
})
test('chat fields feed the same actual fixture API, invalidate preview, and require the separate real write step',{timeout:10000},async()=>{
  const f=createTeachingFlowFixture();f.setActor(1)
  const state={},writes=[],api=(path,method,data,signal,params)=>f.adapter({url:'/api/admin/teaching/lesson-changes'+path,method,data,signal,params})
  const r=createLessonChangeResource({owner:()=> 'admin1',actorId:()=>1,state,readAccess:s=>api('/access','get',null,s),readPage:(q,s)=>api('/page','get',null,s,q),readTarget:(id,s)=>api('/target/'+id,'get',null,s),preview:(p,s)=>api('/preview','post',p,s),save:(p,s)=>{writes.push(p);return api('','post',p,s)},readReceipt:(id,s)=>api('/requests/'+id,'get',null,s)})
  assert.equal(await r.access(),true)
  const today=chinaDate(),query={from:today,to:today,page:0,size:25,search:''}
  assert.equal(await r.list(query),true,state.error)
  const row=state.page.items.find(row=>row.course.startsWith('计算机网络'))
  const text=`把今天的《${row.course}》调到明天，第7到8节，教室F2-308，原因：合成课堂调整`
  const selector=planLessonChangeFollowup(text,{...context,today,target:null})
  assert.equal(await r.list({...query,...selector.query}),true,state.error);assert.equal(writes.length,0)
  // Even one matching row still requires this explicit target-selection call.
  assert.equal(await r.select(row.lessonId),true,state.error)
  const draft={action:'RESCHEDULE',date:state.target.date,startTime:state.target.startTime,endTime:state.target.endTime,teacherId:String(state.target.teacherId),room:state.target.room,reason:''}
  const first=planLessonChangeFollowup(text,{...context,today,target:state.target,form:draft})
  assert.equal(first.type,'PATCH',first.message);Object.assign(draft,first.patch)
  const id=crypto.randomUUID()
  assert.equal(await r.prepare(draft,id),true,state.error);assert.equal(writes.length,0)
  const before=structuredClone(draft)
  await assert.rejects(()=>resolveFormalTarget('TEACHER','10',(q,s)=>f.adapter({url:'/api/admin/teaching/scopes/page',method:'get',params:q,signal:s})),/不是唯一/)
  assert.deepEqual(draft,before)
  const second=planLessonChangeFollowup('教室F2-309，原因：已重新核对教室',{...context,today,target:state.target,form:draft,phase:'preview'})
  assert.equal(second.type,'PATCH',second.message);r.invalidate();Object.assign(draft,second.patch)
  assert.equal(await r.execute(),false);assert.equal(writes.length,0)
  assert.equal(await r.prepare(draft,id),true,state.error);assert.equal(writes.length,0)
  assert.equal(await r.execute(),true,state.error);assert.equal(writes.length,1)
  assert.equal(state.receipt.proposed.date,addDays(today,1));assert.equal(state.receipt.proposed.room,'F2-309')
  assert.equal(planLessonChangeFollowup('教室F2-310',{...context,phase:state.phase}).type,'CLARIFY')
  f.setActor(2)
  await assert.rejects(()=>api('/requests/'+id,'get'),e=>e.response?.status===403)
  r.dispose()
})
test('real shared panel and chat integration compile, keep owner fences and expose no conversational write method',()=>{
  for(const path of ['src/components/TeachingLessonChangesPanel.vue','src/components/ChatActionPanel.vue','src/views/ChatView.vue']){
    const code=readFileSync(new URL('../'+path,import.meta.url),'utf8'),{descriptor,errors}=parse(code);assert.deepEqual(errors,[])
    compileScript(descriptor,{id:path});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:path,filename:path}).errors,[])
  }
  const panel=readFileSync(new URL('../src/components/TeachingLessonChangesPanel.vue',import.meta.url),'utf8'),handler=panel.slice(panel.indexOf('async function handleFollowup'),panel.indexOf('\nwatch(',panel.indexOf('async function handleFollowup')))
  assert.doesNotMatch(handler,/resource\.execute|resource\.retry|saveLessonChange\(/)
  assert.match(handler,/before === JSON.stringify\(form\)/);assert.match(handler,/state.target === original/);assert.match(handler,/epoch !== followupEpoch/)
  const view=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8')
  assert.match(view,/action\?\.kind==='TEACHING_LESSON_CHANGE'&&!\['PERSONAL_MANAGE','SCHEDULE_SOURCE'\].includes\(workflow\?\.workflow\)/)
  assert.ok(view.indexOf('if(action){')<view.indexOf('const privateQuery ='))
})
