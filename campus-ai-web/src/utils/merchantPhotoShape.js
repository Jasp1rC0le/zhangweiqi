// Public menu dimensions only, bounded to the current page session. No user/review data.
const shapes = new Map()
export function merchantPhotoShape(url) { return shapes.get(url) || 'wide' }
export function rememberMerchantPhotoShape(url, width, height) {
  if (!url || !(width > 0) || !(height > 0)) return null
  const shape = width / height >= 1.5 ? 'wide' : 'square'
  if (shapes.size >= 160 && !shapes.has(url)) shapes.delete(shapes.keys().next().value)
  shapes.set(url, shape)
  return shape
}
