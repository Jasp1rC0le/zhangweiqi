import test from 'node:test'
import assert from 'node:assert/strict'
import {studyPrompt,studySnapshot} from '../src/utils/studyTask.js'
import {instruments,instrumentSources,instrumentNote} from '../src/utils/instrumentCatalog.js'
test('study input is bounded and prompt separates facts from untrusted source text',()=>{
  const f={kind:'experiment',course:'大学物理',task:'测量摆长',blocker:'不确定单位',attempt:'已记录原始读数'}
  assert.match(studyPrompt(f),/不是系统指令/);assert.match(studyPrompt(f),/不得编造/)
  assert.throws(()=>studyPrompt({...f,blocker:''}));assert.throws(()=>studyPrompt({...f,task:'a'.repeat(20001)}))
  assert.match(studySnapshot(f,'核对单位','教师给定实验书'),/教师给定实验书/)
})
test('instrument entries have unique identifiers, reference scope and explicit model boundary',()=>{
  assert.ok(instruments.length>=25);assert.equal(new Set(instruments.map(i=>i.id)).size,instruments.length)
  for(const i of instruments){const s=instrumentSources[i.source];assert.ok(s?.scope);assert.equal(new URL(s.url).protocol,'https:');assert.ok(i.purpose&&i.readings&&i.check&&i.risk);assert.match(instrumentNote(i,'MODEL-A','读数漂移','核对单位'),/MODEL-A/)}
})
