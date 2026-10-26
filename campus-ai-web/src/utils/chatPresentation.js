export const chatInputLimit = (mode) => (mode === 'kimi' ? 50000 : 10000)

// Leave room for the conversation and controls when a software keyboard shrinks the viewport.
export function composerHeight(contentHeight, viewportHeight) {
  const viewport = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 844
  const limit = Math.max(44, Math.min(138, Math.floor(viewport / 4)))
  return { height: Math.max(44, Math.min(contentHeight, limit)), overflowY: contentHeight > limit ? 'auto' : 'hidden' }
}

// Keep extracted text in the existing user-message contract; never upload the raw file.
export function appendChatAttachment(draft, name, text, limit) {
  const cleanName = String(name)
    // oxlint-disable-next-line no-control-regex -- Sanitize attachment labels without altering the file text.
    .replace(/[\r\n\u0000-\u001f]/g, ' ')
    .slice(0, 180)
  if (!text?.trim()) throw new Error('文件中没有可发送的文字')
  const result = `${draft.trimEnd()}${draft.trim() ? '\n\n' : ''}【附件：${cleanName}】\n${text.trim()}`
  if (result.length > limit)
    throw new Error(`合并后超过 ${limit.toLocaleString()} 字符，请删减附件文字或原草稿`)
  return result
}

export function scrollBehavior(preferred, reducedMotion) {
  return reducedMotion ? 'instant' : preferred
}

export function shouldSendOnEnter(event, composing, mobile) {
  return !mobile && !composing && !event.isComposing && event.keyCode !== 229
}

// Growing streamed content may move the bottom before a scheduled scroll runs.
// Only an upward movement, not that temporary distance, pauses an active follow.
export function followAfterScroll(following, previousTop, top, height, viewport) {
  const nearBottom = height - top - viewport < 96
  if (top < previousTop - 2 || !following) return nearBottom
  return true
}
