import test from 'node:test'
import assert from 'node:assert/strict'
import { quotaPresentation } from '../src/utils/quotaPresentation.js'

test('administrator entitlement renders unlimited instead of null or a fake large limit', () => {
  const presentation = quotaPresentation({ unit: 'tokens', unlimited: true, limit: null, remaining: null, used: 63000 })
  assert.equal(presentation.label, '管理员测试不限额')
  assert.match(presentation.hint, /63,000/)
  assert.match(presentation.hint, /全站费用保护/)
})
test('ordinary and legacy token allowances stay numeric', () => {
  assert.equal(quotaPresentation({ unit: 'tokens', unlimited: false, remaining: 42000, limit: 60000 }).label, '今日剩余 42,000 / 60,000 Token')
  assert.equal(quotaPresentation({ unit: 'tokens', remaining: 0, limit: 60000 }).label, '今日剩余 0 / 60,000 Token')
})
test('role names, truthy strings and incomplete data do not claim unlimited', () => {
  assert.equal(quotaPresentation({ unit: 'tokens', role: 'ADMIN', unlimited: 'true' }).label, '额度暂不可用')
  assert.equal(quotaPresentation({ unit: 'tokens', limit: null, remaining: null }).label, '额度暂不可用')
  assert.equal(quotaPresentation({ unit: 'requests', unlimited: true }).label, '额度系统待更新')
  assert.equal(quotaPresentation(null), null)
})
