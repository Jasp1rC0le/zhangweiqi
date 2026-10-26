import {calendarRangeForText} from './scheduleIntent.js'
import {planPrivateCourseExport} from './privateCourseExportIntent.js'
import {dayNumber} from './timetable.js'
const formats={excel:'XLSX',xlsx:'XLSX',xls:'XLSX',pdf:'PDF',csv:'CSV',ics:'ICS',ical:'ICS',json:'JSON'}
const verb=/导出|下载|另存|保存为|生成.*文件|导(?:一份|一份|个|份)/i,topic=/课表|课程表|课程安排/
const self=/^(?:只要|仅)?(?:我|我自己|本人|自己的|我的)(?:的)?(?:课表)?[。！!？?\s]*$/
function pending(value){if(!value||typeof value!=='object')return null;const p={};for(const key of ['source','view','format','period','from','to','scope'])if(typeof value[key]==='string')p[key]=value[key];p.target=value.target===true;p.date=value.date===true;return p}
export function resolveScheduleFileRequest(text,{today,previous=null}={}){
  if(typeof text!=='string'||!text.trim())return null
  const raw=text.normalize('NFKC').trim(),prior=pending(previous)
  if(prior&&/^(?:取消|算了|不导出了|不用了)[。！!？?\s]*$/.test(raw))return{clarification:'已取消本次课表文件导出，没有读取或下载文件。',cancelled:true}
  if(/考勤|点名|旷课|早退|学籍|知识库/.test(raw))return null
  const positive=raw.replace(/(?:不要|不用|不是|不需要)\s*(Excel|xlsx?|pdf|csv|ics|ical|json)/gi,'')
  const found=[...positive.matchAll(/Excel|xlsx?|pdf|csv|ics|ical|json/gi)].map(m=>formats[m[0].toLowerCase()]),requested=[...new Set(found)]
  const calendar=calendarRangeForText(positive,{today,previous:prior,maxDays:210})
  const collective=/全班|班级|行政班|我们班|全校|学院|全院|负责范围|负责的班/.test(positive),myTeaching=/我的(?:任课|授课|教学)|本人(?:任课|授课|教学)/.test(positive)
  const entity=prior?.target&&raw.length<60&&!/你好|谢谢|怎么|如何|为什么|解释|介绍|水卡|食堂|论文|作业|代码|天气|知识/.test(raw)
  const command=verb.test(raw)&&topic.test(raw),bare=prior&&raw.length<300&&(self.test(raw)||requested.length||/本人|我自己|我的|本周|这周|上周|下周|今天|明天|上午|下午|晚上|到|至|\d.*[日号-]/.test(raw)||collective||entity)
  const termSupplement=prior&&/学期|完整/.test(raw)&&!/解释|介绍|论文|作业|代码|水卡|食堂/.test(raw)
  if(!command&&!bare&&!termSupplement)return null
  // Original full-personal JSON remains its own round-trip import format.
  if(!prior&&!requested.some(f=>f!=='JSON')&&!collective&&!myTeaching&&/学期/.test(positive)&&!/第[\d一二三四五六七八九十]+周|上午|下午|晚上/.test(positive))return null
  if(!prior&&!(requested.some(f=>f!=='JSON')||calendar.explicit||calendar.clarification||collective||myTeaching||/上午|下午|晚上|早上|晚间/.test(positive)))return null
  const p={source:'MY',format:'XLSX',period:'ALL',scope:'AUTHORIZED',...prior}
  if(raw.length>10000||/[`{}]/.test(raw))return{clarification:'请只说明导出对象、日期和文件格式；没有从代码或长文本猜测权限或准备文件。',pendingScheduleExport:{...p,target:true,date:true}}
  if(requested.length>1)return{clarification:'先选一种格式：Excel、PDF、CSV、ICS或JSON日期快照；没有生成多份或替换格式。',pendingScheduleExport:p}
  if(requested.length)p.format=requested[0]
  const legacy=planPrivateCourseExport(raw,{today,...(prior?{previous:{target:prior.target,coverage:prior.date,format:false}}:{})}),denied=/(?:不是|不要|非|并非)\s*(?:我的|本人|个人)/.test(positive)
  if(collective&&/(?:我的|本人|我自己)/.test(positive)&&/和|与|以及/.test(positive))return{clarification:'这条请求混合了本人和集体范围。先导出本人统一课表，还是一个已授权班级或学院？未替你选择其中一部分。',pendingScheduleExport:{...p,target:true}}
  if(collective){p.source='TEACHING';p.scope=/学院|全院|全校/.test(positive)?'COLLEGE':'CLASS';if(/负责范围|负责的班|全部授权/.test(positive))p.scope='AUTHORIZED';p.target=false;if(/书记/.test(positive))p.view='SECRETARY';if(/导员|辅导员/.test(positive))p.view='COUNSELOR';if(/全校/.test(positive))p.view='ADMIN'}
  else if(myTeaching){p.source='TEACHING';p.view='TEACHER';p.target=false}
  else if(self.test(positive)||(/本人|我自己|我的|自己的/.test(positive)&&(legacy?.personalExport||legacy?.pendingPrivateExport?.target===false))&&!denied){p.source=/个人导入|原始个人/.test(positive)?'PERSONAL':'MY';p.scope='AUTHORIZED';delete p.view;p.target=false}
  else if(legacy?.pendingPrivateExport?.target||denied||/他人|别人|室友|同桌|账号|学号/.test(positive))p.target=true
  if(/上午|早上/.test(positive))p.period='MORNING';else if(/下午/.test(positive))p.period='AFTERNOON';else if(/晚上|晚间/.test(positive))p.period='EVENING';else if(/全天/.test(positive))p.period='ALL'
  if(calendar.clarification){p.date=true}else if(calendar.explicit){p.from=calendar.from;p.to=calendar.to;p.date=false}else if(!p.from){p.from=calendar.from;p.to=calendar.to}
  if(p.target)return{clarification:'要导出本人课表，还是一个已授权班级或学院？不能按姓名认领他人私人课表。请明确对象，未读取或生成文件。',pendingScheduleExport:p}
  if(p.date)return{clarification:'请给出整学期的明确起止日期；只取本站已有数据可在课表使用“采用本人已保存范围”。这不代表教务整学期已齐，也不会静默改成本周。',pendingScheduleExport:p}
  return{scheduleExport:true,exportPreset:{source:p.source,...(p.view?{view:p.view}:{}),format:p.format,period:p.period,from:p.from,to:p.to,scope:p.scope},from:p.from,to:p.to,dateNote:calendar.explicit?'按你指定的日期':prior?.from?'沿用当前导出日期':'未指定日期，先打开本周；可在页面修改',notice:p.scope==='CLASS'?'到业务页明确选择授权班级，再准备文件。':p.scope==='COLLEGE'?'学院范围只向实际负责的书记或正常管理员开放，按当前服务端授权核对。':'准备和下载都重新核对当前账号与课表，不自动执行下载。'}
}
export function scheduleExportRoute(query){
  if(query?.tool!=='schedule-export')return null
  const day=v=>{try{return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v}catch{return false}}
  if(!day(query.from)||!day(query.to)||dayNumber(query.to)<dayNumber(query.from)||dayNumber(query.to)-dayNumber(query.from)>209||!['MY','PERSONAL','TEACHING'].includes(query.source)||!['JSON','CSV','XLSX','PDF','ICS'].includes(query.format)||!['ALL','MORNING','AFTERNOON','EVENING'].includes(query.period)||query.view!=null&&!['STUDENT','TEACHER','COUNSELOR','SECRETARY','ADMIN'].includes(query.view)||query.scope!=null&&!['AUTHORIZED','CLASS','COLLEGE'].includes(query.scope))return{error:'导出链接条件无效，请手动核对日期、来源和格式；未准备文件。'}
  return{source:query.source,format:query.format,period:query.period,from:query.from,to:query.to,scope:query.scope||'AUTHORIZED',...(query.view?{view:query.view}:{})}
}
