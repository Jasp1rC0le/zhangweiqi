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
  if (/连接官网超时/.test(error)) return '连接官网超时'
  if (/官网响应超时/.test(error)) return '官网响应超时，未取得内容'
  if (/正文读取超时/.test(error)) return '官网正文读取超时'
  if (/域名解析失败/.test(error)) return '官网域名解析失败'
  if (/安全连接校验失败/.test(error)) return '官网安全连接校验失败'
  if (/无法连接官网|官网连接中断/.test(error)) return '官网连接中断'
  if (/网页返回状态/.test(error)) return error.replace(/^官网读取失败[：:]\s*/, '')
  if (/官网读取失败|网页读取失败/.test(error)) return '历史读取失败，未记录具体原因'
  if (/索引/.test(error)) return '上次索引失败'
  return error || '未返回错误原因'
}
