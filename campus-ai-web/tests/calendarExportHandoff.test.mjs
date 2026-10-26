import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { calendarExportIntent, calendarExportScopeKey, checkedCalendarExportContext, requireCalendarExportAccess } from '../src/utils/calendarExportHandoff.js'
import { createGovernanceClassSelection } from '../src/utils/governanceClassSelection.js'
const opts={timeout:5000}, id='00000000-0000-4000-8000-000000000002'
const context=(extra={})=>({owner:'2:1:epoch',view:'STUDENT',from:'2026-10-26',to:'2026-11-01',classId:'',...extra})
const checked=(extra={})=>({owner:'2:1:epoch',week:{monday:'2026-10-26',sunday:'2026-11-01',view:'STUDENT'},view:'STUDENT',monday:'2026-10-26',classId:'',confirmed:true,...extra})
test('calendar handoff retains the checked week and exact personal perspective rather than this-week defaults',opts,()=>{
  for(const view of ['STUDENT','TEACHER'])assert.deepEqual(calendarExportIntent(context({view}),'2:1:epoch'),{...context({view}),source:'MY'})
})
test('leadership and selected-class handoffs stay teaching-only without claiming that personal imports are in a class file',opts,()=>{
  for(const view of ['COUNSELOR','SECRETARY'])assert.equal(calendarExportIntent(context({view}),'2:1:epoch').source,'TEACHING')
  for(const view of ['STUDENT','TEACHER','COUNSELOR','SECRETARY']){const intent=calendarExportIntent(context({view,classId:id}),'2:1:epoch');assert.equal(intent.source,'TEACHING');assert.equal(intent.classId,id);assert.equal(intent.view,view)}
})
test('foreign owner unknown role malformed class and incomplete week fail before any capability or file request',opts,()=>{
  for(const extra of [{owner:'other'},{view:'ADMIN'},{view:'SQL'},{classId:'forged'},{classId:[id]},{classId:undefined},{from:'2026-02-30'},{from:'2026-10-27'},{to:'2026-11-02'},{from:'1999-01-04',to:'1999-01-10'}])assert.throws(()=>calendarExportIntent(context(extra),'2:1:epoch'))
  assert.throws(()=>calendarExportIntent(context(),''))
})
test('only exact resolved calendar queries emit export context, including confirmed empty weeks',opts,()=>{
  assert.deepEqual(checkedCalendarExportContext(checked()),context())
  assert.equal(checkedCalendarExportContext(checked({confirmed:false})),null)
  for(const key of ['loading','stale','error','scopeLoading','scopeError','noticeBusy'])assert.equal(checkedCalendarExportContext(checked({[key]:true})),null,key)
  assert.equal(checkedCalendarExportContext(checked({week:null})),null)
  assert.equal(checkedCalendarExportContext(checked({view:'TEACHER'})),null)
  assert.equal(checkedCalendarExportContext(checked({monday:'2026-11-02'})),null)
})
test('capability recheck requires exact source and role and never downgrades a requested class to MY or STUDENT',opts,()=>{
  const intent=calendarExportIntent(context({view:'SECRETARY',classId:id}),'2:1:epoch')
  assert.equal(requireCalendarExportAccess({sources:['TEACHING'],teachingViews:['SECRETARY']},intent),intent)
  for(const access of [null,{sources:['MY'],personalViews:['STUDENT']},{sources:['TEACHING'],teachingViews:['COUNSELOR']}])assert.throws(()=>requireCalendarExportAccess(access,intent),/没有改用其他身份或全部班级/)
})
test('handoff is a frozen minimal intention, excluding URL account labels file tokens or requested privilege',opts,()=>{
  const intent=calendarExportIntent(context({role:'ADMIN',userId:999,className:'伪造班级',token:'not-used',format:'PDF'}),'2:1:epoch')
  assert.deepEqual(Object.keys(intent),['owner','source','view','from','to','classId']);assert.ok(Object.isFrozen(intent));assert.equal(intent.role,undefined)
})
test('scope comparison ignores user file format and text filters so repeat opening preserves them',opts,()=>{
  const intent=calendarExportIntent(context(),'2:1:epoch')
  assert.equal(calendarExportScopeKey(intent),calendarExportScopeKey({...intent,format:'PDF',search:'合成课程',period:'MORNING'}))
  for(const key of ['source','view','from','to','classId'])assert.notEqual(calendarExportScopeKey(intent),calendarExportScopeKey({...intent,[key]:'different'}))
})
test('export selected lookup confirms out-of-page metadata instead of assuming that a visible name grants a class',opts,async()=>{
  let query;const state={},row={value:id,label:'合成页外班级',description:'合成学院'},resource=createGovernanceClassSelection({scope:()=> 'export-owner',state,read:async q=>{query=q;return{data:{page:0,size:25,total:0,totalPages:0,items:[],selected:row}}}})
  assert.deepEqual(await resource.resolve('SECRETARY',id),row);assert.equal(query.selected,id);assert.equal(query.size,25);resource.dispose()
})
test('an export class failure or missing confirmation never resolves to all-scope, and cancelled lookup cannot return late',opts,async()=>{
  for(const missing of [true,false]){const state={},r=createGovernanceClassSelection({scope:()=> 'export-owner',state,read:async()=>{if(!missing)throw{response:{status:503,data:{message:'合成失败'}}};return{data:{page:0,size:25,total:0,totalPages:0,items:[],selected:null}}}});assert.equal(await r.resolve('SECRETARY',id),null);assert.equal(state.selected,null);assert.ok(state.error);r.dispose()}
  let finish;const state={},r=createGovernanceClassSelection({scope:()=> 'export-owner',state,read:()=>new Promise(done=>{finish=done})}),waiting=r.resolve('SECRETARY',id);r.reset();finish({data:{page:0,size:25,total:0,totalPages:0,items:[],selected:{value:id,label:'合成',description:''}}});assert.equal(await waiting,null);assert.equal(state.selected,null);r.dispose()
})
test('existing Vue forms compile with explicit pending-intent choice, checked class gate and no new model/storage path',opts,()=>{
  for(const file of ['components/ScheduleExportPanel.vue','components/UnifiedWeekCalendar.vue','views/TimetableView.vue']){const text=readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{descriptor,errors}=parse(text);assert.deepEqual(errors,[]);compileScript(descriptor,{id:file});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:file,id:file}).errors,[])}
  const panel=readFileSync(new URL('../src/components/ScheduleExportPanel.vue',import.meta.url),'utf8'),page=readFileSync(new URL('../src/views/TimetableView.vue',import.meta.url),'utf8')
  assert.match(panel,/if\(fileBlocked.value\)return/);assert.match(panel,/requireCalendarExportAccess\(state.access,target\)/);assert.match(panel,/classResource.resolve\(form.view,form.classId\)/)
  assert.match(panel,/已有导出条件或文件准备已保留/);assert.match(panel,/保留现有导出条件/);assert.match(panel,/handoffGeneration\+\+/);assert.match(panel,/未改查全部班级/);assert.match(panel,/不含本人个人导入/)
  assert.match(panel,/v-if="!state.preview&&initialized"/);assert.match(panel,/classPickerRefresh.value\+\+/);assert.match(panel,/带入范围尚未确认/);assert.match(panel,/class="hint" role="status">\{\{calendarProvenance\}\}/)
  assert.match(panel,/watch\(\(\)=>\[props.owner,props.active\],\(\)=>\{calendarClassIntent.value=false;calendarProvenance.value=''/);assert.match(panel,/async function fullPersonal\(\)\{if\(busy.value\|\|!owner\(\)\)return;calendarClassIntent.value=false;calendarProvenance.value=''/)
  assert.match(page,/@export-context="calendarExportChanged"/);assert.match(page,/:disabled="!calendarExportContext"/);assert.doesNotMatch(panel,/localStorage|sessionStorage|sendMessageStream/)
})
test('only deliberate all-class picker input releases a calendar-imposed class requirement; failed reads never do',opts,()=>{
  const panel=readFileSync(new URL('../src/components/ScheduleExportPanel.vue',import.meta.url),'utf8')
  assert.match(panel,/:model-value="form.classId" @update:model-value="manualClassChange"/)
  const handler=panel.slice(panel.indexOf('function manualClassChange'),panel.indexOf('function currentCalendar'))
  assert.match(handler,/if\(calendarClassIntent.value&&value===''\)\{requirement.value='AUTHORIZED';calendarClassIntent.value=false\}/)
  assert.match(handler,/if\(busy.value\|\|typeof value!=='string'\)return/)
  assert.match(panel,/requirement.value=target.classId\?'CLASS':'AUTHORIZED';calendarClassIntent.value=!!target.classId/)
  const resolver=panel.slice(panel.indexOf('async function resolveClass'),panel.indexOf('async function applyCalendar'))
  assert.doesNotMatch(resolver,/requirement.value=/);assert.match(panel,/if\(fileBlocked.value\)return/)
})
