import {ADMIN_AUDIT_KINDS,administrativeAuditFilter} from '../src/utils/teachingAdministrativeAudit.js'
import {governanceChecksum} from '../src/utils/teachingGovernance.js'
// Explicit synthetic evidence, plus actual mutations in the in-memory DEV workflow; never school rows.
export function createAdministrativeAuditFixture({actor,time,courses,classes,memberFor,audit,identityRows,identityAudit,actors,uid,fail,seedHistory=false,responsibilities=false}){
  const previews=new Map(),bindings=seedHistory?Array.from({length:65},(_,i)=>({eventId:uid(80000+i),studentId:uid(100),actorId:i===0?999:1,old:i%2===0?null:2,next:i%2===0?2:null,at:new Date(Date.parse(time())-3600000-i*1000).toISOString()})):[]
  const category=()=>Object.entries(ADMIN_AUDIT_KINDS).filter(([key])=>responsibilities||key!=='RESPONSIBILITY').map(([key,label])=>({key,label,enabled:true,detail:({STUDENT_TRANSITION:'模拟转班、离校、复学原状态与班级',ACCOUNT_BINDING:'合成历史保留旧、新账号编号；没有当时行政班快照',IDENTITY_REVIEW:'实际模拟身份申请、审核、撤销及恢复',COURSE_ENROLLMENT:'实际模拟退课与重新选课',COURSE_SOURCE:'实际模拟来源核定，不改原成员或考勤',RESPONSIBILITY:'实际模拟授撤与当次账号、范围快照',LESSON_CHANGE:'原/替代节次、课程、教师和教室来自当次实际模拟回执；不拿现名补造旧显示名'})[key]}))
  function rows(){
    const result=[],base=(kind,eventId,subjectId,actorId,at)=>({id:`${kind}:${eventId}`,kind,eventId,subjectId,actorId,actorName:actors.find(a=>a.id===actorId)?.nickname||'历史操作账号',recordedAt:new Date(at).toISOString(),target:'',context:'',action:'',beforeValue:'',afterValue:'',reason:'',revision:null,affectedLessons:null,historyNote:'名称是当前对照，未保存的历史归属不补造。'})
    for(const b of bindings){const m=memberFor(b.studentId);result.push({...base('ACCOUNT_BINDING',b.eventId,b.studentId,b.actorId,b.at),target:m?.name||'历史模拟学生',context:`学号 ${m?.studentNumber||'未保留'}`,action:'BIND',beforeValue:b.old==null?'未绑定':String(b.old),afterValue:b.next==null?'未绑定':String(b.next),reason:'原绑定记录未保存原因',historyNote:'原、新账号编号来自当次合成记录；未保存当时行政班快照，不用当前班级补造。'})}
    for(const b of audit.filter(h=>h.action==='BIND')){const m=memberFor(b.studentId);result.push({...base('ACCOUNT_BINDING',b.requestId,b.studentId,b.actorId,b.at),target:m?.name||'历史模拟学生',context:`学号 ${m?.studentNumber||'未保留'}`,action:'BIND',beforeValue:b.oldUserId==null?'未绑定':String(b.oldUserId),afterValue:b.newUserId==null?'未绑定':String(b.newUserId),reason:'原绑定记录未保存原因',historyNote:'账号编号来自本次实际模拟绑定；未保存当时行政班快照，不用现班补造。'})}
    for(const h of audit.filter(h=>['GRANT','REVOKE'].includes(h.action)))result.push({...base('RESPONSIBILITY',h.requestId,String(h.userId),h.actorId,h.at),actorName:h.actorLabel,target:h.targetLabel,context:`${h.viewRole} · ${h.scopeLabel}`,action:h.action,beforeValue:h.oldActive?'有负责权限':'无负责权限',afterValue:h.newActive?'有负责权限':'无负责权限',reason:h.reason,revision:h.revision,historyNote:'显示名与范围来自当次模拟快照；撤销不删除考勤，迁移前授权历史不补造。'})
    for(const h of audit.filter(h=>h.action==='LESSON_CHANGE')){
      const receipt=h.receipt,old=receipt?.original,next=receipt?.proposed
      if(!old||receipt.requestId!==h.requestId||receipt.actorId!==h.actorId||receipt.reason!==h.reason)fail(503,'模拟调停课原回执不完整，整页未展示')
      const arrangement=value=>`${value.date} ${value.startTime}—${value.endTime} · ${value.teacherLabel} · ${value.room}`
      result.push({...base('LESSON_CHANGE',receipt.requestId,old.lessonId,h.actorId,h.at),actorName:'历史操作账号（原回执未保存显示名）',target:old.name,context:`${old.semester} · ${old.groupName}`,action:receipt.action,beforeValue:arrangement(old),afterValue:next?arrangement(next):'取消这一节，不改其他周次',reason:receipt.reason,revision:receipt.revision,affectedLessons:1,historyNote:`课程、教师、教室和原行政归属来自当次模拟回执，不随现名变化。原行政班：${old.classLabel}。操作人原显示名未捕获，不补造；不会给学生广播原因。`})
    }
    for(const [index,h] of audit.entries()){
      if(!['TRANSFER','LEAVE','RESTORE','WITHDRAW','REENROLL','MODE_REVIEW'].includes(h.action))continue
      const m=memberFor(h.studentId),c=courses.find(c=>(c.courseId||c.id)===h.courseId),transition=['TRANSFER','LEAVE','RESTORE'].includes(h.action),kind=transition?'STUDENT_TRANSITION':h.action==='MODE_REVIEW'?'COURSE_SOURCE':'COURSE_ENROLLMENT',subjectId=h.action==='MODE_REVIEW'?h.courseId:h.studentId,eventId=h.requestId||uid(90000+index)
      const row={...base(kind,eventId,subjectId,h.actorId,h.at||time()),target:m?.name||c?.name||'历史模拟对象',context:c?`${c.name} · ${c.semester||'模拟学期'}`:`学号 ${m?.studentNumber||'未保留'}`,action:h.action==='MODE_REVIEW'?'SOURCE_REVIEW':h.action,reason:h.reason||'',revision:h.revision??null,affectedLessons:h.affectedLessons??null}
      if(transition){row.beforeValue=h.oldStatus;row.afterValue=h.newStatus;row.historyNote=`原行政班：${classes.find(b=>b.id===h.oldClass)?.name||h.oldClass}；目标行政班：${classes.find(b=>b.id===h.newClass)?.name||h.newClass}。编号来自当次记录，名称为当前对照。`}
      if(h.action==='MODE_REVIEW'){row.beforeValue='LEGACY';row.afterValue=h.mode}
      result.push(row)
    }
    for(const [index,h] of identityAudit.entries()){const application=identityRows.find(a=>a.id===h.id);result.push({...base('IDENTITY_REVIEW',uid(95000+index),h.id,h.actor,h.at),target:application?.nickname||'已注销或解绑的历史申请',context:`申请身份 ${application?.requestedRole||'未保留'}`,action:'REVIEW',beforeValue:h.oldStatus,afterValue:h.status,reason:h.reason||'',revision:h.revision,historyNote:'申请注销后仍保留审计；未保存的原账号显示名和班级不补造。身份通过不等于平台管理员或教学范围授权。'})}
    return result.sort((a,b)=>Date.parse(b.recordedAt)-Date.parse(a.recordedAt)||a.kind.localeCompare(b.kind)||b.eventId.localeCompare(a.eventId))
  }
  function selected(input){let filter;try{filter=administrativeAuditFilter(input||{})}catch(error){fail(400,error.message)}const all=rows().filter(r=>{const date=new Date(Date.parse(r.recordedAt)+28800000).toISOString().slice(0,10);return date>=filter.from&&date<=filter.to&&(filter.kind==='ALL'||r.kind===filter.kind)&&(!filter.search||[r.target,r.context,r.reason,r.subjectId,r.eventId,r.actorName,...(r.kind==='LESSON_CHANGE'?[r.beforeValue,r.afterValue]:[])].some(v=>v.includes(filter.search)))});return{filter,all}}
  async function extract(input){
    const {filter,all}=selected(input);if(!all.length)fail(400,'当前范围没有可导出的模拟管理记录');if(all.length>2000)fail(400,'超过2000条，请缩小范围；未截断模拟导出')
    const cell=value=>{let v=String(value??'').replace(/\p{Cc}/gu,' ');if(/^[\s\uFEFF]*[=+@-]/u.test(v))v=`'${v}`;return`"${v.replaceAll('"','""')}"`}
    const provenance='（见历史依据）'
    const lines=[['Campthink 本校管理操作历史（模拟）',filter.from,filter.to,filter.kind,filter.search],['学校保留策略：一年','完整选定范围下载，不表示已归档、恢复或删除','已开放的负责范围使用当次快照，调停课使用当次回执；其他名称见逐条历史依据，缺失快照不补造'],['记录编号','类型','事件编号','对象编号',`对象${provenance}`,`上下文${provenance}`,'行为','原值','新值','原因或依据','版本','影响安排项数','操作账号编号（文本）',`操作人${provenance}`,'操作时间','历史依据说明']]
    for(const r of all)lines.push([r.id,r.kind,r.eventId,r.subjectId,r.target,r.context,r.action,r.beforeValue,r.afterValue,r.reason,r.revision,r.affectedLessons,`'${r.actorId}`,r.actorName,r.recordedAt,r.historyNote])
    const blob=new Blob(['\uFEFF'+lines.map(line=>line.map(cell).join(',')).join('\r\n')+'\r\n'],{type:'text/csv;charset=UTF-8'});if(blob.size>12*1024*1024)fail(400,'文件超过12MB，未截断模拟导出');return{filter,all,blob,sha256:await governanceChecksum(await blob.arrayBuffer())}
  }
  return async(config,data,reply)=>{
    if(!config.url.startsWith('/api/admin/teaching/operations/audit/'))return
    if(actor().role!=='ADMIN')fail(403,'需要正常模拟管理员，不采用教师或领导视图授权')
    const exporting=config.url.endsWith('/export')&&config.method==='post';if(config.method!=='get'&&!exporting)fail(405,'管理历史只读，不修改记录')
    if(config.url.endsWith('/access'))return reply({categories:category(),maxDays:31,retentionYears:1,deletionEnabled:false,exportEnabled:true,maxExportRows:2000,exportSeconds:300})
    if(config.url.endsWith('/export-preview')){const owner=actor().id,value=await extract(config.params);if(actor().id!==owner||actor().role!=='ADMIN')fail(403,'模拟账号已变化，没有准备文件');const now=Date.now();for(const [token,p] of previews)if(Date.parse(p.expiresAt)<=now)previews.delete(token);while([...previews.values()].filter(p=>p.owner===owner).length>=4)previews.delete([...previews].find(([,p])=>p.owner===owner)[0]);if(previews.size>=1000)fail(429,'模拟导出准备过多');const token=crypto.randomUUID(),expiresAt=new Date(now+300000).toISOString();previews.set(token,{owner,filter:value.filter,sha256:value.sha256,count:value.all.length,expiresAt});return reply({token,filter:value.filter,count:value.all.length,maxRows:2000,sha256:value.sha256,expiresAt,retentionYears:1,deletionEnabled:false})}
    if(exporting){const prepared=previews.get(data?.token);if(!prepared||prepared.owner!==actor().id||Date.parse(prepared.expiresAt)<=Date.now())fail(410,'模拟管理导出准备已失效');const value=await extract(prepared.filter);if(actor().id!==prepared.owner||actor().role!=='ADMIN')fail(403,'模拟账号或权限已变化');if(value.sha256!==prepared.sha256||value.all.length!==prepared.count)fail(409,'模拟管理记录已变化，请重新准备');return{...reply(value.blob),headers:{'content-type':'text/csv;charset=UTF-8','x-content-sha256':value.sha256}}}
    if(!config.url.endsWith('/page'))fail(404,'模拟管理历史入口不存在')
    const {filter,all}=selected(config.params),page=Number(config.params?.page||0),size=Number(config.params?.size||25),total=all.length,totalPages=Math.ceil(total/size)
    if(!Number.isInteger(page)||page<0||!Number.isInteger(size)||size<1||size>100||(page>0&&page>=totalPages))fail(400,'模拟管理历史页码无效')
    return reply({filter,items:all.slice(page*size,(page+1)*size),page,size,total,totalPages})
  }
}
