import { isEnrollmentId } from './teachingIds.js'

export function validatedTeachingStudent(value,id) {
  if(!value || !isEnrollmentId(id) || value.id!==id || !isEnrollmentId(value.classId) ||
    !Number.isSafeInteger(value.revision) || value.revision<0 || !['ACTIVE','LEFT'].includes(value.status) ||
    !['name','studentNumber','className','college'].every(key=>typeof value[key]==='string' && value[key].length>0 && value[key].length<=(key==='studentNumber'?40:100)))
    throw new Error('学籍状态响应异常，请重新读取')
  return value
}
export function studentTransitionPlan(person,action,target,reason,requestId) {
  validatedTeachingStudent(person,person?.id)
  if(!isEnrollmentId(requestId) || typeof reason!=='string' || !reason.trim() || reason.length>300 || !['TRANSFER','LEAVE','RESTORE'].includes(action))throw new Error('核验事项、原因或提交编号不完整')
  if(action==='RESTORE'?person.status!=='LEFT':person.status!=='ACTIVE')throw new Error('当前学籍与办理事项不符，请重新核对')
  const nextClass=action==='LEAVE'?person.classId:target
  if(!isEnrollmentId(nextClass) || (action==='TRANSFER' && nextClass===person.classId))throw new Error('请选择有效的目标行政班')
  return {studentId:person.id,nextClass,nextState:action==='LEAVE'?'LEFT':'ACTIVE',payload:{requestId,revision:person.revision,expectedClassId:person.classId,action,targetClassId:action==='LEAVE'?null:nextClass,reason:reason.trim()}}
}
export function validatedTransitionReceipt(data,plan) {
  if(!data || data.requestId!==plan.payload.requestId || data.studentId!==plan.studentId || data.classId!==plan.nextClass || data.status!==plan.nextState || data.revision!==plan.payload.revision+1 || !Number.isSafeInteger(data.affectedLessons) || data.affectedLessons<0 || data.affectedLessons>10000)throw new Error('变更回执待核对，不自动重发')
  return data
}
