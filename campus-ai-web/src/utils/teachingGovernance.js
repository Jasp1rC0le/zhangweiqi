import { isEnrollmentId as isTeachingUuid } from './teachingIds.js'
import { dayNumber } from './timetable.js'
const roles=new Set(['STUDENT','TEACHER','COUNSELOR','SECRETARY','ADMIN'])
const statuses=new Set(['UNKNOWN','ON_TIME','LATE','ABSENT','EXCUSED','EARLY_LEAVE'])
const kinds=new Set(['ATTENDANCE','AUDIT'])
const bounded=(value,max)=>typeof value==='string' && value.length<=max
const instant=value=>typeof value==='string' && Number.isFinite(Date.parse(value))
const integer=value=>Number.isSafeInteger(value) && value>=0
export const governanceKey=filter=>JSON.stringify([filter.view,filter.from,filter.to,filter.classId||'',filter.kind,filter.expiredOnly])
export function governanceFilter(filter) {
  const f={view:filter.view,from:filter.from,to:filter.to,classId:filter.classId||'',kind:filter.kind,expiredOnly:filter.expiredOnly===true}
  if(!roles.has(f.view) || !kinds.has(f.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(f.from) || !/^\d{4}-\d{2}-\d{2}$/.test(f.to) ||
    !Number.isFinite(dayNumber(f.from)) || !Number.isFinite(dayNumber(f.to)) || new Date(`${f.from}T00:00:00Z`).toISOString().slice(0,10)!==f.from || new Date(`${f.to}T00:00:00Z`).toISOString().slice(0,10)!==f.to || dayNumber(f.to)<dayNumber(f.from) || dayNumber(f.to)-dayNumber(f.from)>30 || (f.classId && !isTeachingUuid(f.classId)))throw new Error('选择有效的日期和授权班级，每次最多31天')
  return f
}
export function validateGovernancePage(data,filter,page) {
  const expected=governanceFilter(filter)
  if(!data || governanceKey(data.filter||{})!==governanceKey(expected) || data.page!==page || data.size!==25 || !integer(data.total) || !integer(data.rangeTotal) || !integer(data.expiredWithinScope) ||
    data.total>data.rangeTotal || data.expiredWithinScope>data.rangeTotal || data.total!==(expected.expiredOnly?data.expiredWithinScope:data.rangeTotal) || data.totalPages!==Math.ceil(data.total/25) || data.retentionYears!==1 || data.deletionEnabled!==false ||
    !Array.isArray(data.items) || data.items.length!==Math.min(25,Math.max(0,data.total-page*25)) || new Set(data.items.map(r=>r.id)).size!==data.items.length || data.items.some(r=>
      !isTeachingUuid(r.lessonId) || !isTeachingUuid(r.studentId) || (expected.kind==='AUDIT'?!isTeachingUuid(r.id):r.id!==`${r.lessonId}:${r.studentId}`) ||
      !bounded(r.studentNumber,40) || !bounded(r.studentName,100) || !bounded(r.course,100) || !bounded(r.teacher,100) || !bounded(r.className,100) || !bounded(r.college,100) ||
      !statuses.has(r.status) || (expected.kind==='AUDIT' && (!statuses.has(r.oldStatus) || !statuses.has(r.newStatus))) || !bounded(r.reason,300) || !bounded(r.actorName,100) ||
      !instant(r.startsAt) || !instant(r.endsAt) || !instant(r.retentionBaseAt) || !instant(r.retainedUntil) || typeof r.eligible!=='boolean' || typeof r.withdrawn!=='boolean' || typeof r.cancelled!=='boolean' || !bounded(r.scopeSource,32)))throw new Error('记录范围或分页响应异常，未准备导出')
  return data
}
export function validateGovernancePreview(data,filter,now=Date.now()) {
  if(!data || !isTeachingUuid(data.token) || governanceKey(data.filter||{})!==governanceKey(governanceFilter(filter)) || !integer(data.count) || data.count<1 || data.count>2000 || data.maxRows!==2000 ||
    !/^[a-f\d]{64}$/.test(data.sha256) || !instant(data.expiresAt) || Date.parse(data.expiresAt)<=now || Date.parse(data.expiresAt)>now+360000 || data.retentionYears!==1 || data.deletionEnabled!==false)throw new Error('导出准备响应异常，请重新核对范围')
  return data
}
export async function governanceChecksum(buffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('')}
export function createGovernanceResource({scope,state,access,read,prepare,download,onFile,now=Date.now}) {
  let generation=0,controller,disposed=false
  const current=op=>!disposed && !!op.owner && op.owner===scope() && op.epoch===generation && !op.signal.aborted
  function reset(clearAccess=false){generation++;controller?.abort();state.data=null;state.preview=null;state.downloaded=null;state.error='';state.busy=false;if(clearAccess)state.access=null}
  async function run(task,failure) {
    if(disposed || !scope() || state.busy)return false
    controller=new AbortController();const op={owner:scope(),epoch:++generation,signal:controller.signal};state.busy=true;state.error='';state.downloaded=null
    try{return await task(op)}catch(error){if(current(op)){state.preview=null;failure?.();state.error=error.response?.data?.message || error.message || '读取或导出失败，请重新核对；未保存文件'}return false}
    finally{if(current(op))state.busy=false}
  }
  return {
    access:()=>run(async op=>{const response=await access(op.signal);if(!current(op))return false;const d=response.data;if(typeof d?.enabled!=='boolean' || !Array.isArray(d.views) || new Set(d.views).size!==d.views.length || d.views.some(v=>!roles.has(v)) || d.maxDays!==31 || d.maxExportRows!==2000 || d.retentionYears!==1 || d.deletionEnabled!==false)throw new Error('记录权限响应异常');state.access=d;return true}),
    load:(input,page=0)=>run(async op=>{state.data=null;state.preview=null;const f=governanceFilter(input);if(!state.access?.views.includes(f.view))throw new Error('当前账号没有该记录视图');const response=await read({...f,page,size:25},op.signal);if(!current(op))return false;state.data=validateGovernancePage(response.data,f,page);return true},()=>{state.data=null}),
    prepare:input=>run(async op=>{state.preview=null;const f=governanceFilter(input);if(!state.data || governanceKey(state.data.filter)!==governanceKey(f))throw new Error('先读取并核对当前范围');const response=await prepare(f,op.signal);if(!current(op))return false;state.preview=validateGovernancePreview(response.data,f,now());return true}),
    download:()=>run(async op=>{const preview=state.preview;if(!preview || Date.parse(preview.expiresAt)<=now())throw new Error('导出准备已到期，请重新准备');const response=await download({token:preview.token},op.signal);if(!current(op))return false;
      if(!(response.data instanceof Blob) || response.data.size>12*1024*1024 || !/^text\/csv\b/i.test(response.headers?.['content-type']||response.data.type) || response.headers?.['x-content-sha256']!==preview.sha256)throw new Error('导出文件响应异常，未保存文件');
      const buffer=await response.data.arrayBuffer(),sha=await governanceChecksum(buffer);if(!current(op))return false;if(sha!==preview.sha256)throw new Error('导出校验不一致，未保存文件');
      const result={blob:response.data,filename:`考勤证据-${preview.filter.from}-${preview.filter.to}.csv`,count:preview.count,sha256:sha};onFile(result);if(current(op))state.downloaded={filename:result.filename,count:result.count,sha256:sha};return true}),
    reset,dispose(){reset(true);disposed=true},
  }
}
