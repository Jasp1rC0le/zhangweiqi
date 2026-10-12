export const costColumns = ['date', 'provider', 'model', 'attempts', 'unresolved', 'inputTokens', 'outputTokens', 'estimatedCny', 'occupiedCny']
export function budgetExportRange(from, through, latest) {
  const date = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
    const time = Date.parse(`${value}T00:00:00Z`)
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN
  }
  const start = date(from), end = date(through), max = date(latest)
  if (![start, end, max].every(Number.isFinite) || end < start || end > max || end - start >= 31 * 86400000) {
    throw new Error('请选择不晚于预算日期、连续1至31天的有效日期')
  }
  return Object.freeze({ from, through, until: new Date(end + 86400000).toISOString().slice(0, 10) })
}
const csvCell = value => {
  const text = String(value)
  const safe = /^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}
export function dailyCostsCsv(rows) {
  if (!Array.isArray(rows) || rows.length > 10000) throw new Error('费用数据格式不完整')
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row?.date) || typeof row.provider !== 'string' || typeof row.model !== 'string'
      || costColumns.slice(3).some(key => row[key] == null || !Number.isFinite(Number(row[key])) || Number(row[key]) < 0)
      || Number(row.unresolved) > Number(row.attempts)) throw new Error('费用数据格式不完整')
  }
  return '\uFEFF' + [costColumns.join(','), ...rows.map(row => costColumns.map(key => csvCell(row[key])).join(','))].join('\r\n') + '\r\n'
}
