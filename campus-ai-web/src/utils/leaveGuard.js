// Reuse one decision when several navigation requests arrive while a dialog is open.
// A pending save always wins over an earlier decision to leave.
export function createLeaveGuard(isDirty, isBusy, confirmDiscard) {
  let pending = null
  return async function mayLeave() {
    if (isBusy()) return false
    if (pending) return pending
    if (!isDirty()) return true
    pending = Promise.resolve().then(confirmDiscard)
      .then(confirmed => confirmed === true && !isBusy(), () => false)
      .finally(() => { pending = null })
    return pending
  }
}
