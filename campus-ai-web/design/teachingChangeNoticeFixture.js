import { addDays } from '../src/utils/timetable.js'
import { isEnrollmentId as uuid } from '../src/utils/teachingIds.js'
// Recipients are captured only by an actual accepted DEV change. Current authority is rechecked here.
export function createChangeNoticeFixture({actor,time,courses,memberFor,lifecycle,approved,audit,fail}){
  const readAt=new Map(),root='/api/teaching/lesson-change-notices'
  const arrangement=v=>({date:v.date,startTime:v.startTime,endTime:v.endTime,teacher:v.teacherLabel,room:v.room})
  function visible(){
    const today=new Date(Date.parse(time())+28800000).toISOString().slice(0,10),from=addDays(today,-30),result=[]
    const changes=audit.filter(h=>h.action==='LESSON_CHANGE')
    for(const h of changes){
      const recipient=h.changeRecipients?.find(r=>r.userId===actor().id),receipt=h.receipt
      if(!recipient||!receipt)continue
      const date=new Date(Date.parse(receipt.recordedAt)+28800000).toISOString().slice(0,10)
      if(date<from||date>today||Date.parse(receipt.recordedAt)>Date.parse(time()))continue
      const original=courses.find(c=>c.id===receipt.original.lessonId),target=courses.find(c=>c.id===(receipt.replacementLessonId||receipt.original.lessonId))
      if(!original?.cancelled||!target)continue
      const released=recipient.kind==='RELEASED',teacherCourse=released?original:target,
        teacherAllowed=approved(actor().id,'TEACHER')&&teacherCourse.teacherId===actor().id,
        studentAllowed=target.entries.some(e=>!e.withdrawn&&memberFor(e.studentId)?.userId===actor().id&&(lifecycle.get(e.studentId)?.status||'ACTIVE')==='ACTIVE')
      if(!(['TEACHER','BOTH','RELEASED'].includes(recipient.kind)&&teacherAllowed)&&!(['STUDENT','BOTH'].includes(recipient.kind)&&studentAllowed))continue
      if(!released&&receipt.replacementLessonId&&changes.some(next=>next.receipt?.original.lessonId===receipt.replacementLessonId))continue
      const outdated=!released&&!!receipt.proposed&&target.cancelled
      result.push({id:recipient.id,requestId:receipt.requestId,action:released?'RELEASED':receipt.action,course:receipt.original.name,original:arrangement(receipt.original),proposed:released||!receipt.proposed?null:arrangement(receipt.proposed),targetLessonId:outdated?null:released?receipt.original.lessonId:target.id,view:teacherAllowed?'TEACHER':'STUDENT',outdated,changedAt:receipt.recordedAt,readAt:readAt.get(recipient.id)||null})
    }
    return{from,to:today,items:result.sort((a,b)=>Date.parse(b.changedAt)-Date.parse(a.changedAt)||a.id.localeCompare(b.id))}
  }
  return (config,reply)=>{
    if(!config.url.startsWith(root))return
    const match=new RegExp('^'+root+'/([^/]+)/read$').exec(config.url)
    if(match&&config.method==='post'){
      if(!uuid(match[1]))fail(400,'通知编号无效')
      const row=visible().items.find(r=>r.id===match[1]);if(!row)fail(404,'通知已过时或不在当前账号范围')
      if(!readAt.has(row.id))readAt.set(row.id,new Date(time()).toISOString())
      return reply({...row,readAt:readAt.get(row.id)})
    }
    if(config.url!==root||config.method!=='get')fail(404,'模拟变更通知入口不存在')
    const page=Number(config.params?.page||0),size=Number(config.params?.size||25),unreadOnly=config.params?.unreadOnly!==false&&config.params?.unreadOnly!=='false',source=visible(),rows=source.items.filter(r=>!unreadOnly||!r.readAt),total=rows.length,totalPages=Math.ceil(total/25)
    if(!Number.isInteger(page)||page<0||page>10000||size!==25||page>0&&page>=totalPages)fail(409,'通知页码已变化，请从第一页读取')
    return reply({enabled:true,items:rows.slice(page*25,(page+1)*25),page,size,total,totalPages,unreadOnly,from:source.from,to:source.to})
  }
}
