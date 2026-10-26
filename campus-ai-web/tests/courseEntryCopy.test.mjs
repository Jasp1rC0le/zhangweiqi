import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { courseEntryText } from '../src/utils/courseEntryCopy.js'
import { createScopedTextCopy } from '../src/utils/scopedTextCopy.js'
const asOf='2026-10-24T23:40:00Z'
const sample=()=>({id:'private-id',name:'设计基础',date:'2026-10-26',startTime:'08:30:00',endTime:'10:05:00',startPeriod:1,endPeriod:2,teacher:'合成任课教师',room:'合成教学楼A101',className:'合成一班',sources:['TEACHING'],cancelled:false,conflict:false})
test('single course keeps exact full date, local hours, teacher, place, source and read time',()=>{
  const text=courseEntryText(sample(),asOf)
  for(const value of['日期：2026-10-26 · 周一','课程：设计基础','08:30—10:05（北京时间） · 第1—2节','任课教师：合成任课教师','地点：合成教学楼A101','班级：合成一班','来源：授权教学安排','2026/10/25 07:40:00','不是完整当天课表'])assert.ok(text.includes(value),value)
})
test('missing teachers, place and clock remain missing rather than invented from timeLabel',()=>{
  const text=courseEntryText({...sample(),teacher:'',room:'',className:'',startTime:null,endTime:null,timeLabel:'08:30—10:05'},asOf)
  assert.match(text,/第1—2节（钟点未配置）/);assert.match(text,/任课教师：未填写/);assert.match(text,/地点：未填写/);assert.doesNotMatch(text,/08:30|班级：/)
  assert.match(courseEntryText({...sample(),startTime:null,endTime:null,startPeriod:null,endPeriod:null},asOf),/钟点与节次未配置/)
})
test('cancelled and overlapping rows keep clear warnings and merged provenance',()=>{
  const text=courseEntryText({...sample(),sources:['PERSONAL','TEACHING'],cancelled:true,conflict:true},asOf)
  assert.match(text,/已与本人导入合并/);assert.match(text,/已取消，请勿按原安排上课/);assert.match(text,/存在时间冲突/)
  assert.match(courseEntryText({...sample(),sources:['PERSONAL'],cancelled:true},asOf),/学籍变动后待核对/)
})
test('formatter is a strict row allowlist, never names/IDs/attendance/roster or arbitrary response fields',()=>{
  const text=courseEntryText({...sample(),id:'PRIVATE_ID',originIds:['PRIVATE_ORIGIN'],lessonId:'PRIVATE_LESSON',attendance:'PRIVATE_ATTENDANCE',counts:{private:'PRIVATE_COUNT'},studentName:'PRIVATE_STUDENT',studentNumber:'PRIVATE_NUMBER',token:'PRIVATE_TOKEN',entries:[sample()]},asOf)
  assert.doesNotMatch(text,/PRIVATE_/);assert.match(text,/不含考勤与名单/)
})
test('unsafe multiline labels, dates, hours, unknown sources and missing facts disable copying',()=>{
  for(const value of[null,{...sample(),name:''},{...sample(),name:'伪造\n下一行'},{...sample(),teacher:'教师\u2028地点'},{...sample(),date:'2026-02-30'},{...sample(),startTime:'25:00'},{...sample(),endTime:null},{...sample(),sources:['OTHER']},{...sample(),sources:[]},{...sample(),teacher:'字'.repeat(101)}])assert.equal(courseEntryText(value,asOf),null)
  assert.equal(courseEntryText(sample(),'invalid'),null)
})
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
function control(write){let key='owner:scope:row',available=true;const state={busy:false,notice:'',manualText:''};const resource=createScopedTextCopy({key:()=>key,available:()=>available,text:()=>courseEntryText(sample(),asOf),state,write,successNotice:'course copied',failureNotice:'select course manually'});return{state,resource,change:()=>{key='new-owner';resource.reset()},disable:()=>{available=false;resource.reset()}}}
test('generic copy resource requires explicit action and suppresses duplicate pending handoffs',async()=>{
  const pending=deferred(),writes=[],c=control(value=>{writes.push(value);return pending.promise});assert.equal(writes.length,0)
  const task=c.resource.copy();assert.equal(await c.resource.copy(),false);assert.equal(writes.length,1);pending.resolve();assert.equal(await task,true);assert.equal(c.state.notice,'course copied')
})
test('copy denial supplies the exact course text without exception content and clears when unavailable',async()=>{
  const c=control(async()=>{throw Error('SECRET_RAW_MESSAGE')});assert.equal(await c.resource.copy(),false);assert.equal(c.state.manualText,courseEntryText(sample(),asOf));assert.equal(c.state.notice,'select course manually');c.disable();assert.equal(c.state.manualText,'');assert.equal(await c.resource.copy(),false)
})
test('scope invalidation and disposal reject both late success and failure feedback',async()=>{
  for(const fail of[false,true]){const pending=deferred(),c=control(()=>pending.promise),task=c.resource.copy();c.change();if(fail)pending.reject(Error('late'));else pending.resolve();assert.equal(await task,false);assert.deepEqual(c.state,{busy:false,notice:'',manualText:''})}
  const c=control(async()=>{});c.resource.dispose();assert.equal(await c.resource.copy(),false)
})
test('course action compiles as a labelled inline readonly fallback with 16px input and scoped feedback',()=>{
  const filename='src/components/CourseEntryCopy.vue',source=readFileSync(new URL('../'+filename,import.meta.url),'utf8'),{descriptor,errors}=parse(source)
  assert.deepEqual(errors,[]);compileScript(descriptor,{id:filename});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename,id:filename}).errors,[]);assert.deepEqual(compileStyle({source:descriptor.styles[0].content,filename,id:filename,scoped:true}).errors,[])
  for(const value of['readonly rows="8"','role="status"','font-size: 16px','min-height: 44px','field.value.select()','field.value.scrollTop = 0','resource.dispose()'])assert.ok(source.includes(value),value)
  assert.doesNotMatch(source,/@\/api|localStorage|readText|execCommand|fetch\(|axios|setInterval|setTimeout/)
})
test('calendar copy uses checked current scope, page/date/read snapshot and visibility lease',()=>{
  const source=readFileSync(new URL('../src/components/UnifiedWeekCalendar.vue',import.meta.url),'utf8')
  assert.match(source,/copyForeground\.value && exportContext\.value/);assert.match(source,/coursePage\.value, selectedDay\.value, state\.week\.now/);assert.match(source,/<CourseEntryCopy :entry="entry" :scope="copyScope" :as-of="state.week.now"/);assert.match(source,/removeEventListener\('visibilitychange', copyVisibilityChanged\)/)
})
