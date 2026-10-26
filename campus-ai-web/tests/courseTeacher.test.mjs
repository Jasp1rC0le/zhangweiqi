import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeCourse,normalizeCourses,courseKey,parseCourseTable,diffCourses} from '../src/utils/courseSchedule.js'
import {parseCourseJson,parseCourseRows,coursesToCsv,describeCourseChanges} from '../src/utils/courseImport.js'
import {prepareCourseImageResult,reviewCourseImageRows} from '../src/utils/courseImageRecognition.js'
import {privateCourseEditPlan,privateCourseEditForm,privateCourseEditFollowup} from '../src/utils/privateCourseEdit.js'
import {planPersonalOperation} from '../src/utils/personalScheduleOperations.js'
import {privateCourseFile} from '../src/utils/privateCourseExport.js'
const course={name:'合成教师课程',weekday:2,startPeriod:1,endPeriod:2,weeks:[1,3],room:'合成教室',teacher:'合成教师甲'}
const snapshot=()=>({revision:1,semester:'合成学期',firstMonday:'2026-10-12',remindDays:7,importedAt:'2026-10-12T00:00:00Z',checkedAt:'2026-10-12T00:00:00Z',courses:[{...course}]})
test('teacher is bounded text, optional for legacy data, and part of course identity',()=>{
  assert.equal(normalizeCourse({...course,teacher:' 合成教师甲 '}).teacher,'合成教师甲')
  assert.equal(normalizeCourse({...course,teacher:null}).teacher,undefined)
  for(const teacher of ['x'.repeat(101),'甲\n乙','甲\0乙',123])assert.throws(()=>normalizeCourse({...course,teacher}),/任课教师/)
  const other={...course,teacher:'合成教师乙'};assert.notEqual(courseKey(course),courseKey(other));assert.equal(normalizeCourses([course,other]).length,2);assert.equal(diffCourses([course],[other]).unchanged,0)
})
test('seven-column CSV JSON and mapped school details retain teacher, old six-column imports still work',()=>{
  const csv=coursesToCsv([course]);assert.match(csv,/任课教师/);assert.deepEqual(parseCourseTable(csv).courses,[course]);assert.deepEqual(parseCourseJson(JSON.stringify(snapshot())).courses,[course])
  const old='课程名称,星期,开始节次,结束节次,周次,教室\n合成教师课程,2,1,2,1;3,合成教室';assert.equal(parseCourseTable(old).courses[0].teacher,undefined)
  const mapped=parseCourseRows([['学生姓名','教师姓名','课程名','星期','节次','周次','教室'],['不能带出','合成教师甲','合成教师课程','周二','1-2','1;3','合成教室']]);assert.deepEqual(mapped.courses,[course]);assert.doesNotMatch(JSON.stringify(mapped),/不能带出/)
  assert.throws(()=>parseCourseJson(JSON.stringify({...snapshot(),courses:[{...course,teacherId:77}]})),/课程字段异常/)
})
test('image teacher is reviewed and corrected like a course field, never guessed from missing data',()=>{
  const payload={version:1,provider:'kimi',model:'synthetic-vision',semester:'合成学期',firstMonday:'2026-10-12',warnings:[],rows:[{...course,startTime:null,endTime:null}]}
  const rows=prepareCourseImageResult(payload).rows;assert.equal(rows[0].teacher,course.teacher);rows[0].teacher='合成教师乙';assert.equal(reviewCourseImageRows(rows).courses[0].teacher,'合成教师乙');assert.equal(payload.rows[0].teacher,'合成教师甲')
  delete payload.rows[0].teacher;assert.equal(prepareCourseImageResult(payload).rows[0].teacher,'')
})
test('teacher-only partial-week edits have explicit before-after preview and preserve unaffected teachers',()=>{
  const s=snapshot(),form={...privateCourseEditForm(course),weeks:'1',teacher:'合成教师乙'},plan=privateCourseEditPlan(s,courseKey(course),form)
  assert.equal(plan.changed.teacher,'合成教师乙');assert.ok(plan.payload.courses.some(c=>c.teacher==='合成教师甲'&&String(c.weeks)==='3'));assert.match(plan.lines.join('\n'),/合成教师甲 → 合成教师乙/)
  assert.equal(describeCourseChanges([course],[{...course,teacher:'合成教师乙'}]).modified[0].changes[0].label,'任课教师')
  const missingForm={...privateCourseEditForm(course),room:'新教室'};delete missingForm.teacher;assert.equal(privateCourseEditPlan(s,courseKey(course),missingForm).changed.teacher,course.teacher)
})
test('bulk teacher correction and term copy preserve explicit records without account grants',()=>{
  const s=snapshot(),base={operation:'BATCH',room:'',teacher:'合成教师乙',weeks:'1',weekday:'',startTime:'',endTime:'',reason:'本人核对任课教师'}
  const plan=planPersonalOperation(s,[courseKey(course)],base);assert.equal(plan.payload.terms[0].courses.length,2);assert.match(plan.lines.join('\n'),/任课教师合成教师乙/);assert.equal(s.courses[0].teacher,'合成教师甲')
  const copied=planPersonalOperation(s,[courseKey(course)],{...base,operation:'COPY_TERM',semester:'新学期',firstMonday:'2027-03-01',targetWeeks:'1;3'});assert.equal(copied.payload.terms[0].courses[0].teacher,course.teacher)
})
test('teacher field survives private backup roundtrip but account identity never does',()=>{
  const file=privateCourseFile({...snapshot(),teacherId:77,courses:[{...course,teacherId:77}]});assert.deepEqual(parseCourseJson(file.text).courses,[course]);assert.doesNotMatch(file.text,/teacherId/)
})
test('chat can fill teacher name in selected private record, not claim a teacher account',()=>{
  const context={scope:'s',requestScope:'s',active:true,selected:true,loaded:true,phase:'editing',form:privateCourseEditForm(course),periodMode:true}
  const plan=privateCourseEditFollowup('任课教师改为合成教师乙',context);assert.equal(plan.type,'PATCH');assert.equal(plan.patch.course.teacher,'合成教师乙')
  for(const text of ['任课教师账号改为4','教师编号4','绑定教师账号4'])assert.equal(privateCourseEditFollowup(text,context).type,'CLARIFY')
})
