// Recognize a read of an existing personal source, not an upload instruction,
// course name, authorization assertion, or a request to restore/change data.
export function scheduleSourceLookup(text, previous = null) {
  if(typeof text!=='string'||!text.trim())return null
  const oversized=text.length>500
  const probe=text.normalize('NFKC').slice(0,1000).replace(/[《“「"]([^《》“”「」"\n]*)[》”」"]/g,'').replace(/\s/g,'')
  if(/^(?:请)?(?:不要|不用|别)|怎么|如何|为什么|代码|算法|程序|讲解|解释|知识点|作业|政策|制度|通知|商家/.test(probe))return null
  if(/新增|新建|创建|添加|增加|修改|更新|编辑|更改|变更|调整|调课|调到|调至|移到|挪到|改到|换到|取消|停课|恢复|删除|删掉|清空|覆盖|导出|下载|备份|归档/.test(probe))return null
  const sourceContext=previous?.workflow==='PERSONAL_SOURCES'
  if(oversized&&sourceContext&&/^(?:那|再|查|看|找|原件|旧原件|历史|来源|副本|之前|以前)/.test(probe))
    return {workflow:'PERSONAL_SOURCES',clarification:'来源追问过长，请只说明要找原件、历史还是查询课程；未读取或发送附件内容。'}
  // Remove whole semantic tokens, then validate single-character particles.
  // Repeated overlapping alternatives such as 看/看看 must not backtrack.
  const ownedProbe=probe.replace(/自己的|我的|本人(?:的)?|个人(?:的)?/g,'')
  const sourceTail=ownedProbe.replace(/旧原件|原件|历史|来源|副本|以前的|之前的|版本|记录/g,'')
  if(sourceContext&&/^[那再查看找呢吧？?。!！]*$/.test(sourceTail))
    return {workflow:'PERSONAL_SOURCES'}
  const queryTail=ownedProbe.replace(/我想|我要|查看|直接|课程|安排|课表/g,'')
  if(sourceContext&&/^[那我查看呢吧？?。!！]*$/.test(queryTail)&&/课程|安排|课表/.test(probe))
    return {workflow:'PERSONAL_SOURCES',clarification:'想查哪一天或哪一周的课程？例如“明天”或“这周”。这里查询本人导入和本人选课安排，不含授课安排，也不会自动解析原图片。',awaitingScheduleDate:true}
  if(!/课表|课程表/.test(probe))return null
  const stored=/(?:之前|以前|上次|原来|曾经|先前|刚才|已经|已).{0,6}(?:上传|导入|保存)|(?:上传|导入|保存)(?:过|的)/.test(probe)
  if(!stored || /^(?:(?:请|帮我|我要|我想|我|麻烦你?)\s*)*(?:上传|导入|保存)(?!的|过)/.test(probe))return null
  if(oversized)return {workflow:'PERSONAL_SOURCES',clarification:'课表来源请求过长，请只说明要找本人原件还是课程记录；没有读取或发送附件内容。'}
  const subject=probe.replace(/^(?:(?:请|帮我|帮忙|麻烦你?|查(?:看|询|一下)?|看(?:一下|看)?|找(?:一下)?|打开|取回|给我|我想看|我要看|我看))+/,'')
  if(!/^(?:我(?:的)?|本人|自己|个人|私人|之前|以前|上次|原来|曾经|先前|刚才|已经|已|上传过|导入过|保存过|那份|那张)/.test(subject))
    return {workflow:'PERSONAL_SOURCES',clarification:'私人课表按当前登录账号读取，不能按姓名认领其他人的副本。请明确是查看本人已保存的原件，还是有权访问的正式教学安排。'}
  if(/(?:什么|哪些|啥)课|在哪(?:里)?上|哪里上|谁(?:来)?教|几点(?:上课|下课)|还有多久|几节课|有没有(?!保存|上传|导入|成功|原件|副本)/.test(probe))
    return {workflow:'PERSONAL_SOURCES',clarification:'要找原上传文件，还是查询已保存课程？找文件可说“原件”；查课程可说“查课程”，再核对日期。原图片与当前课程安排不是同一份数据。'}
  return {workflow:'PERSONAL_SOURCES'}
}
