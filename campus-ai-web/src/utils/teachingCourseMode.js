import {isEnrollmentId as uuid} from './teachingIds.js'
export const COURSE_MODES={LEGACY:'来源待核定',ADMIN_CLASS:'按行政班整班授课',EXPLICIT:'按逐人名单选课'}
const text=(v,max)=>typeof v==='string' && v.length<=max
const integer=v=>Number.isSafeInteger(v)&&v>=0
const positive=v=>Number.isSafeInteger(v)&&v>0
const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))
export function validatedCourseMode(data,id){
  const t=data?.target,review=data?.reviewRequestId
  if(!data || data.courseId!==id || !uuid(id) || !integer(data.revision) || !Object.hasOwn(COURSE_MODES,data.mode) ||
    !t || !text(t.name,100) || !t.name.trim() || !text(t.semester,100) || !text(t.teacher,100) || !text(t.room,100) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t.startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t.endTime) || !Number.isInteger(t.weekday) || t.weekday<1 || t.weekday>7 ||
    !text(data.groupName,100) || !uuid(data.adminClassId) || !text(data.adminClassName,100) || !text(data.college,100) || !integer(data.activeMembers) || data.activeMembers>2000 || !integer(data.outsideAdminClass) || data.outsideAdminClass>data.activeMembers || !integer(data.invalidActiveMembers) || data.invalidActiveMembers>data.activeMembers || !integer(data.futureLessons) ||
    !(review===null||uuid(review)) || !(data.reviewRevision===null||integer(data.reviewRevision)&&data.reviewRevision<=data.revision) || !(data.reviewedBy===null||positive(data.reviewedBy)) || !text(data.reviewReason,300) || !(data.reviewedAt===null||instant(data.reviewedAt)) ||
    (review && (data.mode==='LEGACY' || !integer(data.reviewRevision) || !positive(data.reviewedBy) || !data.reviewReason.trim() || !instant(data.reviewedAt))))throw new Error('课程来源或核定回执响应异常，请重新读取')
  return data
}
export const courseModeKey=data=>JSON.stringify([data.courseId,data.revision,data.mode,data.target,data.groupName,data.adminClassId,data.activeMembers,data.outsideAdminClass,data.invalidActiveMembers])
export function courseModePlan(data,mode,reason,requestId,actorId,now=Date.now()){
  validatedCourseMode(data,data.courseId)
  const why=typeof reason==='string'?reason.trim():''
  if(data.mode!=='LEGACY' || !['ADMIN_CLASS','EXPLICIT'].includes(mode) || !why || why.length>300 || !uuid(requestId) || !positive(actorId) || data.revision>=2147483647)throw new Error('先核对待定课程，明确类型并填写1至300字依据')
  if(data.invalidActiveMembers || mode==='ADMIN_CLASS'&&data.outsideAdminClass)throw new Error('名单行政归属或学籍未符合所选类型，请先核对；未提交')
  return{ownerActor:actorId,courseId:data.courseId,key:courseModeKey(data),expiresAt:now+300000,target:{...data.target},payload:Object.freeze({requestId,mode,revision:data.revision,reason:why})}
}
export function validatedModeReceipt(data,plan){
  const p=plan.payload
  if(!data || data.requestId!==p.requestId || data.courseId!==plan.courseId || data.mode!==p.mode || data.revision!==p.revision+1 || data.actorId!==plan.ownerActor || data.reason!==p.reason || !instant(data.reviewedAt))throw new Error('核定回执目标或内容不符，请读取状态核对；不自动重发')
  return data
}
export function modeMatchesRequest(data,plan){return data.mode===plan.payload.mode && data.reviewRequestId===plan.payload.requestId && data.reviewRevision===plan.payload.revision+1 && data.revision>=data.reviewRevision && data.reviewedBy===plan.ownerActor && data.reviewReason===plan.payload.reason}
export function createCourseModeResource({scope,actor,state,read,save,now=Date.now}){
  let epoch=0,controller,disposed=false
  const current=op=>!disposed && !!op.owner && op.owner===scope() && op.actor===actor() && op.epoch===epoch && !op.signal.aborted
  function invalidatePreview(){if(!state.pending){state.preview=null;state.notice='';state.error=''}}
  function reset(){epoch++;controller?.abort();Object.assign(state,{data:null,preview:null,pending:null,busy:false,blocked:false,canRetry:false,notice:'',error:''})}
  async function run(task){
    if(disposed || !scope() || !positive(actor()) || state.busy)return false
    controller=new AbortController();const op={owner:scope(),actor:actor(),epoch:++epoch,signal:controller.signal};state.busy=true;state.error='';state.notice=''
    try{return await task(op)}catch(error){if(current(op))state.error=error.response?.data?.message || error.message || '核定操作未确认，请重新读取';return false}finally{if(current(op))state.busy=false}
  }
  async function fresh(id,op){const response=await read(id,op.signal);return current(op)?validatedCourseMode(response.data,id):null}
  function verified(data){state.data=data;state.preview=null;state.pending=null;state.blocked=false;state.canRetry=false;state.notice=`来源已核定为“${COURSE_MODES[data.mode]}”，并已回读确认。未改变原名单、通知或过去考勤。`;return true}
  async function reconcileInside(op){
    const plan=state.pending;if(!plan)return false
    const data=await fresh(plan.courseId,op);if(!data)return false;state.data=data
    if(modeMatchesRequest(data,plan))return verified(data)
    state.preview=null
    if(data.mode==='LEGACY' && data.revision===plan.payload.revision && courseModeKey(data)===plan.key){state.blocked=true;state.canRetry=true;state.notice='目前仍待核定。可重试同一个已确认请求，不会创建第二次核定。';return false}
    state.pending=null;state.blocked=false;state.canRetry=false;state.notice=data.mode==='LEGACY'?'名单或课程已变化，原请求已失效；请核对新版本后重新预览。':'此课程已由其他请求核定。请查看当前类型与核定依据，不认作本次请求成功。';return false
  }
  async function persist(op,plan){
    state.pending=plan;state.blocked=true;state.canRetry=false
    let acknowledged=false
    try{
      const response=await save(plan.courseId,plan.payload,op.signal);if(!current(op))return false;validatedModeReceipt(response.data,plan);acknowledged=true
      const data=await fresh(plan.courseId,op);if(!data)return false
      if(!modeMatchesRequest(data,plan))throw new Error('保存回执与当前核定状态不一致')
      return verified(data)
    }catch(error){
      if(current(op)){
        state.preview=null
        const code=error.response?.status
        if(!acknowledged && [400,404,409,422].includes(code)){state.pending=null;state.blocked=false}
        state.error=acknowledged?'来源已保存，但回读未确认。请核对当前状态，不重复提交。':error.response?.data?.message || error.message || '结果未确认。请先核对当前状态；不要重新创建核定请求。'
      }
      return false
    }
  }
  return{
    load:id=>run(async op=>{if(state.pending){if(state.pending.courseId!==id)throw new Error('先核对上一个请求结果');return reconcileInside(op)}state.data=null;state.preview=null;const data=await fresh(id,op);if(!data)return false;state.data=data;state.blocked=false;return true}),
    prepare:(mode,reason)=>run(async op=>{if(state.pending || state.blocked || !state.data)throw new Error('先读取当前课程并核对未确认请求');state.preview=null;const previous=state.data,data=await fresh(previous.courseId,op);if(!data)return false;state.data=data;if(courseModeKey(previous)!==courseModeKey(data))throw new Error('课程或名单已变化，请核对新状态再预览');state.preview=courseModePlan(data,mode,reason,crypto.randomUUID(),op.actor,now());return true}),
    submit:()=>run(async op=>{const plan=state.preview;if(!plan || plan.expiresAt<=now() || plan.ownerActor!==op.actor || !state.data || plan.key!==courseModeKey(state.data)){state.preview=null;throw new Error('核定预览已变化或到期，请重新准备')}return persist(op,plan)}),
    reconcile:()=>run(reconcileInside),
    retry:()=>run(async op=>{const plan=state.pending;if(!plan || plan.ownerActor!==op.actor)throw new Error('没有可重试的当前账号请求');if(await reconcileInside(op))return true;if(!current(op) || !state.canRetry || state.pending!==plan)return false;return persist(op,plan)}),
    invalidatePreview,reset,dispose(){reset();disposed=true},
  }
}
