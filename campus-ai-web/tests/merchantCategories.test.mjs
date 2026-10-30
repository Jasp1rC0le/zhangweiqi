import test from 'node:test'
import assert from 'node:assert/strict'
import { inMerchantCategory, merchantPlaceLabel } from '../src/utils/merchantCategories.js'
test('menu categories can overlap without creating more merchants or inventing ratings', () => {
 const m = { name: '咖喱蛋包饭·汉堡姐姐', ratingCount: 0 }
 assert.equal(inMerchantCategory(m, 'rice'), true)
 assert.equal(inMerchantCategory(m, 'snacks'), true)
 assert.equal(inMerchantCategory(m, 'drinks'), false)
 assert.equal(inMerchantCategory({ name: '库迪咖啡' }, 'drinks'), true)
 assert.equal(inMerchantCategory({ name: '未知窗口' }, 'all'), true)
 assert.equal(m.ratingCount, 0)
})
test('floor label avoids duplicate canteen name while preserving real locations', () => {
 assert.equal(merchantPlaceLabel({canteenName:'大食堂',location:'大食堂二楼'}),'大食堂二楼')
 assert.equal(merchantPlaceLabel({canteenName:'大食堂',location:'二楼'}),'大食堂 · 二楼')
 assert.equal(merchantPlaceLabel({canteenName:'大食堂'}),'大食堂 · 位置待补充')
})
