// This is page memory only. Reading fresh server state must not overwrite typing.
export function reconcileCanteenDraft(current, saved, next) {
  return current === undefined || (saved !== undefined && current === saved) ? next : current
}

export function pendingCanteenDraftIds(scores, comments, savedScores, savedComments) {
  return [...new Set([...Object.keys(scores), ...Object.keys(comments)])].filter(id =>
    (scores[id] ?? 0) !== (savedScores[id] ?? 0)
    || (comments[id] ?? '') !== (savedComments[id] ?? ''),
  )
}
