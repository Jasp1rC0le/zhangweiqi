import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validSchoolInvoice, schoolInvoiceText } from '../src/utils/schoolInvoice.js'
const data = { unitName: '天津中德应用技术大学', taxId: '12120000401200249U', sourceUrl: 'https://cwsj.tsguas.edu.cn/', checkedOn: '2026-10-31' }
test('copy keeps exact institutional identity and no account details', () => {
  assert.equal(schoolInvoiceText(data), '单位名称：天津中德应用技术大学\n单位税号：12120000401200249U')
  assert.equal(validSchoolInvoice({ ...data, taxId: '12120000401200249V' }), false)
  assert.equal(schoolInvoiceText({ ...data, sourceUrl: 'https://example.test' }), '')
  assert.equal(schoolInvoiceText(null), '')
})
