import { createAdminEditorScope } from './adminEditorScope.js'

// Identity-only scope: editing an unrelated draft must not cancel this action.
export function createScopedAdminActions(owner, available = () => true) {
  const scope = createAdminEditorScope(owner, () => null)
  let active = null
  return {
    key: scope.key,
    invalidate() {
      active = null
      scope.invalidate()
    },
    dispose() {
      active = null
      scope.dispose()
    },
    async run({
      confirm = async () => true,
      targetCurrent = () => true,
      outdated = () => {},
      execute,
      committed,
      refresh = async () => {},
      failed,
      refreshFailed,
      pending,
    }) {
      if (active || !available()) return false
      const ticket = scope.capture({ abortable: true })
      const operation = Symbol('admin action')
      const current = () => active === operation && ticket.current() && !ticket.signal.aborted
      let started = false
      active = operation
      try {
        if (!current() || !(await confirm()) || !current()) return false
        if (!targetCurrent()) {
          outdated()
          return false
        }
        started = true
        pending(true)
        const result = await execute(ticket.signal)
        if (!current()) return false
        // Once the server acknowledges the write, UI/read failure is not a
        // failed write and must not encourage submitting it a second time.
        try {
          committed(result)
          if (current()) await refresh(current)
        } catch (error) {
          if (current()) refreshFailed(error)
        }
        return true
      } catch (error) {
        if (current()) failed(error)
        return false
      } finally {
        if (started && current()) pending(false)
        if (active === operation) active = null
        ticket.release()
      }
    },
  }
}
