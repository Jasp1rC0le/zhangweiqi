import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate} from '../src/utils/timetable.js'
import {governanceChecksum} from '../src/utils/teachingGovernance.js'
import {createAdministrativeAuditResource,validatedAdministrativeAuditAccess,validatedAdministrativeAuditPreview,captureAuditFocusIntent} from '../src/utils/teachingAdministrativeAudit.js'
const opts={timeout:5000},root='/api/admin/teaching/operations/audit',filter={kind:'ALL',from:chinaDate(),to:chinaDate(),search:''},course='10000000-0000-4000-8000-000000000021'
function fixture(){const f=createTeachingFlowFixture({managementHistory:true,legacyCourse:true});f.setActor(1);return f}
const get=(f,path,params={})=>f.adapter({url:root+path,method:'get',params}),post=(f,path,data)=>f.adapter({url:root+path,method:'post',data})
async function resource(f=fixture(),overrides={}){const state={},files=[],r=createAdministrativeAuditResource({scope:()=> 'admin',state,access:()=>get(f,'/access'),read:params=>get(f,'/page',params),prepare:params=>get(f,'/export-preview',params),download:data=>post(f,'/export',data),onFile:value=>files.push(value),...overrides});await r.access();await r.load(filter);return{r,state,files,f}}
const change=f=>f.adapter({url:`/api/admin/teaching/courses/${course}/enrollment-mode/review`,method:'post',data:{requestId:crypto.randomUUID(),revision:0,mode:'ADMIN_CLASS',reason:'合成：新增当前管理依据'}})
test('last-page preparation downloads all 65 real fixture rows and verifies actual bytes, not just visible items',opts,async()=>{
  const {f,r,state,files}=await resource();await r.load(filter,2);assert.equal(state.data.items.length,15);assert.equal(await r.prepare(filter),true);assert.equal(state.preview.count,65);assert.equal(await r.download(),true);assert.equal(files.length,1);assert.equal(files[0].count,65);assert.equal(await governanceChecksum(await files[0].blob.arrayBuffer()),state.preview.sha256)
  const bytes=new Uint8Array(await files[0].blob.arrayBuffer());assert.deepEqual(bytes.subarray(0,3),new Uint8Array([239,187,191]));const csv=await files[0].blob.text();assert.equal(csv.split('\r\n').filter(Boolean).length,68);assert.match(csv,/未保存当时行政班/);assert.equal(state.downloaded.count,65);assert.equal((await get(f,'/page',{...filter,size:25})).data.total,65);r.dispose()
})
test('old backend capability remains a readable list but never displays or invokes a fake export',opts,async()=>{
  const f=fixture(),access=(await get(f,'/access')).data;delete access.exportEnabled;delete access.maxExportRows;delete access.exportSeconds;assert.equal(validatedAdministrativeAuditAccess(access).exportEnabled,false);let prepared=0;const {r,state}=await resource(f,{access:async()=>({data:access}),prepare:()=>{prepared++;throw Error('must not call')}});assert.equal(state.data.total,65);assert.equal(await r.prepare(filter),false);assert.equal(prepared,0);assert.match(state.error,/尚未开放/);r.dispose()
})
test('malformed prepared scope, TTL, count or checksum metadata is rejected before download',opts,async()=>{
  const f=fixture(),value=(await get(f,'/export-preview',filter)).data
  for(const patch of [{filter:{...filter,search:'different'}},{count:0},{count:2001},{maxRows:99999},{sha256:'bad'},{expiresAt:new Date(Date.now()-1).toISOString()},{expiresAt:new Date(Date.now()+600000).toISOString()},{deletionEnabled:true}])assert.throws(()=>validatedAdministrativeAuditPreview({...value,...patch},filter))
})
test('a changed current source requires a fresh complete range and never reuses a prepared file',opts,async()=>{
  const first=await resource();await change(first.f);assert.equal(await first.r.prepare(filter),false);assert.equal(first.state.data,null);assert.match(first.state.error,/数量已变化/);first.r.dispose()
  const second=await resource();await second.r.prepare(filter);await change(second.f);assert.equal(await second.r.download(),false);assert.equal(second.files.length,0);assert.equal(second.state.preview,null);assert.equal(second.state.data,null);assert.match(second.state.error,/重新读取/);second.r.dispose()
})
test('wrong MIME, header hash, actual bytes or oversized blob cannot reach the browser',opts,async()=>{
  for(const variant of ['mime','header','bytes','size']){
    const f=fixture();let state,files=0;const loaded=await resource(f,{onFile:()=>files++,download:async data=>{const response=await post(f,'/export',data);if(variant==='mime')response.headers['content-type']='text/html';if(variant==='header')response.headers['x-content-sha256']='f'.repeat(64);if(variant==='bytes')response.data=new Blob(['wrong'],{type:'text/csv'});if(variant==='size')response.data=new Blob([new Uint8Array(12*1024*1024+1)],{type:'text/csv'});return response}});state=loaded.state;await loaded.r.prepare(filter);assert.equal(await loaded.r.download(),false);assert.equal(files,0);assert.equal(state.preview,null);assert.match(state.error,/响应异常|校验/);loaded.r.dispose()
  }
})
test('account cutover cancels pending preparation, HTTP download and actual pending byte-checksum work',opts,async()=>{
  for(const stage of ['prepare','download','checksum']){
    let owner='admin',resolve,signal,downloadResponse,buffer,entered;const checksumStarted=new Promise(done=>{entered=done}),f=fixture(),response=stage==='prepare'?await get(f,'/export-preview',filter):null,overrides={scope:()=>owner}
    if(stage==='checksum')overrides.download=(_,s)=>{signal=s;return Promise.resolve(downloadResponse)}
    else overrides[stage]=(_,s)=>{signal=s;return new Promise(done=>{resolve=done})}
    const {r,state,files}=await resource(f,overrides)
    if(stage!=='prepare'){await r.prepare(filter);downloadResponse=await post(f,'/export',{token:state.preview.token});if(stage==='checksum'){buffer=await downloadResponse.data.arrayBuffer();downloadResponse.data.arrayBuffer=()=>{entered();return new Promise(done=>{resolve=done})}}}
    const pending=stage==='prepare'?r.prepare(filter):r.download();if(stage==='checksum')await checksumStarted;owner='student';r.reset(true);assert.equal(signal.aborted,true);resolve(stage==='prepare'?response:stage==='checksum'?buffer:downloadResponse);assert.equal(await pending,false);assert.equal(state.data,null);assert.equal(state.preview,null);assert.equal(state.access,null);assert.equal(files.length,0);r.dispose()
  }
})
test('revocation, expiry, cancel and network failure have explicit recovery with no automatic replay',opts,async()=>{
  const denied=await resource(fixture(),{download:async()=>{throw{response:{status:403,data:new Blob(['{}'])}}}});await denied.r.prepare(filter);assert.equal(await denied.r.download(),false);assert.equal(denied.state.access,null);assert.equal(denied.files.length,0);denied.r.dispose()
  let now=Date.now(),calls=0;const expiry=await resource(fixture(),{now:()=>now,download:()=>{calls++;throw Error('must not call')}});await expiry.r.prepare(filter);now+=360001;assert.equal(await expiry.r.download(),false);assert.equal(calls,0);expiry.r.dispose()
  const lateFixture=fixture();now=Date.now();const late=await resource(lateFixture,{now:()=>now,download:async data=>{const result=await post(lateFixture,'/export',data);now+=360001;return result}});await late.r.prepare(filter);assert.equal(await late.r.download(),false);assert.equal(late.files.length,0);assert.match(late.state.error,/到达时准备已过期/);late.r.dispose()
  const canceled=await resource();await canceled.r.prepare(filter);assert.equal(canceled.r.clearPreview(),true);assert.equal(canceled.state.preview,null);assert.equal(await canceled.r.download(),false);assert.equal(canceled.files.length,0);canceled.r.dispose()
  const failed=await resource(fixture(),{download:async()=>{throw Error('Network Error')}});await failed.r.prepare(filter);assert.equal(await failed.r.download(),false);assert.match(failed.state.error,/网络或下载中断/);assert.equal(failed.files.length,0);failed.r.dispose()
})
test('student, teacher and leadership views cannot prepare or download normal-administrator history',opts,async()=>{
  const f=fixture(),prepared=(await get(f,'/export-preview',filter)).data
  for(const id of [2,4,5,6,8]){f.setActor(id);await assert.rejects(()=>get(f,'/export-preview',filter),e=>e.response.status===403);await assert.rejects(()=>post(f,'/export',{token:prepared.token}),e=>e.response.status===403)}
})
test('pending export focus is canceled on actual input and is disposed rather than using a timer',opts,()=>{
  for(const event of ['pointerdown','wheel','touchstart','keydown']){const target=new EventTarget(),intent=captureAuditFocusIntent(target);assert.equal(intent.current(),true);target.dispatchEvent(new Event(event));assert.equal(intent.current(),false);intent.dispose()}
  const intent=captureAuditFocusIntent(new EventTarget());intent.dispose();assert.equal(intent.current(),false)
  const source=readFileSync(new URL('../src/components/TeachingAdministrativeAuditPanel.vue',import.meta.url),'utf8');assert.match(source,/captureAuditFocusIntent\(window\)/);assert.match(source,/cancelExportFocus\(\)/);assert.match(source,/owner===scope\(\)/);assert.match(source,/intent.current\(\)/);assert.match(source,/method==='prepare'\?previewElement:downloadElement/);assert.match(source,/导出全部当前条件，不只这一页/);assert.match(source,/下载不等于归档/);assert.ok(source.indexOf('准备完整导出')<source.indexOf('ref="resultElement"'));assert.doesNotMatch(source,/resource\.delete|v-html/)
})
