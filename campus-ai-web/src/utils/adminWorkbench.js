// Administration helpers never infer privileges or replace server authorization.
export function formatAdminDate(value, includeYear = false) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    ...(includeYear ? { year: 'numeric' } : {}),
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export async function loadAdminSections(loaders) {
  return Object.fromEntries(await Promise.all(Object.entries(loaders).map(async ([key, load]) => {
    try {
      const data = await load()
      const valid = key === 'overview'
        ? data && typeof data === 'object' && !Array.isArray(data)
        : Array.isArray(data)
      if (!valid) throw new Error('后台数据格式异常')
      return [key, { data, error: null }]
    } catch (error) { return [key, { data: key === 'overview' ? null : [], error }] }
  })))
}

export function canShowEmptySourceReview({ loading, identityError, updatesError, updates } = {}) {
  return loading === false && !identityError && !updatesError
    && Array.isArray(updates) && updates.length === 0
}

export function filterAdminDocuments(documents, query = '', status = 'ALL') {
  const needle = query.trim().toLocaleLowerCase('zh-CN')
  return documents.filter(item => (status === 'ALL' || item.status === status)
    && (!needle || [item.id, item.title, item.category, item.sourceDepartment]
      .some(value => String(value ?? '').toLocaleLowerCase('zh-CN').includes(needle))))
}

export function knowledgeFormIssue(form) {
  if (!form.title.trim() || !form.category.trim() || !form.content.trim()) return '请填写资料标题、分类和正文'
  if (form.sourceUrl.trim()) {
    try {
      const url = new URL(form.sourceUrl.trim())
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error()
    } catch { return '原始链接须为有效的 http 或 https 地址，不能包含账号密码' }
  }
  for (const field of ['publishedAt', 'effectiveAt', 'expiresAt']) {
    if (form[field] && !Number.isFinite(Date.parse(form[field]))) return '请检查资料的日期和时间'
  }
  if (form.effectiveAt && form.expiresAt && Date.parse(form.expiresAt) <= Date.parse(form.effectiveAt)) {
    return '失效时间必须晚于生效时间'
  }
  return ''
}

// Publication and list refresh are different outcomes: never invite a second
// publication merely because the list could not be fetched after a committed write.
export async function publishThenRefresh(publish, committed, refresh) {
  const result = await publish()
  committed(result)
  try { await refresh(); return { result, refreshError: null } }
  catch (refreshError) { return { result, refreshError } }
}
