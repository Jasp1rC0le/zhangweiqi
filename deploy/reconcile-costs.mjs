// Offline only. Does not upload bills, query vendors, change quotas, or invent missing amounts.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export function parseCsv(source) {
  if (Buffer.byteLength(source) > 2_000_000) throw new Error('CSV 超过 2 MB，请按日导出')
  source = source.replace(/^\uFEFF/, '')
  const rows = []; let row = [], cell = '', quoted = false, closed = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++ }
        else { quoted = false; closed = true }
      } else cell += char
    } else if (char === '"' && !cell && !closed) quoted = true
    else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell); cell = ''; closed = false
      if (char !== ',') { if (row.some(value => value !== '')) rows.push(row); row = []; if (char === '\r' && source[i + 1] === '\n') i++ }
    } else {
      if (closed || char === '"') throw new Error('CSV 引号格式不正确')
      cell += char
    }
  }
  if (quoted) throw new Error('CSV 引号未闭合')
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const columns = rows.shift()
  if (!columns?.length || new Set(columns).size !== columns.length) throw new Error('CSV 表头缺失或重复')
  return rows.map(values => {
    if (values.length !== columns.length) throw new Error('CSV 行字段数不匹配')
    return Object.fromEntries(columns.map((column, i) => [column, values[i]]))
  })
}
const micros = text => {
  if (!/^-?\d{1,12}(\.\d{1,6})?$/.test(String(text))) throw new Error('金额须明确填写，最多 6 位小数；空白不是零')
  const negative = text.startsWith('-'); const [whole, fraction = ''] = text.replace(/^-/, '').split('.')
  return (negative ? -1n : 1n) * (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0')))
}
const money = value => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 1000000n}.${((value < 0n ? -value : value) % 1000000n).toString().padStart(6, '0')}`
function indexRows(rows, kind) {
  const map = new Map()
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(row.date))
      || new Date(row.date).toISOString().slice(0, 10) !== row.date
      || !row.provider || !row.model || row.provider.length > 80 || row.model.length > 120) throw new Error('日期、供应商或模型不正确')
    const key = JSON.stringify([row.date, row.provider, row.model])
    if (map.has(key)) throw new Error('同日同模型记录重复，请先核对并汇总，不能重复计费')
    if (kind === 'bill') {
      if (row.currency !== 'CNY' || row.timezone !== 'Asia/Shanghai') throw new Error('账单须先明确换成 CNY、Asia/Shanghai 的同日同模型口径')
      row.amount = micros(row.actualCny)
    } else {
      if (!/^\d+$/.test(row.unresolved) || !/^\d+$/.test(row.attempts) || BigInt(row.unresolved) > BigInt(row.attempts)) throw new Error('账本请求计数不正确')
      row.amount = micros(row.estimatedCny); row.occupied = micros(row.occupiedCny)
      if (row.amount < 0n || row.occupied < 0n) throw new Error('应用估算及预占不得为负数')
    }
    map.set(key, row)
  }
  return map
}
export function reconcile(ledgerCsv, billCsv) {
  const ledger = indexRows(parseCsv(ledgerCsv), 'ledger'); const bill = indexRows(parseCsv(billCsv), 'bill')
  const result = [...new Set([...ledger.keys(), ...bill.keys()])].sort().map(key => {
    const app = ledger.get(key), vendor = bill.get(key); const [date, provider, model] = JSON.parse(key)
    return { date, provider, model, estimatedCny: app ? money(app.amount) : null, occupiedCny: app ? money(app.occupied) : null,
      actualCny: vendor ? money(vendor.amount) : null, deltaCny: app && vendor ? money(vendor.amount - app.amount) : null,
      unresolved: app?.unresolved ?? null,
      status: !app ? 'MISSING_LEDGER' : !vendor ? 'MISSING_BILL' : app.unresolved !== '0' ? 'UNRESOLVED_REQUESTS'
        : app.amount === vendor.amount ? 'MATCH' : 'AMOUNT_DIFF' }
  })
  return { currency: 'CNY', timezone: 'Asia/Shanghai', rows: result,
    note: '仅比较输入文件，不验证账单真伪或覆盖范围；未核对请求不会自动释放额度。模型别名须先人工映射，空账单不视为通过。',
    allMatched: result.length > 0 && result.every(row => row.status === 'MATCH') }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error('用法：node reconcile-costs.mjs 应用导出.csv 已核实供应商日账单.csv')
    const report = reconcile(await readFile(process.argv[2], 'utf8'), await readFile(process.argv[3], 'utf8'))
    console.log(JSON.stringify(report, null, 2)); if (!report.allMatched) process.exitCode = 1
  } catch (error) { console.error(error.message); process.exitCode = 2 }
}
