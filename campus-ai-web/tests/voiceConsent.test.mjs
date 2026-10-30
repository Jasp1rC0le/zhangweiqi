import test from 'node:test'
import assert from 'node:assert/strict'
import {readVoiceConsent,storeVoiceConsent,voiceConsentOwner} from '../src/utils/voiceConsent.js'
function storage(){const values=new Map();return{values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}}
test('confirmed voice choice follows account/school but not conversation or model',()=>{
 const s=storage(),a=voiceConsentOwner('12:1:7:standard:9:true');assert.equal(a,'12:1');assert.equal(readVoiceConsent(s,a),false);assert.equal(storeVoiceConsent(s,a,true),true)
 assert.equal(readVoiceConsent(s,voiceConsentOwner('12:1:8:glm:10:true')),true);assert.equal(readVoiceConsent(s,'13:1'),false);assert.equal(readVoiceConsent(s,'12:2'),false)
 assert.deepEqual(JSON.parse(s.values.values().next().value),{version:1,allowed:true})
})
test('invalid owner, malformed/version-old data, and blocked storage never confer consent',()=>{
 const s=storage();for(const scope of ['undefined:1:7','0:1:7','-1:1:7','1:0:7','1:2evil',null])assert.equal(voiceConsentOwner(scope),'')
 assert.equal(storeVoiceConsent(s,'',true),false);assert.equal(s.values.size,0);storeVoiceConsent(s,'1:2',true);const k=s.values.keys().next().value
 for(const value of ['x','{"version":0,"allowed":true}','{"version":1,"allowed":false}','x'.repeat(200)]){s.values.set(k,value);assert.equal(readVoiceConsent(s,'1:2'),false)}
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};assert.equal(readVoiceConsent(blocked,'1:2'),false);assert.equal(storeVoiceConsent(blocked,'1:2',true),false)
})
test('explicit revocation clears only this owners speech preference',()=>{
 const s=storage();storeVoiceConsent(s,'1:2',true);storeVoiceConsent(s,'3:2',true);storeVoiceConsent(s,'1:2',false);assert.equal(readVoiceConsent(s,'1:2'),false);assert.equal(readVoiceConsent(s,'3:2'),true)
})
