import test from 'node:test'
import assert from 'node:assert/strict'
import {reactive} from 'vue'
import {planActionFollowup,normalizeWeekScopeLanguage} from '../src/utils/chatActionFollowup.js'
import {parseCourseWeeks,courseKey,normalizeCourses} from '../src/utils/courseSchedule.js'
import {privateCourseEditFollowup,privateCourseEditForm,createPrivateCourseEdit} from '../src/utils/privateCourseEdit.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {readFileSync} from 'node:fs'
const opts={timeout:5000},scope='synthetic-own'
const context=()=>({kind:'PERSONAL_COURSE',scope,requestScope:scope,active:true,loaded:true,phase:'editing',periodMode:false,form:{course:{name:'合成原课',weekday:1,startTime:'08:30',endTime:'10:05',weeks:'1-30',room:'原室'}}})
test('academic-week range/list slots compose with verbs labels digits and conjunctions instead of whole-question enumeration',opts,()=>{
  let combinations=0
  for(const prefix of ['','周次','上课周次改为','只改'])for(const join of ['和','与','以及','、','，',','])for(const [a,b,expected] of [['2','4',[2,4]],['二','四',[2,4]],['十二','十四',[12,14]]])for(const suffix of ['周','']){
    const text=`${prefix}第${a}${suffix}${join}第${b}周`,result=planActionFollowup(text,context());assert.equal(result.type,'PATCH',`${text}: ${result.message}`);assert.deepEqual(parseCourseWeeks(result.patch.course.weeks),expected,text);combinations++
  }
  assert.equal(combinations,144)
  for(const text of ['第二周到第四周','上课周次从第二周到第四周','周次改为第2周至第4周']){const p=planActionFollowup(text,context());assert.equal(p.type,'PATCH',text);assert.deepEqual(parseCourseWeeks(p.patch.course.weeks),[2,3,4])}
  const mixed=planActionFollowup('第二周到第四周和第六周',context());assert.equal(mixed.type,'PATCH');assert.deepEqual(parseCourseWeeks(mixed.patch.course.weeks),[2,3,4,6])
})
test('literal titles classrooms dates or uncertain alternatives cannot be rewritten into week choices',opts,()=>{
  const title=planActionFollowup('课程名称《第二周和第四周》',context());assert.equal(title.type,'PATCH');assert.equal(title.patch.course.name,'第二周和第四周');assert.equal(title.patch.course.weeks,undefined)
  const room=planActionFollowup('教室改为第二周和第四周',context());assert.equal(room.type,'PATCH');assert.equal(room.patch.course.room,'第二周和第四周');assert.equal(room.patch.course.weeks,undefined)
  const literal=normalizeWeekScopeLanguage('《第二周和第四周》');assert.equal(literal,'《第二周和第四周》')
  for(const text of ['第2周或第4周','第2周或者第4周','第2周和第31周','2026年第二周和第四周','第2周不是第4周'])assert.equal(planActionFollowup(text,context()).type,'CLARIFY',text)
  const formal=planActionFollowup('上课周次从第二周到第四周，教室F2-309',{...context(),kind:'TEACHING_COURSE',userRole:'ADMIN',schoolId:1});assert.equal(formal.type,'PATCH');assert.equal(formal.patch.course.weeks,'2-4');assert.equal(formal.patch.course.room,'F2-309')
})
test('the same normalized slots reach an actual own partial-week save and preserve the excluded weeks',opts,async()=>{
  const f=createTeachingFlowFixture(),call=(method,data)=>f.adapter({url:'/api/timetable/courses',method,data})
  const old=(await call('get')).data.schedule,course={name:'合成周次核对',weekday:1,startTime:'08:30',endTime:'10:05',weeks:[1,2,3,4],room:'原室'}
  await call('put',{revision:old.revision,semester:'合成周次学期',firstMonday:'2026-10-12',remindDays:7,courses:normalizeCourses([course])})
  const state=reactive({}),r=createPrivateCourseEdit({owner:()=>scope,state,read:()=>call('get'),write:p=>call('put',p)})
  await r.load();r.select(courseKey(state.snapshot.courses[0]));let form=privateCourseEditForm(state.selected)
  const fields=privateCourseEditFollowup('只改第二周和第四周，教室改为合成新室',{...context(),selected:state.selected,form});assert.equal(fields.type,'PATCH');form={...form,...fields.patch.course}
  assert.equal(await r.prepare(form),true);assert.equal(await r.execute(),true);const saved=(await call('get')).data.schedule;assert.equal(saved.courses.length,2);assert.ok(saved.courses.some(c=>String(c.weeks)==='1,3'&&c.room==='原室'));assert.ok(saved.courses.some(c=>String(c.weeks)==='2,4'&&c.room==='合成新室'));assert.equal(f.audit().length,0)
})
test('a guarded four-week DEV source is repeatable but contains no fake edited receipt or grants',opts,async()=>{
  const f=createTeachingFlowFixture({privateEditDemo:true}),source=(await f.adapter({url:'/api/timetable/courses',method:'get'})).data.schedule
  assert.equal(source.revision,1);assert.equal(source.courses.length,2);assert.ok(source.courses.every(c=>String(c.weeks)==='1,2,3,4'));assert.equal(f.audit().length,0)
  f.setActor(8);assert.equal((await f.adapter({url:'/api/timetable/courses',method:'get'})).data.schedule,null)
  const code=readFileSync(new URL('../design/review.js',import.meta.url),'utf8');assert.match(code,/get\('privateEditDemo'\)==='1'/);assert.ok(code.indexOf('if (!import.meta.env.DEV) throw')<code.indexOf('privateEditDemoRequested'));assert.match(code,/四周个人课表源（模拟）/)
})
