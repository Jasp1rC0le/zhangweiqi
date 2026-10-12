import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import {
  createAdminCatalogScope,
  createAdminCatalogState,
  validCatalogList,
  sameCatalogEntry,
} from '../src/utils/adminCatalogScope.js'

const timed = (name, fn) => test(name, { timeout: 1000 }, fn)
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const row = { id: 1, name: '本校食堂', status: 'DRAFT' }
const data = (name = row.name) => ({ items: [{ ...row, name }] })
function fixture(extra = {}) {
  let owner = '1:school-a:epoch-1',
    draft = '原填写',
    resets = 0
  const state = createAdminCatalogState(['items'])
  const panel = createAdminCatalogScope({
    owner: () => owner,
    state,
    collections: ['items'],
    read: extra.read || (async () => data()),
    validate: (value) =>
      value && validCatalogList(value.items, (item) => typeof item.name === 'string'),
    onReset: () => {
      draft = ''
      resets++
    },
  })
  return {
    panel,
    state,
    owner: (value) => {
      owner = value
    },
    draft: () => draft,
    resets: () => resets,
  }
}

timed('missing administrator never reads or writes catalog data', async () => {
  const f = fixture({ read: () => assert.fail('read') })
  f.owner('')
  assert.equal(await f.panel.load(), false)
  assert.equal(await f.panel.run({ execute: () => assert.fail('write') }), false)
})
timed('atomic catalog reads carry cancellable transport and complete normally', async () => {
  let signal
  const f = fixture({
    read: async (options) => {
      signal = options.signal
      return data()
    },
  })
  assert.equal(await f.panel.load(), true)
  assert.ok(signal instanceof AbortSignal)
  assert.equal(f.state.items[0].name, row.name)
  assert.equal(f.state.loading, false)
})
timed('newer refresh cancels old request and late completion cannot unlock it', async () => {
  const first = deferred(),
    second = deferred()
  let count = 0,
    firstSignal
  const f = fixture({
    read: (options) => {
      count++
      if (count === 1) firstSignal = options.signal
      return count === 1 ? first.promise : second.promise
    },
  })
  const a = f.panel.load(),
    b = f.panel.load()
  assert.equal(firstSignal.aborted, true)
  first.resolve(data('旧'))
  assert.equal(await a, false)
  assert.equal(f.state.loading, true)
  second.resolve(data('新'))
  assert.equal(await b, true)
  assert.equal(f.state.items[0].name, '新')
})
timed(
  'malformed duplicate and oversized collections preserve forms and last good list',
  async () => {
    for (const value of [
      null,
      { items: {} },
      { items: [row, row] },
      { items: Array(2001).fill(row) },
      { items: [{ id: -1, name: '坏' }] },
    ]) {
      const f = fixture({ read: async () => value })
      f.state.items = [{ ...row }]
      assert.equal(await f.panel.load(), false)
      assert.deepEqual(f.state.items, [row])
      assert.equal(f.draft(), '原填写')
      assert.equal(f.state.needsReload, true)
      assert.equal(f.state.loading, false)
    }
  },
)
timed(
  'identity school login epoch and same-account reset discard old reads and errors',
  async () => {
    for (const owner of [
      '2:school-a:epoch-1',
      '1:school-b:epoch-1',
      '1:school-a:epoch-2',
      '1:school-a:epoch-1',
    ]) {
      const d = deferred()
      let signal
      const f = fixture({
        read: (options) => {
          signal = options.signal
          return d.promise
        },
      })
      const waiting = f.panel.load()
      f.owner(owner)
      f.panel.reset()
      assert.equal(signal.aborted, true)
      assert.equal(f.draft(), '')
      assert.equal(f.resets(), 1)
      d.reject(new Error('旧学校'))
      assert.equal(await waiting, false)
      assert.equal(f.state.error, '')
      assert.deepEqual(f.state.items, [])
    }
  },
)
timed('unmount aborts requests clears data and never permits new work', async () => {
  const d = deferred()
  let signal
  const f = fixture({
    read: (options) => {
      signal = options.signal
      return d.promise
    },
  })
  const waiting = f.panel.load()
  f.panel.dispose()
  assert.equal(signal.aborted, true)
  d.resolve(data())
  assert.equal(await waiting, false)
  assert.deepEqual(f.state.items, [])
  assert.equal(await f.panel.run({ execute: () => assert.fail() }), false)
})
timed(
  'confirmation locks all operations immediately and duplicate click asks only once',
  async () => {
    const d = deferred()
    let asks = 0,
      writes = 0
    const f = fixture()
    const a = f.panel.run({
      confirm: () => {
        asks++
        return d.promise
      },
      execute: async () => {
        writes++
      },
    })
    // The scoped dialog owns the confirmation lock; busy begins only at write
    // dispatch so cancellation can restore focus after the dialog releases it.
    assert.equal(f.state.busy, false)
    assert.equal(await f.panel.run({ execute: () => assert.fail('duplicate') }), false)
    assert.equal(await f.panel.load(), false)
    d.resolve(true)
    assert.equal(await a, true)
    assert.equal(asks, 1)
    assert.equal(writes, 1)
    assert.equal(f.state.busy, false)
  },
)
timed('cancelled confirmation keeps form and list and does not write', async () => {
  const f = fixture()
  f.state.items = [row]
  assert.equal(
    await f.panel.run({ confirm: async () => false, execute: () => assert.fail() }),
    false,
  )
  assert.equal(f.draft(), '原填写')
  assert.deepEqual(f.state.items, [row])
  assert.equal(f.state.busy, false)
})
timed('identity changes during confirmation cannot dispatch an old operation', async () => {
  const d = deferred(),
    f = fixture()
  const waiting = f.panel.run({ confirm: () => d.promise, execute: () => assert.fail('old write') })
  f.owner('2:school-b:epoch-2')
  f.panel.reset()
  f.state.busy = true
  d.resolve(true)
  assert.equal(await waiting, false)
  assert.equal(f.state.busy, true)
})
timed('target is checked after confirmation before request dispatch', async () => {
  const d = deferred(),
    f = fixture()
  f.state.items = [row]
  const snapshot = { ...row }
  const waiting = f.panel.run({
    confirm: () => d.promise,
    targetCurrent: () => sameCatalogEntry(f.state.items, snapshot),
    execute: () => assert.fail(),
  })
  f.state.items = [{ ...row, status: 'PUBLISHED' }]
  d.resolve(true)
  assert.equal(await waiting, false)
  assert.match(f.state.error, /变化/)
  assert.equal(f.state.busy, false)
})
timed('acknowledged write followed by read failure is not a failed write', async () => {
  const f = fixture({
    read: async () => {
      throw new Error('read failed')
    },
  })
  let commits = 0
  assert.equal(
    await f.panel.run({
      execute: async () => 'ack',
      committed: () => {
        commits++
      },
      success: '草稿已保存',
    }),
    true,
  )
  assert.equal(commits, 1)
  assert.equal(f.state.success, '草稿已保存')
  assert.match(f.state.error, /已提交.*刷新失败/)
  assert.equal(f.state.needsReload, true)
  assert.equal(await f.panel.run({ execute: () => assert.fail('repeat') }), false)
})
timed('UI update error after acknowledgement is separate from submission failure', async () => {
  const f = fixture()
  assert.equal(
    await f.panel.run({
      execute: async () => {},
      committed: () => {
        throw new Error('preview failed')
      },
    }),
    true,
  )
  assert.match(f.state.error, /已提交.*页面更新失败/)
  assert.equal(f.state.needsReload, true)
})
timed(
  'uncertain failed submission retains draft and blocks repeats until a good refresh',
  async () => {
    const f = fixture()
    assert.equal(
      await f.panel.run({
        execute: async () => {
          throw new Error('timeout')
        },
      }),
      false,
    )
    assert.equal(f.draft(), '原填写')
    assert.equal(f.state.needsReload, true)
    assert.match(f.state.error, /先刷新/)
    assert.equal(await f.panel.run({ execute: () => assert.fail() }), false)
    assert.equal(await f.panel.load(), true)
    assert.equal(f.state.needsReload, false)
  },
)
timed(
  'identity change aborts a write and its late success cannot refresh or clear new state',
  async () => {
    const d = deferred(),
      f = fixture()
    let signal
    const waiting = f.panel.run({
      execute: (s) => {
        signal = s
        return d.promise
      },
      committed: () => assert.fail('old commit'),
    })
    await Promise.resolve()
    await Promise.resolve()
    f.owner('2:school-b:epoch-2')
    f.panel.reset()
    f.state.busy = true
    assert.equal(signal.aborted, true)
    d.resolve('ack')
    assert.equal(await waiting, false)
    assert.equal(f.state.busy, true)
    assert.equal(f.state.success, '')
  },
)
timed('late post-write refresh failure cannot annotate a later administrator', async () => {
  const d = deferred(),
    f = fixture({ read: () => d.promise })
  const waiting = f.panel.run({ execute: async () => {} })
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  f.owner('2:school-b:epoch-2')
  f.panel.reset()
  f.state.loading = true
  d.reject(new Error('old refresh'))
  await waiting
  assert.equal(f.state.error, '')
  assert.equal(f.state.loading, true)
  assert.equal(f.state.busy, false)
})
timed('catalog list validation rejects unsafe IDs while preserving valid empty states', () => {
  assert.equal(
    validCatalogList([], () => true),
    true,
  )
  for (const id of [0, -1, '1', NaN, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(
      validCatalogList([{ id }], () => true),
      false,
    )
  assert.equal(sameCatalogEntry([{ ...row }], { ...row }), true)
  assert.equal(sameCatalogEntry([{ ...row, name: '变化' }], row), false)
})
timed(
  'all twenty catalog API methods forward caller cancellation without altering payload',
  async () => {
    let source = await readFile(new URL('../src/api/admin.js', import.meta.url), 'utf8')
    source = source
      .replace(/^import[^\n]*\n/gm, '')
      .replaceAll('export async function', 'async function')
    const calls = [],
      signal = new AbortController().signal
    const http = Object.fromEntries(
      ['get', 'put', 'post'].map((method) => [
        method,
        async (...args) => {
          calls.push({ method, args })
          return { data: [] }
        },
      ]),
    )
    const names = [
      'getAdminCanteens',
      'getAdminCanteenMerchants',
      'saveAdminCanteen',
      'saveAdminCanteenMerchant',
      'setAdminCanteenPublished',
      'setAdminMerchantPublished',
      'setAdminMerchantOperatingStatus',
      'uploadAdminMerchantPhoto',
      'getAdminMerchantReviews',
      'setAdminMerchantReviewStatus',
      'getCareerEmployers',
      'getEmployerCandidates',
      'discoverEmployerCandidates',
      'importEmployerCandidate',
      'rejectEmployerCandidate',
      'saveCareerEmployer',
      'setCareerEmployerPublished',
      'getCareerJobs',
      'saveCareerJob',
      'setCareerJobPublished',
    ]
    const scope = {
      http,
      FormData: class {
        append() {}
      },
    }
    const api = vm.runInNewContext(`${source}\n;({${names.join(',')}})`, scope, { timeout: 100 })
    const payload = { name: '固定资料' },
      options = { signal }
    for (const name of [
      'getAdminCanteens',
      'getAdminCanteenMerchants',
      'getAdminMerchantReviews',
      'getCareerEmployers',
      'getCareerJobs',
    ])
      await api[name](options)
    await api.getEmployerCandidates('PENDING', options)
    for (const name of [
      'saveAdminCanteen',
      'saveAdminCanteenMerchant',
      'saveCareerEmployer',
      'saveCareerJob',
    ]) {
      await api[name](payload, null, options)
      await api[name](payload, 1, options)
    }
    for (const name of [
      'setAdminCanteenPublished',
      'setAdminMerchantPublished',
      'setCareerEmployerPublished',
      'setCareerJobPublished',
    ])
      await api[name](1, true, options)
    await api.setAdminMerchantOperatingStatus(1, 'OPEN', options)
    await api.uploadAdminMerchantPhoto(1, {}, options)
    await api.setAdminMerchantReviewStatus(1, 'PUBLISHED', '固定短评', options)
    await api.discoverEmployerCandidates('软件', options)
    await api.importEmployerCandidate(1, payload, options)
    await api.rejectEmployerCandidate(1, options)
    assert.equal(calls.length, 24)
    for (const call of calls) assert.equal(call.args.at(-1).signal, signal)
    assert.equal(
      calls.find((call) => call.args[0].endsWith('/reviews/1/status')).args[1].expectedComment,
      '固定短评',
    )
  },
)

timed(
  'both panels synchronously watch identity lock forms and use scoped confirmation',
  async () => {
    for (const name of ['AdminCanteenPanel', 'AdminCareerPanel']) {
      const source = await readFile(new URL(`../src/views/${name}.vue`, import.meta.url), 'utf8')
      assert.match(source, /watch\(owner,[^\n]*flush: 'sync'/)
      assert.match(source, /userSessionGeneration\.value/)
      assert.match(source, /onBeforeUnmount\(\(\) => catalog\.dispose\(\)\)/)
      assert.match(source, /useScopedConfirmation/)
      assert.doesNotMatch(source, /ElMessageBox/)
      for (const field of source.matchAll(
        /v-model="(?:canteenForm|merchantForm|employer|job|candidateKeyword)[^"]*"[^>]*>/g,
      ))
        assert.match(field[0], /:disabled="locked"/)
      assert.match(source, /generation ===/)
    }
  },
)

// Execute the actual panel script, not a second implementation of its methods.
// Vue reactivity is a small synchronous fixture; transport remains controlled.
async function panelFixture(name, overrides = {}) {
  const watchers = [],
    mounts = [],
    unmounts = [],
    calls = [],
    urls = []
  function notify() {
    for (const watcher of watchers) {
      const value = JSON.stringify(watcher.get())
      if (value !== watcher.previous) {
        watcher.previous = value
        watcher.run()
      }
    }
  }
  const reactive = (value) =>
    new Proxy(value, {
      set(target, key, next) {
        target[key] = next
        notify()
        return true
      },
    })
  const ref = (initial) => {
    let value = initial
    return {
      get value() {
        return value
      },
      set value(next) {
        value = next
        notify()
      },
    }
  }
  const watch = (source, run) => {
    const get = typeof source === 'function' ? source : () => source.value
    watchers.push({ get, run, previous: JSON.stringify(get()) })
  }
  const toRefs = (value) =>
    Object.fromEntries(
      Object.keys(value).map((key) => [
        key,
        {
          get value() {
            return value[key]
          },
          set value(next) {
            value[key] = next
          },
        },
      ]),
    )
  const canteen = { id: 1, name: '测试食堂', status: 'PUBLISHED' }
  const merchant = {
    id: 2,
    canteenId: 1,
    name: '测试商家',
    status: 'DRAFT',
    operatingStatus: 'UNKNOWN',
  }
  const review = {
    id: 3,
    merchantId: 2,
    merchantName: '测试商家',
    score: 5,
    comment: '原短评',
    status: 'PENDING',
  }
  const employer = { id: 1, name: '测试企业', status: 'PUBLISHED' }
  const job = { id: 2, employerId: 1, title: '测试岗位', status: 'DRAFT' }
  const candidate = {
    id: 3,
    candidateName: '测试线索',
    sourceUrl: 'https://example.edu.cn/',
    status: 'PENDING',
  }
  const responses = {
    getAdminCanteens: [canteen],
    getAdminCanteenMerchants: [merchant],
    getAdminMerchantReviews: [review],
    getCareerEmployers: [employer],
    getCareerJobs: [job],
    getEmployerCandidates: [candidate],
  }
  const api = new Proxy(
    {},
    {
      get:
        (_, method) =>
        (...args) => {
          calls.push({ method, args })
          return overrides[method]
            ? overrides[method](...args)
            : Promise.resolve(responses[method] || {})
        },
    },
  )
  let code = await readFile(new URL(`../src/views/${name}.vue`, import.meta.url), 'utf8')
  code = code
    .split('</script>')[0]
    .replace('<script setup>', '')
    .replace(/^import[^\n]*\n/gm, '')
  const canteenNames =
    'catalog, state, canteenId, merchantId, canteenForm, merchantForm, photoPreviews, submitCanteen, submitMerchant, uploadPhoto, moderate'
  const careerNames =
    'catalog, state, employerId, candidateId, jobId, employer, job, candidateKeyword, prepareCandidate, editEmployer, submitEmployer, submitJob, discoverCandidates'
  const scope = {
    api,
    reactive,
    ref,
    toRefs,
    watch,
    computed: (get) => ({
      get value() {
        return get()
      },
    }),
    nextTick: (fn) => Promise.resolve().then(fn),
    onMounted: (fn) => mounts.push(fn),
    onBeforeUnmount: (fn) => unmounts.push(fn),
    useAdminAuthStore: () => ({ isLoggedIn: true, user: { id: 1, schoolId: 1 } }),
    userSessionGeneration: ref(1),
    createAdminCatalogScope,
    createAdminCatalogState,
    catalogId: (id) => Number.isSafeInteger(id) && id > 0,
    sameCatalogEntry,
    validCatalogList,
    useScopedConfirmation: () => ({
      confirming: ref(false),
      confirm: overrides.confirm || (async () => true),
    }),
    safeExternalUrl: (value) => value,
    URL: {
      createObjectURL: () => {
        urls.push('create')
        return 'blob:synthetic'
      },
      revokeObjectURL: (url) => urls.push(url),
    },
    window: { matchMedia: () => ({ matches: true }) },
  }
  const result = vm.runInNewContext(
    `${code}\n;({${name === 'AdminCanteenPanel' ? canteenNames : careerNames}})`,
    scope,
    { timeout: 100 },
  )
  for (const mount of mounts) await mount()
  return {
    ...result,
    calls,
    urls,
    unmount: () => unmounts.forEach((fn) => fn()),
    candidate,
    employer,
  }
}
timed('actual canteen save freezes ID and payload and never clears later form edits', async () => {
  const d = deferred(),
    p = await panelFixture('AdminCanteenPanel', { saveAdminCanteen: () => d.promise })
  p.canteenId.value = 1
  p.canteenForm.name = '原食堂'
  const saving = p.submitCanteen()
  await Promise.resolve()
  await Promise.resolve()
  p.canteenId.value = 9
  p.canteenForm.name = '后填食堂'
  d.resolve({})
  await saving
  const call = p.calls.find((c) => c.method === 'saveAdminCanteen')
  assert.equal(call.args[0].name, '原食堂')
  assert.equal(call.args[1], 1)
  assert.equal(p.canteenForm.name, '后填食堂')
  assert.equal(p.canteenId.value, 9)
})
timed('actual merchant save retains later parent selection and description', async () => {
  const d = deferred(),
    p = await panelFixture('AdminCanteenPanel', { saveAdminCanteenMerchant: () => d.promise })
  Object.assign(p.merchantForm, { canteenId: 1, name: '原商家', description: '原说明' })
  const saving = p.submitMerchant()
  await Promise.resolve()
  await Promise.resolve()
  p.merchantForm.name = '后填商家'
  p.merchantForm.description = '后说明'
  d.resolve({})
  await saving
  const call = p.calls.find((c) => c.method === 'saveAdminCanteenMerchant')
  assert.equal(call.args[0].canteenId, 1)
  assert.equal(call.args[0].description, '原说明')
  assert.equal(p.merchantForm.name, '后填商家')
  assert.equal(p.merchantForm.description, '后说明')
})
timed('actual photo upload aborts on unmount and cannot create an old preview', async () => {
  const d = deferred(),
    p = await panelFixture('AdminCanteenPanel', { uploadAdminMerchantPhoto: () => d.promise })
  p.photoPreviews[99] = 'blob:old'
  const target = { files: [{ type: 'image/png', size: 20 }], value: 'chosen' }
  const saving = p.uploadPhoto(p.state.merchants[0], { target })
  await Promise.resolve()
  await Promise.resolve()
  const signal = p.calls.find((c) => c.method === 'uploadAdminMerchantPhoto').args[2].signal
  p.unmount()
  assert.equal(signal.aborted, true)
  assert.equal(target.value, '')
  d.resolve({})
  await saving
  assert.deepEqual(p.urls, ['blob:old'])
  assert.equal(Object.keys(p.photoPreviews).length, 0)
})
timed(
  'actual review rechecks the comment after confirmation and does not publish changed text',
  async () => {
    const d = deferred(),
      p = await panelFixture('AdminCanteenPanel', { confirm: () => d.promise })
    const reviewing = p.moderate(p.state.reviews[0], 'PUBLISHED')
    p.state.reviews = [{ ...p.state.reviews[0], comment: '修改后短评' }]
    d.resolve(true)
    assert.equal(await reviewing, false)
    assert.equal(p.calls.filter((c) => c.method === 'setAdminMerchantReviewStatus').length, 0)
  },
)
timed(
  'actual edit-employer clears a previous candidate ID and saves via the correct endpoint',
  async () => {
    const p = await panelFixture('AdminCareerPanel')
    p.prepareCandidate(p.candidate)
    assert.equal(p.candidateId.value, 3)
    p.editEmployer(p.employer)
    assert.equal(p.candidateId.value, null)
    assert.equal(await p.submitEmployer(), true)
    assert.equal(p.calls.filter((c) => c.method === 'importEmployerCandidate').length, 0)
    const call = p.calls.find((c) => c.method === 'saveCareerEmployer')
    assert.equal(call.args[1], 1)
    assert.equal(call.args[0].name, '测试企业')
  },
)
timed('actual job save freezes inputs and does not erase a later draft', async () => {
  const d = deferred(),
    p = await panelFixture('AdminCareerPanel', { saveCareerJob: () => d.promise })
  Object.assign(p.job, { employerId: 1, title: '原岗位', description: '原说明' })
  const saving = p.submitJob()
  await Promise.resolve()
  await Promise.resolve()
  p.job.title = '后岗位'
  p.job.description = '后说明'
  d.resolve({})
  await saving
  const call = p.calls.find((c) => c.method === 'saveCareerJob')
  assert.equal(call.args[0].title, '原岗位')
  assert.equal(call.args[0].description, '原说明')
  assert.equal(p.job.title, '后岗位')
  assert.equal(p.job.description, '后说明')
})
timed(
  'actual discovery direction changed and restored cannot revive its old confirmation',
  async () => {
    const d = deferred(),
      p = await panelFixture('AdminCareerPanel', { confirm: () => d.promise })
    p.candidateKeyword.value = '软件'
    const searching = p.discoverCandidates()
    p.candidateKeyword.value = '制造'
    p.candidateKeyword.value = '软件'
    d.resolve(true)
    assert.equal(await searching, false)
    assert.equal(p.calls.filter((c) => c.method === 'discoverEmployerCandidates').length, 0)
  },
)
