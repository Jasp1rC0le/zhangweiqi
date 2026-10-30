export const MERCHANT_BATCH_LIMIT = 10
export function merchantPhotoIssue(files) {
  if (!files.length || files.length > MERCHANT_BATCH_LIMIT) return '每批最多10张照片'
  if (files.some(file => !['image/jpeg', 'image/png'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)) return '请选择5MB以内的JPEG或PNG照片'
  if (files.reduce((n, file) => n + file.size, 0) > 30 * 1024 * 1024) return '本批照片总大小不能超过30MB'
  return ''
}
export function merchantBatchIssue(rows) {
  const photo = merchantPhotoIssue(rows.map(row => row.file))
  if (photo) return photo
  const names = new Set()
  for (const row of rows) {
    if (!Number.isSafeInteger(Number(row.canteenId)) || Number(row.canteenId) < 1) return '请选择所属食堂'
    if (!row.name.trim() || !row.location.trim()) return '补齐每家商家的名称和位置'
    if (row.name.length > 120 || row.location.length > 120) return '名称和位置各不超过120字'
    const key = `${row.canteenId}:${row.name.trim().toLocaleLowerCase()}`
    if (names.has(key)) return '同一食堂的商家名称不能重复'
    names.add(key)
  }
  return ''
}
export function merchantFileName(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '')
  return /^(IMG|IMAGE|DSC|SCREENSHOT|照片|截屏)[_\s\d-]*$/i.test(base) ? '' : base.slice(0, 120)
}
export function publicationMatches(data, items) {
  return Array.isArray(data) && data.length === items.length && new Set(data.map(row => row?.id)).size === items.length
    && data.every((row, i) => Number.isSafeInteger(row?.id) && row.id > 0 && row.status === 'PUBLISHED'
      && row.canteenId === items[i].canteenId && row.name === items[i].name && row.location === items[i].location)
}
