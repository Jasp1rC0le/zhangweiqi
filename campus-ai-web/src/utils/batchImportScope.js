// In-memory tickets: no late result or confirmation can act in a later identity.
export function createBatchImportScope(owner) {
  let generation = 0, disposed = false
  return {
    key: () => !disposed && owner() ? `${owner()}:${generation}` : null,
    capture() {
      const principal = owner(), started = generation
      return () => !disposed && Boolean(principal) && principal === owner() && started === generation
    },
    invalidate() { generation++ },
    dispose() { disposed = true; generation++ },
  }
}
