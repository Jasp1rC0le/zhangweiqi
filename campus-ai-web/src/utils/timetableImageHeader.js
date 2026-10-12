// Check dimensions before allocating decoded pixels. This is not a complete image validator:
// the browser must still decode it and the server independently re-encodes safe pixels.
// PNG: https://www.w3.org/TR/png-3/#11IHDR
// JPEG: https://www.w3.org/Graphics/JPEG/itu-t81.pdf, Annex B frame header.
const invalid = () => new Error('图片格式不完整或与文件类型不符，请重新保存为PNG或JPG')
export function validateTimetableDimensions(width, height) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 10000 ||
    height > 10000 ||
    width * height > 12000000
  )
    throw new Error('图片尺寸过大或无效，请先裁剪课表区域')
  return { width, height }
}
export function readTimetableImageBounds(buffer, mime) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > 8 * 1024 * 1024)
    throw invalid()
  const bytes = new Uint8Array(buffer),
    view = new DataView(buffer)
  if (mime === 'image/png') {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10]
    if (
      bytes.length < 33 ||
      !signature.every((value, index) => bytes[index] === value) ||
      view.getUint32(8) !== 13 ||
      view.getUint32(12) !== 0x49484452
    )
      throw invalid()
    return validateTimetableDimensions(view.getUint32(16), view.getUint32(20))
  }
  if (mime !== 'image/jpeg' || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216)
    throw invalid()
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) throw invalid()
    while (bytes[offset] === 255) offset++
    if (offset >= bytes.length) throw invalid()
    const marker = bytes[offset++]
    // Dimensions must be known before a scan, not guessed from compressed pixels.
    if ([0, 216, 217, 218].includes(marker)) throw invalid()
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue
    if (offset + 2 > bytes.length) throw invalid()
    const length = view.getUint16(offset)
    if (length < 2 || offset + length > bytes.length) throw invalid()
    if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
      if (length < 8 || bytes[offset + 7] === 0 || length !== 8 + 3 * bytes[offset + 7])
        throw invalid()
      return validateTimetableDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3))
    }
    offset += length
  }
  throw invalid()
}
