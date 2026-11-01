import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { selectMerchants, snapshotMerchantRanking } from '../src/utils/merchantList.js'
import { reconcileCanteenDraft } from '../src/utils/canteenDrafts.js'

const source = readFileSync(new URL('../src/views/CanteenView.vue', import.meta.url), 'utf8')
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
function fixture({ comment = false } = {}) {
  let resolve, restores = 0, disposed = 0, cancelled = 0
  const write = new Promise(yes => { resolve = yes })
  const shops = [{ id: 1, ratingCount: 10, averageScore: 4 }, { id: 2, ratingCount: 1, averageScore: 5 }]
  const c = {
    canRate: { value: true }, ratingDrafts: { 1: 0, 2: 5 }, writeBusy: { value: false }, loading: { value: false }, disposed: false,
    scope: { value: 'user1:school1:session1' }, merchants: { value: shops }, rankingSnapshot: { value: snapshotMerchantRanking(shops) },
    comments: { 2: '已提交的文字' }, savedComments: {}, savedScores: {}, savingId: { value: null }, likingId: { value: null },
    actionErrors: {}, actionStatus: {}, expandedId: { value: comment ? 2 : null }, reviews: { 2: [{ id: 90, likes: 0 }] }, ownReviews: {}, reviewErrors: {},
    reviewRequest: () => ({ cancel() { cancelled++ }, async run(offset) {
      assert.equal(offset, 0)
      c.ownReviews[2] = { id: 100, comment: '已提交的文字', status: 'PUBLISHED' }
      // A published author's low-like review can be outside the first page.
      c.reviews[2] = [{ id: 91, likes: 20 }]
    } }),
    rateCanteenMerchant: () => write, likeCanteenReview: () => write,
    getCanteenMerchants: async () => [{ ...shops[1], ratingCount: 11 }, shops[0]],
    reconcileCanteenDraft, catalogRoot: { value: null }, window: {}, lifetime: new AbortController(), nextTick: async () => {},
    captureMerchantPosition: () => ({ restore() { restores++ }, dispose() { disposed++ } }),
  }
  vm.createContext(c)
  vm.runInContext(slice('function applyMerchants(', 'const listRequest =') + '\n'
    + slice('async function submitRating(', 'async function reportReview('), c)
  return { c, resolve, shop: shops[1], restores: () => restores, disposed: () => disposed, cancelled: () => cancelled }
}
test('actual rating handler updates scores without loading the catalogue or changing this visits order', async () => {
  const f = fixture(), { c } = f
  const pending = c.submitRating(f.shop)
  f.resolve([{ ...f.shop, ratingCount: 11, myScore: 5 }, { id: 1, ratingCount: 10, averageScore: 4 }])
  await pending
  assert.deepEqual(selectMerchants(c.merchants.value, { ranking: c.rankingSnapshot.value }).map(x => x.id), [1, 2])
  assert.equal(c.savedScores[2], 5); assert.equal(c.loading.value, false); assert.equal(c.savingId.value, null)
  assert.equal(f.restores(), 1); assert.equal(f.disposed(), 1); assert.equal(f.cancelled(), 1)
})
test('actual public-comment acknowledgement uses the authors readback even outside the first public page', async () => {
  const f = fixture({ comment: true })
  const pending = f.c.submitRating(f.shop, true)
  f.resolve([{ ...f.shop, ratingCount: 2, myScore: 5 }]); await pending
  assert.equal(f.c.actionStatus[2], '评价已发布')
  assert.equal(f.c.comments[2], '已提交的文字'); assert.equal(f.c.savedComments[2], '已提交的文字')
  assert.equal(f.c.reviews[2][0].id, 91); assert.equal(f.c.expandedId.value, 2); assert.equal(f.restores(), 1)
})
test('late writes cannot replace another account or restore its old page position', async () => {
  const f = fixture(), pending = f.c.submitRating(f.shop)
  f.c.scope.value = 'user2:school2:session2'; f.resolve([{ id: 99, ratingCount: 200 }]); await pending
  assert.deepEqual(f.c.merchants.value.map(x => x.id), [1, 2]); assert.equal(f.restores(), 0); assert.equal(f.disposed(), 1)
})
test('actual reaction handler keeps loaded review pages and applies server counts without relocating merchants', async () => {
  const f = fixture(), { c } = f
  c.reviews[2] = Array.from({ length: 40 }, (_, n) => ({ id: n + 1, likes: 0, liked: false }))
  const pending = c.likeReview(f.shop, { id: 39, mine: false, liked: false })
  f.resolve({ id: 39, score: 4, comment: '真实读回', likes: 5, liked: true, mine: false, status: 'PUBLISHED' }); await pending
  assert.equal(c.reviews[2].length, 40); assert.equal(c.reviews[2].find(r => r.id === 39).likes, 5)
  assert.deepEqual(selectMerchants(c.merchants.value, { ranking: c.rankingSnapshot.value }).map(x => x.id), [1, 2])
  assert.equal(f.restores(), 1); assert.equal(c.likingId.value, null)
})
