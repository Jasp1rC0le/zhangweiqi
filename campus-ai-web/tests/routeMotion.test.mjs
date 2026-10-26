import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {parse as parseSfc} from '@vue/compiler-sfc'
import {parse} from '@babel/parser'

const source=fs.readFileSync(new URL('../src/App.vue',import.meta.url),'utf8')
const script=parseSfc(source).descriptor.scriptSetup.content
const fn=parse(script,{sourceType:'module'}).program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='enterWorkspace')
const actual=script.slice(fn.start,fn.end).replace("await import('@/views/ChatView.vue')",'await preloadWorkspace()')
const helperUrl=new URL('../src/utils/routeMotion.js',import.meta.url)
const helpers=fs.existsSync(helperUrl)?await import(helperUrl):{}
function scenario({animation,failedNavigation=false}={}){
  const classes=new Set(),state={pushes:0,resolved:0,rejected:0}
  const workspace=animation===null?{}:{animate:()=>animation}
  const context={arriving:{value:false},preloadWorkspace:async()=>{},nextTick:async()=>{},
    router:{push:async()=>{state.pushes++;return failedNavigation?{failed:true}:undefined}},
    isNavigationFailure:value=>Boolean(value?.failed),window:{matchMedia:()=>({matches:false})},
    document:{documentElement:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},querySelector:()=>workspace},
    performance:{clearMarks(){},mark(){}},...helpers}
  const enter=vm.runInNewContext(actual+'\nenterWorkspace',context)
  return {state,classes,context,run:()=>enter({detail:{to:'/chat',resolve:()=>state.resolved++,reject:()=>state.rejected++}})}
}
test('a cancelled fallback animation cannot report a successful navigation as login failure',async()=>{
  const s=scenario({animation:{finished:Promise.reject(new Error('synthetic cancelled animation'))}})
  await s.run();assert.equal(s.state.pushes,1);assert.equal(s.state.resolved,1);assert.equal(s.state.rejected,0)
  assert.equal(s.context.arriving.value,false);assert.equal(s.classes.size,0)
})
test('a browser without element animation support still completes the real navigation',async()=>{
  const s=scenario({animation:null});await s.run()
  assert.equal(s.state.pushes,1);assert.equal(s.state.resolved,1);assert.equal(s.state.rejected,0)
})
test('real navigation failure remains a failure and clears arrival state',async()=>{
  const s=scenario({failedNavigation:true});await s.run()
  assert.equal(s.state.pushes,1);assert.equal(s.state.resolved,0);assert.equal(s.state.rejected,1)
  assert.equal(s.context.arriving.value,false);assert.equal(s.classes.size,0)
})
test('visual settlement handles completion, cancellation and unavailable animation',async()=>{
  assert.equal(await helpers.settleVisualMotion({finished:Promise.resolve()}),'finished')
  assert.equal(await helpers.settleVisualMotion({finished:Promise.reject(new Error('cancelled'))}),'cancelled')
  assert.equal(await helpers.settleVisualMotion(undefined),'none')
})
test('a stalled visual is bounded and cancelled without another navigation',async()=>{
  let cancelled=0
  const result=await helpers.settleVisualMotion({finished:new Promise(()=>{}),cancel:()=>cancelled++},10)
  assert.equal(result,'timed-out');assert.equal(cancelled,1)
})
test('a browser cancellation exception still cannot reject visual settlement',async()=>{
  const result=await helpers.settleVisualMotion({finished:new Promise(()=>{}),cancel:()=>{throw new Error('synthetic browser cancellation')}},10)
  assert.equal(result,'timed-out')
})
test('outgoing route is inert and hidden from accessibility until cancellation restores it',()=>{
  const attributes=new Map(),element={inert:false,setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k)}
  helpers.retireRoutePage(element);assert.equal(element.inert,true);assert.equal(attributes.get('aria-hidden'),'true')
  helpers.activateRoutePage(element);assert.equal(element.inert,false);assert.equal(attributes.has('aria-hidden'),false)
})
