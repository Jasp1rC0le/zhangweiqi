import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {newInstrumentDraft,instrumentSnapshot,instrumentDraftPending,instrumentAlreadyAccepted,instrumentRequest,acceptInstrumentRequest} from '../src/utils/instrumentDrafts.js'
test('separate instrument records retain independent fields and pending states',()=>{
 const a=newInstrumentDraft(),b=newInstrumentDraft();a.model='A';b.model='B';b.symptom='实际现象';assert.equal(instrumentDraftPending(a),true);assert.equal(instrumentDraftPending(b),true);assert.deepEqual(instrumentSnapshot(a),{model:'A',symptom:'',tried:''})
})
test('acknowledging one record never clears another instrument',()=>{
 const a=newInstrumentDraft(),b=newInstrumentDraft();a.model='A';b.model='B';const req=instrumentRequest(b,()=> 'b-request');assert.equal(acceptInstrumentRequest(b,req),true);assert.equal(instrumentAlreadyAccepted(b),true);assert.equal(instrumentDraftPending(b),false);assert.equal(instrumentDraftPending(a),true);assert.equal(a.model,'A')
})
test('unchanged retry keeps request identity while changed payload gets a new identity',()=>{
 const d=newInstrumentDraft();d.model='A';let sequence=0;const next=()=>String(++sequence),first=instrumentRequest(d,next);assert.deepEqual(instrumentRequest(d,next),first);d.symptom='补充';assert.notEqual(instrumentRequest(d,next).requestId,first.requestId);assert.equal(sequence,2)
})
test('an old acknowledgement cannot mark a newer request or changed draft saved',()=>{
 const d=newInstrumentDraft();d.model='A';const first=instrumentRequest(d,()=> '1');d.model='B';assert.equal(acceptInstrumentRequest(d,first),true);assert.equal(instrumentDraftPending(d),true);instrumentRequest(d,()=> '2');assert.equal(acceptInstrumentRequest(d,first),false);assert.equal(instrumentDraftPending(d),true)
})
test('wrong request id or snapshot cannot acknowledge any record',()=>{
 const d=newInstrumentDraft();d.tried='检查铭牌';const r=instrumentRequest(d,()=> 'id');assert.equal(acceptInstrumentRequest(d,{...r,requestId:'other'}),false);assert.equal(acceptInstrumentRequest(d,{...r,snapshot:{...r.snapshot,tried:'不同'}}),false);assert.equal(instrumentDraftPending(d),true)
})
test('an explicitly accepted blank template is not repeatedly appended until it changes',()=>{
 const d=newInstrumentDraft();assert.equal(instrumentDraftPending(d),false);assert.equal(instrumentAlreadyAccepted(d),false);acceptInstrumentRequest(d,instrumentRequest(d,()=> 'blank'));assert.equal(instrumentAlreadyAccepted(d),true);d.symptom='新现象';assert.equal(instrumentAlreadyAccepted(d),false);assert.equal(instrumentDraftPending(d),true)
})
test('submitted snapshots remain detached from later input changes',()=>{
 const d=newInstrumentDraft();d.model='A';const r=instrumentRequest(d,()=> 'id');d.model='B';assert.equal(r.snapshot.model,'A');assert.equal(instrumentSnapshot(d).model,'B')
})
test('standalone and embedded routes preserve pending instruments and use scoped writes',()=>{
 const view=readFileSync(new URL('../src/views/InstrumentView.vue',import.meta.url),'utf8'),project=readFileSync(new URL('../src/views/ProjectStudioView.vue',import.meta.url),'utf8'),library=readFileSync(new URL('../src/components/InstrumentLibrary.vue',import.meta.url),'utf8')
 assert.doesNotMatch(view,/saved\.value\s*\|\|/);assert.match(view,/if\(!library\.value\.hasPending\)await router\.push/);assert.match(view,/signal:ticket\.signal/);assert.match(view,/if\(!ticket\.current\(\)\)return/)
 assert.match(project,/<InstrumentLibrary v-show="section === 'instruments'"/);assert.match(project,/instrumentLibrary\.value\?\.hasPending/);assert.match(project,/markAccepted\(note\)/);assert.match(library,/userSessionGeneration\.value/);assert.match(library,/pendingCount/)
})
