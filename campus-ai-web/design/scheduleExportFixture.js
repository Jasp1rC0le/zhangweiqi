import {scheduleExportFilter} from '../src/utils/scheduleExport.js'
import {chinaDate,mondayOf,addDays} from '../src/utils/timetable.js'
import {governanceChecksum} from '../src/utils/teachingGovernance.js'
import {syntheticScheduleFile} from './scheduleFiles.js'
export function createScheduleExportFixture({actor,views,courses,schedules,bells,allows,entriesFor,administrativeClassFor,lesson,read,time,fail}){
  const cache=new Map(),digest=value=>governanceChecksum(new TextEncoder().encode(JSON.stringify(value)).buffer)
  function rights(){const v=views(),teachingViews=[...v];if(actor().role==='ADMIN')teachingViews.push('ADMIN');return{sources:['MY','PERSONAL',...(teachingViews.length?['TEACHING']:[])],teachingViews,personalViews:['STUDENT',...(v.includes('TEACHER')?['TEACHER']:[])],formats:['JSON','CSV','XLSX','PDF','ICS'],defaultFrom:mondayOf(chinaDate()),defaultTo:addDays(mondayOf(chinaDate()),6),maxDays:210,maxRows:2000,expiresSeconds:300}}
  async function snapshot(raw){
    let f;try{f=scheduleExportFilter(raw)}catch(e){fail(400,e.message)}const access=rights();if(!(f.source==='TEACHING'?access.teachingViews:access.personalViews).includes(f.view))fail(403,'当前模拟账号没有这个课表范围')
    let scope=f.source==='TEACHING'?({STUDENT:'本人教学课程',TEACHER:'本人任课课程',COUNSELOR:'负责班级课程',SECRETARY:'负责学院课程',ADMIN:'本校教学安排'})[f.view]:f.source==='MY'?'本人统一课表（个人导入与已授权教学合并）':'本人已保存的个人导入'
    const own=schedules.get(actor().id);if(own&&f.source!=='TEACHING')scope+=' · '+(f.source==='MY'?'个人导入学期：':'')+own.semester
    if(f.classId){const q=await read({url:'/api/teaching/governance/classes/page',method:'get',params:{view:f.view,page:0,size:1,search:'',selected:f.classId}});if(!q.data.selected)fail(404,'模拟班级不在授权范围');scope+=' · '+q.data.selected.description+' · '+q.data.selected.label}
    let rows=[]
    if(f.source==='TEACHING')rows=courses.filter(c=>(f.view==='ADMIN'||allows(c,f.view))&&(!f.classId||(f.view==='ADMIN'?c.entries.filter(e=>!e.withdrawn):entriesFor(c,f.view)).some(e=>(e.adminClassId||administrativeClassFor(e.studentId)?.id)===f.classId)||!c.entries.length&&c.classId===f.classId)).map(c=>{const l=lesson(c,f.view);return{id:c.id,date:c.date,name:c.name,room:c.room,teacher:l.teacher,className:l.className,startTime:c.start,endTime:c.end,timeLabel:c.start+'-'+c.end,sources:['TEACHING'],cancelled:c.cancelled}})
    else if(f.source==='MY'){
      for(let monday=mondayOf(f.from);monday<=f.to;monday=addDays(monday,7)){let page=0,pages;do{const value=(await read({url:'/api/timetable/unified/page',method:'get',params:{view:f.view,monday,page,size:100}})).data;pages=value.totalPages;rows.push(...await Promise.all(value.week.entries.map(async e=>{const hash=await digest([e.id,e.date]),id=`${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;return{id,date:e.date,name:e.name,room:e.room,teacher:e.teacher,className:e.className,startTime:e.startTime,endTime:e.endTime,timeLabel:e.timeLabel,sources:e.sources,cancelled:e.cancelled}})));page++}while(page<pages)}
    }else{
      const s=schedules.get(actor().id);if(s)for(const [index,c] of s.courses.entries())for(const week of c.weeks){const date=addDays(s.firstMonday,(week-1)*7+c.weekday-1),span=c.startPeriod?bells.filter(b=>b.period>=c.startPeriod&&b.period<=c.endPeriod):null,known=span?.length===c.endPeriod-c.startPeriod+1,start=c.startPeriod?known?span[0].start:null:c.startTime,end=c.startPeriod?known?span.at(-1).end:null:c.endTime,hash=await digest([actor().id,s.revision,index,date]),id=`${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;rows.push({id,date,name:c.name,room:c.room,teacher:'',className:'',startTime:start,endTime:end,timeLabel:start?start+'-'+end:`第${c.startPeriod}-${c.endPeriod}节（钟点待配置）`,sources:['PERSONAL'],cancelled:false})}
    }
    rows=rows.filter(r=>r.date>=f.from&&r.date<=f.to&&(f.includeCancelled||!r.cancelled)&&(!f.search||[r.name,r.room,r.teacher,r.className].some(x=>x.toLowerCase().includes(f.search.toLowerCase()))))
    if(f.period!=='ALL'){if(rows.some(r=>!r.startTime))fail(400,'模拟未核定钟点不能筛时段');rows=rows.filter(r=>{const h=Number(r.startTime.slice(0,2));return f.period==='MORNING'?h<12:f.period==='AFTERNOON'?h>=12&&h<18:h>=18})}
    rows.sort((a,b)=>a.date.localeCompare(b.date)||(a.startTime||'99').localeCompare(b.startTime||'99')||a.id.localeCompare(b.id));if(rows.length>2000)fail(400,'超过2000项，请缩小日期或班级；没有截断模拟文件')
    return{filter:f,scope,entries:rows,warnings:['这是本页内存合成数据生成的日期快照，不是学校资料、实时教务或考勤文件。']}
  }
  return async(config,data,reply)=>{
    const prefix='/api/timetable/exports';if(!config.url.startsWith(prefix))return
    if(config.url===prefix+'/access')return reply(rights())
    if(config.url===prefix+'/classes/page')return read({...config,url:'/api/teaching/governance/classes/page'})
    if(config.method!=='post')fail(405,'模拟导出操作需要POST')
    const owner=actor().id,role=actor().role
    if(config.url===prefix+'/prepare'){
      const s=await snapshot(data);if(!s.entries.length)fail(400,'当前模拟范围没有课程');const sourceHash=await digest(s),file=await syntheticScheduleFile(s.entries,s.filter,s.scope,time());if(actor().id!==owner||actor().role!==role||config.signal?.aborted)fail(403,'模拟账号已变化，未准备文件');const sha256=await governanceChecksum(file.bytes.buffer.slice(file.bytes.byteOffset,file.bytes.byteOffset+file.bytes.byteLength));if(file.bytes.length>4*1024*1024)fail(400,'模拟文件超过4MB，未截断');const token=crypto.randomUUID(),expiresAt=new Date(Date.now()+300000).toISOString(),filename=`课程安排-${s.filter.from}-${s.filter.to}.${s.filter.format.toLowerCase()}`
      for(const [key,p] of cache)if(Date.parse(p.expiresAt)<=Date.now())cache.delete(key);while([...cache.values()].filter(p=>p.owner===owner).length>=2)cache.delete([...cache].find(([,p])=>p.owner===owner)[0]);cache.set(token,{owner,sourceHash,bytes:file.bytes,mime:file.mime,filter:s.filter,expiresAt,filename,sha256})
      return reply({token,filter:s.filter,scope:s.scope,count:s.entries.length,sha256,bytes:file.bytes.length,mime:file.mime,filename,expiresAt,sample:s.entries.slice(0,3),warnings:s.warnings})
    }
    if(config.url!==prefix+'/download')fail(404,'模拟导出入口不存在');const p=cache.get(data?.token);if(!p||p.owner!==owner||Date.parse(p.expiresAt)<=Date.now())fail(410,'模拟文件准备已失效');const actual=await digest(await snapshot(p.filter));if(actor().id!==owner||actor().role!==role||config.signal?.aborted)fail(403,'模拟账号已变化');if(actual!==p.sourceHash)fail(409,'模拟课表或权限已变化，请重新准备');return{...reply(new Blob([p.bytes],{type:p.mime})),headers:{'content-type':p.mime,'x-content-sha256':p.sha256}}
  }
}
