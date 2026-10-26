import {validatedCourseSnapshot} from './privateCourseSchedule.js'
import {normalizeCourse,normalizeCourses,parseCourseWeeks,courseKey,courseTimeLabel,courseConflicts,isPeriodCourse} from './courseSchedule.js'
import {planActionFollowup} from './chatActionFollowup.js'

const sourceValue=s=>({revision:s.revision,semester:s.semester,firstMonday:s.firstMonday,remindDays:s.remindDays,courses:normalizeCourses(s.courses)})
const sourceKey=s=>JSON.stringify(sourceValue(s))
const sameCourses=(a,b)=>JSON.stringify(normalizeCourses(a))===JSON.stringify(normalizeCourses(b))
const sha=async value=>{if(!globalThis.crypto?.subtle)throw new Error('当前页面不能完成安全校验，请使用HTTPS或localhost；没有生成可保存预览');return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
const weeksText=weeks=>weeks.join('、')
const receiptSummary=(plan,value)=>`${plan.changed.name} · 第${weeksText(plan.changed.weeks)}周：周${'一二三四五六日'[plan.changed.weekday-1]} ${courseTimeLabel(plan.changed)} · ${plan.changed.room||'教室未填写'}。当前版本${value.revision}；${plan.remainingWeeks.length?`原第${weeksText(plan.remainingWeeks)}周及`:''}其他个人安排保留，正式教学未改变。`

export function privateCourseEditPlan(snapshot,key,form){
  const source=validatedCourseSnapshot(snapshot)
  if(!source)throw new Error('本人尚未保存个人课表，请先导入；不从正式教学名单猜一份副本')
  const matches=source.courses.filter(c=>courseKey(c)===key)
  if(matches.length!==1)throw new Error('原课程目标已变化，请重新读取并手选准确安排')
  const original=matches[0],weeks=parseCourseWeeks(form.weeks)
  if(weeks.some(w=>!original.weeks.includes(w)))throw new Error('本次只修改原安排已有周次；新增周次请用新增课程，不会补猜其他周')
  const changed=normalizeCourse({name:form.name,weekday:Number(form.weekday),room:form.room,teacher:form.teacher??original.teacher,weeks,...(form.periodMode?{startPeriod:Number(form.startPeriod),endPeriod:Number(form.endPeriod)}:{startTime:form.startTime,endTime:form.endTime})})
  if(courseKey({...changed,weeks:original.weeks})===courseKey(original))throw new Error('课程字段没有变化；缩小修改周次并不会删除原来其他周次')
  const remainingWeeks=original.weeks.filter(w=>!weeks.includes(w)),others=source.courses.filter(c=>courseKey(c)!==key)
  const rows=[...others,...(remainingWeeks.length?[{...original,weeks:remainingWeeks}]:[]),changed]
  if(rows.length>120)throw new Error('部分周次拆分后超过120项上限，未截断或合并原安排；请先核对个人课表结构')
  if(new Set(rows.map(courseKey)).size!==rows.length)throw new Error('修改后与另一项安排完全重复，未自动合并或删除，请先核对')
  const newConflict=others.some(other=>{const before=new Set(courseConflicts([original,other]).flatMap(c=>c.weeks));return courseConflicts([changed,other]).some(c=>c.weeks.some(w=>!before.has(w)))})
  if(newConflict)throw new Error('修改后新增课程时间重叠，请先核对星期、钟点和周次；未覆盖其他课程')
  const payload={revision:source.revision,semester:source.semester,firstMonday:source.firstMonday,remindDays:source.remindDays,courses:normalizeCourses(rows)}
  return{source,sourceKey:sourceKey(source),payload,original,changed,remainingWeeks,lines:[
    `${original.name} · 周${'一二三四五六日'[original.weekday-1]} ${courseTimeLabel(original)} · ${original.room||'教室未填写'}`,
    `改为：${changed.name} · 周${'一二三四五六日'[changed.weekday-1]} ${courseTimeLabel(changed)} · ${changed.room||'教室未填写'}`,
    `任课教师：${original.teacher||'未录入'} → ${changed.teacher||'未录入'}；姓名记录不会建立或更改正式任课账号绑定。`,
    `仅修改第${weeksText(weeks)}周${remainingWeeks.length?`；原第${weeksText(remainingWeeks)}周按原安排保留`:'；覆盖本项原有全部指定周次'}`,
    `学期${source.semester}，第1周周一${source.firstMonday}，其余${others.length}项安排保留；确认后共${payload.courses.length}项。`,
    '只改本人导入副本，不修改学校正式教学安排、教师名单、考勤或原图片。',
  ]}
}
export function privateCourseEditFollowup(text,context){
  if(/^(?:请)?(?:取消|取消操作|取消不保存|取消，不保存|不保存)[。！!？?]?$/.test(String(text||'').trim()))return planActionFollowup(text,{...context,kind:'PERSONAL_COURSE',form:{course:context?.form},metadataLocked:true})
  if(!context?.selected)return{type:'CLARIFY',message:'先从本人已保存安排中手选具体一项；不会按同名自动修改。',preserveInput:true}
  const raw=String(text||'')
  const dateProbe=raw.replace(/[《“「"][^》”」"]*[》”」"]/g,'').replace(/(?:教室|地点)\s*(?:改为|改成|改到|是|[:：])?\s*[^，,；;。\s]+/g,'')
  if(/今天|明天|后天|昨天|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}[日号]|\d{1,2}[日号]/.test(dateProbe))return{type:'CLARIFY',message:'这里按已保存学期的周次修改，不把某一天猜成全部周次。请明确“第几周”与新星期/钟点；要改正式单次课请取消后走正式教学。',preserveInput:true}
  const cleaned=raw.replace(/^(?:只改|仅改|仅修改|只修改|这次只改|本次只改)/,'')
  return planActionFollowup(cleaned,{...context,kind:'PERSONAL_COURSE',metadataLocked:true,form:{course:context.form}})
}
export function privateCourseEditForm(course){return{name:course.name,weekday:course.weekday,weeks:course.weeks.join(';'),room:course.room,teacher:course.teacher||'',periodMode:isPeriodCourse(course),startTime:course.startTime||'',endTime:course.endTime||'',startPeriod:course.startPeriod||'',endPeriod:course.endPeriod||''}}

export function createPrivateCourseEdit({owner,state,read,write,adopt=()=>{},clearCache=()=>{},now=Date.now,digest=sha}){
  let generation=0,controller,disposed=false,prepared=null,pending=null
  const currentOwner=()=>!disposed&&owner()
  function reset(){generation++;controller?.abort();prepared=null;pending=null;Object.assign(state,{busy:false,phase:'list',snapshot:null,selected:null,selectedKey:'',preview:null,error:'',notice:'',verified:false})}
  function invalidate(){if(state.busy||['uncertain','saved'].includes(state.phase))return;prepared=null;state.preview=null;state.phase=state.selected?'editing':'list';state.error=''}
  async function run(work){
    if(!currentOwner()||state.busy)return false
    controller?.abort();controller=new AbortController();const principal=currentOwner(),epoch=++generation,signal=controller.signal,op={signal,current:()=>currentOwner()===principal&&generation===epoch&&!signal.aborted}
    state.busy=true;state.error=''
    try{return await work(op)}catch(e){if(op.current())state.error=e.response?.data?.message||e.message||'读取未完成，请保留草稿重试';return false}finally{if(op.current())state.busy=false}
  }
  async function get(op){const value=validatedCourseSnapshot((await read(op.signal)).data?.schedule);if(!value)throw new Error('本人课表不存在或已删除，未沿用旧副本');return value}
  function matchesPayload(value,p){return value.revision>=p.revision+1 && value.semester===p.semester && value.firstMonday===p.firstMonday && value.remindDays===p.remindDays && sameCourses(value.courses,p.courses)}
  function complete(value,verified,notice){state.phase='saved';state.verified=verified;state.preview=null;state.notice=notice;if(value)adopt(value);else clearCache();prepared=null;pending=null}
  return{
    load:()=>run(async op=>{if(state.phase==='uncertain')throw new Error('先核对原保存结果，不能新建第二份编辑计划');const value=await get(op);if(!op.current())return false;state.snapshot=value;state.selected=null;state.selectedKey='';state.preview=null;prepared=null;state.phase='list';state.notice='';return true}),
    select:key=>{if(state.busy||!currentOwner()||['uncertain','saved'].includes(state.phase))return false;const matches=state.snapshot?.courses.filter(c=>courseKey(c)===key)||[];if(matches.length!==1){state.error='本人原安排不唯一或已变化，请重新读取';return false}invalidate();state.selected=normalizeCourse(matches[0]);state.selectedKey=key;state.phase='editing';state.notice='';return true},
    prepare:form=>run(async op=>{
      if(['uncertain','saved'].includes(state.phase)||!state.snapshot||!state.selected)throw new Error('先核对原课表和具体目标')
      prepared=null;state.preview=null;const value=await get(op);if(!op.current())return false
      if(sourceKey(value)!==sourceKey(state.snapshot))throw new Error('本人课表来源或版本已变化，请重新读取并选择；当前草稿保留，未覆盖新版本')
      const plan=privateCourseEditPlan(value,state.selectedKey,form),fingerprint=await digest(JSON.stringify([plan.sourceKey,plan.payload]));if(!op.current())return false
      if(typeof fingerprint!=='string'||!/^([a-f0-9]{64})$/.test(fingerprint))throw new Error('来源校验值无效，未生成可保存预览')
      prepared={...plan,owner:currentOwner(),expires:now()+300000,fingerprint};state.preview={lines:plan.lines,fingerprint,original:plan.original,changed:plan.changed,remainingWeeks:plan.remainingWeeks,revision:value.revision};state.phase='preview';return true
    }),
    execute:()=>run(async op=>{
      if(['uncertain','saved'].includes(state.phase))throw new Error('原保存结果未核对或已经保存，不能改动冻结内容或重复提交')
      const plan=prepared
      if(state.phase!=='preview'||!plan)throw new Error('请先选择具体安排并生成预览，未发送保存')
      if(plan.owner!==currentOwner()||now()>=plan.expires){prepared=null;state.preview=null;state.phase='editing';throw new Error('预览已失效或超过5分钟，请重新核对')}
      const before=await get(op);if(!op.current())return false
      if(now()>=plan.expires){prepared=null;state.preview=null;state.phase='editing';throw new Error('预览已超过5分钟，请重新核对，没有发送保存')}
      if(sourceKey(before)!==plan.sourceKey){prepared=null;state.preview=null;state.phase='editing';throw new Error('保存前原课表已变化，没有提交；请重新读取并核对')}
      prepared=null;pending=plan;state.phase='uncertain';state.preview=null
      let ack
      try{
        ack=validatedCourseSnapshot((await write(structuredClone(plan.payload),op.signal)).data?.schedule)
        if(!op.current())return false
        if(!ack||ack.revision!==plan.payload.revision+1||!matchesPayload(ack,plan.payload))throw new Error('保存回执与预览不一致，先核对，不要重复提交')
      }catch(e){if(op.current()&&e.response?.status>=400&&e.response?.status<500&&e.response.status!==408){pending=null;state.phase='editing'}throw e}
      try{const fresh=await get(op);if(!op.current())return false;if(!matchesPayload(fresh,plan.payload)){complete(fresh,false,'保存回执已核对，但课表随后已有其他变化。请到本人课表查看最新版本，不要重发。');return true}complete(fresh,true,receiptSummary(plan,fresh)+'已保存并重新读取核对。');return true}
      catch(e){if(op.current()){complete(null,false,'已收到一致的保存回执，但重新读取失败。请到本人课表重读核对，不要重复保存。');state.error=e.response?.data?.message||e.message;return true}return false}
    }),
    reconcile:()=>run(async op=>{
      if(state.phase!=='uncertain'||!pending)throw new Error('没有待核对的原保存请求')
      const fresh=await get(op);if(!op.current())return false
      if(matchesPayload(fresh,pending.payload)){complete(fresh,true,receiptSummary(pending,fresh)+'当前数据与原预览一致，已重新核对；没有重复发送保存。');return true}
      state.error='当前课表尚未与原预览一致。不能认定在途请求未执行；保留冻结内容，不自动重发，请稍后再次核对。';return false
    }),
    invalidate,reset,dispose(){reset();disposed=true},
  }
}
