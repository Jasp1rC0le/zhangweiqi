import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {prepareTeachingChangeDemo} from '../design/teachingChangeDemo.js'
import {chinaDate,addDays} from '../src/utils/timetable.js'
const opts={timeout:5000},root='/api/admin/teaching/lesson-changes',noticeRoot='/api/teaching/lesson-change-notices'
const call=(f,url,method='get',data,params)=>f.adapter({url,method,data,params})
test('repeatable DEV sample uses the actual preview/save/receipt pipeline and restores its original viewer',opts,async()=>{
  const f=createTeachingFlowFixture(),calls=[],adapter=f.adapter.bind(f);f.adapter=async c=>{calls.push([c.method,c.url]);return adapter(c)}
  const first=await prepareTeachingChangeDemo(f);assert.equal(f.principal().id,2);assert.equal(first.date,addDays(chinaDate(),1));assert.ok(calls.some(c=>c[0]==='post'&&c[1]===root+'/preview'));assert.equal(calls.filter(c=>c[0]==='post'&&c[1]===root).length,1)
  const q={page:0,size:25,unreadOnly:true},page=(await call(f,noticeRoot,'get',null,q)).data;assert.equal(page.total,1);assert.equal(page.items[0].targetLessonId,first.lessonId);assert.equal(page.items[0].view,'STUDENT');assert.equal(page.items[0].proposed.room,'F2-309（调课示例）');assert.equal(page.items[0].reason,undefined)
  await call(f,noticeRoot+'/'+first.noticeId+'/read','post');const second=await prepareTeachingChangeDemo(f);assert.deepEqual(second,first);assert.equal(calls.filter(c=>c[0]==='post'&&c[1]===root).length,1);assert.equal((await call(f,noticeRoot,'get',null,q)).data.total,0)
  f.setActor(4);const teacher=(await call(f,noticeRoot,'get',null,q)).data;assert.equal(teacher.items[0].targetLessonId,first.lessonId);assert.equal(teacher.items[0].view,'TEACHER')
  f.setActor(6);assert.equal((await call(f,noticeRoot,'get',null,q)).data.total,0)
  f.setActor(8);assert.equal((await call(f,noticeRoot,'get',null,q)).data.total,0)
})
test('lost simulation ACK is reconciled by GET once, with no repeated POST or fabricated success',opts,async()=>{
  const f=createTeachingFlowFixture();f.setActor(4);const adapter=f.adapter.bind(f);let posts=0
  f.adapter=async c=>{const r=await adapter(c);if(c.method==='post'&&c.url===root){posts++;throw{response:{status:503,data:{message:'合成丢ACK'}}}}return r}
  const saved=await prepareTeachingChangeDemo(f);assert.ok(saved.noticeId);assert.equal(posts,1);assert.equal(f.principal().id,4)
})
test('failed or unrecognized demo preparation never switches a real principal or claims a prepared notice',opts,async()=>{
  let touched=false;await assert.rejects(prepareTeachingChangeDemo({principal:()=>({id:2,username:'normal-user'}),adapter:()=>{touched=true},setActor:()=>{touched=true}}),/本页合成/);assert.equal(touched,false)
  const f=createTeachingFlowFixture();f.setActor(6);const adapter=f.adapter.bind(f);f.adapter=c=>c.url===root+'/preview'?Promise.reject({response:{status:409,data:{message:'合成冲突'}}}):adapter(c)
  await assert.rejects(prepareTeachingChangeDemo(f),/合成冲突/);assert.equal(f.principal().id,6);f.setActor(2);assert.equal((await call(f,noticeRoot,'get',null,{page:0,size:25,unreadOnly:true})).data.total,0)
})
test('only the guarded DEV entry can initialize the sample and it never contacts the normal HTTP client',opts,()=>{
  const review=readFileSync(new URL('../design/review.js',import.meta.url),'utf8'),helper=readFileSync(new URL('../design/teachingChangeDemo.js',import.meta.url),'utf8')
  assert.ok(review.indexOf('if (!import.meta.env.DEV) throw')<review.indexOf('await prepareTeachingChangeDemo'))
  assert.match(review,/get\('changeDemo'\)==='1'/);assert.match(review,/changeDemoState.ready/);assert.match(review,/role','alert'/)
  assert.doesNotMatch(helper,/fetch\(|import[^\n]*['"]axios['"]|axios[.(]|http\.post|localStorage|sessionStorage|document\.cookie/)
  assert.match(helper,/createLessonChangeResource/);assert.match(helper,/resource\.reconcile\(\)/);assert.doesNotMatch(helper,/resource\.retry\(/)
})
