const quoted=/[《“「"]([^《》“”「」"\n]*)[》”」"]/g
const statusWords='旷课|早退|按时(?:到达|到课)?|正常出勤|迟到|请假|缺勤|未到|没来|已到'
const operation='设为|设置为|设置成|改成|改为|记为|记成|标记为|标为|登记为'
const allowed=word=>/^按时|正常出勤/.test(word)?'ON_TIME':word==='旷课'?'ABSENT':word==='早退'?'EARLY_LEAVE':''
const clarify=(message,pendingAttendance)=>({kind:'CLARIFY_ACTION',seed:{message,...(pendingAttendance?{pendingAttendance}:{})}})
const strip=text=>{const bounded=text.length>10000?text.slice(0,10000)+' '+text.slice(-1000):text;return bounded.normalize('NFKC').replace(quoted,'').replace(/(?:原因|依据)\s*[:：].*$/,'').trim()}

export function explanatoryActionRequest(text){
  const probe=strip(text).replace(/^(?:你好|您好)[，,！!。\s]*/,'')
  const prefix='(?:(?:请|帮我|帮忙|麻烦你?|我想|给我|现在)\\s*)*'
  return new RegExp(`^${prefix}(?:不要|不必|不用|不许|不能|别|如果|假如|假设|如何|怎么|为什么)`).test(probe)||
    new RegExp(`^${prefix}(?:解释|说明|介绍|讲解)`).test(probe)&&/政策|规定|制度|流程|要求/.test(probe)||
    /(?:代码|算法|函数|接口|脚本|程序|组件|小说|作文|文案|句子)/.test(probe)&&/编写|写一个|写一段|写一篇|开发|实现|设计|解释|讲解|调试|优化|翻译|改写|润色/.test(probe)
}
export function knowledgeSpeech(text){
  const probe=strip(text)
  if(!/知识库|本校公共资料|学校公告/.test(probe))return undefined
  const verb=/新增|新建|创建|添加|更新|修改|修订|补充|编辑|改一下|发布|收录|存入|放入/.exec(probe)
  const reading=/^(?:(?:请|帮我|给我|我想)\s*)*(?:查|查看|查询|看|看看|阅读|介绍|解释|比较|总结|分析)/.test(probe)
  if(!reading&&/保存/.test(probe)&&!verb)return clarify('当前没有打开的知识资料草稿。请先明确新增或修订，核读正文并预览后再人工确认；这条消息没有保存或发给模型。')
  if(!verb||reading&&!/(?:并|再|然后)\s*(?:修改|更新|修订|添加)/.test(probe))return null
  if(/私人课表|本人课表|我的课表|个人名单|学生名单|考勤记录|成绩单/.test(probe))return clarify('私人课表、名单、考勤和个人成绩不能放入公共知识库。本条未读取、发布或发给模型；请改用本人课表或授权考勤业务入口。')
  return{kind:'KNOWLEDGE',seed:{mode:/新增|新建|创建|添加|发布|收录|存入|放入/.test(verb[0])?'CREATE':'REVISE',search:text.length<=800&&!/[`{}]/.test(text)?/[《“「"]([^》”」"]{1,100})[》”」"]/.exec(text)?.[1]||'':''}}
}
export function resolveAttendanceAction(text){
  if(typeof text!=='string'||!text.trim()||explanatoryActionRequest(text))return null
  const raw=text.trim(),probe=strip(raw),topic=new RegExp(`考勤|出勤|${statusWords}`).test(probe)
  if(/知识库|资料|公告/.test(probe))return null
  if(!topic)return null
  if(/^(?:(?:请|帮我|给我|我想)\s*)*保存/.test(probe)&&!new RegExp(statusWords).test(probe))return clarify('当前没有打开的考勤草稿。请先明确记录对象，或到授权记录入口核对/导出；这条消息没有保存或发给模型。')
  const recording=/记录|登记|记一下|记上|记下|记为|记成|补记|录入|标记|标为|(?:帮我|给|把|将).{0,45}记|^(?:请)?记/.test(probe)
  const changing=/修改|更正|改为|改成|设为|设置|调整为/.test(probe)
  if(!recording&&!changing)return null
  if(/^(?:(?:请|帮我|给我|我想)\s*)*(?:查|查看|查询|看看|看一下|统计|汇总|谁|解释|说明)/.test(probe))return{kind:'ATTENDANCE_QUERY',seed:{search:'',student:''}}
  if(/政策|规定|制度|流程|怎么登记|如何登记/.test(probe)&&!/^(?:请|帮我|把|将|给).*(?:记|改|设|登记|录入)/.test(probe))return null
  if(raw.length>800||/[`{}]/.test(raw))return{kind:'ATTENDANCE',seed:{student:'',status:'',course:''}}
  const words=[...probe.matchAll(new RegExp(statusWords,'g'))].map(m=>m[0]),desired=[...probe.matchAll(new RegExp(`(?:${operation})\\s*(${statusWords})`,'g'))].map(m=>m[1])
  let status=''
  if(desired.length===1&&!/或者|或|同时|分别|然后/.test(probe))status=allowed(desired[0])
  else if(new Set(words.map(allowed)).size===1&&words.length)status=allowed(words[0])
  const before=new RegExp(`(?:把|将|给)\\s*(.{1,40}?)(?:同学)?\\s*(?:的考勤|考勤|的出勤|出勤)?\\s*(?:${operation}|记上|记下|记一下)`).exec(probe)?.[1]
  const after=new RegExp(`(?:记录|登记|补记|录入|记一下|记上|记下)\\s*(.{1,40}?)(?:的)?\\s*(?=${statusWords})`).exec(probe)?.[1]
  const reversed=new RegExp(`^(.{1,30}?)(?:${statusWords})[，,；;\\s]*(?:请|帮我)?(?:记一下|记上|记录|登记)`).exec(probe)?.[1]
  const student=String(before||after||reversed||'').replace(/(?:的考勤|考勤|的出勤|出勤|同学|的)$/,'').trim()
  const course=/[《“「"]([^》”」"]{1,100})[》”」"]/.exec(raw)?.[1]||''
  if(words.length&&!status)return clarify('当前快捷点名仅支持按时、旷课、早退。迟到/请假/未到或多个不同状态不会被自动换成旷课；请先核实并明确一种支持的状态。本条未读取或修改名单，也未发给模型。',{student,course})
  return{kind:'ATTENDANCE',seed:{student,status,course}}
}
export function previousAttendanceClarification(messages,scope){const last=[...(messages||[])].reverse().find(m=>m.role==='assistant');return scope&&last?.actionClarification?.scope===scope?last.actionClarification:null}
export function resolveAttendanceContinuation(text,{previous,scope}={}){
  if(!scope||previous?.scope!==scope||typeof text!=='string'||text.length>160)return null
  const raw=text.normalize('NFKC').trim()
  if(/^(?:那就|请)?(?:取消|算了|不记了|放弃)[。！!？?\s]*$/.test(raw))return clarify('已取消本次考勤澄清，没有读取名单或保存。')
  const result=new RegExp(`^(?:(?:那|就|还是|仍然|就是|实际是|应该是|是|改为|改成|记为|记成|设为|设置为|请|按|我说的是)\\s*)*(${statusWords})[。！!？?\\s]*$`).exec(raw)
  if(!result)return null
  const status=allowed(result[1]),student=typeof previous.student==='string'?previous.student.slice(0,40):'',course=typeof previous.course==='string'?previous.course.slice(0,100):''
  if(!status)return clarify('这个状态当前仍未接入快捷点名，未改为其他状态，也未保存。请按真实情况明确按时、旷课或早退，或取消。',{student,course})
  return{kind:'ATTENDANCE',seed:{student,course,status}}
}
export function unresolvedPrivateAction(text){
  if(typeof text!=='string'||explanatoryActionRequest(text))return null
  const probe=strip(text)
  if(/(?:我|本人|个人).*(?:考试成绩|成绩|绩点|学号|已修学分)/.test(probe)&&(!/政策|规定|制度|流程|要求|知识点|公式|怎么算/.test(probe)||/修改|更正|设为|改成|录入|删除/.test(probe)))return clarify('可在聊天使用本人学业工具查询已绑定学号，或核读本人选定的成绩文件并按已有绩点试算；不修改教务成绩，不按姓名认领数据。本条未保存或发送模型。')
  if(/保存|存一下|存好|记下|收好/.test(probe)&&/课表|课程表|考勤|学生名单|花名册/.test(probe))return clarify('当前没有打开的对应草稿，不能仅凭这句话声称保存。课表请先导入或新增课程，考勤/名单须走正常授权入口；本条未读写或发给模型。')
  return null
}
