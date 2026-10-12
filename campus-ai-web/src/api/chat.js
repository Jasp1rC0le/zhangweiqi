import http, { requestWithUserSession } from '@/api/http'
import { readChatStream } from './chatStream.js'

export async function getDailyAiQuota() {
  const response = await http.get('/api/ai/quota')
  return response.data
}

export async function getConversations(options = {}) {
  const response = await http.get('/api/conversations', options)
  return response.data
}

export async function createConversation(title = '新对话', options = {}) {
  const response = await http.post('/api/conversations', { title }, options)
  return response.data
}

export async function getMessages(conversationId, options = {}) {
  const response = await http.get(`/api/conversations/${conversationId}/messages`, options)
  return response.data
}

export async function sendMessage(conversationId, content, model = 'standard') {
  const response = await http.post(
    `/api/conversations/${conversationId}/messages`,
    { content, model },
    { timeout: 120000 },
  )
  return response.data
}

export async function sendMessageStream(
  conversationId,
  content,
  model = 'standard',
  handlers = {},
  options = {},
) {
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const request = (token, signal) => fetch(
    `${apiBase}/api/conversations/${conversationId}/messages/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, model }),
      credentials: 'include',
      signal,
    },
  )
  return requestWithUserSession(request, (response, lease) => readChatStream(response, handlers, {
    ...lease, expectedConversationId: conversationId,
  }), {
    signal: options.signal,
    timeoutMs: 190000,
  })
}

export async function updateMessageFeedback(
  conversationId,
  messageId,
  helpful,
  reason = null,
) {
  const response = await http.put(
    `/api/conversations/${conversationId}/messages/${messageId}/feedback`,
    { helpful, reason },
  )
  return response.data
}

export async function deleteConversation(conversationId) {
  await http.delete(`/api/conversations/${conversationId}`)
}
