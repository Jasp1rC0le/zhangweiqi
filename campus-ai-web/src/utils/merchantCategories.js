export const merchantCategories = Object.freeze([
  { id: 'all', label: '全部' }, { id: 'rice', label: '吃饭' }, { id: 'noodles', label: '面食' },
  { id: 'hotpot', label: '热锅' }, { id: 'snacks', label: '小吃' }, { id: 'drinks', label: '饮品' },
].map(Object.freeze))
const patterns = { rice: /饭|小炒|美食|套餐|烧腊|东北风味|肉朵香/, noodles: /面|米线|牛肉汤|羊杂/,
  hotpot: /麻辣烫|香锅|水煮|小锅|一锅|鸡公煲|石锅|黄焖鸡/, snacks: /汉堡|美式堡|鸡排|炸鸡|水饺/,
  drinks: /咖啡|蜜雪冰城|饮品|奶茶/ }
export function inMerchantCategory(merchant, category) {
  if (category === 'all') return true
  return !!patterns[category]?.test(`${merchant?.name || ''} ${merchant?.description || ''}`)
}
export function merchantPlaceLabel(merchant) {
  const name = String(merchant?.canteenName || '').trim(), place = String(merchant?.location || '').trim()
  if (!place) return name ? `${name} · 位置待补充` : '位置待补充'
  return name && !place.startsWith(name) ? `${name} · ${place}` : place
}
