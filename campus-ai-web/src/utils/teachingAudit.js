import { createLatestRequest } from './latestRequest.js'
const statuses = new Set(['UNKNOWN','ON_TIME','LATE','ABSENT','EXCUSED','EARLY_LEAVE'])
const text = (value,max) => typeof value==='string' && value.length<=max
export function auditDate(value,withTime=false) {
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',...(withTime?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}).format(new Date(value))
}
export function validateAudit(data,id,view,page) {
  if(!data || data.lessonId!==id || data.view!==view || data.page!==page || data.size!==25 || data.retentionYears!==1 || data.deletionEnabled!==false ||
      !Number.isSafeInteger(data.total) || data.total<0 || !Number.isSafeInteger(data.expiredWithinScope) || data.expiredWithinScope<0 || data.expiredWithinScope>data.total ||
      data.totalPages!==Math.ceil(data.total/25) || !Array.isArray(data.items) || data.items.length!==Math.min(25,Math.max(0,data.total-page*25)) ||
      new Set(data.items.map(row=>row.id)).size!==data.items.length || data.items.some(row=>
        !text(row.id,36) || !/^[a-f\d-]{36}$/.test(row.id) || !text(row.studentName,100) || !text(row.studentNumber,50) || !text(row.actorName,100) ||
        !statuses.has(row.oldStatus) || !statuses.has(row.newStatus) || !text(row.reason,300) || !Number.isFinite(Date.parse(row.recordedAt)) ||
        !Number.isFinite(Date.parse(row.expiresAt)) || typeof row.expired!=='boolean')) throw new Error('更正记录响应异常，请重新读取；没有导出不完整记录')
  return data
}
export function auditPageCsv(data) {
  const cell = value => {
    let text=String(value ?? '').replace(/[\r\n\t]/g,' ')
    if(/^[\s\uFEFF]*[=+@-]/u.test(text))text=`'${text}`
    return `"${text.replaceAll('"','""')}"`
  }
  const rows=[['学号（文本）','姓名','原状态','新状态','更正原因','操作人','记录时间','保留截止','到期状态']]
  for(const row of data.items)rows.push([`'${row.studentNumber}`,row.studentName,row.oldStatus,row.newStatus,row.reason,row.actorName,row.recordedAt,row.expiresAt,row.expired?'待归档核验':'保留中'])
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')
}
export function createAuditReader({scope,state,read}) {
  let generation=0
  const request=createLatestRequest({
    load:async(id,view,page,{signal})=>{const owner=scope(),epoch=generation;const response=await read(id,view,page,signal);return{owner,epoch,data:validateAudit(response.data,id,view,page)}},
    onStart:()=>{state.loading=true;state.error=''},
    onSuccess:value=>{if(value.owner===scope() && value.epoch===generation)state.data=value.data},
    onError:()=>{state.data=null;state.error='更正记录暂时无法读取，请重试；未导出任何文件'},
    onFinish:()=>{state.loading=false},
  })
  return {load:(...args)=>scope()?request.run(...args):undefined,
    reset(){generation++;request.cancel();state.data=null;state.error='';state.loading=false},dispose(){generation++;request.dispose();state.data=null}}
}
