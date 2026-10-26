import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate,addDays,mondayOf} from '../src/utils/timetable.js'
import {validatedChangeNotice,validatedChangeNoticePage,createChangeNoticeResource} from '../src/utils/lessonChangeNotices.js'
const opts={timeout:12000},today=chinaDate(),root='/api/teaching/lesson-change-notices',changes='/api/admin/teaching/lesson-changes',query={page:0,size:25,unreadOnly:true},uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const call=(f,path,method='get',data,params,signal)=>f.adapter({url:path,method,data,params,signal})
async function changed(f,action='RESCHEDULE',targetId=null){
  f.setActor(1)
  const row=targetId?{lessonId:targetId}:(await call(f,changes+'/page','get',null,{from:today,to:addDays(today,6),page:0,size:25,search:'计算机网络'})).data.items[0]
  const target=(await call(f,changes+'/target/'+row.lessonId)).data,payload={requestId:crypto.randomUUID(),lessonId:target.lessonId,revision:target.revision,sourceHash:target.sourceHash,action,date:null,startTime:null,endTime:null,teacherId:null,room:null,reason:'仅管理员可见的模拟内部依据',previewHash:null}
  if(action==='RESCHEDULE')Object.assign(payload,{date:addDays(today,1),startTime:'15:50',endTime:'17:25',teacherId:4,room:'模拟变更F2-309'})
  payload.previewHash=(await call(f,changes+'/preview','post',payload)).data.fingerprint
  const receipt=(await call(f,changes,'post',payload)).data
  return{receipt,payload}
}
function resource(f,overrides={}){const state={},files=[];let principal='student2';const r=createChangeNoticeResource({owner:()=>principal,state,read:(q,s)=>call(f,root,'get',null,q,s),mark:(id,s)=>call(f,root+'/'+id+'/read','post',null,null,s),...overrides});return{r,state,files,cutover(){principal='other';r.reset()}}}
test('actual DEV recipients get sanitized current-authority notices, with one stable message and persistent read state',opts,async()=>{
  const f=createTeachingFlowFixture();const {receipt,payload}=await changed(f);f.setActor(2)
  const {r,state}=resource(f);assert.equal(await r.load(query),true,state.error);assert.equal(state.data.total,1)
  const row=state.data.items[0];assert.equal(row.view,'STUDENT');assert.equal(row.targetLessonId,receipt.replacementLessonId);assert.equal(row.proposed.room,'模拟变更F2-309');assert.equal(JSON.stringify(row).includes(payload.reason),false)
  assert.equal(await r.mark(row),true,state.error);assert.equal(state.data.total,0);assert.match(state.notice,/已标为已读/)
  assert.equal(await r.load({...query,unreadOnly:false}),true);const read=state.data.items[0];assert.ok(read.readAt)
  f.setActor(1);await call(f,changes,'post',payload);f.setActor(2);assert.equal((await call(f,root,'get',null,{...query,unreadOnly:false})).data.items[0].readAt,read.readAt)
  for(const actor of [1,5,6,8]){f.setActor(actor);assert.equal((await call(f,root,'get',null,query)).data.total,0)}r.dispose()
})
test('a superseding cancellation hides the old proposal but retains its record and previous read status',opts,async()=>{
  const f=createTeachingFlowFixture(),{receipt}=await changed(f);f.setActor(2);const old=(await call(f,root,'get',null,query)).data.items[0]
  await changed(f,'CANCEL',receipt.replacementLessonId);f.setActor(2);const page=validatedChangeNoticePage((await call(f,root,'get',null,query)).data,query)
  assert.equal(page.total,1);assert.equal(page.items[0].action,'CANCEL');assert.equal(page.items[0].proposed,null);await assert.rejects(()=>call(f,root+'/'+old.id+'/read','post'),e=>e.response?.status===404)
  assert.equal(f.audit().filter(h=>h.action==='LESSON_CHANGE').length,2)
})
test('real fixture creates twenty-six independent events and pages the complete recipient range instead of slicing a first response',opts,async()=>{
  const f=createTeachingFlowFixture();f.setActor(1)
  for(let i=0;i<26;i++){
    const id=crypto.randomUUID(),course={id,classId:uid(10),teacherId:4,name:'合成通知分页'+i,semester:'合成学期',firstMonday:mondayOf(today),weekday:(new Date(today+'T00:00:00Z').getUTCDay()||7),startTime:'15:50',endTime:'16:35',weeks:[1],room:'合成分页教室'}
    await call(f,'/api/admin/teaching/courses','post',course)
    const row=(await call(f,changes+'/page','get',null,{from:today,to:today,page:0,size:25,search:course.name})).data.items[0];await changed(f,'CANCEL',row.lessonId)
  }
  f.setActor(2);const first=validatedChangeNoticePage((await call(f,root,'get',null,query)).data,query),second=validatedChangeNoticePage((await call(f,root,'get',null,{...query,page:1})).data,{...query,page:1})
  assert.equal(first.total,26);assert.equal(first.totalPages,2);assert.equal(second.items.length,1);assert.equal(new Set([...first.items,...second.items].map(n=>n.id)).size,26)
})
test('wrong action, permission projection, unknown private fields and inconsistent pagination are rejected',opts,async()=>{
  const f=createTeachingFlowFixture();await changed(f);f.setActor(2);const data=(await call(f,root,'get',null,query)).data,row=data.items[0]
  for(const patch of [{reason:'must never reach the UI'},{view:'ADMIN'},{action:'RELEASED',proposed:null},{targetLessonId:'bad'},{outdated:true},{readAt:'2000-01-01T00:00:00Z'}])assert.throws(()=>validatedChangeNotice({...row,...patch}))
  for(const patch of [{total:26},{items:[row,row]},{unreadOnly:false},{from:'2026-02-30'}])assert.throws(()=>validatedChangeNoticePage({...data,...patch},query))
})
test('late reads and mark results cannot cross account scope or revive after disposal',opts,async()=>{
  const f=createTeachingFlowFixture();await changed(f);f.setActor(2);let done,signal
  const {r,state,cutover}=resource(f,{read:(_q,s)=>{signal=s;return new Promise(resolve=>done=resolve)}}),pending=r.load(query),data=(await call(f,root,'get',null,query)).data
  cutover();assert.equal(signal.aborted,true);done({data});assert.equal(await pending,false);assert.equal(state.data,null);assert.equal(state.notice,'');r.dispose();assert.equal(await r.load(query),false)
})
test('read ACK is validated and acknowledged-read refresh failure is not presented as a failed save',opts,async()=>{
  const f=createTeachingFlowFixture();await changed(f);f.setActor(2);let reads=0
  const {r,state}=resource(f,{read:async(q,s)=>{if(++reads>1)throw new Error('合成列表读取中断');return call(f,root,'get',null,q,s)}})
  await r.load(query);const row=state.data.items[0];assert.equal(await r.mark(row),false);assert.match(state.notice,/已读已保存/);assert.equal(state.data,null);assert.ok((await call(f,root,'get',null,{...query,unreadOnly:false})).data.items[0].readAt);r.dispose()
  const g=createTeachingFlowFixture();await changed(g);g.setActor(2);let marked=0
  const bad=resource(g,{mark:(_id)=>{marked++;return{data:{...bad.state.data.items[0],id:crypto.randomUUID(),readAt:new Date().toISOString()}}}});await bad.r.load(query);assert.equal(await bad.r.mark(bad.state.data.items[0]),false);assert.equal(marked,1);assert.equal(bad.state.data,null);assert.match(bad.state.notice,/尚未核对/);bad.r.dispose()
})
test('a duplicate click cannot dispatch twice and a late acknowledged mark cannot annotate a new account',opts,async()=>{
  const f=createTeachingFlowFixture();await changed(f);f.setActor(2);let release,calls=0,signal
  const stateful=resource(f,{mark:async(id,s)=>{calls++;signal=s;const accepted=await call(f,root+'/'+id+'/read','post');return new Promise(resolve=>release=()=>resolve(accepted))}})
  await stateful.r.load(query);const row=stateful.state.data.items[0],pending=stateful.r.mark(row)
  assert.equal(await stateful.r.mark(row),false)
  // Let the actual adapter acknowledge before delivering its result to the old component.
  await Promise.resolve();assert.equal(calls,1);stateful.cutover();assert.equal(signal.aborted,true);release();assert.equal(await pending,false);assert.equal(stateful.state.data,null);assert.equal(stateful.state.notice,'')
  assert.ok((await call(f,root,'get',null,{...query,unreadOnly:false})).data.items[0].readAt);stateful.r.dispose()
})
test('new notice surface compiles, owns no poller or model path, and parent reuses the existing foreground polling schedule',opts,()=>{
  const code=readFileSync(new URL('../src/components/TeachingChangeNotices.vue',import.meta.url),'utf8'),{descriptor,errors}=parse(code);assert.deepEqual(errors,[]);compileScript(descriptor,{id:'notice'});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:'notice',filename:'TeachingChangeNotices.vue'}).errors,[])
  assert.match(code,/font-size:16px/);assert.match(code,/min-height:44px/);assert.match(code,/flush:'sync'/);assert.doesNotMatch(code,/setInterval|setTimeout|sendMessage|localStorage|sessionStorage|v-html/)
  const parent=readFileSync(new URL('../src/views/TeachingView.vue',import.meta.url),'utf8');assert.match(parent,/Promise\.all\(\[readTeachingNotices\(signal\),changeNotices.value\?\.refresh\(\)\]\)/);assert.match(parent,/async function openChangedLesson/);assert.match(parent,/state.access\?\.views.includes\(notice.view\)/)
  const opening=parent.slice(parent.indexOf('async function openChangedLesson'),parent.indexOf('function demoClockChanged'))
  assert.match(opening,/force:true,intent:captureAuditFocusIntent\(window\)/);assert.match(opening,/await nextTick\(\);focusPendingDetail\(\)/)
  assert.match(parent,/request.intent&&!request.intent.current\(\)/);assert.match(parent,/scrollMarginTop='100px'/);assert.match(parent,/@after-enter="focusPendingDetail"/)
})
