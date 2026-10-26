import {calendarRangeForText} from './scheduleIntent.js'
import {dayNumber} from './timetable.js'
import {planPrivateCourseExport} from './privateCourseExportIntent.js'
import {resolveScheduleFileRequest,scheduleExportRoute} from './scheduleFileIntent.js'
import {resolveScheduleManagement} from './scheduleManagementIntent.js'
import {scheduleSourceLookup} from './scheduleSourceLookup.js'
import {isEnrollmentId} from './teachingIds.js'
export const TEACHING_WORKFLOWS=Object.freeze({
  ROLL_CALL:{title:'任课课程点名',tool:'roll-call',admin:false,action:'选择任课课程并点名',description:'先核对当前账号的任课权限，再选具体课程和节次。仅打开名单，不默认按时、不自动保存；学生和未绑定教师不能借此进入点名。'},
  PERSONAL_MANAGE:{title:'管理本人导入课表',path:'/timetable',tool:'personal-manage',admin:false,action:'打开个人课表更新与比较',description:'读取本人已保存的导入副本，上传新表并核对差异后人工确认。与学校正式教学安排、名单和考勤分开，不会自动覆盖或删除。'},
  PERSONAL_OPERATIONS:{title:'本人课表单日、批量与历史',path:'/timetable',tool:'personal-operations',admin:false,action:'选择本人安排并预览修改',description:'支持单日、多个安排、跨学期、逐项删除和历史恢复。先选准保存来源、填写原因、预览并确认，不改正式教学或考勤。'},
  PERSONAL_SOURCES:{title:'查找已保存课表',path:'/timetable',admin:false,action:'打开课表与来源',description:'课程、旧图片和修改历史分开保存。在课表页展开“取回以前保存的原件”可下载旧图；通过“修改个人安排”查看本人历史。打开入口不会恢复或修改课程。'},
  SCHEDULE_SOURCE:{title:'先核对要改哪份课表',admin:false},
  FORMAL_CHANGE:{title:'修改正式教学安排',admin:true},
  EVIDENCE:{title:'考勤记录与范围导出',tool:'evidence',admin:false,action:'打开考勤记录与导出',description:'先核对身份、日期和班级，再读取完整范围或准备CSV；下载不等于归档。'},
  MANAGEMENT_HISTORY:{title:'管理操作历史',tool:'management-history',admin:true,action:'打开管理历史与导出',description:'正常本校管理员核对完整范围后准备CSV，下载时重新鉴权校验；不修改人员，下载不等于归档。'},
  LIFECYCLE:{title:'转班、离校与复学',tool:'lifecycle',admin:true,action:'打开学籍调整核对',description:'到原业务入口选择学生、明确目标和原因，再预览确认；不会仅按姓名认领人员。'},
  COURSE_MEMBERS:{title:'课程退课与重新选课',tool:'course-members',admin:true,action:'打开课程名单调整',description:'核对原课程、具体学生、学籍和名单版本。重新选课不补造过去考勤。'},
  COURSE_SOURCE:{title:'核定历史课程类型',tool:'course-source',admin:true,action:'打开课程来源核定',description:'先核对原课程和有效名单，再明确整班或逐人来源；不重写原名单和历史考勤。'},
  ACCOUNT_BINDING:{title:'核对学生账号绑定',tool:'account-binding',admin:true,action:'打开学生账号绑定',description:'按行政班读取名单，核实账号编号后明确绑定；姓名和自称身份不授予权限。'},
  RESPONSIBILITY:{title:'辅导员与书记负责范围',tool:'responsibility',admin:true,action:'打开负责范围配置',description:'教学身份审核与负责班级/学院分开核定，不把教师或领导身份当作平台管理员。'},
  IDENTITY_APPLICATION:{title:'申请教学身份',path:'/account',hash:'#teaching-identity',admin:false,action:'打开教学身份申请',description:'教师、辅导员和书记需管理员审核；通过身份后还需明确课程、班级或学院范围。'},
  IDENTITY_REVIEW:{title:'审核教学身份',path:'/admin',tool:'identity-review',admin:true,action:'打开教学身份审核',description:'经正常管理员会话核读申请再决定；聊天不会直接通过申请或改变平台角色。'},
  TIMETABLE:{title:'本人已保存的课表',path:'/timetable',admin:false,action:'打开我的课表',description:'可查看、导入或下载本人已保存的JSON课表。导出先重新读取和核验，不包含教学名单、考勤或未保存草稿，也不是实时教务同步。'},
  RETENTION:{title:'一年保留与归档核验',tool:'evidence',admin:false,action:'打开到期核验与导出',description:'已实现一年到期候选和校验导出；持久归档存储、恢复和删除流程尚未启用，不会因聊天请求删除历史。'},
  PRIVILEGE:{title:'平台权限不能在聊天中授予',admin:true,description:'不能通过自选身份、聊天、自称或同名匹配授予平台管理员。教学身份和负责范围须走现有正常审核。'},
})
const dateWorkflows=new Set(['EVIDENCE','MANAGEMENT_HISTORY','RETENTION','ROLL_CALL'])
export function previousTeachingWorkflow(messages,scope){
  if(!scope)return null
  const last=[...(messages||[])].reverse().find(m=>m.role==='assistant')
  if(last?.workflowContext?.scope===scope)return last.workflowContext
  if(last?.localAction&&['ATTENDANCE','ATTENDANCE_QUERY'].includes(last.action?.kind))return{workflow:'EVIDENCE',scope}
  if(last?.localSchedule&&last.scheduleQuery?.scope===scope)return{workflow:'TIMETABLE',scope,from:last.scheduleQuery.from,to:last.scheduleQuery.to,scheduleRead:true}
  return null
}
export function resolveTeachingWorkflow(text,{today,previous=null,scope=''}={}){
  if(typeof text!=='string'||!text.trim())return null
  const raw=text.normalize('NFKC').trim(),probe=(raw.slice(0,10000)+' '+(raw.length>10000?raw.slice(-1000):'')).replace(/[《“「"]([^》”」"]*)[》”」"]/g,'').trim()
  if(/(?:编写|写一个|写一段|开发|设计|实现|解释|讲解|调试|优化).{0,16}(?:代码|算法|函数|接口|脚本|程序|组件|SQL)/i.test(probe))return null
  const prior=previous?.scope===scope?previous:null
  const management=resolveScheduleManagement(text,{previous:prior,scope});if(management)return management
  const fileRequest=resolveScheduleFileRequest(raw,{today,previous:prior?.pendingScheduleExport||(prior?.scheduleExport?prior.exportPreset:prior?.personalExport?{source:'PERSONAL',format:'JSON',scope:'AUTHORIZED'}:null)});if(fileRequest)return{workflow:'TIMETABLE',...fileRequest}
  const supplementalExport=prior?.pendingPrivateExport?planPrivateCourseExport(raw,{today,previous:prior.pendingPrivateExport}):null
  if(supplementalExport)return{workflow:'TIMETABLE',...supplementalExport}
  if(/^(?:请)?(?:不要|不用|不必|别)/.test(probe))return null
  const privateTopic=/考勤|出勤|旷课|早退|迟到|点名|学籍|绑定|教学身份|课程来源|选课名单/.test(probe),command=/请|帮我|给我|我要|我想|打开|查|看|谁|导出|下载|生成|把|将|设为|设置|核定|更正|办理|申请|审核|配置|绑定|转班|离校|复学|重新选课/.test(probe)
  if(/政策|制度|规定|流程|申请条件|有什么要求|需要什么材料|怎么申请|如何申请|怎么办理|如何办理/.test(probe)&&!/(?:帮我|请帮|现在就|直接).*(?:办理|修改|审核|设置|把|将|导出)/.test(probe))return null
  const privateExport=(/课表|课程表|课程安排/.test(probe)||raw.length>10000&&/课表|课程表|课程安排/.test(raw))?planPrivateCourseExport(raw,{today}):null
  if(privateExport)return{workflow:'TIMETABLE',...privateExport}
  // Resolve explicit mutations/exports first; a source reference must not turn
  // an existing change or backup request into read-only navigation.
  const sourceLookup=scheduleSourceLookup(raw,prior);if(sourceLookup)return sourceLookup
  if(prior?.workflow==='PERSONAL_SOURCES'&&prior.awaitingScheduleDate&&calendarRangeForText(raw,{today}).explicit)return null
  let workflow='',kind='ATTENDANCE',expiredOnly=false
  if(prior?.awaitingTarget&&/^(?:我要|就是|查|看|导出|的|我|本人|这周|上周|下周|今天|昨天|考勤|出勤|记录|明细|\s|[？?。!！])+$/u.test(probe)&&/考勤|出勤/.test(probe))workflow='EVIDENCE'
  else if(prior?.awaitingTarget&&/课表/.test(probe))workflow='TIMETABLE'
  else if(/(?:设为|设成|改为|改成|授予|给我|开通).{0,20}(?:平台)?管理员(?:权限|身份|账号)?/.test(probe))workflow='PRIVILEGE'
  else if(/(?:删除|清空|清除|永久删除|归档|备份|恢复备份).*(?:考勤|记录|历史)|(?:考勤|记录|历史).*(?:归档|备份|删除)|考勤.*保存多久/.test(probe)){workflow='RETENTION';expiredOnly=/到期|一年|过期/.test(probe)}
  else if(/管理审计|操作历史|操作记录|绑定历史|绑定记录|学籍变更记录|身份审核记录|来源核定记录|(?:转班|离校|复学|选课|调课|代课|停课|课程变更)(?:的)?(?:记录|历史|审计)|谁.*(?:绑定|转班|复学|撤销身份|修改.*课程|调整.*课程)/.test(probe)&&command)workflow='MANAGEMENT_HISTORY'
  else if(/(?:核定|确认|设置|修改|改为|改成).*(?:课程(?:来源|类型)|整班|逐人)|(?:课程来源|历史课程类型).*(?:核定|确认|修改|查|看)/.test(probe))workflow='COURSE_SOURCE'
  else if(/转班|离校|复学|恢复学籍|恢复在校/.test(probe)&&command)workflow='LIFECYCLE'
  else if(/退课|退选|重新选课|恢复选课|重新加入课程|重新加回课程/.test(probe)&&command)workflow='COURSE_MEMBERS'
  else if(/(?:绑定|解绑|重新绑定).*(?:账号|帐号|账户)|(?:学生|学号|账号|账户).*(?:绑定|解绑)/.test(probe)&&!/微信|邮箱|手机/.test(probe))workflow='ACCOUNT_BINDING'
  else if(/(?:配置|分配|调整|修改|绑定).*(?:导员|辅导员|书记).*(?:班|学院|范围|负责|权限)|(?:导员|辅导员|书记).*(?:负责范围|负责班级|负责学院).*(?:改|调|配|绑)/.test(probe))workflow='RESPONSIBILITY'
  else if(/(?:审核|批准|通过|驳回|拒绝|撤销|恢复).*(?:教学身份|教师身份|导员身份|辅导员身份|书记身份|身份申请)|(?:教师|导员|辅导员|书记).*(?:身份审核|申请审核)/.test(probe))workflow='IDENTITY_REVIEW'
  else if(/(?:申请|注册|我想当|成为).*(?:教师|导员|辅导员|书记)|教学身份申请/.test(probe))workflow='IDENTITY_APPLICATION'
  else if(/导出|下载|生成.*(?:报表|明细|CSV|Excel)|导一份/i.test(probe)){
    if(privateTopic)workflow='EVIDENCE'
    else if(/(?:我|本人|个人|自己的)?课表/.test(probe))workflow='TIMETABLE'
    else if(prior)workflow=prior.workflow==='TIMETABLE'?'TIMETABLE':['MANAGEMENT_HISTORY','ACCOUNT_BINDING','LIFECYCLE','IDENTITY_REVIEW','COURSE_SOURCE'].includes(prior.workflow)?'MANAGEMENT_HISTORY':'EVIDENCE'
    else if(/^(?:那|请|帮我|给我|我想|我要|能否|可以|也|再|一下|一份|导出|下载|表格|呢|吧|吗|\s|[？?。!！])+$/u.test(probe))return{workflow:'EVIDENCE',clarification:'要导出考勤记录，还是查看本人课表？请先明确对象；没有读取或生成文件。',awaitingTarget:true}
  }
  else if(/(?:考勤|点名|更正).*(?:历史|审计|变更|谁改)|(?:查|看).*(?:更正记录|点名变更)/.test(probe)){workflow='EVIDENCE';kind='AUDIT'}
  else if(/^(?:(?:请|帮我|麻烦你?|我想|我要)\s*)*(?:打开|进入|跳到)(?:我(?:自己)?的|本人(?:的)?|个人|自己的)?(?:课表|课程表)(?:页面|页)?[。！!？?]*$/.test(probe))workflow='TIMETABLE'
  else if(/点(?:一下|一遍|个)?名|点名名单/.test(probe)&&/开始|打开|我要|我想|帮我|进入|去点|进行|点一下名|点个名/.test(probe)&&!/设为|改为|记为|旷课|早退|出勤|按时|学号/.test(probe))workflow='ROLL_CALL'
  else if(prior&&probe.length<100&&(/历史|审计/.test(probe)||/^(?:那|再|然后|还有|就|仅|只|呢|吧|的|上|下|本|这|今|明|昨|前|后|周|天|月|日|号|星期|礼拜|一|二|三|四|五|六|七|八|九|十|两|\d|-|年|到|至|\s|[？?。!！])+$/u.test(probe))){if(prior.scheduleRead&&!/历史|审计/.test(probe))return null;workflow=prior.workflow;kind=prior.kind||'ATTENDANCE';if(/历史|审计/.test(probe)){workflow=prior.workflow==='EVIDENCE'?'EVIDENCE':'MANAGEMENT_HISTORY';if(workflow==='EVIDENCE')kind='AUDIT'}}
  if(!workflow)return null
  const result={workflow,kind,expiredOnly}
  if(workflow==='TIMETABLE'&&(/导出|下载/.test(probe)||prior?.awaitingTarget))result.personalExport=true
  if(dateWorkflows.has(workflow)){
    if(workflow==='MANAGEMENT_HISTORY'&&/导出|下载/.test(probe))result.notice='在管理历史里先读取并核对完整条件，再准备和下载CSV；是否开放导出由当前管理员权限与服务能力决定。'
    const dateText=probe.replace(/(?:已保存|历史|记录|个人|本人)/g,''),range=calendarRangeForText(dateText,{today,previous:prior?.workflow===workflow?prior:null,maxDays:31})
    if(range.clarification)result.clarification=range.clarification
    else {const todayOnly=workflow==='ROLL_CALL'&&!range.explicit&&!range.inherited;Object.assign(result,{from:todayOnly?today:range.from,to:todayOnly?today:range.to,dateNote:range.explicit?'已识别查询日期':range.inherited?'沿用当前追问的日期范围':todayOnly?'未指定日期，先打开今天；仍需选择具体节次':'未指定日期，先打开本周；可在页面调整'})}
  }
  return result
}
const validDay=v=>{try{return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(dayNumber(v))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v}catch{return false}}
export function teachingWorkflowDestination(value){
  const workflow=TEACHING_WORKFLOWS[value?.workflow];if(!workflow||value.clarification||value.handoff||['PRIVILEGE','SCHEDULE_SOURCE','FORMAL_CHANGE'].includes(value.workflow))return null
  const query={};if(workflow.tool)query.tool=workflow.tool
  if(value.workflow==='PERSONAL_SOURCES')query.queryView='STUDENT'
  if(value.workflow==='TIMETABLE'&&value.personalExport===true)query.tool='personal-export'
  if(value.workflow==='TIMETABLE'&&value.scheduleExport===true){const p=value.exportPreset,candidate={tool:'schedule-export',source:p?.source,format:p?.format,period:p?.period,from:p?.from,to:p?.to,scope:p?.scope,...(p?.view?{view:p.view}:{})};const checked=scheduleExportRoute(candidate);if(!checked||checked.error)return null;Object.assign(query,candidate)}
  if(dateWorkflows.has(value.workflow)){if(!validDay(value.from)||!validDay(value.to)||dayNumber(value.to)<dayNumber(value.from)||dayNumber(value.to)-dayNumber(value.from)>30)return null;query.from=value.from;query.to=value.to;if(!['MANAGEMENT_HISTORY','ROLL_CALL'].includes(value.workflow)){query.kind=value.kind==='AUDIT'?'AUDIT':'ATTENDANCE';if(value.expiredOnly===true)query.expiredOnly='1'}}
  return{path:workflow.path||'/teaching',query,...(workflow.hash?{hash:workflow.hash}:{})}
}
export function teachingWorkflowRoute(query){
  const tools=new Set(['evidence','management-history','lifecycle','course-members','course-source','account-binding','responsibility','identity-review','roll-call'])
  if(typeof query?.tool!=='string'||!tools.has(query.tool))return null
  const result={tool:query.tool}
  if(query.from!=null||query.to!=null){if(!validDay(query.from)||!validDay(query.to)||dayNumber(query.to)<dayNumber(query.from)||dayNumber(query.to)-dayNumber(query.from)>30)return{tool:query.tool,error:'链接中的日期无效或超过31天，请重新选择；未套用旧范围。'};result.from=query.from;result.to=query.to}
  if(query.tool==='evidence'&&query.classId!=null){if(!isEnrollmentId(query.classId)||!['COUNSELOR','SECRETARY'].includes(query.view)||!result.from||!result.to)return{tool:query.tool,error:'带入的班级、日期或查看身份无效，请回课表重新打开；未改查全部班级。'};result.classId=query.classId;result.view=query.view}
  result.kind=query.kind==='AUDIT'?'AUDIT':'ATTENDANCE';result.expiredOnly=query.expiredOnly==='1';return result
}
// A target can be mounted before its disclosure body, permission request and rows exist.
// No timer: wait for actual destination readiness and one real transition completion.
const pendingWorkflowFocus=new WeakMap()
export function cancelWorkflowFocus(element){if(element)pendingWorkflowFocus.get(element)?.()}
export function focusWorkflowElement(element,current=()=>true,observe=callback=>new MutationObserver(callback)){
  if(!element||!current())return false
  pendingWorkflowFocus.get(element)?.()
  const page=element.closest?.('.workspace-page'),eventTarget=page||element,cancellations=['campthink-workspace-cancelled','pointerdown','wheel','touchstart','keydown']
  let observer,finished=false
  const cleanup=()=>{if(finished)return;finished=true;observer?.disconnect();for(const name of cancellations)eventTarget.removeEventListener?.(name,cancel);page?.removeEventListener('campthink-workspace-ready',entered);pendingWorkflowFocus.delete(element)}
  const cancel=()=>cleanup()
  const apply=()=>{if(finished)return false;if(!current()){cleanup();return false}element.style.scrollMarginTop='90px';const focus=element.querySelector('summary')||element;if(focus.getAttribute('tabindex')==null&&focus.tagName!=='SUMMARY')focus.setAttribute('tabindex','-1');focus.focus({preventScroll:true});element.scrollIntoView({block:'start',behavior:'auto'});cleanup();return true}
  const waitForData=()=>{
    if(finished||!current()){cleanup();return false}
    if(element.tagName==='DETAILS')element.open=true
    const state=element.getAttribute?.('data-workflow-ready')
    if(state!=='waiting')return apply()
    observer=observe(()=>{if(!current()){cleanup();return}if(['ready','error'].includes(element.getAttribute('data-workflow-ready')))apply()})
    observer.observe(element,{attributes:true,attributeFilter:['data-workflow-ready']});return true
  }
  const entered=()=>{page.removeEventListener('campthink-workspace-ready',entered);waitForData()}
  pendingWorkflowFocus.set(element,cleanup)
  for(const name of cancellations)eventTarget.addEventListener?.(name,cancel,{once:true,passive:true})
  if(page&&(!page.isConnected||page.classList.contains('workspace-content-enter-active'))){page.addEventListener('campthink-workspace-ready',entered,{once:true});return true}
  return waitForData()
}
