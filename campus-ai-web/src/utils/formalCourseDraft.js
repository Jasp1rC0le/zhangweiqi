import {parseCourseWeeks,validateCourseMetadata} from './courseSchedule.js'
import {isEnrollmentId} from './teachingIds.js'
import {validatedConfigPage} from './teachingConfigPage.js'
const time=v=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)
const plain=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&![...v].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)>=127&&c.charCodeAt(0)<=159)
export function formalMissingFields(form){const c=form.course;return[['classId','班级'],['teacherId','任课教师'],['name','课程名称'],['semester','学期'],['firstMonday','第1周周一'],['weekday','星期'],['startTime','开始钟点'],['endTime','结束钟点'],['weeks','上课周次'],['room','教室']].filter(([key])=>!String(c[key]??'').trim()).map(([,label])=>label).concat(form.rosterMode==='SELECTED'?[...(!form.groupName.trim()?['教学组名称']:[]),...(!form.students.length?['勾选名单']:[])]:[])}
export function formalWeeksLabel(weeks){const values=[...new Set(weeks)].sort((a,b)=>a-b);if(values.length>2&&values.every((v,i)=>!i||v-values[i-1]===2))return`${values[0]}-${values.at(-1)}${values[0]%2?'单':'双'}周`;const parts=[];let start=values[0],last=start;for(const v of values.slice(1)){if(v===last+1)last=v;else{parts.push(start===last?String(start):`${start}-${last}`);start=last=v}}if(start!=null)parts.push(start===last?String(start):`${start}-${last}`);return parts.join('、')+'周'}
export function formalCoursePayload(form){
  const c=form?.course
  if(!c||!isEnrollmentId(c.id)||!isEnrollmentId(c.classId)||!Number.isSafeInteger(Number(c.teacherId))||Number(c.teacherId)<1||!plain(c.name,100)||!plain(c.room,100)||!Number.isInteger(Number(c.weekday))||Number(c.weekday)<1||Number(c.weekday)>7||!time(c.startTime)||!time(c.endTime)||c.startTime>=c.endTime)throw new Error('先核对班级、任课教师、课程名称、星期、起止钟点和教室')
  validateCourseMetadata({semester:c.semester,firstMonday:c.firstMonday,remindDays:7})
  if(!['CLASS','SELECTED'].includes(form.rosterMode))throw new Error('请选择整班或逐人名单')
  const ids=(form.students||[]).map(s=>s.id).sort()
  if(form.rosterMode==='SELECTED'&&(!plain(form.groupName,100)||!ids.length||ids.length>2000||new Set(ids).size!==ids.length||ids.some(id=>!isEnrollmentId(id))))throw new Error('选修或合班需填写教学组，并明确选择1至2000名同学')
  return{course:{id:c.id,classId:c.classId,teacherId:Number(c.teacherId),name:c.name.trim(),semester:c.semester.trim(),firstMonday:c.firstMonday,weekday:Number(c.weekday),startTime:c.startTime,endTime:c.endTime,weeks:parseCourseWeeks(Array.isArray(c.weeks)?c.weeks.join(';'):c.weeks),room:c.room.trim()},rosterMode:form.rosterMode,groupName:form.rosterMode==='SELECTED'?form.groupName.trim():'',studentIds:form.rosterMode==='SELECTED'?ids:[]}
}
export async function resolveFormalTarget(kind,literal,read,signal){
  const value=literal.trim(),byId=kind==='TEACHER'?/^[1-9]\d{0,15}$/.test(value):isEnrollmentId(value)
  const q={kind,page:0,size:25,search:byId?'':value.split(' · ').at(-1),selected:byId?value:''}
  const data=validatedConfigPage((await read(q,signal)).data,q)
  const matches=byId?data.selected?[data.selected]:[]:data.items.filter(r=>[r.label,r.description,`${r.description} · ${r.label}`].includes(value))
  if(matches.length!==1||!byId&&data.total>data.items.length)throw new Error(`${kind==='TEACHER'?'教师':'班级'}“${value}”不是唯一已核实目标，请在授权选择器按账号或学院核对；其余草稿未改变`)
  return matches[0]
}
function checkedPreview(v,payload){
  if(!v||v.id!==payload.course.id||v.rosterMode!==payload.rosterMode||v.groupName!==payload.groupName||!plain(v.classLabel,220)||!plain(v.teacherLabel,150)||!/^[a-f0-9]{64}$/.test(v.fingerprint)||!Number.isSafeInteger(v.members)||v.members<0||v.members>2000)throw new Error('教学预览目标或校验响应异常，未允许保存')
  return v
}
export function createFormalCourseResource({owner,state,preview,create,read,now=Date.now}){
  let epoch=0,controller,prepared,pending,disposed=false
  function reset(){epoch++;controller?.abort();prepared=null;pending=null;Object.assign(state,{busy:false,phase:'editing',preview:null,error:'',notice:'',canRetry:false})}
  function invalidate(){if(!state.busy&&!['uncertain','saved'].includes(state.phase)){prepared=null;state.preview=null;state.phase='editing';state.error=''}}
  async function run(work){if(disposed||!owner()||state.busy)return false;controller=new AbortController();const principal=owner(),op={signal:controller.signal,epoch:++epoch,owner:principal};op.current=()=>!disposed&&owner()===principal&&op.epoch===epoch&&!op.signal.aborted;state.busy=true;state.error='';try{return await work(op)}catch(e){if(op.current())state.error=e.response?.data?.message||e.message||'读取失败，请保留草稿后重试';return false}finally{if(op.current())state.busy=false}}
  async function reconcile(op){if(!pending)return false;try{const v=(await read(pending.payload.course.id,op.signal)).data;if(!op.current())return false;if(v?.course?.id!==pending.payload.course.id||v.fingerprint!==pending.target.fingerprint)throw new Error('已保存课程与原请求内容不一致，未冒认本次成功');state.phase='saved';state.preview=null;state.notice=`教学课程“${pending.payload.course.name}”已回读核对。课程、名单与整学期安排已保存；没有覆盖既有课程。`;pending=null;prepared=null;state.canRetry=false;return true}catch(e){if(op.current()&&e.response?.status===404){state.canRetry=true;state.phase='uncertain';state.error='暂未查到原课程，不代表在途保存没有执行。只能明确重试同一编号和原内容。';return false}throw e}}
  async function persist(op,plan){pending=plan;prepared=null;state.preview=null;state.phase='uncertain';state.canRetry=false;let acknowledged=false;try{const response=await create(plan.payload,op.signal);if(!op.current())return false;if(response?.data?.id!==plan.payload.course.id)throw new Error('保存回执编号不一致，请先核对原课程');acknowledged=true;return await reconcile(op)}catch(e){if(op.current()&&!acknowledged&&[400,403,409,422].includes(e.response?.status)){pending=null;state.phase='editing'}throw e}}
  return{
    prepare:form=>run(async op=>{if(['uncertain','saved'].includes(state.phase))throw new Error('先核对上一次操作，不创建第二次保存');const payload=formalCoursePayload(form),target=checkedPreview((await preview(payload,op.signal)).data,payload);if(!op.current())return false;prepared={owner:op.owner,payload:structuredClone(payload),target,expiresAt:now()+300000};state.preview={...target,course:payload.course,expiresAt:prepared.expiresAt};state.phase='preview';return true}),
    execute:()=>run(async op=>{const p=prepared;if(!p||p.owner!==op.owner||now()>=p.expiresAt){prepared=null;state.preview=null;state.phase='editing';throw new Error('预览已过期或变化，请重新核对')}const current=checkedPreview((await preview(p.payload,op.signal)).data,p.payload);if(!op.current())return false;if(JSON.stringify(current)!==JSON.stringify(p.target)){prepared=null;state.preview=null;state.phase='editing';throw new Error('教师、班级或名单已变化，请重新预览')}return persist(op,p)}),
    reconcile:()=>run(reconcile),
    retry:()=>run(async op=>{if(!pending||!state.canRetry)throw new Error('先核对原课程结果');if(await reconcile(op))return true;if(!op.current()||!state.canRetry||!pending)return false;return persist(op,pending)}),
    invalidate,reset,dispose(){reset();disposed=true},
  }
}
