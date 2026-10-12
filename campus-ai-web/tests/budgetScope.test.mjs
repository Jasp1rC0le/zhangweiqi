import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { Blob } from 'node:buffer'
import { createAdminEditorScope } from '../src/utils/adminEditorScope.js'
import { budgetExportRange, dailyCostsCsv } from '../src/utils/budgetExport.js'
import { isBudgetOverview } from '../src/utils/aiBudget.js'

const options = { timeout: 1000 }
const view = readFileSync(new URL('../src/components/AiBudgetPanel.vue', import.meta.url), 'utf8')
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const ref = (value) => ({ value })
function load(name, context) {
  const start = view.indexOf(`async function ${name}(`),
    end = view.indexOf('\n}', start) + 2
  assert.ok(start >= 0 && end > start)
  return vm.runInNewContext(`${view.slice(start, end)}\n${name}`, context, { timeout: 100 })
}
const record = {
  date: '2026-10-11',
  provider: 'test-provider',
  model: 'test-model',
  attempts: 1,
  unresolved: 0,
  inputTokens: 10,
  outputTokens: 5,
  estimatedCny: 0.01,
  occupiedCny: 0.01,
}
const window = {
  attempts: 1,
  completed: 1,
  failed: 0,
  unresolved: 0,
  inputTokens: 10,
  outputTokens: 5,
  estimatedCny: 0.01,
  occupiedCny: 0.01,
  limitCny: 5,
}
const overview = () => ({
  enabled: true,
  currency: 'CNY',
  timezone: 'Asia/Shanghai',
  date: '2026-10-11',
  today: { ...window },
  month: { ...window, from: '2026-10-01' },
})
function fixture(extra = {}) {
  const events = [],
    owner = ref('2:1:1'),
    exportFrom = ref('2026-10-01'),
    exportThrough = ref('2026-10-11')
  const scope = createAdminEditorScope(
    () => owner.value,
    () => ({ from: exportFrom.value, through: exportThrough.value }),
  )
  const context = {
    disposed: false,
    owner,
    scope,
    exportFrom,
    exportThrough,
    budget: ref(overview()),
    pending: ref(false),
    error: ref(''),
    exportPending: ref(false),
    exportNotice: ref(''),
    getAiBudget: async () => overview(),
    getAiDailyCosts: async () => [record],
    isBudgetOverview,
    budgetExportRange,
    dailyCostsCsv,
    Blob,
    URL: {
      createObjectURL: () => {
        events.push('blob')
        return 'blob:test'
      },
      revokeObjectURL: (url) => events.push(`release:${url}`),
    },
    document: {
      createElement: () => ({
        click() {
          events.push({ download: this.download })
        },
      }),
    },
    setTimeout: (fn) => fn(),
    ...extra,
  }
  return { context, events, scope }
}
test('export range is exact inclusive 1 to 31 days and frozen', options, () => {
  const range = budgetExportRange('2026-10-01', '2026-10-31', '2026-10-31')
  assert.deepEqual(range, { from: '2026-10-01', through: '2026-10-31', until: '2026-11-01' })
  assert.equal(Object.isFrozen(range), true)
  assert.equal(budgetExportRange('2024-02-29', '2024-02-29', '2024-03-01').until, '2024-03-01')
})
test('range rejects rollovers impossible dates future dates and more than 31 days', options, () => {
  for (const values of [
    ['2026-02-30', '2026-03-01', '2026-10-11'],
    ['2026-01-01', '2026-02-01', '2026-10-11'],
    ['2026-10-12', '2026-10-12', '2026-10-11'],
    ['2026-10-11', '2026-10-01', '2026-10-11'],
    ['2026-2-01', '2026-02-02', '2026-10-11'],
    ['2026-02-01', '2026-02-02', 'invalid'],
  ])
    assert.throws(() => budgetExportRange(...values))
})
test(
  'normal export freezes dates forwards cancellation and releases download URL',
  options,
  async () => {
    let call
    const f = fixture({
      getAiDailyCosts: async (...args) => {
        call = args
        return [record]
      },
    })
    await load('exportCosts', f.context)()
    assert.equal(call[0], '2026-10-01')
    assert.equal(call[1], '2026-10-12')
    assert.ok(call[2].signal)
    assert.deepEqual(f.events, [
      'blob',
      { download: 'campthink-estimated-cost-2026-10-01-2026-10-11.csv' },
      'release:blob:test',
    ])
    assert.equal(f.context.exportPending.value, false)
    assert.match(f.context.exportNotice.value, /仍需核对/)
  },
)
test(
  'account school login epoch or unmount cancels export and never downloads old costs',
  options,
  async () => {
    for (const next of ['3:1:1', '2:2:1', '2:1:2', 'disposed']) {
      const response = deferred()
      let signal
      const f = fixture({
        getAiDailyCosts: (from, until, options) => {
          signal = options.signal
          return response.promise
        },
      })
      const a = load('exportCosts', f.context)()
      if (next === 'disposed') {
        f.context.disposed = true
        f.scope.dispose()
      } else {
        f.context.owner.value = next
        f.scope.invalidate()
      }
      f.context.exportPending.value = true
      f.context.exportNotice.value = '新账号提示'
      response.resolve([record])
      await a
      assert.equal(signal.aborted, true)
      assert.deepEqual(f.events, [])
      assert.equal(f.context.exportNotice.value, '新账号提示')
      assert.equal(f.context.exportPending.value, true)
    }
  },
)
test('edited then restored export range cannot revive earlier response', options, async () => {
  const response = deferred(),
    f = fixture({ getAiDailyCosts: () => response.promise })
  const a = load('exportCosts', f.context)()
  f.context.exportFrom.value = '2026-10-02'
  f.scope.invalidateDraft()
  f.context.exportFrom.value = '2026-10-01'
  f.scope.invalidateDraft()
  response.resolve([record])
  await a
  assert.deepEqual(f.events, [])
  assert.equal(f.context.exportPending.value, false)
})
test('empty malformed or failed costs never create a misleading bill', options, async () => {
  for (const response of [[], null, [{ ...record, estimatedCny: null }]]) {
    const f = fixture({ getAiDailyCosts: async () => response })
    await load('exportCosts', f.context)()
    assert.deepEqual(f.events, [])
    assert.equal(f.context.exportPending.value, false)
    assert.ok(f.context.exportNotice.value)
  }
  const f = fixture({
    getAiDailyCosts: async () => {
      throw new Error('offline')
    },
  })
  await load('exportCosts', f.context)()
  assert.match(f.context.exportNotice.value, /导出失败/)
  assert.deepEqual(f.events, [])
})
test('missing identity or a simultaneous refresh cannot export', options, async () => {
  for (const change of [
    (f) => (f.context.owner.value = ''),
    (f) => (f.context.pending.value = true),
    (f) => (f.context.exportPending.value = true),
    (f) => (f.context.budget.value = null),
  ]) {
    const f = fixture()
    change(f)
    await load('exportCosts', f.context)()
    assert.deepEqual(f.events, [])
  }
})
test(
  'old budget read cannot repopulate new identity or show old permission errors',
  options,
  async () => {
    for (const failed of [false, true]) {
      const response = deferred()
      let signal
      const f = fixture({
        getAiBudget: (options) => {
          signal = options.signal
          return response.promise
        },
      })
      const a = load('refresh', f.context)()
      f.context.owner.value = '3:1:1'
      f.scope.invalidate()
      f.context.budget.value = null
      f.context.error.value = '新账号状态'
      f.context.pending.value = true
      if (failed) response.reject({ response: { status: 403 } })
      else response.resolve(overview())
      await a
      assert.equal(signal.aborted, true)
      assert.equal(f.context.budget.value, null)
      assert.equal(f.context.error.value, '新账号状态')
      assert.equal(f.context.pending.value, true)
    }
  },
)
test('current 403 stays denied without inventing zero budget', options, async () => {
  const f = fixture({
    getAiBudget: async () => {
      throw { response: { status: 403 } }
    },
  })
  await load('refresh', f.context)()
  assert.equal(f.context.budget.value, null)
  assert.match(f.context.error.value, /仅向指定的成本管理员/)
  assert.equal(f.context.pending.value, false)
})
test(
  'panel resets all cost data watches synchronous identity and draft generations',
  options,
  () => {
    assert.match(view, /watch\(owner,[\s\S]*scope\.invalidate\(\); clearPrivateBudget\(\)/)
    assert.match(view, /scope\.invalidateDraft,[\s\S]*flush: 'sync'/)
    assert.match(view, /onBeforeUnmount\([\s\S]*scope\.dispose\(\); clearPrivateBudget\(\)/)
    assert.match(view, /:disabled="pending \|\| exportPending"/)
    const api = readFileSync(new URL('../src/api/admin.js', import.meta.url), 'utf8')
    assert.match(api, /getAiDailyCosts\(from, until, options = \{\}\)/)
    assert.match(api, /getAiBudget\(options = \{\}\)/)
  },
)
