import test from 'node:test'
import assert from 'node:assert/strict'
import { readTimetableImageBounds } from '../src/utils/timetableImageHeader.js'
import { prepareTimetableImage } from '../src/utils/timetable.js'

const options = { timeout: 2000 }
function pngHeader(width, height) {
  const bytes = new Uint8Array(33), view = new DataView(bytes.buffer)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  view.setUint32(8, 13)
  view.setUint32(12, 0x49484452)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes.buffer
}
function jpegHeader(width, height, marker = 0xc0) {
  // APP1 then a one-component frame; a header fixture, not a decodable image.
  const bytes = new Uint8Array([255, 216, 255, 225, 0, 4, 1, 2,
    255, marker, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255,
    1, 1, 0x11, 0])
  return bytes.buffer
}
function file(buffer, type = 'image/png') {
  return { type, size: buffer.byteLength, arrayBuffer: async () => buffer }
}
function stubBrowser(t, width, height, blob = new Blob(['safe'])) {
  const originalBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap'),
    originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document'),
    calls = { decoded: 0, closed: 0, canvas: null }
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true, value: async () => {
      calls.decoded++
      return { width, height, close: () => calls.closed++ }
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: () => {
      calls.canvas = {
        getContext: () => ({ fillRect() {}, drawImage() {} }),
        toBlob: (done) => done(blob),
      }
      return calls.canvas
    } },
  })
  t.after(() => {
    if (originalBitmap) Object.defineProperty(globalThis, 'createImageBitmap', originalBitmap)
    else delete globalThis.createImageBitmap
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else delete globalThis.document
  })
  return calls
}
test('PNG first IHDR gives bounded nonzero dimensions', options, () => {
  assert.deepEqual(readTimetableImageBounds(pngHeader(3000, 4000), 'image/png'), {width:3000, height:4000})
  for (const [width, height] of [[0, 20], [20, 0], [10001, 1], [1, 10001], [4000, 4000], [0xffffffff, 2]])
    assert.throws(() => readTimetableImageBounds(pngHeader(width, height), 'image/png'))
})
test('JPEG skips metadata and supports baseline and progressive frames', options, () => {
  for (const marker of [0xc0, 0xc1, 0xc2])
    assert.deepEqual(readTimetableImageBounds(jpegHeader(4000, 3000, marker), 'image/jpeg'), {width:4000, height:3000})
  assert.throws(() => readTimetableImageBounds(jpegHeader(65535, 65535), 'image/jpeg'))
})
test('spoofed MIME, missing IHDR and truncated frame fail before decode', options, () => {
  assert.throws(() => readTimetableImageBounds(pngHeader(20, 20), 'image/jpeg'))
  assert.throws(() => readTimetableImageBounds(jpegHeader(20, 20), 'image/png'))
  for (const buffer of [new ArrayBuffer(0), new Uint8Array([255, 216, 255]).buffer, jpegHeader(20, 20).slice(0, -1)])
    assert.throws(() => readTimetableImageBounds(buffer, 'image/jpeg'))
  const missing = pngHeader(20, 20)
  new DataView(missing).setUint32(12, 0x49444154)
  assert.throws(() => readTimetableImageBounds(missing, 'image/png'))
})
test('invalid segments, scan before frame and Huffman table do not masquerade as dimensions', options, () => {
  for (const bytes of [
    [255, 216, 255, 225, 0, 1],
    [255, 216, 255, 225, 255, 255],
    [255, 216, 255, 218, 0, 2],
    [255, 216, 255, 0],
    [255, 216, 255, 196, 0, 2, 255, 217],
  ]) assert.throws(() => readTimetableImageBounds(new Uint8Array(bytes).buffer, 'image/jpeg'))
})
test('huge declared image and SVG bytes never enter browser decoder', options, async t => {
  const calls = stubBrowser(t, 1, 1)
  await assert.rejects(prepareTimetableImage(file(pngHeader(40000, 40000))), /尺寸/)
  await assert.rejects(prepareTimetableImage(file(new TextEncoder().encode('<svg></svg>').buffer)), /格式/)
  assert.equal(calls.decoded, 0)
  assert.equal(calls.canvas, null)
})
test('portrait resizes its long edge too and releases decoded pixels', options, async t => {
  const calls = stubBrowser(t, 1000, 8000)
  await prepareTimetableImage(file(pngHeader(1000, 8000)))
  assert.equal(calls.canvas.width, 300)
  assert.equal(calls.canvas.height, 2400)
  assert.equal(calls.closed, 1)
})
test('decoder dimensions get an independent check, even with benign header', options, async t => {
  const calls = stubBrowser(t, 40000, 40000)
  await assert.rejects(prepareTimetableImage(file(pngHeader(20, 20))), /尺寸/)
  assert.equal(calls.closed, 1)
  assert.equal(calls.canvas, null)
})
test('encoder failure releases bitmap and is a usable retry error', options, async t => {
  const calls = stubBrowser(t, 20, 20, null)
  await assert.rejects(prepareTimetableImage(file(pngHeader(20, 20))), /缩小后重试/)
  assert.equal(calls.closed, 1)
})
