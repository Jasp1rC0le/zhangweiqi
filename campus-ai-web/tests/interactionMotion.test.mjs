import { test } from 'node:test'
import assert from 'node:assert/strict'
import { animateContentChange, stopContentMotion, installWorkspaceMotion } from '../src/utils/interactionMotion.js'
import { answerDisclosure, disclosedAnswerText } from '../src/utils/answerDisclosure.js'

function fixture() {
  const calls = [], effects = []
  const element = { animate(frames, options) {
    calls.push({frames,options})
    let done
    const effect={finished:new Promise(resolve=>{done=resolve}),cancelled:0,cancel(){this.cancelled++},done:()=>done()}
    effects.push(effect)
    return effect
  } }
  return {element,calls,effects}
}

test('content updates animate the existing node without changing layout or waiting on an action', () => {
  const f=fixture()
  const effect=animateContentChange(f.element,{})
  assert.equal(effect,f.effects[0])
  assert.equal(f.calls[0].options.duration,180)
  assert.equal(f.calls[0].options.fill,'none')
  for(const frame of f.calls[0].frames)assert.deepEqual(Object.keys(frame).sort(),['opacity','transform'])
  stopContentMotion(f.element);assert.equal(effect.cancelled,1)
})

test('rapid switching retargets from current paint and late completion cannot retire a newer effect', async () => {
  const f=fixture()
  animateContentChange(f.element,{})
  animateContentChange(f.element,{getComputedStyle:()=>({opacity:'.82',transform:'matrix(1,0,0,1,0,2)'})})
  assert.equal(f.effects[0].cancelled,1)
  assert.equal(f.calls[1].frames[0].opacity,'.82')
  f.effects[0].done();await Promise.resolve()
  stopContentMotion(f.element);assert.equal(f.effects[1].cancelled,1)
})

test('reduced motion and missing browser effects keep the real content available', () => {
  const f=fixture();animateContentChange(f.element,{})
  assert.equal(animateContentChange(f.element,{matchMedia:()=>({matches:true})}),null)
  assert.equal(f.effects[0].cancelled,1)
  assert.equal(f.calls.length,1)
  assert.equal(animateContentChange({},{}),null)
  assert.equal(animateContentChange({animate(){throw new Error('unsupported')}},{}),null)
})

test('workspace disclosure enhancement preserves native toggling and ignores authentication surfaces', () => {
  let handler,removed=false
  const doc={addEventListener(type,fn,capture){assert.equal(type,'toggle');assert.equal(capture,true);handler=fn},removeEventListener(type,fn,capture){removed=type==='toggle'&&fn===handler&&capture}}
  const f=fixture();const cleanup=installWorkspaceMotion(doc,{})
  const detail={tagName:'DETAILS',open:false,closest:()=>({}),children:[{tagName:'SUMMARY'},Object.assign(f.element,{tagName:'FORM'})]}
  handler({target:detail});assert.equal(f.calls.length,0)
  detail.open=true;handler({target:detail});assert.equal(f.calls.length,1)
  detail.closest=()=>null;handler({target:detail});assert.equal(f.calls.length,1)
  cleanup();assert.equal(removed,true)
})

test('AI labelling distinguishes generated replies from deterministic personal tools', () => {
  assert.equal(answerDisclosure({role:'user'}),'')
  assert.equal(answerDisclosure({role:'assistant',content:'model'}),'AI生成')
  assert.equal(answerDisclosure({role:'assistant',localSchedule:true}),'课表查询')
  assert.equal(answerDisclosure({role:'assistant',localSchedule:true,scheduleNarration:{mode:'model'}}),'AI辅助表述')
  for(const field of ['localAction','academic','workflow','action'])assert.equal(answerDisclosure({role:'assistant',[field]:{}}),'业务工具')
})

test('copied replies keep a truthful origin notice and the complete original text', () => {
  assert.equal(disclosedAnswerText({role:'assistant',content:'第一行\n第二行'}),'【Campthink AI 生成内容，请核实】\n\n第一行\n第二行')
  assert.equal(disclosedAnswerText({role:'assistant',localSchedule:true,content:'本人课表'}),'【Campthink 业务查询结果】\n\n本人课表')
})
