import test from 'node:test'
import assert from 'node:assert/strict'
import { pickerDateAllowed, pickerInputValue, pickerKeyDate, pickerMonthDays, shiftPickerMonth, validPickerDate } from '../src/utils/datePicker.js'

test('calendar uses six complete Monday-first weeks including leap day', () => {
  const days = pickerMonthDays(2028, 2)
  assert.equal(days.length, 42)
  assert.equal(days[0].value, '2028-01-31')
  assert.equal(days.filter(d => d.value === '2028-02-29').length, 1)
  assert.equal(pickerMonthDays(2026, 13).length, 0)
})
test('date selection respects real dates, inclusive bounds and Monday-only school anchors', () => {
  assert.equal(validPickerDate('2026-02-29'), false)
  assert.equal(validPickerDate('2028-02-29'), true)
  assert.equal(pickerDateAllowed('2026-09-07', { min: '2026-09-07', max: '2026-09-14', mondayOnly: true }), true)
  assert.equal(pickerDateAllowed('2026-09-08', { mondayOnly: true }), false)
  assert.equal(pickerDateAllowed('2026-09-15', { max: '2026-09-14' }), false)
  assert.equal(pickerDateAllowed('2026-09-', {}), false)
})
test('manual date editing keeps dependent form arithmetic safe under the native date value contract', () => {
  for (const value of ['', '2026-', '2026-10-', '2026-02-29', '0000-01-01', '2026/10/26', null]) assert.equal(pickerInputValue(value), '')
  for (const value of ['2026-10-26', '2028-02-29', '2000-01-03']) assert.equal(pickerInputValue(value), value)
})
test('month keyboard jumps clamp month end without rolling into another month', () => {
  assert.equal(shiftPickerMonth('2026-01-31', 1), '2026-02-28')
  assert.equal(shiftPickerMonth('2028-01-31', 1), '2028-02-29')
  assert.equal(shiftPickerMonth('2026-01-01', -1), '2025-12-01')
  assert.equal(pickerKeyDate('2028-02-29', 'PageDown', true), '2029-02-28')
})
test('roving keyboard navigation crosses weeks and months without changing the source date', () => {
  assert.equal(pickerKeyDate('2026-10-31', 'ArrowRight'), '2026-11-01')
  assert.equal(pickerKeyDate('2026-10-28', 'Home'), '2026-10-26')
  assert.equal(pickerKeyDate('2026-10-28', 'End'), '2026-11-01')
  assert.equal(pickerKeyDate('2026-10-28', 'Enter'), '2026-10-28')
})
