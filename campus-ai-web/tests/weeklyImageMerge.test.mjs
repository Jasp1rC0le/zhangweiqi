import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeWeeklyImage } from '../src/utils/weeklyImageMerge.js'
const course=(extra={})=>({name:'合成课程',weekday:1,startPeriod:1,endPeriod:2,weeks:[8,9,10],room:'测试教室',teacher:'',...extra})
const metadata={firstMonday:'2026-09-07',semester:'2026秋',week:9}
test('a single-week screenshot replaces only that week while other weeks and labels survive',()=>{
  const old=course(),schedule={semester:'原学期名称',firstMonday:metadata.firstMonday,courses:[old]}
  const result=mergeWeeklyImage(schedule,[course({room:'新教室',weeks:[9]})],metadata)
  assert.deepEqual(result.courses.find(c=>c.room==='测试教室').weeks,[8,10]);assert.deepEqual(result.courses.find(c=>c.room==='新教室').weeks,[9]);assert.equal(result.metadata.semester,'原学期名称');assert.deepEqual(old.weeks,[8,9,10])
})
test('same unchanged course combines weeks and unique existing teacher metadata is retained',()=>{
  const result=mergeWeeklyImage({semester:'原学期',firstMonday:metadata.firstMonday,courses:[course({teacher:'已填教师'})]},[course({weeks:[9]})],metadata)
  assert.equal(result.courses.length,1);assert.deepEqual(result.courses[0].weeks,[8,9,10]);assert.equal(result.courses[0].teacher,'已填教师')
})
test('unknown anchors and ambiguous teachers do not claim a match or a person',()=>{
  const incoming=[course({weeks:[9]})],schedule={semester:'原学期',firstMonday:metadata.firstMonday,courses:[course({teacher:'教师甲'}),course({teacher:'教师乙'})]}
  assert.equal(mergeWeeklyImage(schedule,incoming,{...metadata,firstMonday:''}).courses,incoming)
  const result=mergeWeeklyImage(schedule,incoming,metadata);assert.equal(result.courses.find(c=>c.weeks.includes(9)).teacher,undefined)
})
