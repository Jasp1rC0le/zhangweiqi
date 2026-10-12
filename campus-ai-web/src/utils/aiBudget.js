const counts = ['attempts', 'completed', 'failed', 'unresolved', 'inputTokens', 'outputTokens']
const amounts = ['estimatedCny', 'occupiedCny', 'limitCny']
export function isBudgetOverview(value) {
  if (!value || typeof value.enabled !== 'boolean' || value.currency !== 'CNY'
      || value.timezone !== 'Asia/Shanghai' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date || '')) return false
  return [value.today, value.month].every(item => item &&
    counts.every(key => Number.isSafeInteger(item[key]) && item[key] >= 0) &&
    amounts.every(key => typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0) &&
    item.limitCny > 0 && item.completed + item.unresolved === item.attempts && item.failed <= item.unresolved)
}
