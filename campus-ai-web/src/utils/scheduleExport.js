import {dayNumber,addDays} from './timetable.js'
import {isEnrollmentId} from './teachingIds.js'
import {privateCourseDigest} from './privateCourseExport.js'
export const SCHEDULE_FORMATS=Object.freeze({XLSX:'Excel 表格',PDF:'PDF 打印文件',ICS:'ICS 日历',CSV:'CSV 数据表',JSON:'JSON 日期快照'})
export const SCHEDULE_SOURCES=Object.freeze({MY:'我的统一课表',PERSONAL:'仅本人个人导入',TEACHING:'授权教学安排'})
export const EXPORT_VIEWS=Object.freeze({STUDENT:'学生',TEACHER:'教师',COUNSELOR:'辅导员',SECRETARY:'书记',ADMIN:'本校管理员'})
const text=(v,max)=>typeof v==='string'&&v.length<=max
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v.slice(0,4)>='2000'&&v.slice(0,4)<='2100'&&Number.isFinite(dayNumber(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v
export function scheduleExportFilter(v){
  if(!v||!Object.hasOwn(SCHEDULE_SOURCES,v.source)||!Object.hasOwn(EXPORT_VIEWS,v.view)||!Object.hasOwn(SCHEDULE_FORMATS,v.format)||!['ALL','MORNING','AFTERNOON','EVENING'].includes(v.period)||!validDate(v.from)||!validDate(v.to)||dayNumber(v.to)<dayNumber(v.from)||dayNumber(v.to)-dayNumber(v.from)>209||!text(v.classId,36)||v.classId&&!isEnrollmentId(v.classId)||!text(v.search,100)||[...v.search].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)>=127&&c.charCodeAt(0)<=159)||typeof v.includeCancelled!=='boolean')throw new Error('请选择明确来源、身份、格式与不超过210天的日期')
  if(v.source!=='TEACHING'&&(v.classId||!['STUDENT','TEACHER'].includes(v.view)))throw new Error('本人课表不能冒用其他班级或领导视图')
  return{source:v.source,view:v.view,from:v.from,to:v.to,classId:v.classId,period:v.period,format:v.format,search:v.search.trim(),includeCancelled:v.includeCancelled}
}
export const scheduleExportKey=v=>JSON.stringify(scheduleExportFilter(v))
export function savedCoverageRange(snapshot){if(!snapshot?.courses?.length||!validDate(snapshot.firstMonday))throw new Error('先读取已保存的个人课表');const weeks=[...new Set(snapshot.courses.flatMap(c=>c.weeks))].sort((a,b)=>a-b);if(!weeks.length||weeks.some(w=>!Number.isInteger(w)||w<1||w>30))throw new Error('已保存周次不完整，未猜测导出范围');return{from:addDays(snapshot.firstMonday,(weeks[0]-1)*7),to:addDays(snapshot.firstMonday,weeks.at(-1)*7-1),weeks}}
export function scheduleExportAccess(v){
  const list=(a,allowed)=>Array.isArray(a)&&new Set(a).size===a.length&&a.every(x=>Object.hasOwn(allowed,x))
  if(!v||!list(v.sources,SCHEDULE_SOURCES)||!v.sources.includes('MY')||!v.sources.includes('PERSONAL')||!list(v.teachingViews,EXPORT_VIEWS)||!list(v.personalViews,{STUDENT:true,TEACHER:true})||!v.personalViews.includes('STUDENT')||!list(v.formats,SCHEDULE_FORMATS)||v.formats.length!==5||!validDate(v.defaultFrom)||!validDate(v.defaultTo)||v.maxDays!==210||v.maxRows!==2000||v.expiresSeconds!==300)throw new Error('导出能力响应异常，请重新核对；没有准备文件')
  return v
}
function validatePreview(v,f,now){
  if(!v||!isEnrollmentId(v.token)||scheduleExportKey(v.filter)!==scheduleExportKey(f)||!text(v.scope,500)||!v.scope||!Number.isSafeInteger(v.count)||v.count<1||v.count>2000||!Number.isSafeInteger(v.bytes)||v.bytes<1||v.bytes>4*1024*1024||!/^[a-f0-9]{64}$/.test(v.sha256)||!text(v.filename,200)||!v.filename.endsWith('.'+f.format.toLowerCase())||!Number.isFinite(Date.parse(v.expiresAt))||Date.parse(v.expiresAt)<=now||Date.parse(v.expiresAt)>now+360000||!Array.isArray(v.sample)||v.sample.length!==Math.min(3,v.count)||v.sample.some(r=>!validDate(r.date)||r.date<f.from||r.date>f.to||!text(r.name,100)||!text(r.room,100)||!text(r.teacher,100)||!text(r.className,100)||!text(r.timeLabel,100))||!Array.isArray(v.warnings)||v.warnings.some(x=>!text(x,500)))throw new Error('课表文件预览不完整或范围不一致，没有放行下载')
  const mimes={PDF:'application/pdf',XLSX:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',CSV:'text/csv',ICS:'text/calendar',JSON:'application/json'}
  if(typeof v.mime!=='string'||v.mime.split(';')[0]!==mimes[f.format])throw new Error('文件格式与预览不一致')
  return v
}
export function createScheduleExportResource({owner,state,readAccess,prepare,download,onFile,now=Date.now,digest=privateCourseDigest}){
  let generation=0,controller,disposed=false
  function reset(clearAccess=false){generation++;controller?.abort();Object.assign(state,{busy:false,preview:null,error:'',notice:'',downloaded:null});if(clearAccess)state.access=null}
  async function run(work){if(disposed||!owner()||state.busy)return false;controller=new AbortController();const principal=owner(),op={signal:controller.signal,epoch:++generation};op.current=()=>!disposed&&principal===owner()&&op.epoch===generation&&!op.signal.aborted;state.busy=true;state.error='';try{return await work(op)}catch(e){let serverMessage=e.response?.data?.message;if(e.response?.data instanceof Blob&&e.response.data.size<=8192&&/json/i.test(e.response.data.type)){try{const value=JSON.parse(await e.response.data.text());if(typeof value.message==='string'&&value.message.length<=1000)serverMessage=value.message}catch{/* Never render an arbitrary response body. */}}if(op.current()){state.preview=null;const status=e.response?.status;if([401,403].includes(status))state.access=null;state.error=({401:'登录状态已变化，未导出，请重新登录',403:'授权范围已变化，未导出，请重新核对',404:'当前运行后端尚未提供新版课表导出，请先更新验收环境',409:'课表或授权范围已变化，请重新准备，没有下载旧文件',410:'文件准备已到期或不属于当前账号，请重新准备',429:'文件准备较多，请稍后重试，没有自动排队',503:'导出服务暂时繁忙，请保留筛选后重试'})[status]||serverMessage||e.message||'文件准备失败，请重新核对'}return false}finally{if(op.current())state.busy=false}}
  return{
    access:()=>run(async op=>{const r=await readAccess(op.signal);if(!op.current())return false;state.access=scheduleExportAccess(r.data);return true}),
    prepare:raw=>run(async op=>{const f=scheduleExportFilter(raw);if(!state.access||!state.access.sources.includes(f.source)||!(f.source==='TEACHING'?state.access.teachingViews:state.access.personalViews).includes(f.view))throw new Error('先核对当前账号可用的来源与身份');state.preview=null;state.downloaded=null;state.notice='';const r=await prepare(f,op.signal);if(!op.current())return false;state.preview=validatePreview(r.data,f,now());return true}),
    download:()=>run(async op=>{const p=state.preview;if(!p||Date.parse(p.expiresAt)<=now())throw new Error('准备已过期，请重新核对');const r=await download({token:p.token},op.signal);if(!op.current())return false;const type=r.headers?.['content-type']||r.data?.type||'';if(!(r.data instanceof Blob)||r.data.size!==p.bytes||type.split(';')[0]!==p.mime.split(';')[0]||r.headers?.['x-content-sha256']!==p.sha256)throw new Error('文件大小、格式或校验响应不一致，没有交给下载');const actual=await digest(await r.data.arrayBuffer());if(!op.current())return false;if(actual!==p.sha256||Date.parse(p.expiresAt)<=now())throw new Error('文件实际校验失败或准备到期，没有交给下载');onFile(r.data,p.filename);state.downloaded={filename:p.filename,count:p.count,sha256:actual};state.preview=null;state.notice=`${p.count}项安排已核验并交给浏览器下载，请检查文件。未修改课表，不代表已归档或持续同步。`;return true}),
    reset,dispose(){reset(true);disposed=true},
  }
}
