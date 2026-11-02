// Presentation only. Keep the original location intact for the detail and copy actions.
export function courseLocation(value) {
  const full = typeof value === 'string' ? value.trim() : ''
  if (!full) return { full: '', short: '地点待补' }
  const codes = [...new Set([...full.matchAll(/[A-Z]\d{0,2}[-—–]\d{2,5}[A-Z]?/giu)]
    .map(match => match[0].replace(/[—–]/g, '-')))]
  if (codes.length) return { full, short: codes.length === 1 ? codes[0] : '多处地点' }
  const floor = full.match(/([一二三四五六七八九十百\d]+[楼层][^，,；;/]{1,18})$/u)
  return { full, short: floor?.[1] || full }
}
