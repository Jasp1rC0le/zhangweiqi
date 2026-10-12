// A confirmation must not authorize an action in a later account/session or draft.
export function createScopedConfirmation({ scope, ask, pending = () => {}, active = () => true }) {
  let waiting = false
  return async function confirm(message, options) {
    const captured = scope()
    if (waiting || !captured || !active()) return false
    waiting = true
    pending(true)
    try {
      return (await ask(message, options)) === true && active() && captured === scope()
    } catch {
      // Cancel, Escape, close and a failed dialog all leave existing data untouched.
      return false
    } finally {
      waiting = false
      pending(false)
    }
  }
}
