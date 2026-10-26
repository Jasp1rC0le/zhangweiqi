// Ownership is a semantic slot, never inferred from the caller's platform role.
// This dispatcher opens existing tools; it neither edits a course nor reads private data.
import {resolveAttendanceAction} from './attendanceActionIntent.js'
const unquote = text => text.replace(/[《“「"]([^《》“”「」"\n]*)[》”」"]/g, '《》')
const sourceOf = probe => {
  const personal = /个人|私人|本人|自己|我(?:的|自己)?导入|我的(?:课程表|课表|课程安排)|导入的|导入课表/.test(probe)
  const formal = /正式|教学|行政班|班级|全班|任课|代课|教师|老师/.test(probe)
  const foreign = /他人|别人|同学|室友|同桌|非本人|不是我的|(?:他|她)的|(?:修改|删除|调整|更新|编辑)\s*[^我本人自己，,。；;\s]{1,15}的课表/.test(probe)
  return personal && !formal && !foreign ? 'PERSONAL' : formal && !personal && !foreign ? 'FORMAL' : foreign ? 'FOREIGN' : ''
}
const question = '要修改本人导入的课表副本，还是学校正式教学安排？回复“个人导入”或“正式教学”。还没有读取或修改任何课程。'
const pending = request => ({ workflow: 'SCHEDULE_SOURCE', clarification: question, pendingScheduleMutation: { request } })
const personal = request => {
  const probe=unquote(request||'')
  if(/删除|删掉|清空|取消|跨学期|批量|多门|多项|单日|某天|某一天|历史|恢复|今天|明天|后天|昨天|\d{4}-\d{2}-\d{2}|\d{1,2}月\d{1,2}[日号]/.test(probe))return{workflow:'PERSONAL_OPERATIONS',notice:'先选准确的本人学期和安排；可单日、批量、跨学期修改、删除或恢复历史，预览后人工确认，不自动执行。'}
  if(/修改|编辑|更改|变更|调整|调课|调到|调至|挪到|移到|改到|换到|更新/.test(probe)&&!/删除|删掉|清空|取消|重新导入|上传|整份|整张/.test(probe))return{workflow:'PERSONAL_MANAGE',handoff:'PERSONAL_COURSE_EDIT',instructions:request.length<=1200&&!/[`{}]/.test(request)?request:''}
  return{workflow:'PERSONAL_MANAGE',notice:'这里只管理本人导入副本。上传新表先比较差异；单日、批量、跨学期、逐项删除和历史恢复可使用“修改个人安排”，不会自动执行。'}
}
const formal = request => ({ workflow: 'FORMAL_CHANGE', handoff: 'TEACHING_LESSON_CHANGE', instructions: request.length <= 1200 && !/[`{}]/.test(request) ? request : '' })
export function resolveScheduleManagement(text, { previous = null, scope = '' } = {}) {
  if (typeof text !== 'string' || !text.trim()) return null
  const raw = text.trim(), probe = unquote(raw.normalize('NFKC')).replace(/(?:原因|依据)\s*[:：].*$/, '')
  if (/^(?:请)?(?:不要|不用|不必|别)|(?:代码|函数|组件|脚本|算法|SQL)|知识库|资料|公告|政策|制度|规定|流程|(?:如何|怎么)(?:申请|办理)/.test(probe)) return null
  if(/历史|审计|操作记录|变更记录|谁.{0,8}(?:改|调|删|取消)|(?:查看|查询|查查|看看).*(?:已修改|变更)/.test(probe))return sourceOf(probe)==='PERSONAL'&&/课表|课程/.test(probe)?personal(raw):null
  if(resolveAttendanceAction(raw))return null
  const prior = scope && previous?.scope === scope ? previous.pendingScheduleMutation : null
  if(scope && previous?.scope===scope && previous.workflow==='PERSONAL_MANAGE' && probe.length<=160 && /^(?:那|改成|改到|改为|是|第|周[一二三四五六日天1-7]|星期|教室|地点|时间|日期|学期|原因|删掉这一项)/.test(probe) && !/什么课|啥课|几点|在哪|哪里|有什么|多少|谁|怎么|如何/.test(probe))return personal(raw)
  if (prior && typeof prior.request === 'string') {
    if (/^(?:那就|请)?(?:取消|算了|放弃|不改了)[。！!？?\s]*$/.test(probe)) return { workflow: 'SCHEDULE_SOURCE', clarification: '已取消来源澄清，没有保存或删除课程。', cancelled: true }
    // A new topic is not an answer to the pending ownership question.
    if (probe.length <= 80 && /^(?:是|就是|改|修改|要改|我说的是|那就|学校|我|的|本人|自己|个人|私人|导入|副本|课表|课程表|正式|教学|安排|班级|行政班|全班|那份|这份|不改|不是|而是|不要|\s|[，,。！!？?])+$/u.test(probe)) {
      const source = sourceOf(probe)
      if (source === 'PERSONAL' && !/不是.*(?:个人|导入)|不要.*(?:个人|导入)/.test(probe)) return personal(prior.request)
      if (source === 'FORMAL' && !/不是.*(?:正式|教学)|不要.*(?:正式|教学)/.test(probe)) return formal(prior.request)
      return pending(prior.request)
    }
  }
  const mutation = /修改|更新|编辑|更改|变更|调整|调课|调到|调至|挪到|移到|改到|换到|删除|删掉|清空|取消|停课|换教室|代课/.test(probe)
  const quotedMove=/[《“「"][^》”」"]+[》”」"]/.test(raw)&&/调到|调至|挪到|移到|改到|调整到|换到/.test(probe)
  const topic = quotedMove||/课表|课程表|课程安排|教学安排|调课|代课|停课|这(?:一)?[节门堂]课|我的课/.test(probe)
  if (!mutation || !topic || /^(?:(?:请|帮我|给我|为我|麻烦你?)\s*)*(?:新增|新建|创建|添加|增加)/.test(probe)) return null
  const source = sourceOf(probe)
  if (source === 'PERSONAL') return personal(raw)
  if (source === 'FOREIGN') return { workflow: 'SCHEDULE_SOURCE', clarification: '不能按姓名或自称身份认领他人的私人课表。若是正式教学安排，请明确这一来源，再由正常管理员选择有权课程；没有读取或修改他人数据。', pendingScheduleMutation: { request: raw.slice(0, 1200) } }
  if (source === 'FORMAL') return formal(raw)
  return pending(raw.slice(0, 1200))
}
