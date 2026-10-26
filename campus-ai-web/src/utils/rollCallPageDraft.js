import {validatedDetail} from './teaching.js'

const signature=(detail,marks)=>JSON.stringify(detail.entries.map(e=>[e.studentId,e.status,Object.hasOwn(marks,e.studentId)?marks[e.studentId]:null]))
function check(scope,detail){
  if(!scope || !detail?.canMark || detail.lesson?.cancelled || detail.lesson?.finalized)throw new Error('当前课程不能批量填写草稿，请重新核对任课权限和点名状态')
  validatedDetail(detail,detail.lesson.id)
  if(detail.entries.length>50)throw new Error('只处理当前50人以内名单页，不跨页推断到课')
}
export function onTimePageCandidates(detail,marks){
  if(!detail?.canMark || detail.lesson?.cancelled || detail.lesson?.finalized)return[]
  return detail.entries.filter(e=>e.status==='UNKNOWN'&&Object.hasOwn(marks,e.studentId)&&marks[e.studentId]==='UNKNOWN').map(e=>e.studentId)
}
export function planOnTimePage(scope,detail,marks){
  check(scope,detail)
  const studentIds=onTimePageCandidates(detail,marks)
  if(!studentIds.length)throw new Error('本页没有尚未选择且无历史记录的同学，未改变草稿')
  return Object.freeze({scope,lessonId:detail.lesson.id,revision:detail.lesson.revision,signature:signature(detail,marks),studentIds:Object.freeze(studentIds)})
}
export function applyOnTimePage(plan,scope,detail,marks){
  check(scope,detail)
  if(plan.scope!==scope || plan.lessonId!==detail.lesson.id || plan.revision!==detail.lesson.revision || plan.signature!==signature(detail,marks))throw new Error('确认期间账号、名单、版本或手选内容发生变化，未填入旧草稿，请重新核对')
  const eligible=new Set(onTimePageCandidates(detail,marks))
  if(!plan.studentIds.length || plan.studentIds.some(id=>!eligible.has(id)))throw new Error('本页待选择者已变化，未覆盖现有选择')
  for(const id of plan.studentIds)marks[id]='ON_TIME'
  return{scope,lessonId:plan.lessonId,revision:plan.revision,studentIds:[...plan.studentIds]}
}
export function detachManualPageMark(undo,id){return undo?{...undo,studentIds:undo.studentIds.filter(value=>value!==id)}:null}
export function undoOnTimePage(undo,scope,detail,marks){
  check(scope,detail)
  if(!undo || undo.scope!==scope || undo.lessonId!==detail.lesson.id || undo.revision!==detail.lesson.revision)throw new Error('撤销对象已变化，没有改动其他页面或版本')
  const original=new Map(detail.entries.map(e=>[e.studentId,e.status]))
  let restored=0
  for(const id of undo.studentIds)if(original.get(id)==='UNKNOWN'&&marks[id]==='ON_TIME'){marks[id]='UNKNOWN';restored++}
  return restored
}
