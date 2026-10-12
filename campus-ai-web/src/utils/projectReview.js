// Feedback records an owner's judgment, never overrides a rule or proves a pass.
export const REVIEW_VERSION = 'requirements-v1'
export function reviewInput(project) {
  return JSON.stringify({ version: REVIEW_VERSION, brief: project.brief, manuscript: project.manuscript, requirements: project.requirements.map(r => ({ id:r.id, title:r.title, sourceLine:r.sourceLine, sourceQuote:r.sourceQuote, confirmed:r.confirmed, done:r.done, evidence:r.evidence })) })
}
export async function reviewFingerprint(project) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reviewInput(project)))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
export function recordReviewFeedback(records, issue, fingerprint, reason) {
  const text = reason.trim()
  if (!text || text.length > 500) throw new Error('请填写1–500字的复核理由')
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('请先重新检查当前材料')
  const next = (records || []).filter(row => row.issueKey !== issue.key)
  if (next.length >= 100) throw new Error('复核记录最多100条，请先移除不再需要的记录')
  return [...next, { issueKey:issue.key, title:issue.title.slice(0,300), fingerprint, reason:text }]
}
export function validateReviewFeedback(records) {
  if (records == null) return ''
  if (!Array.isArray(records) || records.length > 100) return '复核记录最多100条'
  if (new Set(records.map(r => r?.issueKey)).size !== records.length) return '复核记录不能重复'
  return records.some(r => !r || typeof r.issueKey !== 'string' || !r.issueKey.trim() || r.issueKey.length > 80 || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 300 || !/^[a-f0-9]{64}$/.test(r.fingerprint) || typeof r.reason !== 'string' || !r.reason.trim() || r.reason.length > 500) ? '复核记录格式不正确，请重新检查并记录' : ''
}
export function reviewFeedbackMarkdown(records) {
  if (!records?.length) return ''
  return '\n## 本人复核记录\n这些是本人反馈，不代表系统已确认误报或问题已经解决。材料修改后须重新检查和核对；记录不减少问题数、不改变覆盖率。\n\n' + records.map(r => `### ${r.title}\n${r.reason}\n\n检查快照摘要：${r.fingerprint}\n`).join('\n')
}
