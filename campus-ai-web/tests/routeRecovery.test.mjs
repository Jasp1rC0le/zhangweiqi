import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {createRouter, createMemoryHistory} from 'vue-router'
import {parse, compileScript, compileTemplate} from '@vue/compiler-sfc'
import {isAssetLoadFailure, safeReloadPath, routeLoadFailure, recordRouteFailure, clearRouteFailure, reloadFailedRoute, wasRouteFailureHandled} from '../src/utils/routeRecovery.js'

const router = createRouter({history: createMemoryHistory(), routes: [
  {path: '/chat', component: {}}, {path: '/study', component: {}}, {path: '/login', component: {}},
  {path: '/:pathMatch(.*)*', name: 'not-found', component: {}},
]})
const resolve = value => router.resolve(value)
test('reload accepts only actual internal routes and preserves task query/hash', () => {
  assert.equal(safeReloadPath('/study?topic=lab#draft', resolve), '/study?topic=lab#draft')
  for (const value of [null, [], '//external.invalid', 'https://external.invalid', '/\\external.invalid', '/study\n', '/missing', '/' + 'x'.repeat(4096)]) assert.equal(safeReloadPath(value, resolve), '/login?reauth=1')
  assert.equal(safeReloadPath('/study', () => {throw new Error('invalid resolver')}), '/login?reauth=1')
})
test('route-load errors have a classified generic state, not raw exception content', () => {
  for (const message of ['Failed to fetch dynamically imported module: /private.js', 'Importing a module script failed.', 'Unable to preload CSS for /private.css']) assert.equal(isAssetLoadFailure(new Error(message)), true)
  assert.equal(isAssetLoadFailure(new Error('401 permission denied')), false)
  const error = new Error('Failed to fetch dynamically imported module: SECRET')
  recordRouteFailure(error, {fullPath: '/study'}, {matched: [{}], name: 'chat'}, resolve)
  assert.deepEqual(routeLoadFailure.value, {kind: 'asset', target: '/study', retainPage: true})
  assert.doesNotMatch(JSON.stringify(routeLoadFailure.value), /SECRET/)
  assert.equal(wasRouteFailureHandled(error), true)
  assert.equal(wasRouteFailureHandled(new Error('unrelated form error')), false)
  clearRouteFailure(); assert.equal(routeLoadFailure.value, null); assert.equal(wasRouteFailureHandled(error), false)
})
test('in-workspace reload requires explicit confirmation; cancellation changes nothing', () => {
  const assigned = [], failure = {target: '/study', retainPage: true}
  const options = {resolve, confirm: () => false, assign: path => assigned.push(path)}
  assert.equal(reloadFailedRoute(failure, options), false); assert.deepEqual(assigned, [])
  assert.equal(reloadFailedRoute(failure, {...options, confirm: () => true}), true); assert.deepEqual(assigned, ['/study'])
  assert.equal(reloadFailedRoute(null, options), false)
})
test('cold-page reload has no existing draft to confirm and unsafe destination stays internal', () => {
  const assigned = []
  assert.equal(reloadFailedRoute({target: '//external.invalid', retainPage: false}, {resolve, confirm: () => {throw new Error('unexpected prompt')}, assign: path => assigned.push(path)}), true)
  assert.deepEqual(assigned, ['/login?reauth=1'])
})
test('bootstrap guard uses text only and is removed after successful mounting', () => {
  const listeners = new Map(), title = {}, message = {}, attributes = {}
  const root = {querySelector: selector => selector.includes('title') ? title : message, setAttribute: (key, value) => {attributes[key] = value}}
  const window = {addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name)}
  vm.runInNewContext(readFileSync(new URL('../public/startup-guard.js', import.meta.url), 'utf8'), {window, document: {getElementById: () => root}})
  listeners.get('error')({type: 'error', target: window, message: 'SECRET TOKEN <script>invalid</script>'})
  assert.equal(title.textContent, '页面暂时没有载入'); assert.equal(attributes.role, 'alert')
  assert.doesNotMatch(message.textContent, /SECRET|TOKEN|script/)
  listeners.get('campthink:mounted')(); assert.equal(listeners.has('error'), false); assert.equal(listeners.has('unhandledrejection'), false)
})
test('recovery components compile and errors never echo target URLs or use generated mock pixels', () => {
  for (const file of ['src/components/PageRecovery.vue', 'src/App.vue']) {
    const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {descriptor, errors} = parse(source, {filename: file})
    assert.deepEqual(errors, [])
    const script = compileScript(descriptor, {id: file})
    assert.deepEqual(compileTemplate({source: descriptor.template.content, filename: file, id: file, compilerOptions: {bindingMetadata: script.bindings}}).errors, [])
  }
  const page = readFileSync(new URL('../src/components/PageRecovery.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /v-html|\.png|route\.fullPath|failure\.target/)
  const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  assert.match(app, /watch\(userSessionGeneration, clearRouteFailure/)
  assert.match(app, /routeLoadFailure\?\.retainPage && !userSessionEnded/)
})
