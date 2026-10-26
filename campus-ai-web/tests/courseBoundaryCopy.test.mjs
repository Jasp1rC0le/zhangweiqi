import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolveChatAction} from '../src/utils/chatActions.js'
test('private-source copy distinguishes authorized local lookup station notices and unavailable external channels',{timeout:5000},()=>{
  const panel=readFileSync(new URL('../src/components/CourseSchedulePanel.vue',import.meta.url),'utf8')
  assert.match(panel,/课表保存在统一数据库，按当前账号权限读取/);assert.match(panel,/根据查到的课程、教师、时间和地点回答/);assert.match(panel,/不发送学号、名单、成绩或考勤/);assert.match(panel,/图片识别仅在你主动同意时发送本次选图/);assert.match(panel,/正式教学另有站内提醒，尚无微信\/离线推送/);assert.match(panel,/个人副本不自动同步教务变更/);assert.doesNotMatch(panel,/问答不发送已保存课表|业务查询不经外部模型|不发送给AI|本站无实时教务同步和后台推送|本站未检测实时调课/)
  const chat=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8'),privateBranch=chat.slice(chat.indexOf('// Personal schedule answers'),chat.indexOf('sending.value = true\n  answerNotice',chat.indexOf('// Personal schedule answers')))
  assert.match(privateBranch,/runScheduleQuery\(privateQuery, content, routeText\)/);assert.doesNotMatch(privateBranch,/sendMessageStream|ensureConversation\(/)
  const execute=chat.slice(chat.indexOf('async function runScheduleQuery('),chat.indexOf('async function submitPrompt('))
  assert.match(execute,/readPrivateScheduleQuery/);assert.doesNotMatch(execute,/sendMessageStream|ensureConversation\(/)
  assert.match(resolveChatAction('查我的学号').seed.message,/本人学业工具查询已绑定学号/)
  assert.match(resolveChatAction('查我的学号').seed.message,/不按姓名认领数据/)
})
