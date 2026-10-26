import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse,compileScript,compileTemplate } from '@vue/compiler-sfc'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { chinaDate,addDays } from '../src/utils/timetable.js'
import { createChangeNoticeResource,changeNoticeDestination } from '../src/utils/lessonChangeNotices.js'
const today=chinaDate(),root='/api/teaching/lesson-change-notices',base='/api/admin/teaching/lesson-changes',query={page:0,size:25,unreadOnly:true}
const call=(f,url,method='get',data,params)=>f.adapter({url,method,data,params})
async function change(f,id=null,teacher=4){
  f.setActor(1);const row=id?{lessonId:id}:(await call(f,base+'/page','get',null,{from:today,to:addDays(today,6),page:0,size:25,search:'计算机网络'})).data.items[0],t=(await call(f,base+'/target/'+row.lessonId)).data
  const payload={requestId:crypto.randomUUID(),lessonId:t.lessonId,revision:t.revision,sourceHash:t.sourceHash,action:id?'CANCEL':'RESCHEDULE',date:id?null:addDays(today,1),startTime:id?null:'15:50',endTime:id?null:'17:25',teacherId:id?null:teacher,room:id?null:'合成主入口新室',reason:'合成主入口核对',previewHash:null}
  payload.previewHash=(await call(f,base+'/preview','post',payload)).data.fingerprint;return(await call(f,base,'post',payload)).data
}
test('main-entry destination has only literal allowlisted lesson/view/date/return and never grants an asserted role',async()=>{
  const f=createTeachingFlowFixture();const saved=await change(f);f.setActor(2);const n=(await call(f,root,'get',null,query)).data.items[0]
  assert.deepEqual(changeNoticeDestination(n,['STUDENT']),{path:'/teaching',query:{lesson:saved.replacementLessonId,view:'STUDENT',date:addDays(today,1),return:'timetable'}})
  assert.equal(changeNoticeDestination(n,['TEACHER']),null);assert.equal(changeNoticeDestination({...n,view:'ADMIN'},['ADMIN']),null);assert.equal(changeNoticeDestination({...n,userId:1},['STUDENT']),null);assert.equal(changeNoticeDestination({...n,outdated:true,targetLessonId:null},['STUDENT']),null)
  f.setActor(4);const teacher=(await call(f,root,'get',null,query)).data.items[0];assert.equal(changeNoticeDestination(teacher,['TEACHER']).query.view,'TEACHER');assert.equal(changeNoticeDestination(teacher,['TEACHER']).query.lesson,saved.replacementLessonId)
  const g=createTeachingFlowFixture();g.setActor(1);await call(g,'/api/admin/teaching-identities/10000000-0000-4000-8000-000000015003/review','post',{revision:1,decision:'APPROVE',reason:'合成代课教师核对'});const moved=await change(g,null,10);g.setActor(4);const released=(await call(g,root,'get',null,query)).data.items[0];assert.equal(released.action,'RELEASED');assert.deepEqual(changeNoticeDestination(released,['TEACHER']),{path:'/teaching',query:{lesson:moved.original.lessonId,view:'TEACHER',date:moved.original.date,return:'timetable'}})
})
test('new unread events signal one refresh even within the same second, not each poll, read ACK, history page or cutover',async()=>{
  const f=createTeachingFlowFixture();f.setActor(2);let principal='viewer2';const events=[],state={},r=createChangeNoticeResource({owner:()=>principal,state,read:q=>call(f,root,'get',null,q),mark:id=>call(f,root+'/'+id+'/read','post'),onNew:e=>events.push(e)})
  await r.load(query);assert.equal(events.length,0)
  const first=await change(f);f.setActor(2);await r.load(query);assert.equal(events.length,1);assert.equal(events[0].owner,'viewer2')
  await r.load(query);await r.mark(state.data.items[0]);await r.load({...query,unreadOnly:false});assert.equal(events.length,1)
  await change(f,first.replacementLessonId);f.setActor(2);await r.load(query);assert.equal(events.length,2);await r.load(query);assert.equal(events.length,2)
  principal='viewer8';r.reset();f.setActor(8);await r.load(query);assert.equal(events.length,2);r.dispose();assert.equal(await r.load(query),false)
})
test('a new event never replaces a teacher draft, current detail, busy task or different-owner view',async()=>{
  const source=readFileSync(new URL('../src/views/TeachingView.vue',import.meta.url),'utf8'),start=source.indexOf('async function incomingLessonChange'),end=source.indexOf('\nfunction demoClockChanged',start),fn=source.slice(start,end)
  const context={disposed:false,owner:{value:'teacher'},busy:{value:false},dirty:{value:true},state:{detail:{lesson:{id:'current'}}},savedNotice:{value:''},loads:0,load:async()=>{context.loads++}},handler=runInNewContext('('+fn+')',context)
  await handler({owner:'teacher'});assert.equal(context.loads,0);assert.match(context.savedNotice.value,/未保存点名已保留/)
  context.dirty.value=false;await handler({owner:'teacher'});assert.equal(context.loads,0)
  context.state.detail=null;context.busy.value=true;await handler({owner:'teacher'});assert.equal(context.loads,0)
  context.busy.value=false;await handler({owner:'other'});assert.equal(context.loads,0)
  await handler({owner:'teacher'});assert.equal(context.loads,1)
})
test('primary timetable mounts the shared inbox, reuses its original minute poller and queues only necessary reloads',()=>{
  const source=readFileSync(new URL('../src/components/UnifiedWeekCalendar.vue',import.meta.url),'utf8'),{descriptor,errors}=parse(source);assert.deepEqual(errors,[]);compileScript(descriptor,{id:'unified'});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:'unified',filename:'UnifiedWeekCalendar.vue'}).errors,[])
  assert.match(source,/<TeachingChangeNotices/);assert.match(source,/state.week.teachingEnabled/);assert.match(source,/@new-change="changed"/)
  assert.equal((source.match(/createForegroundPoll\(\{/g)||[]).length,2);assert.match(source,/interval: 60000.*Promise\.all\(\[noticeResource.load\(\),changeNotices.value\?\.refresh\(\)\]\)/)
  assert.match(source,/if\(state.loading\|\|scopeState.loading\)\{refreshAfterChange=true;return\}/);assert.match(source,/if\(disposed\|\|owner.value!==principal\)return/)
  const handler=source.slice(source.indexOf('async function openChangedNotice'),source.indexOf('async function loadScopes'))
  assert.match(handler,/changeNoticeDestination/);assert.match(handler,/router.push\(destination\)/);assert.doesNotMatch(handler,/markTeachingNoticeRead|save|post\(|sendMessage/)
})
