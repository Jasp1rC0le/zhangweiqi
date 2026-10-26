import test from 'node:test'
import assert from 'node:assert/strict'
import * as voice from '../src/utils/holdToTalk.js'

const opts={timeout:3000}
test('voice availability distinguishes secure context, engine absence and blocked microphone without starting capture',opts,()=>{
  assert.equal(typeof voice.voiceCapability,'function')
  let constructed=0
  class Recognition{constructor(){constructed++}}
  assert.equal(voice.voiceCapability({secureContext:true,recognition:Recognition}).available,true)
  assert.equal(voice.voiceCapability({secureContext:false,recognition:Recognition}).code,'INSECURE')
  assert.equal(voice.voiceCapability({secureContext:undefined,recognition:Recognition}).code,'UNKNOWN')
  assert.equal(voice.voiceCapability({secureContext:true,recognition:undefined}).code,'UNSUPPORTED')
  assert.equal(voice.voiceCapability({secureContext:true,recognition:Recognition,microphoneAllowed:false}).code,'POLICY')
  assert.equal(constructed,0)
})
test('a failed availability check stops before constructing or starting a recognition engine',opts,()=>{
  let constructed=0,state,sent=0
  class Recognition{constructor(){constructed++}start(){}abort(){}}
  const resource=voice.createHoldToTalk({engine:()=>Recognition,owner:()=> 'synthetic-owner',update:value=>state=value,submit:()=>sent++,availability:()=>({available:false,message:'请先使用HTTPS页面'}),timer:()=>1,clear:()=>{}})
  assert.equal(resource.start(),false)
  assert.equal(constructed,0)
  assert.equal(state.phase,'error')
  assert.match(state.message,/HTTPS/)
  assert.equal(sent,0)
  resource.dispose()
})
test('microphone initialization is not advertised as already listening and detached events cannot revive capture',opts,()=>{
  let instance,state,clock=0,owner='synthetic-owner',sent=[]
  class Recognition{constructor(){instance=this}start(){}stop(){}abort(){}}
  const resource=voice.createHoldToTalk({engine:()=>Recognition,owner:()=>owner,update:value=>state=value,submit:(text,id)=>sent.push({text,id}),now:()=>clock,timer:()=>1,clear:()=>{}})
  assert.equal(resource.start(),true);assert.equal(state.phase,'starting')
  resource.move(0);assert.equal(state.phase,'starting')
  instance.onstart();assert.equal(state.phase,'listening')
  instance.onresult({results:[Object.assign([{transcript:'今天什么课'}],{isFinal:true})]})
  instance.onend();assert.equal(state.phase,'ready');assert.equal(sent.length,0)
  clock=600;resource.release();assert.deepEqual(sent,[{text:'今天什么课',id:'synthetic-owner'}])
  assert.equal(instance.onstart,null)
  resource.start();const late=instance.onstart;owner='other-owner';late();assert.notEqual(state.phase,'listening')
  resource.dispose();assert.equal(instance.onstart,null)
})
test('throwing browser constructors and accessors become a recoverable error, not an uncaught event',opts,()=>{
  for(const engine of [()=>{throw new Error('synthetic getter blocked')},()=>class{constructor(){throw new Error('synthetic constructor blocked')}},()=>({})]){
    let state,sent=0
    const resource=voice.createHoldToTalk({engine,owner:()=> 'synthetic-owner',update:value=>state=value,submit:()=>sent++})
    assert.doesNotThrow(()=>assert.equal(resource.start(),false))
    assert.equal(state.phase,'error')
    assert.equal(sent,0)
    resource.dispose()
  }
})
