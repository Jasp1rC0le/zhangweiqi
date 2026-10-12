import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createScopedAdminActions } from '../src/utils/scopedAdminActions.js'

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
  const state = { owner: '2:1:1', available: true, busy: false, events: [], signal: null }
  const scope = createScopedAdminActions(
    () => state.owner,
    () => state.available,
  )
  const handlers = () => ({
    confirm: async () => true,
    execute: async (signal) => {
      state.signal = signal
      state.events.push('execute')
      return { id: 66 }
    },
    committed: (result) => state.events.push(`commit:${result.id}`),
    refresh: async (current) => {
      if (current()) state.events.push('refresh')
    },
    failed: () => state.events.push('failed'),
    refreshFailed: () => state.events.push('refreshFailed'),
    pending: (value) => {
      state.busy = value
      state.events.push(`busy:${value}`)
    },
    outdated: () => state.events.push('outdated'),
  })
  return { state, scope, handlers }
}
test('missing identity never confirms or executes', options, async () => {
  const { state, scope, handlers } = fixture()
  state.owner = ''
  let asks = 0
  assert.equal(
    await scope.run({
      ...handlers(),
      confirm: async () => {
        asks++
        return true
      },
    }),
    false,
  )
  assert.equal(asks, 0)
  assert.deepEqual(state.events, [])
})
test('another busy operation prevents confirmation and dispatch', options, async () => {
  const { state, scope, handlers } = fixture()
  state.available = false
  assert.equal(await scope.run(handlers()), false)
  assert.deepEqual(state.events, [])
})
test('cancelled confirmation preserves state and allows a later attempt', options, async () => {
  const { state, scope, handlers } = fixture()
  assert.equal(await scope.run({ ...handlers(), confirm: async () => false }), false)
  assert.deepEqual(state.events, [])
  assert.equal(await scope.run(handlers()), true)
  assert.deepEqual(state.events, ['busy:true', 'execute', 'commit:66', 'refresh', 'busy:false'])
})
test('a repeated click while confirming cannot open a second dialog', options, async () => {
  const { state, scope, handlers } = fixture(),
    decision = deferred()
  let asks = 0
  const action = {
    ...handlers(),
    confirm: () => {
      asks++
      return decision.promise
    },
  }
  const first = scope.run(action)
  assert.equal(await scope.run(action), false)
  assert.equal(asks, 1)
  decision.resolve(false)
  await first
  assert.deepEqual(state.events, [])
})
test(
  'account school and same-account epoch changes invalidate a waiting decision',
  options,
  async () => {
    for (const next of ['3:1:1', '2:2:1', '2:1:2', '']) {
      const { state, scope, handlers } = fixture(),
        decision = deferred()
      const first = scope.run({ ...handlers(), confirm: () => decision.promise })
      state.owner = next
      scope.invalidate()
      decision.resolve(true)
      assert.equal(await first, false)
      assert.deepEqual(state.events, [])
    }
  },
)
test('changed then restored identity cannot revive its earlier decision', options, async () => {
  const { state, scope, handlers } = fixture(),
    decision = deferred()
  const first = scope.run({ ...handlers(), confirm: () => decision.promise })
  state.owner = '3:1:1'
  scope.invalidate()
  state.owner = '2:1:1'
  scope.invalidate()
  decision.resolve(true)
  assert.equal(await first, false)
  assert.deepEqual(state.events, [])
})
test(
  'a changed document version candidate or evaluation set is rechecked after confirm',
  options,
  async () => {
    const { state, scope, handlers } = fixture(),
      decision = deferred()
    let valid = true
    const first = scope.run({
      ...handlers(),
      confirm: () => decision.promise,
      targetCurrent: () => valid,
    })
    valid = false
    decision.resolve(true)
    assert.equal(await first, false)
    assert.deepEqual(state.events, ['outdated'])
  },
)
test('duplicate click during a write cannot create a second request', options, async () => {
  const { state, scope, handlers } = fixture(),
    write = deferred(),
    started = deferred()
  const first = scope.run({
    ...handlers(),
    execute: () => {
      started.resolve()
      return write.promise
    },
  })
  await started.promise
  assert.equal(await scope.run(handlers()), false)
  write.resolve({ id: 66 })
  await first
  assert.deepEqual(state.events, ['busy:true', 'commit:66', 'refresh', 'busy:false'])
})
test(
  'identity invalidation cancels transport and ignores late successful result',
  options,
  async () => {
    const { state, scope, handlers } = fixture(),
      write = deferred(),
      started = deferred()
    const first = scope.run({
      ...handlers(),
      execute: (signal) => {
        state.signal = signal
        started.resolve()
        return write.promise
      },
    })
    await started.promise
    state.owner = '3:1:2'
    scope.invalidate()
    state.busy = false
    assert.equal(state.signal.aborted, true)
    write.resolve({ id: 66 })
    assert.equal(await first, false)
    assert.deepEqual(state.events, ['busy:true'])
  },
)
test(
  'disposal aborts in-flight requests and prevents every subsequent operation',
  options,
  async () => {
    const { state, scope, handlers } = fixture(),
      write = deferred(),
      started = deferred()
    const first = scope.run({
      ...handlers(),
      execute: (signal) => {
        state.signal = signal
        started.resolve()
        return write.promise
      },
    })
    await started.promise
    scope.dispose()
    assert.equal(scope.key(), null)
    assert.equal(state.signal.aborted, true)
    write.reject(new Error('cancelled'))
    await first
    assert.equal(await scope.run(handlers()), false)
    assert.deepEqual(state.events, ['busy:true'])
  },
)
test('late error cannot notify or unlock a newer administrator', options, async () => {
  const { state, scope, handlers } = fixture(),
    write = deferred(),
    started = deferred()
  const first = scope.run({
    ...handlers(),
    execute: () => {
      started.resolve()
      return write.promise
    },
  })
  await started.promise
  state.owner = '3:1:2'
  scope.invalidate()
  state.busy = true
  write.reject(new Error('network'))
  await first
  assert.equal(state.busy, true)
  assert.deepEqual(state.events, ['busy:true'])
})
test('old operation cleanup cannot release a later operation lock', options, async () => {
  const { state, scope, handlers } = fixture()
  const oldWrite = deferred(),
    newWrite = deferred(),
    oldStarted = deferred(),
    newStarted = deferred()
  const first = scope.run({
    ...handlers(),
    execute: () => {
      oldStarted.resolve()
      return oldWrite.promise
    },
  })
  await oldStarted.promise
  state.owner = '3:1:2'
  scope.invalidate()
  const second = scope.run({
    ...handlers(),
    execute: () => {
      newStarted.resolve()
      return newWrite.promise
    },
  })
  await newStarted.promise
  oldWrite.resolve({ id: 66 })
  await first
  assert.equal(await scope.run(handlers()), false)
  assert.equal(state.busy, true)
  newWrite.resolve({ id: 77 })
  await second
  assert.deepEqual(state.events, ['busy:true', 'busy:true', 'commit:77', 'refresh', 'busy:false'])
})
test('failed request keeps state and releases its own lock for retry', options, async () => {
  const { state, scope, handlers } = fixture()
  assert.equal(
    await scope.run({
      ...handlers(),
      execute: async () => {
        throw new Error('409')
      },
    }),
    false,
  )
  assert.deepEqual(state.events, ['busy:true', 'failed', 'busy:false'])
  assert.equal(await scope.run(handlers()), true)
})
test('acknowledged write followed by list failure is not a failed write', options, async () => {
  const { state, scope, handlers } = fixture()
  assert.equal(
    await scope.run({
      ...handlers(),
      refresh: async () => {
        throw new Error('offline')
      },
    }),
    true,
  )
  assert.deepEqual(state.events, [
    'busy:true',
    'execute',
    'commit:66',
    'refreshFailed',
    'busy:false',
  ])
})
test(
  'UI application failure after acknowledgement does not invite another write',
  options,
  async () => {
    const { state, scope, handlers } = fixture()
    assert.equal(
      await scope.run({
        ...handlers(),
        committed: () => {
          throw new Error('render')
        },
      }),
      true,
    )
    assert.deepEqual(state.events, ['busy:true', 'execute', 'refreshFailed', 'busy:false'])
  },
)
test('late refresh error cannot warn or clear later state', options, async () => {
  const { state, scope, handlers } = fixture(),
    reading = deferred(),
    started = deferred()
  const first = scope.run({
    ...handlers(),
    refresh: () => {
      started.resolve()
      return reading.promise
    },
  })
  await started.promise
  state.owner = '3:1:2'
  scope.invalidate()
  state.busy = true
  reading.reject(new Error('offline'))
  await first
  assert.equal(state.busy, true)
  assert.deepEqual(state.events, ['busy:true', 'execute', 'commit:66'])
})
test(
  'finished request releases its controller and is not aborted by later identity changes',
  options,
  async () => {
    const { state, scope, handlers } = fixture()
    await scope.run(handlers())
    scope.invalidate()
    assert.equal(state.signal.aborted, false)
  },
)
const view = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
test(
  'four destructive or metered actions use identity-scoped runner and cancellation',
  options,
  () => {
    for (const name of [
      'applyDetectedUpdate',
      'toggleDocument',
      'evaluateKnowledge',
      'indexKnowledge',
    ]) {
      const body = view.split(`async function ${name}(`)[1].split('\nasync function ')[0]
      assert.match(body, /await adminActions\.run\(/)
      assert.match(body, /confirmAction\(/)
      assert.match(body, /execute: signal => [^(]+\([^\n]*\{ signal \}\)/)
    }
    assert.match(view, /onBeforeUnmount\(adminActions\.dispose\)/)
    assert.match(view, /adminActions\.invalidate\(\); actionRunning\.value = false/)
    assert.match(view, /无需再次发布，请重新读取/)
    assert.match(view, /GLM API 并产生费用/)
    assert.match(view, /:disabled="qualityBusy \|\| actionBusy"/)
  },
)
test(
  'four transport methods forward caller cancellation without changing default callers',
  options,
  () => {
    const api = readFileSync(new URL('../src/api/admin.js', import.meta.url), 'utf8')
    for (const name of [
      'applyKnowledgeUpdate',
      'changeKnowledgeStatus',
      'runKnowledgeEvaluation',
      'indexNextKnowledgeBatch',
    ]) {
      const body = api
        .split(`export async function ${name}(`)[1]
        .split('\nexport async function ')[0]
      assert.match(body, /options = \{\}/)
      assert.match(body, /http\.(put|post)\([^\n]*options\)/)
    }
  },
)
