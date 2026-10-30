import test from 'node:test'
import assert from 'node:assert/strict'
import { createHoldToTalk } from '../src/utils/holdToTalk.js'
import { attachmentChunks,selectAttachmentExcerpts } from '../src/utils/attachmentRetrieval.js'
import { planPersonalOperation,planPersonalRestore } from '../src/utils/personalScheduleOperations.js'
import { courseKey } from '../src/utils/courseSchedule.js'
const course={name:'合成网络',weekday:1,startTime:'08:30',endTime:'09:15',weeks:[1,2,3],room:'A101'}
const source={revision:3,semester:'合成秋季',firstMonday:'2026-09-07',remindDays:7,courses:[course,{...course,name:'合成体育',weekday:3}],importedAt:'2026-09-01T00:00:00Z',checkedAt:'2026-09-01T00:00:00Z'}
const form=(extra={})=>({operation:'DATE',fromDate:'2026-09-14',toDate:'2026-09-15',room:'B202',startTime:'',endTime:'',weekday:'',weeks:'',reason:'合成核对',...extra})
test('single date splits exactly one occurrence and keeps other weeks and courses',()=>{
  const plan=planPersonalOperation(source,[courseKey(course)],form())
  const rows=plan.payload.terms[0].courses
  assert.equal(rows.length,3);assert.deepEqual(rows.find(c=>c.name==='合成网络'&&c.room==='A101').weeks,[1,3]);assert.deepEqual(rows.find(c=>c.room==='B202').weeks,[2]);assert.equal(rows.find(c=>c.room==='B202').weekday,2)
  assert.deepEqual(source.courses[0].weeks,[1,2,3])
  assert.throws(()=>planPersonalOperation(source,[courseKey(course)],form({fromDate:'2026-09-16'})),/并不都/)
  assert.throws(()=>planPersonalOperation(source,[courseKey(course)],form({toDate:'2027-12-20'})),/跨学期/)
})
test('bulk edit and delete preserve unselected data and accept empty final term explicitly',()=>{
  const keys=source.courses.map(courseKey)
  const changed=planPersonalOperation(source,keys,form({operation:'BATCH',weeks:'2'})).payload.terms[0]
  assert.equal(changed.courses.filter(c=>c.room==='B202').length,2)
  assert.equal(planPersonalOperation(source,keys,form({operation:'DELETE'})).payload.terms[0].courses.length,0)
  assert.throws(()=>planPersonalOperation(source,keys,form({operation:'BATCH',weeks:'4'})),/必须存在/)
})
test('cross term move writes both terms while copy leaves source unchanged',()=>{
  const cross=form({operation:'MOVE_TERM',semester:'合成春季',firstMonday:'2027-03-01',targetWeeks:'1-4'})
  const plan=planPersonalOperation(source,[courseKey(course)],cross)
  assert.equal(plan.payload.terms.length,2);assert.equal(plan.payload.terms[0].courses.length,1);assert.equal(plan.payload.terms[1].revision,0)
  assert.deepEqual(plan.payload.terms[1].courses[0].weeks,[1,2,3,4])
  assert.equal(planPersonalOperation(source,[courseKey(course)],{...cross,operation:'COPY_TERM'}).payload.terms.length,1)
})
test('restore submits old content against current revision, never resets version',()=>{
  assert.equal(planPersonalRestore(source,{revision:9}).terms[0].revision,9)
})
test('long attachment retrieval selects exact spans with markers and never truncates original',()=>{
  const text=('校园交通说明。\n'.repeat(600))+'图书续借期限为合成示例15天，请核实。\n'+('实验规范。\n'.repeat(600))
  const result=selectAttachmentExcerpts(text,'图书续借期限',5000)
  assert.match(result.text,/续借期限/);assert.match(result.text,/不是全文/)
  for(const c of result.chunks)assert.equal(c.text,text.slice(c.start,c.end))
  assert.equal(attachmentChunks(text).map(c=>c.text).join(''),text)
  assert.throws(()=>selectAttachmentExcerpts(text,'unmatched-unicorn',5000),/没有找到/)
})
function voiceFixture(){
  let recognition,clock=0,principal='a',state={},sent=[],timers=[]
  class FakeSpeech {constructor(){recognition=this}start(){}stop(){}abort(){this.aborted=true}}
  const talk=createHoldToTalk({engine:()=>FakeSpeech,owner:()=>principal,update:s=>state=s,submit:(text,owner)=>sent.push({text,owner}),now:()=>clock,timer:f=>{timers.push(f);return f},clear:f=>{timers=timers.filter(v=>v!==f)}})
  return{talk,result:(text,final=true)=>recognition.onresult?.({results:[Object.assign([{transcript:text}],{isFinal:final})]}),end:()=>recognition.onend?.(),fail:error=>recognition.onerror?.({error}),time:n=>{clock=n},owner:v=>{principal=v},state:()=>state,sent,timeout:()=>timers.at(-1)?.()}
}
test('hold release waits for final result and sends once, never sends interim',()=>{
  const f=voiceFixture();f.talk.start(100);f.time(700);f.result('明天什么课',false);f.talk.release();assert.equal(f.sent.length,0);f.result('明天什么课');f.end();assert.deepEqual(f.sent,[{text:'明天什么课',owner:'a'}]);f.end();assert.equal(f.sent.length,1)
})
test('slide cancellation, short tap and owner changes never send',()=>{
  const f=voiceFixture();f.talk.start(100);f.result('取消');f.time(800);f.talk.move(20);f.talk.release();assert.equal(f.sent.length,0)
  f.talk.start(0);f.talk.release();assert.equal(f.sent.length,0)
  f.talk.start(0);f.result('旧账号');f.owner('b');f.time(1400);f.talk.release();f.end();assert.equal(f.sent.length,0);f.talk.dispose()
})
test('permission errors and stream finalization timeout stop capture truthfully',()=>{
  const f=voiceFixture();f.talk.start();f.fail('not-allowed');assert.match(f.state().message,/权限/)
  f.talk.start();f.time(600);f.result('未最终结束');f.talk.release();f.timeout();assert.match(f.state().message,/超时/);assert.equal(f.sent.length,0)
})

test('interim preview survives pointer jitter and remains preview-only until final',()=>{
 const f=voiceFixture();f.talk.start(100);f.result('正在预览',false);assert.equal(f.state().text,'正在预览');f.talk.move(99);assert.equal(f.state().text,'正在预览')
 f.time(600);f.talk.release();assert.equal(f.state().text,'正在预览');assert.equal(f.sent.length,0);f.result('完整句子');f.end();assert.deepEqual(f.sent,[{text:'完整句子',owner:'a'}])
})
test('ended interim speech remains visible while held but is never submitted as final',()=>{
 const f=voiceFixture();f.talk.start(100);f.result('还未定稿',false);f.end();assert.equal(f.state().text,'还未定稿');f.talk.move(99);assert.equal(f.state().text,'还未定稿');f.time(600);f.talk.release();assert.equal(f.sent.length,0);assert.match(f.state().message,/完整语音/)
})
