// Layout only: preserves every authorized entry and never infers a missing clock.
export function timetableGrid(entries = [], bells = []) {
  const positioned = [], extras = []
  for (const entry of entries) {
    if (Number.isInteger(entry.startPeriod) && Number.isInteger(entry.endPeriod) && entry.startPeriod >= 1 && entry.endPeriod >= entry.startPeriod && entry.endPeriod <= 16 && entry.weekday >= 1 && entry.weekday <= 7) positioned.push(entry)
    else extras.push(entry)
  }
  const maxPeriod = positioned.length ? Math.max(8, ...positioned.map(entry => entry.endPeriod)) : 0
  const rows = Array.from({ length: maxPeriod }, (_, index) => ({ period: index + 1, ...bells.find(bell => bell.period === index + 1) }))
  const groups = []
  for (let weekday = 1; weekday <= 7; weekday++) {
    const day = positioned.filter(entry => entry.weekday === weekday).sort((a, b) => a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod || String(a.id).localeCompare(String(b.id)))
    let current
    for (const entry of day) {
      if (!current || entry.startPeriod > current.end) {
        current = { weekday, start: entry.startPeriod, end: entry.endPeriod, entries: [entry] }
        groups.push(current)
      } else { current.entries.push(entry); current.end = Math.max(current.end, entry.endPeriod) }
    }
  }
  return { rows, groups: groups.map(group => ({ ...group, key: JSON.stringify(group.entries.map(entry => entry.id)), tone: courseTone(group.entries[0].name) })), extras }
}
export function courseTone(name = '') {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)) | 0
  return Math.abs(hash) % 5
}
