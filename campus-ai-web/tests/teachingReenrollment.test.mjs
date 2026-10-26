import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import { parse,compileScript,compileTemplate } from '@vue/compiler-sfc'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { createEnrollmentResource } from '../src/utils/teachingEnrollment.js'
import { validatedTeachingStudent,studentTransitionPlan,validatedTransitionReceipt } from '../src/utils/teachingLifecycle.js'
import { chinaDate,mondayOf } from '../src/utils/timetable.js'

const options={timeout:5000},uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const api=(fixture,url,params={},method='get',data)=>fixture.adapter({url,params,method,data})
async function setup(overrides={}) {
  const fixture=createTeachingFlowFixture();fixture.setActor(1)
  const course=uid(92000),student=uid(100),classId=uid(10),day=chinaDate()
  await api(fixture,'/api/admin/teaching/courses/roster',{},'post',{course:{id:course,classId,teacherId:4,name:'重新选课闭环（模拟）',semester:'模拟学期',firstMonday:mondayOf(day),weekday:new Date(day+'T12:00:00Z').getUTCDay() || 7,startTime:'14:00',endTime:'15:35',weeks:[1,2],room:'模拟教学室'},groupName:'跨学院模拟教学组',studentIds:[student,uid(120)]})
  await api(fixture,`/api/admin/teaching/courses/${course}/members/${student}/withdraw`,{},'post',{revision:0,reason:'合成已核对退课'})
  let owner='admin-session-a',now=1000,writes=0
  const state={},readPage=(id,page,search)=>api(fixture,`/api/admin/teaching/courses/${id}/roster/page`,{page,size:25,search,activeOnly:false})
  const write=(id,sid,input)=>{writes++;return api(fixture,`/api/admin/teaching/courses/${id}/members/${sid}/reenroll`,{},'post',input)}
  const resource=createEnrollmentResource({owner:()=>owner,state,readPage,readMember:(id,sid)=>api(fixture,`/api/admin/teaching/courses/${id}/members/${sid}/status`),readStudent:sid=>api(fixture,`/api/admin/teaching/students/${sid}/status`),write:()=>assert.fail('No withdrawal should run for re-enrollment'),writeReenrollment:write,clock:()=>now,...overrides})
  resource.reset();await resource.load(course)
  return {fixture,resource,state,course,student,classId,readPage,write,writes:()=>writes,time:value=>{now=value},owner:(value,reset=true)=>{owner=value;if(reset)resource.reset()}}
}
const why='合成：核对本次原课程重新选课依据'

test('readmission is an explicit state transition with an exact target and response, not a synonym for transfer',options,async()=>{
  const s=await setup(),person=validatedTeachingStudent((await api(s.fixture,`/api/admin/teaching/students/${s.student}/status`)).data,s.student)
  const restore=studentTransitionPlan({...person,status:'LEFT',revision:1},'RESTORE',person.classId,why,uid(93000))
  assert.equal(restore.payload.targetClassId,person.classId);assert.equal(restore.nextState,'ACTIVE')
  assert.throws(()=>studentTransitionPlan(person,'RESTORE',person.classId,why,uid(93000)),/当前学籍/)
  assert.throws(()=>studentTransitionPlan(person,'TRANSFER',person.classId,why,uid(93000)),/目标行政班/)
  assert.throws(()=>studentTransitionPlan({...person,status:'LEFT'},'LEAVE','',why,uid(93000)),/当前学籍/)
  const receipt={requestId:restore.payload.requestId,studentId:s.student,classId:person.classId,status:'ACTIVE',revision:2,affectedLessons:1}
  assert.equal(validatedTransitionReceipt(receipt,restore),receipt)
  for(const bad of [{...receipt,studentId:uid(120)},{...receipt,revision:1},{...receipt,affectedLessons:10001}])assert.throws(()=>validatedTransitionReceipt(bad,restore))
})

test('normal confirmed re-enrollment changes real simulated membership, lessons, notices and each scoped role',options,async()=>{
  const s=await setup()
  assert.equal(await s.resource.prepareReenrollment(s.student,why),true);assert.equal(s.writes(),0)
  assert.equal(s.state.reenrollmentPreview.person.status,'ACTIVE')
  assert.equal(await s.resource.reenroll(s.student,why),true)
  assert.equal(s.writes(),1);assert.equal(s.state.roster.revision,2);assert.equal(s.state.roster.members.find(m=>m.studentId===s.student).active,true)
  assert.match(s.state.notice,/已保存.*2 项未来安排/)
  s.fixture.setActor(2);assert.ok((await api(s.fixture,'/api/teaching/lessons',{view:'STUDENT',from:chinaDate(),to:chinaDate()})).data.some(l=>l.course==='重新选课闭环（模拟）'))
  assert.ok((await api(s.fixture,'/api/teaching/notices')).data.some(n=>n.course==='重新选课闭环（模拟）'))
  await assert.rejects(api(s.fixture,`/api/admin/teaching/courses/${s.course}/roster`),e=>e.response.status===403)
  for(const [actor,view] of [[5,'COUNSELOR'],[6,'SECRETARY']]){s.fixture.setActor(actor);const scoped=(await api(s.fixture,'/api/teaching/lessons',{view,from:chinaDate(),to:chinaDate()})).data.find(l=>l.course==='重新选课闭环（模拟）');assert.equal(scoped.counts.unknown,1)}
  s.fixture.setActor(4);const teacher=(await api(s.fixture,'/api/teaching/lessons',{view:'TEACHER',from:chinaDate(),to:chinaDate()})).data.find(l=>l.course==='重新选课闭环（模拟）');assert.equal(teacher.counts.unknown,2)
  assert.equal(s.fixture.audit().filter(a=>a.action==='REENROLL').length,1)
})

test('a LEFT student cannot re-enroll until explicit readmission, and the new college owns future scopes',options,async()=>{
  const s=await setup(),statusUrl=`/api/admin/teaching/students/${s.student}/transition`
  await api(s.fixture,statusUrl,{},'post',{requestId:uid(93001),revision:0,expectedClassId:s.classId,action:'LEAVE',targetClassId:null,reason:why})
  await s.resource.load(s.course);assert.equal(await s.resource.prepareReenrollment(s.student,why),false);assert.match(s.state.error,/先到.*复学/)
  await api(s.fixture,statusUrl,{},'post',{requestId:uid(93002),revision:1,expectedClassId:s.classId,action:'RESTORE',targetClassId:uid(12),reason:why})
  await s.resource.load(s.course);assert.equal(s.state.roster.members.find(m=>m.studentId===s.student).active,false)
  assert.equal(await s.resource.prepareReenrollment(s.student,why),true);assert.equal(s.state.reenrollmentPreview.person.revision,2)
  assert.equal(await s.resource.reenroll(s.student,why),true)
  s.fixture.setActor(5);assert.equal((await api(s.fixture,'/api/teaching/lessons',{view:'COUNSELOR',from:chinaDate(),to:chinaDate()})).data.some(l=>l.course==='重新选课闭环（模拟）'),false)
  s.fixture.setActor(8);assert.ok((await api(s.fixture,'/api/teaching/lessons',{view:'STUDENT',from:chinaDate(),to:chinaDate()})).data.some(l=>l.course==='重新选课闭环（模拟）'))
})

test('preview expiry, changed reason and another account do not produce a write',options,async()=>{
  const s=await setup();await s.resource.prepareReenrollment(s.student,why)
  assert.equal(await s.resource.reenroll(s.student,'另一个原因'),false);assert.equal(s.writes(),0)
  s.time(301000);assert.equal(await s.resource.reenroll(s.student,why),false);assert.match(s.state.error,/5分钟/);assert.equal(s.state.reenrollmentPreview,null)
  await s.resource.prepareReenrollment(s.student,why);s.owner('admin-session-b',false)
  assert.equal(await s.resource.reenroll(s.student,why),false);assert.equal(s.writes(),0)
  s.owner('admin-session-b');assert.equal(s.state.roster,null);assert.equal(s.state.reenrollmentPreview,null)
})

test('late private student reads cannot revive a preview after an account reset',options,async()=>{
  let resolve
  const pending=new Promise(r=>{resolve=r}),s=await setup({readStudent:()=>pending})
  const person=(await api(s.fixture,`/api/admin/teaching/students/${s.student}/status`)).data
  const operation=s.resource.prepareReenrollment(s.student,why);await setImmediate();s.owner('another-principal');resolve({data:person})
  assert.equal(await operation,false);assert.equal(s.state.reenrollmentPreview,null);assert.equal(s.state.roster,null)
})

test('invalid acknowledgements and lost responses block blind repeat writes and keep the draft target',options,async()=>{
  let writes=0
  const s=await setup({writeReenrollment:async()=>{writes++;return{data:{requestId:uid(99999),courseId:uid(99998),studentId:uid(100),revision:2}}}})
  await s.resource.prepareReenrollment(s.student,why)
  assert.equal(await s.resource.reenroll(s.student,why),false);assert.equal(s.state.uncertain,true);assert.equal(s.state.notice,'');assert.equal(s.state.roster.members.find(m=>m.studentId===s.student).active,false)
  await s.resource.reenroll(s.student,why);assert.equal(writes,1)
  let commitThenLose
  const lost=await setup({writeReenrollment:async(...args)=>{await commitThenLose(...args);throw new Error('合成：保存后响应丢失')}})
  commitThenLose=lost.write
  await lost.resource.prepareReenrollment(lost.student,why);assert.equal(await lost.resource.reenroll(lost.student,why),false);assert.equal(lost.state.uncertain,true)
  await lost.resource.reenroll(lost.student,why);assert.equal(lost.writes(),1)
  assert.equal((await api(lost.fixture,`/api/admin/teaching/courses/${lost.course}/members/${lost.student}/status`)).data.member.active,true)
})

test('a successful save followed by a failed page refresh says saved but does not retry',options,async()=>{
  const base=await setup();let reads=0
  const s=await setup({readPage:(...args)=>++reads===1?base.readPage(...args):Promise.reject(new Error('合成分页刷新失败')),writeReenrollment:base.write,readMember:(id,sid)=>api(base.fixture,`/api/admin/teaching/courses/${id}/members/${sid}/status`),readStudent:sid=>api(base.fixture,`/api/admin/teaching/students/${sid}/status`)})
  await s.resource.prepareReenrollment(s.student,why);assert.equal(await s.resource.reenroll(s.student,why),false)
  assert.match(s.state.notice,/已保存/);assert.match(s.state.error,/不要重复提交/);assert.equal(s.state.uncertain,true)
  await s.resource.reenroll(s.student,why);assert.equal(base.writes(),1)
})

test('stale student versions conflict at the real simulated write and do not auto-restore privileges',options,async()=>{
  const s=await setup();await s.resource.prepareReenrollment(s.student,why)
  await api(s.fixture,`/api/admin/teaching/students/${s.student}/transition`,{},'post',{requestId:uid(93003),revision:0,expectedClassId:s.classId,action:'TRANSFER',targetClassId:uid(12),reason:why})
  assert.equal(await s.resource.reenroll(s.student,why),false);assert.match(s.state.error,/版本已变化/);assert.equal(s.state.uncertain,true)
  assert.equal((await api(s.fixture,`/api/admin/teaching/courses/${s.course}/members/${s.student}/status`)).data.member.active,false)
  await s.resource.reenroll(s.student,why);assert.equal(s.writes(),1)
})

test('new actions are capability gated and use real previews confirmations native fields and owner fences',options,()=>{
  for(const name of ['TeachingLifecyclePanel','TeachingWithdrawalPanel']){
    const source=readFileSync(new URL(`../src/components/${name}.vue`,import.meta.url),'utf8'),{descriptor,errors}=parse(source)
    assert.deepEqual(errors,[]);compileScript(descriptor,{id:name});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:name,filename:name}).errors,[])
    assert.match(source,/useScopedConfirmation/);assert.match(source,/useUnsavedChanges/);assert.doesNotMatch(source,/localStorage|sendMessageStream|document\.cookie/)
  }
  const parent=readFileSync(new URL('../src/components/AdminTeachingPanel.vue',import.meta.url),'utf8')
  assert.match(parent,/readmissionEnabled===true/);assert.match(parent,/reenrollmentEnabled===true/)
  assert.match(parent,/:allow-restore="readmissionEnabled"/);assert.match(parent,/:allow-reenroll="reenrollmentEnabled"/)
  const confirmation=readFileSync(new URL('../src/styles/teaching-confirmation.css',import.meta.url),'utf8')
  assert.match(confirmation,/min-height: 44px/);assert.match(confirmation,/font-size: 16px/);assert.match(confirmation,/white-space: pre-line/)
  assert.match(confirmation,/display: inline-flex/)
  const resultSource=readFileSync(new URL('../src/components/TeachingWithdrawalPanel.vue',import.meta.url),'utf8')
  assert.match(resultSource,/本次重新选课结果/);assert.match(resultSource,/operationResult\.person/);assert.match(resultSource,/operationResult\.course/)
  assert.match(resultSource,/await nextTick\(\)[\s\S]*principal!==props\.owner[\s\S]*focus\(\{preventScroll:true\}\)/)
})
