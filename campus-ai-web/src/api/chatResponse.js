export const MAX_ANSWER_CHARS = 200000

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const id = value => Number.isSafeInteger(value) && value > 0
const text = (value, max) => typeof value === 'string' && value.length <= max
const optionalText = (value, max) => value == null || text(value, max)

// Check the server DTO before it replaces the user's question / partial answer.
// A JSON object alone is not proof of a completed or correctly routed answer.
export function isChatCompletion(payload, expectedConversationId) {
  if (!record(payload)) return false
  const user = payload.userMessage, assistant = payload.assistantMessage
  const message = (value, role, max) => record(value) && id(value.id) && id(value.conversationId)
    && value.role === role && text(value.content, max)
    && text(value.createdAt, 64) && Number.isFinite(Date.parse(value.createdAt))
    && (value.tokenCount == null || (Number.isSafeInteger(value.tokenCount) && value.tokenCount >= 0))
  if (!message(user, 'user', 50000) || !message(assistant, 'assistant', MAX_ANSWER_CHARS)) return false
  if (!user.content.trim() || !assistant.content.trim() || user.id === assistant.id
    || user.conversationId !== assistant.conversationId) return false
  if (expectedConversationId !== undefined && String(user.conversationId) !== String(expectedConversationId)) return false
  const sources = (items, web) => Array.isArray(items) && items.length <= 100 && items.every(item =>
    record(item) && text(item.title, 1024)
    && optionalText(web ? item.url : item.sourceUrl, 4096)
    && (web || (optionalText(item.sourceDepartment, 512) && optionalText(item.publishedAt, 64))))
  return sources(payload.sources, false) && sources(payload.webSources, true)
}
