import { addDays, dayNumber } from './timetable.js'

export const WEBSITE_FEATURES = Object.freeze([
  { code: 'QUESTION', label: '校园问答', path: '/chat' },
  { code: 'CANTEEN', label: '食堂评分', path: '/canteens' },
  { code: 'TIMETABLE', label: '课表', path: '/timetable' },
  { code: 'WALL', label: '校园墙', path: '/wall' },
  { code: 'PROJECT', label: '学习项目', path: '/projects' },
])
const count = value => Number.isSafeInteger(value) && value >= 0
const date = value => {
  try {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(dayNumber(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value
  } catch { return false }
}

export function checkedWebsiteStatistics(value, days) {
  const invalid = () => { throw new Error('统计数据不完整，请重试') }
  if (![7, 30].includes(days) || !value || value.days !== days || value.coverage !== 'SAVED_RECORDS'
    || value.timeZone !== 'Asia/Shanghai' || !date(value.from) || !date(value.to) || addDays(value.from, days - 1) !== value.to
    || typeof value.asOf !== 'string' || !Number.isFinite(Date.parse(value.asOf))
    || new Date(Date.parse(value.asOf) + 8 * 3600000).toISOString().slice(0, 10) !== value.to) invalid()
  for (const key of ['totalAccounts', 'newAccounts', 'participatingAccounts', 'unhelpfulFeedback', 'openContacts']) if (!count(value[key])) invalid()
  if (value.newAccounts > value.totalAccounts || value.participatingAccounts > value.totalAccounts
    || !Array.isArray(value.daily) || value.daily.length !== days) invalid()
  for (let i = 0; i < days; i++) if (value.daily[i].date !== addDays(value.from, i) || !count(value.daily[i].newAccounts)) invalid()
  if (value.daily.reduce((sum, row) => sum + row.newAccounts, 0) !== value.newAccounts) invalid()
  if (!Array.isArray(value.features) || value.features.length !== WEBSITE_FEATURES.length
    || new Set(value.features.map(row => row.code)).size !== WEBSITE_FEATURES.length) invalid()
  const features = WEBSITE_FEATURES.map(meta => {
    const row = value.features.find(item => item.code === meta.code)
    if (!row || !count(row.participants) || row.participants > value.participatingAccounts) invalid()
    return { ...meta, participants: row.participants }
  }).sort((a, b) => b.participants - a.participants)
  if (features.reduce((sum, row) => sum + row.participants, 0) < value.participatingAccounts) invalid()
  return { days, from: value.from, to: value.to, asOf: value.asOf, totalAccounts: value.totalAccounts,
    newAccounts: value.newAccounts, participatingAccounts: value.participatingAccounts,
    daily: value.daily.map(row => ({ date: row.date, newAccounts: row.newAccounts })), features,
    unhelpfulFeedback: value.unhelpfulFeedback, openContacts: value.openContacts }
}

/** The 30-day view has five explicit seven-day buckets, not fabricated calendar weeks. */
export function websiteGrowthBuckets(daily, days) {
  const size = days === 30 ? 7 : 1, result = []
  for (let i = 0; i < daily.length; i += size) {
    const rows = daily.slice(i, i + size)
    result.push({ from: rows[0].date, to: rows.at(-1).date, newAccounts: rows.reduce((sum, row) => sum + row.newAccounts, 0) })
  }
  return result
}

/** Pending reads are cancelled, and an old owner/range cannot overwrite the current view. */
export function createWebsiteStatisticsReader({ read, owner, days, state, requestFactory }) {
  let disposed = false
  const request = requestFactory({
    load: (period, principal, options) => read(period, options),
    onStart: () => { state.loading = true; state.data = null; state.error = '' },
    onSuccess: (payload, pending, period, principal) => {
      if (!disposed && principal === owner() && period === days()) state.data = checkedWebsiteStatistics(payload, period)
    },
    onError: error => { state.error = error.response?.data?.message || error.message || '统计暂未能读取，请重试' },
    onFinish: () => { state.loading = false },
  })
  return {
    refresh() {
      request.cancel(); state.data = null; state.error = ''; state.loading = false
      if (!disposed && owner()) return request.run(days(), owner())
    },
    dispose() { disposed = true; request.dispose(); state.data = null; state.error = ''; state.loading = false },
  }
}
