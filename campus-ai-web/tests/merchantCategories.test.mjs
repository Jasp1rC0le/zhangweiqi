import test from 'node:test'
import assert from 'node:assert/strict'
import { inMerchantCategory, merchantPlaceLabel, orderCanteens, canteenFilterLabel } from '../src/utils/merchantCategories.js'
test('menu categories can overlap without creating more merchants or inventing ratings', () => {
 const m = { name: '咖喱蛋包饭·汉堡姐姐', ratingCount: 0 }
 assert.equal(inMerchantCategory(m, 'rice'), true)
 assert.equal(inMerchantCategory(m, 'snacks'), true)
 assert.equal(inMerchantCategory(m, 'drinks'), false)
 assert.equal(inMerchantCategory({ name: '库迪咖啡' }, 'drinks'), true)
 assert.equal(inMerchantCategory({ name: '未知窗口' }, 'all'), true)
 assert.equal(m.ratingCount, 0)
})
test('first-floor menu families remain discoverable through the existing food filters', () => {
 for (const [name, category] of [['桂婆婆米粉','noodles'],['土豆粉·酸辣粉·热干面','noodles'],['面夫子手工鲜肉包','snacks'],['现烙酱香饼','snacks'],['营养粥·现磨豆浆','drinks'],['茶香鸡','rice'],['悦轻荷自选轻餐','rice'],['喜翻拌麻酱麻辣拌','hotpot']]) assert.equal(inMerchantCategory({name},category),true,`${name}: ${category}`)
 assert.equal(inMerchantCategory({name:'茶香鸡'},'drinks'),false)
 assert.equal(inMerchantCategory({name:'稻杠茶泡饭'},'drinks'),false)
})
test('floor filters keep canonical identities but sort first, second and ethnic canteen', () => {
 const rows=[{id:1,name:'大食堂二楼'},{id:2,name:'小食堂（民族食堂）'},{id:3,name:'大食堂一楼'}]
 const snapshot=JSON.stringify(rows), ordered=orderCanteens(rows)
 assert.deepEqual(ordered.map(row=>row.id),[3,1,2])
 assert.deepEqual(ordered.map(canteenFilterLabel),['一楼','二楼','小食堂'])
 assert.equal(JSON.stringify(rows),snapshot)
 assert.equal(canteenFilterLabel({name:'其他食堂'}),'其他食堂')
})
test('floor label avoids duplicate canteen name while preserving real locations', () => {
 assert.equal(merchantPlaceLabel({canteenName:'大食堂',location:'大食堂二楼'}),'大食堂二楼')
 assert.equal(merchantPlaceLabel({canteenName:'大食堂',location:'二楼'}),'大食堂 · 二楼')
 assert.equal(merchantPlaceLabel({canteenName:'大食堂'}),'大食堂 · 位置待补充')
})
