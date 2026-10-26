import test from 'node:test'
import assert from 'node:assert/strict'
import * as chat from '../src/utils/scheduleChat.js'
import { scheduleQuery, planScheduleQuestion } from '../src/utils/scheduleIntent.js'
import { resolveTeachingWorkflow, previousTeachingWorkflow } from '../src/utils/teachingWorkflows.js'

const scope='synthetic-owner:school:session:conversation', day='2026-10-20',opts={timeout:3000}
const pair=(owner,name)=>[
  {id:`${owner}-q`,role:'user',content:`查${name}`,localSchedule:true,scheduleOwner:owner},
  {id:`${owner}-a`,role:'assistant',content:`${name} 教室A`,localSchedule:true,scheduleQuery:{...scheduleQuery(day),scope:owner},scheduleResult:{privateName:name}},
]
test('a denied read removes only this scope private pairs and leaves public messages and other scopes untouched',opts,()=>{
  assert.equal(typeof chat.clearDeniedScheduleResults,'function')
  const publicMessages=[{id:'p-q',role:'user',content:'图书馆开放时间'},{id:'p-a',role:'assistant',content:'公共说明'}]
  const other=pair('another-owner','其他账号合成课'),mine=pair(scope,'已失效合成私有课')
  const messages=[...publicMessages,...mine,...other]
  const cleared=chat.clearDeniedScheduleResults(messages,scope,403)
  assert.deepEqual(cleared,[...publicMessages,...other])
  assert.ok(!JSON.stringify(cleared).includes('已失效合成私有课'))
  assert.equal(messages.length,6,'original history source is not mutated')
  assert.deepEqual(chat.clearDeniedScheduleResults(messages,scope,503),messages)
  assert.deepEqual(chat.clearDeniedScheduleResults(messages,'',403),messages)
})
test('an older owner-bound assistant also clears its adjacent local question, without claiming another owner question',opts,()=>{
  const messages=pair(scope,'合成旧课')
  delete messages[0].scheduleOwner
  assert.deepEqual(chat.clearDeniedScheduleResults(messages,scope,401),[])
  messages[0].scheduleOwner='another-owner'
  assert.deepEqual(chat.clearDeniedScheduleResults(messages,scope,401),[messages[0]])
})
test('denial retains only read intent so followups stay private and teaching scope cannot silently become student scope',opts,()=>{
  assert.equal(typeof chat.deniedScheduleIntent,'function')
  const failed={...scheduleQuery(day,day,{perspective:'TEACHER',selection:'AT',anchor:`${day}T08:30:00`,course:'失效课程名'}),focus:`${day}T08:30:00`,focusName:'失效课程名'}
  const intent=chat.deniedScheduleIntent(failed)
  assert.deepEqual(intent,scheduleQuery(day,day,{perspective:'TEACHER'}))
  const messages=[{role:'user',content:'明天呢',localSchedule:true,scheduleOwner:scope},{role:'assistant',content:'权限不足，未读取',localSchedule:true,scheduleQuery:{...intent,scope,awaiting:true,resolved:false},scheduleResult:null}]
  const previous=chat.previousScheduleQuery(messages,scope)
  const next=planScheduleQuestion('明天呢',{today:day,previous})
  assert.deepEqual(next,scheduleQuery('2026-10-21','2026-10-21',{perspective:'TEACHER'}))
  assert.equal(resolveTeachingWorkflow('明天呢',{today:day,scope,previous:previousTeachingWorkflow(messages,scope)}),null)
  assert.equal(chat.previousScheduleQuery(messages,'other-owner'),null)
})
