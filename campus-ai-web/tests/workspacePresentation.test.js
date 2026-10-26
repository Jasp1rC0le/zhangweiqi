import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse } from '@babel/parser'
import { createMemoryHistory, createRouter, isNavigationFailure, NavigationFailureType } from 'vue-router'

const view = fs.readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')
const calm = fs.readFileSync(new URL('../src/styles/workspace-calm.css', import.meta.url), 'utf8')
const apple = fs.readFileSync(new URL('../src/styles/apple-workspace.css', import.meta.url), 'utf8')
const admin = fs.readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
const script = parseSfc(view).descriptor.scriptSetup.content
const ast = parse(script, { sourceType: 'module' })

function actualFunction(name, context) {
  const node = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(node, `actual component function ${name} exists`)
  return vm.runInNewContext(`${script.slice(node.start, node.end)}\n${name}`, context)
}
function navigationContext(push, currentPath = '/wall') {
  const state = {
    disposed: false,
    router: { push },
    route: { path: currentPath },
    mobileLayout: { value: true },
    mobileSidebarOpen: { value: true },
    closedMenus: 0,
    errors: [],
  }
  state.closeProfileMenu = () => { state.closedMenus++ }
  state.ElMessage = { error: message => state.errors.push(message) }
  state.navigationCompleted = actualFunction('navigationCompleted', { isNavigationFailure, NavigationFailureType })
  state.nextTick = async () => {}
  state.menuTrigger = { value: { focus() {} } }
  state.accountTrigger = { value: { focus() {} } }
  return state
}
async function realRouterFailure(kind, target = '/wall?post=new#new') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/wall', component: {} }, { path: '/timetable', component: {} },
  ] })
  await router.push('/wall?post=old#old')
  if (kind === 'duplicate') return router.push(router.currentRoute.value.fullPath)
  if (kind === 'aborted') {
    router.beforeEach(() => false)
    return router.push(target)
  }
  let release, entered
  const enteredGuard = new Promise(resolve => { entered = resolve })
  const pendingGuard = new Promise(resolve => { release = resolve })
  router.beforeEach(to => {
    if (to.fullPath === target) { entered(); return pendingGuard }
    return true
  })
  const pending = router.push(target)
  await enteredGuard
  await router.push('/wall?post=latest#latest')
  release(true)
  return pending
}

test('actual primary navigation closes the drawer after successful navigation', async () => {
  const state = navigationContext(async () => undefined)
  await actualFunction('navigatePrimary', state)('/timetable')
  assert.equal(state.mobileSidebarOpen.value, false)
  assert.equal(state.closedMenus, 1)
})
test('actual same-page navigation closes the drawer despite duplicate-navigation result', async () => {
  const failure = await realRouterFailure('duplicate')
  assert.ok(isNavigationFailure(failure, NavigationFailureType.duplicated))
  const state = navigationContext(async () => failure)
  await actualFunction('navigatePrimary', state)('/wall')
  assert.equal(state.mobileSidebarOpen.value, false)
  assert.equal(state.closedMenus, 1)
})
test('actual primary and account handlers retain menus for same-path query/hash abortion and cancellation', async () => {
  for (const kind of ['aborted', 'cancelled']) {
    for (const target of ['/wall?post=new#old', '/wall?post=old#new']) {
      const failure = await realRouterFailure(kind, target)
      assert.ok(isNavigationFailure(failure, NavigationFailureType[kind]))
      for (const handler of ['navigatePrimary', 'navigateAccount']) {
        const state = navigationContext(async () => failure)
        state.route.fullPath = '/wall?post=old#old'
        await actualFunction(handler, state)('/wall')
        assert.equal(state.mobileSidebarOpen.value, true, `${handler} ${kind} ${target}`)
        assert.equal(state.closedMenus, 0)
        assert.equal(state.errors.length, 0)
      }
    }
  }
})
test('actual account navigation closes after success or genuine duplicate, not a forged type field', async () => {
  const duplicate = await realRouterFailure('duplicate')
  for (const failure of [undefined, duplicate]) {
    const state = navigationContext(async () => failure)
    await actualFunction('navigateAccount', state)('/wall')
    assert.equal(state.mobileSidebarOpen.value, false)
    assert.equal(state.closedMenus, 1)
  }
  const state = navigationContext(async () => ({ type: NavigationFailureType.duplicated }))
  await actualFunction('navigateAccount', state)('/wall')
  assert.equal(state.mobileSidebarOpen.value, true)
  assert.equal(state.closedMenus, 0)
})
test('cancelled navigation retains the current page and drawer without a false error', async () => {
  const state = navigationContext(async () => ({ type: 4 }))
  await actualFunction('navigatePrimary', state)('/projects')
  assert.equal(state.mobileSidebarOpen.value, true)
  assert.equal(state.closedMenus, 0)
  assert.equal(state.errors.length, 0)
})
test('navigation error preserves the drawer and reports an explicit retry state', async () => {
  const state = navigationContext(async () => { throw new Error('synthetic') })
  await actualFunction('navigatePrimary', state)('/timetable')
  assert.equal(state.mobileSidebarOpen.value, true)
  assert.equal(state.closedMenus, 0)
  assert.equal(state.errors.length, 1)
})
test('unmounted workspace never navigates and ignores pending success or failure', async () => {
  let calls = 0
  const alreadyDisposed = navigationContext(async () => { calls++ })
  alreadyDisposed.disposed = true
  await actualFunction('navigatePrimary', alreadyDisposed)('/wall')
  assert.equal(calls, 0)
  for (const rejected of [false, true]) {
    let finish
    const state = navigationContext(() => new Promise((resolve, reject) => {
      finish = () => rejected ? reject(new Error('synthetic')) : resolve()
    }))
    const pending = actualFunction('navigatePrimary', state)('/timetable')
    state.disposed = true
    finish()
    await pending
    assert.equal(state.mobileSidebarOpen.value, true)
    assert.equal(state.closedMenus, 0)
    assert.equal(state.errors.length, 0)
  }
})
test('selecting an already-loaded conversation closes its mobile drawer without a reload', async () => {
  const state = {
    pendingChatAction:()=>false,
    disposed: false, isChatRoute: { value: true }, sending: { value: false },
    switchingWorkspace: { value: false }, deletingConversationId: { value: null },
    activeConversationId: { value: 901 }, historyError: { value: '' },
    historyNeedsReload: { value: false }, mobileSidebarOpen: { value: true },
  }
  await actualFunction('selectConversation', state)(901)
  assert.equal(state.mobileSidebarOpen.value, false)
})
test('busy conversation selection retains its existing operation guard', async () => {
  const state = {
    pendingChatAction:()=>false,
    disposed: false, isChatRoute: { value: true }, sending: { value: true },
    switchingWorkspace: { value: false }, deletingConversationId: { value: null },
    mobileSidebarOpen: { value: true },
  }
  await actualFunction('selectConversation', state)(901)
  assert.equal(state.mobileSidebarOpen.value, true)
})
test('an unconfirmed chat operation blocks conversation replacement before reading another history',async()=>{
  const state={pendingChatAction:()=>true,mobileSidebarOpen:{value:true}}
  await actualFunction('selectConversation',state)(901)
  assert.equal(state.mobileSidebarOpen.value,true)
})
test('scroll resets only before the new view enters, never during leave or after user interaction', () => {
  assert.ok(view.includes('@click="navigatePrimary(item.path)"'))
  assert.ok(view.includes('@before-enter="resetWorkspaceScroll"'))
  assert.ok(!view.includes('@after-enter="resetWorkspaceScroll"'))
  const routeWatcher = script.slice(script.indexOf('watch(() => route.name'), script.indexOf('const authStore'))
  assert.ok(!routeWatcher.includes('resetWorkspaceScroll()'))
  assert.ok(calm.includes('--work-enter-duration: 160ms'))
  assert.ok(calm.includes('--work-leave-duration: 60ms'))
})
test('page roots do not repaint a short square canvas and compound fields retain one focus owner', () => {
  assert.match(calm, /:is\(\.table-page, \.account-page, \.project-studio, \.admin-page\)\s*\{\s*background: transparent;/)
  assert.ok(calm.includes('):not(:where(.table-search input))'))
  assert.match(apple, /:is\(\.history-search, \.table-search\) input:focus-visible\s*\{\s*outline: none;/)
  assert.match(apple, /:is\(\.history-search, \.table-search\):focus-within\s*\{\s*outline: 2px solid var\(--assistant-accent\)/)
  assert.ok(apple.includes('outline-offset: -2px'))
})
test('segmented states and project rows have explicit shape owners, not inherited button chrome', () => {
  assert.match(calm, /:is\(\.work-tabs, \.table-filters\)\s*\{\s*border-radius: var\(--assistant-control-radius\)/)
  assert.match(calm, /:is\(\.work-tabs button, \.table-filters button, \.studio-tabs button\)\s*\{[^}]*border-color: transparent;/)
  assert.match(calm, /\.project-studio \.project-template\s*\{\s*border-radius: 0;/)
  assert.ok(!admin.includes('WORK QUEUE') && !admin.includes('MODEL ACTIVITY'))
})
test('narrow layouts retain actions and device selection without squeezing reading columns', () => {
  assert.ok(calm.includes('repeat(auto-fit, minmax(min(100%, 280px), 1fr))'))
  const intermediate = calm.slice(calm.indexOf('@media (max-width: 1100px)'), calm.indexOf('@media (max-width: 760px)'))
  assert.match(intermediate, /\.instrument-layout\s*\{\s*display: block;/)
  assert.ok(intermediate.includes('overflow-x: auto'))
  const mobile = calm.slice(calm.indexOf('@media (max-width: 760px)'), calm.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.ok(mobile.includes('.mobile-project-picker'))
  assert.ok(mobile.includes('grid-template-columns: minmax(0, 1fr) auto'))
  assert.ok(mobile.includes('.archive-filter'))
  assert.ok(mobile.includes('.directory-refresh'))
})
test('mobile history actions have separate non-overlapping 44px targets and preserve confirmation', () => {
  const mobile = apple.slice(apple.indexOf('@media (max-width: 760px)'), apple.indexOf('@media (max-width: 360px)'))
  assert.match(mobile, /\.conversation-row\s*\{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) 44px;/)
  assert.match(mobile, /\.conversation-row \.conversation-delete\s*\{\s*position: static;\s*width: 44px;\s*height: 44px;/)
  assert.match(mobile, /\.conversation-row \.conversation-item\s*\{[^}]*min-height: 44px;/)
  assert.ok(mobile.includes('.conversation-delete:disabled'))
  assert.ok(view.includes('@click="requestDeleteConversation(conversation)"'))
  assert.ok(!mobile.includes('overflow: hidden'))
})
