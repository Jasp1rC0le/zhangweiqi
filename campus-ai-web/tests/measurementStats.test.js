import test from 'node:test'
import assert from 'node:assert/strict'
import {describeValues,describePairs} from '../src/utils/measurementStats.js'
import {emptyDataSheet,inspectDataSheet} from '../src/utils/projectDataCheck.js'
test('descriptive statistics use sample denominator and do not mutate or invent uncertainty',()=>{
  const values=[1,2,3,4], result=describeValues(values)
  assert.equal(result.mean,2.5);assert.equal(result.median,2.5)
  assert.ok(Math.abs(result.sampleStdDev-Math.sqrt(5/3))<1e-12)
  assert.deepEqual(values,[1,2,3,4])
  assert.equal(describeValues([7]).sampleStdDev,null)
  assert.equal(describeValues([]),null)
  assert.equal(describeValues([NaN]),null)
  assert.equal(describeValues([1e12,1e12+1,1e12+2]).sampleStdDev,1)
})
test('paired errors distinguish signed bias from MAE and RMSE',()=>{
  const result=describePairs([{measured:8,reference:10},{measured:12,reference:10}])
  assert.deepEqual(result,{count:2,bias:0,mae:2,rmse:2})
  assert.equal(describePairs([]),null)
})
test('paired summary excludes invalid rows and reports the actual calculated sample size',()=>{
  const sheet={...emptyDataSheet(),source:'synthetic',csv:'m,r\n8,10\n12,10\n,10\n2,0',measuredColumn:0,referenceColumn:1,unit:'V',sameUnitConfirmed:true}
  const result=inspectDataSheet(sheet)
  assert.equal(result.rows.length,4);assert.equal(result.pairedSummary.count,2)
  assert.equal(result.pairedSummary.rmse,2)
  assert.equal(result.issues.filter(i=>['zero-reference','non-numeric'].includes(i.code)).length,2)
  sheet.sameUnitConfirmed=false
  assert.equal(inspectDataSheet(sheet).pairedSummary,null)
})
