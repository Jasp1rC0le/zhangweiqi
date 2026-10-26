import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate} from '@vue/compiler-sfc'
import {privateOriginalIssue,canRetryAttachment} from '../src/utils/attachmentRecovery.js'
import {createPrivateMaterialFixture} from '../design/privateMaterialFixture.js'

const opts={timeout:5000},file={name:'合成图片.png',size:128}
test('raw retention has file limits independent of OCR success',opts,()=>{
  assert.equal(privateOriginalIssue(file),null)
  assert.equal(privateOriginalIssue({name:'原件.PDF',size:10*1024*1024}),null)
  for(const value of [null,{...file,size:0},{...file,size:NaN},{...file,size:10*1024*1024+1},{...file,name:'program.exe'},{...file,name:'a'.repeat(181)+'.png'}])
    assert.ok(privateOriginalIssue(value))
})
test('retry is blocked by active work or an unknown original receipt, not a completed raw save',opts,()=>{
  const state={file,failed:'empty OCR',busy:false,storeBusy:false,disabled:false}
  assert.equal(canRetryAttachment(state),true)
  for(const change of [{busy:true},{storeBusy:true},{disabled:true},{failed:''},{file:null},{requestId:'pending',receipt:null}])
    assert.equal(canRetryAttachment({...state,...change}),false)
  assert.equal(canRetryAttachment({...state,requestId:'known',receipt:{id:'saved'}}),true)
})
test('DEV raw retention without recognized text is real idempotent storage, not a success placeholder',opts,async()=>{
  let owner={id:1,schoolId:1}
  const adapter=createPrivateMaterialFixture({principal:()=>owner})
  const body=new FormData(),id=crypto.randomUUID(),original=new File(['synthetic image bytes'],'original.png',{type:'image/png'})
  body.append('file',original);body.append('requestId',id);body.append('text','')
  const first=(await adapter({url:'/api/private-materials',method:'post',data:body})).data
  assert.equal(first.textLength,0)
  assert.equal((await adapter({url:'/api/private-materials',method:'post',data:body})).data.id,first.id)
  const list=(await adapter({url:'/api/private-materials',method:'get',params:{page:0}})).data
  assert.equal(list.total,1)
  assert.equal((await adapter({url:`/api/private-materials/${first.id}/text`,method:'get'})).data.text,'')
  const blob=(await adapter({url:`/api/private-materials/${first.id}/download`,method:'get'})).data
  assert.equal(await blob.text(),'synthetic image bytes')
  body.set('text','later recognition')
  await assert.rejects(adapter({url:'/api/private-materials',method:'post',data:body}),e=>e.response?.status===409)
  owner={id:2,schoolId:1}
  await assert.rejects(adapter({url:`/api/private-materials/${first.id}/download`,method:'get'}),e=>e.response?.status===404)
})
test('recovery controls compile outside parsed results and reuse owner generation cancellation',opts,()=>{
  const filename='src/components/ChatAttachmentPreview.vue'
  const source=readFileSync(new URL('../'+filename,import.meta.url),'utf8')
  const {descriptor,errors}=parse(source)
  assert.deepEqual(errors,[])
  compileScript(descriptor,{id:filename})
  assert.deepEqual(compileTemplate({source:descriptor.template.content,filename,id:filename}).errors,[])
  assert.match(source,/@click="recognizeOriginal"/)
  assert.match(source,/watch\(\(\) => props.scope, reset, \{ flush: 'sync' \}\)/)
  assert.match(source,/current !== sequence/)
  assert.match(source,/uploadRequestId&&!storeInfo.value/)
  assert.match(source,/本次只保留原文件，不附识别文字/)
  const details=descriptor.template.content.indexOf('<details v-if="destinations &&')
  assert.ok(details>descriptor.template.content.indexOf('</template>\n      <details'))
  assert.doesNotMatch(source,/localStorage|sessionStorage|sendMessageStream/)
})
