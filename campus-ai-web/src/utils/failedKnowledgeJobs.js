export function groupFailedKnowledgeJobs(jobs, documents = []) {
  const byId = new Map(documents.map(document => [String(document.id), document]))
  const groups = new Map()
  for (const job of jobs) {
    const ref = job.refId == null ? '' : String(job.refId)
    const key = `${job.type}:${ref || `job-${job.id}`}`
    if (!groups.has(key)) groups.set(key, {
      key, type: job.type, refId: job.refId, document: byId.get(ref) || null, records: [],
    })
    groups.get(key).records.push(job)
  }
  return [...groups.values()]
}

export function failedKnowledgeReason(job) {
  const error = String(job?.lastError || '')
  if (/官网读取失败|网页读取失败/.test(error)) return '上次官网读取失败'
  if (/索引/.test(error)) return '上次索引失败'
  return error || '未返回错误原因'
}
