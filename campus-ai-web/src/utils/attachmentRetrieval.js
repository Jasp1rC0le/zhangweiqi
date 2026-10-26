// Device-local lexical retrieval. Source spans stay identifiable; no model or network.
export function attachmentChunks(text, size = 1400) {
  if (typeof text !== 'string' || text.length > 500000)
    throw new Error('附件文字限50万字符，不会截断原文。')
  const chunks = []
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + size)
    if (end < text.length) {
      const stop = text.lastIndexOf('\n', end)
      if (stop > start + size / 2) end = stop + 1
    }
    const value = text.slice(start, end)
    chunks.push({ index: chunks.length + 1, start, end, text: value })
    start = end
  }
  return chunks
}
function terms(value) {
  const clean = String(value || '')
    .normalize('NFKC')
    .toLowerCase()
  const result = new Set(clean.match(/[a-z0-9]{2,}/g) || [])
  for (const group of clean.match(/[\p{Script=Han}]+/gu) || []) {
    if (group.length === 1) result.add(group)
    for (let i = 0; i < group.length - 1; i++) result.add(group.slice(i, i + 2))
  }
  return [...result].slice(0, 100)
}
export function selectAttachmentExcerpts(text, question, limit = 9000) {
  if (!String(question || '').trim() || String(question).length > 1000)
    throw new Error('先写一个1000字以内的具体问题，再选相关段落。')
  if (!Number.isInteger(limit) || limit < 500 || limit > 50000) throw new Error('选段长度无效。')
  const query = terms(question),
    chunks = attachmentChunks(text),
    frequencies = new Map(
      query.map((term) => [term, chunks.filter((c) => c.text.toLowerCase().includes(term)).length]),
    )
  const scored = chunks
    .map((chunk) => ({
      ...chunk,
      score: query.reduce((score, term) => {
        const count = chunk.text.normalize('NFKC').toLowerCase().split(term).length - 1
        return (
          score +
          (count
            ? (1 + Math.log(count)) * Math.log(1 + chunks.length / (1 + frequencies.get(term)))
            : 0)
        )
      }, 0),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  if (!scored.length)
    throw new Error('没有找到匹配文字。请换关键词或直接核读原文，不会凭空补内容。')
  const selected = []
  let used = 100
  for (const chunk of scored) {
    if (used + chunk.text.length + 80 > limit) continue
    selected.push(chunk)
    used += chunk.text.length + 80
    if (selected.length >= 8) break
  }
  if (!selected.length)
    throw new Error('当前问答字数不足以容纳完整段落，请清理输入框或缩小段落范围。')
  selected.sort((a, b) => a.index - b.index)
  return {
    chunks: selected,
    total: chunks.length,
    text:
      '以下是按问题选出的原文片段，不是全文，也不保证包含所有相关内容。\n' +
      selected
        .map((c) => `【片段${c.index} · 字符${c.start + 1}—${c.end}】\n${c.text}`)
        .join('\n\n'),
  }
}
