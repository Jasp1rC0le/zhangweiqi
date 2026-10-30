import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { parse as parseVue } from '@vue/compiler-sfc'
import { parse as parseJavaScript } from '@babel/parser'
import { createDemoLogout } from '../design/demoLogout.js'

test('demo logout clears only its in-memory identity and navigates once', async () => {
  const paths = []
  const auth = { user: { id: 2, role: 'STUDENT' }, token: 'synthetic-only', clearLocalSession() { assert.fail('must not broadcast a real logout') } }
  const logout = createDemoLogout({ auth, navigate: path => paths.push(path) })
  const [a, b] = await Promise.all([logout(), logout()])
  assert.deepEqual(a, { navigationHandled: true })
  assert.deepEqual(b, a)
  assert.equal(auth.user, null)
  assert.equal(auth.token, '')
  assert.deepEqual(paths, ['/design-review.html?page=exit'])
})

test('demo navigation failure rejects and permits an explicit retry', async () => {
  let attempts = 0
  const auth = { user: { id: 1 }, token: 'synthetic-only' }
  const logout = createDemoLogout({ auth, navigate: () => { if (++attempts === 1) throw new Error('navigation failed') } })
  await assert.rejects(logout(), /navigation failed/)
  assert.equal(auth.user, null)
  assert.equal((await logout()).navigationHandled, true)
  assert.equal(attempts, 2)
})

async function actualDialog(logout) {
  const source = await readFile(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')
  const script = parseVue(source).descriptor.scriptSetup.content
  const fn = parseJavaScript(script, {sourceType:'module'}).program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'confirmLogout')
  assert.ok(fn)
  const paths = [], context = vm.createContext({ logoutBusy: { value: false }, logoutError: { value: 'old' }, authStore: { logout }, window: { location: { replace: path => paths.push(path) } } })
  vm.runInContext(script.slice(fn.start, fn.end) + '\nthis.confirm = confirmLogout', context)
  return { context, paths }
}

test('actual normal logout still redirects to the real login after acknowledgement', async () => {
  let calls = 0
  const { context, paths } = await actualDialog(async () => { calls++ })
  await context.confirm()
  assert.equal(calls, 1)
  assert.deepEqual(paths, ['/login'])
  assert.equal(context.logoutBusy.value, false)
  assert.equal(context.logoutError.value, '')
})

test('actual dialog respects demo-owned navigation instead of opening real auth', async () => {
  const { context, paths } = await actualDialog(async () => ({ navigationHandled: true }))
  await context.confirm()
  assert.deepEqual(paths, [])
  assert.equal(context.logoutError.value, '')
})

test('actual dialog retains a real logout failure and prevents duplicate in-flight requests', async () => {
  let calls = 0, reject
  const { context, paths } = await actualDialog(() => { calls++; return new Promise((_, no) => { reject = no }) })
  const waiting = context.confirm()
  await context.confirm()
  assert.equal(calls, 1)
  reject(new Error('offline'))
  await waiting
  assert.deepEqual(paths, [])
  assert.match(context.logoutError.value, /未能确认退出成功/)
  assert.equal(context.logoutBusy.value, false)
})

test('production auth store clears local session only after the server logout succeeds', async () => {
  const source = await readFile(new URL('../src/stores/auth.js', import.meta.url), 'utf8')
  const start = source.indexOf('  async function logout() {'), end = source.indexOf('\n\n  return {', start)
  assert.ok(start >= 0 && end > start)
  let clearCount = 0, rejectNext = true
  const urls = []
  const context = vm.createContext({ withUserAuthLock: action => action(), http: { post: async url => { urls.push(url); if (rejectNext) throw new Error('offline') } }, clearLocalSession: () => clearCount++ })
  vm.runInContext(source.slice(start, end) + '\nthis.run = logout', context)
  await assert.rejects(context.run(), /offline/)
  assert.equal(clearCount, 0)
  rejectNext = false
  assert.equal(await context.run(), undefined)
  assert.equal(clearCount, 1)
  assert.deepEqual(urls, ['/api/auth/logout', '/api/auth/logout'])
})
