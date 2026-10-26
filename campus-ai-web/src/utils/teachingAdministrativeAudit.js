import {isEnrollmentId as uuid} from './teachingIds.js'
import {dayNumber} from './timetable.js'
import {governanceChecksum} from './teachingGovernance.js'
export const ADMIN_AUDIT_KINDS=Object.freeze({STUDENT_TRANSITION:'学籍变更',ACCOUNT_BINDING:'账号绑定',IDENTITY_REVIEW:'身份审核',COURSE_ENROLLMENT:'选课变更',COURSE_SOURCE:'课程来源核定',RESPONSIBILITY:'负责范围变更',LESSON_CHANGE:'单次调停课'})
export const ADMIN_AUDIT_ACTIONS=Object.freeze({TRANSFER:'转班',LEAVE:'离校',RESTORE:'复学',BIND:'账号绑定',REVIEW:'身份变更',CREATE:'加入课程',WITHDRAW:'退课',REENROLL:'重新选课',SOURCE_REVIEW:'核定课程来源',GRANT:'授予负责范围',REVOKE:'撤销负责范围',RESCHEDULE:'调课或代课',CANCEL:'取消本次课'})
const states={ACTIVE:'在校',LEFT:'离校',NONE:'未申请',PENDING:'待审核',APPROVED:'已通过',REJECTED:'未通过',REVOKED:'已撤销',LEGACY:'来源待定',ADMIN_CLASS:'行政班整班',EXPLICIT:'逐人选课'}
export const adminAuditState=value=>states[value]||value
const integer=v=>Number.isSafeInteger(v)&&v>=0
const text=(v,max)=>typeof v==='string'&&v.length<=max
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(dayNumber(v))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v
export function administrativeAuditFilter(input){
  const f={kind:input.kind||'ALL',from:input.from,to:input.to,search:(input.search||'').trim()}
  // The ISO-control test is intentional: filter text is sent to a literal, parameterized SQL search.
  // oxlint-disable-next-line no-control-regex
  if(!(f.kind==='ALL'||Object.hasOwn(ADMIN_AUDIT_KINDS,f.kind))||!day(f.from)||!day(f.to)||dayNumber(f.to)<dayNumber(f.from)||dayNumber(f.to)-dayNumber(f.from)>30||!text(f.search,80)||/[\u0000-\u001f\u007f-\u009f]/u.test(f.search))throw new Error('选择有效的操作日期，每次最多31天；搜索限80字')
  return f
}
export const administrativeAuditKey=f=>JSON.stringify([f.kind,f.from,f.to,(f.search||'').trim()])
export function validatedAdministrativeAuditAccess(data){
  if(data?.maxDays!==31||data.retentionYears!==1||data.deletionEnabled!==false||!Array.isArray(data.categories)||![5,6,7].includes(data.categories.length)||new Set(data.categories.map(c=>c.key)).size!==data.categories.length||Object.keys(ADMIN_AUDIT_KINDS).filter(k=>!['RESPONSIBILITY','LESSON_CHANGE'].includes(k)).some(k=>!data.categories.some(c=>c.key===k))||data.categories.some(c=>!Object.hasOwn(ADMIN_AUDIT_KINDS,c.key)||c.label!==ADMIN_AUDIT_KINDS[c.key]||typeof c.enabled!=='boolean'||!text(c.detail,300)))throw new Error('管理审计能力响应异常，未读取记录')
  if(data.exportEnabled!==undefined&&(typeof data.exportEnabled!=='boolean'||data.exportEnabled&&(data.maxExportRows!==2000||data.exportSeconds!==300)))throw new Error('管理历史导出能力响应异常')
  return {...data,exportEnabled:data.exportEnabled===true}
}
export function validatedAdministrativeAuditPage(data,input,page){
  const f=administrativeAuditFilter(input)
  if(!data||administrativeAuditKey(data.filter||{})!==administrativeAuditKey(f)||data.page!==page||data.size!==25||!integer(data.total)||data.totalPages!==Math.ceil(data.total/25)||page<0||!Number.isInteger(page)||(page>0&&page>=data.totalPages)||!Array.isArray(data.items)||data.items.length!==Math.min(25,Math.max(0,data.total-page*25))||new Set(data.items.map(r=>r.id)).size!==data.items.length||data.items.some(r=>
    !Object.hasOwn(ADMIN_AUDIT_KINDS,r.kind)||(f.kind!=='ALL'&&r.kind!==f.kind)||!uuid(r.eventId)||(r.kind==='RESPONSIBILITY'?!/^[1-9]\d{0,18}$/.test(r.subjectId||''):!uuid(r.subjectId))||r.id!==`${r.kind}:${r.eventId}`||!text(r.target,r.kind==='RESPONSIBILITY'?150:100)||!r.target||!text(r.context,400)||!Object.hasOwn(ADMIN_AUDIT_ACTIONS,r.action)||(r.kind==='RESPONSIBILITY'&&!['GRANT','REVOKE'].includes(r.action))||(r.kind==='LESSON_CHANGE'&&!['RESCHEDULE','CANCEL'].includes(r.action))||!text(r.beforeValue,r.kind==='LESSON_CHANGE'?400:100)||!text(r.afterValue,r.kind==='LESSON_CHANGE'?400:100)||!text(r.reason,500)||(r.revision!==null&&!integer(r.revision))||(r.affectedLessons!==null&&!integer(r.affectedLessons))||!integer(r.actorId)||r.actorId<1||!text(r.actorName,r.kind==='RESPONSIBILITY'?150:100)||!text(r.historyNote,500)||!Number.isFinite(Date.parse(r.recordedAt))||Date.parse(r.recordedAt)<Date.parse(`${f.from}T00:00:00+08:00`)||Date.parse(r.recordedAt)>=Date.parse(`${f.to}T00:00:00+08:00`)+86400000))throw new Error('管理审计范围或分页响应异常，未展示旧结果')
  return data
}
export function validatedAdministrativeAuditPreview(data,input,now=Date.now()){
  const filter=administrativeAuditFilter(input)
  if(!data||!uuid(data.token)||administrativeAuditKey(data.filter||{})!==administrativeAuditKey(filter)||!integer(data.count)||data.count<1||data.count>2000||data.maxRows!==2000||!/^[a-f\d]{64}$/.test(data.sha256)||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=now||Date.parse(data.expiresAt)>now+360000||data.retentionYears!==1||data.deletionEnabled!==false)throw new Error('管理历史导出范围或校验响应异常，请重新核对')
  return data
}
export function captureAuditFocusIntent(target){
  let active=true
  const events=['pointerdown','wheel','touchstart','keydown'],dispose=()=>{if(!active)return;active=false;for(const event of events)target?.removeEventListener(event,dispose,true)}
  for(const event of events)target?.addEventListener(event,dispose,{once:true,capture:true,passive:true})
  return{current:()=>active,dispose}
}
export function createAdministrativeAuditResource({scope,state,access,read,prepare,download,onFile,now=Date.now}){
  let generation=0,controller,disposed=false
  const current=op=>!disposed&&op.owner&&op.owner===scope()&&op.epoch===generation&&!op.signal.aborted
  function clearPreview(){if(state.busy)return false;state.preview=null;state.downloaded=null;return true}
  function reset(clearAccess=false){generation++;controller?.abort();state.data=null;state.preview=null;state.downloaded=null;state.error='';state.busy=false;state.operation='';if(clearAccess)state.access=null}
  async function run(task,operation='load'){if(disposed||!scope()||state.busy)return false;controller=new AbortController();const op={owner:scope(),epoch:++generation,signal:controller.signal};state.busy=true;state.error='';state.operation=operation;state.downloaded=null;if(['load','access'].includes(operation)){state.data=null;state.preview=null}
    try{return await task(op)}catch(error){if(current(op)){state.preview=null;if([401,403].includes(error.response?.status))state.access=null;if([401,403,409].includes(error.response?.status))state.data=null;const messages={401:'登录状态已变化，请重新登录后核对范围',403:'管理员权限或学校范围已变化，旧准备已清除',409:'管理历史或范围已变化，请重新读取再准备',410:'导出准备已失效，请重新准备',429:'操作较多，请稍后重新核对；没有自动重发',503:'服务暂时繁忙，请重新读取核对；没有自动重发'},network=!error.response&&/Network Error|timeout|aborted|canceled/i.test(error.message||'');state.error=messages[error.response?.status]||(network?'网络或下载中断，结果尚未确认；保留筛选条件，重新读取后再准备':error.response?.data?.message||error.message)||'读取失败，保留查询条件后重新核对'}return false}finally{if(current(op)){state.busy=false;state.operation=''}}}
  return{
    access:()=>run(async op=>{const response=await access(op.signal);if(!current(op))return false;state.access=validatedAdministrativeAuditAccess(response.data);return true},'access'),
    load:(input,page=0)=>run(async op=>{const f=administrativeAuditFilter(input);if(!state.access||f.kind!=='ALL'&&!state.access.categories.some(c=>c.key===f.kind&&c.enabled))throw new Error('该类管理记录尚未启用，请选择已启用类型');const response=await read({...f,page,size:25},op.signal);if(!current(op))return false;const data=validatedAdministrativeAuditPage(response.data,f,page);if(data.items.some(r=>!state.access.categories.some(c=>c.key===r.kind&&c.enabled)))throw new Error('响应包含未启用的管理类型，未显示记录');state.data=data;return true}),
    prepare:input=>run(async op=>{state.preview=null;const f=administrativeAuditFilter(input);if(!state.access?.exportEnabled||!prepare)throw new Error('当前服务尚未开放管理历史导出');if(!state.data||administrativeAuditKey(state.data.filter)!==administrativeAuditKey(f))throw new Error('先读取并核对完整管理历史范围');if(state.data.total<1||state.data.total>2000)throw new Error('完整范围须为1至2000条；缩小日期、类型或搜索，不会截断导出');const response=await prepare(f,op.signal);if(!current(op))return false;const value=validatedAdministrativeAuditPreview(response.data,f,now());if(value.count!==state.data.total){state.data=null;throw new Error('管理历史数量已变化，请重新读取范围')}state.preview=value;return true},'prepare'),
    download:()=>run(async op=>{const preview=state.preview;if(!state.access?.exportEnabled||!preview||!download||!onFile||Date.parse(preview.expiresAt)<=now())throw new Error('导出准备已失效或不可用，请重新核对');const response=await download({token:preview.token},op.signal);if(!current(op))return false;
      if(!(response.data instanceof Blob)||response.data.size>12*1024*1024||!/^text\/csv\b/i.test(response.headers?.['content-type']||response.data.type)||response.headers?.['x-content-sha256']!==preview.sha256)throw new Error('文件响应异常，没有交给浏览器下载');
      const sha=await governanceChecksum(await response.data.arrayBuffer());if(!current(op))return false;if(sha!==preview.sha256)throw new Error('文件实际校验不一致，没有交给浏览器下载');if(Date.parse(preview.expiresAt)<=now())throw new Error('文件到达时准备已过期，请重新核对；未交给浏览器');const result={blob:response.data,filename:`管理操作历史-${preview.filter.from}-${preview.filter.to}.csv`,count:preview.count,sha256:sha};onFile(result);if(current(op))state.downloaded={filename:result.filename,count:result.count,sha256:sha};return true},'download'),
    clearPreview,
    reset,dispose(){reset(true);disposed=true},
  }
}
