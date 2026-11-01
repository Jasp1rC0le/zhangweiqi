import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
const source=readFileSync(new URL('../src/components/CourseTeacherLink.vue',import.meta.url),'utf8')
const code=source.slice(source.indexOf('async function save()'),source.indexOf('watch(()=>props.owner'))
function flow(request){
 const calls=[],events=[],r=value=>({value})
 const course={name:'合成课程',weekday:1,startPeriod:1,endPeriod:2,weeks:[1,3],room:'合成教室',teacher:''}
 const state={
  props:{owner:'7:1:session-a',disabled:false},
  store:{principal:'7:1',adopt(value,owner){if(owner!==this.principal)return false;this.schedule=value;return true}},
  snapshot:r({revision:3,semester:'合成学期',firstMonday:'2026-09-07',remindDays:7,courses:[course]}),names:r(['合成教师']),
  dirty:r(true),busy:r(false),error:r(''),visible:r(true),generation:0,disposed:false,controller:null,AbortController,
  emit:(...args)=>events.push(args),
  saveCourseSchedule:async payload=>{calls.push(payload);return request?request(payload):{data:{schedule:{...payload,revision:4}}}},
 }
 const context=vm.createContext(state);vm.runInContext(code,context)
 return{state,calls,events,run:()=>vm.runInContext('save()',context),course}
}
test('teacher association changes only teacher names and sends the exact optimistic revision',async()=>{
 const f=flow();await f.run();assert.equal(f.calls.length,1);const sent=f.calls[0]
 assert.equal(sent.revision,3);assert.equal(sent.firstMonday,'2026-09-07');assert.equal(sent.courses[0].name,f.course.name);assert.deepEqual([...sent.courses[0].weeks],[1,3]);assert.equal(sent.courses[0].startPeriod,1);assert.equal(sent.courses[0].room,'合成教室');assert.equal(sent.courses[0].teacher,'合成教师');assert.equal(f.state.visible.value,false);assert.equal(f.events[0][0],'saved')
})
test('a late teacher-save response cannot adopt into a changed account or session',async()=>{
 let finish;const f=flow(()=>new Promise(resolve=>{finish=resolve})),pending=f.run();f.state.props.owner='8:1:session-b';f.state.store.principal='8:1';finish({data:{schedule:{revision:4}}});await pending;assert.equal(f.state.store.schedule,undefined);assert.equal(f.events.length,0)
})
test('version conflicts keep the teacher draft and never retry automatically',async()=>{
 const f=flow(async()=>{throw{response:{status:409}}});await f.run();assert.equal(f.calls.length,1);assert.match(f.state.error.value,/课表已更新/);assert.equal(f.state.visible.value,true);assert.equal(f.state.names.value[0],'合成教师')
})
test('control characters are rejected before any teacher save',async()=>{const f=flow();f.state.names.value=['bad\nname'];await f.run();assert.equal(f.calls.length,0)})
