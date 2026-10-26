import test from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'

let reply
globalThis.self = {
  postMessage: (value) => {
    reply = value
  },
}
await import('../src/utils/courseImport.worker.js')
function run(bytes, extension) {
  reply = null
  self.onmessage({
    data: {
      buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      extension,
    },
  })
  return reply
}
function workbook({ formula = false, secondSheet = false } = {}) {
  const rows = [
    ['课程名称', '星期', '节次', '周次', '上课地点', '学生姓名'],
    ['合成课程', '周三', '第3-4节', '1-16(单周)', '合成教室', '不应导入的示例姓名'],
  ]
  const sheet = `<worksheet><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((value, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr">${formula && i === 1 && j === 0 ? '<f>1+1</f>' : ''}<is><t>${value}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`
  const files = {
    'xl/workbook.xml': `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="合成课表" sheetId="1" r:id="r1"/>${secondSheet ? '<sheet name="另一学期" sheetId="2" r:id="r2"/>' : ''}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/>${secondSheet ? '<Relationship Id="r2" Target="worksheets/sheet2.xml"/>' : ''}</Relationships>`,
    'xl/worksheets/sheet1.xml': sheet,
  }
  if (secondSheet) files['xl/worksheets/sheet2.xml'] = sheet
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([key, value]) => [key, strToU8(value)])),
  )
}
test('real XLSX bytes parse locally into whitelisted courses', { timeout: 2000 }, () => {
  const output = run(workbook(), 'xlsx')
  assert.equal(output.error, undefined)
  assert.deepEqual(output.result.courses[0].weeks, [1, 3, 5, 7, 9, 11, 13, 15])
  assert.equal(output.result.courses[0].startPeriod, 3)
  assert.equal(output.result.courses[0].weekday, 3)
  assert.doesNotMatch(JSON.stringify(output), /不应导入的示例姓名/)
})
test(
  'formula and multiple semester sheets never silently merge or accept stale caches',
  { timeout: 2000 },
  () => {
    assert.match(run(workbook({ formula: true }), 'xlsx').error, /公式/)
    assert.match(run(workbook({ secondSheet: true }), 'xlsx').error, /多个工作表/)
  },
)
test(
  'invalid UTF-8 and malformed zip return errors without a course result',
  { timeout: 2000 },
  () => {
    for (const [bytes, extension] of [
      [new Uint8Array([255, 255]), 'csv'],
      [strToU8('not a zip'), 'xlsx'],
    ]) {
      const result = run(bytes, extension)
      assert.ok(result.error)
      assert.equal(result.result, undefined)
    }
  },
)
