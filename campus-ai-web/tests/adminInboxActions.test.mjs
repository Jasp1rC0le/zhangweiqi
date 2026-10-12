import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createAdminEditorScope } from '../src/utils/adminEditorScope.js'
import { createScopedAdminActions } from '../src/utils/scopedAdminActions.js'

const view = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
const options = { timeout: 1000 }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function load(name, context) {
  const start = view.indexOf(`async function ${name}(`)
  assert.ok(start >= 0)
  const end = view.indexOf('\n}', start) + 2
  assert.ok(end > start)
  return vm.runInNewContext(`${view.slice(start, end)}\n${name}`, context, { timeout: 100 })
}
const ref = (value) => ({ value })
function reviewContext(extra = {}) {
  const state = { owner: '2:1:1', events: [] }
  const editorScope = createAdminEditorScope(
    () => state.owner,
    () => null,
  )
  const context = {
    editorScope,
    mergeReadSequence: 0,
    versionReads: new Map(),
    versionHistories: {},
    mergeDocumentId: ref(66),
    mergeSubmissionId: ref(9),
    mergeDraft: ref(null),
    actionBusy: ref(false),
    qualityBusy: ref(false),
    actionRunning: ref(false),
    processingKey: ref(''),
    adminAuth: { user: { schoolId: 1 } },
    ElMessage: {
      warning: (message) => state.events.push(message),
      error: (message) => state.events.push(message),
      success: (message) => state.events.push(message),
    },
    resolveErrorMessage: (error, fallback) => fallback,
    ...extra,
  }
  return { state, editorScope, context }
}
test(
  'merge caller freezes the original payload and target instead of borrowing later form',
  options,
  async () => {
    let action, call
    const { context } = reviewContext({
      submissions: ref([{ id: 9 }]),
      runInboxAction: async (key, execute, committed, details) => {
        action = { execute, committed, details }
      },
      mergeKnowledgeSubmission: async (...args) => {
        call = args
      },
    })
    context.mergeDraft.value = { title: '原标题', content: '原正文', schoolId: 1 }
    await load('confirmMerge', context)({ id: 9 })
    assert.equal(action.details.targetCurrent(), true)
    context.mergeDraft.value.content = '后来编辑'
    context.mergeDocumentId.value = 77
    assert.equal(action.details.targetCurrent(), false)
    const signal = new AbortController().signal
    await action.execute(signal)
    assert.equal(call[0], 9)
    assert.equal(call[1], 66)
    assert.equal(call[2].content, '原正文')
    assert.equal(call[2].title, '原标题')
    assert.equal(Object.isFrozen(call[2]), true)
    assert.equal(call[3].signal, signal)
  },
)
test(
  'evaluation caller preserves newer form while applying an acknowledged earlier case',
  options,
  async () => {
    let action
    const { context } = reviewContext({
      documents: ref([{ id: 66, status: 'PUBLISHED' }]),
      evaluationCases: ref([]),
      evaluationReport: ref({ old: true }),
      evaluationForm: { question: '原问题', expectedDocumentId: '66' },
      runInboxAction: async (key, execute, committed) => {
        action = { execute, committed }
      },
      addKnowledgeEvaluationCase: async (question, id) => ({ question, id }),
    })
    await load('addEvaluation', context)()
    context.evaluationForm.question = '新问题'
    context.evaluationForm.expectedDocumentId = '77'
    const saved = await action.execute(new AbortController().signal)
    action.committed(saved)
    assert.equal(saved.question, '原问题')
    assert.equal(saved.id, 66)
    assert.equal(context.evaluationForm.question, '新问题')
    assert.equal(context.evaluationForm.expectedDocumentId, '77')
    assert.equal(context.evaluationCases.value.length, 1)
  },
)
test(
  'feedback caller snapshots note and source id before waiting for request dispatch',
  options,
  async () => {
    let execute, call
    const { context } = reviewContext({
      resolutionDrafts: { 9: { note: ' 原核查 ', documentId: '66' } },
      feedback: ref([{ id: 9 }]),
      runInboxAction: async (key, action) => {
        execute = action
      },
      resolveMessageFeedback: async (...args) => {
        call = args
      },
    })
    await load('resolveFeedback', context)({ id: 9 })
    context.resolutionDrafts[9].note = '后来的核查'
    context.resolutionDrafts[9].documentId = '77'
    await execute(new AbortController().signal)
    assert.equal(call[0], 9)
    assert.equal(call[1], '原核查')
    assert.equal(call[2], '66')
  },
)
test(
  'merge read cannot replace a subsequently changed target or existing draft',
  options,
  async () => {
    for (const change of ['target', 'draft']) {
      const reading = deferred()
      const { context } = reviewContext({ getKnowledgeDocument: () => reading.promise })
      const pending = load(
        'prepareMerge',
        context,
      )({ id: 9, question: '公开问题', content: '公开补充' })
      if (change === 'target') context.mergeDocumentId.value = 77
      else context.mergeDraft.value = { content: '用户后来填写' }
      reading.resolve({ rawContent: '原文', title: '旧资料' })
      await pending
      assert.equal(
        context.mergeDraft.value?.content || null,
        change === 'target' ? null : '用户后来填写',
      )
    }
  },
)
test(
  'old identity merge read is cancelled and cannot apply result or notification',
  options,
  async () => {
    const reading = deferred()
    let signal
    const { state, editorScope, context } = reviewContext({
      getKnowledgeDocument: (id, options) => {
        signal = options.signal
        return reading.promise
      },
    })
    const pending = load(
      'prepareMerge',
      context,
    )({ id: 9, question: '公开问题', content: '公开补充' })
    state.owner = '3:1:2'
    editorScope.invalidate()
    assert.equal(signal.aborted, true)
    reading.reject(new Error('offline'))
    await pending
    assert.equal(context.mergeDraft.value, null)
    assert.deepEqual(state.events, [])
  },
)
test(
  'version reader suppresses duplicate requests and releases completed lifetime',
  options,
  async () => {
    const reading = deferred()
    let requests = 0,
      signal
    const { editorScope, context } = reviewContext({
      getKnowledgeDocumentVersions: (id, options) => {
        requests++
        signal = options.signal
        return reading.promise
      },
    })
    const show = load('showVersions', context)
    const pending = show({ id: 66 })
    await show({ id: 66 })
    assert.equal(requests, 1)
    reading.resolve([{ id: 66, versionNumber: 1 }])
    await pending
    assert.equal(context.versionHistories[66].length, 1)
    assert.equal(context.versionReads.size, 0)
    editorScope.invalidate()
    assert.equal(signal.aborted, false)
  },
)
test(
  'late version response from prior identity is ignored after cancellation',
  options,
  async () => {
    const reading = deferred()
    const { state, editorScope, context } = reviewContext({
      getKnowledgeDocumentVersions: () => reading.promise,
    })
    const pending = load('showVersions', context)({ id: 66 })
    state.owner = '3:1:2'
    editorScope.invalidate()
    context.versionReads.clear()
    reading.resolve([{ id: 66 }])
    await pending
    assert.equal(context.versionHistories[66], undefined)
    assert.deepEqual(state.events, [])
  },
)
test(
  'actual inbox wrapper uses scoped runner and cannot unlock a later owner',
  options,
  async () => {
    const writing = deferred(),
      started = deferred()
    const { state, context } = reviewContext({ refreshOverview: async () => {} })
    context.adminActions = createScopedAdminActions(() => state.owner)
    const run = load('runInboxAction', context)
    const pending = run(
      'approve-9',
      () => {
        started.resolve()
        return writing.promise
      },
      () => state.events.push('committed'),
    )
    await started.promise
    state.owner = '3:1:2'
    context.adminActions.invalidate()
    context.processingKey.value = 'merge-10'
    context.actionRunning.value = true
    writing.resolve({ id: 9 })
    await pending
    assert.equal(context.processingKey.value, 'merge-10')
    assert.equal(context.actionRunning.value, true)
    assert.deepEqual(state.events, [])
  },
)
test('ten inbox writes connect the same guard and caller cancellation', options, () => {
  for (const name of [
    'retryJob',
    'checkDocumentUpdate',
    'dismissDetectedUpdate',
    'approve',
    'reject',
    'confirmMerge',
    'markHandled',
    'addEvaluation',
    'removeEvaluation',
    'resolveFeedback',
  ]) {
    const body = view.split(`async function ${name}(`)[1].split('\nasync function ')[0]
    assert.match(body, /await runInboxAction\(/)
    assert.match(body, /signal => [^(]+\([^\n]*\{ signal \}\)/)
  }
  assert.match(view, /aria-label="评测问题"/)
  assert.match(view, /aria-label="标准资料"/)
})
test('inbox APIs and related reads all forward cancellation options', options, () => {
  const api = readFileSync(new URL('../src/api/admin.js', import.meta.url), 'utf8')
  for (const name of [
    'retryBackgroundJob',
    'checkKnowledgeDocumentUpdate',
    'dismissKnowledgeUpdate',
    'approveKnowledgeSubmission',
    'rejectKnowledgeSubmission',
    'mergeKnowledgeSubmission',
    'markContactMessageHandled',
    'addKnowledgeEvaluationCase',
    'deleteKnowledgeEvaluationCase',
    'resolveMessageFeedback',
    'getKnowledgeDocumentVersions',
  ]) {
    const body = api.split(`export async function ${name}(`)[1].split('\nexport async function ')[0]
    assert.match(body, /options = \{\}/)
    assert.match(body, /(?:, options\)|}, options\))/)
  }
})
