// An in-memory replacement must not discard a newer draft or a later identity.
// This does not save forms, authorize a server write, or undo an acknowledged write.
export function createCatalogDraftTransition(scope, isBusy, confirm) {
  let waiting = false,
    disposed = false
  async function replace({ dirty, apply, current = () => true, message }) {
    const key = scope()
    if (disposed || waiting || !key || isBusy()) return false
    waiting = true
    try {
      if (dirty()) {
        let accepted = false
        try {
          accepted = await confirm(message, {
            title: '保留未保存的填写？',
            confirmText: '放弃这份填写',
            cancelText: '继续编辑',
          })
        } catch {
          return false
        }
        if (accepted !== true) return false
      }
      if (disposed || key !== scope() || isBusy() || !current()) return false
      apply()
      return true
    } finally {
      waiting = false
    }
  }
  return {
    replace,
    dispose: () => {
      disposed = true
    },
  }
}
