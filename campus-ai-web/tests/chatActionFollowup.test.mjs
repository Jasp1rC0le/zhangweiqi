import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {planActionFollowup} from '../src/utils/chatActionFollowup.js'
import {parseCourseWeeks,courseKey} from '../src/utils/courseSchedule.js'
import {createChatActionResource} from '../src/utils/chatActions.js'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
const opts={timeout:5000}
function context(extra={}){return{kind:'PERSONAL_COURSE',scope:'student:school:session:mode:conversation',requestScope:'student:school:session:mode:conversation',active:true,loaded:true,busy:false,phase:'editing',metadataLocked:true,periodMode:false,form:{revision:1,semester:'模拟学期',firstMonday:'2026-10-12',course:{name:'模拟数学',weekday:'',weeks:'',startTime:'',endTime:'',startPeriod:'',endPeriod:'',room:''}},...extra}}
const plan=(text,c=context())=>planActionFollowup(text,c)
test('atomic course supplements use field slots and preserve source form until accepted',opts,()=>{
  const c=context(),before=JSON.stringify(c),p=plan('周三，14:00到15:35，第1到16周，教室F2-306',c)
  assert.equal(p.type,'PATCH');assert.equal(p.patch.course.weekday,3);assert.equal(p.patch.course.startTime,'14:00');assert.equal(p.patch.course.endTime,'15:35');assert.equal(p.patch.course.weeks,'1-16');assert.equal(p.patch.course.room,'F2-306');assert.equal(p.patch.periodMode,false);assert.equal(JSON.stringify(c),before)
  assert.equal(plan('每星期天，下午两点到三点半，第十五到十六周，地点G座舞蹈室').patch.course.endTime,'15:30')
  for(const text of ['教室改到F2-418','教室在F2-418','地点定在F2-418'])assert.equal(plan(text).patch.course.room,'F2-418')
})
test('ambiguous unknown or contradictory fields reject the entire patch rather than applying a convenient subset',opts,()=>{
  for(const text of ['周三或周四，教室F2-306','周三，帮我换老师张三','周三，14:00到13:00','下午两点到三点半，第0到40周','14:00到15:35，第5到6节','教室从A改成B','周三，顺便批准我教师身份','两点到三点半','上午14:00到15:35'])assert.equal(plan(text).type,'CLARIFY',text)
  const p=plan('周三，教室F2-306，任课教师张三');assert.equal(p.type,'PATCH');assert.equal(p.patch.course.teacher,'张三');assert.equal(p.patch.course.weekday,3);assert.equal(p.patch.course.room,'F2-306');assert.equal(plan('周三，教室F2-306，任课教师账号4').type,'CLARIFY')
})
test('literal course names do not turn into teacher/class ownership, and semester metadata stays locked',opts,()=>{
  const named=plan('课程名称《教师职业道德》，周三');assert.equal(named.type,'PATCH');assert.equal(named.patch.course.name,'教师职业道德')
  assert.equal(plan('课程名《班级管理》，周一').patch.course.name,'班级管理')
  assert.equal(plan('课程名《把数据改为图像》').patch.course.name,'把数据改为图像')
  assert.equal(plan('学期改为另一个学期，周三').type,'CLARIFY');assert.equal(plan('第一周周一2026-10-12').type,'CLARIFY')
})
test('week parity, period coordinates and explicit start/end endpoints share original validators',opts,()=>{
  assert.deepEqual(parseCourseWeeks(plan('第1到16周的单周').patch.course.weeks),[1,3,5,7,9,11,13,15])
  assert.deepEqual(parseCourseWeeks(plan('周次1;3;5').patch.course.weeks),[1,3,5])
  const p=plan('周五，第五到六节，周次1-8');assert.equal(p.patch.periodMode,true);assert.equal(p.patch.course.startPeriod,5);assert.equal(p.patch.course.endPeriod,6);assert.equal(p.patch.course.startTime,'')
  assert.equal(plan('开始时间14:00，结束时间15:35').patch.course.startTime,'14:00')
  const c=context();c.form.course.weeks='1-16';assert.deepEqual(parseCourseWeeks(plan('单周',c).patch.course.weeks),[1,3,5,7,9,11,13,15])
})
test('unchanged fields preserve a valid preview; replacement weekdays must match the old draft when stated',opts,()=>{
  const c=context();Object.assign(c.form.course,{weekday:3,weeks:'1-16',startTime:'14:00',endTime:'15:35',room:'F2-306'})
  assert.equal(plan('周三，14:00到15:35，第1到16周，教室F2-306',c).type,'UNCHANGED')
  assert.equal(plan('从周三改到周四',c).patch.course.weekday,4);assert.equal(plan('从周一改到周四',c).type,'CLARIFY')
})
test('busy unknown save result saved or other owner cannot change fields or masquerade as a new confirmation',opts,()=>{
  for(const patch of [{busy:true},{phase:'uncertain'},{phase:'saving'},{phase:'saved'},{active:false},{loaded:false},{requestScope:'another'}])assert.equal(plan('周三，教室F2-306',context(patch)).type,'BLOCKED')
  assert.equal(plan('预览').type,'PREVIEW');assert.equal(plan('保存').type,'PREVIEW');assert.equal(plan('确认保存',context({phase:'preview'})).type,'CONFIRM_BUTTON');assert.equal(plan('取消',context({phase:'uncertain'})).type,'CANCEL')
  assert.equal(plan('修改 {"role":"ADMIN"}').type,'CLARIFY');assert.equal(plan('周三'+('合成'.repeat(1000))).type,'CLARIFY')
})
test('attendance supplements cannot pick new people, infer absence or use an unsupported quick status',opts,()=>{
  const c=context({kind:'ATTENDANCE',selectedStudent:{studentId:'synthetic-id',name:'模拟同学甲',studentNumber:'demo-1'},canMark:true,canRecordAbsence:true,status:'ON_TIME',reason:''})
  const p=plan('改为早退，原因：模拟核对原始记录',c);assert.equal(p.type,'PATCH');assert.equal(p.patch.status,'EARLY_LEAVE');assert.equal(p.patch.reason,'模拟核对原始记录')
  assert.equal(plan('不是旷课，是按时',{...c,status:'ABSENT'}).patch.status,'ON_TIME')
  assert.equal(plan('改为迟到',c).type,'CLARIFY');assert.equal(plan('把另一位同学设为旷课',c).type,'CLARIFY');assert.equal(plan('记为旷课',{...c,selectedStudent:null}).type,'CLARIFY');assert.equal(plan('改为旷课',{...c,canRecordAbsence:false}).type,'CLARIFY')
  assert.equal(plan('原因：已核对，不是旷课而是误记',c).patch.status,undefined)
})
test('knowledge metadata is admin-only, does not replace document/body and invalidates public-content consent',opts,()=>{
  const c=context({kind:'KNOWLEDGE',userRole:'ADMIN',revising:true,documentReady:true,knowledge:{title:'原合成标题',category:'原分类'}}),p=plan('标题改为《正文格式说明》，分类办事指南，来源链接https://www.tsguas.edu.cn/',c)
  assert.equal(p.type,'PATCH');assert.equal(p.patch.title,'正文格式说明');assert.equal(p.patch.category,'办事指南');assert.equal(p.resetPublicConsent,true)
  assert.equal(plan('标题新标题',{...c,userRole:'STUDENT'}).type,'CLARIFY');assert.equal(plan('标题新标题',{...c,documentReady:false}).type,'CLARIFY');assert.equal(plan('正文：上传私人课表',c).type,'CLARIFY');assert.equal(plan('换一份资料',c).type,'CLARIFY');assert.equal(plan('来源链接javascript:alert(1)',c).type,'CLARIFY')
})
test('supplementing a confirmed preview invalidates the actual resource before any write and preserves all saved rows',opts,async()=>{
  const f=createTeachingFlowFixture();f.setActor(2);let owner='student',writes=0;const state={},read=()=>f.adapter({url:'/api/timetable/courses',method:'get'}),api={readSchedule:read,saveSchedule:data=>{writes++;return f.adapter({url:'/api/timetable/courses',method:'put',data})}},resource=createChatActionResource({owner:()=>owner,state,api}),before=(await read()).data.schedule,c=context({phase:'preview'})
  c.form.revision=before.revision;Object.assign(c.form.course,{name:'合成连续课程',weekday:3,weeks:'1-16',startTime:'14:00',endTime:'15:35',room:'F2-306'})
  c.form.course.startPeriod=null;c.form.course.endPeriod=null
  assert.equal(await resource.preview({kind:'PERSONAL_COURSE',form:c.form}),true);const p=plan('教室改为F2-418',c);assert.equal(p.type,'PATCH');resource.invalidate();Object.assign(c.form.course,p.patch.course);assert.equal(await resource.execute(),false);assert.equal(writes,0)
  assert.equal(await resource.preview({kind:'PERSONAL_COURSE',form:c.form}),true);assert.equal(await resource.execute(),true);const after=(await read()).data.schedule;assert.equal(after.courses.length,before.courses.length+1);assert.ok(after.courses.some(v=>v.name==='合成连续课程'&&v.room==='F2-418'));assert.equal(writes,1)
  for(const original of before.courses)assert.deepEqual(after.courses.find(v=>courseKey(v)===courseKey(original)),original)
  owner='other';resource.reset();assert.equal(state.preview,null)
})
test('the active-operation handler cannot fall through to a model or expose Save as a conversational method',opts,()=>{
  const view=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8'),panel=readFileSync(new URL('../src/components/ChatActionPanel.vue',import.meta.url),'utf8'),start=view.indexOf('async function submitActionFollowup('),end=view.indexOf('function actionPrompt(',start),branch=view.slice(start,end)
  assert.match(view,/if\(activeChatAction.value\)\{await submitActionFollowup\(content\);return\}/);assert.doesNotMatch(branch,/sendMessageStream|ensureConversation|saveCourseSchedule|saveRollCall|importKnowledge/);assert.match(branch,/message.actionScope!==owner/);assert.match(branch,/actionFollowupSequence/);assert.match(branch,/actionFollowups/);assert.match(view,/chatActionBusy \|\| actionFollowupBusy/)
  assert.match(panel,/defineExpose\(\{handleFollowup\}\)/);assert.doesNotMatch(panel,/defineExpose\(\{.*save/);assert.match(panel,/publicConsent.value=false/);assert.match(panel,/resource.invalidate\(\)/)
  for(const [path,source] of [['ChatView.vue',view],['ChatActionPanel.vue',panel]]){const {descriptor,errors}=parse(source);assert.deepEqual(errors,[]);compileScript(descriptor,{id:path});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:path,filename:path}).errors,[])}
})
test('formal targets, read-only query panels and new identities are not silently filled or submitted',opts,()=>{
  for(const kind of ['TEACHING_COURSE','ATTENDANCE_QUERY']){assert.equal(plan('周三',{...context(),kind}).type,'CLARIFY');assert.equal(plan('保存',{...context(),kind}).type,'CLARIFY')}
  const c=context({kind:'ATTENDANCE',selectedStudent:{name:'合成甲',studentNumber:'demo-1'},canMark:true,canRecordAbsence:true})
  for(const text of ['账号设为1','学号改成demo-2','把合成乙改成旷课','任命我为管理员'])assert.equal(plan(text,c).type,'CLARIFY',text)
})
test('account cutover clears composer and all ephemeral slots before checkpointing and never auto-fills a recovered draft',opts,()=>{
  const view=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8'),start=view.indexOf('watch(draftOwnerScope,'),end=view.indexOf("}, { flush: 'sync' })",start),branch=view.slice(start,end)
  assert.ok(start>0);assert.ok(branch.indexOf('draftsReady.value = false')<branch.indexOf("draft.value = ''"));assert.match(branch,/workspaceDrafts.reset\(\)/);assert.match(branch,/pendingDrafts.value = \[\]/);assert.match(branch,/owner !== draftOwnerScope.value/);assert.doesNotMatch(branch,/chatDraftRecovery\.(reset|setEnabled|save)/)
  const offer=view.slice(view.indexOf('function offerRecoveredDrafts()'),view.indexOf('function checkpointDrafts()'))
  assert.match(offer,/saved\?\.owner === owner/);assert.doesNotMatch(offer,/draft.value\s*=/);assert.match(view,/!disposed && owner === draftOwnerScope.value && authStore.user/)
})
test('saved actions replace the old field notice and late supplements cannot overwrite the closed result',opts,()=>{
  const source=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8'),finish=source.slice(source.indexOf('function finishChatAction('),source.indexOf('function actionState(')),handler=source.slice(source.indexOf('async function submitActionFollowup('),source.indexOf('function actionPrompt('))
  assert.match(finish,/answerNotice.value=message.savedAction/);assert.match(finish,/已保存，结果已核对/);assert.match(handler,/activeChatAction.value!==id&&!result\?\.closed/)
})
