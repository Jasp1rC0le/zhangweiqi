// Generate synthetic, non-personal fixtures for browser upload QA only.
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {zipSync,strToU8} from 'fflate'
const directory = mkdtempSync(join(tmpdir(),'campthink-attachments-'))
const doc = '<w:document xmlns:w="urn:word"><w:body><w:p><w:r><w:t>通用测量练习（合成测试附件）</w:t></w:r></w:p><w:p><w:r><w:t>保留真实测量记录，说明方法与局限</w:t></w:r></w:p></w:body></w:document>'
writeFileSync(join(directory,'synthetic.docx'),zipSync({'word/document.xml':strToU8(doc)}))
const workbook = '<workbook xmlns:r="urn:rel"><sheets><sheet name="测量记录" r:id="r1"/><sheet name="其他记录" r:id="r2"/></sheets></workbook>'
const rels = '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>'
const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>实测值</t></is></c><c r="B1" t="inlineStr"><is><t>参考值</t></is></c></row><row r="2"><c r="A2"><v>10.2</v></c><c r="B2"><v>10</v></c></row><row r="3"><c r="A3"><v>9.8</v></c><c r="B3"><f>B2</f><v>10</v></c></row></sheetData></worksheet>'
writeFileSync(join(directory,'synthetic.xlsx'),zipSync({'xl/workbook.xml':strToU8(workbook),'xl/_rels/workbook.xml.rels':strToU8(rels),'xl/worksheets/sheet1.xml':strToU8(sheet),'xl/worksheets/sheet2.xml':strToU8(sheet)}))
const stream='BT /F1 14 Tf 72 720 Td (Synthetic attachment. Record source and units.) Tj ET'
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
let pdf='%PDF-1.4\n',offsets=[0]
objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`})
const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
writeFileSync(join(directory,'synthetic.pdf'),pdf)
console.log(directory)
import { Buffer } from 'node:buffer'
