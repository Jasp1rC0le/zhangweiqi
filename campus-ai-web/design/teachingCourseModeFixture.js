import {isEnrollmentId as uuid} from '../src/utils/teachingIds.js'
// DEV-only explicit classification of existing fixture data; no fixed success or school writes.
export function createCourseModeFixture({actor,time,courses,classes,administrativeClassFor,lifecycleStates,audit,fail,teacherName=id=>id===4?'教师甲（模拟）':'教师乙（模拟）'}){
  const reviews=new Map(),requests=new Map()
  const group=id=>courses.filter(c=>(c.courseId||c.id)===id)
  function state(id){
    if(actor().role!=='ADMIN')fail(403,'需要正常模拟管理员')
    const values=group(id),c=values[0];if(!c)fail(404,'课程不在本校模拟范围')
    const anchor=classes.find(b=>b.id===c.classId),members=c.entries.filter(e=>!e.withdrawn),review=reviews.get(id)
    return{courseId:id,revision:c.rosterRevision||0,mode:c.mode||'LEGACY',target:{name:c.name,semester:c.semester||'模拟学期',teacher:teacherName(c.teacherId),weekday:new Date(`${c.date}T12:00:00Z`).getUTCDay()||7,startTime:c.start,endTime:c.end,room:c.room},groupName:c.groupName||anchor.name,adminClassId:c.classId,adminClassName:anchor.name,college:anchor.college,activeMembers:members.length,outsideAdminClass:members.filter(e=>administrativeClassFor(e.studentId)?.id!==c.classId).length,invalidActiveMembers:members.filter(e=>!administrativeClassFor(e.studentId)||lifecycleStates.get(e.studentId)?.status==='LEFT').length,futureLessons:values.filter(x=>!x.cancelled&&Date.parse(`${x.date}T${x.start}:00+08:00`)>Date.parse(time())).length,reviewRequestId:review?.requestId||null,reviewRevision:review?.revision??null,reviewedBy:review?.actorId??null,reviewReason:review?.reason||'',reviewedAt:review?.reviewedAt||null}
  }
  return(config,data,reply)=>{
    const match=/^\/api\/admin\/teaching\/courses\/([a-f0-9-]+)\/enrollment-mode(\/review)?$/.exec(config.url)
    if(!match)return
    const id=match[1];if(actor().role!=='ADMIN')fail(403,'需要正常模拟管理员')
    if(config.method==='get')return reply(state(id))
    if(!match[2] || config.method!=='post')fail(400,'模拟来源核定需明确请求回执')
    if(!data || !uuid(data.requestId) || !['ADMIN_CLASS','EXPLICIT'].includes(data.mode) || !Number.isInteger(data.revision) || data.revision<0 || typeof data.reason!=='string'||!data.reason.trim()||data.reason.length>300)fail(400,'核定版本、类型或依据无效')
    const key=JSON.stringify([actor().id,id,data.mode,data.revision,data.reason.trim()]),old=requests.get(data.requestId)
    if(old){if(old.key!==key)fail(409,'同一模拟请求已有不同内容');return reply(old.receipt)}
    const current=state(id);if(current.revision!==data.revision || current.mode!=='LEGACY')fail(409,'模拟课程类型或版本已变化')
    if(current.invalidActiveMembers || data.mode==='ADMIN_CLASS'&&current.outsideAdminClass)fail(409,'有效名单行政归属或学籍不符合所选类型')
    const receipt={requestId:data.requestId,courseId:id,mode:data.mode,revision:data.revision+1,actorId:actor().id,reason:data.reason.trim(),reviewedAt:new Date(time()).toISOString()}
    for(const c of group(id)){c.mode=data.mode;c.rosterRevision=receipt.revision}
    reviews.set(id,receipt);requests.set(data.requestId,{key,receipt});audit.push({courseId:id,actorId:actor().id,action:'MODE_REVIEW',mode:data.mode,reason:receipt.reason,revision:receipt.revision,requestId:data.requestId,at:receipt.reviewedAt})
    return reply(receipt)
  }
}
