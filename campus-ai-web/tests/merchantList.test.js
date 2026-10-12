import test from 'node:test'
import assert from 'node:assert/strict'
import { selectMerchants } from '../src/utils/merchantList.js'

const shops = [
  { id: 1, canteenId: 1, name: '面食', canteenName: '一食堂', description: 'Noodles', averageScore: 4.5, ratingCount: 2 },
  { id: 2, canteenId: 2, name: '早餐', canteenName: '二食堂', averageScore: null, ratingCount: 0 },
  { id: 3, canteenId: 1, name: '米饭', averageScore: '4.5', ratingCount: '12' },
  { id: 4, canteenId: 2, name: '新店', averageScore: '5', ratingCount: 0 },
]
test('default order is unchanged and returns a separate array', () => {
  assert.deepEqual(selectMerchants(shops), shops)
  assert.notEqual(selectMerchants(shops), shops)
})
test('combines canteen and case-insensitive trimmed search', () => {
  assert.deepEqual(selectMerchants(shops, { canteen: 1, query: ' NOODLES ' }).map(x => x.id), [1])
  assert.deepEqual(selectMerchants(shops, { canteen: 2, query: '面食' }), [])
})
test('ranking puts rated shops first and uses rating counts as tie-breaker', () => {
  assert.deepEqual(selectMerchants(shops, { sort: 'rating' }).slice(0, 2).map(x => x.id), [3, 1])
  assert.deepEqual(shops.map(x => x.id), [1, 2, 3, 4])
})
test('popular sorting accepts numeric strings', () => {
  assert.deepEqual(selectMerchants(shops, { sort: 'popular' }).map(x => x.id), [3, 1, 2, 4])
})
test('empty results and absent optional fields are safe', () => {
  assert.deepEqual(selectMerchants([], { query: '学校', sort: 'rating' }), [])
  assert.deepEqual(selectMerchants(shops, { query: 'undefined' }), [])
  assert.deepEqual(selectMerchants(shops, { query: '二食堂' }).map(x => x.id), [2])
})
