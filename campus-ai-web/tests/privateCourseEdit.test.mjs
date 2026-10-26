import test from 'node:test'
import assert from 'node:assert/strict'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {normalizeCourses,courseKey} from '../src/utils/courseSchedule.js'
import {privateCourseEditPlan,privateCourseEditForm,privateCourseEditFollowup,createPrivateCourseEdit} from '../src/utils/privateCourseEdit.js'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {reactive} from 'vue'
import {runInNewContext} from 'node:vm'
import {resolveTeachingWorkflow,teachingWorkflowDestination} from '../src/utils/teachingWorkflows.js'
const opts={timeout:5000},stamp='2026-10-12T08:00:00+08:00'
const snapshot=()=>({revision:1,semester:'合成学期',firstMonday:'2026-10-12',remindDays:7,importedAt:stamp,checkedAt:stamp,courses:normalizeCourses([{name:'网络（合成）',weekday:1,startTime:'08:30',endTime:'10:05',weeks:[1,2,3,4],room:'合成A'},{name:'体育（合成）',weekday:3,startTime:'14:00',endTime:'15:35',weeks:[1,2,3,4],room:'合成B'}])})
const input=(s,patch={})=>({...privateCourseEditForm(s.courses[0]),room:'合成新室',...patch})
async function setup(overrides={}){
  const f=createTeachingFlowFixture();let owner='viewer2',writes=0,clock=1000,adopted=null,clears=0
  const call=(method,data)=>f.adapter({url:'/api/timetable/courses',method,data})
  const old=(await call('get')).data.schedule,s=snapshot();await call('put',{...s,revision:old.revision})
  const state=reactive({}),api={read:async()=>call('get'),write:async p=>{writes++;return call('put',p)},...overrides}
  const r=createPrivateCourseEdit({owner:()=>owner,state,read:(...args)=>api.read(...args),write:(...args)=>api.write(...args),adopt:s=>adopted=s,clearCache:()=>{clears++},now:()=>clock})
  await r.load();r.select(courseKey(state.snapshot.courses[0]))
  return{f,r,state,api,call,writes:()=>writes,adopted:()=>adopted,clears:()=>clears,setClock:v=>clock=v,cutover:()=>{owner='viewer8';f.setActor(8);r.reset()}}
}
test('partial-week edit splits one original row and preserves all unaffected weeks courses and metadata',opts,()=>{
  const s=snapshot(),before=JSON.stringify(s),p=privateCourseEditPlan(s,courseKey(s.courses[0]),input(s,{weeks:'2;4'}))
  assert.equal(p.payload.courses.length,3);assert.deepEqual(p.remainingWeeks,[1,3]);assert.deepEqual(p.changed.weeks,[2,4]);assert.equal(p.payload.semester,s.semester);assert.equal(p.payload.firstMonday,s.firstMonday);assert.equal(p.payload.remindDays,7)
  assert.ok(p.payload.courses.some(c=>c.room==='合成A'&&String(c.weeks)==='1,3'));assert.ok(p.payload.courses.some(c=>courseKey(c)===courseKey(s.courses[1])));assert.equal(JSON.stringify(s),before)
  assert.equal(privateCourseEditPlan(s,courseKey(s.courses[0]),input(s)).payload.courses.length,2)
})
test('invalid scope duplicates new conflicts and overflow reject without truncating the source',opts,()=>{
  const s=snapshot(),key=courseKey(s.courses[0]);assert.throws(()=>privateCourseEditPlan(s,key,input(s,{weeks:'5'})),/已有周次/);assert.throws(()=>privateCourseEditPlan(s,key,privateCourseEditForm(s.courses[0])),/没有变化/)
  assert.throws(()=>privateCourseEditPlan(s,key,input(s,{weekday:3,startTime:'14:00',endTime:'15:35'})),/时间重叠/)
  assert.throws(()=>privateCourseEditPlan(s,key,{...privateCourseEditForm(s.courses[1])}),/完全重复/)
  const full={...s,courses:normalizeCourses(Array.from({length:120},(_,i)=>({...s.courses[0],name:`合成${i}`,weeks:[1,2]})))}
  assert.throws(()=>privateCourseEditPlan(full,courseKey(full.courses[0]),{...privateCourseEditForm(full.courses[0]),weeks:'1',room:'新室'}),/超过120/)
  // Equal conflict counts are not sufficient: a new counterpart must still be caught.
  const mixed={...s,courses:normalizeCourses([{...s.courses[0],name:'目标'},{...s.courses[0],name:'旧冲突'},{...s.courses[1],name:'新冲突'}])},target=mixed.courses.find(c=>c.name==='目标')
  assert.throws(()=>privateCourseEditPlan(mixed,courseKey(target),{...privateCourseEditForm(target),weekday:3,startTime:'14:00',endTime:'15:35',room:'新室'}),/时间重叠/)
})
test('normal own API preview reads only then an explicit save rereads revision and verifies every resulting course',opts,async()=>{
  const s=await setup(),original=JSON.parse(JSON.stringify(s.state.snapshot)),form=input(original,{weeks:'2;4'})
  assert.equal(await s.r.execute(),false);assert.equal(await s.r.prepare(form),true);assert.equal(s.writes(),0);assert.match(s.state.preview.fingerprint,/^[a-f0-9]{64}$/)
  assert.equal(await s.r.execute(),true);assert.equal(s.writes(),1);assert.equal(s.state.verified,true);assert.equal(s.state.phase,'saved');assert.equal(s.adopted().courses.length,3)
  assert.match(s.state.notice,/第2、4周/);assert.match(s.state.notice,/原第1、3周/);assert.match(s.state.notice,/合成新室/)
  assert.deepEqual((await s.call('get')).data.schedule.courses,s.adopted().courses);assert.equal(s.f.audit().length,0);assert.equal(await s.r.execute(),false);assert.equal(s.writes(),1)
})
test('changed sources field edits and expired previews cannot submit',opts,async()=>{
  const s=await setup(),form=input(s.state.snapshot);await s.r.prepare(form);s.r.invalidate();assert.equal(await s.r.execute(),false);assert.equal(s.writes(),0)
  await s.r.prepare(form);s.setClock(302000);assert.equal(await s.r.execute(),false);assert.match(s.state.error,/5分钟/)
  s.setClock(303000);await s.r.prepare(form);const current=(await s.call('get')).data.schedule;await s.call('put',{...current,courses:[...current.courses,{name:'另页合成新增',weekday:6,startTime:'10:20',endTime:'11:55',weeks:[1],room:''}]})
  assert.equal(await s.r.execute(),false);assert.equal(s.writes(),0);assert.match(s.state.error,/保存前原课表已变化/)
})
test('lost ACK freezes without a second write and current data can be reconciled using only a normal own GET',opts,async()=>{
  const s=await setup(),write=s.api.write;await s.r.prepare(input(s.state.snapshot));s.api.write=async p=>{await write(p);throw new Error('合成丢ACK')}
  assert.equal(await s.r.execute(),false);assert.equal(s.state.phase,'uncertain');assert.equal(s.writes(),1);assert.equal(await s.r.execute(),false);assert.equal(await s.r.prepare(input(s.state.snapshot)),false);assert.equal(s.writes(),1)
  assert.equal(await s.r.reconcile(),true);assert.equal(s.state.verified,true);assert.match(s.state.notice,/没有重复/);assert.equal(s.writes(),1)
})
test('unchanged or wrong successful data cannot be claimed as the edited schedule',opts,async()=>{
  const s=await setup(),before=(await s.call('get')).data.schedule;await s.r.prepare(input(s.state.snapshot));s.api.write=async()=>({data:{schedule:before}})
  assert.equal(await s.r.execute(),false);assert.equal(s.state.phase,'uncertain');assert.equal(await s.r.reconcile(),false);assert.match(s.state.error,/不能认定/);assert.equal(s.adopted(),null)
})
test('acknowledged write with a failed reread is truthful and cannot be sent again',opts,async()=>{
  const s=await setup(),write=s.api.write,read=s.api.read;await s.r.prepare(input(s.state.snapshot))
  s.api.write=async p=>{const result=await write(p);s.api.read=async()=>{throw new Error('合成刷新失败')};return result}
  assert.equal(await s.r.execute(),true);assert.equal(s.state.phase,'saved');assert.equal(s.state.verified,false);assert.match(s.state.notice,/收到一致的保存回执.*重新读取失败/);assert.equal(s.clears(),1);assert.equal(s.writes(),1);assert.equal(await s.r.execute(),false);s.api.read=read
})
test('a real optimistic-write race rejects the old version and preserves the other writer',opts,async()=>{
  const s=await setup(),write=s.api.write,form=input(s.state.snapshot);await s.r.prepare(form)
  s.api.write=async p=>{await s.call('put',{...p,courses:p.courses.map((c,i)=>i===0?{...c,room:'另一个页面合成室'}:c)});return write(p)}
  assert.equal(await s.r.execute(),false);assert.equal(s.state.phase,'editing');assert.match(s.state.error,/版本已变化/);assert.equal(s.writes(),1)
  assert.equal((await s.call('get')).data.schedule.courses[0].room,'另一个页面合成室');assert.equal(await s.r.prepare(form),false);assert.match(s.state.error,/来源或版本已变化/)
})
test('a newer edit after the ACK is adopted as latest data but never falsely called the confirmed preview',opts,async()=>{
  const s=await setup(),write=s.api.write;await s.r.prepare(input(s.state.snapshot))
  s.api.write=async p=>{const ack=await write(p);await s.call('put',{...ack.data.schedule,courses:ack.data.schedule.courses.map((c,i)=>i===0?{...c,room:'后续合成更正'}:c)});return ack}
  assert.equal(await s.r.execute(),true);assert.equal(s.state.phase,'saved');assert.equal(s.state.verified,false);assert.match(s.state.notice,/随后已有其他变化/);assert.equal(s.adopted().courses[0].room,'后续合成更正');assert.equal(s.writes(),1)
})
test('an already accepted write may finish after cutover but its ACK cannot populate another account',opts,async()=>{
  const s=await setup(),write=s.api.write;await s.r.prepare(input(s.state.snapshot));let release,enteredResolve
  const entered=new Promise(r=>enteredResolve=r)
  s.api.write=async p=>{const ack=await write(p);enteredResolve();return new Promise(r=>release=()=>r(ack))}
  const task=s.r.execute();await entered;s.cutover();release();assert.equal(await task,false);assert.equal(s.state.snapshot,null);assert.equal(s.state.preview,null);assert.equal(s.adopted(),null);assert.equal(s.writes(),1);assert.equal((await s.call('get')).data.schedule,null)
  s.f.setActor(2);assert.equal((await s.call('get')).data.schedule.courses[0].room,'合成新室')
})
test('late own reads cannot repopulate another account and no fields are sent to a teaching or knowledge endpoint',opts,async()=>{
  const s=await setup(),form=input(s.state.snapshot);let resolve;s.api.read=()=>new Promise(r=>resolve=r);const task=s.r.prepare(form);const saved=s.state.snapshot;s.cutover();resolve({data:{schedule:saved}});assert.equal(await task,false);assert.equal(s.state.snapshot,null);assert.equal(s.state.preview,null);assert.equal(s.writes(),0)
})
test('continuous field slots preserve week intent and clarify natural single dates instead of editing every week',opts,()=>{
  const form=privateCourseEditForm(snapshot().courses[0]),context={scope:'own',requestScope:'own',active:true,selected:true,loaded:true,phase:'editing',form,periodMode:false}
  const patch=privateCourseEditFollowup('周二，下午两点到三点半，第2到3周，教室1号楼105',context);assert.equal(patch.type,'PATCH');assert.equal(patch.patch.course.weekday,2);assert.equal(patch.patch.course.startTime,'14:00');assert.equal(patch.patch.course.weeks,'2-3');assert.equal(patch.patch.course.room,'1号楼105')
  assert.equal(privateCourseEditFollowup('明天教室改为合成C',context).type,'CLARIFY');assert.equal(privateCourseEditFollowup('两点到三点',context).type,'CLARIFY');assert.equal(privateCourseEditFollowup('任课教师张某',context).patch.course.teacher,'张某');assert.equal(privateCourseEditFollowup('任课教师账号改为4',context).type,'CLARIFY')
  assert.equal(privateCourseEditFollowup('取消',{...context,selected:false}).type,'CANCEL');assert.equal(privateCourseEditFollowup('教室C',{...context,selected:false}).type,'CLARIFY')
})
test('new private editor compiles and local handoff cannot publish a course edit or authorize a formal teaching scope',opts,()=>{
  for(const file of ['src/components/ChatPrivateCourseEditPanel.vue','src/components/ChatActionPanel.vue','src/views/ChatView.vue']){const {descriptor,errors}=parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));assert.deepEqual(errors,[]);compileScript(descriptor,{id:file});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:file,filename:file}).errors,[])}
  const opts={today:'2026-10-18',scope:'own'},intent=resolveTeachingWorkflow('修改我自己导入的课表',opts);assert.equal(intent.handoff,'PERSONAL_COURSE_EDIT');assert.equal(teachingWorkflowDestination(intent),null)
  const ambiguous={...resolveTeachingWorkflow('修改课表',opts),scope:'own'};assert.equal(resolveTeachingWorkflow('个人导入',{...opts,previous:ambiguous}).handoff,'PERSONAL_COURSE_EDIT');assert.equal(resolveTeachingWorkflow('正式教学',{...opts,previous:ambiguous}).handoff,'TEACHING_LESSON_CHANGE')
  const panel=readFileSync(new URL('../src/components/ChatPrivateCourseEditPanel.vue',import.meta.url),'utf8');assert.match(panel,/read:readCourseSchedule,write:saveCourseSchedule/);assert.match(panel,/仅修改这些周次/);assert.match(panel,/CONFIRM_BUTTON/);assert.match(panel,/className:'ct-teaching-change-confirm'/);assert.doesNotMatch(panel,/localStorage|sessionStorage|sendMessageStream|knowledge|readTeaching/)
})
test('newly rendered editor and preview focus targets are resolved after nextTick, not stale undefined refs',opts,async()=>{
  const source=readFileSync(new URL('../src/components/ChatPrivateCourseEditPanel.vue',import.meta.url),'utf8'),fn=source.slice(source.indexOf('async function locate('),source.indexOf('\nasync function choose'))
  const calls=[],feedback={value:null};let owner='a';const element={focus:()=>calls.push('focus'),scrollIntoView:()=>calls.push('scroll')}
  const handler=runInNewContext('('+fn+')',{owner:()=>owner,feedback,nextTick:async()=>{feedback.value=element}});await handler();assert.deepEqual(calls,['focus','scroll'])
  calls.length=0;const cutover=runInNewContext('('+fn+')',{owner:()=>owner,feedback,nextTick:async()=>{owner='b'}});await cutover(()=>element);assert.deepEqual(calls,[])
  assert.match(source,/locate\(\(\)=>editHeading.value\)/);assert.match(source,/locate\(\(\)=>confirmButton.value\)/)
})
test('missing or malformed digest support cannot create an executable private edit preview',opts,async()=>{
  const value=snapshot(),state=reactive({});let writes=0
  for(const digest of [async()=>{throw new Error('合成HTTPS校验不可用')},async()=> 'not-a-sha']){
    const r=createPrivateCourseEdit({owner:()=> 'own',state,read:async()=>({data:{schedule:value}}),write:async()=>{writes++},digest})
    await r.load();r.select(courseKey(state.snapshot.courses[0]));assert.equal(await r.prepare(input(value)),false);assert.equal(state.preview,null);assert.equal(await r.execute(),false);assert.equal(writes,0);r.dispose()
  }
})
