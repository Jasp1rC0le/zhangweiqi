import {formalCoursePayload} from '../src/utils/formalCourseDraft.js'
import {governanceChecksum} from '../src/utils/teachingGovernance.js'
export function createFormalCourseFixture({actor,actors,classes,members,memberFor,approved,lifecycle,fail}){
  const definitions=new Map()
  const digest=p=>governanceChecksum(new TextEncoder().encode(JSON.stringify(p)).buffer)
  async function checked(data){
    let payload;try{payload=formalCoursePayload({course:data?.course,rosterMode:data?.rosterMode,groupName:data?.groupName,students:(data?.studentIds||[]).map(id=>({id}))})}catch(e){fail(400,e.message)}
    const b=classes.find(b=>b.id===payload.course.classId),teacher=actors.find(a=>a.id===payload.course.teacherId&&a.schoolId===actor().schoolId)
    if(!b||!teacher||!approved(teacher.id,'TEACHER'))fail(403,'模拟教师或班级不可用，需先审核身份')
    const ids=payload.rosterMode==='SELECTED'?payload.studentIds:(members.get(b.id)||[]).filter(m=>lifecycle.get(m.id)?.status!=='LEFT').map(m=>m.id)
    if(ids.some(id=>!memberFor(id)||lifecycle.get(id)?.status==='LEFT'))fail(409,'模拟成员或学籍已变化')
    const target={id:payload.course.id,classLabel:`${b.college} · ${b.name}`,teacherLabel:`${teacher.username} · ${teacher.nickname}`,fingerprint:await digest(payload),members:ids.length,rosterMode:payload.rosterMode,groupName:payload.groupName}
    return{payload,target}
  }
  return{
    remember:async data=>{const v=await checked(data);definitions.set(v.payload.course.id,{course:v.payload.course,fingerprint:v.target.fingerprint})},
    handle:async(config,data,reply)=>{
      const definition=/^\/api\/admin\/teaching\/courses\/([a-f0-9-]{36})\/definition$/.exec(config.url)
      if(!definition&&config.url!=='/api/admin/teaching/courses/preview')return
      if(actor().role!=='ADMIN')fail(403,'需要正常模拟管理员')
      if(definition){const found=definitions.get(definition[1]);if(!found)fail(404,'模拟原课程尚未查到');return reply(structuredClone(found))}
      if(config.method!=='post')fail(405,'模拟课程预览需要POST')
      return reply((await checked(data)).target)
    },
  }
}
