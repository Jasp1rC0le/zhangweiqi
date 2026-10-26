import { isChatCompletion, MAX_ANSWER_CHARS } from './chatResponse.js'

export const MAX_STREAM_BYTES = 2 * 1024 * 1024
export const MAX_EVENT_CHARS = 512 * 1024
const malformed = () => createStreamError(502, { message: '回答数据格式异常，请查看历史记录后重试' })
const oversized = () => createStreamError(413, { message: '回答数据超过安全上限，已停止接收，请查看历史记录' })
const serverFailure = status => {
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502
  const message = ({401:'登录已失效，请重新登录', 403:'无权访问这段对话', 404:'这段对话不存在或无权访问',
    408:'回答等待超时，请核对历史记录后重试',504:'本次回答超时，请核对历史记录后重试',
    413:'请求内容过大，请精简后重试', 429:'当前额度或请求频率受限，请检查额度后稍后重试'})[safeStatus]
    || (safeStatus >= 500 ? '回答服务暂时不可用，请稍后重试' : '请求未能完成，请检查输入后重试')
  return createStreamError(safeStatus, {message})
}

export function createStreamError(status, data) {
  const error = new Error(data?.message || data?.error || '流式请求失败')
  error.response = { status, data }
  return error
}

// Keep the session lease alive through body consumption, not just headers.
export async function readChatStream(response, handlers = {}, { signal, assertActive = () => {}, idleTimeoutMs = 90000, firstAnswerTimeoutMs = 90000, expectedConversationId } = {}) {
  const check = () => { assertActive(); signal?.throwIfAborted() }
  check()
  if (!response.ok || !response.body) {
    // Do not consume an unbounded HTML/error body or expose internal messages.
    void response.body?.cancel().catch(() => {})
    throw serverFailure(response.status)
  }
  const contentType = response.headers?.get('content-type')
  if (contentType && !/^text\/event-stream(?:;|$)/i.test(contentType)) {
    void response.body.cancel().catch(() => {})
    throw malformed()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let receivedBytes = 0, answerChars = 0
  let completedResponse
  let completed = false
  let progressAt = performance.now()
  const cancelReader = () => { void reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', cancelReader, { once: true })
  const readChunk = async () => {
    let timeout
    try {
      return await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(createStreamError(408, {
            message: '回答长时间没有新内容，请查看历史记录后重试',
          })), Math.max(0, (answerChars ? idleTimeoutMs : firstAnswerTimeoutMs) - (performance.now() - progressAt)))
        }),
      ])
    } finally { clearTimeout(timeout) }
  }

  const dispatchBlock = block => {
    check()
    if (block.length > MAX_EVENT_CHARS) throw oversized()
    const lines = block.split(/\r?\n/)
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message'
    if (!['delta', 'done', 'error'].includes(event)) return
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data) throw malformed()
    let payload
    try { payload = JSON.parse(data) }
    catch { throw malformed() }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw malformed()
    }
    if (event === 'delta') {
      if (typeof payload.content !== 'string') throw malformed()
      answerChars += payload.content.length
      if (payload.content.length) progressAt = performance.now()
      if (answerChars > MAX_ANSWER_CHARS) throw oversized()
      handlers.onDelta?.(payload.content)
    }
    if (event === 'done') {
      if (!isChatCompletion(payload, expectedConversationId)) throw malformed()
      completedResponse = payload
      completed = true
      handlers.onDone?.(payload)
    }
    if (event === 'error') throw serverFailure(payload.status)
  }

  try {
    check()
    while (!completed) {
      const { value, done } = await readChunk()
      check()
      receivedBytes += value?.byteLength || 0
      if (receivedBytes > MAX_STREAM_BYTES) throw oversized()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      let boundary = buffer.search(/\r?\n\r?\n/)
      while (boundary >= 0 && !completed) {
        const block = buffer.slice(0, boundary)
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] || '\n\n'
        buffer = buffer.slice(boundary + separator.length)
        dispatchBlock(block)
        boundary = buffer.search(/\r?\n\r?\n/)
      }
      if (!completed && buffer.length > MAX_EVENT_CHARS) throw oversized()
      if (done) {
        if (!completed && buffer.trim()) dispatchBlock(buffer)
        break
      }
    }
    check()
    if (!completed) throw createStreamError(502, { message: '流式回答意外中断，请重试' })
    return completedResponse
  } finally {
    signal?.removeEventListener('abort', cancelReader)
    cancelReader()
    reader.releaseLock()
  }
}
