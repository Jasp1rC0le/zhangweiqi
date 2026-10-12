import { createBatchImportScope } from './batchImportScope.js'

// All state stays in memory. Identity tickets survive a successful form reset;
// draft tickets do not authorize replacing a subsequently edited draft.
export function createAdminEditorScope(owner, draft) {
  const identity = createBatchImportScope(owner)
  const fingerprint = () => JSON.stringify(draft())
  const requests = new Set()
  const abortRequests = () => {
    const pending = Array.from(requests)
    requests.clear()
    for (const controller of pending) controller.abort()
  }
  let draftGeneration = 0
  return {
    invalidate() {
      identity.invalidate()
      abortRequests()
    },
    dispose() {
      identity.dispose()
      abortRequests()
    },
    invalidateDraft: () => {
      draftGeneration++
    },
    key: () => (identity.key() ? `${identity.key()}:${draftGeneration}` : null),
    capture({ abortable = false } = {}) {
      const current = identity.capture(),
        original = fingerprint(),
        generation = draftGeneration
      const controller = abortable ? new AbortController() : null
      if (controller) {
        if (current()) requests.add(controller)
        else controller.abort()
      }
      return {
        current,
        signal: controller?.signal,
        release: () => {
          if (controller) requests.delete(controller)
        },
        unchanged: () => current() && generation === draftGeneration && original === fingerprint(),
      }
    },
  }
}

export function snapshotKnowledgePublication(form, revisionOf, schoolId) {
  return Object.freeze({
    editingId: revisionOf,
    payload: Object.freeze({
      schoolId,
      title: form.title.trim(),
      category: form.category.trim(),
      sourceDepartment: form.sourceDepartment.trim() || null,
      sourceUrl: form.sourceUrl.trim() || null,
      publishedAt: form.publishedAt || null,
      effectiveAt: form.effectiveAt || null,
      expiresAt: form.expiresAt || null,
      content: form.content.trim(),
    }),
  })
}

export async function publishScopedKnowledge({
  ticket,
  confirm,
  publish,
  committed,
  refresh,
  failed,
  refreshFailed,
  pending,
}) {
  if (!ticket.unchanged()) {
    ticket.release?.()
    return false
  }
  let started = false
  try {
    if (!(await confirm()) || !ticket.unchanged()) return false
    started = true
    pending(true)
    const response = await publish()
    if (!ticket.unchanged()) return false
    committed(response)
    // A committed write is not a failed publication if reading the list fails.
    if (ticket.current()) {
      try {
        await refresh(ticket.current)
      } catch (error) {
        if (ticket.current()) refreshFailed(error)
      }
    }
    return true
  } catch (error) {
    if (ticket.unchanged()) failed(error)
    return false
  } finally {
    if (started && ticket.current()) pending(false)
    ticket.release?.()
  }
}
