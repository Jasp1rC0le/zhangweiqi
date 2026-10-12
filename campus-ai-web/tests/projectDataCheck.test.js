import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyDataSheet, parseCsv, numericCell, inspectDataSheet, dataCheckMarkdown, validateDataSheet } from '../src/utils/projectDataCheck.js'
import { emptyProject, projectMarkdown } from '../src/utils/projectStudio.js'
const sheet = (csv, extra = {}) => ({ ...emptyDataSheet(), source: '测试数据', csv, ...extra })
const experimental = csv => sheet(csv, { measuredColumn: 1, referenceColumn: 2, unit: 'V', sameUnitConfirmed: true, tolerancePercent: 5 })

test('CSV preserves physical line locations across BOM, CRLF, blanks and quoted multiline fields', () => {
  const result = parseCsv('\uFEFF标签,数值\r\n\r\n"甲,\r\n""乙""",2\r\n丙,3\r\n')
  assert.equal(result.error, '')
  assert.deepEqual(result.rows, [{ cells: ['甲,\n"乙"', '2'], line: 3 }, { cells: ['丙', '3'], line: 5 }])
})
test('malformed quotes and size limits are explicit failures, not partial success', () => {
  for (const csv of ['x\n"unterminated', 'x\n"closed"x', 'x\nnot"quoted', 'x'.repeat(50001), 'a\0b', Array(31).fill('a').join(','), 'x\n' + Array(2001).fill('1').join('\n')]) assert.ok(parseCsv(csv).error, csv.slice(0, 40))
  assert.equal(parseCsv('x\n' + Array(2000).fill('1').join('\n')).rows.length, 2000)
})
test('blank physical lines ignored but explicit empty records retained', () => {
  const parsed = parseCsv('a,b\n\n,\n"",\n')
  assert.equal(parsed.rows.length, 2)
  assert.deepEqual(parsed.rows.map(row => row.line), [3, 4])
})
test('headers, missing cells, row shape and duplicates carry original line numbers', () => {
  const result = inspectDataSheet(sheet('a,a,\n1,,3\n1,,3\n4,5'))
  assert.ok(result.issues.some(i => i.code === 'header-duplicate' && i.line === 1))
  assert.ok(result.issues.some(i => i.code === 'duplicate' && i.line === 3))
  assert.ok(result.issues.some(i => i.code === 'width' && i.line === 4))
  assert.ok(result.issues.some(i => i.code === 'missing' && i.line === 2))
  assert.equal(result.summaries.length, 0)
})
test('numeric grammar does not execute formulas or coerce blanks, units, underflow or infinities', () => {
  for (const value of ['', ' ', '=1+2', '10%', '1,000', '3mm', 'Infinity', 'NaN', '0x10', '1e400', '1e-400', '1000000000001']) assert.equal(numericCell(value), null, value)
  assert.equal(numericCell('-1.25e2'), -125)
  assert.equal(numericCell('0'), 0)
})
test('comparison requires explicit distinct column mapping and unit confirmation', () => {
  const input = experimental('编号,实测,参考\nA,12,10')
  assert.equal(inspectDataSheet({ ...input, sameUnitConfirmed: false }).comparisons.length, 0)
  assert.ok(inspectDataSheet({ ...input, referenceColumn: 1 }).issues.some(i => i.code === 'mapping'))
  assert.ok(inspectDataSheet({ ...input, unit: '' }).issues.some(i => i.code === 'units'))
})
test('relative errors use absolute reference, do not divide by zero and keep floating boundary stable', () => {
  const result = inspectDataSheet(experimental('编号,实测,参考\nA,10.5,10\nB,-12,-10\nC,1,0\nD,,10\nE,0.105,0.1'))
  assert.equal(result.comparisons.length, 3)
  assert.equal(result.comparisons[0].exceeded, false)
  assert.equal(result.comparisons[1].relative, 20)
  assert.equal(result.comparisons[2].exceeded, false)
  assert.ok(result.issues.some(i => i.code === 'zero-reference' && i.line === 4))
  assert.ok(result.issues.some(i => i.code === 'non-numeric' && i.line === 5))
})
test('summary excludes missing values without hiding them, and keeps duplicate records', () => {
  const result = inspectDataSheet(sheet('编号,值\nA,2\nB,\nA,2\nC,8'))
  const summary = result.summaries.find(s => s.header === '值')
  assert.deepEqual([summary.count, summary.missing, summary.sum, summary.mean], [3, 1, 12, 4])
  assert.equal(result.rows.length, 4)
})
test('bounded issue output still reports full issue count', () => {
  const result = inspectDataSheet(sheet('a,b\n' + Array(500).fill(',').join('\n')))
  assert.equal(result.issues.length, 200)
  assert.ok(result.issueCount > 200)
})
test('empty, incomplete, invalid and overflow states cannot claim calculation success', () => {
  assert.ok(inspectDataSheet(emptyDataSheet()).error)
  assert.ok(inspectDataSheet(sheet('a,b')).issues.some(i => i.code === 'no-rows'))
  assert.ok(validateDataSheet({ ...emptyDataSheet(), tolerancePercent: '' }))
  assert.ok(validateDataSheet({ ...emptyDataSheet(), measuredColumn: 30 }))
  const result = inspectDataSheet(experimental('id,m,r\na,1e12,1e-310'))
  assert.ok(result.issues.some(i => i.code === 'range'))
  assert.equal(result.comparisons.length, 0)
})
test('exports raw data, rules, exact calculation and boundaries with old project compatibility', () => {
  const data = experimental('id,m,r\na,12,10')
  const output = projectMarkdown({ ...emptyProject(), title: '实验', dataSheet: data }, 'v2')
  for (const text of ['csv-rules-2', 'a,12,10', '20%', '不代表学校标准', '原始第2行', '样本标准差', 'RMSE']) assert.ok(output.includes(text), text)
  assert.equal(dataCheckMarkdown(null), '')
})
