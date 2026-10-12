// Keep unsent text isolated from both other tools and saved conversations.
export function createWorkspaceDrafts() {
  const drafts = new Map()
  const key = (model, conversationId) => `${model}:${conversationId ?? 'new'}`
  return {
    save(model, conversationId, text) {
      if (!text.trim()) drafts.delete(key(model, conversationId))
      else drafts.set(key(model, conversationId), {model, conversationId:conversationId ?? null, text})
    },
    read(model, conversationId = null) { return drafts.get(key(model, conversationId))?.text || '' },
    entries: () => [...drafts.values()].map(entry => ({...entry})),
    clear(model, conversationId = null) { drafts.delete(key(model, conversationId)) },
    forgetConversation(conversationId) {
      for (const draftKey of drafts.keys()) {
        if (draftKey.endsWith(`:${conversationId}`)) drafts.delete(draftKey)
      }
    },
  }
}
