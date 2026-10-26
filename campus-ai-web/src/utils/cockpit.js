// Presentation only. Counts come from the already-authorized whole-scope response,
// never from a visible page, a name match, or a fabricated time series.
const statuses = [
  ['onTime', '按时', 'success'], ['absent', '旷课', 'danger'],
  ['earlyLeave', '早退', 'warning'], ['unknown', '待点名', 'neutral'],
  ['late', '历史迟到', 'warning'], ['excused', '历史请假', 'neutral'],
]
export function cockpitCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('zh-CN') : '未返回'
}
export function attendanceDistribution(counts) {
  if (!counts || statuses.some(([key]) => !Number.isSafeInteger(counts[key]) || counts[key] < 0)) return null
  const total = statuses.reduce((sum, [key]) => sum + counts[key], 0)
  if (!Number.isSafeInteger(total)) return null
  return {
    total, recorded: total - counts.unknown,
    rows: statuses.filter(([key]) => !['late', 'excused'].includes(key) || counts[key] > 0)
      .map(([key, label, tone]) => ({ key, label, tone, count: counts[key], share: total ? counts[key] / total * 100 : 0 })),
  }
}

export function attendanceChart(counts) {
  const distribution = attendanceDistribution(counts)
  if (!distribution) return null
  let offset = 0
  const segments = distribution.rows.filter(row => row.count > 0).map(row => {
    const segment = { ...row, offset }
    offset += row.share
    return segment
  })
  return { ...distribution, segments }
}

export function distributionPercent(value) {
  if (!Number.isFinite(value) || value < 0 || value > 100) return '未返回'
  if (value > 0 && value < 0.1) return '<0.1%'
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value)}%`
}

// Compare independent queue/model counts, not a share of a possibly partial total.
// Missing values stay visible first and never acquire a zero-length numeric bar.
export function cockpitComparison(items, key = 'count') {
  const valid = value => Number.isSafeInteger(value) && value >= 0
  const maximum = items.reduce((max, item) => valid(item[key]) ? Math.max(max, item[key]) : max, 0)
  return items.map(item => ({ ...item, barPercent: valid(item[key]) ? (maximum ? item[key] / maximum * 100 : 0) : null }))
    .sort((a, b) => !valid(a[key]) ? (!valid(b[key]) ? 0 : -1) : !valid(b[key]) ? 1 : b[key] - a[key])
}
