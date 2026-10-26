import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { createTeachingResource,validatedLessonPage } from '../src/utils/teaching.js'
import { chinaDate } from '../src/utils/timetable.js'
const options={timeout:5000},day=chinaDate()
function setup(overrides={}) {
  const f=createTeachingFlowFixture({largeScope:true});f.setActor(4);f.advanceTo('14:02')
  let owner='actor-a'
  const state={},read=(view,from,to,signal,page,search)=>f.adapter({url:'/api/teaching/lessons/page',params:{view,from,to,page,search,size:50},signal}),resource=createTeachingResource({owner:()=>owner,state,readAccess:signal=>f.adapter({url:'/api/teaching/access',signal}),readLessons:()=>assert.fail('Legacy full list must not run'),readLessonsPage:read,readDetailPage:(id,view,page,search)=>f.adapter({url:`/api/teaching/lessons/${id}/page`,params:{view,page,search,size:50}}),savePage:(id,data,page,search)=>f.adapter({url:`/api/teaching/lessons/${id}/attendance/page`,method:'put',data,params:{page,search,size:50}}),...overrides})
  return {f,state,resource,read,changeOwner:()=>{owner='actor-b';resource.reset()}}
}
test('course pages traverse the full teacher scope, search the final page, and keep global counts',options,async()=>{
  const s=setup(),all=new Set()
  for(let page=0;page<3;page++) {
    await s.resource.load('TEACHER',day,day,page,'')
    assert.equal(s.state.error,'');assert.equal(s.state.lessonPage.total,132);assert.equal(s.state.lessonPage.summary.counts.unknown,396)
    assert.equal(s.state.lessons.length,page===2?32:50)
    s.state.lessons.forEach(l=>{assert.equal(all.has(l.id),false);all.add(l.id)})
  }
  assert.equal(all.size,132)
  await s.resource.load('TEACHER',day,day,0,'分页课程130（模拟）')
  assert.equal(s.state.lessonPage.total,1);assert.equal(s.state.lessons[0].course,'分页课程130（模拟）');assert.equal(s.state.lessonPage.summary.counts.unknown,3)
  await s.resource.load('TEACHER',day,day,0,'');assert.equal(s.state.lessonPage.total,132)
  s.f.setActor(2);await assert.rejects(s.read('TEACHER',day,day,null,0,''),e=>e.response.status===403)
})
test('malformed pages and page-only summaries fail closed; old account results cannot return',options,async()=>{
  const s=setup(),data=(await s.read('TEACHER',day,day,null,0,'')).data
  validatedLessonPage(data,0)
  for(const value of [{...data,page:1},{...data,total:1},{...data,items:[data.items[0],data.items[0]]},{...data,summary:{...data.summary,counts:{...data.summary.counts,unknown:-1}}}])assert.throws(()=>validatedLessonPage(value,0))
  let resolve
  const stale=setup({readLessonsPage:()=>new Promise(r=>resolve=r)}),pending=stale.resource.load('TEACHER',day,day)
  await new Promise(r=>setImmediate(r));stale.changeOwner();resolve({data});await pending
  assert.equal(stale.state.lessonPage,null);assert.deepEqual(stale.state.lessons,[])
})
test('saved point names refresh all-course statistics, not only the visible roster',options,async()=>{
  const s=setup();await s.resource.load('TEACHER',day,day)
  const id=s.state.lessons[0].id;await s.resource.select(id,'TEACHER')
  assert.equal(await s.resource.saveMarks(id,{revision:0,marks:s.state.detail.entries.map(e=>({studentId:e.studentId,status:'ON_TIME'})),reason:'',finish:true}),true)
  assert.equal(s.state.summaryStale,false);assert.equal(s.state.lessonPage.summary.counts.onTime,3);assert.equal(s.state.lessonPage.summary.counts.unknown,393)
})
test('a saved write with failed statistics refresh stays saved and does not trigger a second write',options,async()=>{
  const base=setup();let calls=0,writes=0
  const s=setup({readLessonsPage:(...args)=>++calls===1?base.read(...args):Promise.reject(new Error('合成刷新失败')),savePage:(id,data,page,search)=>{writes++;return base.f.adapter({url:`/api/teaching/lessons/${id}/attendance/page`,method:'put',data,params:{page,search,size:50}})}})
  await s.resource.load('TEACHER',day,day);await s.resource.select(s.state.lessons[0].id,'TEACHER')
  const id=s.state.detail.lesson.id
  assert.equal(await s.resource.saveMarks(id,{revision:0,marks:s.state.detail.entries.map(e=>({studentId:e.studentId,status:'ON_TIME'})),reason:'',finish:true}),true)
  assert.equal(writes,1);assert.equal(s.state.detail.lesson.revision,1);assert.equal(s.state.summaryStale,true);assert.match(s.state.error,/点名已保存.*统计未刷新.*不要重复提交/)
})
test('the real page uses backend course paging and draft confirmation rather than filtering the first array',options,()=>{
  const source=readFileSync(new URL('../src/views/TeachingView.vue',import.meta.url),'utf8')
  assert.match(source,/readLessonsPage: readTeachingLessonsPage/)
  assert.match(source,/async function changeLessonPage[\s\S]*?await mayReplace\(\)/)
  assert.match(source,/全部筛选课程/);assert.match(source,/aria-label="课程分页"/)
  assert.match(source,/state\.summaryStale\?null/)
})
