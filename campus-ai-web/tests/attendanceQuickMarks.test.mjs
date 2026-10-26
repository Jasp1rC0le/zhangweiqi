import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {QUICK_ATTENDANCE,ATTENDANCE_STATUSES,attendanceSummary} from '../src/utils/teaching.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
const api=(f,url,params={},method='get',data)=>f.adapter({url,params,method,data})
test('three quick statuses are explicit buttons; legacy status vocabulary is retained',()=>{
  assert.deepEqual(QUICK_ATTENDANCE.map(s=>s.label),['按时','旷课','早退']);assert.equal(ATTENDANCE_STATUSES.LATE,'迟到');assert.equal(ATTENDANCE_STATUSES.EXCUSED,'请假')
  const vue=readFileSync(new URL('../src/views/TeachingView.vue',import.meta.url),'utf8')
  assert.match(vue,/v-for="choice in QUICK_ATTENDANCE"/);assert.match(vue,/:aria-pressed="marks\[entry.studentId\]===choice.value"/);assert.doesNotMatch(vue,/<select[^>]*v-model="marks/s);assert.match(vue,/撤销本页修改/)
})
test('early leave counts remain distinct from absence and preserve the existing summary fields',()=>{
  const result=attendanceSummary([{counts:{unknown:2,onTime:4,late:1,absent:1,excused:1,earlyLeave:2},cancelled:false}])
  assert.equal(result.earlyLeave,2);assert.equal(result.absent,1);assert.equal(result.confirmed,8);assert.equal(result.rate,5/8)
})
test('mobile roster focus waits for actual enter transition and remains account/target fenced',()=>{
  const vue=readFileSync(new URL('../src/views/TeachingView.vue',import.meta.url),'utf8')
  assert.match(vue,/@after-enter="focusPendingDetail"/);assert.match(vue,/owner.value!==request.owner/);assert.match(vue,/state.detail\?\.lesson.id === request.id/);assert.match(vue,/detailHeading.value &&/)
})
test('synthetic early-leave write changes actual scoped records and requires a reason when correcting',async()=>{
  const f=createTeachingFlowFixture();f.setActor(4);f.advanceTo('13:55');const lesson='10000000-0000-4000-8000-000000000020',params={view:'TEACHER',page:0,size:50,search:''},path=`/api/teaching/lessons/${lesson}`
  const d=(await api(f,path+'/page',params)).data.detail,student=d.entries[0].studentId
  await assert.rejects(api(f,path+'/attendance/page',params,'put',{revision:0,marks:[{studentId:student,status:'EARLY_LEAVE'}],reason:'',finish:false}),e=>e.response.status===400)
  f.advanceTo('14:02');await api(f,path+'/attendance/page',params,'put',{revision:0,marks:[{studentId:student,status:'ON_TIME'}],reason:'',finish:false})
  await assert.rejects(api(f,path+'/attendance/page',params,'put',{revision:1,marks:[{studentId:student,status:'EARLY_LEAVE'}],reason:'',finish:false}),e=>e.response.status===400)
  const saved=(await api(f,path+'/attendance/page',params,'put',{revision:1,marks:[{studentId:student,status:'EARLY_LEAVE'}],reason:'模拟更正原因',finish:false})).data.detail
  assert.equal(saved.lesson.counts.earlyLeave,1);assert.equal(saved.lesson.counts.absent,0);assert.equal(f.audit().at(-1).status,'EARLY_LEAVE');assert.equal(f.audit().at(-1).old,'ON_TIME')
  f.setActor(2);const own=(await api(f,path+'/page',{...params,view:'STUDENT'})).data.detail;assert.equal(own.entries.length,1);assert.equal(own.entries[0].status,'EARLY_LEAVE')
  f.setActor(8);await assert.rejects(api(f,path+'/page',{...params,view:'STUDENT'}),e=>e.response.status===404)
})
