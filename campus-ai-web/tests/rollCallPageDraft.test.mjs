import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {planOnTimePage,applyOnTimePage,undoOnTimePage,detachManualPageMark,onTimePageCandidates} from '../src/utils/rollCallPageDraft.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {createTeachingResource,rollCallProgress} from '../src/utils/teaching.js'
const opts={timeout:5000},id='10000000-0000-4000-8000-000000079000'
async function setup(){const f=createTeachingFlowFixture({largeClass:true});f.setActor(4);f.advanceTo('14:02');const state={lessons:[]},resource=createTeachingResource({owner:()=>String(f.principal().id),state,readDetailPage:(id,view,page,search)=>f.adapter({url:`/api/teaching/lessons/${id}/page`,params:{view,page,size:50,search}}),savePage:(id,data,page,search)=>f.adapter({url:`/api/teaching/lessons/${id}/attendance/page`,method:'put',data,params:{page,size:50,search}})});await resource.select(id,'TEACHER');return{f,state,resource,marks:Object.fromEntries(state.detail.entries.map(e=>[e.studentId,e.status]))}}
test('only current-page untouched unknowns enter a draft, not recorded values or manual absence and early leave',opts,async()=>{
  const s=await setup(),entries=s.state.detail.entries;s.marks[entries[0].studentId]='ABSENT';s.marks[entries[1].studentId]='EARLY_LEAVE';entries[2].status='LATE';s.marks[entries[2].studentId]='LATE'
  const plan=planOnTimePage('teacher:page0',s.state.detail,s.marks);assert.equal(plan.studentIds.length,47);assert.equal(s.marks[entries[3].studentId],'UNKNOWN')
  const undo=applyOnTimePage(plan,'teacher:page0',s.state.detail,s.marks);assert.equal(undo.studentIds.length,47);assert.equal(s.marks[entries[0].studentId],'ABSENT');assert.equal(s.marks[entries[1].studentId],'EARLY_LEAVE');assert.equal(s.marks[entries[2].studentId],'LATE');assert.equal(onTimePageCandidates(s.state.detail,s.marks).length,0)
  const stored=(await s.f.adapter({url:`/api/teaching/lessons/${id}/page`,params:{view:'TEACHER',page:0,size:50,search:''}})).data;assert.ok(stored.detail.entries.every(e=>e.status==='UNKNOWN'));assert.equal(stored.detail.lesson.counts.unknown,702)
})
test('scope version permission and manual changes invalidate an awaiting confirmation before any modification',opts,async()=>{
  const s=await setup(),d=s.state.detail,plan=planOnTimePage('teacher:page0',d,s.marks)
  assert.throws(()=>applyOnTimePage(plan,'student:page0',d,s.marks),/账号|发生变化/);assert.throws(()=>applyOnTimePage(plan,'teacher:page1',d,s.marks),/发生变化/)
  assert.throws(()=>applyOnTimePage(plan,'teacher:page0',{...d,lesson:{...d.lesson,revision:1}},s.marks),/发生变化/)
  s.marks[d.entries[0].studentId]='ABSENT';assert.throws(()=>applyOnTimePage(plan,'teacher:page0',d,s.marks),/发生变化/)
  for(const value of [{...d,canMark:false},{...d,lesson:{...d.lesson,cancelled:true}},{...d,lesson:{...d.lesson,finalized:true}}])assert.throws(()=>planOnTimePage('teacher',value,s.marks),/不能批量/)
  assert.equal(s.marks[d.entries[1].studentId],'UNKNOWN')
})
test('undo restores only this fill and explicitly detached later manual decisions remain untouched',opts,async()=>{
  const s=await setup(),d=s.state.detail,ids=d.entries.map(e=>e.studentId),plan=planOnTimePage('teacher',d,s.marks);let undo=applyOnTimePage(plan,'teacher',d,s.marks)
  s.marks[ids[0]]='ABSENT';undo=detachManualPageMark(undo,ids[0]);undo=detachManualPageMark(undo,ids[1]);s.marks[ids[1]]='ON_TIME'
  assert.equal(undoOnTimePage(undo,'teacher',d,s.marks),48);assert.equal(s.marks[ids[0]],'ABSENT');assert.equal(s.marks[ids[1]],'ON_TIME');assert.equal(s.marks[ids[2]],'UNKNOWN')
  assert.throws(()=>undoOnTimePage(undo,'other',d,s.marks),/撤销对象/)
})
test('a filled 50-person draft needs the separate real save and cannot finalize the remaining 652 people',opts,async()=>{
  const s=await setup(),d=s.state.detail;applyOnTimePage(planOnTimePage('teacher',d,s.marks),'teacher',d,s.marks)
  const p={revision:d.lesson.revision,marks:d.entries.map(e=>({studentId:e.studentId,status:s.marks[e.studentId]})),reason:'',finish:false}
  assert.equal(d.lesson.counts.unknown,702);assert.equal(rollCallProgress(d,s.marks).remaining,652)
  assert.equal(await s.resource.saveMarks(id,p),true);assert.equal(s.state.detail.lesson.counts.unknown,652);assert.equal(s.state.detail.lesson.finalized,false)
  await s.resource.select(id,'TEACHER',1);assert.ok(s.state.detail.entries.every(e=>e.status==='UNKNOWN'))
  s.f.setActor(2);await assert.rejects(s.f.adapter({url:`/api/teaching/lessons/${id}/attendance/page`,method:'put',params:{page:1,size:50,search:''},data:{...p,revision:1}}),e=>[403,404].includes(e.response.status))
})
test('the real handler waits for confirmation and cancels on owner cutover or unknown receipt without a save call',opts,async()=>{
  const s=await setup(),source=readFileSync(new URL('../src/views/TeachingView.vue',import.meta.url),'utf8'),fn=source.slice(source.indexOf('async function fillPageOnTime()'),source.indexOf('\nasync function undoPageFill',source.indexOf('async function fillPageOnTime()')))
  let principal='teacher',confirmResolve;const context={busy:{value:false},state:s.state,canMark:{value:true},reason:{value:''},marks:s.marks,pageFillScope:()=>principal,planOnTimePage,applyOnTimePage,teachingDate:()=> '合成日期',teachingClock:()=> '14:00',confirm:()=>new Promise(r=>confirmResolve=r),pageFillUndo:{value:null},savedNotice:{value:''}},handler=runInNewContext('('+fn+')',context)
  const pending=handler();assert.ok(s.state.detail.entries.every(e=>s.marks[e.studentId]==='UNKNOWN'));principal='other';confirmResolve(true);await pending;assert.equal(context.pageFillUndo.value,null);assert.ok(s.state.detail.entries.every(e=>s.marks[e.studentId]==='UNKNOWN'))
  s.state.writeBlocked=true;await handler();assert.equal(context.pageFillUndo.value,null)
  assert.doesNotMatch(fn,/saveMarks|saveRollCall|resource\.save|post\(|put\(/)
})
test('existing point-name component compiles with scoped human confirmation, separate undo and save, no new timer',opts,()=>{
  const source=readFileSync(new URL('../src/views/TeachingView.vue',import.meta.url),'utf8'),{descriptor,errors}=parse(source);assert.deepEqual(errors,[]);compileScript(descriptor,{id:'draft-fill'});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:'draft-fill',filename:'TeachingView.vue'}).errors,[])
  assert.match(source,/已核实，填草稿/);assert.match(source,/返回继续核对/);assert.match(source,/pageFillUndo.value=detachManualPageMark/);assert.match(source,/@click="markStudent\(entry.studentId,choice.value\)"/);assert.match(source,/:disabled="busy \|\| state.writeBlocked"/);assert.match(source,/pageFillUndo.value=null/)
  assert.match(source,/className:'ct-teaching-change-confirm'/);assert.match(source,/pageSaveAction.value\?\.focus\(\{preventScroll:true\}\)/)
  assert.match(source,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(source,/page-fill-actions > .teaching-button\{width:100%;min-width:0;min-height:48px/)
  assert.equal((source.match(/createForegroundPoll\(\{/g)||[]).length,1)
})
