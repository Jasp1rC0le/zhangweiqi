import {addDays,chinaDate} from '../src/utils/timetable.js'
import {createLessonChangeResource,validatedLessonChangeTarget} from '../src/utils/teachingLessonChanges.js'
import {validatedChangeNoticePage} from '../src/utils/lessonChangeNotices.js'

const root='/api/admin/teaching/lesson-changes'
const requestId='40000000-0000-4000-8000-000000018001'
const reason='DEV重复验收：模拟单次调课，不连接学校数据'

// Only the DEV review entry imports this module. All calls go through the supplied
// in-memory adapter, never axios/fetch, a real login, or a production principal.
export async function prepareTeachingChangeDemo(fixture){
  if(!fixture?.principal?.().username?.startsWith('flow-demo-') || typeof fixture.adapter!=='function' || typeof fixture.setActor!=='function')throw new Error('调课示例只能使用本页合成教学适配器')
  const initial=fixture.principal().id,today=chinaDate(new Date(fixture.clock())),date=addDays(today,1)
  const call=(url,method='get',data,params,signal)=>fixture.adapter({url,method,data,params,signal})
  let resource,receipt
  try{
    fixture.setActor(1)
    try{receipt=(await call(root+'/requests/'+requestId)).data}catch(error){if(error.response?.status!==404)throw error}
    if(!receipt){
      const state={}
      resource=createLessonChangeResource({owner:()=>`demo:${fixture.principal().id}`,actorId:()=>fixture.principal().id,state,
        readAccess:signal=>call(root+'/access','get',null,null,signal),readPage:(q,signal)=>call(root+'/page','get',null,q,signal),readTarget:(id,signal)=>call(root+'/target/'+id,'get',null,null,signal),
        preview:(p,signal)=>call(root+'/preview','post',p,null,signal),save:(p,signal)=>call(root,'post',p,null,signal),readReceipt:(id,signal)=>call(root+'/requests/'+id,'get',null,null,signal)})
      if(!await resource.access() || !state.access.enabled)throw new Error(state.error||'本页未启用模拟调课能力')
      if(!await resource.list({from:today,to:today,page:0,size:25,search:'计算机网络基础（模拟）'}) || state.page.total!==1)throw new Error(state.error||'示例原课程不唯一或不在可调整窗口，没有猜选目标')
      if(!await resource.select(state.page.items[0].lessonId))throw new Error(state.error)
      if(!await resource.prepare({action:'RESCHEDULE',date,startTime:'15:50',endTime:'17:25',teacherId:4,room:'F2-309（调课示例）',reason},requestId))throw new Error(state.error)
      const saved=await resource.execute()
      // Lost ACK: read the same persisted receipt once, never repeat a POST.
      if(!saved && state.phase==='uncertain')await resource.reconcile()
      if(state.phase!=='saved' || !state.receipt)throw new Error(state.error||'示例保存结果尚未核对，没有自动重发')
      receipt=state.receipt
    }
    const original=validatedLessonChangeTarget(receipt.original,receipt.original?.lessonId)
    if(receipt.requestId!==requestId || receipt.actorId!==1 || receipt.action!=='RESCHEDULE' || receipt.reason!==reason || original.name!=='计算机网络基础（模拟）' || receipt.proposed?.date!==date || receipt.proposed.startTime!=='15:50' || receipt.proposed.endTime!=='17:25' || receipt.proposed.teacherId!==4 || receipt.proposed.room!=='F2-309（调课示例）' || receipt.revision!==original.revision+1)throw new Error('已有示例回执不属于这个目标，未冒认成功')
    fixture.setActor(2)
    const q={page:0,size:25,unreadOnly:false},page=validatedChangeNoticePage((await call('/api/teaching/lesson-change-notices','get',null,q)).data,q)
    const notice=page.items.find(n=>n.requestId===requestId)
    if(!notice || notice.view!=='STUDENT' || notice.targetLessonId!==receipt.replacementLessonId || notice.proposed?.date!==date || notice.proposed?.room!==receipt.proposed.room)throw new Error('调课回执存在，但本人收件箱尚未核对；未伪造通知')
    return{requestId,lessonId:receipt.replacementLessonId,date,noticeId:notice.id}
  }finally{resource?.dispose();fixture.setActor(initial)}
}
