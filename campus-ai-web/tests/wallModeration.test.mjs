import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createWallModeration, createWallModerationState } from '../src/utils/wallModeration.js'

const options = { timeout: 1000 }
const entry = (extra = {}) => ({
  id: 'post-a',
  parentId: null,
  revision: 1,
  status: 'PENDING',
  title: '公开测试主题',
  body: '合成测试正文',
  ...extra,
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture(extra = {}) {
  const principal = { value: '2:1:1' },
    state = createWallModerationState(),
    calls = []
  const api = {
    wallQueue: async () => [entry()],
    wallReports: async () => [],
    wallModerationContext: async (id) => entry({ id }),
    reviewWall: async (...args) => {
      calls.push(args)
    },
    ...extra.api,
  }
  const controller = createWallModeration({
    owner: () => principal.value,
    state,
    api,
    confirm: extra.confirm || (async () => true),
  })
  return { principal, state, calls, api, controller }
}
test('missing administrator never reads or reviews', options, async () => {
  const f = fixture()
  f.principal.value = ''
  assert.equal(await f.controller.load(), false)
  assert.equal(await f.controller.review(entry(), 'PUBLISHED'), false)
  assert.deepEqual(f.calls, [])
})
test('queue loads entries and reports atomically with cancellable requests', options, async () => {
  let first, second
  const f = fixture({
    api: {
      wallQueue: async (options) => {
        first = options.signal
        return [entry()]
      },
      wallReports: async (options) => {
        second = options.signal
        return [{ entryId: 'post-a', reason: '其他', count: 2 }]
      },
    },
  })
  assert.equal(await f.controller.load(), true)
  assert.equal(first, second)
  assert.equal(first.aborted, false)
  assert.equal(f.state.entries.length, 1)
  assert.equal(f.state.reports[0].count, 2)
  f.controller.reset()
  assert.equal(first.aborted, false)
})
test(
  'account school login epoch and ABA resets discard late reads and clear notes parents',
  options,
  async () => {
    for (const next of ['3:1:1', '2:2:1', '2:1:2', '2:1:1']) {
      const response = deferred()
      let signal
      const f = fixture({
        api: {
          wallQueue: (options) => {
            signal = options.signal
            return response.promise
          },
        },
      })
      f.state.notes['post-a'] = '原管理员审核说明'
      f.state.parents.parent = entry()
      const reading = f.controller.load()
      f.principal.value = next
      f.controller.reset()
      response.resolve([entry()])
      assert.equal(await reading, false)
      assert.equal(signal.aborted, true)
      assert.deepEqual(f.state.notes, {})
      assert.deepEqual(f.state.parents, {})
      assert.deepEqual(f.state.entries, [])
      assert.equal(f.state.loading, false)
    }
  },
)
test('latest refresh wins and older completion cannot unlock a new load', options, async () => {
  const first = deferred(),
    second = deferred()
  let count = 0
  const f = fixture({ api: { wallQueue: () => (++count === 1 ? first.promise : second.promise) } })
  const a = f.controller.load(),
    b = f.controller.load()
  first.resolve([entry({ title: '旧标题' })])
  assert.equal(await a, false)
  assert.equal(f.state.loading, true)
  second.resolve([entry({ title: '新标题' })])
  assert.equal(await b, true)
  assert.equal(f.state.entries[0].title, '新标题')
})
test(
  'partial failure and malformed responses preserve old queue and block review',
  options,
  async () => {
    for (const result of [null, [entry({ revision: 0 })], new Array(101).fill(entry())]) {
      const f = fixture({ api: { wallQueue: async () => result } })
      f.state.entries = [entry({ title: '保留旧内容' })]
      assert.equal(await f.controller.load(), false)
      assert.equal(f.state.entries[0].title, '保留旧内容')
      assert.equal(f.state.needsReload, true)
      assert.equal(await f.controller.review(f.state.entries[0], 'PUBLISHED'), false)
    }
    const f = fixture({
      api: {
        wallReports: async () => {
          throw new Error('offline')
        },
      },
    })
    f.state.entries = [entry()]
    assert.equal(await f.controller.load(), false)
    assert.equal(f.state.entries.length, 1)
  },
)
test('successful reload clears uncertain-submit lock but preserves notes', options, async () => {
  const f = fixture()
  f.state.needsReload = true
  f.state.notes['post-a'] = '保留说明'
  assert.equal(await f.controller.load(), true)
  assert.equal(f.state.needsReload, false)
  assert.equal(f.state.notes['post-a'], '保留说明')
})
test('cancelled review makes no request and preserves note queue', options, async () => {
  const f = fixture({ confirm: async () => false })
  await f.controller.load()
  f.state.notes['post-a'] = '说明'
  assert.equal(await f.controller.review(f.state.entries[0], 'PUBLISHED'), false)
  assert.equal(f.calls.length, 0)
  assert.equal(f.state.entries.length, 1)
  assert.equal(f.state.notes['post-a'], '说明')
})
test('duplicate click during confirmation opens one decision only', options, async () => {
  const decision = deferred()
  let asks = 0
  const f = fixture({
    confirm: () => {
      asks++
      return decision.promise
    },
  })
  await f.controller.load()
  const a = f.controller.review(f.state.entries[0], 'PUBLISHED')
  assert.equal(await f.controller.review(f.state.entries[0], 'REJECTED'), false)
  assert.equal(asks, 1)
  decision.resolve(false)
  await a
  assert.equal(f.calls.length, 0)
})
test('identity changes while confirming cannot dispatch old review', options, async () => {
  const decision = deferred(),
    f = fixture({ confirm: () => decision.promise })
  await f.controller.load()
  const a = f.controller.review(f.state.entries[0], 'PUBLISHED')
  f.principal.value = '2:1:2'
  f.controller.reset()
  decision.resolve(true)
  assert.equal(await a, false)
  assert.equal(f.calls.length, 0)
})
test(
  'changed target revision content or note is rechecked after confirmation',
  options,
  async () => {
    for (const mutation of [
      (f) => f.state.entries[0].revision++,
      (f) => (f.state.entries[0].body = '已编辑内容'),
      (f) => (f.state.notes['post-a'] = '后来说明'),
    ]) {
      const decision = deferred(),
        f = fixture({ confirm: () => decision.promise })
      await f.controller.load()
      const a = f.controller.review(f.state.entries[0], 'PUBLISHED')
      mutation(f)
      decision.resolve(true)
      assert.equal(await a, false)
      assert.equal(f.calls.length, 0)
      assert.match(f.state.error, /已变化/)
    }
  },
)
test(
  'acknowledged review freezes note revision status and refresh failure is not failed write',
  options,
  async () => {
    const f = fixture()
    await f.controller.load()
    f.state.notes['post-a'] = ' 原说明 '
    f.api.wallQueue = async () => {
      throw new Error('offline')
    }
    assert.equal(await f.controller.review(f.state.entries[0], 'REJECTED'), true)
    assert.equal(f.calls.length, 1)
    assert.deepEqual(f.calls[0][1], { revision: 1, status: 'REJECTED', note: '原说明' })
    assert.equal(Object.isFrozen(f.calls[0][1]), true)
    assert.ok(f.calls[0][2].signal)
    assert.match(f.state.success, /已提交/)
    assert.match(f.state.error, /不要重复审核/)
    assert.equal(f.state.entries.length, 0)
    assert.equal(f.state.needsReload, true)
    assert.equal(f.state.busy, false)
    assert.equal(await f.controller.review(entry(), 'REJECTED'), false)
    assert.equal(f.calls.length, 1)
  },
)
test('failed write keeps note and queue and requires fresh verification', options, async () => {
  const f = fixture({
    api: {
      reviewWall: async () => {
        throw new Error('offline')
      },
    },
  })
  await f.controller.load()
  f.state.notes['post-a'] = '原说明'
  assert.equal(await f.controller.review(f.state.entries[0], 'HIDDEN'), false)
  assert.equal(f.state.entries.length, 1)
  assert.equal(f.state.notes['post-a'], '原说明')
  assert.equal(f.state.needsReload, true)
  assert.match(f.state.error, /未能确认/)
  assert.equal(f.state.busy, false)
})
test(
  'old identity write is aborted and cannot replace newer admin state or unlock it',
  options,
  async () => {
    const write = deferred(),
      started = deferred()
    let signal
    const f = fixture({
      api: {
        reviewWall: (id, payload, options) => {
          signal = options.signal
          started.resolve()
          return write.promise
        },
      },
    })
    await f.controller.load()
    const a = f.controller.review(f.state.entries[0], 'PUBLISHED')
    await started.promise
    f.principal.value = '3:1:1'
    f.controller.reset()
    f.state.busy = true
    f.state.success = '新管理员状态'
    write.resolve()
    assert.equal(await a, false)
    assert.equal(signal.aborted, true)
    assert.equal(f.state.busy, true)
    assert.equal(f.state.success, '新管理员状态')
    assert.deepEqual(f.state.entries, [])
  },
)
test(
  'context is cancellable deduplicated and cannot reveal previous administrator parent',
  options,
  async () => {
    const response = deferred()
    let calls = 0,
      signal
    const f = fixture({
      api: {
        wallModerationContext: (id, options) => {
          calls++
          signal = options.signal
          return response.promise
        },
      },
    })
    f.state.entries = [entry({ parentId: 'parent' })]
    const a = f.controller.context('parent')
    assert.equal(await f.controller.context('parent'), false)
    assert.equal(calls, 1)
    f.controller.reset()
    response.resolve(entry({ id: 'parent' }))
    assert.equal(await a, false)
    assert.equal(signal.aborted, true)
    assert.deepEqual(f.state.parents, {})
  },
)
test('invalid parent response cannot overwrite existing context', options, async () => {
  const f = fixture({ api: { wallModerationContext: async () => entry({ id: 'wrong-parent' }) } })
  f.state.entries = [entry({ parentId: 'parent' })]
  f.state.parents.parent = entry({ id: 'parent' })
  assert.equal(await f.controller.context('parent'), false)
  assert.equal(f.state.parents.parent.id, 'parent')
  assert.equal(f.state.busy, false)
})
test('unmount clears all memory and ignores late failures', options, async () => {
  const response = deferred()
  let signal
  const f = fixture({
    api: {
      wallQueue: (options) => {
        signal = options.signal
        return response.promise
      },
    },
  })
  const a = f.controller.load()
  f.state.notes['post-a'] = '审核说明'
  f.controller.dispose()
  response.reject(new Error('late failure'))
  assert.equal(await a, false)
  assert.equal(signal.aborted, true)
  assert.deepEqual(f.state, createWallModerationState())
})
test(
  'wall API forwards caller cancellation on all four administrator routes',
  options,
  async () => {
    const source = readFileSync(new URL('../src/api/wall.js', import.meta.url), 'utf8')
      .replace("import http from './http'", '')
      .replaceAll('export const ', 'const ')
    const calls = [],
      http = {
        get: async (...args) => {
          calls.push(args)
          return { data: [] }
        },
        put: async (...args) => {
          calls.push(args)
        },
      }
    const api = vm.runInNewContext(
      `${source}\n;({wallQueue,wallReports,wallModerationContext,reviewWall})`,
      { http },
      { timeout: 100 },
    )
    const signal = new AbortController().signal
    await api.wallQueue({ signal })
    await api.wallReports({ signal })
    await api.wallModerationContext('parent', { signal })
    await api.reviewWall('post-a', { revision: 1 }, { signal })
    for (const call of calls) assert.equal(call.at(-1).signal, signal)
  },
)
test(
  'panel watches server admin identity and login epoch and locks all moderation inputs',
  options,
  () => {
    const source = readFileSync(new URL('../src/views/AdminWallPanel.vue', import.meta.url), 'utf8')
    assert.match(source, /auth\.isLoggedIn/)
    assert.match(source, /userSessionGeneration\.value/)
    assert.match(source, /watch\(owner,[\s\S]*moderator\.reset\(\)/)
    assert.match(source, /flush:\s*'sync'/)
    assert.match(source, /onBeforeUnmount\([\s\S]*moderator\.dispose\(\)/)
    assert.match(source, /:disabled="locked" maxlength="300"/)
    assert.match(source, /:disabled="locked\|\|needsReload"/)
  },
)
