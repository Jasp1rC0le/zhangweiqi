import { createBatchImportScope } from './batchImportScope.js'

// Page-owned account operations. No identity, password, or token is persisted.
// Abort is best effort; callers also check current() before effects or dispatch.
export function createAccountLifecycle(owner) {
  const scope = createBatchImportScope(owner)
  let controller = new AbortController()
  return {
    key: scope.key,
    capture: () => ({ current: scope.capture(), signal: controller.signal }),
    reset() {
      scope.invalidate()
      controller.abort()
      controller = new AbortController()
    },
    dispose() {
      scope.dispose()
      controller.abort()
    },
  }
}
