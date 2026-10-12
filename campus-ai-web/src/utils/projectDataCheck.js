// Deterministic, local-only checks. Never evaluates spreadsheet formulas or sends data to AI.
import { describeValues, describePairs } from './measurementStats.js'
import { validateCalculation } from './formulaEngine.js'
export const DATA_CHECK_VERSION = 'csv-rules-2'
export const emptyDataSheet = () => ({ csv: '', source: '', measuredColumn: -1, referenceColumn: -1, unit: '', sameUnitConfirmed: false, tolerancePercent: 5 })
export const dataBoundary = '仅检查 CSV 结构、描述性统计及所选同单位两列的误差，不核验数据真实性、单位换算、统计显著性或专业结论；阈值由你设定，不代表学校标准'
const MAX_ROWS = 2000, MAX_COLUMNS = 30
export function validateDataSheet(sheet) {
  if (!sheet) return ''
  if (typeof sheet.csv !== 'string' || sheet.csv.length > 50000 || sheet.csv.includes('\0')) return 'CSV需为5万字以内的纯文本'
  if (typeof sheet.source !== 'string' || sheet.source.length > 300 || typeof sheet.unit !== 'string' || sheet.unit.length > 40) return '来源最多300字，单位最多40字'
  if (![sheet.measuredColumn, sheet.referenceColumn].every(c => Number.isInteger(c) && c >= -1 && c < MAX_COLUMNS)) return '请选择有效数据列'
  if (sheet.tolerancePercent === '' || sheet.tolerancePercent === null || !Number.isFinite(Number(sheet.tolerancePercent)) || Number(sheet.tolerancePercent) < 0 || Number(sheet.tolerancePercent) > 1000) return '相对误差阈值需在0至1000%之间'
  const calculationError = validateCalculation(sheet.calculation)
  if (calculationError) return calculationError
  return ''
}

/** RFC-style comma-separated records, quoted commas/newlines/escaped quotes; original physical line numbers. */
export function parseCsv(input) {
  if (!input.trim()) return { headers: [], rows: [], error: '先粘贴或导入带表头的 CSV' }
  if (input.length > 50000 || input.includes('\0')) return { headers: [], rows: [], error: 'CSV需为5万字以内的纯文本' }
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const records = []
  let fields = [], field = '', quoted = false, closed = false, line = 1, startLine = 1, touched = false
  const reject = message => ({ headers: [], rows: [], error: `第 ${line} 行：${message}` })
  const pushField = () => { fields.push(field); field = ''; closed = false }
  const pushRow = () => {
    pushField()
    // A physically blank line is ignored; a quoted empty cell or comma-only row is a real record.
    if (touched || fields.some(v => v.trim())) records.push({ cells: fields, line: startLine })
    fields = []; touched = false; startLine = line + 1
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else { quoted = false; closed = true }
      } else { field += ch; if (ch === '\n') line++ }
    } else if (ch === ',') { touched = true; pushField() }
    else if (ch === '\n') { pushRow(); line++ }
    else if (ch === '"') {
      if (field || closed) return reject('引号必须从单元格开头开始')
      quoted = true; touched = true
    } else {
      if (closed) return reject('闭合引号后只能是逗号或换行')
      field += ch; if (ch.trim()) touched = true
    }
    if (fields.length >= MAX_COLUMNS || records.length > MAX_ROWS + 1) return reject('最多30列、2000条数据，请拆分文件')
  }
  if (quoted) return reject('引号未闭合，请核对 CSV 导出格式')
  if (field || fields.length || touched || closed) pushRow()
  if (!records.length) return reject('没有可读取的表头')
  if (records.length > MAX_ROWS + 1 || records.some(r => r.cells.length > MAX_COLUMNS)) return reject('最多30列、2000条数据，请拆分文件')
  return { headers: records[0].cells, headerLine: records[0].line, rows: records.slice(1), error: '' }
}

// Strict numeric grammar: no currency, %, thousands separators, formulas, NaN or coercion of blanks to zero.
export function numericCell(value) {
  const text = String(value ?? '').trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null
  const number = Number(text)
  return Number.isFinite(number) && Math.abs(number) <= 1e12 && !(number === 0 && /[1-9]/.test(text.split(/[eE]/)[0])) ? number : null
}
export const formatNumber = value => Number.isFinite(value) ? Number(value.toPrecision(10)).toString() : '无法计算'

export function inspectDataSheet(sheet = emptyDataSheet()) {
  const validation = validateDataSheet(sheet)
  const parsed = validation ? { headers: [], rows: [], error: validation } : parseCsv(sheet.csv)
  const issues = [], comparisons = [], summaries = []
  let issueCount = 0
  const issue = (code, line, column, detail, suggestion, severity = '核对') => {
    issueCount++
    if (issues.length < 200) issues.push({ code, line, column, detail, suggestion, severity })
  }
  const result = () => ({ ...parsed, issues, issueCount, comparisons, summaries, pairedSummary:describePairs(comparisons), version: DATA_CHECK_VERSION, comparisonEnabled })
  let comparisonEnabled = false
  if (parsed.error) return result()
  const { headers, headerLine, rows } = parsed
  const seenHeaders = new Set(), seenRows = new Map()
  if (!sheet.source.trim()) issue('source', 0, '', '未记录数据来源', '补充采集方法、文件版本或授权来源，便于复查')
  headers.forEach((header, index) => {
    const label = header.trim()
    if (!label) issue('header-empty', headerLine, `第${index + 1}列`, '表头为空', '填写可区分的数据列名称', '缺失')
    else if (seenHeaders.has(label)) issue('header-duplicate', headerLine, `第${index + 1}列`, `表头“${label}”重复`, '区分同名列，避免选错参考值')
    seenHeaders.add(label)
  })
  if (!rows.length) issue('no-rows', headerLine, '', '只有表头，没有数据', '导入至少一条原始记录', '缺失')
  rows.forEach(row => {
    if (row.cells.length !== headers.length) issue('width', row.line, '', `此行${row.cells.length}列，表头${headers.length}列`, '检查遗漏的分隔符或为含逗号的字段添加双引号', '格式')
    headers.forEach((header, i) => { if (!row.cells[i]?.trim()) issue('missing', row.line, header || `第${i + 1}列`, '单元格为空', '核对原始记录；不要把缺失值随意补为0', '缺失') })
    const key = JSON.stringify(row.cells)
    if (seenRows.has(key)) issue('duplicate', row.line, '', `与第${seenRows.get(key)}行完全相同`, '核对是否重复导入；重复测量可能合理，不会自动删除')
    else seenRows.set(key, row.line)
  })
  const m = sheet.measuredColumn, r = sheet.referenceColumn
  if (m >= 0 || r >= 0) {
    if (m < 0 || r < 0 || m >= headers.length || r >= headers.length || m === r) issue('mapping', 0, '', '实测列与参考列需分别选择，且不能相同', '按列号核对数据含义')
    else if (!sheet.unit.trim() || !sheet.sameUnitConfirmed) issue('units', 0, '', '尚未确认两列使用相同单位', '手动统一单位后填写单位并确认，系统不自动换算')
    else comparisonEnabled = true
  }
  headers.forEach((header, column) => {
    const present = rows.map(row => row.cells[column]).filter(v => v?.trim())
    const numeric = present.map(numericCell)
    if (!present.length || numeric.some(v => v === null) || rows.some(row => row.cells.length !== headers.length)) return
    summaries.push({ column, header, missing: rows.length - numeric.length, ...describeValues(numeric) })
  })
  if (comparisonEnabled) rows.forEach(row => {
    if (row.cells.length !== headers.length) return
    const measured = numericCell(row.cells[m]), reference = numericCell(row.cells[r])
    if (measured === null || reference === null) {
      issue('non-numeric', row.line, `${headers[m]} / ${headers[r]}`, '包含缺失或不支持的数值', '使用绝对值≤1e12的纯数字；不支持百分号、千分位和表格公式', '未计算')
      return
    }
    if (reference === 0) { issue('zero-reference', row.line, headers[r], '参考值为0，相对误差无定义', '改用课程要求的绝对误差方法，本工具不代替选择', '未计算'); return }
    const relative = Math.abs((measured - reference) / reference) * 100
    if (!Number.isFinite(relative)) { issue('range', row.line, '', '数值量级超出可计算范围', '调整单位和数值量级后重新检查', '未计算'); return }
    const exceeded = relative > Number(sheet.tolerancePercent) + Math.max(1, relative) * Number.EPSILON * 16
    comparisons.push({ line: row.line, measured, reference, relative, exceeded })
    if (exceeded) issue('tolerance', row.line, `${headers[m]} / ${headers[r]}`, `相对误差 ${formatNumber(relative)}% 超过你设定的 ${sheet.tolerancePercent}%`, `|${measured} − ${reference}| ÷ |${reference}| × 100%；检查原始记录与实验条件，不自动改值`, '超阈值')
  })
  return result()
}

export function dataCheckMarkdown(sheet) {
  if (!sheet?.csv?.trim()) return ''
  const result = inspectDataSheet(sheet)
  return `\n## 数据检查（${DATA_CHECK_VERSION}）\n来源：${sheet.source || '未填写'}\n${dataBoundary}\n\n原始 CSV（每行缩进保留，不执行公式）：\n${sheet.csv.split('\n').map(line => `    ${line}`).join('\n')}\n\n实测列：${sheet.measuredColumn + 1 || '未选择'}；参考列：${sheet.referenceColumn + 1 || '未选择'}；单位：${sheet.unit || '未确认'}；单位确认：${sheet.sameUnitConfirmed ? '是' : '否'}；用户阈值：${sheet.tolerancePercent}%\n\n${result.error || `${result.rows.length}条数据，${result.issueCount}处待核对（最多列出200项）`}\n${result.issues.map(i => `- ${i.line ? `原始第${i.line}行` : '检查设置'} ${i.column}：${i.detail}；${i.suggestion}`).join('\n')}\n\n${result.summaries.map(s => `- ${s.header}：有效n=${s.count}，缺失=${s.missing}，合计=${formatNumber(s.sum)}，均值=${formatNumber(s.mean)}，最小=${formatNumber(s.min)}，最大=${formatNumber(s.max)}`).join('\n')}\n\n${result.comparisons.map(c => `- 第${c.line}行：|${c.measured} − ${c.reference}| ÷ |${c.reference}| × 100% = ${formatNumber(c.relative)}%（${c.exceeded ? '超出用户阈值' : '未超出用户阈值'}）`).join('\n')}\n数值按浮点计算、显示最多10位有效数字；未发现问题不代表可以提交。\n`
}
export function measurementMarkdown(sheet) {
  if (!sheet?.csv?.trim()) return ''
  const result=inspectDataSheet(sheet), pair=result.pairedSummary
  if (result.error) return ''
  return '\n## 描述性统计与误差汇总\n样本标准差 s = sqrt(sum((x-mean)^2)/(n-1))；有效n不足2时不计算；不自动剔除异常值，不代表总体误差或显著性。\n' + result.summaries.map(s=>`- ${s.header}：有效n=${s.count}；中位数=${formatNumber(s.median)}；样本标准差=${s.sampleStdDev===null?'不足2条':formatNumber(s.sampleStdDev)}`).join('\n') + (pair?`\n有效配对${pair.count}/${result.rows.length}行，单位${sheet.unit}；仅使用已完成相对误差计算的行。\n- 平均差=sum(m-r)/n=${formatNumber(pair.bias)}\n- MAE=sum(abs(m-r))/n=${formatNumber(pair.mae)}\n- RMSE=sqrt(sum((m-r)^2)/n)=${formatNumber(pair.rmse)}\n`:'\n未进行有效配对误差汇总\n')
}
