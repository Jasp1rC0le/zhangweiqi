import {isEnrollmentId as uuid} from './teachingIds.js'
const positive=v=>Number.isSafeInteger(v)&&v>0
const revision=v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483647
const text=(v,max)=>typeof v==='string'&&v.length<=max
const roles=['COUNSELOR','SECRETARY']
export const responsibilityKey=t=>JSON.stringify([t.userId,t.viewRole,t.scopeKey,t.revision,t.active,t.scopeLabel,t.account])
export function responsibilityTarget(data,query){
  if(!data||!positive(data.userId)||data.userId!==query.userId||!roles.includes(data.viewRole)||data.viewRole!==query.viewRole||data.scopeKey!==query.scopeKey||!text(data.scopeKey,100)||!data.scopeKey||!text(data.scopeLabel,220)||!data.scopeLabel||!text(data.account,150)||!data.account||!revision(data.revision)||typeof data.active!=='boolean'||typeof data.eligible!=='boolean'||!text(data.baselineNote,300))throw new Error('账号或负责范围响应不一致，请重新核对')
  return data
}
export function responsibilityPage(data,query){
  if(!data||data.userId!==query.userId||data.viewRole!==query.viewRole||!positive(data.userId)||!roles.includes(data.viewRole)||!text(data.account,150)||!revision(data.revision)||data.page!==query.page||data.size!==25||!Number.isSafeInteger(data.total)||data.total<0||data.totalPages!==Math.ceil(data.total/25)||!Array.isArray(data.items)||data.items.length!==Math.min(25,Math.max(0,data.total-query.page*25))||new Set(data.items.map(i=>i.scopeKey)).size!==data.items.length||data.items.some(i=>!text(i.scopeKey,100)||!i.scopeKey||!text(i.scopeLabel,220)||!i.scopeLabel||i.revision!==data.revision))throw new Error('负责范围分页响应异常，未返回部分清单')
  return data
}
export function responsibilityPlan(target,action,reason,actorId,id=crypto.randomUUID(),now=Date.now()){
  responsibilityTarget(target,target)
  const why=typeof reason==='string'?reason.trim():''
  if(!positive(actorId)||!uuid(id)||target.revision===2147483647||!['GRANT','REVOKE'].includes(action)||!why||why.length>300||[...why].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)>=127&&c.charCodeAt(0)<=159)||target.active===(action==='GRANT')||action==='GRANT'&&!target.eligible)throw new Error('先核对当前权限，选择可执行操作并填写1至300字原因；版本达到上限须由管理员处理')
  return{actorId,key:responsibilityKey(target),target:{...target},expiresAt:now+300000,payload:Object.freeze({requestId:id,userId:target.userId,viewRole:target.viewRole,scopeKey:target.scopeKey,revision:target.revision,action,reason:why})}
}
export function responsibilityReceipt(data,plan){
  const p=plan.payload
  if(!data||data.requestId!==p.requestId||data.actorId!==plan.actorId||data.userId!==p.userId||data.viewRole!==p.viewRole||data.scopeKey!==p.scopeKey||data.scopeLabel!==plan.target.scopeLabel||data.action!==p.action||data.oldActive!==plan.target.active||data.newActive!==(p.action==='GRANT')||data.oldRevision!==p.revision||data.revision!==p.revision+1||data.reason!==p.reason||!Number.isFinite(Date.parse(data.recordedAt)))throw new Error('保存回执目标或内容不一致，请先核对同一请求，不重新提交')
  return data
}
export function createResponsibilityResource({scope,actor,state,read,save,receipt,now=Date.now}){
  let epoch=0,controller,disposed=false
  const current=op=>!disposed&&!!op.owner&&scope()===op.owner&&actor()===op.actor&&epoch===op.epoch&&!op.signal.aborted
  function reset(){epoch++;controller?.abort();Object.assign(state,{data:null,preview:null,pending:null,result:null,busy:false,blocked:false,canRetry:false,error:'',notice:''})}
  async function run(work){
    if(disposed||!scope()||!positive(actor())||state.busy)return false
    controller=new AbortController();const op={owner:scope(),actor:actor(),epoch:++epoch,signal:controller.signal};state.busy=true;state.error='';state.notice=''
    try{return await work(op)}catch(error){if(current(op))state.error=error.response?.data?.message||error.message||'读取失败，请保留草稿并重试';return false}finally{if(current(op))state.busy=false}
  }
  async function fresh(query,op){const r=await read(query,op.signal);return current(op)?responsibilityTarget(r.data,query):null}
  function accepted(value){state.result=value;state.data=null;state.pending=null;state.preview=null;state.blocked=false;state.canRetry=false;state.notice=`已${value.newActive?'授予':'撤销'}这一个负责范围，变更原因和原权限已留痕；未改变平台身份或删除考勤。`;return true}
  async function reconcile(op){
    const plan=state.pending;if(!plan)return false
    try{const r=await receipt(plan.payload.requestId,op.signal);if(!current(op))return false;return accepted(responsibilityReceipt(r.data,plan))}
    catch(error){if(current(op)&&error.response?.status===404){state.canRetry=true;state.blocked=true;state.notice='目前未查到回执，但这不证明请求没有执行。只能明确重试同一个请求编号和内容。';return false}throw error}
  }
  async function persist(op,plan){
    if(!current(op))return false
    state.pending=plan;state.blocked=true;state.canRetry=false;state.preview=null
    try{const r=await save(plan.payload,op.signal);if(!current(op))return false;return accepted(responsibilityReceipt(r.data,plan))}
    catch(error){if(current(op)){if([400,403,404,409,422].includes(error.response?.status)){state.pending=null;state.blocked=false;state.data=null}state.error=error.response?.data?.message||error.message||'保存结果未确认，请先核对回执，不重新创建操作'}return false}
  }
  return{
    load:query=>run(async op=>{if(state.pending)return reconcile(op);state.data=null;state.preview=null;const value=await fresh(query,op);if(!value)return false;state.data=value;state.result=null;return true}),
    prepare:(action,reason)=>run(async op=>{if(state.pending||state.blocked||!state.data)throw new Error('先核对当前账号和范围，并处理未确认请求');const before=state.data;state.preview=null;const value=await fresh(before,op);if(!value)return false;state.data=value;if(responsibilityKey(before)!==responsibilityKey(value))throw new Error('权限或显示对象已变化，请核对新版本后重新预览');state.preview=responsibilityPlan(value,action,reason,op.actor,crypto.randomUUID(),now());return true}),
    submit:()=>run(async op=>{const plan=state.preview;if(!plan||plan.actorId!==op.actor||plan.expiresAt<=now()||!state.data||plan.key!==responsibilityKey(state.data)){state.preview=null;throw new Error('预览已变化或过期，请重新准备')}return persist(op,plan)}),
    reconcile:()=>run(reconcile),
    retry:()=>run(async op=>{const plan=state.pending;if(!plan||plan.actorId!==op.actor)throw new Error('没有当前账号可重试的请求');if(await reconcile(op))return true;if(!current(op)||!state.canRetry||state.pending!==plan)return false;return persist(op,plan)}),
    invalidatePreview(){if(!state.pending){state.preview=null;state.result=null;state.notice='';state.error=''}},
    reset,dispose(){reset();disposed=true},
  }
}
