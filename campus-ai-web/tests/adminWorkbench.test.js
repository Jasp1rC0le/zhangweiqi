import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { filterAdminDocuments, knowledgeFormIssue, loadAdminSections, publishThenRefresh } from '../src/utils/adminWorkbench.js'

test('admin panels load independently and distinguish unavailable from empty', async () => {
  const error = new Error('unavailable')
  const loaded = await loadAdminSections({ documents: async () => { throw error }, contacts: async () => [], overview: async () => ({ pendingSubmissions: 1 }) })
  assert.equal(loaded.documents.error, error)
  assert.deepEqual(loaded.contacts, { data: [], error: null })
  assert.equal(loaded.overview.data.pendingSubmissions, 1)
})
test('admin panels reject malformed payloads rather than showing missing data as zero', async () => {
  const loaded = await loadAdminSections({ documents: async () => ({}), contacts: async () => null, overview: async () => [] })
  for (const value of Object.values(loaded)) assert.ok(value.error)
})
test('document search combines title department category id and exact publication state', () => {
  const rows = [{ id: 1, title: '图书馆开放时间', category: '校园事务', sourceDepartment: '图书馆', status: 'PUBLISHED' }, { id: 2, title: '旧版指南', category: 'PDF资料', status: 'ARCHIVED' }]
  assert.deepEqual(filterAdminDocuments(rows, ' 图书馆 ', 'PUBLISHED'), [rows[0]])
  assert.deepEqual(filterAdminDocuments(rows, 'pdf', 'ALL'), [rows[1]])
  assert.deepEqual(filterAdminDocuments(rows, '2', 'ARCHIVED'), [rows[1]])
  assert.deepEqual(filterAdminDocuments(rows, '旧版', 'PUBLISHED'), [])
  assert.equal(rows.length, 2)
})
const form = () => ({ title:'示例', category:'校园事务', content:'正文', sourceUrl:'', publishedAt:'', effectiveAt:'', expiresAt:'' })
test('editor requires content and valid optional public source URL', () => {
  assert.equal(knowledgeFormIssue(form()), '')
  assert.ok(knowledgeFormIssue({ ...form(), title:' ' }))
  for (const sourceUrl of ['javascript:alert(1)', 'file:///tmp/a', 'https://user:secret@example.com/', 'x']) assert.ok(knowledgeFormIssue({ ...form(), sourceUrl }))
  assert.equal(knowledgeFormIssue({ ...form(), sourceUrl:'https://www.tsguas.edu.cn/' }), '')
})
test('editor rejects reversed invalid dates but allows unknown dates', () => {
  assert.ok(knowledgeFormIssue({ ...form(), expiresAt:'not-a-date' }))
  assert.ok(knowledgeFormIssue({ ...form(), effectiveAt:'2026-10-09T09:00', expiresAt:'2026-10-09T08:00' }))
  assert.equal(knowledgeFormIssue({ ...form(), effectiveAt:'2026-10-09T09:00', expiresAt:'2026-10-10T08:00' }), '')
})
test('confirmed publication is not reported as failed when list refresh fails', async () => {
  const steps = [], error = new Error('list unavailable')
  const result = await publishThenRefresh(async () => { steps.push('publish'); return { documentId: 8 } }, response => { steps.push(`commit:${response.documentId}`) }, async () => { steps.push('refresh'); throw error })
  assert.deepEqual(steps, ['publish','commit:8','refresh'])
  assert.equal(result.refreshError, error)
  assert.equal(result.result.documentId, 8)
})
test('failed publication keeps draft and never enters committed or refresh handlers', async () => {
  let changed = false
  await assert.rejects(publishThenRefresh(async () => { throw new Error('conflict') }, () => { changed = true }, async () => { changed = true }), /conflict/)
  assert.equal(changed, false)
})
test('identity panel only exposes admin link after server identity verification', () => {
  const source = readFileSync(new URL('../src/components/AccountIdentityPanel.vue', import.meta.url), 'utf8')
  assert.match(source, /checked && isAdministrator\(auth.user\)/)
  assert.match(source, /await auth.loadCurrentUser\(\)/)
  const script = source.split('</script>')[0]
  assert.doesNotMatch(script, /localStorage|password|\.role\s*=/)
})
test('editor keeps pending work on navigation and locks controls during writes', () => {
  const source = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  assert.match(source, /useUnsavedChanges\(\(\) => importCheckpoint.isDirty\(\)/)
  assert.match(source, /fieldset class="editor-fields" :disabled="importLoading \|\| previewLoading \|\| editorLoading \|\| importConfirming"/)
  assert.match(source, /if \(disposed \|\| sequence !== inboxSequence \|\| !current\(\)\) return/)
  assert.match(source, /if \(disposed \|\| sequence !== editorSequence\) return/)
})
test('source changes stay collapsed so a document search remains usable', () => {
  const source = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  assert.match(source, /<details v-if="updateCandidates.length" class="source-update-section">/)
  assert.match(source, /<summary class="source-update-heading">/)
  assert.match(source, /点击展开 · 不会自动覆盖/)
  assert.doesNotMatch(source, /<details[^>]*class="source-update-section"[^>]*\bopen\b/)
})

test('editing another unpublished draft does not display the previous publication as its success', () => {
  const source = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  assert.match(source, /v-if="importSuccess && !importCheckpoint\.isDirty\(\)" class="editor-success"/)
})
