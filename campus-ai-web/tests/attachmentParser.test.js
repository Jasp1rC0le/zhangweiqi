import test from 'node:test'
import assert from 'node:assert/strict'
import {zipSync,strToU8} from 'fflate'
import {checkAttachment,parseOffice,parseDocx,parseXlsx,unzipOffice} from '../src/utils/attachmentParser.js'
const doc = '<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>实验目标</w:t></w:r><w:r><w:t>与方法</w:t></w:r></w:p><w:p><w:r><w:t>原始记录</w:t></w:r></w:p></w:body></w:document>'
const workbook = '<workbook xmlns:r="urn:rel"><sheets><sheet name="记录" sheetId="1" r:id="r1"/><sheet name="隐私" sheetId="2" state="hidden" r:id="r2"/></sheets></workbook>'
const rels = '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>'
const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>电压</t></is></c><c r="B1" t="s"><v>0</v></c></row><row r="2"><c r="A2"><v>10</v></c><c r="B2"><f>A2*2</f><v>20</v></c></row></sheetData></worksheet>'
export const wordFiles = {'word/document.xml':strToU8(doc)}
export const excelFiles = {'xl/workbook.xml':strToU8(workbook),'xl/_rels/workbook.xml.rels':strToU8(rels),'xl/worksheets/sheet1.xml':strToU8(sheet),'xl/worksheets/sheet2.xml':strToU8('<worksheet/>'),'xl/sharedStrings.xml':strToU8('<sst><si><t>计算值</t></si></sst>')}
test('office files extract text locally and retain sheet selection without executing formulas',()=>{
  assert.equal(parseOffice(zipSync(wordFiles),'docx').choices[0].text,'实验目标与方法\n原始记录')
  const result = parseOffice(zipSync(excelFiles),'xlsx')
  assert.equal(result.choices.length,1); assert.equal(result.choices[0].label,'记录')
  assert.equal(result.choices[0].text,'电压,计算值\n10,[公式未计算 B2]')
  assert.equal(result.choices[0].formulaCount,1)
  assert.match(result.warnings.join(''),/忽略1个隐藏工作表/)
})
test('rejects XML entities, unsafe zip paths, macros, large output and out-of-range cells',()=>{
  assert.throws(()=>parseDocx(new Map([['word/document.xml','<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>']])),/实体/)
  assert.throws(()=>unzipOffice(zipSync({'../secret':strToU8('x')})),/路径/)
  assert.throws(()=>unzipOffice(zipSync({'word/vbaProject.bin':strToU8('x')})),/宏/)
  assert.throws(()=>unzipOffice(zipSync({'word/document.xml':strToU8('x'.repeat(2*1024*1024+1))})),/过大/)
  const files = new Map(Object.entries(excelFiles).map(([k,v])=>[k,new TextDecoder().decode(v)]))
  files.set('xl/worksheets/sheet1.xml',sheet.replace('A2','AE2'))
  assert.throws(()=>parseXlsx(files),/30列/)
  assert.throws(()=>parseOffice(new Uint8Array([1,2,3]),'docx'),/格式/)
})
test('file limits and format mismatch are explicit instead of truncation',()=>{
  assert.equal(checkAttachment('任务.DOCX',100,'brief'),'docx')
  assert.throws(()=>checkAttachment('macro.xlsm',100,'brief'),/支持/)
  assert.throws(()=>checkAttachment('a.pdf',100,'dataSheet'),/XLSX/)
  assert.throws(()=>checkAttachment('a.pdf',10*1024*1024+1,'brief'),/10MB/)
  assert.throws(()=>parseDocx(new Map([['word/document.xml',doc.replace('原始记录','a'.repeat(50001))]])),/5万字/)
})
test('Word table rows, tabs and line breaks remain traceable without deleted revisions',()=>{
  const input='<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>目标</w:t><w:br/><w:t>方法</w:t><w:tab/><w:t>单位</w:t></w:r><w:del><w:r><w:t>删除内容</w:t></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>实测</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>参考</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
  const result=parseDocx(new Map([['word/document.xml',input]]))
  assert.match(result.choices[0].text,/目标\n方法\t单位/)
  assert.match(result.choices[0].text,/【Word表格1 · 第1行】\n实测\t参考/)
  assert.doesNotMatch(result.choices[0].text,/删除内容/)
  assert.match(result.warnings.join(''),/文档含修订/)
})
