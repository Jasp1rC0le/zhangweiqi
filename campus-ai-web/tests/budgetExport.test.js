import test from 'node:test'
import assert from 'node:assert/strict'
import { dailyCostsCsv } from '../src/utils/budgetExport.js'
const row = { date: '2026-10-04', provider: 'deepseek', model: 'flash', attempts: 2, unresolved: 1, inputTokens: 80, outputTokens: 20, estimatedCny: '0.000320', occupiedCny: '0.016000' }
test('export retains estimate precision and unknown counts, without personal data', () => {
  const csv = dailyCostsCsv([{ ...row, userId: 99, prompt: 'private', password: 'secret' }])
  assert.ok(csv.includes('"0.000320"')); assert.ok(!csv.includes('private')); assert.ok(!csv.includes('secret'))
})
test('protects spreadsheet formula cells and rejects incomplete accounting', () => {
  assert.ok(dailyCostsCsv([{ ...row, model: '=1+1' }]).includes('"\'=1+1"'))
  assert.throws(() => dailyCostsCsv([{ ...row, estimatedCny: null }]))
  assert.throws(() => dailyCostsCsv([{ ...row, unresolved: 3 }]))
})
