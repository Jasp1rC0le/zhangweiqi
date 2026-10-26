import {governanceFilter,governanceChecksum} from '../src/utils/teachingGovernance.js'
// DEV-only scoped reads of actual fixture rows and changes. No production data or fixed-success export.
export function createGovernanceFixture({actor,views,time,courses,classes,entriesFor,allows,administrativeClassFor,audit,actors,stamp,fail,uid,teacherName=id=>id===4?'教师甲（模拟）':'教师乙（模拟）'}) {
  const previews=new Map()
  const yearAfter=value=>{const d=new Date(value),year=d.getUTCFullYear()+1,month=d.getUTCMonth(),day=d.getUTCDate();d.setUTCFullYear(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate()));return d.toISOString()}
  function allowed(view){if(view==='ADMIN'){if(actor().role!=='ADMIN')fail(403,'需要正常模拟管理员');}else if(!views().includes(view))fail(403,'当前模拟账号没有此记录视图')}
  function visibleClasses(view){allowed(view);return classes.filter(b=>view==='ADMIN'||courses.some(c=>allows(c,view)&&((view==='TEACHER'&&c.classId===b.id)||entriesFor(c,view).some(e=>(e.adminClassId||administrativeClassFor(e.studentId)?.id)===b.id))))}
  function rows(input){
    let filter;try{filter=governanceFilter(input)}catch(error){fail(400,error.message)}allowed(filter.view)
    if(filter.classId&&!visibleClasses(filter.view).some(b=>b.id===filter.classId))fail(404,'班级不在当前模拟记录范围')
    const result=[]
    for(const c of courses.filter(c=>c.date>=filter.from&&c.date<=filter.to&&(filter.view==='ADMIN'||allows(c,filter.view)))) {
      const entries=(filter.view==='ADMIN'?c.entries:entriesFor(c,filter.view)).filter(e=>!filter.classId||(e.adminClassId||administrativeClassFor(e.studentId)?.id)===filter.classId)
      for(const e of entries){
        const b=classes.find(b=>b.id===(e.adminClassId||administrativeClassFor(e.studentId)?.id)),history=audit.map((a,index)=>({...a,index})).filter(a=>a.lessonId===c.id&&a.studentId===e.studentId),end=stamp(c,true)
        const base={lessonId:c.id,studentId:e.studentId,studentNumber:e.studentNumber,studentName:e.name,course:c.name,teacher:teacherName(c.teacherId),className:b.name,college:e.college||b.college,startsAt:stamp(c),endsAt:end,status:e.status,withdrawn:!!e.withdrawn,cancelled:!!c.cancelled,scopeSource:e.source||'CAPTURED_AT_CREATION'}
        if(filter.kind==='AUDIT')for(const change of history){const until=yearAfter(change.at);result.push({...base,id:uid(60000+change.index),oldStatus:change.old,newStatus:change.status,reason:change.reason||'',actorName:actors.find(a=>a.id===change.actorId)?.nickname||'历史模拟账号',retentionBaseAt:change.at,retainedUntil:until,eligible:Date.parse(until)<=Date.parse(time())})}
        else {const last=history.reduce((latest,h)=>Date.parse(h.at)>Date.parse(latest)?h.at:latest,end),until=yearAfter(last);result.push({...base,id:`${c.id}:${e.studentId}`,oldStatus:'',newStatus:'',reason:'',actorName:'',retentionBaseAt:last,retainedUntil:until,eligible:Date.parse(until)<=Date.parse(time())})}
      }
    }
    result.sort((a,b)=>filter.kind==='AUDIT'?Date.parse(b.retentionBaseAt)-Date.parse(a.retentionBaseAt)||b.id.localeCompare(a.id):Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.id.localeCompare(b.id))
    return{filter,all:result,matched:filter.expiredOnly?result.filter(r=>r.eligible):result}
  }
  function csv(filter,values){
    const cell=value=>{let v=String(value??'').replace(/[\r\n\t]/g,' ');if(/^[\s\uFEFF]*[=+@-]/u.test(v))v=`'${v}`;return`"${v.replaceAll('"','""')}"`}
    const lines=[['Campthink 授权考勤证据（模拟）',filter.kind,filter.view,filter.from,filter.to,filter.classId],['一年保留，到期仅核验；未归档或删除'],['记录编号','学号（文本）','姓名','课程','教师','历史班级','学院','当前状态','原状态','新状态','原因','操作人','保留至','到期候选']]
    for(const r of values)lines.push([r.id,`'${r.studentNumber}`,r.studentName,r.course,r.teacher,r.className,r.college,r.status,r.oldStatus,r.newStatus,r.reason,r.actorName,r.retainedUntil,r.eligible?'待归档核验':'保留中'])
    return new Blob(['\uFEFF'+lines.map(line=>line.map(cell).join(',')).join('\r\n')+'\r\n'],{type:'text/csv;charset=UTF-8'})
  }
  async function extract(filter){const result=rows(filter);if(result.matched.length>2000)fail(400,'超过2000条，请缩小范围；未截断模拟导出');if(!result.matched.length)fail(400,'当前范围没有可导出记录');const blob=csv(result.filter,result.matched),sha256=await governanceChecksum(await blob.arrayBuffer());return{...result,blob,sha256}}
  return async(config,data,reply)=>{
    if(!config.url.startsWith('/api/teaching/governance/'))return
    const params=config.params||{}
    if(config.url.endsWith('/access'))return reply({enabled:true,views:[...views(),...(actor().role==='ADMIN'?['ADMIN']:[])],maxDays:31,maxExportRows:2000,retentionYears:1,deletionEnabled:false})
    if(config.url.endsWith('/classes/page')) {
      const page=Number(params.page||0),size=Number(params.size||25),search=String(params.search||'').trim(),all=visibleClasses(params.view),selected=all.find(b=>b.id===params.selected),matches=all.filter(b=>[b.name,b.college].some(s=>s.includes(search))).sort((a,b)=>a.id.localeCompare(b.id)),total=matches.length,totalPages=Math.ceil(total/size)
      if(params.selected&&!selected)fail(404,'已选班级不在当前授权范围')
      if(!Number.isInteger(page)||page<0||!Number.isInteger(size)||size<1||size>100||(page>0&&page>=totalPages))fail(400,'模拟班级页码无效')
      const option=b=>b?{value:b.id,label:b.name,description:b.college}:null
      return reply({items:matches.slice(page*size,(page+1)*size).map(option),selected:option(selected),page,size,total,totalPages})
    }
    if(config.url.endsWith('/page')) {
      const {filter,all,matched}=rows(params),page=Number(params.page||0),size=Number(params.size||25),total=matched.length,totalPages=Math.ceil(total/size)
      if(!Number.isInteger(page)||page<0||!Number.isInteger(size)||size<1||size>100||(page>0&&page>=totalPages))fail(400,'模拟记录页码无效')
      return reply({filter,items:matched.slice(page*size,(page+1)*size),page,size,total,totalPages,rangeTotal:all.length,expiredWithinScope:all.filter(r=>r.eligible).length,retentionYears:1,deletionEnabled:false})
    }
    if(config.url.endsWith('/export-preview')) {
      const value=await extract(params),token=crypto.randomUUID(),expiresAt=new Date(Date.now()+300000).toISOString();previews.set(token,{owner:actor().id,filter:value.filter,sha256:value.sha256,expiresAt})
      return reply({token,filter:value.filter,count:value.matched.length,maxRows:2000,sha256:value.sha256,expiresAt,retentionYears:1,deletionEnabled:false})
    }
    if(config.url.endsWith('/export')&&config.method==='post') {
      const prepared=previews.get(data?.token);if(!prepared||prepared.owner!==actor().id||Date.parse(prepared.expiresAt)<=Date.now())fail(410,'模拟导出准备已失效')
      const value=await extract(prepared.filter);if(value.sha256!==prepared.sha256)fail(409,'模拟记录或授权范围已变化，请重新准备')
      return{...reply(value.blob),headers:{'content-type':'text/csv;charset=UTF-8','x-content-sha256':value.sha256}}
    }
    fail(404,'该模拟证据接口不存在')
  }
}
