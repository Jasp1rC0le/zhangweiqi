import test from 'node:test'
import assert from 'node:assert/strict'
import { isBudgetOverview } from '../src/utils/aiBudget.js'
const item = { attempts: 3, completed: 1, failed: 1, unresolved: 2, inputTokens: 100, outputTokens: 20,
  estimatedCny: 0.001, occupiedCny: 0.02, limitCny: 10 }
const overview = { enabled: true, date: '2026-10-04', currency: 'CNY', timezone: 'Asia/Shanghai', today: item, month: item }
test('budget accepts complete numeric windows including a disabled guard', () => {
  assert.equal(isBudgetOverview(overview), true)
  assert.equal(isBudgetOverview({ ...overview, enabled: false }), true)
})
test('budget rejects missing, malformed, negative and contradictory amounts instead of showing zero', () => {
  for (const value of [null, [], '<html>fallback</html>', {}, { ...overview, today: null },
    { ...overview, today: { ...item, occupiedCny: null } }, { ...overview, today: { ...item, occupiedCny: NaN } },
    { ...overview, today: { ...item, unresolved: 0 } }, { ...overview, today: { ...item, limitCny: 0 } },
    { ...overview, today: { ...item, estimatedCny: -1 } }]) assert.equal(isBudgetOverview(value), false)
})
