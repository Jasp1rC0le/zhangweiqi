// Collect bounded summary pages, never return a silently truncated inventory.
export async function scanKnowledgeDocuments(fetchPage, { timeoutMs = 30000, maxPages = 100, signal } = {}) {
  const controller = new AbortController()
  const cancel = () => controller.abort(signal.reason)
  if (signal?.aborted) cancel()
  else signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('资料列表加载超时，请重试')), timeoutMs)
  let abortListener
  const aborted = new Promise((_, reject) => {
    abortListener = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', abortListener, { once: true })
    if (controller.signal.aborted) abortListener()
  })
  const collect = async () => {
    const documents = []
    let beforeId
    for (let index = 0; index < maxPages; index++) {
      controller.signal.throwIfAborted()
      const page = await fetchPage(beforeId, controller.signal)
      controller.signal.throwIfAborted()
      if (!Array.isArray(page) || page.length > 100) throw new Error('资料分页响应异常，请重试')
      for (const document of page) {
        if (!Number.isSafeInteger(document?.id) || document.id <= 0
            || (beforeId !== undefined && document.id >= beforeId)) {
          throw new Error('资料分页位置异常，请重试')
        }
        beforeId = document.id
        documents.push(document)
      }
      if (page.length < 100) return documents.sort((a, b) =>
        String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || b.id - a.id)
    }
    throw new Error('资料数量超出当前列表加载上限，请联系维护人员；未展示不完整列表')
  }
  try { return await Promise.race([collect(), aborted]) }
  finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
    controller.signal.removeEventListener('abort', abortListener)
  }
}
