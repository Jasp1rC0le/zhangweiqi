export const merchantCategories = Object.freeze([
  { id: 'all', label: '全部' }, { id: 'rice', label: '吃饭' }, { id: 'noodles', label: '面食' },
  { id: 'hotpot', label: '热锅' }, { id: 'snacks', label: '小吃' }, { id: 'drinks', label: '饮品' },
].map(Object.freeze))
const patterns = { rice: /饭|小炒|美食|套餐|烧腊|东北风味|肉朵香|轻餐|营养餐|妈妈的菜|茶香鸡|牛肉菜/,
  noodles: /面|米线|米粉|土豆粉|酸辣粉|河粉|螺蛳粉|牛肉汤|羊杂|馄饨/,
  hotpot: /麻辣拌|麻辣烫|香锅|水煮|小锅|一锅|鸡公煲|石锅|黄焖鸡/,
  snacks: /汉堡|美式堡|鸡排|炸鸡|水饺|鲜肉包|小笼包|酱香饼|馅饼|手抓饼|鸡蛋灌饼|熏肉大饼|早点/,
  drinks: /咖啡|蜜雪冰城|饮品|奶茶|豆浆|果汁|茶饮/ }
export function inMerchantCategory(merchant, category) {
  if (category === 'all') return true
  return !!patterns[category]?.test(`${merchant?.name || ''} ${merchant?.description || ''}`)
}
export function merchantPlaceLabel(merchant) {
  const name = String(merchant?.canteenName || '').trim(), place = String(merchant?.location || '').trim()
  if (!place) return name ? `${name} · 位置待补充` : '位置待补充'
  return name && !place.startsWith(name) ? `${name} · ${place}` : place
}
const canteenRanks = Object.freeze({ '大食堂一楼': 0, '大食堂二楼': 1, '小食堂（民族食堂）': 2 })
export function orderCanteens(rows) {
  return [...rows].sort((a, b) => (canteenRanks[a.name] ?? 3) - (canteenRanks[b.name] ?? 3) || Number(a.id) - Number(b.id))
}
export function canteenFilterLabel(canteen) {
  return ({ '大食堂一楼': '一楼', '大食堂二楼': '二楼', '小食堂（民族食堂）': '小食堂' })[canteen?.name] || canteen?.name || '食堂'
}
