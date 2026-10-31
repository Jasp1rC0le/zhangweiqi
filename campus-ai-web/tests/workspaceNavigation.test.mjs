import test from 'node:test'
import assert from 'node:assert/strict'
import { primaryNavigation, workspaceTools, workspaceToolsPlacement } from '../src/utils/workspaceNavigation.js'
import { isAdministrator } from '../src/utils/adminAccess.js'

test('daily sidebar contains exactly the four approved destinations in order', () => {
  assert.deepEqual(
    primaryNavigation.map((item) => item.label),
    ['校园助手', '校园墙', '课表', '评分'],
  )
  assert.deepEqual(
    primaryNavigation.map((item) => item.path),
    ['/chat', '/wall', '/timetable', '/canteens'],
  )
})
test('secondary workspaces remain discoverable without duplicate navigation', () => {
  assert.deepEqual(
    workspaceTools.map((item) => item.name),
    ['school-invoice', 'teaching', 'study', 'projects', 'instruments', 'reviews', 'account'],
  )
  const all = [...primaryNavigation, ...workspaceTools]
  assert.equal(new Set(all.map((item) => item.path)).size, 11)
  assert.ok(all.every((item) => item.label && item.icon && item.path.startsWith('/')))
  assert.ok(Object.isFrozen(primaryNavigation) && Object.isFrozen(workspaceTools))
})
test('navigation cleanup grants no administrator access to ordinary accounts', () => {
  for (const role of ['STUDENT', 'TEACHER', '', null, undefined])
    assert.equal(isAdministrator({ role }), false)
  assert.equal(isAdministrator({ role: 'ADMIN' }), true)
  assert.ok([...primaryNavigation, ...workspaceTools].every((item) => item.name !== 'admin'))
})

test('tools stay inside narrow and wide viewports even when the trigger is inset', () => {
  for (const width of [320, 360, 390, 768, 1440]) {
    for (const anchorRight of [width - 14, width - 60, 80]) {
      const style = workspaceToolsPlacement(width, 720, anchorRight, 56)
      const right = parseFloat(style.right)
      const left = width - right - Math.min(300, width - 24)
      assert.ok(left >= 12 && right >= 12, `${width}px viewport must retain both gutters`)
      assert.equal(style.top, '64px')
      assert.equal(style.maxHeight, '640px')
    }
  }
  assert.equal(workspaceToolsPlacement(320, 100, 300, 90).maxHeight, '0px')
})
