import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createAdminEditorScope,
  publishScopedKnowledge,
  snapshotKnowledgePublication,
} from '../src/utils/adminEditorScope.js'

const options = { timeout: 1000 }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture() {
  const state = {
    owner: '2:1:1',
    draft: { title: '测试', content: '公开正文' },
    busy: false,
    events: [],
  }
  const scope = createAdminEditorScope(
    () => state.owner,
    () => state.draft,
  )
  const handlers = () => ({
    ticket: scope.capture(),
    confirm: async () => true,
    publish: async () => {
      state.events.push('write')
      return { documentId: 3 }
    },
    committed: () => {
      state.events.push('commit')
      state.draft = {}
      scope.invalidateDraft()
    },
    refresh: async (current) => {
      if (current()) state.events.push('refresh')
    },
    failed: () => state.events.push('failed'),
    refreshFailed: () => state.events.push('refreshFailed'),
    pending: (value) => {
      state.busy = value
      state.events.push(`busy:${value}`)
    },
  })
  return { state, scope, handlers }
}

test('identity tickets reject account school and same-account login epoch changes', options, () => {
  for (const next of ['3:1:1', '2:2:1', '2:1:2', '']) {
    const { state, scope } = fixture(),
      ticket = scope.capture()
    state.owner = next
    assert.equal(ticket.current(), false)
    assert.equal(ticket.unchanged(), false)
  }
  const { scope } = fixture(),
    ticket = scope.capture()
  assert.equal(ticket.current(), true) // Token renewal does not change owner epoch.
})
test('a draft changed and restored cannot revive its earlier confirmation', options, () => {
  const { state, scope } = fixture(),
    ticket = scope.capture(),
    key = scope.key()
  state.draft.content = '新的内容'
  scope.invalidateDraft()
  state.draft.content = '公开正文'
  scope.invalidateDraft()
  assert.equal(ticket.current(), true)
  assert.equal(ticket.unchanged(), false)
  assert.notEqual(scope.key(), key)
})
test(
  'a successful reset keeps only the identity ticket valid, disposal invalidates both',
  options,
  () => {
    const { state, scope } = fixture(),
      ticket = scope.capture()
    state.draft = {}
    scope.invalidateDraft()
    assert.equal(ticket.current(), true)
    assert.equal(ticket.unchanged(), false)
    scope.dispose()
    assert.equal(ticket.current(), false)
    assert.equal(scope.key(), null)
  },
)
test('missing identity and explicit invalidate cannot authorize editor work', options, () => {
  const { state, scope } = fixture(),
    ticket = scope.capture()
  scope.invalidate()
  assert.equal(ticket.current(), false)
  state.owner = ''
  const absent = scope.capture()
  state.owner = '2:1:1'
  assert.equal(absent.current(), false)
})
test(
  'identity invalidation aborts a request before its deferred transport starts',
  options,
  async () => {
    const { state, scope, handlers } = fixture()
    const ticket = scope.capture({ abortable: true })
    let dispatched = 0
    await publishScopedKnowledge({
      ...handlers(),
      ticket,
      publish: async () => {
        // Model the async request interceptor between confirmation and transport.
        state.owner = '3:1:2'
        scope.invalidate()
        await Promise.resolve()
        ticket.signal.throwIfAborted()
        dispatched++
      },
    })
    assert.equal(ticket.signal.aborted, true)
    assert.equal(dispatched, 0)
    assert.deepEqual(state.events, ['busy:true'])
  },
)
test('disposal and missing identity immediately cancel abortable editor tickets', options, () => {
  const { state, scope } = fixture()
  const ticket = scope.capture({ abortable: true })
  scope.dispose()
  assert.equal(ticket.signal.aborted, true)
  state.owner = ''
  assert.equal(scope.capture({ abortable: true }).signal.aborted, true)
})
test('released tickets no longer receive later cancellation, active tickets do', options, () => {
  const { scope } = fixture()
  const finished = scope.capture({ abortable: true })
  const active = scope.capture({ abortable: true })
  finished.release()
  finished.release()
  scope.invalidate()
  assert.equal(finished.signal.aborted, false)
  assert.equal(active.signal.aborted, true)
})
test(
  'cancelled publication releases its ticket without changing draft or loading',
  options,
  async () => {
    const { state, scope, handlers } = fixture()
    const ticket = scope.capture({ abortable: true })
    await publishScopedKnowledge({ ...handlers(), ticket, confirm: async () => false })
    scope.invalidate()
    assert.equal(ticket.signal.aborted, false)
    assert.deepEqual(state.events, [])
    assert.equal(state.draft.content, '公开正文')
  },
)
test(
  'publication snapshot is immutable and cannot borrow a later draft or revision',
  options,
  () => {
    const form = {
      title: ' 标题 ',
      category: ' 分类 ',
      sourceDepartment: ' ',
      sourceUrl: ' ',
      publishedAt: '',
      effectiveAt: '',
      expiresAt: '',
      content: ' 正文 ',
    }
    const snapshot = snapshotKnowledgePublication(form, 66, 1)
    form.title = '别的'
    form.content = '别的'
    assert.deepEqual(snapshot, {
      editingId: 66,
      payload: {
        schoolId: 1,
        title: '标题',
        category: '分类',
        sourceDepartment: null,
        sourceUrl: null,
        publishedAt: null,
        effectiveAt: null,
        expiresAt: null,
        content: '正文',
      },
    })
    assert.ok(Object.isFrozen(snapshot))
    assert.ok(Object.isFrozen(snapshot.payload))
  },
)
test('cancel never publishes and preserves draft and unlocked state', options, async () => {
  const { state, handlers } = fixture()
  assert.equal(await publishScopedKnowledge({ ...handlers(), confirm: async () => false }), false)
  assert.deepEqual(state.events, [])
  assert.equal(state.draft.content, '公开正文')
})
test(
  'identity change while confirming prevents network call and old finalizer',
  options,
  async () => {
    const { state, handlers } = fixture(),
      decision = deferred()
    const result = publishScopedKnowledge({ ...handlers(), confirm: () => decision.promise })
    state.owner = '2:1:2'
    state.busy = false
    decision.resolve(true)
    assert.equal(await result, false)
    assert.deepEqual(state.events, [])
    assert.equal(state.busy, false)
  },
)
test(
  'draft change during a confirmation prevents submitting the later contents',
  options,
  async () => {
    const { state, scope, handlers } = fixture(),
      decision = deferred()
    const result = publishScopedKnowledge({ ...handlers(), confirm: () => decision.promise })
    state.draft.title = '另一份资料'
    scope.invalidateDraft()
    decision.resolve(true)
    assert.equal(await result, false)
    assert.deepEqual(state.events, [])
    assert.equal(state.draft.title, '另一份资料')
  },
)
test(
  'late successful write cannot reset a different administrator or start refresh',
  options,
  async () => {
    const { state, handlers } = fixture(),
      write = deferred(),
      started = deferred()
    const result = publishScopedKnowledge({
      ...handlers(),
      publish: () => {
        started.resolve()
        return write.promise
      },
    })
    await started.promise
    state.owner = '3:1:2'
    state.draft = { title: '新管理员草稿' }
    state.busy = true
    write.resolve({ documentId: 9 })
    assert.equal(await result, false)
    assert.deepEqual(state.events, ['busy:true'])
    assert.equal(state.busy, true)
    assert.equal(state.draft.title, '新管理员草稿')
  },
)
test(
  'late successful write cannot clear an edited draft in the same identity',
  options,
  async () => {
    const { state, scope, handlers } = fixture(),
      write = deferred(),
      started = deferred()
    const result = publishScopedKnowledge({
      ...handlers(),
      publish: () => {
        started.resolve()
        return write.promise
      },
    })
    await started.promise
    state.draft.title = '后来改的'
    scope.invalidateDraft()
    write.resolve({ documentId: 9 })
    assert.equal(await result, false)
    assert.deepEqual(state.events, ['busy:true', 'busy:false'])
    assert.equal(state.draft.title, '后来改的')
  },
)
test(
  'failed current write preserves contents and does not refresh or commit',
  options,
  async () => {
    const { state, handlers } = fixture()
    await publishScopedKnowledge({
      ...handlers(),
      publish: async () => {
        throw new Error('409')
      },
    })
    assert.deepEqual(state.events, ['busy:true', 'failed', 'busy:false'])
    assert.equal(state.draft.content, '公开正文')
  },
)
test(
  'committed publication survives form reset and list failure without inviting republish',
  options,
  async () => {
    const { state, handlers } = fixture()
    assert.equal(
      await publishScopedKnowledge({
        ...handlers(),
        refresh: async () => {
          throw new Error('offline')
        },
      }),
      true,
    )
    assert.deepEqual(state.events, ['busy:true', 'write', 'commit', 'refreshFailed', 'busy:false'])
  },
)
test(
  'late refresh failure cannot add an error or unlock a later administrator',
  options,
  async () => {
    const { state, handlers } = fixture(),
      refresh = deferred(),
      started = deferred()
    const result = publishScopedKnowledge({
      ...handlers(),
      refresh: () => {
        started.resolve()
        return refresh.promise
      },
    })
    await started.promise
    state.owner = '3:1:2'
    state.busy = true
    refresh.reject(new Error('offline'))
    await result
    assert.deepEqual(state.events, ['busy:true', 'write', 'commit'])
    assert.equal(state.busy, true)
  },
)
test(
  'late rejected write never shows old error or clears a later loading state',
  options,
  async () => {
    const { state, handlers } = fixture(),
      write = deferred(),
      started = deferred()
    const result = publishScopedKnowledge({
      ...handlers(),
      publish: () => {
        started.resolve()
        return write.promise
      },
    })
    await started.promise
    state.owner = ''
    state.busy = false
    write.reject(new Error('401'))
    await result
    assert.deepEqual(state.events, ['busy:true'])
  },
)

const view = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
const http = readFileSync(new URL('../src/api/http.js', import.meta.url), 'utf8')
test(
  'single editor connects session epoch, synchronous draft invalidation, reset and disposal',
  options,
  () => {
    assert.match(view, /adminAuth\.user\.schoolId\}:\$\{userSessionGeneration\.value\}/)
    assert.match(view, /editorScope\.invalidateDraft, \{ flush: 'sync' \}/)
    assert.match(
      view,
      /watch\(editorOwner,[\s\S]*?editorScope\.invalidate\(\)[\s\S]*?resetImportForm\(\)[\s\S]*?flush: 'sync'/,
    )
    assert.match(view, /onBeforeUnmount\(editorScope\.dispose\)/)
    assert.match(http, /onExpired: \(\) => \{\s*userSessionGeneration\.value\+\+/)
    assert.match(http, /session\.setToken\(token, user\)\s*userSessionGeneration\.value\+\+/)
  },
)
test(
  'single publication captures payload before scoped confirmation and gates list application',
  options,
  () => {
    assert.match(
      view,
      /snapshotKnowledgePublication\(importForm, revisionOf\.value, schoolId\)[\s\S]*?await publishScopedKnowledge/,
    )
    assert.match(view, /confirm: \(\) => confirmImport/)
    assert.match(view, /if \(current\(\)\) \{ documents\.value = latest/)
    assert.match(view, /无需再次发布，请重试读取/)
  },
)
test('preview original read and discard use draft tickets after their awaits', options, () => {
  assert.match(
    view,
    /applyPreview\(await previewKnowledgeUrl\(url, \{ signal: ticket\.signal \}\), ticket\)/,
  )
  assert.match(
    view,
    /applyPreview\(await previewKnowledgeFile\(file, \{ signal: ticket\.signal \}\), ticket\)/,
  )
  assert.match(view, /if \(!await mayReplaceImport\(\)\) return\s*if \(!ticket\.unchanged\(\)/)
  assert.match(view, /if \(await mayReplaceImport\(true\) && ticket\.unchanged\(\)\)/)
  assert.match(
    view,
    /await getKnowledgeDocument\(item\.id, \{ signal: ticket\.signal \}\)[\s\S]*?if \(!ticket\.unchanged\(\)\) return/,
  )
})
test(
  'single editor transport forwards abort signals and releases request lifetimes',
  options,
  () => {
    const api = readFileSync(new URL('../src/api/admin.js', import.meta.url), 'utf8')
    assert.equal((view.match(/capture\(\{ abortable: true \}\)/g) || []).length, 6)
    assert.match(
      view,
      /reviseKnowledgeDocument\(editingId, payload, \{ signal: ticket\.signal \}\)/,
    )
    assert.match(view, /importKnowledgeDocument\(payload, \{ signal: ticket\.signal \}\)/)
    for (const name of [
      'importKnowledgeDocument',
      'previewKnowledgeUrl',
      'previewKnowledgeFiles',
      'getKnowledgeDocument',
      'reviseKnowledgeDocument',
    ]) {
      assert.match(
        api,
        new RegExp(
          `export async function ${name}\\([^\\n]*options = \\{\\}\\)[\\s\\S]*?http\\.(post|get)\\([^\\n]*options\\)`,
        ),
      )
    }
    assert.match(api, /previewKnowledgeFiles\(\[file\], options\)/)
  },
)
test(
  'confirmation locks editor and navigation without storing administrator drafts',
  options,
  () => {
    assert.match(view, /editorLoading \|\| importConfirming"/)
    assert.match(view, /importConfirming\.value \|\| Boolean\(batchImport/)
    const helper = readFileSync(
      new URL('../src/utils/adminEditorScope.js', import.meta.url),
      'utf8',
    )
    assert.doesNotMatch(helper, /localStorage|sessionStorage|password|cookie|token/i)
  },
)
