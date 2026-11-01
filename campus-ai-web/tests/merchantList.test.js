import test from 'node:test'
import assert from 'node:assert/strict'
import { selectMerchants, snapshotMerchantRanking } from '../src/utils/merchantList.js'

const shops = [
  { id: 1, canteenId: 1, name: '面食', canteenName: '一食堂', description: 'Noodles', averageScore: 4.5, ratingCount: 2 },
  { id: 2, canteenId: 2, name: '早餐', canteenName: '二食堂', averageScore: null, ratingCount: 0 },
  { id: 3, canteenId: 1, name: '米饭', averageScore: '4.5', ratingCount: '12' },
  { id: 4, canteenId: 2, name: '新店', averageScore: '5', ratingCount: 0 },
]
test('default order prioritizes real rating counts without mutating the input', () => {
  assert.deepEqual(selectMerchants(shops).map(x => x.id), [3, 1, 2, 4])
  assert.deepEqual(shops.map(x => x.id), [1, 2, 3, 4])
  assert.notEqual(selectMerchants(shops), shops)
})
test('writes update visible statistics while the current visit keeps its ranking', () => {
  const ranking = snapshotMerchantRanking(shops)
  const updated = [{ ...shops[3], ratingCount: 30, averageScore: 5 }, { ...shops[0], ratingCount: 20 }, shops[2], shops[1]]
  for (const sort of ['popular', 'rating', 'default']) {
    assert.deepEqual(selectMerchants(updated, { sort, ranking }).map(x => x.id), [3, 1, 2, 4])
  }
  assert.equal(selectMerchants(updated, { ranking }).find(x => x.id === 4).ratingCount, 30)
  assert.deepEqual(selectMerchants(updated, { ranking: snapshotMerchantRanking(updated) }).map(x => x.id), [4, 1, 3, 2])
})
test('snapshot values are independent and newly published merchants wait behind the loaded ranking', () => {
  const source = shops.map(shop => ({ ...shop })), ranking = snapshotMerchantRanking(source)
  source[0].ratingCount = 100
  const updated = [{ id: 9, canteenId: 1, name: '新上架', ratingCount: 200, averageScore: 5 }, ...source.reverse()]
  assert.deepEqual(selectMerchants(updated, { ranking, canteen: 1 }).map(x => x.id), [3, 1, 9])
  assert.deepEqual(selectMerchants(updated, { ranking, query: '面食' }).map(x => x.id), [1])
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
