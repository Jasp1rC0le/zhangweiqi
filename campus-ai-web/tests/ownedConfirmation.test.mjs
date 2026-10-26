import test from 'node:test'
import assert from 'node:assert/strict'
import { createOwnedConfirmationFence } from '../src/utils/ownedConfirmation.js'
const opts={timeout:2000}
test('owner changes dismiss only the captured dialog and unchanged owner does not dismiss',opts,()=>{
  let owner='admin-a',closed=0;const root={id:'own-dialog'}
  const f=createOwnedConfirmationFence({scope:()=>owner,active:()=>true,find:()=>root,close:dialog=>{assert.equal(dialog,root);closed++;return true}})
  assert.equal(f.check(),false);assert.equal(closed,0);owner='student-b';assert.equal(f.check(),true);f.check();assert.equal(closed,1)
})
test('queued dialog is dismissed when it appears after invalidation and observer is released',opts,()=>{
  let root=null,notify,stopped=0,closed=0
  const f=createOwnedConfirmationFence({scope:()=> 'admin-a',active:()=>true,find:()=>root,close:dialog=>{assert.equal(dialog.id,'owned');closed++;return true},observe:cb=>{notify=cb;return ()=>stopped++}})
  f.invalidate();assert.equal(closed,0);notify();assert.equal(closed,0);root={id:'owned'};notify();assert.equal(closed,1);assert.equal(stopped,1);f.dispose();assert.equal(stopped,1)
})
test('unmount invalidates the owned dialog even if its captured scope did not change',opts,()=>{
  let count=0;const f=createOwnedConfirmationFence({scope:()=> 'a',active:()=>true,find:()=>({}),close:()=>{count++;return true}})
  f.invalidate();assert.equal(count,1)
})
