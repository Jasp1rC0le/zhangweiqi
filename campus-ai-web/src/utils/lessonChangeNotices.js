import { isEnrollmentId as uuid } from './teachingIds.js'
import { dayNumber } from './timetable.js'
const integer=v=>Number.isSafeInteger(v)&&v>=0
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&![...v].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)>=127&&c.charCodeAt(0)<=159)
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(dayNumber(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
const time=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)
const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
export const CHANGE_NOTICE_ACTIONS={RESCHEDULE:'课程已调整',CANCEL:'这节课已取消',RELEASED:'本次任课已调整'}
function arrangement(v){return v&&day(v.date)&&time(v.startTime)&&time(v.endTime)&&v.startTime<v.endTime&&text(v.teacher,150)&&text(v.room,100)&&Object.keys(v).every(k=>['date','startTime','endTime','teacher','room'].includes(k))}
export function validatedChangeNotice(value){
  const keys=['id','requestId','action','course','original','proposed','targetLessonId','view','outdated','changedAt','readAt']
  if(!value||Object.keys(value).some(k=>!keys.includes(k))||!uuid(value.id)||!uuid(value.requestId)||!Object.hasOwn(CHANGE_NOTICE_ACTIONS,value.action)||!text(value.course,100)||!arrangement(value.original)||!['STUDENT','TEACHER'].includes(value.view)||typeof value.outdated!=='boolean'||!instant(value.changedAt)||!(value.readAt===null||instant(value.readAt)&&Date.parse(value.readAt)>=Date.parse(value.changedAt))||
    (value.action==='RESCHEDULE'?!arrangement(value.proposed):value.proposed!==null)||
    (value.action==='RELEASED'&&value.view!=='TEACHER')||
    (value.outdated?(value.action!=='RESCHEDULE'||value.targetLessonId!==null):!uuid(value.targetLessonId)))throw new Error('课程变更通知目标或来源响应异常，请重新读取；未展示旧通知')
  return value
}
export function validatedChangeNoticePage(value,query){
  if(!query||!integer(query.page)||query.page>10000||query.size!==25||typeof query.unreadOnly!=='boolean')throw new Error('通知页码或筛选无效')
  if(!value||typeof value.enabled!=='boolean'||value.page!==query.page||value.size!==25||value.unreadOnly!==query.unreadOnly||!day(value.from)||!day(value.to)||dayNumber(value.to)-dayNumber(value.from)!==30||!integer(value.total)||value.totalPages!==Math.ceil(value.total/25)||!Array.isArray(value.items)||value.items.length!==Math.min(25,Math.max(0,value.total-query.page*25))||query.page>0&&query.page>=value.totalPages||!value.enabled&&(value.total!==0||value.items.length!==0)||new Set(value.items.map(r=>r.id)).size!==value.items.length||new Set(value.items.map(r=>r.requestId)).size!==value.items.length)throw new Error('课程变更通知分页响应异常，没有显示部分清单')
  for(const row of value.items){validatedChangeNotice(row);if(query.unreadOnly&&row.readAt!==null||Date.parse(row.changedAt)<Date.parse(value.from+'T00:00:00+08:00')||Date.parse(row.changedAt)>=Date.parse(value.to+'T00:00:00+08:00')+86400000)throw new Error('通知日期或未读范围已变化，请重新读取')}
  return value
}
const arrangementKey=a=>a?[a.date,a.startTime,a.endTime,a.teacher,a.room]:null
const noticeKey=n=>JSON.stringify([n.id,n.requestId,n.action,n.course,arrangementKey(n.original),arrangementKey(n.proposed),n.targetLessonId,n.view,n.outdated,Date.parse(n.changedAt)])
export function changeNoticeDestination(notice,allowedViews){
  try{validatedChangeNotice(notice)}catch{return null}
  if(notice.outdated||!notice.targetLessonId||!Array.isArray(allowedViews)||!allowedViews.includes(notice.view))return null
  return{path:'/teaching',query:{lesson:notice.targetLessonId,view:notice.view,date:notice.proposed?.date||notice.original.date,return:'timetable'}}
}
export function createChangeNoticeResource({owner,state,read,mark,onNew=()=>{}}){
  let epoch=0,controller,disposed=false
  let observed=false,watermark=-Infinity,unreadTotal=0
  const atWatermark=new Set()
  function reset(){epoch++;controller?.abort();observed=false;watermark=-Infinity;unreadTotal=0;atWatermark.clear();Object.assign(state,{data:null,enabled:null,busy:false,error:'',notice:''})}
  async function run(work){if(disposed||!owner()||state.busy)return false;controller=new AbortController();const principal=owner(),op={signal:controller.signal,epoch:++epoch,current:()=>!disposed&&!!principal&&owner()===principal&&epoch===op.epoch&&!op.signal.aborted};state.busy=true;state.error='';try{return await work(op)}catch(e){if(op.current()){state.data=null;state.error=[401,403,404,409].includes(e.response?.status)?'账号、权限或课程已变化，请重新读取当前通知。':e.response?.status===429?'操作较多，请稍后重试；没有自动重发。':e.response?.status===503?'通知服务暂时不可用，请稍后重新核对课表。':e.message||'通知暂时无法读取，请重试。'}return false}finally{if(op.current())state.busy=false}}
  async function load(op,query){const response=await read(query,op.signal);if(!op.current())return false;const value=validatedChangeNoticePage(response.data,query);state.data=value;state.enabled=value.enabled
    if(value.enabled&&query.unreadOnly&&query.page===0){
      const latest=value.items.length?Math.max(...value.items.map(n=>Date.parse(n.changedAt))):-Infinity
      const fresh=observed&&(latest>watermark||latest===watermark&&value.items.some(n=>Date.parse(n.changedAt)===watermark&&!atWatermark.has(n.requestId))||value.total>unreadTotal)
      if(latest>watermark){watermark=latest;atWatermark.clear()}
      for(const n of value.items)if(Date.parse(n.changedAt)===watermark)atWatermark.add(n.requestId)
      while(atWatermark.size>2000)atWatermark.delete(atWatermark.values().next().value)
      unreadTotal=value.total;observed=true
      if(fresh&&op.current())onNew({owner:owner()})
    }
    return true}
  return{
    load:query=>run(async op=>{state.data=null;state.notice='';return load(op,query)}),
    mark:notice=>run(async op=>{
      const current=state.data,selected=current?.items.find(r=>r.id===notice.id)
      if(!selected||selected.readAt||noticeKey(selected)!==noticeKey(notice))throw new Error('先读取并核对这一条未读通知')
      let acknowledged=false
      try{
        const response=await mark(selected.id,op.signal);if(!op.current())return false
        const value=validatedChangeNotice(response.data)
        if(!value.readAt||noticeKey(value)!==noticeKey(selected))throw new Error('已读回执与原通知不一致，请重新读取核对')
        acknowledged=true;state.notice='已标为已读，原通知和变更记录仍保留。';state.data=null
        await load(op,{page:0,size:25,unreadOnly:current.unreadOnly});return op.current()
      }catch(e){if(op.current())state.notice=acknowledged?'已读已保存，列表暂时未刷新。请重新读取，不必重复标记。':'已读结果尚未核对，请重新读取通知；没有自动重发。';throw e}
    }),
    reset,dispose(){reset();disposed=true},
  }
}
