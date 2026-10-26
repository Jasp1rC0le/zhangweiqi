import test from 'node:test'
import assert from 'node:assert/strict'
import { planPrivateCourseExport } from '../src/utils/privateCourseExportIntent.js'
import { resolveTeachingWorkflow, teachingWorkflowDestination, previousTeachingWorkflow } from '../src/utils/teachingWorkflows.js'
const today='2026-10-17',scope='synthetic-owner:school:session:chat',options={today,scope}
const resolve=(text,previous)=>resolveTeachingWorkflow(text,{...options,previous:previous?{...previous,scope}:null})
test('other people stay unresolved; collective exports use a separate authorized selector rather than the owner file',()=>{
  for(const text of ['导出模拟同学甲的课表','下载全班课表','导出张三课表','导出“张三”的课表','导出任课老师的课表','给我导一份我们学院课表','导出我的同桌课表']){
    const value=resolve(text);assert.equal(value.workflow,'TIMETABLE',text);assert.notEqual(value.personalExport,true,text)
    if(value.scheduleExport){assert.equal(value.exportPreset.source,'TEACHING');assert.ok(['CLASS','COLLEGE'].includes(value.exportPreset.scope));assert.equal(teachingWorkflowDestination(value).query.classId,undefined)}
    else{assert.equal(value.pendingPrivateExport?.target||value.pendingScheduleExport?.target,true,text);assert.equal(teachingWorkflowDestination(value),null,text)}
  }
})
test('explicit day/week/period/course subset is not quietly replaced by a full saved semester',()=>{
  for(const text of ['导出我明天的课表','下载本周课表','导出我10月13号课表','导出我的数学课表','下载我的课表只要上午','导出我第3周课表']){
    const value=resolve(text);if(value.scheduleExport){assert.ok(value.exportPreset.from&&value.exportPreset.to);assert.equal(value.personalExport,undefined);assert.equal(teachingWorkflowDestination(value).query.tool,'schedule-export')}
    else{assert.ok(value.pendingPrivateExport?.coverage||value.pendingScheduleExport?.date,text);assert.equal(teachingWorkflowDestination(value),null,text)}
  }
  for(const text of ['导出我的课表','下载本人完整学期JSON课表','请帮我备份已保存课表','导出这学期我的课表','只导出我自己的课表'])assert.equal(resolve(text).personalExport,true,text)
})
test('new formats are not mislabeled JSON and switching format keeps the selected export dates and scope',()=>{
  for(const format of ['Excel','PDF','CSV','ICS']){
    const value=resolve(`导出我的课表为${format}`);assert.equal(value.scheduleExport,true);assert.equal(value.exportPreset.format,format==='Excel'?'XLSX':format)
    const json=resolve('JSON',value);assert.equal(json.scheduleExport,true);assert.equal(json.exportPreset.format,'JSON');assert.equal(json.exportPreset.from,value.exportPreset.from)
  }
  const first=resolve('导出全班明天课表为Excel'),format=resolve('JSON',first)
  assert.equal(format.exportPreset.source,'TEACHING');assert.equal(format.exportPreset.scope,'CLASS');assert.equal(format.exportPreset.format,'JSON');assert.equal(format.exportPreset.from,'2026-10-18')
  const self=resolve('本人',format);assert.equal(self.exportPreset.source,'MY');assert.equal(self.exportPreset.from,'2026-10-18')
  const full=resolve('完整学期',self);assert.equal(full.pendingScheduleExport.date,true);assert.equal(teachingWorkflowDestination(full),null)
})
test('explicit supplements can arrive in another order; an affirmation does not adopt a named person as self',()=>{
  const first=resolve('导出张三明天课表为PDF')
  assert.equal(resolve('可以',first).pendingScheduleExport.target,true)
  assert.equal(resolve('张三',first).pendingScheduleExport.target,true)
  const own=resolve('本人',first);assert.equal(own.exportPreset.source,'MY')
  const full=resolve('整个学期',own);assert.equal(full.pendingScheduleExport.date,true);assert.equal(full.pendingScheduleExport.format,'PDF')
  const final=resolve('不要PDF，用JSON',full);assert.equal(final.pendingScheduleExport.date,true);assert.equal(final.pendingScheduleExport.format,'JSON')
})
test('a partial-date supplement remains a clarification and a chosen full semester does not infer private data',()=>{
  const first=resolve('导出明天课表'),again=resolve('只要下午',first)
  assert.equal(again.exportPreset.from,'2026-10-18');assert.equal(again.exportPreset.period,'AFTERNOON');assert.equal(teachingWorkflowDestination(again).query.tool,'schedule-export')
  assert.equal(resolve('这学期完整的',again).pendingScheduleExport.date,true)
})
test('cancellation stays local and ordinary new topics or wrong owners never inherit export slots',()=>{
  const first=resolve('导出模拟同学甲的课表')
  const cancel=resolve('取消',first);assert.equal(cancel.cancelled,true);assert.equal(teachingWorkflowDestination(cancel),null)
  assert.equal(resolve('我水卡丢了怎么办',first),null)
  assert.equal(resolveTeachingWorkflow('本人',{today,scope:'another-owner',previous:{...first,scope}}),null)
  assert.equal(planPrivateCourseExport('JSON',{today}),null)
  assert.equal(resolve('写一个导出课表的脚本',first),null)
  assert.equal(resolve('请解释“导出课表”这四个字是什么意思'),null)
})
test('pending slots contain no target ids, names, role claims or arbitrary payload keys',()=>{
  const first=resolve('导出模拟同学甲的课表')
  const value=planPrivateCourseExport('JSON',{today,previous:{...first.pendingPrivateExport,userId:900,role:'ADMIN',name:'模拟同学'}})
  assert.deepEqual(Object.keys(value.pendingPrivateExport).sort(),['coverage','format','target'])
  assert.equal(teachingWorkflowDestination({...value,workflow:'TIMETABLE',userId:900,role:'ADMIN'}),null)
  const messages=[{role:'assistant',workflowContext:{...first,scope}}]
  assert.deepEqual(previousTeachingWorkflow(messages,scope).pendingPrivateExport,first.pendingPrivateExport)
  assert.equal(previousTeachingWorkflow(messages,'other'),null)
})
test('long exports fail closed instead of falling back to a truncated personal-file intent',()=>{
  const value=resolve('导出'+ '补充'.repeat(6000)+'模拟同学甲的课表')
  assert.match(value.clarification,/过长/);assert.equal(teachingWorkflowDestination(value),null)
  assert.deepEqual(value.pendingPrivateExport,{target:true,coverage:true,format:true})
})
test('review F1 negated and mixed owner claims remain unresolved after complete-semester supplements',()=>{
  for(const text of ['导出不是我的课表','导出非本人的课表','导出张三和我的课表','导出本人和张三的课表']){
    const first=resolve(text);assert.equal(first.pendingPrivateExport.target,true,text)
    const full=resolve('完整学期',first);assert.equal(full.pendingPrivateExport.target,true,text);assert.equal(teachingWorkflowDestination(full),null,text)
    const self=resolve('本人',full);assert.equal(self.personalExport,true,text)
  }
  const pending=resolve('导出我明天的课表'),negated=resolve('不是我的',pending)
  assert.equal(negated.pendingScheduleExport.target,true)
  assert.equal(teachingWorkflowDestination(resolve('完整学期',negated)),null)
})
