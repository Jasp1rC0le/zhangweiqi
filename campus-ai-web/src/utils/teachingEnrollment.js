import { isEnrollmentId } from './teachingIds.js'
import { validatedTeachingStudent } from './teachingLifecycle.js'
export { isEnrollmentId } from './teachingIds.js'
const text = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max
export function validatedRosterMembers(rows) {
  if (!Array.isArray(rows) || rows.length > 300 || rows.some(m => !m || !isEnrollmentId(m.id) || !text(m.name,100) || !text(m.studentNumber,40)) || new Set(rows.map(m=>m.id)).size !== rows.length || new Set(rows.map(m=>m.studentNumber)).size !== rows.length) throw new Error('行政班名单不完整，请重新读取，不自动删行')
  return rows.map(m => ({ id:m.id,name:m.name,studentNumber:m.studentNumber }))
}
export function validatedCourseRoster(value, id) {
  const target=value?.target,time=s=>typeof s==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)
  if (!value || value.courseId !== id || !isEnrollmentId(id) || !text(value.groupName,100) || !Number.isSafeInteger(value.revision) || value.revision < 0 || !target || !['name','semester','teacher','room'].every(key=>text(target[key],100)) || !Number.isInteger(target.weekday) || target.weekday<1 || target.weekday>7 || !time(target.startTime) || !time(target.endTime) || target.startTime>=target.endTime || !Array.isArray(value.members) || value.members.length > 300 || value.members.some(m => !m || !isEnrollmentId(m.studentId) || !isEnrollmentId(m.adminClassId) || !text(m.name,100) || !text(m.studentNumber,40) || !text(m.college,100) || typeof m.active !== 'boolean') || new Set(value.members.map(m=>m.studentId)).size !== value.members.length || new Set(value.members.map(m=>m.studentNumber)).size !== value.members.length) throw new Error('课程名单响应异常，请重新核对目标')
  return value
}
export function validatedCourseRosterPage(value,id,page,search='') {
  validatedCourseRoster(value?.roster,id)
  if(value.page!==page || value.size!==25 || value.search!==search.trim() || value.activeOnly!==false || !Number.isSafeInteger(value.total) || value.total<0 || value.total>1000000 || !Number.isSafeInteger(value.activeTotal) || value.activeTotal<0 || value.activeTotal>2000 || value.totalPages!==Math.ceil(value.total/25) || value.roster.members.length!==Math.min(25,Math.max(0,value.total-page*25)) || (page>0 && page>=value.totalPages))throw new Error('名单分页响应异常，请重新读取')
  return value
}
export function createEnrollmentResource({ owner, state, read, readPage, readMember, write, readStudent, writeReenrollment, clock=Date.now }) {
  let epoch = 0, controller
  const reset = () => { epoch++;controller?.abort();Object.assign(state,{ roster:null,pagination:null,loading:false,saving:false,error:'',notice:'',uncertain:false,reenrollmentPreview:null }) }
  function operation() {
    controller?.abort();controller=new AbortController()
    const generation=++epoch,principal=owner(),signal=controller.signal
    return {signal,current:()=>!!principal && owner()===principal && epoch===generation && !signal.aborted}
  }
  async function load(id,page=0,search='') {
    const op=operation();state.loading=true;state.error='';state.notice='';state.roster=null;state.reenrollmentPreview=null
    try {const {data}=await (readPage?readPage(id,page,search.trim(),op.signal):read(id,op.signal));if(!op.current())return false;if(readPage){state.pagination=validatedCourseRosterPage(data,id,page,search);state.roster=data.roster}else state.roster=validatedCourseRoster(data,id);state.uncertain=false;return true}
    catch(e){if(op.current())state.error=e.response?.data?.message || e.message || '名单读取失败，请重试';return false}
    finally{if(op.current())state.loading=false}
  }
  async function withdraw(studentId, reason) {
    const roster=state.roster
    if(state.saving || state.loading || state.uncertain || !roster || !roster.members.some(m=>m.studentId===studentId && m.active) || !reason.trim())return false
    const op=operation(),id=roster.courseId,revision=roster.revision;state.saving=true;state.error='';state.notice=''
    let acknowledged=false
    try {
      const {data}=await write(id,studentId,{revision,reason:reason.trim()},op.signal)
      if(!op.current())return false
      if(!data || data.id!==id || data.studentId!==studentId || data.revision!==revision+1){state.uncertain=true;throw new Error('退课回执待核对，请重新读取名单，不自动重发')}
      acknowledged=true;state.uncertain=true;state.notice='退课已保存，历史考勤保留。'
      if(readPage){
        const verified=await readMember(id,studentId,op.signal);if(!op.current())return false
        if(verified.data?.courseId!==id || verified.data?.member?.studentId!==studentId || verified.data.member.active!==false || verified.data.revision<data.revision)throw new Error('退课目标的最新状态尚未确认')
      }
      const query=state.pagination,next=await (readPage?readPage(id,query?.page || 0,query?.search || '',op.signal):read(id,op.signal))
      if(!op.current())return false
      const current=readPage?validatedCourseRosterPage(next.data,id,query?.page || 0,query?.search || '').roster:validatedCourseRoster(next.data,id)
      if(current.revision < data.revision || current.members.some(m=>m.studentId===studentId && m.active))throw new Error('最新名单与回执不一致，请重新核对')
      state.roster=current;if(readPage)state.pagination=next.data;state.uncertain=false;return true
    }catch(e){if(op.current()){state.error=acknowledged?'退课已保存，但最新名单未确认，请重新读取；不要重复提交。':e.response?.data?.message || e.message || '操作结果未确认，请重新读取后核对';state.uncertain=true}return false}
    finally{if(op.current())state.saving=false}
  }
  function invalidateReenrollment(){state.reenrollmentPreview=null}
  function memberReceipt(value,id,student) {
    if(!value || value.courseId!==id || !Number.isSafeInteger(value.revision) || value.revision<0 || value.member?.studentId!==student)throw new Error('所选成员的最新状态响应异常')
    validatedCourseRoster({...state.roster,revision:value.revision,members:[value.member]},id)
    return value
  }
  async function prepareReenrollment(studentId,reason) {
    const roster=state.roster
    if(state.saving || state.loading || state.uncertain || !roster || !roster.members.some(m=>m.studentId===studentId && !m.active) || !reason.trim() || reason.length>300 || !readPage || !readMember || !readStudent || !writeReenrollment)return false
    const principal=owner()
    const op=operation();state.loading=true;state.error='';state.notice='';state.reenrollmentPreview=null
    try{
      const result=await readMember(roster.courseId,studentId,op.signal);if(!op.current())return false
      const member=memberReceipt(result.data,roster.courseId,studentId)
      if(member.revision!==roster.revision || member.member.active){state.uncertain=true;throw new Error('课程成员或名单版本已变化，请重新读取名单')}
      const response=await readStudent(studentId,op.signal);if(!op.current())return false
      const person=validatedTeachingStudent(response.data,studentId)
      if(person.status!=='ACTIVE')throw new Error('该同学已离校，先到“转班、离校与复学”核对复学；此处不会自动恢复学籍')
      if(person.classId!==member.member.adminClassId || person.name!==member.member.name || person.studentNumber!==member.member.studentNumber)throw new Error('学生当前信息已变化，请重新读取名单核对')
      state.reenrollmentPreview={owner:principal,courseId:roster.courseId,studentId,revision:roster.revision,person,reason:reason.trim(),requestId:crypto.randomUUID(),expiresAt:clock()+300000}
      return true
    }catch(e){if(op.current())state.error=e.response?.data?.message || e.message || '重新选课核对失败';return false}
    finally{if(op.current())state.loading=false}
  }
  async function reenroll(studentId,reason) {
    const preview=state.reenrollmentPreview,roster=state.roster
    if(state.saving || state.loading || state.uncertain || !preview || preview.owner!==owner() || !roster || preview.courseId!==roster.courseId || preview.revision!==roster.revision || preview.studentId!==studentId || preview.reason!==reason.trim())return false
    if(clock()>=preview.expiresAt){state.error='本次核对已超过5分钟，请重新核对，不直接提交';invalidateReenrollment();return false}
    const op=operation();state.saving=true;state.error='';state.notice=''
    let acknowledged=false
    try{
      const input={requestId:preview.requestId,revision:preview.revision,studentRevision:preview.person.revision,expectedClassId:preview.person.classId,reason:preview.reason}
      const {data}=await writeReenrollment(preview.courseId,studentId,input,op.signal);if(!op.current())return false
      state.uncertain=true
      if(!data || data.requestId!==preview.requestId || data.courseId!==preview.courseId || data.studentId!==studentId || data.classId!==preview.person.classId || data.revision!==preview.revision+1 || data.studentRevision!==preview.person.revision || !Number.isSafeInteger(data.affectedLessons) || data.affectedLessons<1 || data.affectedLessons>30)throw new Error('重新选课回执不完整，请重新读取核对，不自动重发')
      acknowledged=true;state.notice=`重新选课已保存，联动 ${data.affectedLessons} 项未来安排；历史记录保留。`
      const verified=await readMember(preview.courseId,studentId,op.signal);if(!op.current())return false
      const currentMember=memberReceipt(verified.data,preview.courseId,studentId)
      if(currentMember.revision<data.revision || !currentMember.member.active)throw new Error('最新成员状态与选课回执不一致')
      const currentPerson=await readStudent(studentId,op.signal);if(!op.current())return false
      const person=validatedTeachingStudent(currentPerson.data,studentId)
      if(person.status!=='ACTIVE' || person.revision!==preview.person.revision || person.classId!==preview.person.classId)throw new Error('保存后学籍状态已有变化，请重新核对')
      const query=state.pagination,next=await readPage(preview.courseId,query?.page || 0,query?.search || '',op.signal);if(!op.current())return false
      const current=validatedCourseRosterPage(next.data,preview.courseId,query?.page || 0,query?.search || '').roster
      if(current.revision<data.revision)throw new Error('最新名单尚未刷新')
      state.roster=current;state.pagination=next.data;state.reenrollmentPreview=null;state.uncertain=false;return true
    }catch(e){if(op.current()){state.uncertain=true;state.error=acknowledged?'重新选课已保存，但最新状态未确认，请重新读取；不要重复提交。':e.response?.data?.message || e.message || '选课结果尚未确认，请重新读取后核对'}return false}
    finally{if(op.current())state.saving=false}
  }
  return {reset,load,withdraw,prepareReenrollment,reenroll,invalidateReenrollment}
}
