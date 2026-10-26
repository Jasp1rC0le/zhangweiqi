// Per-instrument, page-memory state only. No experimental data enters browser storage.
export function newInstrumentDraft() {
  return { model: '', symptom: '', tried: '', accepted: null, attempt: null }
}
export function instrumentSnapshot(draft) {
  return { model: draft.model, symptom: draft.symptom, tried: draft.tried }
}
const fingerprint = draft => JSON.stringify(instrumentSnapshot(draft))
export const instrumentAlreadyAccepted = draft => draft.accepted === fingerprint(draft)
export const instrumentDraftPending = draft => Boolean(draft.model || draft.symptom || draft.tried) && !instrumentAlreadyAccepted(draft)
export function instrumentRequest(draft, createId = () => crypto.randomUUID()) {
  const value = fingerprint(draft)
  if (!draft.attempt || draft.attempt.fingerprint !== value) draft.attempt = { id: createId(), fingerprint: value }
  return { requestId: draft.attempt.id, snapshot: instrumentSnapshot(draft) }
}
export function acceptInstrumentRequest(draft, submitted) {
  if (!draft.attempt || draft.attempt.id !== submitted.requestId || draft.attempt.fingerprint !== fingerprint(submitted.snapshot)) return false
  draft.accepted = fingerprint(submitted.snapshot)
  return true
}
