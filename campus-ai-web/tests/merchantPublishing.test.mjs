import test from 'node:test'
import assert from 'node:assert/strict'
import { merchantPhotoIssue, merchantBatchIssue, merchantFileName, publicationMatches } from '../src/utils/merchantPublishing.js'
const file=(extra={})=>({name:'店铺.png',type:'image/png',size:1024,...extra})
const row=(extra={})=>({file:file(),canteenId:1,name:'食堂小店',location:'二楼',...extra})
test('merchant batch bounds image count size and supported MIME without OCR',()=>{
 assert.equal(merchantPhotoIssue([file(),file()]),'')
 for(const fs of [[],Array(11).fill(file()),[file({size:0})],[file({size:6*1024*1024})],[file({type:'image/svg+xml'})],Array(7).fill(file({size:5*1024*1024}))]) assert.ok(merchantPhotoIssue(fs))
})
test('direct merchant publication needs only photo name location and a valid canteen',()=>{
 assert.equal(merchantBatchIssue([row()]),'')
 for(const change of [{name:' '},{location:''},{canteenId:''},{canteenId:-1},{name:'店'.repeat(121)}]) assert.ok(merchantBatchIssue([row(change)]))
 assert.ok(merchantBatchIssue([row(),row({name:' 食堂小店 '})]))
 assert.equal(merchantBatchIssue([row(),row({canteenId:2})]),'')
})
test('camera file names do not become guessed business names',()=>{
 assert.equal(merchantFileName('IMG_2942.jpeg'),'');assert.equal(merchantFileName('客家面.png'),'客家面')
})
test('published batch acknowledgement must match every row before drafts can be discarded',()=>{
 const input=[{canteenId:1,name:'小店',location:'二楼'}],data=[{...input[0],id:12,status:'PUBLISHED'}]
 assert.equal(publicationMatches(data,input),true)
 for(const result of [null,[],[{...data[0],status:'DRAFT'}],[{...data[0],name:'另一家'}],[{...data[0],canteenId:2}]]) assert.equal(publicationMatches(result,input),false)
})
