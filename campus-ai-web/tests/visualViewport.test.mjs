import test from 'node:test'
import assert from 'node:assert/strict'
import { visualViewportBox, observeVisualViewport } from '../src/utils/visualViewport.js'

test('overlay keyboard accounts for visible height and its layout-relative pan', () => {
  assert.deepEqual(visualViewportBox({layoutHeight:844,height:350,offsetTop:170,baselineHeight:844,focused:true}),{height:350,top:170,keyboardOpen:true})
})
test('resized layout keyboard still uses the pre-focus baseline', () => {
  assert.deepEqual(visualViewportBox({layoutHeight:350,height:350,baselineHeight:844,focused:true}),{height:350,top:0,keyboardOpen:true})
})
test('pinch zoom stays browser-owned instead of reflowing the keyboard shell', () => {
  assert.deepEqual(visualViewportBox({layoutHeight:844,height:350,offsetTop:170,scale:2,baselineHeight:844,focused:true}),{height:844,top:0,keyboardOpen:false})
})
test('invalid viewport data falls back safely and pan cannot move beyond layout bounds', () => {
  assert.deepEqual(visualViewportBox({layoutHeight:NaN,height:0,offsetTop:Infinity}),{height:844,top:0,keyboardOpen:false})
  assert.equal(visualViewportBox({layoutHeight:844,height:350,offsetTop:2000}).top,494)
  assert.equal(visualViewportBox({layoutHeight:844,height:900,offsetTop:-10}).height,844)
})
function fixture(withVisual=true){
  const listeners=new Map(),frames=new Map();let sequence=0
  const target=name=>({addEventListener(type,fn){listeners.set(name+':'+type,fn)},removeEventListener(type,fn){assert.equal(listeners.get(name+':'+type),fn);listeners.delete(name+':'+type)}})
  const win={...target('window'),innerHeight:844,innerWidth:390,document:{documentElement:{clientHeight:844,clientWidth:390},activeElement:{matches:()=>false}},requestAnimationFrame(fn){const id=++sequence;frames.set(id,fn);return id},cancelAnimationFrame(id){frames.delete(id)}}
  if(withVisual)win.visualViewport={...target('visual'),height:844,offsetTop:0,scale:1}
  const flush=()=>{for(const [id,fn] of frames){frames.delete(id);fn()}}
  return{win,listeners,frames,flush,fire:name=>listeners.get(name)?.()}
}
test('resize and visual pan coalesce; cleanup rejects late frames and removes all listeners', () => {
  const f=fixture(),seen=[],observer=observeVisualViewport(f.win,box=>seen.push(box));assert.equal(seen.length,1)
  f.win.document.activeElement.matches=()=>true;f.win.visualViewport.height=360;f.win.visualViewport.offsetTop=130
  f.fire('visual:resize');f.fire('visual:scroll');f.fire('window:focusin');assert.equal(f.frames.size,1);f.flush()
  assert.deepEqual(seen.at(-1),{height:360,top:130,keyboardOpen:true})
  f.win.visualViewport.offsetTop=180;f.fire('visual:scroll');f.flush();assert.equal(seen.at(-1).top,180)
  f.fire('visual:scroll');f.flush();assert.equal(seen.length,3)
  f.fire('visual:resize');const last=f.frames.values().next().value;observer.stop();assert.equal(f.listeners.size,0);assert.equal(f.frames.size,0);last();assert.equal(seen.length,3)
})
test('orientation refresh resets the baseline and missing VisualViewport keeps a working fallback', () => {
  const f=fixture(),seen=[],o=observeVisualViewport(f.win,x=>seen.push(x));f.win.document.activeElement.matches=()=>true
  f.win.document.documentElement.clientWidth=844;f.win.document.documentElement.clientHeight=390;f.win.visualViewport.height=390;f.fire('window:orientationchange');f.flush();assert.equal(seen.at(-1).keyboardOpen,false);o.stop()
  const g=fixture(false),values=[],p=observeVisualViewport(g.win,x=>values.push(x));g.win.document.documentElement.clientHeight=620;g.fire('window:resize');g.flush();assert.equal(values.at(-1).height,620);p.stop()
})
