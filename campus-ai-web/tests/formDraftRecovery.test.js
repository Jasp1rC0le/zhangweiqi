import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, nextTick, shallowRef } from 'vue'
import { createDraftRecovery, DRAFT_TTL_MS } from '../src/utils/draftRecovery.js'
import { projectDraftSchema, wallDraftSchema, feedbackDraftSchema, reviewDraftSchema, projectRecoveryConflict, reviewRecoveryConflict } from '../src/utils/formDraftSchemas.js'
import { useFormDraftRecovery } from '../src/utils/useFormDraftRecovery.js'
import { emptyProject, newRequirement } from '../src/utils/projectStudio.js'

const id='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222'
const user={id:11,schoolId:3}
const project=()=>({id,projectId:other,baseRevision:2,archived:false,content:{...emptyProject(),title:'未保存实验记录',brief:'按原始数据解释误差'}})
const wall=()=>({post:{id,category:'experiment',title:'触发设置问题',body:'已记录型号和量程'},reply:{id:other,postId:id,body:'先核对教师给出的接线图'}})
const feedback=()=>({id,subject:'反馈',message:'尚未发送的建议'})
const review=()=>({id,revision:1,baseNote:'已发送意见',note:'尚未发送的改动'})
function harness(schema) {
  const values=new Map(),state=shallowRef({enabled:false,error:''})
  let time=100000,revision='a',fail=false
  const storage={getItem:k=>values.get(k),setItem:(k,v)=>{if(fail)throw new Error('quota');values.set(k,v)},removeItem:k=>values.delete(k)}
  const create=()=>createDraftRecovery({storage,revision:()=>revision,now:()=>time,key:'test-form',schema,changed:s=>{state.value=s}})
  const recovery=create();recovery.bind(user)
  return {recovery,state,values,create,advance:v=>{time+=v},revision:v=>{revision=v},fail:()=>{fail=true}}
}
for(const [name,schema,make] of [['project',projectDraftSchema,project],['wall',wallDraftSchema,wall],['feedback',feedbackDraftSchema,feedback],['review',reviewDraftSchema,review]]){
  test(`${name}: opt-in, refresh and server-confirmed identity required`,()=>{
    const h=harness(schema),entry=make()
    assert.equal(h.recovery.save([entry],null),false);assert.equal(h.values.size,0)
    assert.equal(h.recovery.setEnabled(true,[entry],null),true)
    const reload=h.create();assert.equal(reload.snapshot(),null);reload.bind(user)
    assert.deepEqual(reload.snapshot().entries,[entry])
  })
  test(`${name}: session expiry freezes writes, same account login retains original deadline`,()=>{
    const h=harness(schema),entry=make();h.recovery.setEnabled(true,[entry],null)
    h.recovery.suspend();assert.equal(h.recovery.save([],null),false);assert.equal(h.recovery.snapshot(),null)
    h.advance(DRAFT_TTL_MS-1);h.recovery.bind(user);h.revision('b');h.recovery.rebindRevision()
    assert.deepEqual(h.recovery.snapshot().entries,[entry]);h.advance(1)
    assert.equal(h.recovery.snapshot(),null);assert.equal(h.values.size,0)
  })
  test(`${name}: account/school changes and explicit logout erase local copies`,()=>{
    for(const identity of [{id:12,schoolId:3},{id:11,schoolId:4},null]){
      const h=harness(schema);h.recovery.setEnabled(true,[make()],null)
      if(identity)h.recovery.bind(identity);else h.recovery.reset()
      assert.equal(h.recovery.snapshot(),null);assert.equal(h.values.size,0)
    }
  })
  test(`${name}: failed writes remove stale copies without mutating editor content`,()=>{
    const h=harness(schema),entry=make();h.recovery.setEnabled(true,[entry],null);h.fail()
    assert.equal(h.recovery.save([entry],null),false);assert.equal(h.values.size,0)
    assert.deepEqual(entry,make());assert.ok(h.state.value.error)
  })
  test(`${name}: malformed persisted shape is discarded before rendering`,()=>{
    const h=harness(schema);h.recovery.setEnabled(true,[make()],null)
    const record=JSON.parse(h.values.get('test-form'));record.entries=[{id:'wrong',post:{},content:{}}]
    h.values.set('test-form',JSON.stringify(record));const reload=h.create();reload.bind(user)
    assert.equal(reload.snapshot(),null);assert.equal(h.values.size,0)
  })
}
test('project: incomplete requirements and cleared numeric inputs are recoverable',()=>{
  const entry=project();entry.content.requirements=[newRequirement('')];entry.content.dataSheet.tolerancePercent=''
  entry.content.title='';entry.content.deadline=''
  const h=harness(projectDraftSchema);assert.equal(h.recovery.setEnabled(true,[entry],null),true)
  assert.deepEqual(h.recovery.snapshot().entries,[entry])
})
test('feedback: dedicated personal fields and extra server metadata are never cached',()=>{
  const h=harness(feedbackDraftSchema)
  h.recovery.setEnabled(true,[{...feedback(),name:'exclude-me',contact:'exclude-me',userId:'exclude-me',token:'exclude-me'}],null)
  assert.equal(h.values.get('test-form').includes('exclude-me'),false)
  assert.deepEqual(h.recovery.snapshot().entries,[feedback()])
})
test('review: shared material and permissions are excluded from local recovery',()=>{
  const h=harness(reviewDraftSchema)
  h.recovery.setEnabled(true,[{...review(),content:{brief:'exclude-me'},canReview:true,recipient:'exclude-me'}],null)
  assert.equal(h.values.get('test-form').includes('exclude-me'),false)
  assert.deepEqual(h.recovery.snapshot().entries,[review()])
})
test('feedback and review: text, IDs, base note and version are bounded',()=>{
  for(const [schema,entry] of [[feedbackDraftSchema,{...feedback(),message:'x'.repeat(5001)}],
    [feedbackDraftSchema,{...feedback(),id:'../other'}], [reviewDraftSchema,{...review(),note:'x'.repeat(2001)}],
    [reviewDraftSchema,{...review(),baseNote:null}],[reviewDraftSchema,{...review(),revision:0}]]){
    const h=harness(schema);assert.equal(h.recovery.setEnabled(true,[entry],null),false);assert.equal(h.values.size,0)
  }
})
test('review: restore requires current permission, original invitation and unchanged prior note',()=>{
  const entry=review(),remote={canReview:true,entry:{id,revision:1,reviewNote:entry.baseNote}}
  assert.equal(reviewRecoveryConflict(entry,remote),false)
  for(const detail of [null,{...remote,canReview:false},{...remote,entry:{...remote.entry,id:other}},
    {...remote,entry:{...remote.entry,revision:2}},{...remote,entry:{...remote.entry,reviewNote:'另一页面的新意见'}}])
    assert.equal(reviewRecoveryConflict(entry,detail),true)
})
test('project: nested metadata, access permissions and credentials never enter the snapshot',()=>{
  const entry=project();entry.token='do-not-store';entry.content.owner='do-not-store';entry.content.dataSheet.attachment='do-not-store'
  entry.content.requirements=[{...newRequirement('证据'),role:'do-not-store'}]
  const h=harness(projectDraftSchema);h.recovery.setEnabled(true,[entry],null)
  assert.equal(h.values.get('test-form').includes('do-not-store'),false)
})
test('project: bounds reject invalid fields and duplicate slots instead of silently truncating',()=>{
  for(const mutate of [e=>{e.content.brief='x'.repeat(20001)},e=>{e.content.requirements=Array(81).fill(newRequirement())},e=>{e.baseRevision=0},e=>{e.projectId='../private'},e=>{e.content.dataSheet.csv={}}]){
    const h=harness(projectDraftSchema),entry=project();mutate(entry)
    assert.equal(h.recovery.setEnabled(true,[entry],null),false);assert.equal(h.values.size,0)
  }
  const h=harness(projectDraftSchema);assert.equal(h.recovery.setEnabled(true,[project(),project()],null),false)
})
test('project: original version must match; another/newer/missing project cannot be overwritten',()=>{
  const entry=project()
  assert.equal(projectRecoveryConflict(entry,{id:other,revision:2}),false)
  for(const remote of [null,{id,revision:2},{id:other,revision:3}])assert.equal(projectRecoveryConflict(entry,remote),true)
  assert.equal(projectRecoveryConflict({...entry,projectId:null,baseRevision:null},null),false)
})
test('wall: topic and reply retain different request IDs and exact parent on reload',()=>{
  const h=harness(wallDraftSchema),entry=wall();h.recovery.setEnabled(true,[entry],null)
  const reload=h.create();reload.bind(user)
  const saved=reload.snapshot().entries[0]
  assert.equal(saved.post.id,id);assert.equal(saved.reply.id,other);assert.equal(saved.reply.postId,id)
  // Acknowledging a topic must not clear an unsent reply.
  h.recovery.save([{post:null,reply:saved.reply}],null)
  assert.deepEqual(h.recovery.snapshot().entries,[{post:null,reply:entry.reply}])
})
test('wall: unknown category, excessive text and invalid parent are rejected',()=>{
  for(const mutate of [e=>{e.post.category='admin'},e=>{e.post.body='x'.repeat(5001)},e=>{e.reply.body='x'.repeat(2001)},e=>{e.reply.postId='../../other'}]){
    const h=harness(wallDraftSchema),entry=wall();mutate(entry)
    assert.equal(h.recovery.setEnabled(true,[entry],null),false)
  }
})
test('UI recovery controller does not overwrite a pending snapshot with new typing',async()=>{
  const h=harness(wallDraftSchema);h.recovery.setEnabled(true,[wall()],null)
  const scope=effectScope();let input={post:{...wall().post,body:'新的输入'},reply:null},controller
  scope.run(()=>{controller=useFormDraftRecovery(h,()=>[input])})
  assert.ok(controller.pending.value);assert.equal(controller.save(),false)
  assert.equal(h.recovery.snapshot().entries[0].post.body,wall().post.body)
  const recovered=controller.peek();input=recovered;controller.restored();await nextTick()
  assert.equal(controller.pending.value,null);assert.equal(h.recovery.snapshot().entries[0].post.id,id)
  controller.discard();assert.equal(h.values.size,0);assert.deepEqual(input,wall());scope.stop()
})
test('UI recovery controller binds after mount but does not mistake its own opt-in for pending data',()=>{
  const h=harness(projectDraftSchema),scope=effectScope();let controller
  scope.run(()=>{controller=useFormDraftRecovery(h,()=>[project()])})
  controller.toggle(true);assert.equal(controller.pending.value,null)
  h.recovery.suspend();h.recovery.bind(user);assert.deepEqual(controller.pending.value,project())
  h.recovery.reset();assert.equal(controller.pending.value,null);scope.stop()
})
test('unload protection remains unless the exact current form is durably recoverable',()=>{
  const h=harness(projectDraftSchema),entry=project()
  assert.equal(h.recovery.matches([entry]),false)
  h.recovery.setEnabled(true,[entry],null);assert.equal(h.recovery.matches([entry]),true)
  entry.content.title+='改动';assert.equal(h.recovery.matches([entry]),false)
  h.recovery.save([entry],null);assert.equal(h.recovery.matches([entry]),true)
  h.advance(DRAFT_TTL_MS);assert.equal(h.recovery.matches([entry]),false)
  h.recovery.suspend();assert.equal(h.recovery.matches([entry]),false)
})
