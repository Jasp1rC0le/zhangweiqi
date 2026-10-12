import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { safeExternalUrl, safeMessageUrl } from '../src/utils/safeMarkdown.js'

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
