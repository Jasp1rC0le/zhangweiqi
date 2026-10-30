import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canShowEmptySourceReview, filterAdminDocuments, formatAdminDate, knowledgeFormIssue, loadAdminSections, publishThenRefresh } from '../src/utils/adminWorkbench.js'

test('empty source review requires a finished successful identified load', { timeout: 1000 }, () => {
  const ready = { loading: false, identityError: '', updatesError: '', updates: [] }
  assert.equal(canShowEmptySourceReview(ready), true)
  for (const change of [{ loading: true }, { loading: undefined }, { identityError: '身份读取失败' },
    { updatesError: '来源读取失败' }, { updates: null }, { updates: {} }]) {
    assert.equal(canShowEmptySourceReview({ ...ready, ...change }), false)
  }
  assert.equal(canShowEmptySourceReview(), false)
})
test('nonempty source candidates do not show completion or mutate the list', { timeout: 1000 }, () => {
  const updates = [{ id: 3 }]
  assert.equal(canShowEmptySourceReview({ loading: false, updates }), false)
  assert.deepEqual(updates, [{ id: 3 }])
})
test('failed or malformed source loading cannot become an empty success', { timeout: 1000 }, async () => {
  for (const load of [async () => { throw new Error('offline') }, async () => null]) {
    const { updates } = await loadAdminSections({ updates: load })
    assert.equal(canShowEmptySourceReview({ loading: false, updatesError: updates.error, updates: updates.data }), false)
  }
  const { updates } = await loadAdminSections({ updates: async () => [] })
  assert.equal(canShowEmptySourceReview({ loading: false, updatesError: updates.error, updates: updates.data }), true)
})
test('source empty message is conditional, announced, and never claims whole-site coverage', { timeout: 1000 }, () => {
  const source = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  assert.match(source, /sourceReviewIsEmpty = computed\(\(\) => canShowEmptySourceReview/)
  assert.match(source, /updatesError: sectionErrors\.updates, updates: updateCandidates\.value/)
  assert.match(source, /<p v-if="sourceReviewIsEmpty" class="document-results source-review-empty" role="status">本次加载暂无待核对的来源变化。仅代表已检查的来源，不代表全站资料已收齐。<\/p>/)
})

test('document expiry retains the year across calendar boundaries', { timeout: 1000 }, () => {
  const date = '2027-01-01T00:00:00'
  assert.match(formatAdminDate(date, true), /2027/)
  assert.doesNotMatch(formatAdminDate(date), /2027/)
  for (const value of ['', null, undefined, 'not-a-date']) assert.equal(formatAdminDate(value, true), '时间未知')
  const source = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  assert.match(source, /有效至 \{\{ formatDate\(item\.expiresAt, true\) \}\}/)
})

test('admin actions wrap as complete touch-sized labels instead of splitting characters', { timeout: 1000 }, () => {
  const source = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  assert.match(source, /\.card-actions \{[^}]*flex-wrap: wrap;/)
  assert.match(source, /\.card-actions button \{[^}]*flex: 0 0 auto;[^}]*min-height: 44px;[^}]*white-space: nowrap;/)
  assert.match(source, /\.card-actions button \{\s*width: 100%;/)
})

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
test('disabled task execution is a successful state while missing flags fail closed', async () => {
  for (const enabled of [false, true]) {
    const { jobRuntime } = await loadAdminSections({ jobRuntime: async () => ({ enabled }) })
    assert.deepEqual(jobRuntime, { data: { enabled }, error: null })
  }
  for (const value of [null, {}, [], {enabled:'false'}, {enabled:0}]) {
    const { jobRuntime } = await loadAdminSections({ jobRuntime: async () => value })
    assert.equal(jobRuntime.data, null)
    assert.ok(jobRuntime.error)
  }
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
  assert.match(source, /项候选 · 尚未确认正文变化/)
  assert.doesNotMatch(source, /<details[^>]*class="source-update-section"[^>]*\bopen\b/)
})

test('source comparison is read-only and tied to the live account and candidate target', () => {
  const source = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  const handler = source.split('async function comparePublishedSource(item) {')[1].split('\nasync function ')[0]
  assert.match(handler, /editorScope.capture\(\{ abortable: true \}\)/)
  assert.match(handler, /ticket.current\(\).*sourceReads.get\(id\) === operation/)
  assert.match(handler, /entry.id === id && entry.documentId === item.documentId && entry.sourceUrl === item.sourceUrl/)
  assert.match(handler, /document.sourceUrl !== item.sourceUrl/)
  assert.match(handler, /document.status !== 'PUBLISHED'/)
  assert.match(handler, /getKnowledgeDocument\(item.documentId, \{ signal: ticket.signal \}\)/)
  assert.doesNotMatch(handler, /applyKnowledgeUpdate|dismissKnowledgeUpdate|reviseKnowledgeDocument|importKnowledgeDocument/)
  assert.match(source, /sourceReads\.clear\(\)/)
  assert.match(source, /rejectionNotes, sourceComparisons/)
  assert.match(source, /\.source-compare-button \{\s*min-height: 44px;/)
})

test('single and batch previews surface unread image and untrusted layout warnings', () => {
  const single = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  const batch = readFileSync(new URL('../src/views/AdminBatchImportPanel.vue', import.meta.url), 'utf8')
  assert.match(single, /v-for="warning in previewResult\?\.warnings \|\| \[\]"[^>]*role="status"/)
  assert.match(batch, /warnings: preview\.warnings \|\| \[\]/)
  assert.match(batch, /v-for="warning in item\.warnings"[^>]*role="status"/)
})

test('editing another unpublished draft does not display the previous publication as its success', () => {
  const source = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  assert.match(source, /v-if="importSuccess && !importCheckpoint\.isDirty\(\)" class="editor-success"/)
})
