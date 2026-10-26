import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { unzipOffice } from './attachmentParser.js'
import { parseCsv } from './projectDataCheck.js'
const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: false })
function xml(text) {
  if (!text || text.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw new Error('名单文件内部结构无效')
  return parser.parse(text)
}
function find(tree, tag) {
  const result = [], stack = (tree || []).map(node => ({ node, depth: 0 })).reverse()
  let inspected = 0
  while (stack.length) {
    const { node, depth } = stack.pop()
    if (depth > 64) throw new Error('名单文件结构过深')
    if (++inspected > 100000) throw new Error('名单文件结构过于复杂')
    for (const [key, children] of Object.entries(node)) {
      if (key === tag) result.push({ children, attrs: node[':@'] || {} })
      if (key !== ':@' && Array.isArray(children)) for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], depth: depth + 1 })
    }
  }
  return result
}
const string = children => find(children, 't').map(t => (t.children || []).map(n => n['#text'] || '').join('')).join('')
export function parseRosterRows(rows) {
  if (!Array.isArray(rows) || rows.length > 1001) throw new Error('每次名单限1000行')
  for (let h = 0; h < Math.min(20, rows.length); h++) {
    const headers = rows[h].map(v => String(v ?? '').trim())
    const keys = { studentNumber: '学号', name: '姓名', className: '班级' }, columns = {}
    for (const [key, label] of Object.entries(keys)) {
      const found = headers.map((v, i) => v === label ? i : -1).filter(i => i >= 0)
      if (found.length > 1) throw new Error(`名单含重复${label}列，请核对`)
      columns[key] = found[0]
    }
    if (Object.values(columns).some(v => v == null)) continue
    const members = [], numbers = new Set(), classes = new Map()
    for (let i = h + 1; i < rows.length; i++) {
      const values = Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, String(rows[i][column] ?? '').trim()]))
      if (Object.values(values).every(v => !v)) continue
      if (!values.studentNumber || !values.name || !values.className || values.studentNumber.length > 40 || values.name.length > 100 || values.className.length > 100 || Object.values(values).some(v => [...v].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)))
        throw new Error(`第${i + 1}行缺少班级、姓名或学号，或长度不合法；未导入`)
      if (numbers.has(values.studentNumber)) throw new Error(`第${i + 1}行学号重复，请核对；不会按同名合并`)
      if (Object.values(values).some(v => v.startsWith('=') || v.startsWith('[公式未计算') || v.startsWith('[Excel错误'))) throw new Error('姓名、学号或班级含公式或错误，不能采用缓存值')
      numbers.add(values.studentNumber)
      const member = { studentNumber: values.studentNumber, name: values.name, userId: null }
      members.push(member)
      if (!classes.has(values.className)) classes.set(values.className, [])
      classes.get(values.className).push(member)
    }
    if (!members.length || members.length > 1000 || classes.size > 20 || [...classes.values()].some(rows => rows.length > 300)) throw new Error('一次限20班、1000人，每班不超过300人')
    return { classes: [...classes].map(([className, members]) => ({ className, members })), ignoredColumns: headers.filter(Boolean).length - 3 }
  }
  throw new Error('未找到班级、姓名、学号三列表头；不读取其他身份信息')
}
export function parseRosterFile(bytes, extension) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('名单文件大小无效，限10MB')
  if (extension === 'csv') {
    if (bytes.length > 100000) throw new Error('CSV名单限100KB')
    const csv = parseCsv(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (csv.error) throw new Error(csv.error)
    return parseRosterRows([csv.headers, ...csv.rows.map(r => r.cells)])
  }
  if (extension !== 'xlsx') throw new Error('请选择XLSX或UTF-8 CSV名单')
  const files = unzipOffice(bytes), workbook = xml(files.get('xl/workbook.xml'))
  const sheets = find(workbook, 'sheet').filter(s => !s.attrs['@_state'] || s.attrs['@_state'] === 'visible')
  if (sheets.length !== 1) throw new Error('请选择只有一个可见工作表的班级名单，不自动合并')
  const rels = find(xml(files.get('xl/_rels/workbook.xml.rels')), 'Relationship')
  const rel = rels.find(r => r.attrs['@_Id'] === sheets[0].attrs['@_id'])
  if (!rel || rel.attrs['@_TargetMode'] === 'External') throw new Error('不读取外部名单链接')
  const path = rel.attrs['@_Target'].startsWith('/xl/') ? rel.attrs['@_Target'].slice(1) : `xl/${rel.attrs['@_Target']}`
  if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) throw new Error('工作表路径不受支持')
  const shared = files.has('xl/sharedStrings.xml') ? find(xml(files.get('xl/sharedStrings.xml')), 'si').map(s => string(s.children)) : []
  const rows = new Map(), seen = new Set()
  for (const cell of find(xml(files.get(path)), 'c')) {
    const ref = cell.attrs['@_r'], match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(ref || '')
    if (!match || seen.has(ref)) throw new Error('名单单元格位置无效或重复')
    seen.add(ref)
    let value = (find(cell.children, 'v')[0]?.children || []).map(n => n['#text'] || '').join('')
    if (cell.attrs['@_t'] === 's') {
      if (!/^\d+$/.test(value) || Number(value) >= shared.length) throw new Error('名单共享文字索引无效')
      value = shared[Number(value)]
    } else if (cell.attrs['@_t'] === 'inlineStr') value = string(cell.children)
    if (find(cell.children, 'f').length) value = '[公式未计算]'
    else if (cell.attrs['@_t'] === 'e') value = '[Excel错误]'
    // Ignore far-out styled blank cells, not a dense 16384-column rectangle.
    if (!value) continue
    const column = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1, row = Number(match[2]) - 1
    if (column > 29 || row > 1000) throw new Error('有效名单超出30列或1000行，请拆分')
    if (!rows.has(row)) rows.set(row, [])
    rows.get(row)[column] = value
  }
  const last = Math.max(...rows.keys())
  return parseRosterRows(Array.from({ length: last + 1 }, (_, i) => Array.from(rows.get(i) || [], v => v || '')))
}
