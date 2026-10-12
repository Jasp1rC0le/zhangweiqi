import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcile, parseCsv } from './reconcile-costs.mjs'
const header = 'date,provider,model,attempts,unresolved,estimatedCny,occupiedCny\n'
const app = header + '2026-10-04,deepseek,flash,1,0,0.000320,0.000320\n'
const billHeader = 'date,provider,model,actualCny,currency,timezone\n'
const bill = billHeader + '2026-10-04,deepseek,flash,0.000320,CNY,Asia/Shanghai\n'
test('decimal accounting uses integer micros and matches verified equal inputs', () => {
  assert.equal(reconcile(app, bill).allMatched, true)
  assert.equal(reconcile(app, bill.replace('0.000320', '0.000321')).rows[0].deltaCny, '0.000001')
})
test('unknown requests, missing bills and empty files never claim completion', () => {
  assert.equal(reconcile(app.replace(',1,0,', ',1,1,'), bill).rows[0].status, 'UNRESOLVED_REQUESTS')
  assert.equal(reconcile(app, billHeader).rows[0].actualCny, null)
  assert.equal(reconcile(header, bill).rows[0].status, 'MISSING_LEDGER')
  assert.equal(reconcile(header, billHeader).allMatched, false)
})
test('refuses incompatible timezones/currencies, duplicates and malformed CSV', () => {
  assert.throws(() => reconcile(app, bill.replace('CNY', 'USD')))
  assert.throws(() => reconcile(app, bill.replace('Asia/Shanghai', 'UTC')))
  assert.throws(() => reconcile(app + app.split('\n')[1], bill))
  assert.throws(() => parseCsv('x,y\n"bad'))
  assert.throws(() => parseCsv('x,x\n1,2'))
  assert.throws(() => reconcile(app, bill.replace('0.000320', '')))
  assert.throws(() => reconcile(app.replace('2026-10-04', '2026-02-30'), bill))
})
test('quoted commas and line breaks parse without evaluating any formulas', () => {
  assert.deepEqual(parseCsv('\uFEFFx,y\r\n"a,b","=1+1"\r\n'), [{ x: 'a,b', y: '=1+1' }])
})
