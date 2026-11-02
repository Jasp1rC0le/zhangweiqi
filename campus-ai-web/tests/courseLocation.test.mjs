import test from 'node:test'
import assert from 'node:assert/strict'
import { courseLocation } from '../src/utils/courseLocation.js'

test('grid locations foreground real room codes while details keep the complete original', () => {
  for (const [full, short] of [
    ['工业中心(E5座)E5-513', 'E5-513'],
    ['公共教学楼（D座）D-210', 'D-210'],
    ['综合教学楼(F2座)F2-418', 'F2-418'],
    ['实验教学楼 A2—305', 'A2-305'],
  ]) assert.deepEqual(courseLocation(full), { full, short })
})

test('named gym spaces retain their exact floor and room description', () => {
  const full = '体育馆(G座)G座二楼舞蹈室'
  assert.deepEqual(courseLocation(full), { full, short: '二楼舞蹈室' })
  assert.equal(courseLocation('线上教学').short, '线上教学')
})

test('multiple rooms and missing locations cannot silently become a single guessed room', () => {
  const full = '综合教学楼 F1-110 / F1-112'
  assert.deepEqual(courseLocation(full), { full, short: '多处地点' })
  assert.deepEqual(courseLocation(null), { full: '', short: '地点待补' })
  assert.equal(courseLocation('教学地点待定').full, '教学地点待定')
})
