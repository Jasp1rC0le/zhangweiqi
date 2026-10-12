import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanteenFixture } from '../design/canteenFixture.js'
const request = (fixture, url, method = 'get', data) =>
  fixture.adapter({ url, method, data }).then((r) => r.data)
test('canteen examples remain instance local, rating edits do not add votes', async () => {
  const fixture = createCanteenFixture()
  const original = await request(fixture, '/api/canteens/merchants')
  const before = original.find((s) => s.id === 1)
  await request(fixture, '/api/canteens/merchants/1/rating', 'put', { score: 4 })
  const updated = await request(fixture, '/api/canteens/merchants/1/rating', 'put', { score: 5 })
  assert.equal(updated.find((s) => s.id === 1).ratingCount, before.ratingCount + 1)
  assert.deepEqual(await request(createCanteenFixture(), '/api/canteens/merchants'), original)
})
test('pending comment, simulated approval, editing and explicit removal', async () => {
  const fixture = createCanteenFixture()
  await request(fixture, '/api/canteens/merchants/5/rating', 'put', {
    score: 5,
    comment: '锅巴比闹钟还清脆',
  })
  assert.equal(
    (await request(fixture, '/api/canteens/merchants')).find((s) => s.id === 5).featuredReview,
    null,
  )
  assert.equal((await request(fixture, '/api/canteens/merchants/5/reviews'))[0].status, 'PENDING')
  fixture.approveMine()
  assert.equal(
    (await request(fixture, '/api/canteens/merchants')).find((s) => s.id === 5).featuredReview
      .comment,
    '锅巴比闹钟还清脆',
  )
  await request(fixture, '/api/canteens/merchants/5/rating', 'put', { score: 4 })
  assert.equal((await request(fixture, '/api/canteens/merchants/5/reviews'))[0].status, 'PUBLISHED')
  await request(fixture, '/api/canteens/merchants/5/rating', 'put', {
    score: 4,
    comment: '修改后重新审核',
  })
  assert.equal((await request(fixture, '/api/canteens/merchants/5/reviews'))[0].status, 'PENDING')
  await request(fixture, '/api/canteens/merchants/5/rating', 'put', { score: 4, comment: '' })
  assert.deepEqual(await request(fixture, '/api/canteens/merchants/5/reviews'), [])
})
test('likes are idempotent, cancelled exactly once, reject wrong merchant', async () => {
  const fixture = createCanteenFixture()
  const url = '/api/canteens/merchants/1/reviews/11/like'
  await request(fixture, url, 'put', { liked: true })
  assert.equal((await request(fixture, url, 'put', { liked: true }))[0].likes, 19)
  await request(fixture, url, 'put', { liked: false })
  assert.equal((await request(fixture, url, 'put', { liked: false }))[0].likes, 18)
  await assert.rejects(
    request(fixture, '/api/canteens/merchants/2/reviews/11/like', 'put', { liked: true }),
  )
})
test('privacy guard rejects obvious contact details before changing score', async () => {
  const fixture = createCanteenFixture()
  await assert.rejects(
    request(fixture, '/api/canteens/merchants/5/rating', 'put', {
      score: 5,
      comment: '电话１３８００１３８０００',
    }),
  )
  assert.equal(
    (await request(fixture, '/api/canteens/merchants')).find((s) => s.id === 5).ratingCount,
    0,
  )
})
