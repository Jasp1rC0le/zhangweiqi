import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { calendarBackPreset, calendarBackQuery, calendarBackDestination } from '../src/utils/calendarReturnContext.js'
import { calendarSchedulePreset } from '../src/utils/schedulePerspective.js'
import { createUnifiedTimetable } from '../src/utils/unifiedTimetable.js'
const classId='10000000-0000-4000-8000-000000000010',sample=(extra={})=>({date:'2026-10-13',view:'TEACHER',classId,page:2,...extra})
test('return context roundtrips exact date week view class and course page',()=>{
  const query=calendarBackQuery(sample());assert.deepEqual(query,{back:'1',backDate:'2026-10-13',backView:'TEACHER',backClass:classId,backPage:'2'});assert.deepEqual(calendarBackPreset(query),{...sample(),monday:'2026-10-12'})
  assert.deepEqual(calendarBackDestination(query),{to:{path:'/timetable',query},date:'2026-10-13'})
})
test('each known calendar view is a requested intent while empty explicit class remains intentional all-authorized scope',()=>{
  for(const view of['STUDENT','TEACHER','COUNSELOR','SECRETARY'])assert.equal(calendarBackPreset(calendarBackQuery(sample({view,classId:'',page:0}))).view,view)
  assert.equal(calendarBackPreset(calendarBackQuery(sample({classId:''}))).classId,'')
})
test('partial targets malformed IDs dates pages or roles fail closed without all-class or bare return',()=>{
  const original=calendarBackQuery(sample())
  for(const extra of[{back:undefined},{backDate:'2026-02-30'},{backClass:undefined},{backClass:'forged'},{backView:'ADMIN'},{backView:['TEACHER']},{backDate:['2026-10-13']},{backPage:'-1'},{backPage:'01'},{backPage:'10001'},{backPage:['2']},{backPage:'2.5'},{back:'2'}]){const result=calendarBackDestination({...original,...extra});assert.ok(result.error);assert.equal(result.to,undefined)}
  for(const page of[-1,1.2,10001,'2',null])assert.throws(()=>calendarBackQuery(sample({page})))
})
test('legacy back links remain compatible but no open redirect owner or private data is serialized',()=>{
  assert.equal(calendarBackPreset({return:'timetable',lesson:'legacy'}),null);assert.deepEqual(calendarBackDestination({return:'timetable'}),{to:'/timetable',date:''})
  const query=calendarBackQuery(sample({owner:'PRIVATE_OWNER',token:'PRIVATE_TOKEN',studentIds:['PRIVATE_ROSTER'],return:'https://evil.test',className:'PRIVATE_NAME'}));assert.doesNotMatch(JSON.stringify(query),/PRIVATE_|evil/);assert.ok(Object.isFrozen(query))
})
test('the original personal queryView contract is not widened to leadership roles by return navigation',()=>{
  for(const queryView of['COUNSELOR','SECRETARY','ADMIN'])assert.ok(calendarSchedulePreset({queryView,queryDate:'2026-10-13'}).error)
  assert.equal(calendarSchedulePreset({queryView:'TEACHER',queryDate:'2026-10-13'}).view,'TEACHER')
})
test('return data uses existing protected reads and never grants from URL-selected names or classes',()=>{
  const source=readFileSync(new URL('../src/components/UnifiedWeekCalendar.vue',import.meta.url),'utf8')
  assert.match(source,/const own=calendarSchedulePreset\(route.query\),back=calendarBackPreset\(route.query\)/);assert.match(source,/if\(own&&back\)return\{error:/);assert.match(source,/classId.value=preset.classId;coursePage.value=preset.page/);assert.match(source,/scopes.load\(view.value/);assert.match(source,/resource.load\(requestedMonday, view.value, requestedClass, coursePage.value\)/);assert.match(source,/\.\.\.returnContext.value/)
})
test('off-page class and invalid course-page recovery remain explicit and retain other query conditions',()=>{
  const source=readFileSync(new URL('../src/components/UnifiedWeekCalendar.vue',import.meta.url),'utf8')
  assert.match(source,/<option v-if="outsideClassOption" :value="classId">指定班级/);assert.match(source,/读取该范围第一页/)
  const reset=source.slice(source.indexOf('function firstCoursePage'),source.indexOf('function stepWeek'));assert.match(reset,/coursePage.value = 0; load\(\)/);assert.doesNotMatch(reset,/classId.value\s*=|view.value\s*=|monday.value\s*=/)
})
test('class/page404 is an unavailable exact target, not unsupported API or silent legacy fallback',async()=>{
  for(const[classId,page,unsupported]of[['',0,true],['10000000-0000-4000-8000-000000000010',0,false],['',2,false]]){const state={},resource=createUnifiedTimetable({owner:()=> 'owner',state,read:async()=>{throw{response:{status:404,data:{message:'合成精确目标不存在'}}}}});await resource.load('2026-10-12','TEACHER',classId,page);assert.equal(state.unsupported,unsupported);assert.equal(state.week,null);if(!unsupported)assert.equal(state.error,'合成精确目标不存在');resource.reset()}
})
test('calendar and focused record compile with original unsaved-change guard and a validated back destination',()=>{
  for(const file of['components/UnifiedWeekCalendar.vue','views/TeachingView.vue']){const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{descriptor,errors}=parse(source);assert.deepEqual(errors,[]);compileScript(descriptor,{id:file});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:file,id:file}).errors,[])}
  const teaching=readFileSync(new URL('../src/views/TeachingView.vue',import.meta.url),'utf8');assert.match(teaching,/:to="calendarBack.to">返回课表/);assert.match(teaching,/calendarBack.error/);assert.match(teaching,/useUnsavedChanges\(/);assert.match(teaching,/\(\) => dirty.value/)
})
test('return parser validates boundary weeks and caps requested page without extra payload fields',()=>{
  for(const date of['2000-01-03','2100-12-26','2028-02-29'])assert.equal(calendarBackPreset(calendarBackQuery(sample({date,page:10000}))).date,date)
  for(const date of['2000-01-01','2100-12-31'])assert.throws(()=>calendarBackQuery(sample({date})))
  assert.deepEqual(Object.keys(calendarBackPreset(calendarBackQuery(sample()))).sort(),['date','monday','view','classId','page'].sort())
})
