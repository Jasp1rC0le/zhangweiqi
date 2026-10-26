import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { createCatalogDraftTransition } from '../src/utils/catalogDraftTransition.js'
import { createLeaveGuard } from '../src/utils/leaveGuard.js'
import { createScopedConfirmation } from '../src/utils/scopedConfirmation.js'

const timed = (name, run) => test(name, { timeout: 1000 }, run)
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture(ask = async () => true) {
  let key = 'user1:school1:login1:draft0',
    busy = false,
    dirty = true,
    targetCurrent = true,
    applied = 0,
    asks = 0
  const guard = createCatalogDraftTransition(
    () => key,
    () => busy,
    async (...args) => {
      asks++
      return ask(...args)
    },
  )
  return {
    guard,
    run: () =>
      guard.replace({
        dirty: () => dirty,
        current: () => targetCurrent,
        apply: () => {
          applied++
        },
        message: '放弃这份填写？',
      }),
    key: (value) => {
      key = value
    },
    busy: (value) => {
      busy = value
    },
    dirty: (value) => {
      dirty = value
    },
    current: (value) => {
      targetCurrent = value
    },
    applied: () => applied,
    asks: () => asks,
  }
}
timed('clean editor replacement runs immediately and never asks', async () => {
  const f = fixture()
  f.dirty(false)
  const replacing = f.run()
  assert.equal(f.applied(), 1)
  assert.equal(await replacing, true)
  assert.equal(f.asks(), 0)
})
timed('missing identity and active operation cannot replace even a clean editor', async () => {
  const f = fixture()
  f.dirty(false)
  f.key(null)
  assert.equal(await f.run(), false)
  f.key('user1')
  f.busy(true)
  assert.equal(await f.run(), false)
  assert.equal(f.applied(), 0)
  assert.equal(f.asks(), 0)
})
timed('only explicit true allows a dirty form replacement', async () => {
  for (const answer of [false, undefined, null, 'confirm', true]) {
    const f = fixture(async () => answer)
    assert.equal(await f.run(), answer === true)
    assert.equal(f.applied(), answer === true ? 1 : 0)
  }
})
timed('Escape close and failed confirmation retain content and allow a fresh attempt', async () => {
  let attempts = 0
  const f = fixture(async () => {
    if (++attempts === 1) throw new Error('dismissed')
    return true
  })
  assert.equal(await f.run(), false)
  assert.equal(f.applied(), 0)
  assert.equal(await f.run(), true)
  assert.equal(f.applied(), 1)
})
timed('repeated editor clicks share no additional decision or mutation', async () => {
  const d = deferred(),
    f = fixture(() => d.promise)
  const first = f.run()
  assert.equal(await f.run(), false)
  assert.equal(f.asks(), 1)
  d.resolve(true)
  assert.equal(await first, true)
  assert.equal(f.applied(), 1)
})
timed(
  'account school login and later draft changes invalidate an accepted old decision',
  async () => {
    for (const key of [
      'user2:school1:login1:draft0',
      'user1:school2:login1:draft0',
      'user1:school1:login2:draft0',
      'user1:school1:login1:draft1',
    ]) {
      const d = deferred(),
        f = fixture(() => d.promise)
      const first = f.run()
      f.key(key)
      d.resolve(true)
      assert.equal(await first, false)
      assert.equal(f.applied(), 0)
    }
  },
)
timed('restored visible text with a newer generation cannot revive an old discard', async () => {
  const d = deferred(),
    f = fixture(() => d.promise)
  const first = f.run()
  f.key('user1:school1:login1:draft1')
  f.key('user1:school1:login1:draft2')
  d.resolve(true)
  assert.equal(await first, false)
  assert.equal(f.applied(), 0)
})
timed('save beginning during a discard decision prevents clearing the form', async () => {
  const d = deferred(),
    f = fixture(() => d.promise)
  const first = f.run()
  f.busy(true)
  d.resolve(true)
  assert.equal(await first, false)
  assert.equal(f.applied(), 0)
})
timed('changed server row after a decision cannot replace the old editor', async () => {
  const d = deferred(),
    f = fixture(() => d.promise)
  const first = f.run()
  f.current(false)
  d.resolve(true)
  assert.equal(await first, false)
  assert.equal(f.applied(), 0)
})
timed('unmounted editor never applies a late confirmation or future replacement', async () => {
  const d = deferred(),
    f = fixture(() => d.promise)
  const first = f.run()
  f.guard.dispose()
  d.resolve(true)
  assert.equal(await first, false)
  assert.equal(await f.run(), false)
  assert.equal(f.applied(), 0)
})
timed('an application error releases the transition lock for a later recovery', async () => {
  const f = fixture()
  await assert.rejects(
    f.guard.replace({
      dirty: () => false,
      apply: () => {
        throw new Error('UI failure')
      },
    }),
    /UI failure/,
  )
  assert.equal(await f.run(), true)
})

async function routeScopeFixture() {
  const source = await readFile(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
  const start = source.indexOf('const routeScope = '),
    end = source.indexOf('\nconst { confirming: leaveConfirming', start)
  assert.ok(start >= 0 && end > start)
  const context = {
    editorOwner: { value: 'user1:school1:login1' },
    editorScope: { key: () => 'import:draft1' },
    batchImport: { value: { draftKey: () => 'batch:draft2' } },
    careerPanel: { value: { draftKey: () => 'career:draft3' } },
    canteenPanel: { value: { draftKey: () => 'canteen:draft4' } },
  }
  const scope = vm.runInNewContext(`${source.slice(start, end)}\nrouteScope`, context, {
    timeout: 100,
  })
  return { scope, context }
}
timed('actual aggregate route scope includes hidden catalogue and batch drafts', async () => {
  const f = await routeScopeFixture()
  assert.deepEqual(JSON.parse(f.scope()), [
    'import:draft1',
    'batch:draft2',
    'career:draft3',
    'canteen:draft4',
  ])
  f.context.editorOwner.value = ''
  assert.equal(f.scope(), null)
})
timed('actual route scope rejects an accepted decision after a hidden form changes', async () => {
  const f = await routeScopeFixture(),
    d = deferred()
  const confirm = createScopedConfirmation({ scope: f.scope, ask: () => d.promise })
  const leaving = confirm('离开？')
  f.context.careerPanel.value.draftKey = () => 'career:draft5'
  d.resolve(true)
  assert.equal(await leaving, false)
})
timed(
  'shared route and refresh guard accept a scoped override without a second default dialog',
  async () => {
    const source = (
      await readFile(new URL('../src/utils/useUnsavedChanges.js', import.meta.url), 'utf8')
    )
      .replace(/^import[^\n]*\n/gm, '')
      .replace('export function', 'function')
    let routeGuard,
      beforeUnload,
      dirty = true,
      busy = false,
      asks = 0
    const hook = vm.runInNewContext(
      `${source}\nuseUnsavedChanges`,
      {
        createLeaveGuard,
        onBeforeRouteLeave: (fn) => {
          routeGuard = fn
        },
        onMounted: (fn) => fn(),
        onBeforeUnmount: () => {},
        ElMessageBox: { confirm: () => assert.fail('unexpected unscoped dialog') },
        window: {
          addEventListener: (_, fn) => {
            beforeUnload = fn
          },
          removeEventListener: () => {},
        },
      },
      { timeout: 100 },
    )
    hook(
      () => dirty,
      () => busy,
      () => false,
      async () => {
        asks++
        return false
      },
    )
    assert.equal(await routeGuard(), false)
    assert.equal(asks, 1)
    let blocked = false
    const event = {
      preventDefault: () => {
        blocked = true
      },
    }
    beforeUnload(event)
    assert.equal(blocked, true)
    assert.equal(event.returnValue, '')
    dirty = false
    assert.equal(await routeGuard(), true)
    busy = true
    assert.equal(await routeGuard(), false)
  },
)
timed(
  'catalogue components stay mounted lazily and every route sees their dirty and busy state',
  async () => {
    const parent = await readFile(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
    assert.match(parent, /<section v-else-if="activeTab === 'feedback'" class="review-list feedback-list">/)
    assert.doesNotMatch(parent, /<section v-else class="review-list feedback-list">/)
    for (const [component, key, ref] of [
      ['AdminCareerPanel', 'career', 'careerPanel'],
      ['AdminCanteenPanel', 'canteens', 'canteenPanel'],
    ]) {
      assert.match(
        parent,
        new RegExp(
          `<${component} v-if="adminAuth\\.user && catalogMounted\\.${key}" v-show="!loading && activeTab === '${key}'" ref="${ref}"`,
        ),
      )
      assert.doesNotMatch(parent, new RegExp(`<${component} v-else-if`))
    }
    assert.match(parent, /Boolean\(batchImport\.value\?\.dirty\) \|\| catalogsDirty\(\)/)
    assert.match(parent, /catalogsBusy\(\) \|\| leaveConfirming\.value/)
    assert.match(parent, /v-for="item in catalogReturns"/)
    const transition = await readFile(
      new URL('../src/utils/catalogDraftTransition.js', import.meta.url),
      'utf8',
    )
    assert.doesNotMatch(transition, /localStorage|sessionStorage|password|cookie|token/i)
  },
)
