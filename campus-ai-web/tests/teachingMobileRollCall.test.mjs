import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { createTeachingResource, rollCallProgress } from '../src/utils/teaching.js'

const options={timeout:5000},id='10000000-0000-4000-8000-000000079000'
function setup(overrides={}) {
  const fixture=createTeachingFlowFixture({largeClass:true})
  fixture.setActor(4);fixture.advanceTo('14:02')
  let owner='teacher-session-a',writes=0
  const state={lessons:[]},read=(id,view,page,search)=>fixture.adapter({url:`/api/teaching/lessons/${id}/page`,params:{view,page,size:50,search}})
  const write=(id,data,page,search)=>{writes++;return fixture.adapter({url:`/api/teaching/lessons/${id}/attendance/page`,method:'put',data,params:{page,size:50,search}})}
  const resource=createTeachingResource({owner:()=>owner,state,readDetailPage:read,savePage:write,...overrides})
  return {fixture,state,resource,read,write,writes:()=>writes,changeAccount:()=>{owner='student-session-b';fixture.setActor(2);resource.reset()}}
}
const payload=(state,finish=false)=>({revision:state.detail.lesson.revision,marks:state.detail.entries.map(e=>({studentId:e.studentId,status:'ON_TIME'})),reason:'',finish})

test('visible progress includes draft choices but keeps the entire 702-person completion boundary',options,async()=>{
  const s=setup();await s.resource.select(id,'TEACHER')
  const draft=Object.fromEntries(s.state.detail.entries.map(e=>[e.studentId,'ON_TIME']))
  assert.deepEqual(rollCallProgress(s.state.detail,draft),{total:50,recorded:50,pending:0,changed:50,remaining:652})
  draft[s.state.detail.entries[0].studentId]='UNKNOWN'
  assert.deepEqual(rollCallProgress(s.state.detail,draft),{total:50,recorded:49,pending:1,changed:49,remaining:653})
  assert.equal(await s.resource.saveMarks(id,payload(s.state,true)),false)
  assert.equal(s.state.detail.lesson.counts.unknown,702)
  assert.equal(s.state.writeBlocked,false)
  assert.equal(await s.resource.saveMarks(id,payload(s.state)),true)
  assert.equal(s.state.detail.lesson.finalized,false)
  assert.equal(s.state.detail.lesson.counts.unknown,652)
  await s.resource.select(id,'TEACHER',1)
  assert.equal(s.state.detail.entries[0].name,'合成同学1-051')
  assert.equal(rollCallProgress(s.state.detail,{}).pending,50)
})

test('a committed write with a lost response is blocked until a fresh authorized read, not sent twice',options,async()=>{
  const s=setup(),original=s.write
  const state={lessons:[]},resource=createTeachingResource({owner:()=> 'teacher',state,readDetailPage:s.read,savePage:async(...args)=>{await original(...args);throw new Error('模拟断网：响应丢失')}})
  await resource.select(id,'TEACHER')
  const input=payload(state),before=state.detail
  assert.equal(await resource.saveMarks(id,input),false)
  assert.equal(state.detail,before);assert.equal(state.writeBlocked,true)
  assert.match(state.error,/结果尚未确认.*重新核对.*不要重复提交/)
  assert.equal(await resource.saveMarks(id,input),false);assert.equal(s.writes(),1)
  await resource.select(id,'TEACHER')
  assert.equal(state.writeBlocked,false);assert.equal(state.detail.lesson.revision,1)
  assert.ok(state.detail.entries.every(e=>e.status==='ON_TIME'))
})

test('wrong successful receipt does not clear choices or claim saved, even at an allowed revision',options,async()=>{
  const s=setup(),state={lessons:[]},resource=createTeachingResource({owner:()=> 'teacher',state,readDetailPage:s.read,savePage:()=>s.read(id,'TEACHER',0,'')})
  await resource.select(id,'TEACHER');const before=state.detail
  assert.equal(await resource.saveMarks(id,payload(state)),false)
  assert.equal(state.detail,before);assert.equal(state.writeBlocked,true)
  assert.match(state.error,/回执.*不一致/)
})

test('a conflict remains a held draft and account changes clear both the draft boundary and blocked receipt',options,async()=>{
  const s=setup({savePage:async()=>{throw {response:{status:409}}}})
  await s.resource.select(id,'TEACHER');const before=s.state.detail
  assert.equal(await s.resource.saveMarks(id,payload(s.state)),false)
  assert.equal(s.state.detail,before);assert.equal(s.state.writeBlocked,true)
  s.changeAccount();assert.equal(s.state.detail,null);assert.equal(s.state.writeBlocked,false)
  await s.resource.select(id,'TEACHER')
  assert.equal(s.state.detail,null);assert.match(s.state.error,/没有该负责范围/)
})

test('all 15 pages can be recorded without completing early; a reasoned correction retains old evidence',options,async()=>{
  const s=setup()
  for(let page=0;page<15;page++) {
    await s.resource.select(id,'TEACHER',page)
    assert.equal(await s.resource.saveMarks(id,payload(s.state,page===14)),true)
    assert.equal(s.state.detail.lesson.finalized,page===14)
  }
  assert.equal(s.state.detail.lesson.counts.unknown,0)
  await s.resource.select(id,'TEACHER',0)
  const input=payload(s.state),student=s.state.detail.entries[0].studentId
  input.marks[0].status='EARLY_LEAVE'
  assert.equal(await s.resource.saveMarks(id,input),false)
  input.reason='模拟：经课堂核对确认提前离开'
  assert.equal(await s.resource.saveMarks(id,input),true)
  const history=s.fixture.audit().filter(e=>e.studentId===student)
  assert.equal(history.length,2);assert.equal(history[1].old,'ON_TIME');assert.equal(history[1].status,'EARLY_LEAVE')
  assert.equal(s.state.detail.lesson.finalized,true)
})

test('the mobile save dock is one real form with explicit progress, paging, reconciliation, and native validation',options,()=>{
  const source=readFileSync(new URL('../src/views/TeachingView.vue',import.meta.url),'utf8'),{descriptor,errors}=parse(source)
  assert.deepEqual(errors,[]);compileScript(descriptor,{id:'mobile-call'})
  assert.deepEqual(compileTemplate({source:descriptor.template.content,id:'mobile-call',filename:'TeachingView.vue'}).errors,[])
  assert.equal((source.match(/aria-label="点名保存与翻页"/g)||[]).length,1)
  assert.match(source,/position: sticky;\s*bottom: 0/)
  assert.match(source,/env\(safe-area-inset-bottom\)/)
  assert.match(source,/保存并下一页/);assert.match(source,/名单就近翻页/)
  assert.match(source,/state\.writeBlocked/);assert.match(source,/重新核对保存结果/)
  assert.match(source,/advance && !state\.error && owner\.value===principal/)
  assert.match(source,/correctionRequired\.value && !reason\.value\.trim\(\)/)
  assert.doesNotMatch(source,/localStorage|sendMessageStream|document\.cookie/)
})
