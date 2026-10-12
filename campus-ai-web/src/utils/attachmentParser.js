import { Unzip, UnzipInflate } from 'fflate'
import { XMLParser, XMLValidator } from 'fast-xml-parser'

export const ATTACHMENT_LIMIT = 10 * 1024 * 1024
const MAX_XML = 2 * 1024 * 1024, MAX_TOTAL = 4 * 1024 * 1024
const parser = new XMLParser({ preserveOrder:true, ignoreAttributes:false, removeNSPrefix:true, parseTagValue:false, trimValues:false })
export function checkAttachment(name, size, target) {
  const extension = name.split('.').pop()?.toLowerCase()
  if (!['pdf','docx','xlsx','txt','md','csv'].includes(extension)) throw new Error('支持 PDF、DOCX、XLSX、TXT、MD、CSV；旧版 DOC/XLS 请先另存为新格式')
  if (target === 'dataSheet' && !['xlsx','csv'].includes(extension)) throw new Error('数据检查请导入 XLSX 或 CSV')
  if (!Number.isFinite(size) || size < 1 || size > ATTACHMENT_LIMIT) throw new Error('请选择不超过10MB的非空文件')
  return extension
}
export function unzipOffice(bytes) {
  if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error('文件格式不匹配或已加密，请另存为未加密 DOCX/XLSX')
  const files = new Map(), seen = new Set()
  let total = 0, entries = 0
  const unzip = new Unzip(file => {
    if (++entries > 500) throw new Error('附件内容过于复杂，最多支持500个内部文件')
    if (seen.has(file.name) || /(^|\/)\.\.(\/|$)|\\|^\//.test(file.name)) throw new Error('附件内部路径异常，未读取')
    seen.add(file.name)
    if (/vbaProject|activeX|embeddings\//i.test(file.name)) throw new Error('不读取含宏、ActiveX或嵌入对象的附件，请先导出为纯文本或PDF')
    if (!/^(word\/document\.xml|xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml))$/.test(file.name)) return
    if (file.originalSize > MAX_XML) throw new Error('附件解压后的正文或工作表过大，请拆分')
    const parts = []; let size = 0
    file.ondata = (error, data, final) => {
      if (error) throw new Error('附件压缩内容损坏，未读取')
      size += data.length; total += data.length
      if (size > MAX_XML || total > MAX_TOTAL) throw new Error('附件解压内容超过安全上限，请拆分')
      parts.push(data)
      if (final) {
        const merged = new Uint8Array(size); let offset = 0
        for (const part of parts) { merged.set(part, offset); offset += part.length }
        files.set(file.name, new TextDecoder('utf-8', {fatal:true}).decode(merged))
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  // Bound each synchronous expansion step; the caller also isolates this in a timed Worker.
  for (let offset = 0; offset < bytes.length; offset += 1024) unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length)
  return files
}
function xml(input) {
  if (!input || input.length > MAX_XML || /<!DOCTYPE|<!ENTITY/i.test(input)) throw new Error('附件XML缺失、过大或包含不允许的实体声明')
  if (XMLValidator.validate(input) !== true) throw new Error('附件内部XML损坏，未读取')
  return parser.parse(input)
}
function* elements(nodes, tag) {
  for (const node of nodes || []) for (const [name, children] of Object.entries(node)) {
    if (name === ':@' || name === '#text') continue
    if (name === tag) yield {children, attrs:node[':@'] || {}}
    if (Array.isArray(children)) yield* elements(children, tag)
  }
}
const textContent = nodes => (nodes || []).map(node => Object.entries(node).filter(([key]) => key !== ':@').map(([key,value]) => key === '#text' ? String(value) : key === 'tab' ? '\t' : key === 'br' ? '\n' : Array.isArray(value) ? textContent(value) : '').join('')).join('')
const texts = (tree, tag) => [...elements(tree,tag)].map(node => textContent(node.children))
function textChoice(label, text) {
  if (!text.trim()) throw new Error('没有提取到可用文字；扫描图片需要OCR，本工具尚不支持')
  if (text.length > 50000) throw new Error('提取文字超过5万字，请拆分附件，不会静默截断')
  return {label, text}
}
export function parseDocx(files) {
  const tree = xml(files.get('word/document.xml'))
  let tableNumber = 0, revisions = false
  const inline = nodes => (nodes || []).map(node => Object.entries(node).map(([tag,children]) => {
    if(tag==='del'||tag==='moveFrom'){revisions=true;return ''}
    if(tag==='ins'||tag==='moveTo')revisions=true
    if(tag==='t')return textContent(children)
    if(tag==='tab')return '\t'
    if(tag==='br'||tag==='cr')return '\n'
    // Drawing text, field instructions and equations must not be mistaken for body text.
    if([':@','drawing','pict','instrText','oMath','oMathPara'].includes(tag))return ''
    return Array.isArray(children)?inline(children):''
  }).join('')).join('')
  const direct = (nodes,tag) => (nodes || []).flatMap(node => node[tag] ? [node[tag]] : [])
  const blocks = nodes => (nodes || []).flatMap(node => Object.entries(node).flatMap(([tag,children]) => {
    if(tag==='p')return [inline(children)]
    if(tag==='tbl'){
      const number=++tableNumber
      return direct(children,'tr').map((row,index)=>`【Word表格${number} · 第${index+1}行】\n`+direct(row,'tc').map(cell=>[...elements(cell,'p')].map(p=>inline(p.children)).join(' / ')).join('\t'))
    }
    if(tag==='del'||tag==='moveFrom'){revisions=true;return []}
    return Array.isArray(children)?blocks(children):[]
  }))
  const body=[...elements(tree,'body')][0]
  const text = blocks(body?.children).join('\n')
  return {kind:'text', choices:[textChoice('Word 正文',text)], warnings:[`提取${tableNumber}个正文表格并标注行号；单元格以制表符分隔，单元格内段落以 / 分隔，合并及嵌套结构不保真`,'不包含图片、公式、批注、页眉页脚，也不保留原始版式','Word分页会随软件变化，段落位置为提取文本行号，请对照原文件复核',...(revisions?['文档含修订：忽略删除/移出文字，保留插入/移入文字；请先在Word核对修订状态']:[])]}
}
const csvCell = value => /[",\r\n]/.test(value) ? `"${value.replaceAll('"','""')}"` : value
export function parseXlsx(files) {
  const workbook = xml(files.get('xl/workbook.xml')), relationships = xml(files.get('xl/_rels/workbook.xml.rels'))
  const rels = new Map([...elements(relationships,'Relationship')].filter(r => r.attrs['@_TargetMode'] !== 'External').map(r => [r.attrs['@_Id'], r.attrs['@_Target']]))
  const shared = files.has('xl/sharedStrings.xml') ? [...elements(xml(files.get('xl/sharedStrings.xml')),'si')].map(item => texts(item.children,'t').join('')) : []
  const sheets = [...elements(workbook,'sheet')]
  if (sheets.length > 10) throw new Error('最多支持10个工作表，请先拆分文件')
  const choices = []; let formulas = 0, hidden = 0
  for (const sheet of sheets) {
    if (sheet.attrs['@_state'] && sheet.attrs['@_state'] !== 'visible') { hidden++; continue }
    const target = rels.get(sheet.attrs['@_id'])
    const path = target?.startsWith('/xl/') ? target.slice(1) : `xl/${target}`
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path) || !files.has(path)) throw new Error('工作表路径不受支持或文件不完整')
    const tree = xml(files.get(path)), rows = new Map(); let width = 0, maxRow = 0, formulaCount = 0
    for (const cell of elements(tree,'c')) {
      const ref = cell.attrs['@_r'], match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(ref || '')
      if (!match) throw new Error('单元格缺少有效位置，无法可靠定位')
      const column = [...match[1]].reduce((n,c) => n * 26 + c.charCodeAt(0)-64,0), row = Number(match[2])
      if (column > 30 || row > 2001) throw new Error('工作表超出前30列或2001行，请选择需要的区域另存')
      const type = cell.attrs['@_t']; let value = texts(cell.children,'v').join('')
      const formula = [...elements(cell.children,'f')]
      if (formula.length) { formulaCount++; value = `[公式未计算 ${ref}]` }
      else if (type === 's') { if (!/^\d+$/.test(value) || Number(value) >= shared.length) throw new Error('共享字符串索引失效'); value = shared[Number(value)] }
      else if (type === 'inlineStr') value = texts(cell.children,'t').join('')
      else if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE'
      else if (type === 'e') value = `[Excel错误 ${value}]`
      const cells = rows.get(row) || new Map()
      if (cells.has(column)) throw new Error('附件存在重复单元格地址')
      cells.set(column,value); rows.set(row,cells); width = Math.max(width,column); maxRow = Math.max(maxRow,row)
    }
    if (!maxRow) continue
    const csv = Array.from({length:maxRow},(_,i) => rows.has(i+1) ? Array.from({length:width},(_,j) => csvCell(rows.get(i+1).get(j+1) || '')).join(',') : '').join('\n')
    choices.push({...textChoice(sheet.attrs['@_name'] || `工作表${choices.length+1}`,csv), formulaCount})
    formulas += formulaCount
  }
  if (!choices.length) throw new Error('没有可导入的非空可见工作表')
  return {kind:'sheet',choices,warnings:[`检测到${formulas}个公式单元格，全部标记为未计算，不采用可能过期的缓存结果`,`忽略${hidden}个隐藏工作表；可见表中的隐藏行列仍会提取，导入前请检查隐私信息`,'只读取单元格值，不执行宏或访问外部链接；日期显示为Excel底层值，样式、图表与合并结构不保留','一次导入一个工作表；请选择表头所在区域，导入后仍需核对数据来源和单位']}
}
export function parseOffice(bytes, extension) {
  const files = unzipOffice(bytes)
  return extension === 'docx' ? parseDocx(files) : parseXlsx(files)
}
