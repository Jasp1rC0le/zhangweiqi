// Retrieval rank is not citation ownership. Promote a single document only when
// the finished answer explicitly cites it; keep multi-source answers as prose.
export function singleCitedKnowledgeSource(message) {
  if (message?.role !== 'assistant' || message.streaming || message.interrupted
    || !Array.isArray(message.sources) || !message.sources.length) return null
  const text = String(message.content || '')
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
  const references = [...text.matchAll(/\[资料\s*(\d+)\s*\]/g)]
  if (!references.length) return null
  const cited = new Map()
  for (const reference of references) {
    const index = Number(reference[1]) - 1
    const source = message.sources[index]
    if (!Number.isSafeInteger(index) || index < 0 || !source || !source.title) return null
    // Never merge unrelated records merely because their title or URL matches.
    const key = source.documentId == null ? `index:${index}` : `document:${source.documentId}`
    cited.set(key, cited.get(key) || source)
  }
  return cited.size === 1 ? { source: [...cited.values()][0], sourceCount: 1 } : null
}
