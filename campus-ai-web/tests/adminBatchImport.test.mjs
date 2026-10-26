import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBatchImportScope } from '../src/utils/batchImportScope.js'

test('batch results only belong to the same live administrator', { timeout: 1000 }, () => {
  let owner = '1:1'
  const scope = createBatchImportScope(() => owner), current = scope.capture()
  assert.equal(current(), true)
  owner = '2:1'
  assert.equal(current(), false)
})
test('same-account re-entry cannot revive an older batch result or decision', { timeout: 1000 }, () => {
  let owner = '1:1'
  const scope = createBatchImportScope(() => owner), current = scope.capture(), first = scope.key()
  owner = ''; scope.invalidate()
  assert.equal(scope.key(), null)
  owner = '1:1'; scope.invalidate()
  assert.equal(current(), false)
  assert.notEqual(scope.key(), first)
  assert.equal(scope.capture()(), true)
})
test('missing identity and disposal never allow later results', { timeout: 1000 }, () => {
  let owner = ''
  const scope = createBatchImportScope(() => owner), absent = scope.capture()
  owner = '1:1'
  assert.equal(absent(), false)
  const current = scope.capture()
  scope.dispose()
  assert.equal(current(), false)
  assert.equal(scope.key(), null)
  assert.equal(scope.capture()(), false)
})
const panel = readFileSync(new URL('../src/views/AdminBatchImportPanel.vue', import.meta.url), 'utf8')
const parent = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
test('scan select labels are explicit and do not contain option text', { timeout: 1000 }, () => {
  for (const [id, label] of [['batch-max-pages', '最多页面'], ['batch-max-depth', '链接深度']]) {
    assert.match(panel, new RegExp(`<label for="${id}">${label}</label><select id="${id}"`))
  }
})
test('batch editing stays mounted during module switches and participates in leave protection', { timeout: 1000 }, () => {
  assert.match(parent, /<AdminBatchImportPanel v-if="adminAuth\.user" v-show="!loading && activeTab === 'import'"/)
  assert.match(parent, /ref="batchImport"/)
  assert.match(parent, /useUnsavedChanges\(\(\) => importCheckpoint\.isDirty\(\) \|\| Boolean\(batchImport\.value\?\.dirty\)/)
  assert.match(parent, /Boolean\(batchImport\.value\?\.busy\)/)
  assert.match(panel, /defineExpose\(\{ busy, dirty, draftKey \}\)/)
})
test('both import modes and revision choices lock during parsing publishing and confirmation', { timeout: 1000 }, () => {
  for (const mode of ['page', 'site']) {
    assert.match(panel, new RegExp(`:disabled="busy" @click="urlMode = '${mode}'"`))
  }
  assert.match(panel, /<select v-model="item\.revisionOf" :disabled="busy">/)
  assert.match(panel, /parsing\.value \|\| publishing\.value \|\| confirming\.value/)
})
test('late previews and write results are gated and partial publication is reported honestly', { timeout: 1000 }, () => {
  assert.match(panel, /await previewKnowledgeFiles\(files\)\s+if \(!current\(\)\) return/)
  assert.match(panel, /await importKnowledgeBatch\(additions\.map\(documentPayload\)\)\s+if \(!current\(\)\) return/)
  assert.match(panel, /onBeforeUnmount\(scope\.dispose\)/)
  assert.match(panel, /份新资料已发布，不要重复提交/)
  assert.match(panel, /提交结果未确认，请先查看资料列表/)
  assert.doesNotMatch(panel, /localStorage|sessionStorage/)
})
test('checkbox is excluded from full-width text field styling and has its own grid row', { timeout: 1000 }, () => {
  assert.match(panel, /input:not\(\[type=file\]\):not\(\[type=checkbox\]\)/)
  assert.match(panel, /\.crawl-options \.path-limit \{[^}]*grid-column: 1 \/ -1;[^}]*min-height: 44px/)
})
