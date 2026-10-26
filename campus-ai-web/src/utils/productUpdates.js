// User-visible shipped capabilities only. Keep dates factual; never substitute the current clock.
export const productUpdates = Object.freeze([
  Object.freeze({
    date: '2026-10-25', label: '2026年10月25日',
    items: Object.freeze([
      Object.freeze({ title: '看完记录返回原课表范围', text: '从课表打开单节记录或名单后，“返回课表”带回原日期、身份、班级和课程页，并重新核对权限；失效不悄悄改查本周或全部班级。未保存记录仍先确认离开。', route: '/timetable', action: '打开课表与记录' }),
      Object.freeze({ title: '指定日期直接看课表', text: '在课表填写日期后点“查看”，直接定位对应周和课程明细，保留当前身份与班级。未提交的日期不改变当前安排；整周统计与分页范围会明确说明。', route: '/timetable', action: '按日期查看课表' }),
      Object.freeze({ title: '单节课程直接复制', text: '在课表每日课程明细点“复制这节课”，带日期、时间、教师、地点和来源；缺项与取消会明确说明。浏览器受限时可全选文本，不自动分享或调用模型。', route: '/timetable', action: '打开课程明细' }),
      Object.freeze({ title: '导出沿用正在看的课表范围', text: '从课表导出时带入已核对的周次、身份和班级；已有条件或文件预览会先保留，明确替换后才采用新范围，不悄悄回到本周或全部班级。', route: '/timetable', action: '打开课表与导出' }),
      Object.freeze({ title: '补录教师先定位缺项', text: '从已保存课表进入补录时核对该学期，只显示未填姓名；筛选外仍有选择会明确提醒并阻止误预览，原预览与确认保存保留。', route: '/timetable?tool=personal-manage', action: '核对课表任课教师' }),
      Object.freeze({ title: '首页直接看本人日程', text: '今天与下一节切换查看，课程、地点、教师来自已保存与授权安排；可打开对应日期，不用先发一条问题。缺失钟点或来源会明确提示。', route: '/chat', action: '打开首页日程' }),
      Object.freeze({ title: '统计选班后，核对与导出沿用条件', text: '从授权班级统计进入记录核对时保留班级、日期和查看身份；目标重新核对班级权限，失效不会悄悄改查全部班级。', action: '打开课表与统计', route: '/timetable' }),
      Object.freeze({ title: '统计摘要可以直接复制', text: '辅导员和书记可在授权考勤概览中复制日期、范围和完整汇总数字；浏览器不允许复制时，可手动选取摘要，不含学生姓名与学号。', action: '打开授权统计', route: '/timetable' }),
      Object.freeze({ title: '课表追问接着聊', text: '补充“10.13”或“10/13”也能接着查询。回答依据当前账号可读的已保存课表，并附课程卡片供核对。', action: '打开校园助手', route: '/chat' }),
      Object.freeze({ title: '任课教师不再丢失', text: '导入、识图核对、编辑、历史和导出都保留任课教师。缺少的姓名可以补录；教师账号与任课课程需明确绑定，不按姓名自动认领。', action: '查看课表与任课教师', route: '/timetable' }),
      Object.freeze({ title: '首页能看课表准备情况', text: '直接查看本人课程是否已保存、多少项尚未填写教师；读取失败可重试，不会把连接失败当成没有课表。', action: '查看我的课表', route: '/timetable' }),
    ]),
  }),
  Object.freeze({
    date: '2026-10-24', label: '2026年10月24日',
    items: Object.freeze([
      Object.freeze({ title: '课表图片直接交给模型识别', text: '选图预览并主动同意后识别，逐行核对再采用；最终确认保存是独立一步，不会自动替换原课表。', action: '打开课表导入', route: '/timetable?tool=personal-manage' }),
      Object.freeze({ title: '食堂与仪器草稿更稳妥', text: '同一页面内保留多份未保存输入，保存一项不清空其他项，离开或刷新前提醒。仍需主动保存，关闭页面不会替你永久保存草稿。', action: '打开食堂评分', route: '/canteens' }),
      Object.freeze({ title: '保存成功与读取失败分开说明', text: '项目保存后的列表读取失败不再撤回保存结果；学习新结果失败时保留上次完整内容。账户确认也只对当前页面与账号生效。', action: '继续我的项目', route: '/projects' }),
    ]),
  }),
])
