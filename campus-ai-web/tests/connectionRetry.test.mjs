import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createMemoryHistory, createRouter, isNavigationFailure} from 'vue-router'
import {workspaceRetryTarget} from '../src/utils/connectionRetry.js'

const source = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
const start = source.indexOf('children: [')
assert.ok(start > 0)
const childBlock = source.slice(start, source.indexOf('],', start))
const paths = [...childBlock.matchAll(/path:\s*'([^']*)'/g)].map(match => match[1])
const routerForTest = () => createRouter({history: createMemoryHistory(), routes: [
  {path: '/chat', name: 'workspace', meta: {requiresAuth: true}, component: {},
    children: paths.map((path, index) => ({path, name: `test-child-${index}`, component: {}}))},
  {path: '/connection-error', component: {}},
  {path: '/login', component: {}},
  {path: '/privacy', component: {}},
]})

test('retry recognizes every current production workspace destination', () => {
  const router = routerForTest()
  assert.ok(paths.includes('/timetable') && paths.includes('/teaching'))
  for (const path of paths) {
    const requested = (path || '/chat').replace(/:id\??/g, 'synthetic-id')
    assert.equal(workspaceRetryTarget(requested, value => router.resolve(value)), requested)
  }
  assert.equal(workspaceRetryTarget('/projects', value => router.resolve(value)), '/projects')
})

test('timetable and teaching retry keep query/hash and still execute denying guards', async () => {
  const router = routerForTest()
  const attempted = []
  router.beforeEach(to => {
    if (to.meta.requiresAuth) { attempted.push(to.fullPath); return false }
  })
  await router.push('/connection-error')
  for (const requested of ['/timetable?date=2026-10-21&queryView=STUDENT#today', '/teaching?view=TEACHER#lesson']) {
    const target = workspaceRetryTarget(requested, value => router.resolve(value))
    assert.equal(target, requested)
    assert.ok(isNavigationFailure(await router.replace(target)))
    assert.equal(router.currentRoute.value.fullPath, '/connection-error')
  }
  assert.deepEqual(attempted, ['/timetable?date=2026-10-21&queryView=STUDENT#today', '/teaching?view=TEACHER#lesson'])
})

test('retry rejects external, malformed, public and unknown destinations', () => {
  const router = routerForTest()
  for (const value of [undefined, null, {}, ['/timetable'], '', 'https://example.invalid', '//example.invalid',
    '/\\example.invalid', 'javascript:alert(1)', '/timetable\n', '/teaching\u007f', '/'+ 'x'.repeat(4096),
    '/login', '/privacy', '/connection-error', '/timetable-extra', '/chat/missing']) {
    assert.equal(workspaceRetryTarget(value, path => router.resolve(path)), '/chat')
  }
  assert.equal(workspaceRetryTarget('/timetable', () => { throw new Error('resolver failure') }), '/chat')
})

test('account recovery owns one inline error state, not a stale global toast', () => {
  const view = readFileSync(new URL('../src/views/AccountActionView.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(view, /ElMessage|closeAll/)
  assert.match(view, /<p v-if="errorText" class="error" role="alert">/)
  assert.match(view, /async function submit\(\)\s*\{\s*errorText\.value = ''/)
  assert.match(view, /<template v-else-if="!done">/)
})
