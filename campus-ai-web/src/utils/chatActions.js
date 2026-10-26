import { normalizeCourse,normalizeCourses,validateCourseMetadata,courseKey,parseCourseWeeks,courseTimeLabel } from './courseSchedule.js'
import { validatedCourseSnapshot } from './privateCourseSchedule.js'
import { validatedDetailPage,ATTENDANCE_STATUSES,teachingDate,teachingClock } from './teaching.js'
import { resolveLessonChangeAction } from './lessonChangeChat.js'
import { resolveAttendanceAction,unresolvedPrivateAction,explanatoryActionRequest,knowledgeSpeech } from './attendanceActionIntent.js'

// This is an allowlisted UI dispatcher, not model-generated SQL or an authorization decision.
function courseOwnership(input) {
  const target=input.replace(/[《“「"]([^》”」"]*)[》”」"]/g,'')
  const teacherQualifier=/(?:^|[\s，,；;])(?:授课)?(?:教师|老师)\s*[:：]?\s*\S+|(?:^|[\s，,；;])[^\s，,；;]{1,30}(?:老师|教师)(?:$|[\s，,；;])/.test(target)
  const formal=/班级|任课|教学安排/.test(target)||teacherQualifier||/(?:给|为)[^，,;；。\n]{1,50}(?:老师|教师|班)[^，,;；。\n]{0,30}(?:新增|新建|创建|添加|增加|加一门|加门)/.test(target)
  const personal=/我的(?:个人)?课表|本人课表|我自己的课表/.test(target)
  if(formal&&personal)return'CLARIFY_ACTION'
  const recipient=/(?:给|为)\s*(.{1,35}?)(?=新增|新建|创建|添加|增加|加一门|加门)/.exec(target)?.[1]?.trim()
  if(!formal&&recipient&&!/^(?:我|本人|自己|我自己|我的(?:个人)?课表)$/.test(recipient))return'CLARIFY_ACTION'
  return formal?'TEACHING_COURSE':'PERSONAL_COURSE'
}
export function resolveChatAction(text) {
  if(typeof text!=='string')return null
  const raw=text.trim(),probe=raw.slice(0,10000).replace(/^(?:你好|您好)[，,！!。\s]*/,''),explicit=/^(?:(?:请|麻烦你?|帮我|帮忙|我想要?|我需要|现在|先|再|为我)\s*)*(?:新增|新建|创建|添加|增加|加一门|加门|安排一门|修改|更新|修订|编辑|补充|记录|登记|更正|把|将|给)/.test(probe)
  if(explanatoryActionRequest(raw))return null
  if(!explicit&&/(?:如何|怎么|为什么|假如|如果|不要|不能|不许|别把)/.test(probe))return null
  if(/^(?:(?:请|帮我|帮忙)\s*)*(?:修改|更新|编写|编辑|重写)(?:一下)?(?:这段|下面|以下|这份)?(?:代码|函数|接口|脚本|程序|组件)/.test(probe))return null
  const knowledge=knowledgeSpeech(raw);if(knowledge!==undefined)return knowledge
  const attendance=resolveAttendanceAction(raw);if(attendance)return attendance
  const lessonChange=resolveLessonChangeAction(text);if(lessonChange)return lessonChange
  // Detect the operation before bounding seed extraction. Long/JSON-shaped mutations stay local.
  if(raw.length>800||/[`{}]/.test(raw)) {
    if(/^(?:(?:请|帮我|帮忙)\s*)*(?:查|查看|查询|看一下|统计|汇总)/.test(probe)&&/考勤|旷课|早退|出勤/.test(probe))return{kind:'ATTENDANCE_QUERY',seed:{search:'',student:''}}
    if(!explicit)return null
    if(/(?:知识库|资料|公告)/.test(probe))return{kind:'KNOWLEDGE',seed:{mode:/^(?:请|帮我|麻烦你?)?\s*(?:新增|添加|创建|新建)/.test(probe)?'CREATE':'REVISE',search:''}}
    if(/考勤|旷课|早退|出勤|按时/.test(probe))return{kind:'ATTENDANCE',seed:{student:'',status:'',course:''}}
    if(/课|教学安排/.test(probe))return{kind:courseOwnership(probe),seed:{}}
    return{kind:'CLARIFY_ACTION',seed:{}}
  }
  const input=raw,quoted=/[《“「"]([^》”」"]{1,100})[》”」"]/.exec(input)?.[1]||''
  if(/^(?:记录|修改|登记|更正)考勤[。！!？?]?$/.test(input))return{kind:'ATTENDANCE',seed:{student:'',status:'',course:''}}
  if(/(?:新增|新建|创建|添加|增加|加一门|加个|加门|安排一门).*(?:课|教学安排)|(?:课表|课程).*(?:加一门|新增|添加)/.test(input)) {
    const seed={name:quoted||/新增课程\s*[:：]?\s*(.*?)(?=\s*(?:星期|周[一二三四五六日天1-7]|教室|地点|教师|老师|授课|任课|班级|第\d|\d{1,2}[:：])|[，,；;。]|$)/.exec(input)?.[1]?.trim()||''}
    const weekday=/(?:周|星期)([一二三四五六日天1-7])/.exec(input)?.[1]
    if(weekday)seed.weekday=Number(weekday)||'一二三四五六日'.indexOf(weekday==='天'?'日':weekday)+1
    const clock=/(\d{1,2})[:：](\d{2})\s*[-—–~至到]\s*(\d{1,2})[:：](\d{2})/.exec(input)
    if(clock){seed.startTime=clock[1].padStart(2,'0')+':'+clock[2];seed.endTime=clock[3].padStart(2,'0')+':'+clock[4]}
    const period=/第?(\d{1,2})\s*[-—至到]\s*(\d{1,2})节/.exec(input)
    if(period&&!clock){seed.startPeriod=Number(period[1]);seed.endPeriod=Number(period[2])}
    seed.weeks=/(?:第)?(\d{1,2}(?:\s*[-至~]\s*\d{1,2})?[单双]?)周/.exec(input)?.[1]||''
    seed.room=/(?:教室|地点)\s*[:：]?\s*([^，,；;。\s]{1,100})/.exec(input)?.[1]||''
    const kind=courseOwnership(input)
    if(kind==='TEACHING_COURSE')seed.instructions=input
    return{kind,seed}
  }
  if(/(?:设为|设置为|设置成|改成|改为|记为|记成|标记为|标为|登记为).*(?:旷课|早退|按时|出勤)/.test(input)) {
    const name=/(?:把|将|给)\s*(.{1,40}?)(?:同学)?\s*(?:设为|设置为|设置成|改成|改为|记为|记成|标记为|标为|登记为)/.exec(input)?.[1]?.trim()||''
    return{kind:'ATTENDANCE',seed:{student:name,status:/早退/.test(input)?'EARLY_LEAVE':/旷课/.test(input)?'ABSENT':'ON_TIME',course:quoted}}
  }
  if(/(?:修改|更正|登记|记录|标记|设置).*(?:考勤|旷课|出勤|早退)/.test(input))return{kind:'ATTENDANCE',seed:{student:'',status:'',course:quoted}}
  if(/(?:新增|添加|更新|修改|修订|补充|编辑|改一下).*(?:知识库|资料|公告)|(?:知识库).*(?:修改|更新|添加|修订|编辑|改一下|改为|改成)/.test(input))return{kind:'KNOWLEDGE',seed:{mode:/新增|添加/.test(input)?'CREATE':'REVISE',search:quoted}}
  if(/(?:查|看|统计|汇总|多少).*(?:考勤|旷课|早退|出勤)/.test(input))return{kind:'ATTENDANCE_QUERY',seed:{search:quoted,student:/(?:查(?:一下)?|查看|看看|看一下)\s*(.{1,30}?)的考勤/.exec(input)?.[1]?.trim()||''}}
  return unresolvedPrivateAction(raw)
}

export function personalCoursePlan(form,raw) {
  const previous=validatedCourseSnapshot(raw)
  if((previous?.revision||0)!==form.revision)throw new Error('课表已在另一处更新，请重新读取后核对；未合并到未知版本')
  const course=normalizeCourse({...form.course,weeks:parseCourseWeeks(form.course.weeks)})
  if(previous?.courses.some(c=>courseKey(c)===courseKey(course)))throw new Error('这项课程已在本人课表中，不必重复添加')
  const metadata=previous||{semester:form.semester,firstMonday:form.firstMonday,remindDays:7}
  validateCourseMetadata(metadata)
  const payload={revision:previous?.revision||0,semester:metadata.semester,firstMonday:metadata.firstMonday,remindDays:metadata.remindDays,courses:normalizeCourses([...(previous?.courses||[]),course])}
  return{kind:'PERSONAL_COURSE',payload,course,title:'添加到本人的课表',lines:[`${course.name} · 周${'一二三四五六日'[course.weekday-1]} ${courseTimeLabel(course)}`,`教室：${course.room||'未填写'}；第${course.weeks.join('、')}周`,`${payload.semester}；第1周周一 ${payload.firstMonday}`,`保留已有${previous?.courses.length||0}项安排，新增1项；不影响班级教学安排。`]}
}
export function attendancePlan(input,page) {
  validatedDetailPage(page,input.lessonId,input.page,input.search)
  const detail=page.detail,entry=detail.entries.find(e=>e.studentId===input.studentId)
  if(!detail.canMark||!entry||detail.lesson.revision!==input.revision||entry.studentNumber!==input.studentNumber||entry.name!==input.studentName)throw new Error('点名目标、权限或版本已变化，请重新选择课程和同学')
  if(!['ON_TIME','ABSENT','EARLY_LEAVE'].includes(input.status))throw new Error('请选择按时、旷课或早退')
  if(input.status!=='ON_TIME'&&!detail.canRecordAbsence)throw new Error('尚未开课，不能记录旷课或早退')
  if(entry.status===input.status)throw new Error('当前已经是这个状态，没有重复写入')
  const reason=String(input.reason||'').trim()
  if(reason.length>300||((entry.status!=='UNKNOWN'||detail.lesson.finalized)&&!reason))throw new Error('更正已有记录必须填写原因，最多300字')
  return{kind:'ATTENDANCE',id:input.lessonId,page:input.page,search:input.search,studentId:entry.studentId,status:input.status,payload:{revision:detail.lesson.revision,marks:[{studentId:entry.studentId,status:input.status}],reason,finish:false},title:'核对一名同学的考勤',lines:[`${detail.lesson.course} · ${detail.lesson.className}`,`${teachingDate(detail.lesson.startsAt)} ${teachingClock(detail.lesson.startsAt)} · ${detail.lesson.room}`,`${entry.name}（${entry.studentNumber}）：${ATTENDANCE_STATUSES[entry.status]} → ${ATTENDANCE_STATUSES[input.status]}`,reason?`原因：${reason}`:'请确认你已核对本节实际到课情况；系统不根据聊天推断旷课。','只修改这一节、这一人；更正保留原记录，不替你完成整班点名。']}
}
const documentFields=['title','category','sourceDepartment','sourceUrl','publishedAt','effectiveAt','expiresAt','content']
export function knowledgePlan(input,current,schoolId) {
  if(!input.publicConsent)throw new Error('先核对这是可公开的本校资料，不含私人课表、名单或考勤')
  const payload={...input.document,schoolId}
  if(!payload.title?.trim()||payload.title.length>200||!payload.category?.trim()||payload.category.length>50||!payload.content?.trim()||payload.content.length>100000)throw new Error('填写标题、分类及正文，正文不超过10万字')
  if(payload.sourceUrl&&!/^https?:\/\/\S+$/.test(payload.sourceUrl))throw new Error('来源链接须为http或https地址')
  if(input.mode==='REVISE') {
    if(!current||current.id!==input.documentId||current.schoolId!==schoolId||current.status!=='PUBLISHED'||current.hasSuccessor||current.revisionTag!==input.revisionTag)throw new Error('知识资料或版本已变化，不能覆盖；请重新读取')
    payload.expectedRevisionTag=current.revisionTag
    if(documentFields.every(k=>(k==='content'?current.rawContent:current[k])===payload[k]))throw new Error('正文和资料信息没有变化，不必创建新版本')
  }
  return{kind:'KNOWLEDGE',mode:input.mode,id:input.documentId,payload,title:input.mode==='REVISE'?'修订本校公共知识资料':'发布本校公共知识资料',lines:[payload.title,`分类：${payload.category}；来源：${payload.sourceUrl||'管理员提供，无外部来源链接'}`,`正文${payload.content.length}字；${input.mode==='REVISE'?'原版本归档并保留，生成新版本':'审核确认后对本校用户公开'}`,'不是私人数据存储入口。请核读下方正文后再确认发布。']}
}

// Every data dependency is an existing, authenticated, scope-checked business endpoint.
export function createChatActionResource({owner,state,api,now=Date.now}) {
  let generation=0,controller,plan
  function reset(){generation++;controller?.abort();plan=null;Object.assign(state,{busy:false,phase:'editing',preview:null,error:'',notice:''})}
  function invalidate(){if(state.busy||state.phase==='uncertain'||state.phase==='saved')return;generation++;controller?.abort();plan=null;state.preview=null;state.phase='editing';state.error=''}
  function start(){controller?.abort();controller=new AbortController();const epoch=++generation,principal=owner(),signal=controller.signal;state.busy=true;state.error='';return{signal,current:()=>!!principal&&owner()===principal&&generation===epoch&&!signal.aborted}}
  async function preview(input) {
    if(state.busy||state.phase==='uncertain'||state.phase==='saved'||!owner())return false
    plan=null;state.preview=null;const op=start()
    try {
      let next
      if(input.kind==='PERSONAL_COURSE')next=personalCoursePlan(input.form,(await api.readSchedule(op.signal)).data.schedule)
      else if(input.kind==='ATTENDANCE')next=attendancePlan(input,(await api.readDetail(input.lessonId,'TEACHER',input.page,input.search,op.signal)).data)
      else if(input.kind==='KNOWLEDGE')next=knowledgePlan(input,input.mode==='REVISE'?await api.readDocument(input.documentId,{signal:op.signal}):null,input.schoolId)
      else throw new Error('不支持这类写入；未执行操作')
      if(!op.current())return false
      plan={...next,expires:now()+300000};state.preview={title:next.title,lines:next.lines};state.phase='preview';return true
    } catch(e){if(op.current()){state.phase='editing';state.error=e.response?.data?.message||e.message||'预览失败，未保存'}return false}
    finally{if(op.current())state.busy=false}
  }
  async function execute() {
    if(state.busy||state.phase!=='preview'||!plan||!owner())return false
    if(now()>plan.expires){invalidate();state.error='预览已超过5分钟，请重新核对';return false}
    const selected=plan,op=start();state.phase='saving'
    try {
      if(selected.kind==='PERSONAL_COURSE') {
        const saved=validatedCourseSnapshot((await api.saveSchedule(selected.payload,op.signal)).data.schedule)
        if(!saved||saved.revision!==selected.payload.revision+1||saved.semester!==selected.payload.semester||saved.firstMonday!==selected.payload.firstMonday||saved.courses.length!==selected.payload.courses.length||!selected.payload.courses.every(c=>saved.courses.some(s=>courseKey(c)===courseKey(s))))throw new Error('课表保存回执不一致')
      } else if(selected.kind==='ATTENDANCE') {
        const page=validatedDetailPage((await api.saveMarks(selected.id,selected.payload,selected.page,selected.search,op.signal)).data,selected.id,selected.page,selected.search)
        if(page.detail.lesson.revision!==selected.payload.revision+1||page.detail.entries.find(e=>e.studentId===selected.studentId)?.status!==selected.status)throw new Error('考勤保存回执目标或版本不一致')
      } else {
        const ack=selected.mode==='REVISE'?await api.reviseDocument(selected.id,selected.payload,{signal:op.signal}):await api.importDocument(selected.payload,{signal:op.signal})
        if(!Number.isSafeInteger(ack?.documentId)||ack.documentId<1||typeof ack.duplicate!=='boolean'||(selected.mode==='REVISE'&&!ack.duplicate&&!ack.metadataUpdated&&ack.documentId===selected.id))throw new Error('知识资料发布回执异常')
        selected.duplicate=ack.duplicate
      }
      if(!op.current())return false
      state.phase='saved';state.notice=selected.duplicate?'资料已存在，没有重复发布。':selected.kind==='PERSONAL_COURSE'?'课程已加入本人课表，原有安排保留。':selected.kind==='ATTENDANCE'?'这一人的考勤已保存；更正保留原记录与原因。':'知识资料已由管理员确认保存，原版本保留。';plan=null;return true
    } catch(e) {
      if(op.current()) {
        const code=e.response?.status,definite=code>=400&&code<500&&code!==408
        state.phase=definite?'editing':'uncertain';plan=null;state.preview=null
        state.error=definite?(e.response?.data?.message||e.message||'保存被拒绝，请重新核对'):'保存结果尚未核对。不要重复提交；请先在课表、考勤记录或管理后台检查。'
      }
      return false
    } finally{if(op.current())state.busy=false}
  }
  return{reset,invalidate,preview,execute}
}
