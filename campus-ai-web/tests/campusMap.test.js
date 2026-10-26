import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { safeExternalUrl, safeMessageUrl, reviewedMapTextParts } from '../src/utils/safeMarkdown.js'

const root = new URL('../public', import.meta.url)
const map = JSON.parse(readFileSync(new URL(`${root}/campus-map/tsguas-map-2026-10-09.json`), 'utf8'))

test('stored map has a matching digest and schematic, not GPS, coordinates', () => {
  assert.equal(map.coordinateSystem, 'schematic-normalized-image-only')
  assert.equal(map.satelliteVerified, false)
  assert.equal(map.walkableGraphVerified, false)
  assert.equal(createHash('sha256').update(readFileSync(new URL(`${root}${map.image}`))).digest('hex'), map.imageSha256)
  assert.equal(new Set(map.points.map(p => p.id)).size, 29)
  for (const point of map.points) {
    assert.equal(point.schematicPosition.length, 2)
    assert.ok(point.schematicPosition.every(v => Number.isFinite(v) && v >= 0 && v <= 1))
    assert.ok(point.aliases.length)
    assert.equal('latitude' in point || 'longitude' in point, false)
  }
})

test('uncertain buildings, road conflict and inaccessible panorama remain explicit', () => {
  for (const id of ['E4', 'E5', 'E6', 'H6', 'M']) assert.equal(map.points.find(p => p.id === id).name, null)
  assert.match(map.conflicts.join(' '), /炎培大道、行知大道/)
  assert.equal(map.panorama.status, 'title_only_scene_timeout')
  assert.match(map.points.find(p => p.id === 'B').aliases.join(), /图书馆/)
})

test('chat permits the reviewed map link, without widening relative URL permissions', () => {
  assert.equal(safeMessageUrl(map.image), map.image)
  assert.equal(safeExternalUrl(map.image), null)
  assert.equal(safeMessageUrl('https://tsg.tsguas.edu.cn/'), 'https://tsg.tsguas.edu.cn/')
  for (const url of ['/api/admin', '/logout', '/campus-map/../api', `${map.image}?token=secret`, `${map.image}#x`, '//evil.com', 'javascript:alert(1)', 'data:text/html,x', '/campus-map/%2e%2e/api']) {
    assert.equal(safeMessageUrl(url), null)
  }
})

test('official aerial reference retains provenance without replacing schematic coordinates', { timeout: 1000 }, () => {
  const reference = map.officialAerialReference
  assert.equal(reference.sourcePage, 'https://hqjj.tsguas.edu.cn/lxwm.htm')
  assert.equal(reference.sourceDate, null)
  assert.equal(reference.georeferenced, false)
  assert.equal(reference.currentAccessVerified, false)
  assert.equal(map.checkedAt, '2026-10-09')
  assert.equal(map.supplementCheckedAt, '2026-10-11')
  assert.equal(createHash('sha256').update(readFileSync(new URL(`${root}${reference.image}`))).digest('hex'), reference.imageSha256)
  assert.match(map.conflicts.join(' '), /不自动合并楼号/)
  assert.equal(map.satelliteVerified, false)
  assert.equal(map.walkableGraphVerified, false)
})

test('second reviewed map permits exact link only, never arbitrary paths or private query values', { timeout: 1000 }, () => {
  const image = map.officialAerialReference.image
  assert.equal(safeMessageUrl(image), image)
  assert.equal(safeExternalUrl(image), null)
  for (const value of [`${image}?token=secret`, `${image}#gps`, '/campus-map/not-reviewed.jpg', '/campus-map/../api/admin', '/campus-map/%2e%2e/api', '__proto__', 'constructor', 'toString']) {
    assert.equal(safeMessageUrl(value), null)
  }
  const source = readFileSync(new URL('../src/utils/safeMarkdown.js', import.meta.url), 'utf8')
  assert.match(source, /Object\.hasOwn\(reviewedMapLinks, value\).*code\.closest\('pre'\)/)
  assert.match(source, /link\.textContent = reviewedMapLinks\[value\]/)
  assert.match(source, /FORBID_TAGS: \['img', 'picture'/)
})

test('bare reviewed paths become descriptive actions without losing surrounding Chinese text', { timeout: 1000 }, () => {
  const image = map.officialAerialReference.image
  assert.deepEqual(reviewedMapTextParts(`官网实景图：${image} ，日期未知。`), [
    { text: '官网实景图：' },
    { text: '查看官网校园实景图（日期未知）', href: image },
    { text: ' ，日期未知。' },
  ])
})

test('bare reviewed maps support multiple occurrences and newline punctuation', { timeout: 1000 }, () => {
  const image = map.image
  const aerial = map.officialAerialReference.image
  const parts = reviewedMapTextParts(`（${image}）\n${aerial}。再看：${image}`)
  assert.deepEqual(parts.filter(part => part.href).map(part => part.href), [image, aerial, image])
  assert.equal(parts.filter(part => !part.href).map(part => part.text).join(''), '（）\n。再看：')
})

test('plain map linkification never strips queries, fragments or traversal into allowed links', { timeout: 1000 }, () => {
  for (const image of [map.image, map.officialAerialReference.image]) {
    for (const value of [`${image}?token=secret`, `${image}#location`, `${image}/extra`, `${image}.png`, `/${image}`, `/other${image}`, `https://evil.example${image}`, `?url=${image}`, `/campus-map/%2e%2e${image}`]) {
      assert.deepEqual(reviewedMapTextParts(value), [{ text: value }], value)
    }
  }
})

test('unreviewed map paths and internal routes remain plain text', { timeout: 1000 }, () => {
  for (const value of ['', '/campus-map/not-reviewed.jpg', '/api/admin', '/logout', 'javascript:alert(1)', '普通中文🙂']) {
    assert.deepEqual(reviewedMapTextParts(value), [{ text: value }])
  }
})

test('map path matching is repeatable with a reused regex and rejects embedded filename characters', { timeout: 1000 }, () => {
  for (let repeat = 0; repeat < 3; repeat++) {
    assert.equal(reviewedMapTextParts(map.image)[0].href, map.image)
    assert.deepEqual(reviewedMapTextParts(`x${map.image}x`), [{ text: `x${map.image}x` }])
  }
})

test('plain linkification operates only after sanitizing and outside anchors and code samples', { timeout: 1000 }, () => {
  const source = readFileSync(new URL('../src/utils/safeMarkdown.js', import.meta.url), 'utf8')
  assert.ok(source.indexOf('DOMPurify.sanitize') < source.indexOf('parsed.createTreeWalker'))
  assert.match(source, /closest\('a, code, pre'\)/)
  assert.match(source, /fragment\.append\(parsed\.createTextNode\(part\.text\)\)/)
  assert.match(source, /node\.replaceWith\(fragment\)/)
  assert.match(source, /link\.rel = 'noopener noreferrer'/)
})
