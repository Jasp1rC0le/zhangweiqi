import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse,compileScript,compileTemplate } from '@vue/compiler-sfc'
import { resolveChatAction,createChatActionResource,knowledgePlan } from '../src/utils/chatActions.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
import { createAdminFixture } from '../design/adminFixture.js'
import { chinaDate,addDays } from '../src/utils/timetable.js'
const options={timeout:5000},day=chinaDate()
function setup(){
  const f=createTeachingFlowFixture(),docs=createAdminFixture({schoolId:1}),state={};let owner='actor-2',writes=0
  const call=(url,params={},method='get',data,signal)=>f.adapter({url,params,method,data,signal})
  const admin=async(url,method='get',data)=>{if(f.principal().role!=='ADMIN')throw{response:{status:403,data:{message:'正常管理员会话才可操作'}}};return(await docs.adapter({url,method,data})).data}
  const api={readSchedule:signal=>call('/api/timetable/courses',{},'get',undefined,signal),saveSchedule:(data,signal)=>{writes++;return call('/api/timetable/courses',{},'put',data,signal)},readDetail:(id,view,page,search,signal)=>call(`/api/teaching/lessons/${id}/page`,{view,page,search,size:50},'get',undefined,signal),saveMarks:(id,data,page,search,signal)=>{writes++;return call(`/api/teaching/lessons/${id}/attendance/page`,{page,search,size:50},'put',data,signal)},readDocument:id=>admin(`/api/admin/knowledge/documents/${id}`),reviseDocument:(id,data)=>{writes++;return admin(`/api/admin/knowledge/documents/${id}/revisions`,'post',data)},importDocument:data=>{writes++;return admin('/api/admin/knowledge/documents','post',data)}}
  let clock=1000;const resource=createChatActionResource({owner:()=>owner,state,api,now:()=>clock})
  return{f,docs,state,api,resource,writes:()=>writes,setClock:v=>clock=v,switchActor:id=>{f.setActor(id);owner=`actor-${id}`;resource.reset()},call}
}
test('intent routing recognizes operations without treating instructions, examples or public questions as writes',options,()=>{
  const parsed=resolveChatAction('新增课程 物理 周三14:00-15:35 第1-16周 教室F2-306')
  assert.equal(parsed.kind,'PERSONAL_COURSE');assert.equal(parsed.seed.name,'物理');assert.equal(parsed.seed.weekday,3);assert.equal(parsed.seed.startTime,'14:00');assert.equal(parsed.seed.weeks,'1-16');assert.equal(parsed.seed.room,'F2-306')
  for(const s of ['新增课程','给我的课表添加一门课','新增课程“数学”周一第1-2节'])assert.equal(resolveChatAction(s).kind,'PERSONAL_COURSE')
  assert.equal(resolveChatAction('给一班新增课程“数学”，任课老师已确认').kind,'TEACHING_COURSE')
  for(const text of ['给张老师新增课程 数学','给软件一班新增课程 数学','请为李教师添加课程“数学”','给软件一班新增课程 {"name":"数学"}'])assert.equal(resolveChatAction(text).kind,'TEACHING_COURSE')
  for(const text of ['新增课程 高等数学 教师张老师','新增课程 高等数学 教师：张三','新增课程 高等数学，老师张三']){const intent=resolveChatAction(text);assert.equal(intent.kind,'TEACHING_COURSE');assert.equal(intent.seed.name,'高等数学')}
  assert.equal(resolveChatAction('新增课程“教师职业道德”').kind,'PERSONAL_COURSE')
  assert.equal(resolveChatAction('给我新增课程“班级管理”').kind,'PERSONAL_COURSE')
  assert.equal(resolveChatAction('给小王新增课程“数学”').kind,'CLARIFY_ACTION')
  assert.equal(resolveChatAction('给张老师的我的课表新增课程 数学').kind,'CLARIFY_ACTION')
  assert.equal(resolveChatAction('将张三设为旷课').seed.student,'张三');assert.equal(resolveChatAction('把李四改为早退').seed.status,'EARLY_LEAVE')
  assert.equal(resolveChatAction('修改知识库“报修指南”').kind,'KNOWLEDGE');assert.equal(resolveChatAction('查本班考勤').kind,'ATTENDANCE_QUERY')
  for(const s of ['如何新增课程','如果把张三设为旷课会怎么样','不要把李四设为旷课','今天上什么课','解释这段代码 `{}`','查看图书馆开放时间'])assert.equal(resolveChatAction(s),null)
})
test('bounded parsing cannot leak explicit long or code-shaped mutations into model chat',options,()=>{
  for(const text of ['修改知识库：'+('合成正文'.repeat(250)),'修改知识库 {"content":"合成正文"}','你好，请帮我修改知识库：'+('不要把私人名单公开。'.repeat(100))])assert.equal(resolveChatAction(text).kind,'KNOWLEDGE')
  for(const text of ['将模拟同学设为旷课 {"studentId":"mock"}','请把模拟同学设为早退 ```json\n{}\n```','更正考勤 '+('合成依据'.repeat(250))]){const intent=resolveChatAction(text);assert.equal(intent.kind,'ATTENDANCE');assert.equal(intent.seed.student,'');assert.equal(intent.seed.status,'')}
  assert.equal(resolveChatAction('修改下面代码以新增课程 `{name:"x"}`'),null)
  assert.equal(resolveChatAction('查询考勤 {"student":"合成同学"}').kind,'ATTENDANCE_QUERY')
  assert.equal(resolveChatAction('请修改 '+('合成内容'.repeat(250))).kind,'CLARIFY_ACTION')
})
test('personal course previews read only, preserve all previous rows, and require explicit confirmation',options,async()=>{
  const s=setup(),before=(await s.api.readSchedule()).data.schedule
  const input={kind:'PERSONAL_COURSE',form:{revision:before.revision,course:{name:'合成新增课',weekday:2,startTime:'10:20',endTime:'11:55',weeks:'1-3',room:'合成教室'}}}
  assert.equal(await s.resource.execute(),false);assert.equal(await s.resource.preview(input),true);assert.equal(s.writes(),0)
  assert.equal((await s.api.readSchedule()).data.schedule.courses.length,before.courses.length)
  assert.equal(await s.resource.execute(),true);assert.equal(s.writes(),1)
  const after=(await s.api.readSchedule()).data.schedule;assert.equal(after.courses.length,before.courses.length+1);assert.ok(before.courses.every(c=>after.courses.some(x=>JSON.stringify(x)===JSON.stringify(c))))
  assert.equal(await s.resource.execute(),false);assert.equal(s.writes(),1)
})
test('editing or expired previews cannot write; wrong save receipts become uncertain and cannot retry',options,async()=>{
  const s=setup(),saved=(await s.api.readSchedule()).data.schedule,input={kind:'PERSONAL_COURSE',form:{revision:saved.revision,course:{name:'合成核对课',weekday:1,startTime:'08:30',endTime:'10:05',weeks:'1',room:''}}}
  await s.resource.preview(input);s.resource.invalidate();assert.equal(await s.resource.execute(),false);assert.equal(s.writes(),0)
  await s.resource.preview(input);s.setClock(302000);assert.equal(await s.resource.execute(),false);assert.match(s.state.error,/5分钟/)
  s.setClock(303000);await s.resource.preview(input);s.api.saveSchedule=async()=>({data:{schedule:saved}})
  assert.equal(await s.resource.execute(),false);assert.equal(s.state.phase,'uncertain');assert.equal(await s.resource.execute(),false);assert.equal(await s.resource.preview(input),false)
})
test('an authorized teacher can mark one explicit student; another student cannot read or mutate that scope',options,async()=>{
  const s=setup();s.switchActor(4);s.f.advanceTo('14:02')
  const list=(await s.call('/api/teaching/lessons/page',{view:'TEACHER',from:day,to:addDays(day,6),page:0,size:50,search:''})).data
  const lesson=list.items[0],page=(await s.api.readDetail(lesson.id,'TEACHER',0,'')).data,e=page.detail.entries[0]
  const input={kind:'ATTENDANCE',lessonId:lesson.id,page:0,search:'',revision:page.detail.lesson.revision,studentId:e.studentId,studentNumber:e.studentNumber,studentName:e.name,status:'ABSENT',reason:''}
  assert.equal(await s.resource.preview(input),true);assert.equal(s.f.audit().length,0);assert.equal(await s.resource.execute(),true);assert.equal(s.f.audit().length,1)
  const after=(await s.api.readDetail(lesson.id,'TEACHER',0,'')).data.detail
  assert.equal(after.entries.find(x=>x.studentId===e.studentId).status,'ABSENT');assert.ok(after.entries.filter(x=>x.studentId!==e.studentId).every(x=>x.status==='UNKNOWN'))
  s.switchActor(2);assert.equal(await s.resource.preview({...input,revision:1}),false);assert.match(s.state.error,/没有|不在/);assert.equal(s.f.audit().length,1)
})
test('correction requires reason; a changed lesson revision rejects the old confirmed preview',options,async()=>{
  const s=setup();s.switchActor(4);s.f.advanceTo('14:02');const lesson=(await s.call('/api/teaching/lessons',{view:'TEACHER',from:day,to:day})).data[0],page=(await s.api.readDetail(lesson.id,'TEACHER',0,'')).data,e=page.detail.entries[0]
  const input={kind:'ATTENDANCE',lessonId:lesson.id,page:0,search:'',revision:0,studentId:e.studentId,studentNumber:e.studentNumber,studentName:e.name,status:'ON_TIME',reason:''}
  await s.resource.preview(input);await s.api.saveMarks(lesson.id,{revision:0,marks:[{studentId:e.studentId,status:'EARLY_LEAVE'}],reason:'',finish:false},0,'')
  assert.equal(await s.resource.execute(),false);assert.equal(s.state.phase,'editing');assert.match(s.state.error,/版本/)
  assert.equal(await s.resource.preview({...input,revision:1}),false);assert.match(s.state.error,/原因/)
  assert.equal(await s.resource.preview({...input,revision:1,reason:'已核对教师原始点名记录'}),true);assert.equal(await s.resource.execute(),true);assert.equal(s.f.audit().at(-1).old,'EARLY_LEAVE')
})
test('knowledge maintenance uses the normal admin boundary, public-content confirmation and version token',options,async()=>{
  const s=setup();s.switchActor(1);const doc=await s.api.readDocument(111)
  const input={kind:'KNOWLEDGE',mode:'REVISE',documentId:111,revisionTag:doc.revisionTag,schoolId:1,publicConsent:true,document:{title:doc.title,category:doc.category,sourceDepartment:doc.sourceDepartment,sourceUrl:doc.sourceUrl,publishedAt:doc.publishedAt,effectiveAt:null,expiresAt:null,content:'这是一份修订后的合成资料，不是真实校园通知。'}}
  assert.throws(()=>knowledgePlan({...input,publicConsent:false},doc,1),/公开/)
  assert.equal(await s.resource.preview(input),true);assert.equal(s.writes(),0);assert.equal(await s.resource.execute(),true)
  assert.equal((await s.api.readDocument(111)).status,'ARCHIVED');assert.equal((await s.api.readDocument(121)).rawContent,input.document.content)
  s.switchActor(2);assert.equal(await s.resource.preview(input),false);assert.match(s.state.error,/管理员/)
})
test('an account switch discards a late private preview and never writes',options,async()=>{
  const s=setup();let resolve;s.api.readSchedule=()=>new Promise(r=>resolve=r)
  const pending=s.resource.preview({kind:'PERSONAL_COURSE',form:{revision:0,semester:'合成',firstMonday:'2026-10-12',course:{name:'合成课',weekday:1,startTime:'08:30',endTime:'09:15',weeks:'1',room:''}}})
  s.switchActor(8);resolve({data:{schedule:null}});assert.equal(await pending,false);assert.equal(s.state.preview,null);assert.equal(s.writes(),0)
})
test('chat action UI compiles and the dispatch path cannot invoke model/history or publish private inputs',options,()=>{
  for(const path of ['src/components/ChatActionPanel.vue','src/components/AdminTeachingPanel.vue','src/views/ChatView.vue']){
    const source=readFileSync(new URL('../'+path,import.meta.url),'utf8'),{descriptor,errors}=parse(source);assert.deepEqual(errors,[]);compileScript(descriptor,{id:path});assert.deepEqual(compileTemplate({source:descriptor.template.content,id:path,filename:path}).errors,[])
  }
  const chat=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8'),branch=chat.slice(chat.indexOf('if(action){'),chat.indexOf('// Personal schedule answers'))
  assert.doesNotMatch(branch,/sendMessageStream|ensureConversation|createKnowledgeSubmission/);assert.match(branch,/localAction:true/)
  assert.match(chat,/onBeforeRouteUpdate/);assert.match(chat,/!message.localAction/)
  assert.match(chat,/\['ATTENDANCE','TEACHING_COURSE','TEACHING_LESSON_CHANGE'\]\.includes\(message.action.kind\)\?'\/teaching'/);assert.match(chat,/查看教学配置/)
  const panel=readFileSync(new URL('../src/components/ChatActionPanel.vue',import.meta.url),'utf8')
  assert.doesNotMatch(panel,/localStorage|sessionStorage|sendMessageStream|Cookie|getUserAccessToken/);assert.match(panel,/不含个人名单、考勤或私人课表/)
})
