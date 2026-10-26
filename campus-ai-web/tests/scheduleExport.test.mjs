import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {unzipSync,strFromU8} from 'fflate'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate,addDays,mondayOf} from '../src/utils/timetable.js'
import {scheduleExportFilter,createScheduleExportResource,savedCoverageRange} from '../src/utils/scheduleExport.js'
import {resolveScheduleFileRequest,scheduleExportRoute} from '../src/utils/scheduleFileIntent.js'
import {resolveTeachingWorkflow,teachingWorkflowDestination} from '../src/utils/teachingWorkflows.js'
const opts={timeout:10000},today=chinaDate(),root='/api/timetable/exports'
const filter=(extra={})=>({source:'MY',view:'STUDENT',from:mondayOf(today),to:addDays(mondayOf(today),13),classId:'',period:'ALL',format:'XLSX',search:'',includeCancelled:false,...extra})
function setup(extra={}){const f=createTeachingFlowFixture(),state={access:null};let owner='student-2';const files=[],call=(path,method,data,signal)=>f.adapter({url:root+path,method,data,signal}),resource=createScheduleExportResource({owner:()=>owner,state,readAccess:s=>call('/access','get',undefined,s),prepare:(d,s)=>call('/prepare','post',d,s),download:(d,s)=>call('/download','post',d,s),onFile:(blob,filename)=>files.push({blob,filename}),...extra});return{f,state,files,resource,call,cutover:()=>{owner='another';resource.reset(true)}}}
test('multi-format date and class exports route locally with independent owner/date/format slots and no authority in URLs',opts,()=>{
  const day='2026-10-17',p=resolveScheduleFileRequest('导出我的这周课表PDF',{today:day});assert.equal(p.scheduleExport,true);assert.equal(p.exportPreset.from,'2026-10-12');assert.equal(p.exportPreset.to,'2026-10-18');assert.equal(p.exportPreset.format,'PDF');assert.equal(p.exportPreset.source,'MY')
  const group=resolveScheduleFileRequest('导出我们班下周课表Excel',{today:day});assert.equal(group.exportPreset.scope,'CLASS');assert.equal(group.exportPreset.source,'TEACHING');assert.equal(group.exportPreset.format,'XLSX')
  const intent=resolveTeachingWorkflow('导出我的今天上午课表ICS',{today:day,scope:'a'});assert.equal(intent.exportPreset.period,'MORNING');const d=teachingWorkflowDestination(intent);assert.equal(d.query.tool,'schedule-export');assert.equal(d.path,'/timetable');assert.equal(scheduleExportRoute({...d.query,userId:'999',classId:'forged'}).userId,undefined);assert.equal(scheduleExportRoute({...d.query,userId:'999',classId:'forged'}).classId,undefined)
  const forged=teachingWorkflowDestination({...intent,exportPreset:{...intent.exportPreset,userId:'999',role:'ADMIN',tool:'other'}});assert.equal(forged.query.userId,undefined);assert.equal(forged.query.role,undefined);assert.equal(forged.query.tool,'schedule-export')
})
test('named people mixed targets full terms and fresh topics cannot silently become the account owner or a partial week',opts,()=>{
  const day='2026-10-17',p=resolveScheduleFileRequest('导出张三的课表PDF',{today:day});assert.ok(p.clarification);assert.equal(p.pendingScheduleExport.target,true);assert.equal(resolveScheduleFileRequest('我和张三',{today:day,previous:p.pendingScheduleExport}).pendingScheduleExport.target,true)
  const own=resolveScheduleFileRequest('本人',{today:day,previous:p.pendingScheduleExport});assert.equal(own.scheduleExport,true);assert.equal(own.exportPreset.source,'MY');assert.equal(own.exportPreset.format,'PDF')
  assert.ok(resolveScheduleFileRequest('导出我的和全班的课表Excel',{today:day}).clarification)
  const term=resolveScheduleFileRequest('导出本人整学期课表Excel',{today:day});assert.equal(term.pendingScheduleExport.date,true);const dated=resolveScheduleFileRequest('2026-09-07到2027-01-31',{today:day,previous:term.pendingScheduleExport});assert.equal(dated.scheduleExport,true);assert.equal(dated.exportPreset.from,'2026-09-07');assert.equal(dated.exportPreset.to,'2027-01-31')
  assert.equal(resolveScheduleFileRequest('水卡丢了怎么办',{today:day,previous:term.pendingScheduleExport}),null);assert.equal(resolveScheduleFileRequest('Excel',{today:day}),null);assert.equal(resolveScheduleFileRequest('导出本人完整课表JSON',{today:day}),null)
})
test('actual DEV XLSX preserves typed dates and exact row count while original personal JSON and model APIs remain untouched',opts,async()=>{
  const s=setup();assert.equal(await s.resource.access(),true);assert.equal(await s.resource.prepare(filter()),true);const preview=s.state.preview;assert.ok(preview.count>0);assert.equal(await s.resource.download(),true);assert.equal(s.files.length,1);assert.match(s.files[0].filename,/\.xlsx$/)
  const zip=unzipSync(new Uint8Array(await s.files[0].blob.arrayBuffer())),sheet=strFromU8(zip['xl/worksheets/sheet1.xml']);assert.match(sheet,/<pane.*state="frozen"/);assert.match(sheet,/<c r="A6" s="2" ><v>\d+<\/v>/);assert.equal((sheet.match(/<row /g)||[]).length,preview.count+4);assert.doesNotMatch(sheet,/<f>/);s.resource.dispose()
})
test('CSV ICS and JSON exports contain actual selected records with distinct event IDs across weeks and verified bytes',opts,async()=>{
  for(const format of ['CSV','ICS','JSON']){const s=setup();await s.resource.access();assert.equal(await s.resource.prepare(filter({format})),true,s.state.error);const count=s.state.preview.count;assert.equal(await s.resource.download(),true,s.state.error);const value=await s.files[0].blob.text();if(format==='JSON'){const data=JSON.parse(value);assert.equal(data.entries.length,count);assert.equal(new Set(data.entries.map(e=>e.id)).size,count);assert.ok(data.entries.every(e=>e.sources));assert.equal(data.userId,undefined)}else if(format==='ICS'){assert.equal(value.split('BEGIN:VEVENT').length-1,count);for(const line of value.split('\r\n'))assert.ok(new TextEncoder().encode(line).length<=75)}else assert.ok(value.includes('课程安排'));s.resource.dispose()}
})
test('leader and teacher scopes require real fixture grants, selected classes stay bounded, and revocation invalidates a prepared file',opts,async()=>{
  const s=setup();s.f.setActor(1);await s.resource.access();const classId='10000000-0000-4000-8000-000000000010';assert.equal(await s.resource.prepare(filter({source:'TEACHING',view:'ADMIN',classId,format:'CSV'})),true,s.state.error);assert.equal(s.state.preview.count,1);s.resource.reset(true)
  s.f.setActor(5);await s.resource.access();assert.equal(await s.resource.prepare(filter({source:'TEACHING',view:'COUNSELOR',format:'JSON'})),true);s.f.setActor(1);await s.f.adapter({url:'/api/admin/teaching/grants/revoke',method:'post',data:{userId:5,viewRole:'COUNSELOR',scopeKey:classId}});s.f.setActor(5);assert.equal(await s.resource.download(),false);assert.equal(s.files.length,0);assert.equal(s.state.access,null);s.resource.dispose()
  const t=setup();await t.resource.access();assert.equal(await t.resource.prepare(filter({source:'TEACHING',view:'SECRETARY'})),false);assert.equal(t.files.length,0);t.resource.dispose()
})
test('changed source wrong bytes expired metadata and account cutover never deliver an old file or auto replay',opts,async()=>{
  const s=setup();await s.resource.access();await s.resource.prepare(filter({format:'CSV'}));const saved=(await s.f.adapter({url:'/api/timetable/courses',method:'get'})).data.schedule;await s.f.adapter({url:'/api/timetable/courses',method:'put',data:{...saved,semester:'模拟改版学期'}});assert.equal(await s.resource.download(),false);assert.equal(s.files.length,0);s.resource.dispose()
  let finish;const t=setup({download:()=>new Promise(r=>{finish=r})});await t.resource.access();await t.resource.prepare(filter({format:'CSV'}));const p=t.state.preview,waiting=t.resource.download();t.cutover();finish({data:new Blob(['bad']),headers:{'content-type':p.mime,'x-content-sha256':p.sha256}});await waiting;assert.equal(t.files.length,0);assert.equal(t.state.access,null);t.resource.dispose()
  const u=setup({digest:()=> '0'.repeat(64)});await u.resource.access();await u.resource.prepare(filter({format:'CSV'}));assert.equal(await u.resource.download(),false);assert.match(u.state.error,/校验/);assert.equal(u.files.length,0);u.resource.dispose()
})
test('malformed routes, rolled dates and incompatible scopes fail without guessing or widening a file',opts,()=>{
  for(const f of [filter({to:'2026-02-30'}),filter({source:'PERSONAL',classId:'10000000-0000-4000-8000-000000000010'}),filter({view:'ADMIN'}),filter({search:'\u0085'})])assert.throws(()=>scheduleExportFilter(f))
  assert.ok(scheduleExportRoute({tool:'schedule-export',from:'2026-01-01',to:'2027-01-01',source:'MY',format:'PDF',period:'ALL'}).error)
})
test('saved-range shortcut follows the actual saved weeks and never advertises a one-week copy as a complete semester',opts,()=>{
  assert.deepEqual(savedCoverageRange({firstMonday:'2026-09-07',courses:[{weeks:[6]}]}),{from:'2026-10-12',to:'2026-10-18',weeks:[6]});assert.deepEqual(savedCoverageRange({firstMonday:'2026-09-07',courses:[{weeks:[6,8]},{weeks:[8]}]}).weeks,[6,8]);assert.throws(()=>savedCoverageRange({firstMonday:'2026-09-07',courses:[{weeks:[31]}]}))
  const source=readFileSync(new URL('../src/components/ScheduleExportPanel.vue',import.meta.url),'utf8');assert.doesNotMatch(source,/采用本人个人课表完整学期/);assert.match(source,/不代表整学期已齐/)
})
test('real exporter form compiles with obvious entry points, authorization, original-JSON distinction and 44px/16px controls',opts,()=>{
  const file=readFileSync(new URL('../src/components/ScheduleExportPanel.vue',import.meta.url),'utf8'),{descriptor}=parse(file);compileScript(descriptor,{id:'export'});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:'ScheduleExportPanel.vue',id:'export'}).errors,[])
  assert.match(file,/核验并下载/);assert.match(file,/min-height:44px/);assert.match(file,/font-size:16px/);assert.match(file,/原始JSON/);assert.doesNotMatch(file,/localStorage|sessionStorage|sendMessageStream/)
  for(const path of ['../src/views/TeachingView.vue','../src/views/TimetableView.vue'])assert.match(readFileSync(new URL(path,import.meta.url),'utf8'),/ScheduleExportPanel/)
})
