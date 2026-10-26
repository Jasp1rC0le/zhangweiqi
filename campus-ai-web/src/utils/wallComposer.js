export function wallPostTitle(body) {
  const first = String(body || '').trim().split(/\r?\n/).find(line => line.trim()) || ''
  const characters = Array.from(first.trim())
  return characters.slice(0, 42).join('') + (characters.length > 42 ? '…' : '')
}
export function wallComposerText(form) {
  const title = form.title?.trim() || '', body = form.body || ''
  return title && title !== wallPostTitle(body) ? `${title}\n${body}` : body
}
export function wallPostPayload(form) {
  // A restored, unedited legacy request must retain its original idempotency payload.
  if (form.title?.trim() && form.body?.trim()) return { ...form, title: form.title.trim() }
  const body = wallComposerText(form).trim()
  return { id: form.id, category: form.category, title: wallPostTitle(body), body }
}
export function wallHasSeparateTitle(entry) { return entry.title !== wallPostTitle(entry.body) }
