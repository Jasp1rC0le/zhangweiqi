import { safeExternalUrl } from './safeMarkdown.js'

// Construct a complete replacement before the view commits any part of it.
export function prepareStudyResult(result, submitted) {
  const answer = result?.assistantMessage?.content
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('未收到完整结果，请在最近对话中查看，不要重复提交')
  const sources = result.sources ?? [], webSources = result.webSources ?? []
  if (!Array.isArray(sources) || !Array.isArray(webSources)) throw new Error('返回的参考资料格式异常，未替换上一次结果；请在最近对话中核对')
  const rows = (items, prefix, field) => items.map((source, index) => {
    if (!source || typeof source !== 'object') throw new Error('返回的参考资料不完整，未替换上一次结果；请在最近对话中核对')
    return { label: `${prefix}${index + 1}`, title: typeof source.title === 'string' ? source.title : '', url: safeExternalUrl(source[field]) }
  })
  return {
    answer,
    references: [...rows(sources, '资料', 'sourceUrl'), ...rows(webSources, '网络', 'url')].slice(0, 30),
    snapshot: structuredClone(submitted),
  }
}
